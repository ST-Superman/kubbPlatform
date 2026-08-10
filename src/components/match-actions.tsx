"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import { type MatchState } from "@/lib/supabase/matches";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";

const ERRORS: Record<string, string> = {
  forbidden: "You can't do that in this match.",
  not_active: "This match has already ended.",
  not_deletable: "Only a match that hasn't started can be deleted.",
  not_found: "Match not found.",
};
const errText = (m: string | undefined) =>
  (m?.match(/[a-z_]+/)?.[0] && ERRORS[m!.match(/[a-z_]+/)![0]]) || m || "Something went wrong.";

export function MatchActions({
  matchId,
  state,
  myUserId,
  onState,
}: {
  matchId: string;
  state: MatchState;
  myUserId: string;
  onState: (s: MatchState) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState<null | "abandon" | "forfeit" | "delete">(null);
  const [pending, start] = useTransition();

  const parts = state.participants ?? {};
  const mySide = (["A", "B"] as const).find((x) => parts[x]?.user_id === myUserId) ?? null;
  const amParticipant = mySide != null;
  const active = state.status === "created" || state.status === "live";
  const canDelete = state.status === "created" && parts.A?.user_id === myUserId; // creator is side A
  const opponentName = mySide
    ? parts[mySide === "A" ? "B" : "A"]?.display_name ?? "your opponent"
    : "your opponent";

  // Nothing to offer.
  if (!active || (!amParticipant && !canDelete)) return null;

  function run(fn: string) {
    start(async () => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc(fn, { p_match_id: matchId });
      if (error) {
        toast.error(errText(error.message));
        return;
      }
      setConfirm(null);
      setOpen(false);
      if (fn === "delete_match") {
        toast.success("Match deleted.");
        router.push("/matches");
        return;
      }
      if (data) onState(data as MatchState);
    });
  }

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        Match options
      </Button>

      <Sheet open={open} onClose={() => setOpen(false)} title="Match options">
        <div className="flex flex-col gap-3 px-4 pt-1 pb-2">
          <span className="eyebrow text-muted-foreground">MATCH OPTIONS</span>

          {amParticipant ? (
            <Row
              label="Forfeit (concede)"
              desc={`End now — ${opponentName} is recorded as the winner.`}
              confirmLabel="Concede"
              danger
              armed={confirm === "forfeit"}
              pending={pending}
              onArm={() => setConfirm("forfeit")}
              onCancel={() => setConfirm(null)}
              onConfirm={() => run("forfeit_match")}
            />
          ) : null}

          {amParticipant ? (
            <Row
              label="Abandon match"
              desc="Stop with no result — it won't count in either record."
              confirmLabel="Abandon"
              danger
              armed={confirm === "abandon"}
              pending={pending}
              onArm={() => setConfirm("abandon")}
              onCancel={() => setConfirm(null)}
              onConfirm={() => run("abandon_match")}
            />
          ) : null}

          {canDelete ? (
            <Row
              label="Delete match"
              desc="Remove this match entirely (only before it starts)."
              confirmLabel="Delete"
              danger
              armed={confirm === "delete"}
              pending={pending}
              onArm={() => setConfirm("delete")}
              onCancel={() => setConfirm(null)}
              onConfirm={() => run("delete_match")}
            />
          ) : null}
        </div>
      </Sheet>
    </>
  );
}

function Row({
  label,
  desc,
  confirmLabel,
  danger,
  armed,
  pending,
  onArm,
  onCancel,
  onConfirm,
}: {
  label: string;
  desc: string;
  confirmLabel: string;
  danger?: boolean;
  armed: boolean;
  pending: boolean;
  onArm: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-background p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className={danger ? "text-sm font-medium text-destructive" : "text-sm font-medium"}>
            {label}
          </div>
          <div className="text-xs text-muted-foreground">{desc}</div>
        </div>
        {!armed ? (
          <Button variant="outline" size="sm" onClick={onArm} disabled={pending}>
            {confirmLabel}
          </Button>
        ) : null}
      </div>
      {armed ? (
        <div className="mt-2 flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
          <Button variant="destructive" size="sm" onClick={onConfirm} disabled={pending}>
            {pending ? "…" : `Yes, ${confirmLabel.toLowerCase()}`}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
