"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import { MatchRowContent, ROW_CLASS, type MatchRowData } from "@/components/match-row";

/**
 * Non-participant match row: opens the read-only /watch view. Mints/reuses the match's
 * spectate token on click (lazy — only for matches actually opened).
 */
export function WatchMatchRow({ row }: { row: MatchRowData }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function open() {
    start(async () => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("get_match_watch_token", {
        p_match_id: row.match_id,
      });
      const token = (data as { token?: string } | null)?.token;
      if (error || !token) {
        toast.error("Couldn't open this match.");
        return;
      }
      router.push(`/watch/${token}`);
    });
  }

  return (
    <button type="button" onClick={open} disabled={pending} className={ROW_CLASS}>
      <MatchRowContent row={row} />
    </button>
  );
}
