import asyncio

import pytest

from app.services.yjs_relay import YjsRelay, YjsRoom


class _FakeWebSocket:
    def __init__(self):
        self.sent: list[bytes] = []
        self.fail_after = None

    async def send_bytes(self, data: bytes) -> None:
        if self.fail_after is not None and len(self.sent) >= self.fail_after:
            raise RuntimeError("client gone")
        self.sent.append(data)


@pytest.mark.asyncio
async def test_room_broadcast_skips_origin():
    room = YjsRoom("sheet-1")
    a, b, c = _FakeWebSocket(), _FakeWebSocket(), _FakeWebSocket()
    await room.join(a)
    await room.join(b)
    await room.join(c)
    await room.broadcast(b"hello", origin=b)
    assert a.sent == [b"hello"]
    assert b.sent == []
    assert c.sent == [b"hello"]


@pytest.mark.asyncio
async def test_room_replays_cached_messages_to_late_joiners():
    room = YjsRoom("sheet-1", replay_cap=4)
    publisher = _FakeWebSocket()
    await room.join(publisher)
    for msg in [b"a", b"b", b"c"]:
        await room.broadcast(msg, origin=publisher)
    late = _FakeWebSocket()
    await room.join(late)
    assert late.sent == [b"a", b"b", b"c"]


@pytest.mark.asyncio
async def test_room_drops_clients_that_fail_to_send():
    room = YjsRoom("sheet-1")
    healthy = _FakeWebSocket()
    broken = _FakeWebSocket()
    broken.fail_after = 0
    await room.join(healthy)
    await room.join(broken)
    await room.broadcast(b"msg", origin=healthy)
    # After the failure the broken client should be dropped
    assert broken not in room.clients


@pytest.mark.asyncio
async def test_relay_creates_and_prunes_empty_rooms():
    relay = YjsRelay()
    room = await relay.get("X")
    assert room.size == 0
    await relay.prune("X")
    assert "X" not in relay._rooms


@pytest.mark.asyncio
async def test_status_endpoint_returns_room_snapshot(client):
    resp = await client.get("/api/v1/collab/status")
    assert resp.status_code == 200
    assert "rooms" in resp.json()


@pytest.mark.asyncio
async def test_peers_endpoint_returns_zero_for_unused_sheet(client):
    wb = (await client.post("/api/v1/workbooks", json={"name": "WB"})).json()
    s = (await client.post(f"/api/v1/workbooks/{wb['id']}/sheets", json={"name": "S"})).json()
    resp = await client.get(f"/api/v1/collab/sheets/{s['id']}/peers")
    assert resp.status_code == 200
    assert resp.json()["clients"] == 0


@pytest.mark.asyncio
async def test_peers_endpoint_unknown_sheet_404(client):
    resp = await client.get(
        "/api/v1/collab/sheets/00000000-0000-0000-0000-000000000000/peers"
    )
    assert resp.status_code == 404
