import { type MatchSummary } from "@/lib/supabase/matches";
import { MatchRow } from "@/components/match-row";

const ACTIVE = new Set(["created", "live"]);

/** Oldest-first: the player has been waiting longest on the matches at the top. */
const byOldest = (a: MatchSummary, b: MatchSummary) =>
  a.created_at.localeCompare(b.created_at);
/** Newest-first for the completed archive. */
const byNewest = (a: MatchSummary, b: MatchSummary) =>
  b.created_at.localeCompare(a.created_at);

function Section({ label, rows }: { label: string; rows: MatchSummary[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <span className="eyebrow text-[10px] tracking-[1.5px] text-muted-foreground">{label}</span>
      {rows.map((m) => (
        <MatchRow key={m.match_id} row={m} />
      ))}
    </div>
  );
}

/**
 * Actionable-first match lists shared by the Matches and Dashboard screens:
 * "Your Turn" (matches waiting on the signed-in player) above "Waiting for opponent",
 * both oldest-first. Pass `showCompleted` to also append the finished/abandoned archive.
 */
export function TurnSections({
  matches,
  showCompleted = false,
}: {
  matches: MatchSummary[];
  showCompleted?: boolean;
}) {
  const yourTurn = matches.filter((m) => ACTIVE.has(m.status) && m.turn === "you").sort(byOldest);
  const waiting = matches
    .filter((m) => ACTIVE.has(m.status) && m.turn === "opponent")
    .sort(byOldest);
  const completed = showCompleted
    ? matches.filter((m) => m.status === "finished" || m.status === "abandoned").sort(byNewest)
    : [];

  return (
    <>
      <Section label="YOUR TURN:" rows={yourTurn} />
      <Section label="WAITING FOR OPPONENT:" rows={waiting} />
      {showCompleted ? <Section label="COMPLETED:" rows={completed} /> : null}
    </>
  );
}
