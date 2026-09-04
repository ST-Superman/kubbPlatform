import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/profiles";
import { getMyMatches } from "@/lib/supabase/matches";
import { getMyChallenges } from "@/lib/supabase/challenges";
import { ChallengeNotice } from "@/components/challenge-notice";
import { TurnSections } from "@/components/turn-sections";
import { MatchesRealtime } from "@/components/matches-realtime";
import { ctaClass } from "@/components/brand";

const firstName = (n: string | null | undefined) => (n ?? "there").split(/\s+/)[0];

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Belt-and-suspenders: middleware already gates this route.
  if (!user) redirect("/login?redirectTo=/dashboard");

  const [profile, matches] = await Promise.all([getMyProfile(), getMyMatches()]);
  const challenges = await getMyChallenges();

  // Derive the season line from finished matches (newest-first list).
  const finished = matches.filter((m) => m.result === "won" || m.result === "lost");
  const wins = finished.filter((m) => m.result === "won").length;
  const losses = finished.length - wins;
  const played = finished.length;
  const winRate = played > 0 ? Math.round((wins / played) * 100) : 0;

  // Streak = consecutive wins from the most recent finished match backward.
  let streak = 0;
  for (const m of finished) {
    if (m.result === "won") streak++;
    else break;
  }

  // Last five results, oldest-to-newest for left-to-right dots.
  const last5 = finished.slice(0, 5).reverse();

  const activeIds = matches
    .filter((m) => m.status === "created" || m.status === "live")
    .map((m) => m.match_id);

  return (
    <div className="mx-auto max-w-2xl">
      {/* Navy scoreboard hero (theme-invariant hex) */}
      <div className="flex flex-col gap-3.5 bg-[#0D1726] px-5 pt-[22px] pb-5 dark:border-b dark:border-white/[0.08]">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="eyebrow tracking-[1.6px] text-[var(--swedish-gold)]">
              YOUR GAME{profile ? ` · @${profile.handle}` : ""}
            </div>
            <h1 className="display mt-2 text-[27px] leading-[1.1] italic tracking-[-0.8px] text-white">
              Welcome back, {firstName(profile?.display_name)}
            </h1>
          </div>
          {profile ? (
            <Link
              href={`/u/${profile.handle}`}
              aria-label="View your player card"
              className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-full bg-[#D5C8B5] font-mono text-2xl font-bold text-[#13254A] ring-2 ring-white/15 transition-transform active:scale-95"
            >
              {profile.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
              ) : (
                profile.display_name.charAt(0).toUpperCase()
              )}
            </Link>
          ) : null}
        </div>

        <div className="flex items-end gap-6">
          <div>
            <div className="display text-[52px] leading-none italic tracking-[-2.5px] text-white tabular-nums">
              {wins}–{losses}
            </div>
            <div className="eyebrow mt-1.5 text-[9.5px] tracking-[1.4px] text-white/55">
              ALL TIME RECORD
            </div>
          </div>
          <div>
            <div className="display text-[28px] leading-none italic tracking-[-1px] text-white tabular-nums">
              {winRate}%
            </div>
            <div className="eyebrow mt-1.5 text-[9.5px] tracking-[1.4px] text-white/55">
              WIN RATE
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {streak >= 2 ? (
            <div className="inline-flex items-center gap-1.5 rounded-full border border-[var(--swedish-gold)]/40 bg-[var(--swedish-gold)]/[0.14] px-2.5 py-1.5">
              <span className="text-[11px]">🔥</span>
              <span className="font-mono text-[9px] font-bold tracking-[1.2px] text-[var(--swedish-gold)]">
                {streak}-MATCH WIN STREAK
              </span>
            </div>
          ) : null}
          {last5.length > 0 ? (
            <div className="flex items-center gap-2">
              <span className="eyebrow text-[9px] tracking-[1.2px] text-white/55">LAST 5</span>
              <div className="flex gap-1.5">
              {last5.map((m, i) => {
                const won = m.result === "won";
                return (
                  <span
                    key={`${m.match_id}-${i}`}
                    className={
                      won
                        ? "grid size-5 place-items-center rounded-full bg-[#1F6646] font-mono text-[9px] font-bold text-white dark:bg-[#3ca66e]"
                        : "grid size-5 place-items-center rounded-full bg-white/[0.08] font-mono text-[9px] font-bold text-white/55"
                    }
                  >
                    {won ? "W" : "L"}
                  </span>
                );
              })}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-col gap-3 px-4 py-4">
        <MatchesRealtime matchIds={activeIds} />
        <ChallengeNotice initial={challenges} />

        <TurnSections matches={matches} />

        <Link href="/matches" className={ctaClass("primary")}>
          NEW MATCH
        </Link>
      </div>
    </div>
  );
}
