"""Drive a staged AltNet native browser in a fresh per-run Linux profile and Pulse server."""
import argparse
import array
import math
from contextlib import ExitStack
import json
from pathlib import Path
import re
import runpy
import subprocess
import sys
import time

media = runpy.run_path(str(Path(__file__).with_name("ubuntu-voice-room.py")))
native = media["workspace"]
tap, wait = media["tap"], media["wait"]


class Panel:
    def __init__(self, browser):
        self.b = browser

    def visible(self, selector):
        return self.b.panel("return [...win.document.querySelectorAll(args[0])].some(e=>e.getClientRects().length);", selector)

    def wait(self, selector):
        # The acceptance VM can have >30 runnable tasks for two vCPUs; avoid a wall-clock race
        # with an already successful transaction while Gecko is resuming the profile.
        return wait(lambda: self.visible(selector), selector, 120)

    def dismiss_tips(self):
        close='button[title="Закрыть все"]'
        clicked=self.b.panel("""const b=[...win.document.querySelectorAll(args[0])].find(e=>e.getClientRects().length);
          if(!b)return false; b.click();return true;""",close)
        if clicked:wait(lambda:not self.visible(close),"завершение анимации подсказок")

    def click(self, selector, label=None):
        if selector.startswith(("[data-contact-call","[data-identity-field","[data-air-","[data-network-","[data-link-")):
            # Switching personas can reopen the onboarding tips above the input.
            self.dismiss_tips()
            tap(self.b, selector, label)
            return
        def click_visible():
            return self.b.panel("""
                const el=[...win.document.querySelectorAll(args[0])].find(e=>e.getClientRects().length && !e.disabled &&
                     (!args[1] || e.innerText.trim().startsWith(args[1]) || e.getAttribute('aria-label')===args[1]));
                if(!el) return false;
                el.scrollIntoView({block:'center',behavior:'instant'}); el.click();return true;
                """,selector,label)
        wait(click_visible,selector+" "+str(label),100)

    def action(self, name):
        self.click(f'[data-identity-action="{name}"]')

    def open(self, name):
        self.click(f'[data-identity-open="{name}"]')

    def field(self, name, value):
        selector = f'[data-identity-field="{name}"]'
        self.wait(selector)
        if self.b.panel("return win.document.querySelector(args[0]).localName==='textarea';",selector):
            # A genuine paste drives React's controlled textarea and Gecko's input events.
            # The clipboard belongs to this disposable Xvfb, never the user's desktop.
            self.click(selector)
            self.b.script('Cc["@mozilla.org/widget/clipboardhelper;1"].getService(Ci.nsIClipboardHelper).copyString(arguments[0]);',value)
            subprocess.run(["xdotool","key","--clearmodifiers","ctrl+a","ctrl+v"],check=True)
            wait(lambda:self.b.panel("return win.document.querySelector(args[0]).value===args[1];",selector,value),name+" paste")
            return
        self.b.panel("""
          const el=[...win.document.querySelectorAll(args[0])].find(e=>e.getClientRects().length);
          const proto=el.localName==="textarea"?win.HTMLTextAreaElement.prototype:win.HTMLInputElement.prototype;
          win.Object.getOwnPropertyDescriptor(proto,"value").set.call(el,args[1]);
          el.dispatchEvent(new win.Event("input",{bubbles:true}));
          return true;""", selector, value)

    def value(self, name):
        return wait(lambda:self.b.panel("""
          const el=win.document.querySelector('[data-identity-value="'+args[0]+'"]');
          return el && (el.value || el.getAttribute('title') || el.textContent);""",name), name, 18)

    def home(self):
        self.b.panel("win.location.hash='#section/profile';return true;")
        self.wait("[data-identity-state]")
        self.dismiss_tips()

    def fast(self):
        # Wait inside Gecko. Repeated Marionette round-trips on a loaded VM can outlive
        # the entire host polling interval while React is already mounting the new panel.
        result=self.b.panel("""
          return await new win.Promise(resolve=>{
            const doc=win.document, attr='[data-identity-mode="fast"]';
            const observer=new win.MutationObserver(check);
            const timer=win.setTimeout(()=>finish(false),90000);
            function finish(value){observer.disconnect();win.clearTimeout(timer);resolve(value);}
            function check(){
              const button=doc.querySelector(attr);
              if(!button || !doc.querySelector('[data-identity-state="unlocked"]')) return;
              if(button.getAttribute('aria-pressed')==='true'){finish(true);return;}
              if(!button.disabled) button.click();
            }
            observer.observe(doc.documentElement,Cu.cloneInto({subtree:true,childList:true,attributes:true},content));
            check();
          });""")
        if not result:
            raise RuntimeError("The unlocked fast persona is unavailable")

    def devices(self):
        return self.b.panel("""return [...win.document.querySelectorAll('[data-identity-device]')].map(e=>({
            id:e.dataset.identityDevice, own:e.textContent.includes('Это устройство'), revoked:e.textContent.includes('Отозвано')
        }));""")

    def contacts(self):
        if not self.visible('[data-identity-open="invite"]'):
            self.click("button.id-back","К контактам")
        self.wait('[data-identity-open="invite"]')

    def open_link(self,data):
        if data.get("desktop"):
            import os
            env={**os.environ,"XDG_DATA_HOME":str(args.root/"appdata")}
            try:
                opened=subprocess.run(["gio","open",data["link"]],env=env,timeout=8,capture_output=True)
            except subprocess.TimeoutExpired:
                raise RuntimeError("Ubuntu timed out opening the registered AltNet handler") from None
            if opened.returncode:raise RuntimeError("Ubuntu could not open its registered AltNet handler")
        else:
            self.b.address(data["link"])

    def handle(self, op, data):
        if op=="rename_fast":
            self.home()
            self.fast()
            self.click("button","Изменить карточку")
            self.field("name",data["name"])
            self.field("callsign",data["callsign"])
            self.action("rename")
            wait(lambda:not self.visible('[data-identity-action="rename"]'),"сохранение позывного",30)
            return True
        if op=="contact_home":
            self.home()
            self.fast()
            self.contacts()
            return True
        if op=="contact_labels":
            return self.b.panel("""return Object.fromEntries([...win.document.querySelectorAll('button[data-identity-contact]')].map(e=>[e.dataset.identityContact,e.innerText]));""")
        if op=="missed":
            return self.b.panel("""return [...win.document.querySelectorAll('[data-air-missed] li')].map(e=>e.innerText);""")
        if op in ("entry_on","entry_off","entry_view"):
            if not self.visible("[data-entry-state]"):
                self.home()
                self.fast()
                self.contacts()
                self.open("invite")
            if op == "entry_view":
                state = self.b.panel("""const el=win.document.querySelector('[data-entry-state]');
                    el.closest('section').scrollIntoView({block:'center',behavior:'instant'});
                    return {state:el.dataset.entryState,link:!!win.document.querySelector('[data-identity-value="join-link"]')};""")
                media["screen"](self.b,args.root/"entry.png")
                return state
            action = "start" if op == "entry_on" else "stop"
            expected = "ready" if op == "entry_on" else "off"
            selector = f'[data-entry-action="{action}"]:not(:disabled)'
            self.wait(selector)
            tap(self.b,selector)
            wait(lambda:self.visible(f'[data-entry-state="{expected}"]'),"entry "+expected,65)
            return expected
        if op=="issue_link":
            self.home()
            self.fast()
            self.contacts()
            self.open("invite")
            old=self.b.panel("""return win.document.querySelector('[data-identity-value="join-link"]')?.value;""")
            self.wait('[data-identity-action="network-link"]:not(:disabled)')
            tap(self.b,'[data-identity-action="network-link"]')
            link=wait(lambda:self.b.panel("""const el=win.document.querySelector('[data-identity-value="join-link"]');
                return el && el.value!==args[0] && el.value;""",old),"freshly issued link")
            if data.get("qr"):
                self.click("[data-link-qr] summary")
                return wait(lambda:self.b.panel("return win.document.querySelector('[data-link-qr] img')?.src;"),"one PNG QR")
            return link
        if op=="before_register":
            self.wait('[data-identity-state="absent"]')
            self.open_link(data)
            self.wait(".id-invite-note")
            return True
        if op=="open_join":
            self.home()
            self.fast()
            if "png" in data:
                self.contacts()
                self.open("receive")
                self.click(".id-qr summary")
                self.b.panel("""const bytes=Uint8Array.from(atob(args[0].split(',')[1]),c=>c.charCodeAt(0));
                  const file=new win.File(Cu.cloneInto([bytes.buffer],content),'invite.png',Cu.cloneInto({type:'image/png'},content));
                  const transfer=new win.DataTransfer();transfer.items.add(file);
                  const input=win.document.querySelector('.id-qr input[type=file]');input.files=transfer.files;
                  input.dispatchEvent(new win.Event('change',Cu.cloneInto({bubbles:true},content)));return true;""",data["png"])
            elif not data.get("pending"):
                self.open_link(data)
            sel='[data-identity-action="preview"]'
            def preview():
                view=self.b.panel("""return {ready:win.document.querySelector(args[0])?.textContent==='Войти по приглашению',
                    status:win.document.querySelector('.id-qr [role=status]')?.textContent};""",sel)
                if view.get("status") and view["status"]!="QR-код прочитан.":
                    raise RuntimeError("Чтение QR: "+view["status"])
                return view["ready"]
            wait(preview,"preview join")
            tap(self.b,sel)
            self.wait("[data-link-state=waiting]")
            return True
        if op=="link_state":
            return self.b.panel("""return {state:win.document.querySelector('[data-link-state]')?.dataset.linkState,
              code:win.document.querySelector('[data-link-code]')?.textContent,joined:!!win.document.querySelector('[data-network-call]:not(:disabled)')};""")
        if op=="network_card":
            self.home()
            self.fast()
            self.contacts()
            self.click('button[data-identity-contact="'+data["contact"]+'"]')
            self.click("[data-network-invite]")
            self.wait("[data-network-sent]")
            return self.b.panel("return win.document.querySelector('[data-network-sent]').innerText;")
        if op=="network_ui":
            return self.b.panel("""const d=win.document.querySelector('[data-network-offer]');
                return {sender:d?.dataset.networkOffer,issuer:d?.querySelector('code')?.textContent,
                        joined:!!win.document.querySelector('[data-network-joined]')};""")
        if op=="air_server":
            self.b.panel("win.location.hash='#section/servers/altdev/voice';return true;")
            self.wait("[data-air-choose]")
            picker='dialog[open][data-contact-air-phase="choose"]'
            if not self.visible(picker):
                self.click("[data-air-choose]")
            self.wait(picker)
            return True
        if op == "airclick":
            self.click(data["selector"])
            return True
        if op == "airview":
            return self.b.panel("""const d=win.document.querySelector('dialog[data-air-contacts]'); return {
              phase:d?.dataset.contactAirPhase??"closed",text:d?.innerText??"",selected:[...d?.querySelectorAll('input:checked')??[]].map(e=>e.dataset.airContact),
              people:[...d?.querySelectorAll('[data-person]')??[]].map(e=>({name:e.querySelector('b').textContent,speaking:e.dataset.speaking==='true'}))};""")
        if op == "persona":
            profile = data["profile"]
            if profile not in ("anon", "fast"):
                raise ValueError("Unknown profile")
            button = f'button[data-identity-mode="{profile}"]'
            self.click(button)
            self.wait(button + '[aria-pressed="true"]')
            devices = [d["id"] for d in self.devices() if d["own"] and not d["revoked"]]
            fingerprint = self.value("fingerprint")
            if len(devices) != 1 or not all(re.fullmatch(r"[a-f0-9]{64}", s) for s in [*devices, fingerprint]):
                raise RuntimeError("Expected one active local device and a full fingerprint")
            return {"profile":profile,"fingerprint":fingerprint,"device":devices[0],
                    "name":self.b.panel("return win.document.querySelector('.id-card-heading h2').textContent;"),
                    "pid":self.b.script("return Services.appinfo.processID;")}
        if op == "reject_password":
            self.wait('[data-identity-state="locked"]')
            self.field("password", data["password"])
            self.action("unlock")
            self.wait('[data-identity-state="locked"] [role="alert"]')
            return True
        if op == "register":
            self.home()
            self.open("register")
            for k in ("name","callsign","fastName","fastCallsign","deviceName","password"):
                self.field(k,data[k])
            self.field("confirmPassword",data["password"])
            self.action("register")
            self.wait(".id-backup")
            assert self.value("backup").count(".") == 4
            self.click(".id-backup summary")
            assert self.value("recoveryCode").startswith("ALT-R1-")
            self.click(".id-backup input[type=checkbox]")
            self.action("backup-done")
            self.fast()
            return self.value("fingerprint")
        if op == "lock_account":
            self.home()
            self.action("lock")
            self.wait('[data-identity-state="locked"]')
            return True
        if op == "is_locked":
            return self.b.panel("""return !!win.document.querySelector('[data-identity-state="locked"]');""")
        if op == "unlock":
            self.home()
            self.wait('[data-identity-state="locked"]')
            self.field("password",data["password"])
            self.action("unlock")
            wait(lambda:self.b.panel("return !!win.document.querySelector('[data-identity-state=unlocked]');"),
                 "учётная запись открыта",120)
            self.fast()
            return self.value("fingerprint")
        if op == "export":
            self.contacts()
            self.open("invite")
            self.action("invite")
            token = self.value("invite")
            self.contacts()
            return token
        if op == "trust":
            self.contacts()
            self.open("receive")
            self.field("card", data["token"])
            self.action("preview")
            self.wait(".id-preview")
            # A value taken from a different person's independent identity screen must fail.
            self.field("expectedFingerprint",data["wrong"])
            self.action("trust")
            self.wait(".id-preview [role=alert]")
            self.field("expectedFingerprint",data["expected"])
            self.action("trust")
            self.wait('[data-identity-open="invite"]')
            return self.visible('button[data-identity-contact="'+data["expected"]+'"]')
        if op == "open_contact":
            self.contacts()
            self.click('button[data-identity-contact="'+data["id"]+'"]')
            self.wait('[data-contact-phase]')
            return True
        if op == "call":
            self.click('[data-contact-call="'+data["button"]+'"]')
            return True
        if op == "state":
            return self.b.panel("""const panel=win.document.querySelector('[data-contact-phase]');return {
              phase:panel?.dataset.contactPhase, text:panel?.innerText, people:[...(panel?.querySelectorAll('[data-person]')||[])].map(e=>({
              id:e.dataset.person, name:e.querySelector('b')?.textContent, speaking:e.dataset.speaking==="true",muted:e.dataset.muted==="true"}))};""")
        if op == "devices":
            return self.devices()
        if op == "enroll_request":
            self.home()
            self.open("enroll")
            self.field("deviceName",data["deviceName"])
            self.field("password",data["password"])
            self.field("confirmPassword",data["password"])
            self.action("enroll-create")
            return {"request":self.value("request"), "code":self.value("pairingCode")}
        if op == "approve":
            self.click("summary","Подтвердить новое устройство")
            self.field("request",data["request"])
            self.action("enroll-preview")
            self.field("pairingCode",data["code"])
            self.action("enroll-approve")
            return self.value("response")
        if op == "finish":
            self.click("button","У меня есть ответ")
            self.field("response",data["response"])
            self.field("expectedFastFingerprint",data["fingerprint"])
            self.field("password",data["password"])
            self.action("enroll-finish")
            self.fast()
            return {"fingerprint":self.value("fingerprint"),"devices":self.devices()}
        if op == "revoke":
            key = data["id"]
            assert re.fullmatch("[a-f0-9]{64}",key)
            self.click('[data-identity-device="'+key+'"] button')
            self.action("revoke")
            wait(lambda:any(d["id"]==key and d["revoked"] for d in self.devices()),"отозванное устройство")
            return self.devices()
        if op == "peer_devices":
            self.contacts()
            self.click('button[data-identity-contact="'+data["id"]+'"]')
            return self.b.panel("""return [...win.document.querySelectorAll('section[data-identity-contact] .id-devices > div')].map(e=>e.innerText);""")
        if op == "refuse_stale":
            self.contacts()
            self.open("receive")
            self.field("card",data["token"])
            self.action("preview")
            self.field("expectedFingerprint",data["expected"])
            self.action("trust")
            self.wait(".id-preview [role=alert]")
            return self.b.panel("return win.document.querySelector('.id-preview [role=alert]').textContent;")
        raise ValueError("Unknown panel command")


def serve(args, root, stack):
    profile = ExitStack()
    stack.callback(profile.close)
    def start():
        return Panel(profile.enter_context(native["session"](root,executable=args.browser,headless=False,require_tor_status=False)))
    ui = start()
    ui.home()
    recorder, player = None, None
    print(json.dumps({"ready":args.name}),flush=True)
    for line in sys.stdin:
        cmd = json.loads(line)
        op = cmd.pop("op")
        try:
            if op=="offline":
                profile.close()
                ui=None
                result=True
            elif op=="use_installed_browser":
                assert ui is None
                args.browser="/opt/altnet-browser/altnet-browser"
                result=True
            elif op=="online":
                assert ui is None
                ui=start()
                ui.home()
                ui.wait('[data-identity-state="locked"]')
                result=True
            elif op in ("expire_qa_certificate","qa_certificate"):
                import hashlib
                import os
                import ssl
                import tempfile
                cert,=root.rglob("air-devices/*/tls/cert")
                assert cert.resolve().is_relative_to(root.resolve()) and cert.is_file() and not cert.is_symlink()
                if op=="expire_qa_certificate":
                    with tempfile.TemporaryDirectory(dir=cert.parent) as tmp:
                        short=Path(tmp)/"cert"
                        subprocess.run(["openssl","req","-x509","-key",str(cert.with_name("key")),"-days","1",
                                        "-subj","/CN=AltNet Air QA","-out",str(short)],capture_output=True,check=True)
                        os.replace(short,cert)
                result={"hash":hashlib.sha256(ssl.PEM_cert_to_DER_cert(cert.read_text())).hexdigest(),
                        "validWeek":subprocess.run(["openssl","x509","-in",str(cert),"-noout","-checkend","604800"],capture_output=True).returncode==0}
            elif op=="account_revision":
                result=ui.b.panel("""const changes=Cu.cloneInto([{op:"read",key:"current"}],content);
                    const [row]=await win.altNetRecords.batch("altnet-account-v1",changes);return row.revision;""")
            elif op=="catalog_version":
                import sqlite3
                result=0
                for dbfile in root.rglob("fast-mail.sqlite"):
                    with sqlite3.connect("file:"+str(dbfile)+"?mode=ro",uri=True) as db:
                        if db.execute("SELECT 1 FROM sqlite_master WHERE name='directory_catalog'").fetchone():
                            result=max(result,db.execute("SELECT coalesce(max(rev),0) FROM directory_catalog").fetchone()[0])
            elif op=="network_storage":
                import sqlite3
                pins=[]
                memberships=0
                for dbfile in root.rglob("fast-mail.sqlite"):
                    with sqlite3.connect("file:"+str(dbfile)+"?mode=ro",uri=True) as db:
                        if db.execute("SELECT 1 FROM sqlite_master WHERE name='directory_catalog'").fetchone():
                            pins.extend([v[0].lower() for v in db.execute("SELECT hex(issuer) FROM directory_catalog")])
                        memberships+=db.execute("SELECT count(*) FROM mail WHERE slot='network-member'").fetchone()[0]
                result={"issuers":pins,"localMemberships":memberships,"adminConfiguration":Path("/etc/altnet-browser/meeting-network.json").exists()}
            elif op=="meeting_count":
                import sqlite3
                result=0
                for path in root.rglob("fast-mail.sqlite"):
                    with sqlite3.connect("file:"+str(path)+"?mode=ro",uri=True) as db:
                        result+=db.execute("SELECT count(*) FROM (SELECT slot FROM meeting WHERE expires>? GROUP BY slot HAVING count(DISTINCT owner)>=2)",
                                           (int(cmd["after"]),)).fetchone()[0]
            elif op=="mail_counts":
                import sqlite3
                counts={}
                for path in root.parent.rglob("fast-mail.sqlite"):
                    with sqlite3.connect("file:"+str(path)+"?mode=ro",uri=True) as db:
                        for slot,cnt in db.execute("SELECT slot,count(*) FROM mail GROUP BY slot"):
                            if slot in ("out","in","seen","relay"):counts[slot]=counts.get(slot,0)+cnt
                result=counts
            elif op == "restart":
                profile.close()
                ui=start()
                ui.home()
                ui.wait('[data-identity-state="locked"]')
                result=True
            elif op == "record":
                with (root/"received.raw").open("wb") as out:
                    recorder=media["child"](stack,["parec","--device=speakers.monitor","--raw","--rate=16000","--channels=1","--format=s16le"],stdout=out)
                result=True
            elif op in ("play","play_room"):
                rate, data=media["wave_data"](args.name)
                source=root/"stimulus.raw"
                if op=="play_room":
                    hz={"node1":440,"node2":880,"node3":1220}[args.name]
                    speech=array.array("h",data)[rate+rate//9:]
                    data=array.array("h",(int(v*.55+3500*math.sin(2*math.pi*hz*i/rate)) for i,v in enumerate(speech))).tobytes()
                source.write_bytes(data*8)
                player=media["child"](stack,["pacat","--device=mic","--raw","--rate="+str(rate),"--channels=1","--format=s16le",str(source)])
                result=True
            elif op == "stop":
                if player and player.poll() is None:
                    player.terminate(); player.wait(3)
                result=True
            elif op == "measure":
                recorder.terminate(); recorder.wait(3)
                raw=root/"received.raw"
                result={"Hz440":media["probe"](raw,440),"Hz880":media["probe"](raw,880),"Hz1220":media["probe"](raw,1220),"samples":raw.stat().st_size//2}
            elif op == "route":
                route=json.loads(Path("/etc/altnet-browser/voice.json").read_text())
                ips=subprocess.check_output(["ip","-6","route","get",route["peer"]],text=True)
                sockets=subprocess.check_output(["ss","-6Htnp","state","established",f"( sport = :{route['port']} or dport = :{route['port']} )"],text=True)
                assert any('['+route["peer"]+']' in r and '['+route["source"]+']' in r and '"python3"' in r for r in sockets.splitlines())
                assert " dev "+route["interface"]+" " in ips
                result={"interface":route["interface"],"port":route["port"]}
            elif op == "air_routes":
                rows=subprocess.check_output(["ss","-6Htnpe","state","established"],text=True)
                links={}
                for line in rows.splitlines():
                    addrs=re.findall(r"\[([0-9a-f:]+)(?:%[\w.-]+)?\](?:%[\w.-]+)?:(\d+)",line)
                    if len(addrs)!=2 or '"python3"' not in line:continue
                    ports=[int(p) for addr,p in addrs if 17911<=int(p)<17939]
                    if len(ports)!=1:continue
                    local,peer=[a for a,p in addrs]
                    route=json.loads(subprocess.check_output(["ip","-j","-6","route","get",peer,"from",local]))
                    assert Path("/sys/class/net",route[0]["dev"],"tun_flags").exists()
                    links[str(ports[0])]={"inode":re.search(r"ino:(\d+)",line).group(1),"interface":route[0]["dev"]}
                if not links:
                    safe=[re.sub(r"\[[^\]]+\]","[mesh]",s)[:220] for s in rows.splitlines() if re.search(r":179(?:1[1-9]|2[0-9]|3[0-8])\b",s)]
                    raise RuntimeError("Проверка сокетов Эфира: "+repr(safe))
                result=links
            elif op == "has_capture":
                result=bool(subprocess.check_output(["pactl","list","short","source-outputs"],text=True).strip())
            elif op == "air_screen":
                media["screen"](ui.b,root/"air.png")
                result=True
            elif op == "screen":
                ui.b.panel("""const stage=win.document.querySelector('[data-contact-phase=connected] .air-stage');
                  if(!stage) throw Error('No active contact call'); stage.scrollIntoView({block:'center',behavior:'instant'});return true;""")
                media["screen"](ui.b,root/"contact.png")
                result=True
            elif op == "exit":
                print('{"ok":true}',flush=True)
                return
            else:
                result=ui.handle(op,cmd)
            print(json.dumps({"ok":result},ensure_ascii=True),flush=True)
        except Exception as exc:
            # Never dump an envelope, pairing material or form values on errors.
            safe=ui.b.panel("""return {
              route:win.location.hash.slice(0,48), state:win.document.querySelector('[data-identity-state]')?.dataset.identityState,
              errors:[...win.document.querySelectorAll('[role=alert],[data-contact-phase] [role=status]')].map(e=>e.textContent.slice(0,150)),
              forms:[...win.document.querySelectorAll('form [data-identity-action]')].map(el=>[el.dataset.identityAction,el.disabled]),
              available:[...win.document.querySelectorAll('[data-identity-open]')].map(el=>el.dataset.identityOpen)
            };""")
            print(json.dumps({"error":str(exc)[:400]+" "+str(safe)[:400]},ensure_ascii=True),flush=True)


if __name__ == "__main__":
    p=argparse.ArgumentParser()
    p.add_argument("name",choices=("node1","node2","node3"))
    p.add_argument("root",type=Path)
    p.add_argument("--browser",required=True)
    p.add_argument("--contact-air",action="store_true")
    p.add_argument("--meeting-directory",action="store_true")
    p.add_argument("--meeting-network",action="store_true")
    args=p.parse_args()
    args.root.mkdir(mode=0o700,exist_ok=False)
    with ExitStack() as stack:
        if args.contact_air:
            expected={"meeting-network.json"} if args.meeting_network else {"meeting.json"} if args.meeting_directory else set()
            assert {v.name for v in Path("/etc/altnet-browser").iterdir()} == expected
        if args.name != "node3" or args.contact_air:
            stack.enter_context(media["sound"](args.root))
        media["child"](stack, ["openbox"], stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        serve(args,args.root,stack)

