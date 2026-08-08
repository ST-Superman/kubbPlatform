"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { toast } from "sonner";

import {
  createManagedPlayer,
  regenerateClaimToken,
  type PlayersState,
} from "@/app/players/actions";
import { type ManagedPlayer } from "@/lib/supabase/players";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((p) => p[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function daysLeft(expiresAt: string): number {
  const ms = new Date(expiresAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

export function ManagedPlayers({
  players,
  baseUrl,
}: {
  players: ManagedPlayer[];
  baseUrl: string;
}) {
  const [state, formAction, pending] = useActionState<PlayersState, FormData>(
    createManagedPlayer,
    undefined,
  );

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent>
          <form action={formAction} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="display_name">
                <span className="eyebrow text-muted-foreground">New player</span>
              </Label>
              <Input
                id="display_name"
                name="display_name"
                placeholder="e.g. Erik Lindqvist"
                autoComplete="off"
                required
              />
              <p className="text-xs text-muted-foreground">
                No account needed — they can claim this identity later.
              </p>
            </div>

            {state?.error ? (
              <p className="text-sm text-destructive" role="alert">
                {state.error}
              </p>
            ) : null}
            {state?.message ? (
              <p className="text-sm text-[var(--dark-forest)]" role="status">
                {state.message}
              </p>
            ) : null}

            <Button type="submit" disabled={pending} className="w-fit">
              {pending ? "Adding…" : "Add to roster"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {players.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No managed players yet. Add one above to generate a claim link.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          <span className="eyebrow text-muted-foreground">
            Unclaimed · {players.length}
          </span>
          {players.map((p) => (
            <PlayerCard key={p.id} player={p} baseUrl={baseUrl} />
          ))}
        </div>
      )}
    </div>
  );
}

function PlayerCard({
  player,
  baseUrl,
}: {
  player: ManagedPlayer;
  baseUrl: string;
}) {
  const router = useRouter();
  const [qr, setQr] = useState<string>("");
  const [regenerating, startRegen] = useTransition();

  const claimUrl = `${baseUrl}/claim/${player.claim_token}`;

  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(claimUrl, { width: 176, margin: 1 })
      .then((url) => {
        if (alive) setQr(url);
      })
      .catch(() => {
        /* QR is best-effort; the copyable link is the source of truth */
      });
    return () => {
      alive = false;
    };
  }, [claimUrl]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(claimUrl);
      toast.success("Claim link copied");
    } catch {
      toast.error("Couldn't copy — select and copy the link manually.");
    }
  }

  function regenerate() {
    startRegen(async () => {
      const res = await regenerateClaimToken(player.id);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("New link generated — the old one no longer works.");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="grid size-10 place-items-center rounded-full bg-[var(--birch-wood)] font-mono text-sm font-bold text-[var(--midnight-navy)]"
          >
            {initials(player.display_name)}
          </span>
          <div className="flex-1">
            <div className="font-medium">{player.display_name}</div>
            <div className="eyebrow text-muted-foreground">Managed by you</div>
          </div>
          <span className="rounded-full border border-[var(--swedish-blue)]/40 bg-[var(--swedish-blue)]/10 px-2.5 py-1 font-mono text-[10px] font-bold tracking-widest text-[var(--swedish-blue)]">
            UNCLAIMED
          </span>
        </div>

        <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-background p-4">
          {qr ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={qr}
              alt={`QR code for ${player.display_name}'s claim link`}
              className="size-40 rounded"
            />
          ) : (
            <div className="size-40 animate-pulse rounded bg-muted" />
          )}
          <div className="flex w-full items-center gap-2">
            <Input
              readOnly
              value={claimUrl}
              aria-label="Claim link"
              className="font-mono text-xs"
              onFocus={(e) => e.currentTarget.select()}
            />
            <Button type="button" variant="outline" size="sm" onClick={copyLink}>
              Copy
            </Button>
          </div>
          <p className="eyebrow text-muted-foreground">
            Single use · Expires in {daysLeft(player.expires_at)} days
          </p>
        </div>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-fit"
          onClick={regenerate}
          disabled={regenerating}
        >
          {regenerating ? "Regenerating…" : "Regenerate link"}
        </Button>
      </CardContent>
    </Card>
  );
}
