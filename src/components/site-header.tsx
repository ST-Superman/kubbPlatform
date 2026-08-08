import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/profiles";
import { signout } from "@/app/auth/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

export async function SiteHeader() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const profile = user ? await getMyProfile() : null;

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2">
          <span
            aria-hidden
            className="grid h-8 w-8 place-items-center rounded-full bg-primary text-primary-foreground"
          >
            ♚
          </span>
          <span className="eyebrow text-foreground">KUBB PLATFORM</span>
        </Link>

        <nav className="flex items-center gap-2">
          <ThemeToggle />
          {user ? (
            <>
              {profile ? (
                <span className="hidden font-mono text-xs text-muted-foreground sm:inline">
                  @{profile.handle}
                </span>
              ) : null}
              <Link
                href="/dashboard"
                className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
              >
                Dashboard
              </Link>
              <Link
                href="/players"
                className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
              >
                Players
              </Link>
              <Link
                href="/profile"
                className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
              >
                Profile
              </Link>
              <form action={signout}>
                <Button type="submit" variant="outline" size="sm">
                  Sign out
                </Button>
              </form>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
              >
                Sign in
              </Link>
              <Link href="/signup" className={cn(buttonVariants({ size: "sm" }))}>
                Sign up
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
