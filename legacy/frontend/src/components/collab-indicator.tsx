"use client";

import { useEffect, useState } from "react";
import { Users } from "lucide-react";

interface CollabIndicatorProps {
  sheetId: string;
  email: string;
}

interface PeerInfo {
  email: string;
  color: string;
}

const PALETTE = ["#10B981", "#3B82F6", "#EF4444", "#F59E0B", "#8B5CF6", "#EC4899"];

function colorFor(email: string): string {
  let hash = 0;
  for (let i = 0; i < email.length; i += 1) {
    hash = (hash * 31 + email.charCodeAt(i)) >>> 0;
  }
  return PALETTE[hash % PALETTE.length];
}

export function CollabIndicator({ sheetId, email }: CollabIndicatorProps) {
  const [peers, setPeers] = useState<PeerInfo[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | undefined;

    (async () => {
      const Y = await import("yjs");
      const { WebsocketProvider } = await import("y-websocket");
      if (cancelled) return;

      const apiBase = process.env.NEXT_PUBLIC_API_URL || "";
      const wsBase = apiBase
        ? apiBase.replace(/^http/i, "ws") + "/api/v1/collab/ws/sheets"
        : `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/api/v1/collab/ws/sheets`;

      const doc = new Y.Doc();
      const provider = new WebsocketProvider(wsBase, sheetId, doc, {
        connect: true,
      });
      const local = { email, color: colorFor(email) };
      provider.awareness.setLocalStateField("user", local);

      const syncPeers = () => {
        const states = Array.from(provider.awareness.getStates().values());
        const seen = new Map<string, PeerInfo>();
        for (const s of states) {
          const u = (s as { user?: PeerInfo }).user;
          if (u?.email && !seen.has(u.email)) seen.set(u.email, u);
        }
        setPeers(Array.from(seen.values()));
      };
      provider.awareness.on("change", syncPeers);
      provider.on("status", (e: { status: string }) => {
        setConnected(e.status === "connected");
      });
      syncPeers();

      cleanup = () => {
        provider.awareness.off("change", syncPeers);
        provider.disconnect();
        provider.destroy();
        doc.destroy();
      };
    })();

    return () => {
      cancelled = true;
      if (cleanup) cleanup();
    };
  }, [sheetId, email]);

  return (
    <div className="flex items-center gap-1.5 text-xs text-white/80">
      <Users className="h-3.5 w-3.5" />
      <span className={`h-2 w-2 rounded-full ${connected ? "bg-emerald-300" : "bg-amber-300"}`} />
      <div className="flex -space-x-1">
        {peers.map((p) => (
          <span
            key={p.email}
            title={p.email}
            className="inline-block h-5 w-5 rounded-full border border-white/40 text-[10px] flex items-center justify-center text-white font-medium"
            style={{ backgroundColor: p.color }}
          >
            {p.email.slice(0, 1).toUpperCase()}
          </span>
        ))}
      </div>
    </div>
  );
}
