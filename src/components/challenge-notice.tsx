"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import { handleMembershipError } from "@/lib/membership-error";
import { type Challenge } from "@/lib/supabase/challenges";
import { Sheet } from "@/components/ui/sheet";

const firstName = (n: string | null) => (n ?? "Player").split(/\s+/)[0];

/**
 * Incoming/outgoing challenge indicator for the Dashboard and Matches screens.
 * Incoming challenges get a prominent banner that opens an accept/decline popup;
 * outgoing challenges get a quiet link to the full /challenges screen. Full management
 * (cancel, history) lives on /challenges — this is just the surfaced call-to-action.
 */
export function ChallengeNotice({ initial }: { initial: Challenge[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [incoming, setIncoming] = useState(() =>
    initial.filter((c) => c.direction === "incoming"),
  );
  const outgoing = useMemo(() => initial.filter((c) => c.direction === "outgoing"), [initial]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, start] = useTransition();

  function accept(id: string) {
    setBusyId(id);
    start(async () => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("accept_challenge", { p_challenge_id: id });
      setBusyId(null);
      if (error) {
        if (!handleMembershipError(error.message, () => router.push("/membership")))
          toast.error("Something went wrong.");
        return;
      }
      const mid = (data as { match_id?: string } | null)?.match_id;
      if (mid) router.push(`/matches/${mid}`);
    });
  }

  function decline(id: string) {
    setBusyId(id);
    start(async () => {
      const supabase = createClient();
      const { error } = await supabase.rpc("decline_challenge", { p_challenge_id: id });
      setBusyId(null);
      if (error) {
        toast.error("Something went wrong.");
        return;
      }
      setIncoming((xs) => {
        const next = xs.filter((x) => x.id !== id);
        if (next.length === 0) setOpen(false);
        return next;
      });
      toast.success("Challenge declined");
    });
  }

  if (incoming.length === 0 && outgoing.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5">
      {incoming.length > 0 ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex items-center gap-3 rounded-2xl border-[1.5px] border-[var(--swedish-gold)]/55 bg-[var(--swedish-gold)]/10 px-4 py-3.5 text-left transition-transform active:scale-[0.97]"
        >
          <span className="text-lg leading-none">⚔️</span>
          <div className="min-w-0 flex-1">
            <div className="font-mono text-[9px] font-bold tracking-[1.3px] text-[var(--gold-ink)]">
              YOU&rsquo;VE BEEN CHALLENGED
            </div>
            <div className="mt-0.5 text-[14px] font-semibold">
              {incoming.length === 1
                ? `${firstName(incoming[0].other_display_name)} wants to play`
                : `${incoming.length} players want to play`}
            </div>
          </div>
          <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[var(--swedish-gold)]/25 font-mono text-[11px] font-bold tabular-nums text-[var(--gold-ink)]">
            {incoming.length}
          </span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--gold-ink)" strokeWidth="2.4">
            <path d="M9 5l7 7-7 7" />
          </svg>
        </button>
      ) : null}

      {outgoing.length > 0 ? (
        <Link
          href="/challenges"
          className="px-1 text-[12px] font-medium text-muted-foreground underline-offset-4 hover:underline"
        >
          {outgoing.length} challenge{outgoing.length === 1 ? "" : "s"} sent · Manage &rarr;
        </Link>
      ) : null}

      <Sheet open={open} onClose={() => setOpen(false)} title="You've been challenged">
        <div className="flex flex-col gap-3 px-4 pt-1 pb-4">
          {incoming.map((c) => {
            const busy = busyId === c.id;
            const name = c.other_display_name ?? "Player";
            return (
              <div key={c.id} className="flex flex-col gap-2 rounded-2xl border border-border bg-card px-4 py-3">
                <div>
                  <div className="text-sm font-semibold">{name} challenged you</div>
                  <div className="font-mono text-[10px] tracking-wider text-muted-foreground">
                    FIRST TO {c.race_to} GAME{c.race_to === 1 ? "" : "S"}
                  </div>
                </div>
                {c.other_handle ? (
                  <Link
                    href={`/u/${c.other_handle}`}
                    className="text-[12px] font-semibold text-primary underline-offset-4 hover:underline"
                  >
                    View profile &rarr;
                  </Link>
                ) : null}
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => decline(c.id)}
                    className="flex-1 rounded-lg border border-border py-2 text-[13px] font-semibold text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
                  >
                    Decline
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => accept(c.id)}
                    className="flex-[1.4] rounded-lg bg-primary py-2 text-[13px] font-semibold text-primary-foreground transition-transform active:scale-95 disabled:opacity-50"
                  >
                    {busy ? "…" : "Accept"}
                  </button>
                </div>
              </div>
            );
          })}
          <Link
            href="/challenges"
            className="pt-1 text-center text-[12px] font-medium text-muted-foreground underline-offset-4 hover:underline"
          >
            See all challenges &rarr;
          </Link>
        </div>
      </Sheet>
    </div>
  );
}
