"use client";

import { useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";

/**
 * Q6 — one status slot above the composer. Never a stack.
 *
 * Priority: offline > reconnecting > typing > live.
 * "live" self-clears after 2s so the resting state is empty.
 * Fixed height so the composer never reflows; aria-live="polite".
 *
 * Typing and presence ride the existing conv:<id> broadcast channel — no new
 * transport, no DB writes. "Seen" reuses mark_read plus a broadcast.
 */
export type Conn = "live" | "reconnecting" | "offline";

const STRIP = {
  live: { label: "LIVE", bg: "bg-[rgba(89,164,77,.14)]", ink: "text-(--status-live-ink)", dot: "bg-(--status-live-ink)" },
  typing: { label: "", bg: "bg-[rgba(0,106,167,.10)]", ink: "text-(--status-typing-ink)", dot: "bg-(--status-typing-ink)" },
  reconnecting: { label: "RECONNECTING…", bg: "bg-[rgba(224,142,39,.15)]", ink: "text-(--status-warn-ink)", dot: "bg-(--status-warn-ink)" },
  offline: { label: "OFFLINE · MESSAGES WILL SEND", bg: "bg-[rgba(197,48,48,.12)]", ink: "text-(--status-offline-ink)", dot: "bg-(--status-offline-ink)" },
} as const;

export function ThreadStatus({ conn, typingName }: { conn: Conn; typingName: string | null }) {
  const [showLive, setShowLive] = useState(false);

  useEffect(() => {
    if (conn !== "live") return;
    // Defer both toggles into timers so neither is a synchronous setState in the
    // effect body; the 0ms show is imperceptible for a transient confirmation.
    const show = setTimeout(() => setShowLive(true), 0);
    const hide = setTimeout(() => setShowLive(false), 2000);
    return () => {
      clearTimeout(show);
      clearTimeout(hide);
    };
  }, [conn]);

  const state =
    conn === "offline" ? "offline"
    : conn === "reconnecting" ? "reconnecting"
    : typingName ? "typing"
    : showLive ? "live"
    : null;

  // Height is always reserved — an appearing strip must not move the composer.
  return (
    <div role="status" aria-live="polite" className="mx-4 h-[34px] shrink-0">
      {state ? (
        <div className={`flex h-full items-center gap-2 rounded-lg px-3 ${STRIP[state].bg}`}>
          <span className={`size-[7px] shrink-0 rounded-full ${STRIP[state].dot} ${state === "typing" ? "animate-pulse" : ""}`} />
          <span className={`eyebrow ${STRIP[state].ink}`}>
            {state === "typing" ? `${typingName} is typing` : STRIP[state].label}
          </span>
        </div>
      ) : null}
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Wiring in ChatThread
   ------------------------------------------------------------------------ */

/** Throttled to one broadcast every 3s while the composer changes. */
export function useTypingBroadcast(
  channel: RealtimeChannel | null,
  myPlayerId: string,
  myName: string,
  enabled: boolean,
) {
  const last = useRef(0);
  return () => {
    if (!channel || !enabled) return;
    const now = Date.now();
    if (now - last.current < 3000) return;
    last.current = now;
    void channel.send({
      type: "broadcast",
      event: "typing",
      payload: { id: myPlayerId, name: myName },
    });
  };
}

/**
 * Receiving side. There is no "stopped typing" event to lose — the name simply
 * expires 4s after the last ping. Ignore your own id.
 */
export function useTypingName(myPlayerId: string) {
  const [name, setName] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onTyping = (payload: { id: string; name: string }) => {
    if (payload.id === myPlayerId) return;
    setName(payload.name);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setName(null), 4000);
  };

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return { typingName: name, onTyping };
}
