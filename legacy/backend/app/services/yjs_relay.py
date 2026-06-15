"""Yjs-compatible WebSocket relay.

The frontend uses `y-websocket` which speaks a tiny binary protocol that
multiplexes (sync + awareness) messages on a single channel. The reference
y-websocket server implementation is `y-websocket` (npm), but for v1.8 the
server's only job is to *relay* messages between clients connected to the
same room — clients use Yjs's built-in CRDT merge to converge.

Limitations of the relay-only design:
- A client joining late only sees state after other clients re-emit it
  (Yjs handles this via the sync protocol on the first connection).
- Server-side persistence (snapshots, history) is a v1.8.1 follow-up; the
  server here keeps a small in-memory cache of recent messages and replays
  them to newly-connected clients so first-paint is fast.

Each "room" is keyed on `sheet_id`. Cross-room isolation is enforced by
URL; the auth dep keeps unauthorised clients out.
"""
from __future__ import annotations

import asyncio
from collections import defaultdict, deque
from typing import Any, Deque

from fastapi import WebSocket


class YjsRoom:
    def __init__(self, room_id: str, replay_cap: int = 256):
        self.room_id = room_id
        self.clients: set[WebSocket] = set()
        self.replay: Deque[bytes] = deque(maxlen=replay_cap)
        self.lock = asyncio.Lock()

    async def join(self, ws: WebSocket) -> None:
        async with self.lock:
            self.clients.add(ws)
            # Replay cached messages so the new joiner converges quickly
            for msg in list(self.replay):
                try:
                    await ws.send_bytes(msg)
                except Exception:
                    break

    async def leave(self, ws: WebSocket) -> None:
        async with self.lock:
            self.clients.discard(ws)

    async def broadcast(self, message: bytes, origin: WebSocket) -> None:
        # Cache for future joiners
        self.replay.append(message)
        async with self.lock:
            targets = [c for c in self.clients if c is not origin]
        await asyncio.gather(
            *(self._safe_send(c, message) for c in targets),
            return_exceptions=True,
        )

    async def _safe_send(self, ws: WebSocket, message: bytes) -> None:
        try:
            await ws.send_bytes(message)
        except Exception:
            await self.leave(ws)

    @property
    def size(self) -> int:
        return len(self.clients)


class YjsRelay:
    """Process-local registry of rooms keyed by `sheet_id`."""

    def __init__(self) -> None:
        self._rooms: dict[str, YjsRoom] = {}
        self._registry_lock = asyncio.Lock()

    async def get(self, room_id: str) -> YjsRoom:
        async with self._registry_lock:
            room = self._rooms.get(room_id)
            if room is None:
                room = YjsRoom(room_id)
                self._rooms[room_id] = room
            return room

    async def prune(self, room_id: str) -> None:
        async with self._registry_lock:
            room = self._rooms.get(room_id)
            if room and room.size == 0:
                del self._rooms[room_id]

    def snapshot(self) -> dict[str, Any]:
        return {
            "rooms": [
                {"room_id": r.room_id, "clients": r.size}
                for r in self._rooms.values()
            ]
        }


relay = YjsRelay()
