"""Сторона node1 в проверке потери сети и повторного звонка на сохранённый контакт."""
import hmac
import secrets
import time


def check(e,slot,wait,provision,decode,mark):
    def audio_round(suffix, *, accept):
        if accept:
            wait(lambda:e.cmd("airview"),lambda s:s["phase"]=="invited" and "Эфир Стриж" in s["text"],"remote incoming call",260)
            assert not e.cmd("has_capture")
            e.cmd("airclick",selector='[data-air-action="accept"]')
        wait(lambda:e.cmd("airview"),lambda s:s["phase"]=="connected" and len(s["people"])==2,"connected")
        e.cmd("record")
        wait(lambda:slot("recording"+suffix),bool,"guest recording")
        slot("play"+suffix,True)
        e.cmd("play_duplex")
        wait(lambda:e.cmd("airview"),lambda s:any(p["name"]=="Эфир Стриж" and p["speaking"] for p in s["people"]),"remote speaker",80)
        wait(lambda:e.cmd("marker",hz=880),lambda level:level>700,"remote speech marker on the node1 speaker",65)
        media=e.cmd("air_routes")["17911"]["inode"]
        heard=e.cmd("measure")
        mark("Remote Ubuntu -> node1 "+str(heard))
        assert heard["Hz880"]>700 and heard["Hz880"]>5*heard["Hz440"] and heard["samples"]>=16000
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
    initial=audio_round("",accept=True)
    room=e.cmd("air_room")
    worker,=e.cmd("air_workers")
    def interrupt(suffix,previous):
        wait(lambda:slot("armed"+suffix),bool,"external caller is still connected")
        assert e.cmd("has_capture") and e.cmd("airview")["phase"]=="connected"
        # Снятие правил на Ubuntu выполняется локально и не зависит от управляющего канала.
        slot("cut"+suffix,True)
        lost=wait(lambda:e.cmd("airview"),lambda s:s["phase"]=="waiting" and len(s["people"])==1
                  and not s["people"][0]["speaking"],"node1 saw the caller go offline",65)
        wait(lambda:e.cmd("has_capture"),lambda active:not active,"node1 released capture during outage",12)
        assert previous not in e.cmd("air_media_inodes"), "Previous media socket still present at node1 while offline"
        e.cmd("recovery_audio_start")
        mark("node1 observed the interrupted call and released its microphone")
        wait(lambda:e.cmd("airview"),lambda s:s["phase"]=="connected" and len(s["people"])==2,
             "node1 automatically reconnected to the existing room",180)
        assert e.cmd("air_room")==room and e.cmd("browser_pid")==pid
        wait(lambda:e.cmd("has_capture"),bool,"node1 microphone resumed",10)
        heard = wait(lambda:e.cmd("recovery_heard"),bool,"resumed PCM on node1",60)
        slot("node1Heard"+suffix,heard)
        wait(lambda:slot("heardBoth"+suffix),bool,"resumed PCM on both endpoints",120)
        e.cmd("recovery_audio_stop")
        resumed=audio_round("Resume"+suffix,accept=False)
        assert resumed[2]!=previous
        mark("Existing room resumed duplex audio without user interaction")
        return resumed,lost
    resumed,lost = interrupt("",initial[2])
    second,_ = interrupt("Again",resumed[2])
    third,_ = interrupt("Third",second[2])
    wait(lambda:slot("restored"),bool,"remote completed automatic resume",120)
    saved=wait(lambda:e.cmd("contact_labels"),lambda v:len(v)==1 and any("Эфир Стриж" in label for label in v.values()),"original trusted contact")
    e.cmd("restart")
    assert e.cmd("browser_pid")!=pid and e.cmd("is_locked")
    wait(lambda:e.cmd("air_workers"),lambda ids:worker not in ids,"old node1 audio process exited",6)
    assert e.cmd("unlock",password=password)==identity
    e.cmd("contact_home")
    wait(lambda:e.cmd("contact_labels"),lambda v:set(v)==set(saved),"node1 trusted contact after restart")
    wait(lambda:e.cmd("has_capture"),lambda active:not active,"capture released after restart",6)
    slot("redial",True)
    wait(lambda:slot("readyToRedial"),bool,"guest restored its saved route and signalling service",570)
    mark("Both clients are using their saved contact for the second call")
    repeated=audio_round("2",accept=True)
    assert len({initial[2],resumed[2],second[2],third[2],repeated[2]})==5
    wait(lambda:slot("left"),bool,"remote capture released",90)
    view=e.cmd("airview")
    if view["phase"]!="closed":
        e.cmd("airclick",selector='[data-air-action="leave"]')
    wait(lambda:e.cmd("has_capture"),lambda active:not active,"local capture released",30)
    return dict(audio={"node1_to_actions":repeated[1],"actions_to_node1":repeated[0]},
                automaticResumeAudio={"node1_to_actions":resumed[1],"actions_to_node1":resumed[0]},
                thirdAutomaticResumeAudio={"node1_to_actions":third[1],"actions_to_node1":third[0]},
                secondAutomaticResumeAudio={"node1_to_actions":second[1],"actions_to_node1":second[0]},
                hostResumedSameRoom=True,hostResumedSameProcess=True,hostResumedOnNewSocket=True,
                initialAudio={"node1_to_actions":initial[1],"actions_to_node1":initial[0]},
                hostLostPhase=lost["phase"],hostMicrophoneReleasedOffline=True,
                hostIdentityRetained=True,hostContactRetained=True,newMediaSocket=True,
                networkInvitationsIssued=1,confirmedContactCodeCount=1)
