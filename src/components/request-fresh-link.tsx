"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** On an expired claim link, lets the (signed-out) visitor flag it for the organizer. */
export function RequestFreshLink({ token }: { token: string }) {
  const [sent, setSent] = useState(false);
  const [pending, start] = useTransition();

  function request() {
    start(async () => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("request_fresh_link", {
        p_claim_token: token,
      });
      const status = (data as { status?: string } | null)?.status;
      if (error || status !== "ok") {
        toast.error("Couldn't send the request — please try again.");
        return;
      }
      setSent(true);
    });
  }

  if (sent) {
    return (
      <p className="text-sm font-medium text-[var(--dark-forest)]">
        Request sent — your match organizer will send you a new link.
      </p>
    );
  }

  return (
    <button
      type="button"
      onClick={request}
      disabled={pending}
      className={cn(buttonVariants(), "w-full")}
    >
      {pending ? "Sending…" : "Request a fresh link"}
    </button>
  );
}
