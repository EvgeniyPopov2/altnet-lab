"""Проверить настоящую панель, перезапуск профиля или открытие сайта в нативной вкладке."""
import argparse
import base64
from contextlib import contextmanager
import json
import os
from pathlib import Path
import runpy
import socket
import subprocess
import tempfile
import uuid

native = runpy.run_path(str(Path(__file__).with_name("tor-native-ui.py")))
Client, receive, wait = (native[k] for k in ("Client","receive","wait_for"))
WINDOW = "let w=Services.wm.getMostRecentWindow('navigator:browser'), b=w.gBrowserInit.altNetWorkspace?.client;"
NS = "{73a6fe31-595d-460b-a920-fcc0f8843232}"


class Browser:
    def __init__(self, client):
        self.client = client

    def script(self, js, *args):
        return self.client.call("WebDriver:ExecuteScript", {"script": js, "args": list(args)})["value"]

    def panel(self, js, *args):
        # Выполнить проверку в контексте штатной панели с теми же открытиями DOM, что и React.
        frame = """let win=content.wrappedJSObject;
          Promise.resolve().then(async()=>{BODY}).then(value=>sendAsyncMessage('altnet-test-result',{value}),
            e=>sendAsyncMessage('altnet-test-result',{error:String(e),stack:String(e?.stack).slice(0,400)}));"""
        expr = frame.replace("BODY", "const args="+json.dumps(args,ensure_ascii=True)+";"+js)
        result = self.script(WINDOW + """const mm=b.messageManager;return new Promise(resolve=>{
          mm.addMessageListener("altnet-test-result",function finish(m){mm.removeMessageListener("altnet-test-result",finish);resolve(m.data)});
          mm.loadFrameScript("data:application/javascript;charset=utf-8,"+encodeURIComponent(arguments[0]),false)});""",expr)
        if "error" in result:
            raise RuntimeError(result)
        return result.get("value")

    def address(self, text):
        self.script(WINDOW+"w.gURLBar.focus();w.gURLBar.select();")
        element = self.client.call("WebDriver:FindElement", {"using":"css selector","value":"#urlbar-input"})["value"][native["ELEMENT"]]
        self.client.call("WebDriver:ElementSendKeys", {"id":element,"text":text+"\ue007"})


@contextmanager
def session(root, *, executable="/opt/altnet-browser/altnet-browser", headless=True, require_tor_status=True):
    data = root / "appdata"
    profile = data / "altnet/browser-profile"
    profile.mkdir(parents=True,exist_ok=True)
    with socket.socket() as reserve:
        reserve.bind(("127.0.0.1",0))
        port=reserve.getsockname()[1]
    (profile/"user.js").write_text(f'user_pref("marionette.port",{port});\nuser_pref("privacy.spoof_english",2);\n')
    env={**os.environ,"XDG_DATA_HOME":str(data),"XDG_CACHE_HOME":str(root/"cache")}
    with (root/"firefox.log").open("ab") as log:
        args = [str(executable), *(["-headless"] if headless else []), "-marionette", "--remote-allow-system-access", "about:blank"]
        proc=subprocess.Popen(args,env=env,stdout=log,stderr=log)
        try:
            def connect():
                if proc.poll() is not None: raise RuntimeError("Gecko завершился, см. "+str(log.name))
                try: return socket.create_connection(("127.0.0.1",port),1)
                except OSError: return None
            with wait(connect,"Gecko startup",60) as sock:
                sock.settimeout(150)
                receive(sock); client=Client(sock)
                client.call("WebDriver:NewSession",{"capabilities":{}})
                client.call("WebDriver:SetTimeouts",{"script":140000})
                client.call("Marionette:SetContext",{"value":"chrome"})
                browser=Browser(client)
                wait(lambda:browser.script(WINDOW+"return b?.contentTitle === 'AltNet';"),"startup panel",35)
                assert browser.script('const {AddonManager}=ChromeUtils.importESModule("resource://gre/modules/AddonManager.sys.mjs");return AddonManager.getAddonByID(arguments[0]).then(a=>!!a?.isActive);',NS), "NoScript"
                proxy=browser.script("return [Services.prefs.getIntPref('network.proxy.type'), Services.prefs.getStringPref('network.proxy.socks'), Services.prefs.getIntPref('network.proxy.socks_port'), Services.prefs.getBoolPref('network.proxy.socks_remote_dns')];")
                assert proxy == [1,"127.0.0.1",9050,True], proxy
                if require_tor_status:
                    wait(lambda: browser.panel("return !!win.document.body.innerText.includes(args[0])","Tor · SOCKS доступен"),"индикатор транспорта Ubuntu",50)
                try: yield browser
                finally:
                    try: client.call("Marionette:Quit",{"flags":["eAttemptQuit"]})
                    except (RuntimeError,OSError): pass
            assert proc.wait(timeout=40)==0, "Аварийный выход Gecko"
        finally:
            if proc.poll() is None:
                proc.terminate(); proc.wait(timeout=12)


def persistence(root):
    marker=uuid.uuid4().hex
    for seed in (True,False):
        with session(root) as browser:
            result=browser.panel("""
              if(!win.altNetRecords)throw Error("Не подключён интерфейс хранения AltNet");
              const key='altnet.test.bookmark', value=args[1], records=win.altNetRecords;
              if(args[0]) win.localStorage.setItem(key, value);
              let pass=win.localStorage.getItem(key)===value;
              for(const bucket of ['altnet-sitebuilder-drafts','altnet-published-sites','altnet-ipfs-site-cache']){
                const bytes=bucket==='altnet-ipfs-site-cache';
                if(args[0]){
                  const change=Cu.cloneInto([{op:'put',key:'probe',value:bytes?new TextEncoder().encode(value).buffer:{title:value}}],content);
                  await records.batch(bucket,change);
                }
                const rows=await records.batch(bucket,Cu.cloneInto([{op:'read',key:'probe'}],content));
                pass &&= (bytes ? new TextDecoder().decode(rows[0]) : rows[0]?.title)===value;
              }
              return {pass,ui:!!win.document.querySelector('#root')?.childElementCount};
            """,seed,marker)
            assert result=={"pass":True,"ui":True}, result
            print("PASS", "запись" if seed else "после штатного перезапуска", "настройки, черновик, публикация, двоичный CAR, NoScript", flush=True)


def publish_site(root, title=None):
    with session(root) as browser:
        def button(text):
            def click():
                return browser.panel("""const match=[...win.document.querySelectorAll('button')].find(b=>!b.disabled &&
                    (b.textContent.trim()===args[0] || b.title===args[0] || b.getAttribute('aria-label')===args[0]));
                    if(!match)return false;match.click();return true;""",text)
            try: wait(click,text,22)
            except AssertionError:
                print(browser.panel("return win.document.body.innerText.slice(-2200)"),flush=True)
                raise
        if title: browser.panel("""win.localStorage.setItem('altnet.sitebuilder.v1',JSON.stringify({title:args[0],blocks:[
          {id:'head',type:'h1',text:args[0]}]}));return true;""",title)
        if not browser.panel("return [...win.document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Браузер .alt')"):
            button("Ещё")
        button("Браузер .alt")
        button("Создать сайт")
        button("Раздача через Tor")
        if title: button("Опубликовать через Yggdrasil и Tor")
        def links():
            return browser.panel("""const codes=[...win.document.querySelectorAll('[aria-label="Временная раздача через Tor"] code')].map(x=>x.innerText);
              const error=win.document.querySelector('[aria-label="Временная раздача через Tor"] [role=alert]')?.innerText;
              if(error)throw Error(error);return codes.length?codes:null;""")
        result=wait(links,"ссылки работающей раздачи",45)
        print("PASS публичные ссылки в конструкторе" if not title else "PASS конструктор сформировал и опубликовал CAR",flush=True)
        print(json.dumps(result),flush=True)


def read_site(root, address, title, profile):
    with session(root) as browser:
        cold=browser.panel("""
          const key='profile:'+args[0]+':'+args[1], rows=await win.altNetRecords.batch('altnet-ipfs-site-cache',Cu.cloneInto([{op:'read',key}],content));
          win.localStorage.setItem('altnet.profile.v1',args[0]); return rows[0]===undefined;
        """,profile,address.rsplit("/",1)[-1])
        assert cold, "Проверка требует пустого кэша"
        browser.address(address)
        client=browser.client
        client.call("Marionette:SetContext",{"value":"content"})
        def loaded():
            info=browser.script("return {frame:!!document.querySelector('iframe'),error:document.querySelector('[role=alert]')?.textContent,uri:location.href}")
            if info.get("error"): raise RuntimeError(info)
            return info["frame"]
        wait(loaded,"вкладка с сайтом",145)
        el=client.call("WebDriver:FindElement",{"using":"css selector","value":"iframe"})["value"]
        client.call("WebDriver:SwitchToFrame",{"element":el})
        wait(lambda:title in browser.script("return document.body?.innerText || '';"),"текст страницы",10)
        print("PASS",profile,"пустой кэш → адресная строка → сайт в изолированном фрейме:",title,flush=True)
        client.call("WebDriver:SwitchToFrame",{})
        img=client.call("WebDriver:TakeScreenshot",{"full":False})["value"]
        (root/"render.png").write_bytes(base64.b64decode(img,validate=True))


if __name__=="__main__":
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--inspect-publication",action="store_true"); ap.add_argument("--publish-title"); ap.add_argument("--address"); ap.add_argument("--title"); ap.add_argument("--profile",choices=("fast","anon"))
    args=ap.parse_args()
    root=Path(tempfile.mkdtemp(prefix="altnet-browser-acceptance-"))
    print(root,flush=True)
    if args.inspect_publication: publish_site(root)
    elif args.publish_title: publish_site(root,args.publish_title)
    elif args.address: read_site(root,args.address,args.title,args.profile)
    else: persistence(root)
