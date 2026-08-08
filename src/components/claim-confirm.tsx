"use client";

import { useState, useTransition } from "react";

import { claimPlayer } from "@/app/claim/[token]/actions";
import { Button } from "@/components/ui/button";

export function ClaimConfirm({
  token,
  displayName,
}: {
  token: string;
  displayName: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>("");

  const firstName = displayName.trim().split(/\s+/)[0] || displayName;

  function claim() {
    setError("");
    startTransition(async () => {
      // Resolves only on error; success redirects server-side.
      const res = await claimPlayer(token);
      if (res?.error) setError(res.error);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <Button onClick={claim} disabled={pending} className="w-full">
        {pending ? "Claiming…" : `Claim as ${firstName}`}
      </Button>
      <p className="eyebrow text-center text-muted-foreground">
        Claiming binds this identity to your account
      </p>
    </div>
  );
}
