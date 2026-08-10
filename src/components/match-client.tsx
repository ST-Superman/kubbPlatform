"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import {
  type GameState,
  type MatchState,
  type Side,
  type TurnRow,
} from "@/lib/supabase/matches";
import {
  ADV_LINE_OPTIONS,
  LAG_OPTIONS,
  advLineLabel,
  buildErrors,
  emptyDraft,
  maxBaselineHits,
  turnText,
  type TurnDraft,
} from "@/lib/kubb-rules";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const SIDE_COLOR: Record<Side, string> = {
  A: "var(--swedish-blue)",
  B: "var(--dark-forest)",
};
const opp = (x: Side): Side => (x === "A" ? "B" : "A");
const firstName = (n: string | null | undefined) => (n ?? "—").split(/\s+/)[0];

const TURN_ERRORS: Record<string, string> = {
  batons_over_cap: "Too many batons for this round's cap.",
  no_batons: "Enter at least one baton (or an early-king foul).",
  field_batons_missing: "Field kubbs went down — record the batons that cleared them.",
  field_left_range: "Field kubbs left is out of range.",
  field_blocks_baseline: "Field kubbs still standing — no baseline or king throws this turn.",
  advantage_line_required: "Set the advantage line for the kubbs left standing.",
  double_needs_field: "A base-kubb double needs a field kubb on the board.",
  hits_exceed_batons: "Baseline hits can't exceed batons thrown at the baseline.",
  baseline_over_remaining: "Not that many baseline kubbs remain (double counts as one).",
  baseline_clear_use_king_shots: "Baseline is clear — throws at the king are king shots.",
  penalty_range: "Penalty kubbs out of range.",
  king_too_early_range: "King shots are legal only after all field AND baseline kubbs are down.",
  king_hit_needs_shot: "A king hit needs at least one king shot.",
  king_flags_conflict: "Pick one — king hit (win) or early king (foul).",
  game_over: "This game is already finished.",
  already_scored: "Someone already scored this turn — it will refresh.",
  forbidden: "It's not your turn to score.",
  not_in_lag: "Lag is already done for this match.",
};
const errText = (m: string | undefined) => {
  const code = m?.match(/[a-z_]+/)?.[0];
  return (code && TURN_ERRORS[code]) || m || "Something went wrong.";
};

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

type SheetName = "turn" | "lag" | "log" | null;

export function MatchClient({
  matchId,
  initial,
}: {
  matchId: string;
  initial: MatchState;
  myUserId: string;
}) {
  const [state, setState] = useState<MatchState>(initial);
  const [pending, start] = useTransition();
  const [confirmSeq, setConfirmSeq] = useState<number | null>(null);
  const [sheet, setSheet] = useState<SheetName>(null);

  useEffect(() => {
    const supabase = createClient();
    const refetch = async () => {
      const { data } = await supabase.rpc("match_state", { p_match_id: matchId });
      if (data) setState(data as MatchState);
    };
    const channel = supabase
      .channel(`match:${matchId}`)
      .on("broadcast", { event: "state" }, () => void refetch())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [matchId]);

  function rpc(fn: string, args: Record<string, unknown>, onOk?: () => void) {
    start(async () => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc(fn, args);
      if (error) {
        toast.error(errText(error.message));
        return;
      }
      if (data) setState(data as MatchState);
      onOk?.();
    });
  }

  const parts = state.participants ?? {};
  const gamesWon = state.games_won ?? { A: 0, B: 0 };
  const games = state.games ?? [];
  const turns = state.current_turns ?? [];
  const s = state.current_state ?? NEUTRAL;
  const status = state.status;
  const active: Side | null = status === "live" && state.current_state ? s.next_side : null;
  const nameOf = (x: Side) => parts[x]?.display_name ?? `Side ${x}`;
  const winnerSide: Side | null =
    status === "finished" ? (gamesWon.A >= state.race_to ? "A" : "B") : null;

  const submitLag = (side: Side, value: string) => {
    if (value) rpc("submit_lag", { p_match_id: matchId, p_side: side, p_value: value });
  };
  const submitTurn = (d: TurnDraft, onOk?: () => void) =>
    rpc(
      "submit_turn",
      {
        p_turn_id: crypto.randomUUID(),
        p_game_id: state.current_game_id,
        p_token: null,
        p_expected_seq: state.next_seq,
        p_batons_field: d.batons_field,
        p_batons_baseline: d.batons_baseline,
        p_baseline_kubbs: d.baseline_kubbs,
        p_base_kubb_double: d.base_kubb_double,
        p_penalty_kubbs: d.penalty_kubbs,
        p_field_kubbs_left: d.field_kubbs_left,
        p_advantage_line: d.field_kubbs_left > 0 ? d.advantage_line : null,
        p_king_shots: d.king_shots,
        p_king_hit: d.king_hit,
        p_king_hit_early: d.king_hit_early,
      },
      onOk,
    );
  const rewind = (seq: number) => {
    if (state.last_game_id)
      rpc("rewind_to", { p_game_id: state.last_game_id, p_seq: seq, p_token: null }, () => {
        setConfirmSeq(null);
        setSheet(null);
      });
  };

  const statusEyebrow =
    status === "created" ? "LAG PHASE" : status === "finished" ? "FINAL" : `GAME ${games.length}`;

  return (
    <div className="flex flex-col gap-6">
      {/* Header (shared) */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/matches" className="eyebrow text-muted-foreground hover:underline">
            ← Matches
          </Link>
          <h1 className="display mt-2 text-2xl font-medium sm:text-3xl">
            {nameOf("A")} <span className="text-muted-foreground">vs</span> {nameOf("B")}
          </h1>
        </div>
        <div className="text-right">
          <div className="eyebrow text-muted-foreground">
            RACE TO {state.race_to} · {statusEyebrow}
          </div>
          <div className="display text-3xl sm:text-4xl">
            {gamesWon.A} – {gamesWon.B}
          </div>
        </div>
      </div>

      {status === "finished" ? (
        <div className="rounded-2xl border border-[var(--swedish-gold)]/50 bg-[var(--swedish-gold)]/12 px-5 py-4">
          <div className="eyebrow text-[var(--gold-ink)]">🏆 MATCH OVER</div>
          <div className="display mt-0.5 text-2xl">
            {nameOf(winnerSide ?? "A")} won {Math.max(gamesWon.A, gamesWon.B)} to{" "}
            {Math.min(gamesWon.A, gamesWon.B)}.
          </div>
        </div>
      ) : null}

      {/* ===== Desktop: three columns ===== */}
      <div className="hidden gap-6 lg:flex lg:items-start">
        <Panel
          side="A"
          state={state}
          s={s}
          active={active}
          confirmSeq={confirmSeq}
          setConfirmSeq={setConfirmSeq}
          pending={pending}
          onLag={submitLag}
          onTurn={submitTurn}
          onRewind={rewind}
        />
        <div className="flex w-[380px] flex-none flex-col gap-4">
          <PitchCard s={s} nameOf={nameOf} done={status === "finished"} />
          <div className="rounded-[18px] border border-foreground/10 bg-card p-4 shadow-sm">
            <TurnLog
              turns={turns}
              games={games}
              nameOf={nameOf}
              confirmSeq={confirmSeq}
              setConfirmSeq={setConfirmSeq}
              pending={pending}
              onRewind={rewind}
            />
          </div>
        </div>
        <Panel
          side="B"
          state={state}
          s={s}
          active={active}
          confirmSeq={confirmSeq}
          setConfirmSeq={setConfirmSeq}
          pending={pending}
          onLag={submitLag}
          onTurn={submitTurn}
          onRewind={rewind}
        />
      </div>

      {/* ===== Mobile: board-forward ===== */}
      <div className="flex flex-col gap-4 pb-[calc(6rem+env(safe-area-inset-bottom))] lg:hidden">
        <MobileScore state={state} s={s} active={active} nameOf={nameOf} />
        <PitchCard s={s} nameOf={nameOf} done={status === "finished"} />
      </div>

      {/* Mobile fixed action bar */}
      {status !== "finished" ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/90 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur lg:hidden">
          <div className="mx-auto flex max-w-6xl items-center gap-2">
            {status === "created" ? (
              <button
                type="button"
                onClick={() => setSheet("lag")}
                className="h-12 flex-1 rounded-xl bg-primary text-sm font-semibold tracking-wide text-primary-foreground"
              >
                ENTER LAG
              </button>
            ) : active ? (
              <button
                type="button"
                onClick={() => setSheet("turn")}
                className="h-12 flex-1 rounded-xl bg-primary text-sm font-semibold tracking-wide text-primary-foreground"
              >
                ENTER TURN · {firstName(nameOf(active)).toUpperCase()}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setSheet("log")}
              className="h-12 rounded-xl border border-border bg-card px-4 text-sm font-medium"
            >
              Log
            </button>
          </div>
        </div>
      ) : (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/90 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur lg:hidden">
          <button
            type="button"
            onClick={() => setSheet("log")}
            className="h-12 w-full rounded-xl border border-border bg-card text-sm font-medium"
          >
            View turn log
          </button>
        </div>
      )}

      {/* Mobile sheets */}
      <Sheet open={sheet === "turn"} onClose={() => setSheet(null)} title="Enter turn">
        {active ? (
          <div className="px-4 pt-1 pb-2">
            <TurnFormBody
              key={`${state.current_game_id}-${state.next_seq}`}
              s={s}
              side={active}
              pending={pending}
              onSubmit={(d) => submitTurn(d, () => setSheet(null))}
            />
          </div>
        ) : null}
      </Sheet>

      <Sheet open={sheet === "lag"} onClose={() => setSheet(null)} title="Enter lag">
        <div className="flex flex-col gap-3 px-4 pt-1 pb-2">
          <div className="eyebrow text-muted-foreground">LAG — TOSS AT THE KING</div>
          <p className="text-xs text-muted-foreground">
            Lower is better: <code>0.1</code> touching, <code>1</code>–<code>24</code> inches,{" "}
            <code>98</code> not close, <code>99</code> knocked the king.
          </p>
          {(["A", "B"] as const).map((side) => (
            <LagRow
              key={side}
              side={side}
              name={nameOf(side)}
              stored={side === "A" ? state.lag?.a : state.lag?.b}
              pending={pending}
              onLag={submitLag}
            />
          ))}
        </div>
      </Sheet>

      <Sheet open={sheet === "log"} onClose={() => setSheet(null)} title="Turn log">
        <div className="px-4 pt-1 pb-2">
          <TurnLog
            turns={turns}
            games={games}
            nameOf={nameOf}
            confirmSeq={confirmSeq}
            setConfirmSeq={setConfirmSeq}
            pending={pending}
            onRewind={rewind}
          />
        </div>
      </Sheet>
    </div>
  );
}

/* ---------- Mobile compact scoreboard ---------- */

function MobileScore({
  state,
  s,
  active,
  nameOf,
}: {
  state: MatchState;
  s: GameState;
  active: Side | null;
  nameOf: (x: Side) => string;
}) {
  const gamesWon = state.games_won ?? { A: 0, B: 0 };
  const line =
    state.status === "created"
      ? "Enter lag to begin"
      : state.status === "finished"
        ? "Match complete"
        : active
          ? `${firstName(nameOf(active))} to throw · ${s.round_cap} batons`
          : "";
  return (
    <div className="sticky top-14 z-30 -mx-4 border-b border-border bg-background/90 px-4 py-2 backdrop-blur sm:top-16">
      <div className="relative flex items-center justify-between gap-3">
        {(["A", "B"] as const).map((x, i) => (
          <div key={x} className={cn("flex min-w-0 items-center gap-2", i === 1 && "flex-row-reverse text-right")}>
            <span className="size-2.5 flex-none rounded-full" style={{ background: SIDE_COLOR[x] }} />
            <span className="truncate text-sm font-semibold">{firstName(nameOf(x))}</span>
          </div>
        ))}
        <div className="display absolute left-1/2 -translate-x-1/2 text-xl">
          {gamesWon.A}–{gamesWon.B}
        </div>
      </div>
      {line ? <div className="eyebrow mt-1 text-center text-muted-foreground">{line}</div> : null}
    </div>
  );
}

/* ---------- Desktop panel ---------- */

function Panel({
  side,
  state,
  s,
  active,
  confirmSeq,
  setConfirmSeq,
  pending,
  onLag,
  onTurn,
  onRewind,
}: {
  side: Side;
  state: MatchState;
  s: GameState;
  active: Side | null;
  confirmSeq: number | null;
  setConfirmSeq: (n: number | null) => void;
  pending: boolean;
  onLag: (side: Side, value: string) => void;
  onTurn: (d: TurnDraft) => void;
  onRewind: (seq: number) => void;
}) {
  const parts = state.participants ?? {};
  const name = parts[side]?.display_name ?? `Side ${side}`;
  const initials = name
    .split(/\s+/)
    .map((w) => w[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const status = state.status;
  const gamesWon = state.games_won ?? { A: 0, B: 0 };
  const lagVal = side === "A" ? state.lag?.a : state.lag?.b;
  const lagLocked = status === "created" && lagVal != null;

  let chip = { label: "SPECTATING", tone: "gray" as ChipTone };
  if (status === "created")
    chip = lagLocked ? { label: "LAG LOCKED", tone: "green" } : { label: "ENTER LAG", tone: "gold" };
  else if (active === side) chip = { label: "YOUR TURN", tone: "blue" };
  else if (status === "live") chip = { label: "WAITING", tone: "gray" };
  else if (status === "finished")
    chip =
      gamesWon[side] >= state.race_to
        ? { label: "🏆 WINNER", tone: "gold" }
        : { label: "DEFEATED", tone: "gray" };

  const adv = s.advantage[side];
  const meta = [
    `SIDE ${side}`,
    state.lag?.winner_side === side ? "WON LAG" : null,
    adv != null ? `ADV LINE ${advLineLabel(adv).toUpperCase()}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const myTurns = (state.current_turns ?? []).filter((t) => t.side === side && !t.voided);
  const myLast = myTurns[myTurns.length - 1] ?? null;
  const [lagV, setLagV] = useState("");

  return (
    <div className="flex-1 overflow-hidden rounded-[22px] border border-foreground/10 bg-card shadow-sm">
      <div className="flex items-center gap-3 border-b border-border/60 px-5 py-4">
        <span
          aria-hidden
          className="grid size-10 place-items-center rounded-full font-mono text-sm font-bold text-white"
          style={{ background: SIDE_COLOR[side] }}
        >
          {initials}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{name}</div>
          <div className="eyebrow mt-0.5 text-muted-foreground">{meta}</div>
        </div>
        <Chip label={chip.label} tone={chip.tone} />
      </div>

      <div className="flex flex-col gap-4 p-5">
        <div className="grid grid-cols-4 gap-2">
          <StatTile label="MY BASELINE" value={s.baseline[side]} />
          <StatTile label="TO CLEAR" value={s.field[side]} color={s.field[side] > 0 ? "var(--orange-4m)" : undefined} />
          <StatTile label="KING SHOTS" value={s.king_shots[side]} />
          <StatTile label="GAMES" value={gamesWon[side]} color={SIDE_COLOR[side]} />
        </div>

        {status === "created" ? (
          lagLocked ? (
            <div className="rounded-2xl border border-border/60 bg-background p-4 text-sm font-medium text-[var(--dark-forest)]">
              ✓ Locked{lagVal ? ` (${lagVal})` : ""} — waiting for the other side.
            </div>
          ) : (
            <div className="flex flex-col gap-2.5 rounded-2xl border border-border/60 bg-background p-4">
              <div className="eyebrow text-muted-foreground">LAG — TOSS AT THE KING</div>
              <select value={lagV} onChange={(e) => setLagV(e.target.value)} className="w-full rounded-xl border border-input bg-card px-3 py-3 text-sm">
                {LAG_OPTIONS.map((o) => (
                  <option key={o.v} value={o.v}>
                    {o.label}
                  </option>
                ))}
              </select>
              <button type="button" disabled={pending || !lagV} onClick={() => onLag(side, lagV)} className="rounded-xl bg-primary px-4 py-3 text-sm font-medium text-primary-foreground disabled:opacity-50">
                ENTER LAG
              </button>
            </div>
          )
        ) : null}

        {active === side ? <TurnFormBody s={s} side={side} pending={pending} onSubmit={onTurn} /> : null}

        {status === "live" && active !== side ? (
          <div className="flex flex-col gap-2.5 rounded-2xl border border-border/60 bg-background p-4">
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-[var(--orange-4m)]" />
              <span className="eyebrow text-muted-foreground">WAITING FOR OPPONENT</span>
            </div>
            {(() => {
              const lastOpp = [...(state.current_turns ?? [])].reverse().find((t) => !t.voided && t.side === opp(side));
              return lastOpp ? (
                <div className="border-l-2 border-border pl-2.5 text-[12.5px] leading-relaxed text-muted-foreground">
                  {firstName(parts[opp(side)]?.display_name)} — {turnText(lastOpp)}
                </div>
              ) : null;
            })()}
          </div>
        ) : null}

        {myLast && status !== "created" ? (
          <FixPill
            seq={myLast.seq}
            laterCount={(state.current_turns ?? []).filter((t) => !t.voided && t.seq > myLast.seq).length}
            confirming={confirmSeq === myLast.seq}
            pending={pending}
            onAsk={() => setConfirmSeq(myLast.seq)}
            onCancel={() => setConfirmSeq(null)}
            onConfirm={() => onRewind(myLast.seq)}
          />
        ) : null}
      </div>
    </div>
  );
}

/* ---------- shared pieces ---------- */

type ChipTone = "gold" | "green" | "blue" | "gray";
const CHIP_CLASS: Record<ChipTone, string> = {
  gold: "bg-[var(--swedish-gold)]/18 border-[var(--swedish-gold)]/55 text-[var(--gold-ink)]",
  green: "bg-[var(--dark-forest)]/10 border-[var(--dark-forest)]/30 text-[var(--dark-forest)]",
  blue: "bg-[var(--swedish-blue)] border-[var(--swedish-blue)] text-white",
  gray: "bg-foreground/5 border-foreground/10 text-muted-foreground",
};
function Chip({ label, tone }: { label: string; tone: ChipTone }) {
  return (
    <span className={cn("shrink-0 rounded-full border px-3 py-1.5 font-mono text-[9px] font-bold tracking-widest", CHIP_CLASS[tone])}>
      {label}
    </span>
  );
}

function StatTile({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-background px-3 py-2.5">
      <div className="eyebrow text-[9px] text-muted-foreground">{label}</div>
      <div className="display mt-0.5 text-2xl" style={color ? { color } : undefined}>
        {value}
      </div>
    </div>
  );
}

function Stepper({
  label,
  sub,
  value,
  max,
  onChange,
}: {
  label: string;
  sub?: string;
  value: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="min-w-0 flex-1">
        <div className="eyebrow text-[10px]">{label}</div>
        {sub ? <div className="mt-0.5 text-[10.5px] leading-tight text-muted-foreground">{sub}</div> : null}
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onChange(Math.max(0, value - 1))}
          disabled={value <= 0}
          className="grid size-11 place-items-center rounded-xl border border-border bg-background text-xl font-semibold disabled:opacity-40"
        >
          −
        </button>
        <span className="display w-9 text-center text-2xl">{value}</span>
        <button
          type="button"
          onClick={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
          className="grid size-11 place-items-center rounded-xl border border-border bg-background text-xl font-semibold disabled:opacity-40"
        >
          +
        </button>
      </div>
    </div>
  );
}

function TogglePill({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-full border px-3.5 py-2.5 font-mono text-[10px] font-bold tracking-widest",
        on
          ? "border-[var(--swedish-blue)]/45 bg-[var(--swedish-blue)]/10 text-[var(--swedish-blue)]"
          : "border-border bg-card text-muted-foreground",
      )}
    >
      <span>{on ? "✓" : "·"}</span>
      <span>{label}</span>
    </button>
  );
}

function LagRow({
  side,
  name,
  stored,
  pending,
  onLag,
}: {
  side: Side;
  name: string;
  stored: string | null | undefined;
  pending: boolean;
  onLag: (side: Side, value: string) => void;
}) {
  const [v, setV] = useState("");
  if (stored != null)
    return (
      <div className="rounded-xl border border-border/60 bg-background px-3 py-3 text-sm font-medium text-[var(--dark-forest)]">
        ✓ {firstName(name)} locked ({stored})
      </div>
    );
  return (
    <div className="flex flex-col gap-2">
      <label className="eyebrow text-muted-foreground">{name}</label>
      <div className="flex gap-2">
        <select value={v} onChange={(e) => setV(e.target.value)} className="min-w-0 flex-1 rounded-xl border border-input bg-card px-3 py-3 text-sm">
          {LAG_OPTIONS.map((o) => (
            <option key={o.v} value={o.v}>
              {o.label}
            </option>
          ))}
        </select>
        <button type="button" disabled={pending || !v} onClick={() => onLag(side, v)} className="rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50">
          Enter
        </button>
      </div>
    </div>
  );
}

function TurnFormBody({
  s,
  side,
  pending,
  onSubmit,
}: {
  s: GameState;
  side: Side;
  pending: boolean;
  onSubmit: (d: TurnDraft) => void;
}) {
  const [d, setD] = useState<TurnDraft>({ ...emptyDraft });
  const set = (patch: Partial<TurnDraft>) => setD((prev) => ({ ...prev, ...patch }));
  const hasField = s.field[side] > 0;
  const used = d.batons_field + d.batons_baseline + d.king_shots;
  const errors = buildErrors(s, d, side);
  const overCap = used > s.round_cap;

  return (
    <div className="flex flex-col gap-3 rounded-2xl border-[1.5px] border-[var(--swedish-blue)]/30 bg-card p-4 shadow-[0_4px_14px_rgba(0,106,167,0.08)]">
      <div className="flex items-baseline justify-between">
        <div className="eyebrow text-[var(--swedish-blue)]">ENTER TURN</div>
        <div className={cn("font-mono text-[10px] font-bold tracking-wider", overCap ? "text-destructive" : "text-muted-foreground")}>
          {used} / {s.round_cap} BATONS
        </div>
      </div>

      {hasField ? (
        <>
          <Stepper label="PENALTY KUBBS" sub="thrown out / re-thrown" value={d.penalty_kubbs} max={s.field[side]} onChange={(v) => set({ penalty_kubbs: v })} />
          <Stepper label="BATONS TO CLEAR FIELD" sub={`${s.field[side]} field kubb(s) on your side`} value={d.batons_field} max={6} onChange={(v) => set({ batons_field: v })} />
          <Stepper label="FIELD KUBBS LEFT" sub={`of ${s.field[side]} — still standing after your throws`} value={d.field_kubbs_left} max={s.field[side]} onChange={(v) => set({ field_kubbs_left: v })} />
        </>
      ) : null}

      {d.field_kubbs_left > 0 ? (
        <div className="flex flex-col gap-1.5 rounded-xl border border-[var(--swedish-gold)]/50 bg-[var(--swedish-gold)]/10 p-3">
          <div className="eyebrow text-[10px] text-[var(--gold-ink)]">ADVANTAGE LINE GIVEN — YOU LEFT FIELD KUBBS</div>
          <select value={d.advantage_line} onChange={(e) => set({ advantage_line: e.target.value })} className="w-full rounded-lg border border-input bg-card px-3 py-2.5 text-sm">
            {ADV_LINE_OPTIONS.map((o) => (
              <option key={o.v} value={o.v}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {hasField ? (
        <div className="flex flex-wrap gap-2">
          <TogglePill label="BASE KUBB DOUBLE" on={d.base_kubb_double} onClick={() => set({ base_kubb_double: !d.base_kubb_double })} />
        </div>
      ) : null}

      <Stepper
        label="BATONS AT BASELINE"
        sub={s.advantage[side] != null ? `from your advantage line — ${advLineLabel(s.advantage[side])}` : "from the 8 meter line"}
        value={d.batons_baseline}
        max={6}
        onChange={(v) => set({ batons_baseline: v })}
      />
      <Stepper label="BASELINE KUBBS HIT" sub="by those batons — do NOT count the double" value={d.baseline_kubbs} max={maxBaselineHits(s, d, side)} onChange={(v) => set({ baseline_kubbs: v })} />
      <Stepper label="KING SHOTS" sub="attempts at the King this turn" value={d.king_shots} max={6} onChange={(v) => set({ king_shots: v })} />

      <div className="flex flex-wrap gap-2">
        <TogglePill label="KING HIT — WIN" on={d.king_hit} onClick={() => set({ king_hit: !d.king_hit })} />
        <TogglePill label="KING EARLY — FOUL" on={d.king_hit_early} onClick={() => set({ king_hit_early: !d.king_hit_early })} />
      </div>

      {errors[0] ? (
        <div className="rounded-xl border border-destructive/25 bg-destructive/8 px-3 py-2.5 text-xs font-medium leading-snug text-destructive">
          {errors[0]}
        </div>
      ) : null}

      <button type="button" disabled={pending || errors.length > 0} onClick={() => onSubmit(d)} className="h-12 rounded-xl bg-primary text-sm font-semibold tracking-wide text-primary-foreground disabled:opacity-50">
        ENTER TURN
      </button>
    </div>
  );
}

function FixPill({
  seq,
  laterCount,
  confirming,
  pending,
  onAsk,
  onCancel,
  onConfirm,
}: {
  seq: number;
  laterCount: number;
  confirming: boolean;
  pending: boolean;
  onAsk: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <button type="button" onClick={onAsk} className="eyebrow self-start rounded-full border border-border bg-card px-3.5 py-2 text-[9px] text-muted-foreground">
        ↺ FIX MY LAST TURN · #{seq}
      </button>
      {confirming ? (
        <div className="flex items-center gap-2.5 rounded-xl border border-destructive/25 bg-destructive/6 px-3 py-2.5">
          <div className="flex-1 text-[11.5px] font-medium leading-snug text-destructive">
            Rewind to before turn #{seq}?
            {laterCount > 0 ? ` This also voids the ${laterCount} turn(s) after it.` : ""}
          </div>
          <button type="button" disabled={pending} onClick={onConfirm} className="rounded-full bg-destructive px-3 py-1.5 font-mono text-[9px] font-bold tracking-wider text-white">
            REWIND
          </button>
          <button type="button" onClick={onCancel} className="rounded-full border border-border px-3 py-1.5 font-mono text-[9px] font-bold tracking-wider text-muted-foreground">
            KEEP
          </button>
        </div>
      ) : null}
    </div>
  );
}

function TurnLog({
  turns,
  games,
  nameOf,
  confirmSeq,
  setConfirmSeq,
  pending,
  onRewind,
}: {
  turns: TurnRow[];
  games: { game_number: number; winner: Side | null }[];
  nameOf: (x: Side) => string;
  confirmSeq: number | null;
  setConfirmSeq: (n: number | null) => void;
  pending: boolean;
  onRewind: (seq: number) => void;
}) {
  const lastGameNo = games.length;
  const priorGames = games.filter((g) => g.game_number < lastGameNo && g.winner);
  return (
    <div className="flex flex-col gap-2.5">
      <span className="eyebrow text-muted-foreground">TURN LOG · APPEND-ONLY</span>
      {turns.length === 0 && priorGames.length === 0 ? (
        <div className="py-1.5 text-xs text-muted-foreground">No turns yet.</div>
      ) : null}
      {[...turns].reverse().map((t) => {
        const later = turns.filter((x) => !x.voided && x.seq > t.seq).length;
        return (
          <div key={t.seq} className="flex flex-col gap-1.5 border-b border-border/50 pb-2">
            <div className="flex items-start gap-2.5">
              <div className="w-6 shrink-0 pt-0.5 font-mono text-[10px] font-bold text-muted-foreground">#{t.seq}</div>
              <div className="min-w-0 flex-1">
                <div
                  className={cn("font-mono text-[9px] font-bold tracking-wider", t.voided && "line-through")}
                  style={{ color: t.voided ? "var(--muted-foreground)" : SIDE_COLOR[t.side] }}
                >
                  {firstName(nameOf(t.side)).toUpperCase()}
                  {t.voided ? " · VOIDED" : ""}
                </div>
                <div className={cn("text-xs leading-snug text-muted-foreground", t.voided && "line-through")}>{turnText(t)}</div>
              </div>
              {!t.voided && confirmSeq == null ? (
                <button type="button" title="Rewind to before this turn" onClick={() => setConfirmSeq(t.seq)} className="grid size-8 shrink-0 place-items-center rounded-lg border border-border bg-card text-xs">
                  ↺
                </button>
              ) : null}
            </div>
            {confirmSeq === t.seq ? (
              <div className="flex items-center gap-2.5 rounded-lg border border-destructive/25 bg-destructive/6 px-2.5 py-2">
                <div className="flex-1 text-[11.5px] font-medium leading-snug text-destructive">
                  Rewind to before turn #{t.seq}?
                  {later > 0 ? ` This also voids the ${later} turn(s) after it.` : ""}
                </div>
                <button type="button" disabled={pending} onClick={() => onRewind(t.seq)} className="rounded-full bg-destructive px-3 py-1.5 font-mono text-[9px] font-bold tracking-wider text-white">
                  REWIND
                </button>
                <button type="button" onClick={() => setConfirmSeq(null)} className="rounded-full border border-border px-3 py-1.5 font-mono text-[9px] font-bold tracking-wider text-muted-foreground">
                  KEEP
                </button>
              </div>
            ) : null}
          </div>
        );
      })}
      {priorGames
        .slice()
        .reverse()
        .map((g) => (
          <div key={g.game_number} className="flex items-start gap-2.5 border-b border-border/50 pb-2">
            <div className="w-6 shrink-0 pt-0.5 font-mono text-[10px] font-bold text-muted-foreground">G{g.game_number}</div>
            <div className="font-mono text-[9px] font-bold tracking-wider text-muted-foreground">
              GAME {g.game_number} — {firstName(nameOf(g.winner ?? "A")).toUpperCase()} WON
            </div>
          </div>
        ))}
    </div>
  );
}

/* ---------- pitch ---------- */

function PitchCard({ s, nameOf, done }: { s: GameState; nameOf: (x: Side) => string; done: boolean }) {
  return (
    <div className="flex flex-col gap-2 rounded-[18px] border border-foreground/10 bg-muted/40 p-4 shadow-sm">
      <span className="eyebrow text-muted-foreground">THE PITCH · SPECTATOR VIEW</span>
      <div
        className="overflow-hidden rounded-xl border-[1.5px] border-[var(--midnight-navy)]/25"
        style={{ background: "linear-gradient(180deg, rgba(89,164,77,.06), rgba(89,164,77,.10))" }}
      >
        <PitchHalf side="A" s={s} nameOf={nameOf} />
        <div className="flex items-center gap-2.5 px-3.5 py-0.5">
          <div className="h-px flex-1 bg-[var(--midnight-navy)]/20" />
          <div
            className="grid h-9 w-6 place-items-center rounded border-[1.5px] border-[var(--midnight-navy)]/35"
            style={{ background: "var(--swedish-gold)", transform: done ? "rotate(78deg)" : "none" }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="var(--midnight-navy)">
              <path d="M4 18h16l-1.5-9-4 3L12 6l-2.5 6-4-3L4 18z" />
            </svg>
          </div>
          <div className="h-px flex-1 bg-[var(--midnight-navy)]/20" />
        </div>
        <PitchHalf side="B" s={s} nameOf={nameOf} flip />
      </div>
    </div>
  );
}

function PitchHalf({
  side,
  s,
  nameOf,
  flip,
}: {
  side: Side;
  s: GameState;
  nameOf: (x: Side) => string;
  flip?: boolean;
}) {
  const o = opp(side);
  const baseline = s.baseline[side];
  const clearCount = s.field[o];
  const adv = s.advantage[side];
  const slots = (
    <div className="flex justify-center gap-2.5">
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="h-[30px] w-5 rounded-[3px]"
          style={i < baseline ? { background: SIDE_COLOR[side] } : { border: "1.5px dashed rgba(19,37,74,.30)", opacity: 0.7 }}
        />
      ))}
    </div>
  );
  const baseLabel = (
    <div className="text-center font-mono text-[9px] font-bold tracking-wider" style={{ color: SIDE_COLOR[side] }}>
      {firstName(nameOf(side)).toUpperCase()} BASELINE · {baseline} STANDING
    </div>
  );
  const fieldRow = (
    <div className="flex min-h-[46px] flex-wrap items-center justify-center gap-1.5">
      {Array.from({ length: Math.min(clearCount, 10) }).map((_, i) => (
        <div key={i} className="h-[21px] w-[14px] rounded-[2px]" style={{ background: SIDE_COLOR[o], transform: `rotate(${(i * 37) % 30 - 15}deg)` }} />
      ))}
      {clearCount > 0 ? (
        <div className="rounded-full bg-white/70 px-2.5 py-1 font-mono text-[9px] font-bold tracking-wide text-[var(--midnight-navy)]">
          {firstName(nameOf(o)).toUpperCase()} MUST CLEAR · {clearCount}
        </div>
      ) : null}
    </div>
  );
  const advRow = adv != null && (
    <div className="flex items-center gap-2">
      <div className="flex-1 border-t-2 border-dashed border-[var(--swedish-gold)]" />
      <div className="font-mono text-[9px] font-bold tracking-wide text-[var(--gold-ink)]">
        {firstName(nameOf(side)).toUpperCase()} ADV · {advLineLabel(adv).toUpperCase()}
      </div>
      <div className="flex-1 border-t-2 border-dashed border-[var(--swedish-gold)]" />
    </div>
  );
  return (
    <div className="flex flex-col gap-2.5 px-3.5 py-3">
      {flip ? (
        <>
          {advRow}
          {fieldRow}
          {baseLabel}
          {slots}
        </>
      ) : (
        <>
          {slots}
          {baseLabel}
          {fieldRow}
          {advRow}
        </>
      )}
    </div>
  );
}
