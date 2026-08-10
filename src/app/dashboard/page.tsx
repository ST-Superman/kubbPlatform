import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/profiles";
import { getMyMatches, getMatchState, type Side } from "@/lib/supabase/matches";
import { MatchRow } from "@/components/match-row";
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

  const recent = matches.slice(0, 3);

  // Resume card: the one open match, with live details fetched once.
  const openMatch = matches.find((m) => m.status === "live" || m.status === "created");
  const liveState = openMatch ? await getMatchState(openMatch.match_id) : null;

  let resume: {
    id: string;
    eyebrow: string;
    opponent: string;
    mine: number;
    theirs: number;
  } | null = null;
  if (openMatch && liveState) {
    const parts = liveState.participants ?? {};
    const mySide: Side | null =
      (["A", "B"] as const).find((sd) => parts[sd]?.user_id === user.id) ?? null;
    const other: Side = mySide === "A" ? "B" : "A";
    const gw = liveState.games_won ?? { A: 0, B: 0 };
    const gameNo = Math.max(liveState.games?.length ?? 0, 1);
    const statusWord = liveState.status === "live" ? "LIVE NOW" : "LAG PHASE";
    let turn = "IN PROGRESS";
    if (liveState.status === "live" && liveState.current_state) {
      const next = liveState.current_state.next_side;
      turn =
        next && mySide && next === mySide
          ? "YOU'RE UP"
          : `${firstName(openMatch.opponent).toUpperCase()}'S TURN`;
    } else if (liveState.status === "created") {
      const myLag = mySide === "A" ? liveState.lag?.a : liveState.lag?.b;
      turn = mySide == null || myLag == null ? "YOUR LAG" : "WAITING ON LAG";
    }
    resume = {
      id: openMatch.match_id,
      eyebrow: `${statusWord} · GAME ${gameNo} · ${turn}`,
      opponent: openMatch.opponent ?? "your opponent",
      mine: mySide ? gw[mySide] : gw.A,
      theirs: mySide ? gw[other] : gw.B,
    };
  }

  const coachLine =
    streak >= 2
      ? `${streak} straight — keep the momentum going.`
      : played === 0
        ? "Your first match is one tap away."
        : finished[0]?.result === "won"
          ? "Nice win — line up the next one."
          : "New match, fresh start.";

  return (
    <div className="mx-auto max-w-2xl">
      {/* Navy scoreboard hero (theme-invariant hex) */}
      <div className="flex flex-col gap-3.5 bg-[#0D1726] px-5 pt-[22px] pb-5 dark:border-b dark:border-white/[0.08]">
        <div className="eyebrow tracking-[1.6px] text-[var(--swedish-gold)]">
          YOUR GAME{profile ? ` · @${profile.handle}` : ""}
        </div>
        <h1 className="display text-[27px] leading-[1.1] italic tracking-[-0.8px] text-white">
          Welcome back, {firstName(profile?.display_name)}
        </h1>

        <div className="flex items-end gap-6">
          <div>
            <div className="display text-[52px] leading-none italic tracking-[-2.5px] text-white tabular-nums">
              {wins}–{losses}
            </div>
            <div className="eyebrow mt-1.5 text-[9.5px] tracking-[1.4px] text-white/55">
              SEASON RECORD
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
          ) : null}
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-col gap-3 px-4 py-4">
        {resume ? (
          <Link
            href={`/matches/${resume.id}`}
            className="flex items-center gap-3 rounded-2xl border-[1.5px] border-[var(--swedish-gold)]/55 bg-[var(--swedish-gold)]/10 px-4 py-3.5 transition-transform active:scale-[0.97]"
          >
            <div className="min-w-0 flex-1">
              <div className="font-mono text-[9px] font-bold tracking-[1.3px] text-[var(--gold-ink)]">
                {resume.eyebrow}
              </div>
              <div className="mt-0.5 text-[14px] font-semibold">You vs {resume.opponent}</div>
            </div>
            <div className="display text-[22px] italic tracking-[-0.5px] tabular-nums">
              {resume.mine}–{resume.theirs}
            </div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--gold-ink)" strokeWidth="2.4">
              <path d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        ) : null}

        <Link href="/matches" className={ctaClass("primary")}>
          NEW MATCH
        </Link>

        <div className="mt-1 flex items-baseline justify-between">
          <span className="eyebrow text-[10px] tracking-[1.5px] text-muted-foreground">
            RECENT MATCHES
          </span>
          <Link href="/matches" className="text-[12px] font-semibold text-primary">
            All matches →
          </Link>
        </div>

        {recent.length > 0 ? (
          <div className="flex flex-col gap-2">
            {recent.map((m) => (
              <MatchRow key={m.match_id} row={m} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No matches yet — tap New match to play your first.
          </p>
        )}

        <p className="px-0.5 pt-1.5 pb-1 text-[12px] italic text-muted-foreground">{coachLine}</p>
      </div>
    </div>
  );
}
