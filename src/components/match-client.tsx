"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import {
  type MatchState,
  type Side,
} from "@/lib/supabase/matches";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";

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
  already_scored: "Someone already scored this turn — refresh.",
  forbidden: "It's not your turn to score.",
  game_not_found: "Game not found.",
};

function errText(message: string | undefined): string {
  const code = message?.match(/[a-z_]+/)?.[0];
  return (code && TURN_ERRORS[code]) || message || "Something went wrong.";
}

const emptyDraft = {
  batons_field: 0,
  batons_baseline: 0,
  baseline_kubbs: 0,
  base_kubb_double: false,
  penalty_kubbs: 0,
  field_kubbs_left: 0,
  advantage_line: "",
  king_shots: 0,
  king_hit: false,
  king_hit_early: false,
};

export function MatchClient({
  matchId,
  initial,
  myUserId,
}: {
  matchId: string;
  initial: MatchState;
  myUserId: string;
}) {
  const [state, setState] = useState<MatchState>(initial);
  const [pending, start] = useTransition();

  // Live updates: the write RPCs broadcast on match:<id>. We treat each broadcast as a
  // signal and refetch authoritative match_state — robust to payload shape, always full.
  useEffect(() => {
    const supabase = createClient();
    const refetch = async () => {
      const { data } = await supabase.rpc("match_state", { p_match_id: matchId });
      if (data) setState(data as MatchState);
    };
    const channel = supabase
      .channel(`match:${matchId}`)
      .on("broadcast", { event: "state" }, () => {
        void refetch();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [matchId]);

  const participants = state.participants ?? {};
  const gamesWon = state.games_won ?? { A: 0, B: 0 };
  const nameOf = (side: Side) =>
    participants[side]?.display_name ?? `Side ${side}`;
  const mySide: Side | null =
    participants.A?.user_id === myUserId
      ? "A"
      : participants.B?.user_id === myUserId
        ? "B"
        : null;

  function callRpc(fn: string, args: Record<string, unknown>) {
    start(async () => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc(fn, args);
      if (error) {
        toast.error(errText(error.message));
        return;
      }
      if (data) setState(data as MatchState);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/matches" className="eyebrow text-muted-foreground hover:underline">
          ← Matches
        </Link>
        <h1 className="display mt-2 text-2xl font-medium">
          {nameOf("A")} <span className="text-muted-foreground">vs</span> {nameOf("B")}
        </h1>
        <div className="mt-1 flex items-center gap-3 text-sm text-muted-foreground">
          <span className="font-mono">
            {gamesWon.A} – {gamesWon.B}
          </span>
          <span className="eyebrow">race to {state.race_to}</span>
          <span className="eyebrow">{state.status}</span>
          {mySide ? <span className="eyebrow">you are {mySide}</span> : null}
        </div>
      </div>

      {state.status === "created" ? (
        <LagPanel state={state} disabled={pending} onSubmit={callRpc} matchId={matchId} />
      ) : null}

      {state.status === "finished" ? (
        <Card>
          <CardContent className="flex flex-col gap-3">
            <span className="eyebrow text-[var(--dark-forest)]">MATCH COMPLETE</span>
            <p className="text-lg font-medium">
              {nameOf(gamesWon.A > gamesWon.B ? "A" : "B")} wins,{" "}
              {Math.max(gamesWon.A, gamesWon.B)}–
              {Math.min(gamesWon.A, gamesWon.B)}.
            </p>
            <UndoButton state={state} disabled={pending} onUndo={callRpc} />
          </CardContent>
        </Card>
      ) : null}

      {state.status === "live" && state.current_state ? (
        <>
          <Board state={state} nameOf={nameOf} />
          <TurnForm
            state={state}
            disabled={pending}
            onSubmit={callRpc}
          />
          <UndoButton state={state} disabled={pending} onUndo={callRpc} />
        </>
      ) : null}
    </div>
  );
}

function LagPanel({
  state,
  disabled,
  onSubmit,
  matchId,
}: {
  state: MatchState;
  disabled: boolean;
  onSubmit: (fn: string, args: Record<string, unknown>) => void;
  matchId: string;
}) {
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <span className="eyebrow text-muted-foreground">Lag for first throw</span>
        <p className="text-xs text-muted-foreground">
          Lower is better: <code>0.1</code> touching the king, <code>1</code>–<code>24</code>{" "}
          inches, <code>98</code> not close, <code>99</code> knocked the king.
        </p>
        {(["A", "B"] as const).map((side) => {
          const val = side === "A" ? a : b;
          const set = side === "A" ? setA : setB;
          const stored = side === "A" ? state.lag.a : state.lag.b;
          return (
            <div key={side} className="flex items-end gap-2">
              <div className="flex flex-1 flex-col gap-1">
                <Label htmlFor={`lag-${side}`}>
                  {state.participants[side]?.display_name ?? `Side ${side}`}
                  {stored ? ` · submitted ${stored}` : ""}
                </Label>
                <Input
                  id={`lag-${side}`}
                  value={val}
                  onChange={(e) => set(e.target.value)}
                  placeholder="e.g. 3"
                  inputMode="decimal"
                />
              </div>
              <Button
                variant="outline"
                disabled={disabled || !val.trim()}
                onClick={() =>
                  onSubmit("submit_lag", {
                    p_match_id: matchId,
                    p_side: side,
                    p_value: val.trim(),
                  })
                }
              >
                Submit
              </Button>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function Board({
  state,
  nameOf,
}: {
  state: MatchState;
  nameOf: (s: Side) => string;
}) {
  const s = state.current_state!;
  const next = s.next_side;
  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="eyebrow text-muted-foreground">Current game</span>
          {next ? (
            <span className="eyebrow text-[var(--swedish-blue)]">
              {nameOf(next)} to throw · {s.round_cap} batons
            </span>
          ) : null}
        </div>
        <div className="grid grid-cols-3 gap-2 text-sm">
          <span className="text-muted-foreground" />
          <span className="text-center font-medium">{nameOf("A")}</span>
          <span className="text-center font-medium">{nameOf("B")}</span>
          {(
            [
              ["Baseline", s.baseline],
              ["Field", s.field],
              ["King shots", s.king_shots],
            ] as const
          ).map(([label, rec]) => (
            <Row key={label} label={label} a={rec.A} b={rec.B} />
          ))}
          <span className="text-muted-foreground">Advantage</span>
          <span className="text-center font-mono">{s.advantage.A ?? "—"}</span>
          <span className="text-center font-mono">{s.advantage.B ?? "—"}</span>
        </div>
      </CardContent>
    </Card>
  );
}

function Row({ label, a, b }: { label: string; a: number; b: number }) {
  return (
    <>
      <span className="text-muted-foreground">{label}</span>
      <span className="text-center font-mono">{a}</span>
      <span className="text-center font-mono">{b}</span>
    </>
  );
}

function TurnForm({
  state,
  disabled,
  onSubmit,
}: {
  state: MatchState;
  disabled: boolean;
  onSubmit: (fn: string, args: Record<string, unknown>) => void;
}) {
  const [d, setD] = useState({ ...emptyDraft });
  const num = (k: keyof typeof emptyDraft) => (
    <div className="flex flex-col gap-1">
      <Label htmlFor={k} className="text-xs">
        {k.replace(/_/g, " ")}
      </Label>
      <Input
        id={k}
        type="number"
        min={0}
        value={d[k] as number}
        onChange={(e) => setD({ ...d, [k]: Number(e.target.value) })}
      />
    </div>
  );
  const bool = (k: keyof typeof emptyDraft) => (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={d[k] as boolean}
        onChange={(e) => setD({ ...d, [k]: e.target.checked })}
      />
      {k.replace(/_/g, " ")}
    </label>
  );

  function submit() {
    onSubmit("submit_turn", {
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
      p_advantage_line: d.advantage_line.trim() || null,
      p_king_shots: d.king_shots,
      p_king_hit: d.king_hit,
      p_king_hit_early: d.king_hit_early,
    });
    setD({ ...emptyDraft });
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <span className="eyebrow text-muted-foreground">Record a turn</span>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {num("batons_field")}
          {num("batons_baseline")}
          {num("baseline_kubbs")}
          {num("field_kubbs_left")}
          {num("penalty_kubbs")}
          {num("king_shots")}
          <div className="flex flex-col gap-1">
            <Label htmlFor="advantage_line" className="text-xs">
              advantage line
            </Label>
            <Input
              id="advantage_line"
              value={d.advantage_line}
              onChange={(e) => setD({ ...d, advantage_line: e.target.value })}
              placeholder="6"
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-4">
          {bool("base_kubb_double")}
          {bool("king_hit")}
          {bool("king_hit_early")}
        </div>
        <Button onClick={submit} disabled={disabled} className="w-fit">
          {disabled ? "Submitting…" : "Submit turn"}
        </Button>
      </CardContent>
    </Card>
  );
}

function UndoButton({
  state,
  disabled,
  onUndo,
}: {
  state: MatchState;
  disabled: boolean;
  onUndo: (fn: string, args: Record<string, unknown>) => void;
}) {
  if (!state.undo_target) return null;
  return (
    <Button
      variant="ghost"
      size="sm"
      className="w-fit"
      disabled={disabled}
      onClick={() =>
        onUndo("rewind_to", {
          p_game_id: state.undo_target!.game_id,
          p_seq: state.undo_target!.seq,
          p_token: null,
        })
      }
    >
      Undo last turn
    </Button>
  );
}
