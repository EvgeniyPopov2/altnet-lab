"""Сторона node1 в проверке потери сети и повторного звонка на сохранённый контакт."""
import hmac
import secrets
import time


def check(e,slot,wait,provision,decode,mark):
    def audio_round(suffix):
        wait(lambda:e.cmd("airview"),lambda s:s["phase"]=="invited" and "Эфир Стриж" in s["text"],"remote incoming call",260)
        assert not e.cmd("has_capture")
        e.cmd("airclick",selector='[data-air-action="accept"]')
        wait(lambda:e.cmd("airview"),lambda s:s["phase"]=="connected" and len(s["people"])==2,"connected")
        media=e.cmd("air_routes")["17911"]["inode"]
        e.cmd("record")
        wait(lambda:slot("recording"+suffix),bool,"guest recording")
        slot("play"+suffix,True)
        wait(lambda:e.cmd("airview"),lambda s:any(p["name"]=="Эфир Стриж" and p["speaking"] for p in s["people"]),"remote speaker",80)
        time.sleep(2)
        heard=e.cmd("measure")
        assert heard["Hz880"]>700 and heard["Hz880"]>5*heard["Hz440"] and heard["samples"]>=16000
        mark("Remote Ubuntu -> node1 "+str(heard))
        e.cmd("play_room")
        other=wait(lambda:slot("result"+suffix),bool,"remote audio",100)
        assert other["Hz440"]>700 and other["Hz440"]>5*other["Hz880"] and other["samples"]>=16000
        mark("node1 -> remote Ubuntu "+str(other))
        slot("done"+suffix,heard)
        e.cmd("stop")
        return heard,other,media

    password=secrets.token_urlsafe(24)
    identity=provision(e,"Маяк",password)
    pid=e.cmd("browser_pid")
    wait(lambda:e.cmd("catalog_version"),bool,"issuer catalog")
    assert e.cmd("entry_on")=="ready"
    link=e.cmd("issue_link",qr=False)
    assert link.startswith("alt://join/v3/") and len(decode(link)[-1])==1
    slot("invite",link)
    del link
    mark("Temporary v3 invitation issued after remote readiness")
    claim=wait(lambda:e.cmd("link_state"),lambda s:s.get("state")=="request","signed join request",420)
    remote=wait(lambda:slot("claim"),bool,"remote confirmation",120)
    assert hmac.compare_digest(claim["code"],remote)
    e.cmd("airclick",selector="[data-link-approve]")
    e.cmd("contact_home")
    slot("invite",None) # удаление ранее выданной ссылки контроллером стенда
    mark("Matched confirmation and approved request on node1")
    initial=audio_round("")
    wait(lambda:slot("armed"),bool,"external caller is still connected")
    assert e.cmd("has_capture") and e.cmd("airview")["phase"]=="connected"
    # Снятие правил на Ubuntu выполняется локально и не зависит от управляющего канала.
    slot("cut",True)
    lost=wait(lambda:e.cmd("airview"),lambda s:s["phase"]=="waiting" and len(s["people"])==1
              and not s["people"][0]["speaking"],"node1 saw the caller go offline",65)
    wait(lambda:e.cmd("has_capture"),lambda active:not active,"node1 released capture during outage",12)
    mark("node1 observed the interrupted call and released its microphone")
    wait(lambda:slot("restored"),bool,"Ubuntu connectivity restored",120)
    saved=wait(lambda:e.cmd("contact_labels"),lambda v:len(v)==1 and any("Эфир Стриж" in label for label in v.values()),"original trusted contact")
    e.cmd("restart")
    assert e.cmd("browser_pid")!=pid and e.cmd("is_locked")
    assert e.cmd("unlock",password=password)==identity
    e.cmd("contact_home")
    wait(lambda:e.cmd("contact_labels"),lambda v:set(v)==set(saved),"node1 trusted contact after restart")
    assert not e.cmd("has_capture")
    slot("redial",True)
    mark("Both clients are using their saved contact for the second call")
    repeated=audio_round("2")
    assert initial[2]!=repeated[2]
    wait(lambda:slot("left"),bool,"remote capture released",90)
    view=e.cmd("airview")
    if view["phase"]!="closed":
        e.cmd("airclick",selector='[data-air-action="leave"]')
    wait(lambda:e.cmd("has_capture"),lambda active:not active,"local capture released",30)
    return dict(audio={"node1_to_actions":repeated[1],"actions_to_node1":repeated[0]},
                initialAudio={"node1_to_actions":initial[1],"actions_to_node1":initial[0]},
                hostLostPhase=lost["phase"],hostMicrophoneReleasedOffline=True,
                hostIdentityRetained=True,hostContactRetained=True,newMediaSocket=True,
                networkInvitationsIssued=1,confirmedContactCodeCount=1)
