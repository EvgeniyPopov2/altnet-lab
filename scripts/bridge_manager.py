"""Own one local Tor connection. Fetching catalogs and testing candidates are independent."""
import json
import random
import threading
import time
from dataclasses import dataclass

from bridge_sources import atomic_json, catalog
from bridge_tor import Health, Instance
from bridge_route import check
from bridge_power import Budget


def manual_lines(value):
    if not isinstance(value, str) or len(value) > 16384:
        raise ValueError("Вставьте от одной до шестнадцати строк obfs4")
    lines = [catalog.canonical_bridge(line.strip().removeprefix("Bridge ")) for line in value.splitlines() if line.strip()]
    if not 1 <= len(lines) <= 16:
        raise ValueError("Вставьте от одной до шестнадцати строк obfs4")
    return list(dict.fromkeys(lines))


@dataclass
class Trial:
    instance: object
    start: float
    advanced: float
    progress: int = 0


class Manager:
    def __init__(self, state, sources, tor, transport, factory=Instance, clock=time.monotonic, snowflake=None, budget=None):
        self.state, self.sources = state, sources
        self.tor, self.transport, self.factory, self.clock = tor, transport, factory, clock
        self.snowflake = snowflake
        self.prefs = state / "connection.json"
        self.saved = json.loads(self.prefs.read_text()) if self.prefs.exists() else {}
        self.paused = self.saved.get("paused", False)
        self.active = None
        self.trials = []
        self.extra_started = False
        self.budget = budget or Budget()
        self.power, self.limit = "unknown", 1
        self.health = Health()
        self.avoid = set()
        self.switch_tried = set()
        self.misses = self.failures = 0
        self.active_port = 0
        self.queued = None
        self.phase = "paused" if self.paused else "starting"
        self.note, self.confirmed = "", None
        self.progress = self.next_try = 0
        self.lock = threading.RLock()
        self.stop = threading.Event()
        self.wake = threading.Event()
        self.fetch = threading.Event()
        self.epoch = 0
        self.last_fetch = float("-inf")
        self.retired = []
        self.route_event = threading.Event()
        self.route_state = "unchecked"
        self.route_misses = 0

    @property
    def candidate(self):
        return self.trials[0].instance if self.trials else None

    def close_trials(self, keep=None):
        for trial in self.trials:
            if trial.instance is not keep:
                trial.instance.close()
        self.trials.clear()

    def public_status(self):
        with self.lock:
            return dict(phase=self.phase, progress=self.progress, connected=bool(self.active_port),
                        source=self.sources.status, publicCount=len((self.sources.current or {}).get("bridges", [])),
                        manualCount=len(self.saved.get("manual", [])), lastVerified=self.confirmed,
                        transport=self.active.lines[0].split()[0] if self.active else None,
                        internet=self.route_state,
                        probes=len(self.trials), probeLimit=self.limit, power=self.power,
                        busy=bool(self.queued or self.candidate),
                        userAction=bool(self.queued or (self.candidate and self.kind not in ("auto", "refresh"))),
                        note=self.note,
                        retryIn=max(0, int(self.next_try - self.clock())) if self.phase == "waiting" else 0)

    def request(self, action, value=None):
        with self.lock:
            if action in ("pause", "resume"):
                paused = action == "pause"
                if paused != self.paused:
                    self.paused = paused
                    self.epoch += 1
                    self.saved["paused"] = paused
                    atomic_json(self.prefs, self.saved)
                    self.reset()
                    self.phase = "paused" if paused else "starting"
                    self.wake.set()
                    if not paused:
                        self.fetch.set()
                return
            if self.paused:
                raise ValueError("Клиент приостановлен")
            if action == "refresh":
                self.fetch.set()
                if self.active_port or self.candidate:
                    return
            if action not in ("refresh", "switch", "manual"):
                raise ValueError("Неизвестное действие")
            lines = manual_lines(value) if action == "manual" else None
            if self.candidate and self.kind in ("auto", "refresh") and action in ("switch", "manual"):
                self.close_trials()
            if self.candidate or self.queued:
                raise ValueError("Проверка уже выполняется")
            if action == "switch":
                self.switch_tried.clear()
            self.queued = (action, lines)
            self.next_try = 0
            self.wake.set()

    def reset(self):
        self.active_port = 0
        self.route_state, self.route_misses = "unchecked", 0
        self.close_trials()
        for inst in [self.active] + [item[1] for item in self.retired]:
            if inst:
                inst.close()
        self.retired.clear()
        self.active = self.queued = None
        self.avoid.clear()
        self.switch_tried.clear()
        self.health = Health()
        self.misses = self.failures = self.next_try = self.progress = 0
        self.note = ""

    def fetch_loop(self):
        delay = 0
        while not self.stop.is_set():
            self.fetch.wait(delay)
            self.fetch.clear()
            if self.stop.is_set():
                return
            with self.lock:
                if self.paused:
                    delay = 60
                    continue
                generation = self.epoch
                old = (self.sources.current or {}).get("sha256")
                self.last_fetch = self.clock()
                exhausted = not self.active_port and self.failures > 0
            ok = self.sources.refresh(lambda: self.stop.is_set() or self.paused or self.epoch != generation,
                                      seek_newer=exhausted)
            with self.lock:
                if not self.paused and ok and old != self.sources.current["sha256"]:
                    self.next_try = 0
                    if self.candidate and self.kind == "auto" and not self.active:
                        self.close_trials()
                    known = {x.split()[2].upper() for x in self.pool() + self.sources.current.get("snowflake", [])}
                    if self.active and not known.intersection(self.health.hops) and not self.queued:
                        self.switch_tried.clear()
                        self.queued = ("switch", None)
                    self.wake.set()
            delay = 86400 if ok else 180 + random.uniform(0, 30)

    def pool(self):
        public = (self.sources.current or {}).get("bridges", [])
        return list(dict.fromkeys(self.saved.get("manual", []) + public))

    def route_loop(self):
        delay = 0
        while not self.stop.is_set():
            self.route_event.wait(delay)
            self.route_event.clear()
            if self.stop.is_set():
                return
            with self.lock:
                active, port = self.active, self.active_port
            if not active or not port:
                delay = 300
                continue
            result = check(port)
            with self.lock:
                if self.active is active and self.active_port == port:
                    self.route_state = result
                    self.route_misses = self.route_misses + 1 if result == "unreachable" else 0
                    if self.route_misses >= 2 and not self.queued and not self.candidate:
                        self.switch_tried.clear()
                        self.queued = ("switch", None)
                        self.route_misses = 0
                        self.wake.set()
            delay = 45 if result == "unreachable" else 300

    def unsuccessful(self, message):
        self.note = message
        if self.active_port:
            self.phase, self.progress = ("checking", 0) if self.queued else ("ready", 100)
        else:
            self.phase = "waiting"
            self.failures += 1
            self.next_try = self.clock() + min(300, 5 * 2 ** min(self.failures - 1, 6)) + random.uniform(0, 3)
            if self.failures % 2 == 0:
                self.avoid.clear()
            if self.clock() - self.last_fetch > 120:
                self.fetch.set()

    def launch(self, lines, now):
        transport = self.snowflake if lines[0].startswith("snowflake ") else self.transport
        instance = self.factory(self.state, self.tor, transport, lines)
        self.trials.append(Trial(instance, now, now))

    def accept(self, trial, health, now):
        winner = trial.instance
        self.close_trials(keep=winner)
        if self.kind == "manual":
            self.saved["manual"] = list(dict.fromkeys(winner.lines + self.saved.get("manual", [])))[:64]
        self.saved["lastGood"] = sorted(health.hops)
        self.note = "Подключение через мост подтверждено"
        try:
            atomic_json(self.prefs, self.saved)
        except OSError:
            self.note = "Маршрут работает. Не удалось сохранить настройку на диск."
        if self.active:
            self.retired.append((now + 30, self.active))
        self.active = winner
        self.health, self.active_port = health, health.socks
        self.progress = 100
        self.route_state, self.route_misses = "checking", 0
        self.route_event.set()
        self.fetch.set()
        self.confirmed = int(time.time())
        self.phase = "ready"
        self.failures = self.misses = self.next_try = 0
        self.avoid.clear()

    def parallel_reserve(self):
        primary = self.trials[0].instance.lines
        avoid = self.avoid | {line.split()[2].upper() for line in primary}
        other = [line for line in self.pool() if line.split()[2].upper() not in avoid]
        if primary[0].startswith("obfs4 ") and self.snowflake:
            snow = [x for x in (self.sources.current or {}).get("snowflake", []) if x.split()[2].upper() not in avoid]
            if snow:
                return snow
        return other[:3]

    def poll_trials(self, now):
        if self.limit == 1 and len(self.trials) == 2:
            slower = min(reversed(self.trials), key=lambda t: t.progress)
            self.trials.remove(slower)
            slower.instance.close()
        for trial in list(self.trials):
            h = trial.instance.health()
            if h.ready and h.socks:
                self.accept(trial, h, now)
                return
            if h.progress > trial.progress:
                trial.advanced = now
            trial.progress = h.progress
            failed = (trial.instance.process.poll() is not None or now - trial.start >= 180 or now - trial.advanced >= 85
                      or (h.repeated_failure and h.progress <= 10 and now - trial.start >= 25
                          and trial.instance.lines[0].startswith("obfs4 ")))
            if failed:
                if self.kind == "switch" and self.active_port:
                    self.switch_tried.update(x.split()[2].upper() for x in trial.instance.lines)
                    self.queued = ("switch", None)
                self.trials.remove(trial)
                trial.instance.close()
        if not self.trials:
            self.unsuccessful("Проба завершилась без рабочей цепочки Tor")
            return
        self.progress = max(x.progress for x in self.trials)
        primary = self.trials[0]
        if (self.limit == 2 and not self.active and not self.extra_started and not self.retired
                and self.kind in ("auto", "refresh", "switch") and primary.progress < 80
                and now - primary.advanced >= 12):
            self.extra_started = True
            lines = self.parallel_reserve()
            if lines:
                try:
                    self.launch(lines, now)
                except OSError:
                    pass  # The primary trial continues with its existing deadline.

    def step(self):
        with self.lock:
            if self.paused:
                return
            now = self.clock()
            self.power, self.limit = self.budget()
            for deadline, previous in self.retired[:]:
                if now >= deadline:
                    previous.close()
                    self.retired.remove((deadline, previous))
            if self.active:
                health = self.active.health()
                if health.ready and health.socks:
                    self.misses = 0
                    self.health = health
                    self.active_port = health.socks
                    self.confirmed = int(time.time())
                    latest = sorted(health.hops)
                    if latest != self.saved.get("lastGood"):
                        self.saved["lastGood"] = latest
                        try:
                            atomic_json(self.prefs, self.saved)
                        except OSError:
                            self.note = "Маршрут работает. Не удалось сохранить последнюю проверку на диск."
                else:
                    self.misses += 1
                    if self.misses >= 2 or self.active.process.poll() is not None:
                        self.avoid.update(self.health.hops)
                        self.active_port = 0
                        self.route_state = "unchecked"
                        self.active.close()
                        self.active = None
                        self.phase = "recovering"
                        self.next_try = 0
                        self.misses = 0
                        if now - self.last_fetch > 120:
                            self.fetch.set()
            if self.trials:
                self.poll_trials(now)
                return
            if not self.queued and (self.active or now < self.next_try):
                return
            self.kind, lines = self.queued or ("auto", None)
            self.queued = None
            self.note = ""
            if lines is None:
                excluded = (self.health.hops | self.switch_tried) if self.kind == "switch" and self.active else self.avoid
                lines = [line for line in self.pool() if line.split()[2] not in excluded]
                snow = [x for x in (self.sources.current or {}).get("snowflake", []) if x.split()[2].upper() not in excluded]
                if self.snowflake and snow and (not lines or (self.kind == "switch" and self.switch_tried)
                        or (not self.active and self.failures % 2 == 1)
                        or (not self.failures and any(x.split()[2].upper() in self.saved.get("lastGood", []) for x in snow))):
                    lines = snow
                # On cold start try the last confirmed group once before expanding to every candidate.
                if not self.active and not self.avoid and not self.failures and self.saved.get("lastGood"):
                    preferred = [line for line in lines if line.split()[2].upper() in self.saved["lastGood"]]
                    if preferred:
                        private = [line for line in preferred if line in self.saved.get("manual", [])]
                        lines = private or preferred + [line for line in lines if line not in preferred]
                # Leave independent reserves. Rotate through the full pool after unsuccessful attempts.
                if len(lines) > 3 and (self.active or self.failures < 4):
                    round_number = self.failures // 2 if snow and self.snowflake else self.failures
                    offset = round_number * 3 % len(lines)
                    lines = (lines[offset:] + lines[:offset])[:3]
            if not lines:
                self.unsuccessful("Резервных мостов пока нет. Можно вставить мост вручную.")
                return
            self.phase = "checking" if self.active else "recovering"
            self.progress = 0
            try:
                for _, old in self.retired:
                    old.close()
                self.retired.clear()
                self.extra_started = False
                self.launch(lines, now)
            except OSError:
                self.unsuccessful("Не удалось запустить Tor или транспорт obfs4")

    def run(self):
        fetcher = threading.Thread(target=self.fetch_loop, daemon=True)
        fetcher.start()
        threading.Thread(target=self.route_loop, daemon=True).start()
        try:
            while not self.stop.is_set():
                self.wake.clear()
                self.step()
                interval = 2 if self.candidate or self.misses else (16 if self.limit == 1 else 8)
                if self.paused:
                    interval = 60
                elif self.phase == "waiting":
                    interval = min(interval, max(.1, self.next_try - self.clock()))
                self.wake.wait(interval)
        finally:
            self.stop.set()
            self.fetch.set()
            self.route_event.set()
            with self.lock:
                self.reset()
            fetcher.join(10)
