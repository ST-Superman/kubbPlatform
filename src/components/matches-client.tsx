"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import { handleMembershipError } from "@/lib/membership-error";
import { type MatchSummary, type Opponent } from "@/lib/supabase/matches";
import { type Challenge } from "@/lib/supabase/challenges";
import { ChallengeNotice } from "@/components/challenge-notice";
import { TurnSections } from "@/components/turn-sections";
import { MatchRow } from "@/components/match-row";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const RACE_OPTIONS = [1, 2, 3];

const CREATE_ERRORS: Record<string, string> = {
  auth_required: "You must be signed in.",
  race_to_range: "Race to must be 1, 2, or 3.",
  opponent_required: "Pick an opponent.",
  no_player_for_account: "Your account has no player row yet.",
  opponent_not_found: "That player no longer exists.",
  cannot_play_self: "You can't play against yourself.",
  challenge_exists: "You already have a pending challenge with this player.",
};

function friendly(message: string | undefined): string {
  const code = message?.match(/[a-z_]+/)?.[0];
  return (code && CREATE_ERRORS[code]) || message || "Something went wrong.";
}

export function MatchesClient({
  initial,
  opponents,
  challenges,
}: {
  initial: MatchSummary[];
  opponents: Opponent[];
  challenges: Challenge[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Opponent | null>(null);
  const [open, setOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [raceTo, setRaceTo] = useState(2);
  const [pending, start] = useTransition();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return opponents;
    return opponents.filter(
      (o) =>
        o.display_name.toLowerCase().includes(q) ||
        (o.handle ?? "").toLowerCase().includes(q),
    );
  }, [opponents, query]);

  function choose(o: Opponent) {
    setSelected(o);
    setQuery("");
    setOpen(false);
    setSheetOpen(false);
  }

  function goToMatch(data: unknown) {
    const id = (data as { match_id?: string } | null)?.match_id;
    if (id) router.push(`/matches/${id}`);
  }

  function create() {
    if (!selected) return;
    const opp = selected;
    start(async () => {
      const supabase = createClient();
      // Managed opponent → match starts now; account opponent → pending challenge.
      const { data, error } = await supabase.rpc("create_challenge", {
        p_race_to: raceTo,
        p_opponent_player_id: opp.player_id,
      });
      if (error) {
        if (!handleMembershipError(error.message, () => router.push("/membership")))
          toast.error(friendly(error.message));
        return;
      }
      const res = data as { match_id?: string; challenge_id?: string } | null;
      if (res?.match_id) {
        goToMatch(res);
        return;
      }
      setSelected(null);
      setSheetOpen(false);
      toast.success(`Challenge sent to ${opp.display_name.split(/\s+/)[0]}`);
    });
  }

  // New players are created only in the Players tab (where their email is captured for
  // auto-claim). Here you can only pick an opponent who already exists on the roster.

  // Shared result rows for the desktop popover and the mobile sheet.
  const results = (
    <>
      {filtered.map((o) => (
        <li key={o.player_id}>
          <button
            type="button"
            onClick={() => choose(o)}
            className="flex w-full items-center justify-between rounded-md px-3 py-2.5 text-left text-sm hover:bg-muted"
          >
            <span className="font-medium">{o.display_name}</span>
            <span className="font-mono text-xs text-muted-foreground">
              {o.handle ? `@${o.handle}` : o.kind}
            </span>
          </button>
        </li>
      ))}
      {query.trim() && filtered.length === 0 ? (
        <li className="px-3 py-3 text-sm text-muted-foreground">
          No player named “{query.trim()}”.{" "}
          <Link
            href="/players"
            className="font-semibold text-primary underline-offset-4 hover:underline"
          >
            Add them in the Players tab
          </Link>{" "}
          first — you can include their email there so they can claim their profile.
        </li>
      ) : null}
    </>
  );

  const completed = initial.filter((m) => m.status === "finished" || m.status === "abandoned");

  return (
    <div className="flex flex-col gap-6">
      <ChallengeNotice initial={challenges} />

      {/* Actionable matches first — waiting on you, then waiting on them. */}
      <TurnSections matches={initial} />

      <Card>
        <CardContent className="flex flex-col gap-4">
          <span className="eyebrow text-muted-foreground">New virtual match</span>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="opponent">Opponent</Label>

            {/* Mobile: tap to open a bottom sheet */}
            <button
              type="button"
              onClick={() => setSheetOpen(true)}
              className="flex h-12 w-full items-center rounded-[12px] border border-input bg-card px-3.5 text-left text-base sm:hidden"
            >
              {selected ? (
                <span>{selected.display_name}</span>
              ) : (
                <span className="text-muted-foreground">Search players or type a new name…</span>
              )}
            </button>

            {/* Desktop: inline input + absolute popover */}
            <div className="relative hidden sm:block">
              <Input
                id="opponent"
                autoComplete="off"
                value={selected ? selected.display_name : query}
                placeholder="Search players or type a new name…"
                onChange={(e) => {
                  setSelected(null);
                  setQuery(e.target.value);
                  setOpen(true);
                }}
                onFocus={() => setOpen(true)}
              />
              {open && (filtered.length > 0 || query.trim()) ? (
                <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-border bg-card p-1 shadow-lg ring-1 ring-foreground/10">
                  {results}
                </ul>
              ) : null}
            </div>

            {selected ? (
              <p className="text-xs text-muted-foreground">
                Playing <span className="font-medium">{selected.display_name}</span>
                {selected.kind === "managed"
                  ? " (managed — you'll score both sides)"
                  : " (they'll get a challenge to accept)"}
                .{" "}
                <button
                  type="button"
                  className="underline-offset-4 hover:underline"
                  onClick={() => setSelected(null)}
                >
                  change
                </button>
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Pick an existing player, or type a new name to create them and get an invite link.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="raceto">Race to</Label>
            <div id="raceto" className="flex gap-2">
              {RACE_OPTIONS.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRaceTo(n)}
                  aria-pressed={raceTo === n}
                  className={cn(
                    "h-11 flex-1 rounded-xl border font-mono text-sm font-bold tabular-nums transition-colors",
                    raceTo === n
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card text-muted-foreground hover:bg-muted",
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          <Button onClick={create} disabled={pending || !selected} className="w-full sm:w-fit">
            {pending
              ? "Working…"
              : selected?.kind === "account"
                ? "Send challenge"
                : "Create match"}
          </Button>
        </CardContent>
      </Card>

      {/* Mobile opponent sheet */}
      <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="Pick opponent">
        <div className="flex flex-col gap-2 px-4 pt-1 pb-2">
          <span className="eyebrow text-muted-foreground">OPPONENT</span>
          <Input
            autoComplete="off"
            autoFocus
            value={query}
            placeholder="Search players or type a new name…"
            onChange={(e) => setQuery(e.target.value)}
            className="h-12 rounded-[12px] bg-card px-3.5 text-base md:text-base"
          />
          <ul className="mt-1 flex max-h-[52vh] flex-col overflow-auto">{results}</ul>
        </div>
      </Sheet>

      {completed.length > 0 ? (
        <div className="flex flex-col gap-2">
          <span className="eyebrow text-[10px] tracking-[1.5px] text-muted-foreground">
            COMPLETED:
          </span>
          {completed.map((m) => (
            <MatchRow key={m.match_id} row={m} />
          ))}
        </div>
      ) : initial.length === 0 ? (
        <p className="text-sm text-muted-foreground">No matches yet.</p>
      ) : null}
    </div>
  );
}
