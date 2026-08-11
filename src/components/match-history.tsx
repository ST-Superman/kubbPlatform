"use client";

import { useState } from "react";

import { type ProfileMatch } from "@/lib/supabase/matches";
import { MatchRow } from "@/components/match-row";
import { WatchMatchRow } from "@/components/watch-match-row";

const CAP = 10;

/**
 * Match history list, capped at CAP with a "View all · N" expander.
 * On your own profile rows link to the full match page; on someone else's they
 * open the read-only /watch view (you're not a participant).
 */
export function MatchHistory({
  matches,
  isSelf,
}: {
  matches: ProfileMatch[];
  isSelf: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? matches : matches.slice(0, CAP);

  return (
    <>
      {shown.map((m) =>
        isSelf ? (
          <MatchRow key={m.match_id} row={m} />
        ) : (
          <WatchMatchRow key={m.match_id} row={m} />
        ),
      )}
      {!expanded && matches.length > CAP ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="eyebrow mt-1 self-center rounded-full border border-border px-4 py-2 text-[10px] tracking-[1.3px] text-muted-foreground transition-colors hover:bg-muted"
        >
          View all · {matches.length}
        </button>
      ) : null}
    </>
  );
}
