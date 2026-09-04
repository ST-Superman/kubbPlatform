import { notFound, redirect } from "next/navigation";

import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { getPlayerProfile, getPlayerStats } from "@/lib/supabase/matches";
import { MatchHistory } from "@/components/match-history";
import { ChallengeButton } from "@/components/challenge-button";
import { StatsBlock } from "@/components/stats-block";
import { InfoDot } from "@/components/info-dot";
import { ctaClass } from "@/components/brand";

const firstName = (n: string) => n.split(/\s+/)[0];

// Opponents excluded from the visible match history (mirrors the Stats section's
// test-player exclusion). These are managed test accounts, not real players.
const TEST_OPPONENTS = new Set(["Test User 1", "Test User 2"]);

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
  const stats = await getPlayerStats(handle);

  const { player, record, matches } = profile;
  const memberSince = new Date(player.created_at).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
  });
  const played = record.wins + record.losses;
  const winRate = played > 0 ? Math.round((record.wins / played) * 100) : 0;
  // Only decided matches count toward the last-5 form line (skip live/lag).
  const last5 = matches
    .filter((m) => m.result !== null)
    .slice(0, 5)
    .reverse();
  const isSelf = player.user_id === user.id;

  // Match History shows only completed matches (a decided result), excluding the
  // managed test accounts — same exclusion the Stats section applies.
  const historyMatches = matches.filter(
    (m) => m.result !== null && !TEST_OPPONENTS.has(m.opponent ?? ""),
  );

  return (
    <div className="mx-auto flex max-w-md flex-col gap-3 px-4 py-6">
      <span className="eyebrow px-1 text-[10px] tracking-[1.5px] text-muted-foreground">
        PLAYER CARD
      </span>
      {/* Hero card */}
      <div className="flex flex-col gap-3.5 rounded-2xl border border-border bg-card p-4 shadow-[0_1px_2px_rgba(19,24,43,.04),0_4px_10px_rgba(19,24,43,.04)]">
        <div className="flex items-center gap-3.5">
          <div className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-full bg-[#D5C8B5] font-mono text-lg font-bold text-[#13254A]">
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
            <div className="eyebrow mt-1 text-[10px] tracking-[1.3px] text-muted-foreground">
              RECORD
            </div>
          </div>
        </div>

        {/* Stats footer */}
        <div className="flex items-center gap-3.5 border-t border-foreground/10 pt-3.5">
          <div>
            <div className="eyebrow text-[10px] tracking-[1.2px] text-muted-foreground">WIN RATE</div>
            <div className="display mt-0.5 text-[20px] italic tracking-[-0.5px] text-primary tabular-nums">
              {winRate}%
            </div>
          </div>
          <div>
            <div className="eyebrow text-[10px] tracking-[1.2px] text-muted-foreground">PLAYED</div>
            <div className="display mt-0.5 text-[20px] italic tracking-[-0.5px] tabular-nums">
              {played}
            </div>
          </div>
          <div className="flex-1" />
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-1">
              <span className="eyebrow text-[10px] tracking-[1.2px] text-muted-foreground">LAST 5</span>
              <InfoDot title="Last 5">Your 5 most recent completed matches, shown oldest → latest.</InfoDot>
            </div>
            {last5.length > 0 ? (
              <>
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
                <span className="font-mono text-[8px] uppercase tracking-[1px] text-muted-foreground/70">
                  → latest
                </span>
              </>
            ) : (
              <div className="text-[11px] text-muted-foreground">—</div>
            )}
          </div>
        </div>
      </div>

      {isSelf ? (
        <div className="grid grid-cols-2 gap-2">
          <Link href="/profile" className={ctaClass("outline")}>
            Edit profile
          </Link>
          <Link href="/matches" className={ctaClass("secondary")}>
            Go to matches
          </Link>
        </div>
      ) : (
        <ChallengeButton playerId={player.id} label={firstName(player.display_name)} />
      )}

      {/* Singles throwing stats */}
      <div className="mt-1 flex flex-col gap-2.5 rounded-2xl border border-border bg-card p-4 shadow-[0_1px_2px_rgba(19,24,43,.04),0_4px_10px_rgba(19,24,43,.04)]">
        <span className="flex items-center gap-1.5">
          <span className="eyebrow text-[10px] tracking-[1.5px] text-muted-foreground">
            SINGLES STATS
            {stats && stats.matches_counted > 0 ? ` · BASED ON ${stats.matches_counted} MATCH${stats.matches_counted === 1 ? "" : "ES"}` : ""}
          </span>
          <InfoDot title="Singles stats">Based on singles (1v1) matches only — team and doubles matches aren&apos;t included, so this can differ from your total played.</InfoDot>
        </span>
        {stats && stats.matches_counted > 0 ? (
          <StatsBlock metrics={stats.metrics} />
        ) : (
          <p className="text-sm text-muted-foreground">
            No completed singles matches yet — stats appear once a 1v1 match is finished.
          </p>
        )}
      </div>

      {/* Teams */}
      {stats && stats.teams.length > 0 ? (
        <div className="flex flex-col gap-2">
          <span className="eyebrow text-[10px] tracking-[1.5px] text-muted-foreground">TEAMS</span>
          {stats.teams.map((t) => (
            <Link
              key={t.id}
              href={`/teams/${t.id}`}
              className="flex items-center justify-between rounded-2xl border border-border bg-card px-4 py-3 text-sm font-semibold shadow-sm transition-colors hover:bg-secondary"
            >
              <span className="truncate">{t.name}</span>
              <span className="eyebrow text-[9px] text-muted-foreground">VIEW STATS →</span>
            </Link>
          ))}
        </div>
      ) : null}

      <div className="mt-1 flex flex-col gap-2">
        <span className="eyebrow text-[10px] tracking-[1.5px] text-muted-foreground">
          MATCH HISTORY{historyMatches.length > 0 ? ` · ${historyMatches.length} PLAYED` : ""}
        </span>
        {historyMatches.length === 0 ? (
          <p className="text-sm text-muted-foreground">No completed matches yet.</p>
        ) : (
          <MatchHistory matches={historyMatches} isSelf={isSelf} />
        )}
      </div>
    </div>
  );
}
