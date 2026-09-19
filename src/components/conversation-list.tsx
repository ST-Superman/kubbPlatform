"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";
import type { ConversationSummary, ConversationType } from "@/lib/supabase/messages";
import { cn } from "@/lib/utils";

/**
 * Inbox list. Renders the conversations from list_my_conversations and keeps them
 * live: subscribes to each `conv:<id>` broadcast and refreshes the server component
 * on any new message (debounced) — same idea as matches-realtime.tsx.
 */
export function ConversationList({ initial }: { initial: ConversationSummary[] }) {
  const router = useRouter();
  const key = initial.map((c) => c.conversation_id).join(",");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!key) return;
    const ids = key.split(",");
    const supabase = createClient();
    const refresh = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => router.refresh(), 300);
    };
    const channels = ids.map((id) =>
      supabase.channel(`conv:${id}`).on("broadcast", { event: "message" }, refresh).subscribe(),
    );
    return () => {
      if (timer.current) clearTimeout(timer.current);
      channels.forEach((ch) => void supabase.removeChannel(ch));
    };
  }, [key, router]);

  if (initial.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border px-6 py-12 text-center">
        <p className="text-sm font-medium">No conversations yet</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Message a player you’ve played or challenged.
        </p>
        {/* [F15] Link straight to the players list instead of describing where to go. */}
        <Link
          href="/players"
          className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
        >
          Find a player →
        </Link>
      </div>
    );
  }

  return (
    <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-2xl border border-border">
      {initial.map((c) => {
        const name =
          c.type === "dm"
            ? c.other?.display_name ?? "Player"
            : c.type === "match"
              ? "Match chat"
              : c.title ?? "Group";
        const preview = c.last_message
          ? c.last_message.body ?? "Message removed"
          : "No messages yet";
        return (
          // [F13] Unread reads as rail + tint + weight — legible without relying on weight alone.
          <li
            key={c.conversation_id}
            className={cn(
              "border-l-[3px]",
              c.unread > 0 ? "border-l-primary bg-primary/5" : "border-l-transparent",
            )}
          >
            <Link
              href={`/messages/${c.conversation_id}`}
              className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50"
            >
              <Initials name={name} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span
                      className={cn(
                        "truncate text-sm",
                        c.unread > 0 ? "font-semibold" : "font-medium",
                      )}
                    >
                      {name}
                    </span>
                    <TypeChip type={c.type} />
                  </div>
                  {c.last_at ? (
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {formatWhen(c.last_at)}
                    </span>
                  ) : null}
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={cn(
                      "truncate text-sm",
                      c.unread > 0 ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {preview}
                  </span>
                  {c.unread > 0 ? (
                    <span className="grid min-w-5 shrink-0 place-items-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground">
                      {c.unread > 99 ? "99+" : c.unread}
                    </span>
                  ) : null}
                </div>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** [F13] What kind of conversation this is — so "Match chat" isn't the only cue. */
function TypeChip({ type }: { type: ConversationType }) {
  if (type === "match")
    return (
      <span className="shrink-0 rounded bg-chart-5/10 px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-wide text-chart-5 uppercase">
        From match
      </span>
    );
  if (type === "group")
    return (
      <span className="shrink-0 rounded bg-forest/10 px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-wide text-forest uppercase">
        Group
      </span>
    );
  return null;
}

function Initials({ name }: { name: string }) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const initials =
    parts.length === 0 ? "?" : (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
  return (
    <span className="grid size-10 shrink-0 place-items-center rounded-full bg-muted font-mono text-xs font-bold text-muted-foreground">
      {initials}
    </span>
  );
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const days = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  if (days < 7) return d.toLocaleDateString([], { weekday: "short" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}
