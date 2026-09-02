"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { claimMatchedProfile } from "@/app/onboarding/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Onboarding prompt shown when a new signup's email matches an unclaimed managed
 * profile an organizer created for them. One-tap claim (never silent) or dismiss.
 */
export function ClaimMatchedCard({
  displayName,
  matchCount,
}: {
  displayName: string;
  matchCount: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [dismissed, setDismissed] = useState(false);

  const firstName = displayName.trim().split(/\s+/)[0] || displayName;
  if (dismissed) return null;

  function claim() {
    start(async () => {
      const res = await claimMatchedProfile();
      if (res?.error) {
        toast.error(res.error);
        return;
      }
      toast.success(`Claimed ${firstName}'s profile — your history is linked.`);
      // Refresh so the (now-claimed) card drops out and onboarding continues.
      router.refresh();
    });
  }

  return (
    <Card className="mb-5 border-[var(--swedish-blue)]/40 bg-[var(--swedish-blue)]/5">
      <CardContent className="flex flex-col gap-3 py-4">
        <span className="eyebrow text-muted-foreground">We found your profile</span>
        <p className="text-sm">
          An organizer set up a profile for{" "}
          <span className="font-semibold">{displayName}</span>
          {matchCount > 0
            ? ` with ${matchCount} recorded ${matchCount === 1 ? "match" : "matches"}`
            : ""}
          . Is this you?
        </p>
        <div className="flex gap-2">
          <Button onClick={claim} disabled={pending} className="flex-1">
            {pending ? "Claiming…" : "Yes, claim it"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setDismissed(true)}
            disabled={pending}
          >
            Not me
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
