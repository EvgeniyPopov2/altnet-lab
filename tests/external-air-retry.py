"""Повторные попытки комнаты после временной потери маршрута в установленном клиенте."""
import asyncio
import errno
import json
import os
import select
import signal
import socket
import subprocess
import sys
from pathlib import Path
import runpy
import unittest
from unittest.mock import Mock, patch

native = Path("/opt/altnet-browser/Browser/altnet-linux/voice_transport.py")
voice = runpy.run_path(str(native))


class RoomRetry(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.route = {"selfName": "Маяк", "peerName": "Стриж"}
        self.context = object()
        self.pin = b"peer certificate fixture"
        self.room = voice["Room"](voice["Session"](), ([(self.route, self.context, self.pin, "peer")], b"room fixture"))
        self.room.session.devices = Mock()

    async def connect(self):
        await self.room.link(self.route, self.context, self.pin, "peer")

    async def test_loss_of_route_retries_same_authenticated_session(self):
        for code in (errno.ENETUNREACH, errno.EHOSTUNREACH, errno.ENETDOWN, errno.EHOSTDOWN,
                     errno.ENODEV, errno.EADDRNOTAVAIL):
            with self.subTest(code=code):
                retried = asyncio.Event()
                calls = []
                async def route(*args):
                    calls.append(args)
                    if len(calls)==1:
                        raise OSError(code, "temporary route loss")
                    retried.set()
                    await asyncio.Future()
                self.room.session.devices.reset_mock()
                with patch.dict(self.room.link.__globals__, routed_stream=route):
                    task = asyncio.create_task(self.connect())
                    try:
                        await asyncio.wait_for(retried.wait(), 4)
                        self.assertEqual([args[:4] for args in calls],[(self.route,self.context,self.pin,self.room.preface)]*2)
                        self.assertIs(calls[0][4],calls[1][4])
                        self.assertEqual(self.room.session.phase,"waiting")
                        self.assertFalse(self.room.ready.is_set())
                        self.room.session.devices.mute.assert_called_once()
                    finally:
                        task.cancel()
                        await asyncio.gather(task,return_exceptions=True)

    async def test_permanent_failures_propagate(self):
        for error in (PermissionError(errno.EACCES,"access"),voice["VoiceError"]("pin mismatch")):
            with self.subTest(type=type(error).__name__):
                with patch.dict(self.room.link.__globals__,routed_stream=Mock(side_effect=error)):
                    with self.assertRaises(type(error)):
                        await asyncio.wait_for(self.connect(),2)


class DialTimingTests(unittest.TestCase):
    def test_short_retries_start_only_after_authentication(self):
        timing = voice["RoomDial"]()
        self.assertEqual(timing.timeout(0,0),4)
        timing.last_connect = .2
        self.assertEqual([timing.timeout(i,i*2) for i in range(5)],[1.1,1.1,1.1,4,1.1])
        self.assertEqual(timing.timeout(0,90),4)

    def test_long_round_trip_keeps_full_budget(self):
        timing = voice["RoomDial"]()
        timing.last_connect = 1.4
        self.assertEqual(timing.timeout(0,0),4)


class StandbyMedia(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        channels = voice["RoomChannels"]
        negotiated = patch.object(channels, "negotiated", return_value=True)
        negotiated.start()
        self.addCleanup(negotiated.stop)
        self.queues = [asyncio.Queue(), asyncio.Queue()]
        self.channels = [channels(q.get, server) for q, server in zip(self.queues, (False, True))]
        for channel in self.channels:
            self.addAsyncCleanup(channel.close)

    async def pair(self):
        sockets = socket.socketpair()
        streams = await asyncio.gather(*(asyncio.open_connection(sock=s) for s in sockets))
        for _, writer in streams:
            self.addCleanup(writer.transport.abort)
        return streams

    async def recovery(self):
        warm = await self.pair()
        for channel, queue, stream in zip(self.channels, self.queues, warm):
            queue.put_nowait(stream)
            channel.prepare(stream[1])
            await channel.spare
        tasks = [asyncio.create_task(channel.acquire()) for channel in self.channels]
        for task in tasks:
            self.addCleanup(task.cancel)
        await asyncio.sleep(0)
        return warm, tasks

    async def test_either_participant_can_wake_the_same_authenticated_spare(self):
        for index in (0, 1):
            warm, tasks = await self.recovery()
            self.assertFalse(any(t.done() for t in tasks))
            self.channels[index].wake.set()
            selected = await asyncio.wait_for(asyncio.gather(*tasks), 2)
            self.assertEqual(selected, warm)
            selected[0][1].write(b"audio")
            self.assertEqual(await selected[1][0].readexactly(5), b"audio")

    async def test_cold_path_wins_while_the_idle_spare_has_no_proof_of_life(self):
        warm, tasks = await self.recovery()
        cold = await self.pair()
        for queue, stream in zip(self.queues, cold):
            queue.put_nowait(stream)
        self.assertEqual(await asyncio.wait_for(asyncio.gather(*tasks), 2), cold)
        self.assertTrue(all(writer.is_closing() for _, writer in warm))

    async def test_dead_idle_spare_is_rebuilt_during_healthy_audio(self):
        channel = self.channels[0]
        first, remote = await self.pair()
        self.queues[0].put_nowait(first)
        channel.prepare(first[1])
        await channel.spare
        remote[1].transport.abort()
        await asyncio.wait_for(first[0].read(1), 2)
        replacement, _ = await self.pair()
        self.queues[0].put_nowait(replacement)
        channel.refresh()
        self.assertEqual(await asyncio.wait_for(channel.spare, 2), replacement)

    async def test_echo_alone_does_not_activate_the_microphone(self):
        channel = self.channels[0]
        channel.route = {"peer":"200::1", "source":"200::2", "interface":"test"}
        local, remote = await self.pair()
        self.queues[0].put_nowait(local)
        channel.prepare(local[1])
        await channel.spare
        async def echo(route):
            return True
        with patch.dict(channel.acquire.__globals__,wait_mesh_echo=echo):
            task = asyncio.create_task(channel.acquire())
            try:
                self.assertEqual(await asyncio.wait_for(remote[0].readexactly(1), 2), b"?")
                self.assertFalse(task.done())
                remote[1].write(b"!")
                self.assertEqual(await asyncio.wait_for(remote[0].readexactly(1), 2), b"C")
                self.assertFalse(task.done())
                remote[1].write(b"A")
                self.assertEqual(await asyncio.wait_for(task, 2), local)
            finally:
                task.cancel()
                await asyncio.gather(task, return_exceptions=True)

    async def test_leave_while_waiting_closes_spares(self):
        warm, tasks = await self.recovery()
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        self.assertTrue(all(writer.is_closing() for _, writer in warm))


class OwnerExit(unittest.TestCase):
    def test_owner_death_stops_helper_even_with_open_command_pipe(self):
        owner_code = """
import subprocess, sys, time
child=subprocess.Popen([sys.executable,"-IB",sys.argv[1],"--contact-air"],
                       stdin=int(sys.argv[2]),stdout=int(sys.argv[3]),close_fds=True)
print(child.pid,flush=True)
time.sleep(60)
"""
        read_cmd,write_cmd=os.pipe()
        read_reply,write_reply=os.pipe()
        with os.fdopen(read_cmd,"rb") as read, os.fdopen(write_cmd,"wb") as write, \
             os.fdopen(read_reply,"rb") as reply, os.fdopen(write_reply,"wb") as output:
            owner=subprocess.Popen([sys.executable,"-c",owner_code,str(native),str(read.fileno()),str(output.fileno())],
                                   stdout=subprocess.PIPE,pass_fds=(read.fileno(),output.fileno()))
            handle=None
            try:
                handle=os.pidfd_open(int(owner.stdout.readline()))
                write.write(b'{"op":"airPoll","arg":{}}\n')
                write.flush()
                self.assertTrue(select.select([reply],[],[],8)[0])
                self.assertIn("value",json.loads(reply.readline()))
                owner.terminate()
                owner.wait(timeout=5)
                self.assertTrue(select.select([handle],[],[],2)[0],"old helper still alive")
            finally:
                if owner.poll() is None:
                    owner.kill()
                    owner.wait()
                owner.stdout.close()
                if handle is not None:
                    if not select.select([handle],[],[],0)[0]:
                        signal.pidfd_send_signal(handle,signal.SIGKILL)
                    os.close(handle)


if __name__=="__main__":
    unittest.main()

