"use client";

import { useState, useTransition } from "react";

import { claimPlayer } from "@/app/claim/[token]/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const ADMIN_EMAIL = "sathomps@gmail.com";

export function ClaimConfirm({
  token,
  displayName,
  next,
  userEmail,
}: {
  token: string;
  displayName: string;
  next?: string;
  userEmail?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>("");
  const [code, setCode] = useState<string>("");

  const firstName = displayName.trim().split(/\s+/)[0] || displayName;
  const alreadyClaimed = code === "account_already_claimed_identity";

  const mergeHref = (() => {
    const subject = "Kubb Platform — merge player identities";
    const body =
      `I'd like to merge two player identities on the Kubb Platform.\n\n` +
      `Player I'm trying to claim: ${displayName} (claim token: ${token})\n` +
      `My account: ${userEmail ?? "(my signed-in account)"}\n\n` +
      `Additional comments:\n`;
    return `mailto:${ADMIN_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  })();

  function claim() {
    setError("");
    setCode("");
    startTransition(async () => {
      // Resolves only on error; success redirects server-side.
      const res = await claimPlayer(token, next);
      if (res?.error) {
        setError(res.error);
        setCode(res.code ?? "");
      }
    });
  }

  if (alreadyClaimed) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          Only one player profile can be claimed by a single account. If this
          player profile is also you, contact the administrator to help resolve
          it.
        </p>
        <a href={mergeHref} className={cn(buttonVariants(), "w-full")}>
          Email the administrator
        </a>
        <p className="eyebrow text-center text-muted-foreground">
          We&apos;ll help merge the identities
        </p>
      </div>
    );
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
