"use client";

import { useState, useTransition } from "react";
import QRCode from "qrcode";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import { type Participant, type Side } from "@/lib/supabase/matches";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet } from "@/components/ui/sheet";

const opp = (x: Side): Side => (x === "A" ? "B" : "A");
const firstName = (n: string | null | undefined) => (n ?? "player").split(/\s+/)[0];

export function MatchInvite({
  matchId,
  participants,
  myUserId,
}: {
  matchId: string;
  participants: Partial<Record<Side, Participant>>;
  myUserId: string;
}) {
  const [pending, start] = useTransition();
  const [open, setOpen] = useState<null | { title: string; url: string; qr: string }>(null);

  const amParticipant =
    participants.A?.user_id === myUserId || participants.B?.user_id === myUserId;
  // A side I can invite: managed (no account) whose opposite side is my account.
  const inviteSide = (["A", "B"] as const).find(
    (x) => participants[x]?.user_id == null && participants[opp(x)]?.user_id === myUserId,
  );
  const inviteName = inviteSide ? participants[inviteSide]?.display_name ?? "opponent" : null;

  if (!amParticipant && !inviteSide) return null;

  async function show(title: string, url: string) {
    let qr = "";
    try {
      qr = await QRCode.toDataURL(url, { width: 176, margin: 1 });
    } catch {
      /* QR is best-effort */
    }
    setOpen({ title, url, qr });
  }

  function invite() {
    if (!inviteSide) return;
    const playerId = participants[inviteSide]?.player_id;
    if (!playerId) return;
    start(async () => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("get_claim_link", { p_player_id: playerId });
      const token = (data as { claim_token?: string } | null)?.claim_token;
      if (error || !token) {
        toast.error("Only the organizer can invite this player.");
        return;
      }
      const url = `${window.location.origin}/claim/${token}?next=/matches/${matchId}`;
      await show(`Invite ${firstName(inviteName)} to play`, url);
    });
  }

  function shareWatch() {
    start(async () => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("create_spectate_link", { p_match_id: matchId });
      const token = (data as { token?: string } | null)?.token;
      if (error || !token) {
        toast.error("Couldn't create a watch link.");
        return;
      }
      await show("Share to watch", `${window.location.origin}/watch/${token}`);
    });
  }

  async function copy() {
    if (!open) return;
    try {
      await navigator.clipboard.writeText(open.url);
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy — select the link and copy it manually.");
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {inviteSide ? (
        <Button variant="outline" size="sm" disabled={pending} onClick={invite}>
          Invite {firstName(inviteName)} to play
        </Button>
      ) : null}
      {amParticipant ? (
        <Button variant="ghost" size="sm" disabled={pending} onClick={shareWatch}>
          Share to watch
        </Button>
      ) : null}

      <Sheet open={open != null} onClose={() => setOpen(null)} title={open?.title}>
        {open ? (
          <div className="flex flex-col items-center gap-4 px-4 pt-1 pb-4">
            <span className="eyebrow text-muted-foreground">{open.title}</span>
            {open.qr ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={open.qr} alt="QR code for the link" className="size-44 rounded" />
            ) : null}
            <div className="flex w-full items-center gap-2">
              <Input
                readOnly
                value={open.url}
                aria-label="Share link"
                className="font-mono text-xs"
                onFocus={(e) => e.currentTarget.select()}
              />
              <Button type="button" variant="outline" size="sm" onClick={copy}>
                Copy
              </Button>
            </div>
            {open.title.startsWith("Invite") ? (
              <p className="text-center text-xs text-muted-foreground">
                They sign up, claim this side, and land right in the match.
              </p>
            ) : (
              <p className="text-center text-xs text-muted-foreground">
                Anyone with this link can watch live — no account needed.
              </p>
            )}
          </div>
        ) : null}
      </Sheet>
    </div>
  );
}
