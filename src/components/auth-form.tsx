"use client";

import { useActionState, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { type AuthState } from "@/app/auth/actions";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { ctaClass } from "@/components/brand";

type Props = {
  mode: "login" | "signup";
  action: (prev: AuthState, formData: FormData) => Promise<AuthState>;
};

// h-12 / 16px inputs: the 16px font is the mobile fix — iOS Safari zooms on focus
// for anything smaller. `md:text-base` overrides the shared Input's `md:text-sm`.
const FIELD =
  "h-12 rounded-[12px] border-input bg-card px-[14px] text-base md:text-base";
const LABEL = "eyebrow text-[9.5px] text-muted-foreground";

export function AuthForm({ mode, action }: Props) {
  const [state, formAction, pending] = useActionState<AuthState, FormData>(
    action,
    undefined,
  );
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirectTo") ?? "/dashboard";
  const [email, setEmail] = useState("");

  const isLogin = mode === "login";

  async function forgotPassword() {
    if (!email.trim()) {
      toast.error("Enter your email first, then tap Forgot.");
      return;
    }
    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });
    if (error) toast.error(error.message);
    else toast.success("Check your email for a reset link.");
  }

  return (
    <form action={formAction} className="flex flex-col gap-3.5">
      <input type="hidden" name="redirectTo" value={redirectTo} />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className={LABEL}>
          EMAIL
        </label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={FIELD}
          required
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between">
          <label htmlFor="password" className={LABEL}>
            PASSWORD
          </label>
          {isLogin ? (
            <button
              type="button"
              onClick={forgotPassword}
              className="text-[12px] font-semibold text-primary"
            >
              Forgot?
            </button>
          ) : null}
        </div>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete={isLogin ? "current-password" : "new-password"}
          placeholder="••••••••"
          minLength={6}
          className={FIELD}
          required
        />
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

      <button type="submit" disabled={pending} className={`${ctaClass("primary")} mt-1`}>
        {pending
          ? isLogin
            ? "SIGNING IN…"
            : "CREATING ACCOUNT…"
          : isLogin
            ? "SIGN IN"
            : "CREATE ACCOUNT"}
      </button>
    </form>
  );
}
