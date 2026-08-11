"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import { ctaClass } from "@/components/brand";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const CREATE_ERRORS: Record<string, string> = {
  auth_required: "You must be signed in.",
  cannot_play_self: "You can't challenge yourself.",
  opponent_not_found: "That player no longer exists.",
  no_player_for_account: "Your account has no player row yet.",
  challenge_exists: "You already have a pending challenge with this player.",
  race_to_range: "Pick a race to 1, 2, or 3.",
};

function friendly(message: string | undefined): string {
  const code = message?.match(/[a-z_]+/)?.[0];
  return (code && CREATE_ERRORS[code]) || message || "Something went wrong.";
}

const RACE_OPTIONS = [1, 2, 3] as const;

export function ChallengeButton({
  playerId,
  label,
  kind = "account",
}: {
  playerId: string;
  label: string;
  kind?: "account" | "managed";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [raceTo, setRaceTo] = useState(2);
  const [pending, start] = useTransition();
  const managed = kind === "managed";
  const first = label.split(/\s+/)[0];

  function submit() {
    start(async () => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("create_challenge", {
        p_opponent_player_id: playerId,
        p_race_to: raceTo,
      });
      if (error) {
        toast.error(friendly(error.message));
        return;
      }
      const res = data as { match_id?: string; challenge_id?: string } | null;
      if (res?.match_id) {
        router.push(`/matches/${res.match_id}`);
        return;
      }
      setOpen(false);
      toast.success(`Challenge sent to ${first}`);
    });
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={ctaClass("primary")}>
        CHALLENGE {label.toUpperCase()}
      </button>

      <Sheet
        open={open}
        onClose={() => {
          if (!pending) setOpen(false);
        }}
        title={`Challenge ${first}`}
      >
        <div className="flex flex-col gap-4 px-4 pt-1 pb-4">
          <div>
            <span className="eyebrow text-muted-foreground">
              {managed ? "START MATCH" : "SEND CHALLENGE"} · {first.toUpperCase()}
            </span>
            <p className="mt-1 text-sm text-muted-foreground">
              {managed
                ? "You manage this player, so the match starts right away."
                : `${first} gets a challenge to accept before the match starts.`}
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <span className="eyebrow text-[10px] text-muted-foreground">RACE TO</span>
            <div className="grid grid-cols-3 gap-2">
              {RACE_OPTIONS.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRaceTo(n)}
                  className={cn(
                    "rounded-xl border py-3 font-mono text-sm font-bold tabular-nums transition-colors",
                    raceTo === n
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card text-foreground hover:bg-muted",
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              First to {raceTo} game{raceTo === 1 ? "" : "s"} wins the match.
            </p>
          </div>

          <button type="button" onClick={submit} disabled={pending} className={ctaClass("primary")}>
            {pending ? "…" : managed ? "Start match" : "Send challenge"}
          </button>
        </div>
      </Sheet>
    </>
  );
}
