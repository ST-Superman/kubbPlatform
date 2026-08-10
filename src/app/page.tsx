import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="mx-auto flex max-w-3xl flex-col items-center px-4 py-16 text-center sm:py-24">
      <span className="eyebrow text-muted-foreground">
        COMPETITIVE KUBB, ONLINE
      </span>
      <h1 className="display mt-4 text-4xl font-medium text-foreground sm:text-6xl">
        Where kubb lives online
      </h1>
      <p className="mt-6 max-w-xl text-base text-muted-foreground sm:text-lg">
        Friendly matches, leagues, tournaments, and profiles — for anyone, on any
        device. This is the Phase&nbsp;0 foundation of the platform.
      </p>

      <div className="mt-10 flex w-full flex-col items-stretch justify-center gap-3 sm:w-auto sm:flex-row sm:items-center">
        {user ? (
          <Link href="/dashboard" className={cn(buttonVariants({ size: "lg" }), "w-full sm:w-auto")}>
            Go to your dashboard
          </Link>
        ) : (
          <>
            <Link href="/signup" className={cn(buttonVariants({ size: "lg" }), "w-full sm:w-auto")}>
              Create an account
            </Link>
            <Link
              href="/login"
              className={cn(buttonVariants({ size: "lg", variant: "outline" }), "w-full sm:w-auto")}
            >
              Sign in
            </Link>
          </>
        )}
      </div>

      <p className="mt-16 text-sm text-muted-foreground">
        {user
          ? `Signed in as ${user.email}`
          : "Auth, theming, and the app shell are wired up — the match engine comes in Phase 2."}
      </p>
    </div>
  );
}
