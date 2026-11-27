"""Повторные попытки комнаты после временной потери маршрута в установленном клиенте."""
import asyncio
import errno
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
                        self.assertEqual(calls,[ (self.route,self.context,self.pin,self.room.preface) ]*2)
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


if __name__=="__main__":
    unittest.main()

