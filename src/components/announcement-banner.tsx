"use client";

import { useState } from "react";
import Link from "next/link";

import { createClient } from "@/lib/supabase/client";
import type { Announcement } from "@/lib/supabase/messages";
import { cn } from "@/lib/utils";

/**
 * Dismissible dashboard banner for the most recent unread announcement. Dismiss
 * marks it read (mark_announcement_read) so it won't reappear. Critical notices get
 * a heavier treatment; promo ones are the softer gold. The promo mute is already
 * applied server-side by list_announcements, so anything passed here is meant to show.
 */
export function AnnouncementBanner({ announcement }: { announcement: Announcement }) {
  const [hidden, setHidden] = useState(false);
  const critical = announcement.severity === "critical";

  function dismiss() {
    setHidden(true); // optimistic
    const supabase = createClient();
    void supabase.rpc("mark_announcement_read", { p_announcement_id: announcement.id });
  }

  if (hidden) return null;

  return (
    <div
      className={cn(
        "relative rounded-2xl border px-4 py-3 pr-10",
        critical
          ? "border-destructive/40 bg-destructive/10"
          : "border-[var(--swedish-gold)]/55 bg-[var(--swedish-gold)]/10",
      )}
    >
      <div
        className={cn(
          "eyebrow",
          critical ? "text-destructive" : "text-[var(--gold-ink)]",
        )}
      >
        {critical ? "⚠ IMPORTANT" : "📣 ANNOUNCEMENT"}
      </div>
      <div className="mt-1 text-sm font-semibold">{announcement.title}</div>
      <p className="mt-0.5 line-clamp-3 whitespace-pre-wrap text-sm text-muted-foreground">
        {announcement.body}
      </p>
      <Link href="/announcements" className="mt-1 inline-block text-xs font-medium text-primary hover:underline">
        See all announcements →
      </Link>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={dismiss}
        className="absolute right-2 top-2 grid size-7 place-items-center rounded-lg text-muted-foreground hover:bg-foreground/5"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="6" y1="6" x2="18" y2="18" />
          <line x1="18" y1="6" x2="6" y2="18" />
        </svg>
      </button>
    </div>
  );
}
