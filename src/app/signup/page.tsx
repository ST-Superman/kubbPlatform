import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { signup } from "@/app/auth/actions";
import { AuthForm } from "@/components/auth-form";
import { OAuthButtons } from "@/components/oauth-buttons";
import { LogoImage, LogoMark } from "@/components/brand";

export default async function SignupPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/dashboard");

  return (
    <div className="mx-auto flex max-w-md flex-col px-6 py-12 sm:py-16">
      <div className="flex flex-col items-center text-center">
        <LogoImage size={44} className="dark:hidden" />
        <LogoMark size={52} className="hidden dark:grid" />
        <h1 className="display mt-3 text-[27px] italic tracking-[-0.8px]">Welcome to the Kubb Portal!</h1>
        <p className="mt-1.5 text-[13.5px] text-muted-foreground">
          Let&apos;s play some Kubb.
        </p>
      </div>

      <div className="mt-6 flex flex-col gap-5">
        <Suspense>
          <AuthForm mode="signup" action={signup} />
          <div className="flex items-center gap-3">
            <span className="h-px flex-1 bg-border" />
            <span className="eyebrow text-[9px] text-muted-foreground">OR</span>
            <span className="h-px flex-1 bg-border" />
          </div>
          <OAuthButtons />
        </Suspense>
        <p className="text-center text-[11px] text-muted-foreground">
          By creating an account you agree to our{" "}
          <Link href="/terms" className="underline underline-offset-4 hover:text-foreground">
            Terms
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="underline underline-offset-4 hover:text-foreground">
            Privacy Policy
          </Link>
          .
        </p>
        <p className="text-center text-[13px] text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-primary underline-offset-4 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
