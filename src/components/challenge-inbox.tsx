"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import { type Challenge } from "@/lib/supabase/challenges";

const firstName = (n: string | null) => (n ?? "Player").split(/\s+/)[0];

/** Dashboard inbox: incoming challenges to accept/decline, outgoing ones to cancel. */
export function ChallengeInbox({ initial }: { initial: Challenge[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, start] = useTransition();

  if (items.length === 0) return null;

  function act(id: string, fn: string, onDone: (data: unknown) => void) {
    setBusyId(id);
    start(async () => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc(fn, { p_challenge_id: id });
      setBusyId(null);
      if (error) {
        toast.error("Something went wrong.");
        return;
      }
      onDone(data);
    });
  }

  function accept(id: string) {
    act(id, "accept_challenge", (data) => {
      const mid = (data as { match_id?: string } | null)?.match_id;
      if (mid) router.push(`/matches/${mid}`);
    });
  }
  function respond(id: string, fn: string, msg: string) {
    act(id, fn, () => {
      setItems((xs) => xs.filter((x) => x.id !== id));
      toast.success(msg);
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="eyebrow text-[10px] tracking-[1.5px] text-muted-foreground">CHALLENGES</span>
      {items.map((c) => {
        const busy = busyId === c.id;
        const name = c.other_display_name ?? "Player";
        return (
          <div
            key={c.id}
            className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-sm"
          >
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">
                {c.direction === "incoming"
                  ? `${name} challenged you`
                  : `Waiting on ${firstName(c.other_display_name)}`}
              </div>
              <div className="font-mono text-[10px] tracking-wider text-muted-foreground">
                RACE TO {c.race_to}
              </div>
            </div>
            {c.direction === "incoming" ? (
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => respond(c.id, "decline_challenge", "Challenge declined")}
                  className="rounded-lg border border-border px-3 py-1.5 text-[12px] font-semibold text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
                >
                  Decline
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => accept(c.id)}
                  className="rounded-lg bg-primary px-3 py-1.5 text-[12px] font-semibold text-primary-foreground transition-transform active:scale-95 disabled:opacity-50"
                >
                  {busy ? "…" : "Accept"}
                </button>
              </div>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() => respond(c.id, "cancel_challenge", "Challenge cancelled")}
                className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-[12px] font-semibold text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
              >
                {busy ? "…" : "Cancel"}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
