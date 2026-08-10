import { notFound, redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getPlayerProfile } from "@/lib/supabase/matches";
import { MatchRow } from "@/components/match-row";
import { ChallengeButton } from "@/components/challenge-button";

const firstName = (n: string) => n.split(/\s+/)[0];

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?redirectTo=/u/${handle}`);

  const profile = await getPlayerProfile(handle);
  if (!profile) notFound();

  const { player, record, matches } = profile;
  const memberSince = new Date(player.created_at).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
  });
  const played = record.wins + record.losses;
  const winRate = played > 0 ? Math.round((record.wins / played) * 100) : 0;
  const last5 = matches.slice(0, 5).reverse();
  const isSelf = player.user_id === user.id;

  return (
    <div className="mx-auto flex max-w-md flex-col gap-3 px-4 py-6">
      {/* Hero card */}
      <div className="flex flex-col gap-3.5 rounded-2xl border border-border bg-card p-4 shadow-[0_1px_2px_rgba(19,24,43,.04),0_4px_10px_rgba(19,24,43,.04)]">
        <div className="flex items-center gap-3.5">
          <div
            className={
              isSelf
                ? "grid size-14 shrink-0 place-items-center overflow-hidden rounded-full bg-secondary font-mono text-lg font-bold text-secondary-foreground"
                : "grid size-14 shrink-0 place-items-center overflow-hidden rounded-full bg-[#D5C8B5] font-mono text-lg font-bold text-[#13254A]"
            }
          >
            {player.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={player.avatar_url} alt="" className="h-full w-full object-cover" />
            ) : (
              player.display_name.charAt(0).toUpperCase()
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[16px] font-semibold">{player.display_name}</p>
            <p className="truncate font-mono text-[11px] text-muted-foreground">@{player.handle}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">Member since {memberSince}</p>
          </div>
          <div className="shrink-0 text-right">
            <div className="display text-[28px] leading-none italic tracking-[-1px] tabular-nums">
              {record.wins}–{record.losses}
            </div>
            <div className="eyebrow mt-1 text-[9px] tracking-[1.3px] text-muted-foreground">
              RECORD
            </div>
          </div>
        </div>

        {/* Stats footer */}
        <div className="flex items-center gap-3.5 border-t border-foreground/10 pt-3.5">
          <div>
            <div className="eyebrow text-[8.5px] tracking-[1.2px] text-muted-foreground">WIN RATE</div>
            <div className="display mt-0.5 text-[20px] italic tracking-[-0.5px] text-primary tabular-nums">
              {winRate}%
            </div>
          </div>
          <div>
            <div className="eyebrow text-[8.5px] tracking-[1.2px] text-muted-foreground">PLAYED</div>
            <div className="display mt-0.5 text-[20px] italic tracking-[-0.5px] tabular-nums">
              {played}
            </div>
          </div>
          <div className="flex-1" />
          <div className="flex flex-col items-end gap-1">
            <div className="eyebrow text-[8.5px] tracking-[1.2px] text-muted-foreground">LAST 5</div>
            {last5.length > 0 ? (
              <div className="flex gap-1">
                {last5.map((m, i) => {
                  const won = m.result === "won";
                  return (
                    <span
                      key={`${m.match_id}-${i}`}
                      className={
                        won
                          ? "grid size-5 place-items-center rounded-full bg-[var(--dark-forest)] font-mono text-[9px] font-bold text-white dark:bg-[var(--chart-3)]"
                          : "grid size-5 place-items-center rounded-full border border-border font-mono text-[9px] font-bold text-muted-foreground"
                      }
                    >
                      {won ? "W" : "L"}
                    </span>
                  );
                })}
              </div>
            ) : (
              <div className="text-[11px] text-muted-foreground">—</div>
            )}
          </div>
        </div>
      </div>

      {!isSelf ? (
        <ChallengeButton playerId={player.id} label={firstName(player.display_name)} />
      ) : null}

      <div className="mt-1 flex flex-col gap-2">
        <span className="eyebrow text-[10px] tracking-[1.5px] text-muted-foreground">
          MATCH HISTORY{played > 0 ? ` · ${played} PLAYED` : ""}
        </span>
        {matches.length === 0 ? (
          <p className="text-sm text-muted-foreground">No matches yet.</p>
        ) : (
          matches.map((m) => <MatchRow key={m.match_id} row={m} />)
        )}
      </div>
    </div>
  );
}
