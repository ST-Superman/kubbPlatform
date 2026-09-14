"use client";

import { useEffect, useRef } from "react";

import { createClient } from "@/lib/supabase/client";
import type { Announcement } from "@/lib/supabase/messages";
import { cn } from "@/lib/utils";

/**
 * The announcements list. Marks any unread items read on mount (fire-and-forget) so
 * the dashboard banner + nav clear once the user has seen the page.
 */
export function AnnouncementsView({ announcements }: { announcements: Announcement[] }) {
  const marked = useRef(false);

  useEffect(() => {
    if (marked.current) return;
    marked.current = true;
    const unread = announcements.filter((a) => !a.read);
    if (unread.length === 0) return;
    const supabase = createClient();
    unread.forEach((a) => {
      void supabase.rpc("mark_announcement_read", { p_announcement_id: a.id });
    });
  }, [announcements]);

  if (announcements.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border px-6 py-12 text-center">
        <p className="text-sm font-medium">No announcements</p>
        <p className="mt-1 text-sm text-muted-foreground">Nothing to share right now.</p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {announcements.map((a) => {
        const critical = a.severity === "critical";
        return (
          <li
            key={a.id}
            className={cn(
              "rounded-2xl border px-4 py-3",
              critical
                ? "border-destructive/40 bg-destructive/5"
                : "border-border bg-card",
            )}
          >
            <div className="flex items-center justify-between gap-3">
              <span
                className={cn(
                  "eyebrow",
                  critical ? "text-destructive" : "text-muted-foreground",
                )}
              >
                {critical ? "⚠ IMPORTANT" : "ANNOUNCEMENT"}
              </span>
              {a.published_at ? (
                <span className="text-[11px] text-muted-foreground">
                  {new Date(a.published_at).toLocaleDateString([], {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
              ) : null}
            </div>
            <div className="mt-1 text-base font-semibold">{a.title}</div>
            <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{a.body}</p>
          </li>
        );
      })}
    </ul>
  );
}
