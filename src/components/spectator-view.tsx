"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { createClient } from "@/lib/supabase/client";
import { type GameState, type MatchState, type Side } from "@/lib/supabase/matches";
import { PitchCard, TurnLog } from "@/components/match-client";
import { cn } from "@/lib/utils";

const SIDE_COLOR: Record<Side, string> = {
  A: "var(--swedish-blue)",
  B: "var(--dark-forest)",
};
const firstName = (n: string | null | undefined) => (n ?? "—").split(/\s+/)[0];

const NEUTRAL: GameState = {
  baseline: { A: 5, B: 5 },
  field: { A: 0, B: 0 },
  advantage: { A: null, B: null },
  king_shots: { A: 0, B: 0 },
  winner: null,
  next_side: null,
  seq: 1,
  round_cap: 2,
};

export function SpectatorView({
  token,
  initial,
}: {
  token: string;
  initial: MatchState;
}) {
  const [state, setState] = useState<MatchState>(initial);

  useEffect(() => {
    const supabase = createClient();
    const refetch = async () => {
      const { data } = await supabase.rpc("match_state_by_token", { p_token: token });
      const d = data as (MatchState & { error?: string }) | null;
      if (d && !d.error) setState(d);
    };
    const channel = supabase
      .channel(`match:${state.match_id}`)
      .on("broadcast", { event: "state" }, () => void refetch())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [token, state.match_id]);

  const parts = state.participants ?? {};
  const gamesWon = state.games_won ?? { A: 0, B: 0 };
  const s = state.current_state ?? NEUTRAL;
  const nameOf = (x: Side) => parts[x]?.display_name ?? `Side ${x}`;
  const active = state.status === "live" && state.current_state ? s.next_side : null;
  const line =
    state.status === "created"
      ? "Waiting to start"
      : state.status === "finished"
        ? `${nameOf(gamesWon.A >= state.race_to ? "A" : "B")} won`
        : active
          ? `${firstName(nameOf(active))} to throw`
          : "";

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4 px-4 py-8">
      <div className="flex items-center justify-between">
        <span className="eyebrow text-muted-foreground">SPECTATING · LIVE</span>
        <Link href="/" className="eyebrow text-muted-foreground hover:underline">
          Kubb Portal
        </Link>
      </div>

      <div className="rounded-2xl border border-foreground/10 bg-card p-4 shadow-sm">
        <div className="relative flex items-center justify-between gap-3">
          {(["A", "B"] as const).map((x, i) => (
            <div key={x} className={cn("flex min-w-0 items-center gap-2", i === 1 && "flex-row-reverse text-right")}>
              <span className="size-2.5 flex-none rounded-full" style={{ background: SIDE_COLOR[x] }} />
              <span className="truncate text-sm font-semibold">{firstName(nameOf(x))}</span>
            </div>
          ))}
          <div className="display absolute left-1/2 -translate-x-1/2 text-2xl">
            {gamesWon.A}–{gamesWon.B}
          </div>
        </div>
        <div className="eyebrow mt-1 text-center text-muted-foreground">
          RACE TO {state.race_to}
          {line ? ` · ${line}` : ""}
        </div>
      </div>

      <PitchCard s={s} nameOf={nameOf} done={state.status === "finished"} />

      <div className="rounded-[18px] border border-foreground/10 bg-card p-4 shadow-sm">
        <TurnLog
          turns={state.current_turns ?? []}
          games={state.games ?? []}
          nameOf={nameOf}
          readOnly
        />
      </div>
    </div>
  );
}
