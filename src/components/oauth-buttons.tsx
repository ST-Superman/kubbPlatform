"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";

type Provider = "google" | "apple";

const BTN =
  "flex h-12 w-full items-center justify-center gap-2.5 rounded-[12px] border border-border bg-card text-[14px] font-semibold transition-colors hover:bg-muted disabled:opacity-50";

export function OAuthButtons({ redirectTo }: { redirectTo?: string } = {}) {
  const [pending, setPending] = useState<Provider | null>(null);
  const searchParams = useSearchParams();
  // An explicit prop wins over the query string — the claim landing carries its
  // token in the path, so it passes redirectTo directly.
  const rawNext = redirectTo ?? searchParams.get("redirectTo") ?? "/dashboard";
  const next =
    rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/dashboard";

  async function signIn(provider: Provider) {
    setPending(provider);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    // On success the browser is already redirecting to the provider; only errors land here.
    if (error) {
      setPending(null);
      const label = provider === "google" ? "Google" : "Apple";
      toast.error(
        error.message.includes("provider is not enabled")
          ? `${label} sign-in isn't configured yet.`
          : error.message,
      );
    }
  }

  return (
    <div className="flex flex-col gap-2.5">
      <button
        type="button"
        onClick={() => signIn("google")}
        disabled={pending !== null}
        className={BTN}
      >
        <svg aria-hidden width="18" height="18" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M23.5 12.3c0-.9-.1-1.5-.3-2.2H12v4.1h6.5c-.1 1.1-.8 2.7-2.4 3.8l3.7 2.9c2.3-2.1 3.7-5.1 3.7-8.6z" />
          <path fill="#34A853" d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.7-2.9c-1 .7-2.4 1.2-4.2 1.2-3.2 0-6-2.1-6.9-5.1l-3.9 3C3.2 21.2 7.3 24 12 24z" />
          <path fill="#FBBC05" d="M5.1 14.3c-.3-.7-.4-1.5-.4-2.3s.1-1.6.4-2.3l-3.9-3C.4 8.3 0 10.1 0 12s.4 3.7 1.2 5.3l3.9-3z" />
          <path fill="#EA4335" d="M12 4.7c1.8 0 3 .8 3.7 1.4L19 2.9C17 1.1 14.7 0 12 0 7.3 0 3.2 2.8 1.2 6.7l3.9 3c.9-3 3.7-5 6.9-5z" />
        </svg>
        Continue with Google
      </button>

      <button
        type="button"
        onClick={() => signIn("apple")}
        disabled={pending !== null}
        className={BTN}
      >
        <svg aria-hidden viewBox="0 0 384 512" className="h-4 w-4 fill-foreground">
          <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
        </svg>
        Continue with Apple
      </button>
    </div>
  );
}
