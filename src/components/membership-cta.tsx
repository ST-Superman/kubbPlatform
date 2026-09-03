"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

/**
 * Starts Stripe Checkout: POSTs to the checkout route and sends the browser to the
 * returned Session URL. Web-only surface — never mirrored into the iOS app (Apple
 * reader-model rule: no price/buy button in-app).
 */
export function MembershipCta({ label }: { label: string }) {
  const [pending, start] = useTransition();

  function go() {
    start(async () => {
      try {
        const res = await fetch("/api/stripe/checkout", { method: "POST" });
        const data = (await res.json()) as { url?: string; error?: string };
        if (!res.ok || !data.url) {
          toast.error(data.error ?? "Couldn't start checkout. Please try again.");
          return;
        }
        window.location.href = data.url;
      } catch {
        toast.error("Couldn't start checkout. Please try again.");
      }
    });
  }

  return (
    <Button onClick={go} disabled={pending} className="w-full sm:w-fit">
      {pending ? "Starting checkout…" : label}
    </Button>
  );
}
