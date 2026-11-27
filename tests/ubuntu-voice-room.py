"""One endpoint of the two-VM GUI acceptance test. Run under its own xvfb-run."""
import argparse
import array
import base64
from contextlib import ExitStack, contextmanager
import io
import json
import math
import os
from pathlib import Path
import runpy
import subprocess
import sys
import time
import wave

workspace = runpy.run_path(str(Path(__file__).with_name("ubuntu-workspace.py")))
wait = workspace["wait"]
RATE = 16000


def child(stack, args, **kwargs):
    proc = subprocess.Popen(args, **kwargs)
    def stop():
        if proc.poll() is None:
            proc.terminate()
            try:
                proc.wait(3)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.wait()
    stack.callback(stop)
    return proc


@contextmanager
def sound(root):
    # This private Pulse server has no hardware module and its socket lives in a 0700 directory.
    with ExitStack() as stack:
        pulse = root / "pa"
        pulse.mkdir(mode=0o700)
        sock = pulse / "socket"
        conf = pulse / "server.pa"
        conf.write_text(f"load-module module-native-protocol-unix socket={sock} auth-anonymous=1\n"
                        "load-module module-null-sink sink_name=mic rate=48000 channels=1\n"
                        "load-module module-null-sink sink_name=speakers rate=48000 channels=1\n"
                        "set-default-source mic.monitor\nset-default-sink speakers\n")
        os.environ.update(PULSE_RUNTIME_PATH=str(pulse), PULSE_SERVER="unix:" + str(sock),
                          PULSE_SOURCE="mic.monitor", PULSE_SINK="speakers")
        log = stack.enter_context((root/"pulse.log").open("wb"))
        child(stack, ["pulseaudio", "-n", "-F", str(conf), "--daemonize=no", "--use-pid-file=no",
                      "--exit-idle-time=-1", "--log-target=stderr"], stdout=log, stderr=log)
        wait(lambda: sock.exists() and subprocess.run(["pactl","info"],capture_output=True).returncode == 0, "private Pulse server")
        yield


def wave_data(name):
    hz, phrase = {"node1": (440, "Первый узел. Приём, как слышно?"),
                  "node2": (880, "Второй узел. Слышу вас хорошо."),
                  "node3": (1220, "Третий узел. Я слышу вас обоих.")}[name]
    voice = subprocess.check_output(["espeak-ng", "-v", "ru", "-s", "147", "--stdout", phrase])
    with wave.open(io.BytesIO(voice)) as f:
        rate = f.getframerate()
        speech = array.array("h", f.readframes(f.getnframes()))
    marker = array.array("h", (int(6400 * math.sin(2*math.pi*hz*i/rate)) for i in range(rate)))
    return rate, (marker + array.array("h", [0])*(rate//9) + speech).tobytes()


def tap(browser, selector, match=None):
    # Use a real X11 event in this isolated X server, including Gecko user activation.
    def locate():
        return browser.panel("""
            const el=[...win.document.querySelectorAll(args[0])].find(e=>e.getClientRects().length && !e.matches(":disabled") &&
             (!args[1] || e.innerText?.trim().startsWith(args[1]) || e.getAttribute('aria-label') === args[1]));
          if (!el) return null;
          el.scrollIntoView({block:'center'}); const r=el.getBoundingClientRect();
          return [Math.round(r.x+r.width/2),Math.round(r.y+r.height/2)];""", selector, match)
    x,y = wait(locate, selector + " " + str(match), 25)
    browser.script(workspace["WINDOW"]+"w.focus();b.focus();")
    browser.panel("""
      const [x,y,sel,label]=args;
      const hit=win.document.elementFromPoint(x,y)?.closest(sel);
      if(!hit || (label && !hit.innerText?.trim().startsWith(label) && hit.getAttribute('aria-label')!==label))
        throw Error('Button is covered at '+x+','+y+' by '+win.document.elementFromPoint(x,y)?.outerHTML.slice(0,180));
      return true;""",x,y,selector,match)
    rect = browser.script(workspace["WINDOW"]+"const r=b.getBoundingClientRect();return [w.mozInnerScreenX+r.x,w.mozInnerScreenY+r.y];")
    subprocess.run(["xdotool","mousemove",str(round(x+rect[0])),str(round(y+rect[1])),"click","1"],check=True)


def screen(browser, path):
    data = browser.script(workspace["WINDOW"] + """
      return (async()=>{const img=await b.browsingContext.currentWindowGlobal.drawSnapshot(null,1,'white');
      const canvas=w.document.createElementNS('http://www.w3.org/1999/xhtml','canvas');
      canvas.width=img.width;canvas.height=img.height;canvas.getContext('2d').drawImage(img,0,0);
      img.close();return canvas.toDataURL('image/png').split(',')[1]})();""")
    path.write_bytes(base64.b64decode(data,validate=True))


def probe(path, hz):
    data = array.array("h", path.read_bytes())
    size = RATE // 25
    cosine = [math.cos(2*math.pi*hz*i/RATE) for i in range(size)]
    sine = [math.sin(2*math.pi*hz*i/RATE) for i in range(size)]
    windows = []
    for i in range(0,len(data)-size,size):
        samples = data[i:i+size]
        windows.append(2*math.hypot(sum(x*y for x,y in zip(samples,cosine)),
                        sum(x*y for x,y in zip(samples,sine)))/size)
    # A marker persists for a full second. Speech can briefly contain either frequency.
    # Require at least 0.52s of stable amplitude within a 0.6s window.
    return round(max((sorted(windows[i:i+15])[2] for i in range(len(windows)-14)),default=0))


def open_voice_room(browser):
    def visible(selector):
        return browser.panel("return [...win.document.querySelectorAll(args[0])].some(e=>e.getClientRects().length);",selector)

    def dismiss_tips():
        button = 'button[title="Закрыть все"]'
        if visible(button):
            tap(browser,button)
            wait(lambda: not visible(button),"закрытие подсказок")

    wait(lambda: visible(".an-home-network button"), "главный экран")
    dismiss_tips()
    tap(browser, ".an-home-network button", "Приватный быстрый")
    wait(lambda: browser.panel("return win.localStorage.getItem('altnet.profile.v1') === 'fast';"),"выбор быстрого профиля")
    dismiss_tips()
    tap(browser, 'button[aria-label="Открыть сервер AltNet Dev"]')
    wait(lambda: visible(".altnet-channel-toggle") or visible('#altnet-server-channels button'),"каналы сервера")
    if visible(".altnet-channel-toggle"):
        tap(browser,".altnet-channel-toggle","Каналы сервера")
    tap(browser, '#altnet-server-channels button[title="Голосовой канал"]')
    wait(lambda: visible("[data-air-join]"),"вход в Эфир")


def serve(browser, root, name, stack):
    rate, samples = wave_data(name)
    def audible():
        return browser.panel("""
          const d=win.document.querySelector('dialog[data-air-phase]');
          return {phase:d?.dataset.airPhase, text:d?.innerText, people:[...(d?.querySelectorAll('[data-person]') || [])].map(p=>({
            id:p.dataset.person, name:p.querySelector('b')?.textContent, speaking:p.dataset.speaking==='true',muted:p.dataset.muted==='true'}))};""")
    open_voice_room(browser)
    if browser.panel("try {await win.altNetVoice.join();return true;}catch{return false;}"):
        raise RuntimeError("Unexpected join without trusted user action")
    print(json.dumps({"ready":name}), flush=True)
    player, recorder = None, None
    for line in sys.stdin:
        try:
            cmd = json.loads(line)
            op = cmd["op"]
            result = True
            if op == "join":
                tap(browser, "[data-air-join]")
            elif op == "retry":
                tap(browser, "dialog[data-air-phase] button","Войти снова")
            elif op == "disconnect_test_mic":
                modules = subprocess.check_output(["pactl","list","short","modules"],text=True).splitlines()
                module, = [row.split()[0] for row in modules if "module-null-sink" in row and "sink_name=mic " in row]
                subprocess.run(["pactl","unload-module",module],check=True)
            elif op == "restore_test_mic":
                subprocess.check_output(["pactl","load-module","module-null-sink","sink_name=mic","rate=48000","channels=1"])
            elif op in ("mute","unmute","leave"):
                tap(browser, "dialog[data-air-phase] button", {"mute":"Выключить микрофон","unmute":"Включить микрофон","leave":"Завершить звонок"}[op])
            elif op == "state":
                result = audible()
            elif op == "route":
                route = json.loads(Path("/etc/altnet-browser/voice.json").read_text())
                address = subprocess.check_output(["ip","-6","route","get",route["peer"]],text=True)
                sockets = subprocess.check_output(["ss","-6Htnp","state","established",
                    f"( sport = :{route['port']} or dport = :{route['port']} )"],text=True)
                matches = [row for row in sockets.splitlines() if "["+route["source"]+"]" in row
                           and "["+route["peer"]+"]" in row and '"python3"' in row]
                if len(matches)!=1 or (" dev "+route["interface"]+" ") not in address:
                    raise AssertionError("Expected established socket on the configured mesh route")
                result = {"interface":route["interface"],"source":route["source"],"peer":route["peer"],"port":route["port"]}
            elif op == "capture_count":
                result = len(subprocess.check_output(["pactl","list","short","source-outputs"],text=True).splitlines())
            elif op == "room_routes":
                room = json.loads(Path("/etc/altnet-browser/voice-room.json").read_text())
                result = []
                for edge in room["peers"]:
                    route = subprocess.check_output(["ip","-6","route","get",edge["peer"],"from",room["source"]],text=True)
                    sockets = subprocess.check_output(["ss","-6Htnp","state","established",
                        f"( sport = :{edge['port']} or dport = :{edge['port']} )"],text=True)
                    assert " dev "+room["interface"]+" " in route
                    assert sum("["+edge["peer"]+"]" in s and "["+room["source"]+"]" in s and '"python3"' in s for s in sockets.splitlines())==1
                    result.append({"peer":edge["peerName"],"interface":room["interface"],"port":edge["port"]})
            elif op in ("play","play_room"):
                filename = root / "stimulus.raw"
                stimulus = samples
                if op == "play_room":
                    # The continuous marker identifies this talker even during syllable pauses.
                    hz = {"node1":440, "node2":880, "node3":1220}[name]
                    speech = array.array("h", samples)[rate + rate//9:]
                    stimulus = array.array("h", (int(value*.55 + 3500*math.sin(2*math.pi*hz*i/rate))
                                               for i,value in enumerate(speech))).tobytes()
                filename.write_bytes(stimulus * 10)
                if player and player.poll() is None:
                    raise RuntimeError("Already playing")
                player = child(stack,["pacat","--playback","--raw","--device=mic","--format=s16le","--channels=1",
                                      "--rate="+str(rate),str(filename)],stderr=subprocess.DEVNULL)
            elif op == "stop":
                if player and player.poll() is None:
                    player.terminate()
                    player.wait(3)
            elif op == "record":
                if recorder and recorder.poll() is None:
                    raise RuntimeError("Already recording")
                out = stack.enter_context((root/"received.raw").open("wb"))
                recorder = child(stack,["parec","--raw","--device=speakers.monitor","--format=s16le",
                                        "--channels=1","--rate="+str(RATE),"--latency-msec=30"],stdout=out)
            elif op == "measure":
                recorder.terminate()
                recorder.wait(3)
                raw = root/"received.raw"
                label = cmd["label"]
                if label not in ("incoming","muted"): raise ValueError("test case")
                with wave.open(str(root/(label+".wav")),"wb") as f:
                    f.setparams((1,2,RATE,0,"NONE","not compressed"))
                    f.writeframes(raw.read_bytes())
                result = {"Hz440":probe(raw,440),"Hz880":probe(raw,880),"samples":raw.stat().st_size//2}
            elif op == "screen":
                screen(browser, root/"speaker.png")
            elif op == "exit":
                print('{"ok":true}',flush=True)
                break
            else:
                raise ValueError("Unknown operation")
            print(json.dumps({"ok":result},ensure_ascii=True),flush=True)
        except Exception as exc:
            print(json.dumps({"error":str(exc)},ensure_ascii=True),flush=True)


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("name",choices=("node1","node2","node3"))
    p.add_argument("out",type=Path)
    p.add_argument("--browser",default="/opt/altnet-browser/altnet-browser")
    args = p.parse_args()
    args.out.mkdir(mode=0o700)
    with ExitStack() as stack:
        stack.enter_context(sound(args.out))
        child(stack, ["openbox"],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        browser = stack.enter_context(workspace["session"](args.out, executable=args.browser, headless=False, require_tor_status=False))
        try:
            serve(browser,args.out,args.name,stack)
        except Exception as exc:
            (args.out/"reason.txt").write_text(repr(exc),encoding="utf-8")
            try:
                print(browser.panel("return [win.location.href,typeof win.altNetVoice,win.document.body.innerText.slice(-1700)];"),file=sys.stderr)
            except Exception:
                pass
            raise
