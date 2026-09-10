"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

/**
 * Challenge-email opt-out toggle. Optimistic — flips immediately, reverts on error.
 * Writes through set_challenge_emails (SECURITY DEFINER, self-only), matching the
 * app's "all writes via RPC" pattern.
 */
export function NotificationSettings({
  initialChallengeEmails,
}: {
  initialChallengeEmails: boolean;
}) {
  const [on, setOn] = useState(initialChallengeEmails);
  const [pending, start] = useTransition();

  function toggle() {
    const next = !on;
    setOn(next); // optimistic
    start(async () => {
      const supabase = createClient();
      const { error } = await supabase.rpc("set_challenge_emails", { p_on: next });
      if (error) {
        setOn(!next); // revert
        toast.error("Couldn’t save that — try again.");
        return;
      }
      toast.success(next ? "Challenge emails on" : "Challenge emails off");
    });
  }

  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <div className="text-sm font-semibold">Challenge emails</div>
        <p className="mt-0.5 text-sm text-muted-foreground">
          An email when another player challenges you to a match.
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label="Challenge emails"
        onClick={toggle}
        disabled={pending}
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60",
          on ? "bg-primary" : "bg-input",
        )}
      >
        <span
          className={cn(
            "inline-block size-5 rounded-full bg-white shadow transition-transform",
            on ? "translate-x-[22px]" : "translate-x-0.5",
          )}
        />
      </button>
    </div>
  );
}
