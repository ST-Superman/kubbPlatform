"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import { type MatchSummary, type Opponent } from "@/lib/supabase/matches";
import { MatchRow } from "@/components/match-row";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";

const CREATE_ERRORS: Record<string, string> = {
  auth_required: "You must be signed in.",
  race_to_range: "Race-to must be between 1 and 9.",
  opponent_required: "Pick an opponent.",
  no_player_for_account: "Your account has no player row yet.",
  opponent_not_found: "That player no longer exists.",
  cannot_play_self: "You can't play against yourself.",
};

function friendly(message: string | undefined): string {
  const code = message?.match(/[a-z_]+/)?.[0];
  return (code && CREATE_ERRORS[code]) || message || "Something went wrong.";
}

export function MatchesClient({
  initial,
  opponents,
}: {
  initial: MatchSummary[];
  opponents: Opponent[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Opponent | null>(null);
  const [open, setOpen] = useState(false);
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
  }

  function goToMatch(data: unknown) {
    const id = (data as { match_id?: string } | null)?.match_id;
    if (id) router.push(`/matches/${id}`);
  }

  function create() {
    if (!selected) return;
    start(async () => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("create_match", {
        p_race_to: raceTo,
        p_opponent_player_id: selected.player_id,
      });
      if (error) {
        toast.error(friendly(error.message));
        return;
      }
      goToMatch(data);
    });
  }

  // Type a new name → create a managed placeholder + a match against them, then land
  // in the match (where an invite link is offered). No /players detour.
  function createAndInvite(name: string) {
    const n = name.trim();
    if (!n) return;
    start(async () => {
      const supabase = createClient();
      const { data: pd, error: pErr } = await supabase.rpc("create_managed_player", {
        p_display_name: n,
      });
      const playerId = (pd as { player_id?: string } | null)?.player_id;
      if (pErr || !playerId) {
        toast.error(friendly(pErr?.message));
        return;
      }
      const { data: md, error: mErr } = await supabase.rpc("create_match", {
        p_race_to: raceTo,
        p_opponent_player_id: playerId,
      });
      if (mErr) {
        toast.error(friendly(mErr.message));
        return;
      }
      goToMatch(md);
    });
  }

  const inProgress = initial.filter((m) => m.status === "created" || m.status === "live");
  const completed = initial.filter((m) => m.status === "finished" || m.status === "abandoned");

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent className="flex flex-col gap-4">
          <span className="eyebrow text-muted-foreground">New match</span>

          <div className="flex flex-col gap-1">
            <Label htmlFor="opponent">Opponent</Label>
            <div className="relative">
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
                  {filtered.map((o) => (
                    <li key={o.player_id}>
                      <button
                        type="button"
                        onClick={() => choose(o)}
                        className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-muted"
                      >
                        <span className="font-medium">{o.display_name}</span>
                        <span className="font-mono text-xs text-muted-foreground">
                          {o.handle ? `@${o.handle}` : o.kind}
                        </span>
                      </button>
                    </li>
                  ))}
                  {query.trim() ? (
                    <li>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => createAndInvite(query)}
                        className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-muted disabled:opacity-50"
                      >
                        <span className="text-muted-foreground">＋</span>
                        <span>
                          Create &amp; invite “<span className="font-medium">{query.trim()}</span>”
                        </span>
                      </button>
                    </li>
                  ) : null}
                </ul>
              ) : null}
            </div>
            {selected ? (
              <p className="text-xs text-muted-foreground">
                Playing <span className="font-medium">{selected.display_name}</span>
                {selected.kind === "managed" ? " (managed — you'll score both sides)" : ""}.{" "}
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

          <div className="flex flex-col gap-1">
            <Label htmlFor="raceto">Race to</Label>
            <Input
              id="raceto"
              type="number"
              min={1}
              max={9}
              value={raceTo}
              onChange={(e) => setRaceTo(Number(e.target.value))}
              className="w-24"
            />
          </div>

          <Button onClick={create} disabled={pending || !selected} className="w-full sm:w-fit">
            {pending ? "Creating…" : "Create match"}
          </Button>
        </CardContent>
      </Card>

      {initial.length === 0 ? (
        <p className="text-sm text-muted-foreground">No matches yet.</p>
      ) : (
        <>
          {inProgress.length > 0 ? (
            <div className="flex flex-col gap-2">
              <span className="eyebrow text-muted-foreground">In progress</span>
              {inProgress.map((m) => (
                <MatchRow key={m.match_id} row={m} />
              ))}
            </div>
          ) : null}
          {completed.length > 0 ? (
            <div className="flex flex-col gap-2">
              <span className="eyebrow text-muted-foreground">Completed</span>
              {completed.map((m) => (
                <MatchRow key={m.match_id} row={m} />
              ))}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
