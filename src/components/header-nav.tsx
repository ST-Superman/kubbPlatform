"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { signout } from "@/app/auth/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { Sheet } from "@/components/ui/sheet";
import { LogoMark } from "@/components/brand";
import { InfoDot } from "@/components/info-dot";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/matches", label: "Matches" },
  { href: "/players", label: "Players" },
  { href: "/profile", label: "Profile" },
];

export function HeaderNav({ authed, handle }: { authed: boolean; handle: string | null }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <>
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 pt-[env(safe-area-inset-top)] backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:h-16">
        <Link href="/" className="flex items-center gap-2.5" onClick={() => setOpen(false)}>
          <LogoMark size={30} />
          <span className="eyebrow text-foreground">KUBB PORTAL</span>
        </Link>

        {authed ? (
          <>
            {/* Desktop / tablet: inline nav */}
            <nav className="hidden items-center gap-2 md:flex">
              {handle ? (
                <span className="flex items-center gap-1 font-mono text-xs text-muted-foreground">
                  @{handle}
                  <InfoDot term="handle" />
                </span>
              ) : null}
              {LINKS.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
                >
                  {l.label}
                </Link>
              ))}
              <ThemeToggle />
              <form action={signout}>
                <Button type="submit" variant="outline" size="sm">
                  Sign out
                </Button>
              </form>
            </nav>

            {/* Mobile: theme toggle + hamburger */}
            <div className="flex items-center gap-1 md:hidden">
              <ThemeToggle />
              <button
                type="button"
                aria-label="Open menu"
                aria-expanded={open}
                onClick={() => setOpen(true)}
                className="grid size-10 place-items-center rounded-lg text-foreground"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </svg>
              </button>
            </div>
          </>
        ) : (
          <div className="flex items-center gap-3">
            <ThemeToggle />
            {pathname === "/login" ? (
              <Link href="/signup" className="font-mono text-[10px] font-bold tracking-[1.2px] text-primary">
                SIGN UP
              </Link>
            ) : (
              <Link href="/login" className="font-mono text-[10px] font-bold tracking-[1.2px] text-primary">
                SIGN IN
              </Link>
            )}
          </div>
        )}
      </div>
    </header>

      {/* Mobile drawer — rendered OUTSIDE <header> so the header's backdrop-blur
          (which becomes the containing block for position:fixed) can't clip it */}
      <Sheet open={open} onClose={() => setOpen(false)} side="right" title="Menu">
        <div className="flex flex-col gap-1 p-4 pt-[max(1rem,env(safe-area-inset-top))]">
          <div className="flex items-center justify-between pb-2">
            <span className="eyebrow text-muted-foreground">
              {handle ? `@${handle}` : "MENU"}
            </span>
            <button
              type="button"
              aria-label="Close menu"
              onClick={() => setOpen(false)}
              className="grid size-9 place-items-center rounded-lg text-muted-foreground"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="6" y1="6" x2="18" y2="18" />
                <line x1="18" y1="6" x2="6" y2="18" />
              </svg>
            </button>
          </div>
          {LINKS.map((l) => {
            const activeLink = pathname === l.href || pathname.startsWith(l.href + "/");
            return (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className={cn(
                  "rounded-xl px-4 py-3 text-base font-medium",
                  activeLink ? "bg-muted text-foreground" : "text-foreground hover:bg-muted",
                )}
              >
                {l.label}
              </Link>
            );
          })}
          <form action={signout} className="mt-2">
            <Button type="submit" variant="outline" className="w-full">
              Sign out
            </Button>
          </form>
        </div>
      </Sheet>
    </>
  );
}
