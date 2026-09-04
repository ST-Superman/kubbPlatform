"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

/**
 * Keeps the Matches/Dashboard lists live: subscribes to the public `match:<id>`
 * broadcast topic for each active match (the same topic the match page listens on,
 * pushed by the broadcast_match_state triggers) and refreshes the server components
 * when any of them changes — so a match slides between "Your Turn" and "Waiting for
 * opponent" the moment the opponent moves, without a manual reload. Renders nothing.
 */
export function MatchesRealtime({ matchIds }: { matchIds: string[] }) {
  const router = useRouter();
  // Stable dependency: only re-subscribe when the set of active matches changes.
  const key = matchIds.join(",");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!key) return;
    const ids = key.split(",");
    const supabase = createClient();

    // Coalesce bursts (a turn touches turns + games + matches) into one refresh.
    const refresh = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => router.refresh(), 300);
    };

    const channels = ids.map((id) =>
      supabase.channel(`match:${id}`).on("broadcast", { event: "state" }, refresh).subscribe(),
    );

    return () => {
      if (timer.current) clearTimeout(timer.current);
      channels.forEach((ch) => supabase.removeChannel(ch));
    };
  }, [key, router]);

  return null;
}
