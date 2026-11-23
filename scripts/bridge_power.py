"""Cheap local power and CPU samples. No background sampler or external dependencies."""
import ctypes
import os
from pathlib import Path
import time


def power_source():
    if os.name == "nt":
        class Status(ctypes.Structure):
            _fields_ = [(n, ctypes.c_ubyte) for n in ("online", "battery", "percent", "saver")] + [
                ("life", ctypes.c_uint32), ("full", ctypes.c_uint32)]
        s = Status()
        if not ctypes.windll.kernel32.GetSystemPowerStatus(ctypes.byref(s)):
            return "unknown"
        if s.saver == 1:
            return "saver"
        if s.online == 0:
            return "battery"
        if s.online == 1 or s.battery == 128:
            return "mains"
        return "unknown"
    root = Path("/sys/class/power_supply")
    if not root.is_dir():
        return "unknown"
    entries = [(p, (p / "type").read_text().strip()) for p in root.iterdir() if (p / "type").is_file()]
    batteries = [p for p, kind in entries if kind == "Battery"]
    if any((p / "status").is_file() and (p / "status").read_text().strip() == "Discharging" for p in batteries):
        return "battery"
    if batteries and not any((p / "online").is_file() and (p / "online").read_text().strip() == "1"
                             for p, kind in entries if kind != "Battery"):
        return "unknown"
    return "mains"


def cpu_times():
    if os.name == "nt":
        idle, kernel, user = [ctypes.c_ulonglong() for _ in range(3)]
        if ctypes.windll.kernel32.GetSystemTimes(ctypes.byref(idle), ctypes.byref(kernel), ctypes.byref(user)):
            return kernel.value + user.value, idle.value
        return None
    with open("/proc/stat", encoding="ascii") as f:
        values = list(map(int, f.readline().split()[1:9]))
    return sum(values), values[3] + values[4]


class Budget:
    def __init__(self, limit=2):
        self.limit = limit
        self.checked = float("-inf")
        self.previous = None
        self.value = ("unknown", 1)

    def __call__(self):
        now = time.monotonic()
        if now - self.checked < 8:
            return self.value
        self.checked = now
        try:
            power, current = power_source(), cpu_times()
            reason = power
            if power == "mains":
                if not current or not self.previous or current[0] <= self.previous[0]:
                    reason = "sampling"
                elif (current[1] - self.previous[1]) / (current[0] - self.previous[0]) < .25:
                    reason = "cpu"
            self.previous = current
            self.value = (reason, self.limit if reason == "mains" else 1)
        except (OSError, ValueError, IndexError, AttributeError):
            self.value = ("unknown", 1)
        return self.value

