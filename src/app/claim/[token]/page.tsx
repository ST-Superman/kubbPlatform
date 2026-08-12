import { Suspense } from "react";
import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { ClaimConfirm } from "@/components/claim-confirm";
import { OAuthButtons } from "@/components/oauth-buttons";
import { InfoDot } from "@/components/info-dot";
import { RequestFreshLink } from "@/components/request-fresh-link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type Preview = {
  status: "ok" | "already_claimed" | "expired" | "not_found";
  display_name?: string;
  claimed_at?: string;
  masked_handle?: string;
  matches?: { created_at: string; opponent: string | null; result: "won" | "lost" | null }[];
};

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex max-w-md flex-col px-4 py-12 sm:py-16">{children}</div>
  );
}

export default async function ClaimPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ next?: string }>;
}) {
  const { token } = await params;
  const { next: nextRaw } = await searchParams;
  // Same-origin only; where to land the invitee after they claim (e.g. the match).
  const next =
    nextRaw && nextRaw.startsWith("/") && !nextRaw.startsWith("//")
      ? nextRaw
      : undefined;
  // Preserve `next` across sign-up/sign-in so they return to this claim page, then on.
  const claimPath = `/claim/${token}${next ? `?next=${encodeURIComponent(next)}` : ""}`;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase.rpc("claim_preview", {
    p_claim_token: token,
  });
  const preview = (data as Preview | null) ?? { status: "not_found" };

  if (error || preview.status === "not_found") {
    return (
      <Shell>
        <Card>
          <CardHeader>
            <span className="eyebrow text-muted-foreground">LINK INVALID</span>
            <CardTitle className="display text-2xl">
              This claim link isn&apos;t valid
            </CardTitle>
            <CardDescription>
              The link may be mistyped or has been replaced. Ask your match
              organizer for a fresh one.{" "}
              <InfoDot title="Match organizer">The match organizer is the person who sent you the invite.</InfoDot>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/" className={cn(buttonVariants({ variant: "outline" }))}>
              Go to Kubb Portal
            </Link>
          </CardContent>
        </Card>
      </Shell>
    );
  }

  const name = preview.display_name ?? "this player";
  const firstName = name.trim().split(/\s+/)[0] || name;

  if (preview.status === "expired") {
    return (
      <Shell>
        <Card>
          <CardHeader>
            <span className="eyebrow text-muted-foreground">LINK EXPIRED</span>
            <CardTitle className="display text-2xl">
              This claim link expired
            </CardTitle>
            <CardDescription>
              Claim links are single-use and expire after 30 days. Your results
              are safe — ask the organizer for a fresh link.{" "}
              <InfoDot title="Match organizer">The match organizer is the person who sent you the invite.</InfoDot>
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <RequestFreshLink token={token} />
            <Link href="/" className={cn(buttonVariants({ variant: "outline" }))}>
              Go to Kubb Portal
            </Link>
          </CardContent>
        </Card>
      </Shell>
    );
  }

  if (preview.status === "already_claimed") {
    const when = preview.claimed_at
      ? new Date(preview.claimed_at).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        })
      : null;
    return (
      <Shell>
        <Card>
          <CardHeader>
            <span className="eyebrow text-muted-foreground">
              LINK ALREADY USED
            </span>
            <CardTitle className="display text-2xl">
              This identity was claimed
            </CardTitle>
            <CardDescription>
              {name} was claimed
              {when ? ` on ${when}` : ""}
              {preview.masked_handle ? ` (@${preview.masked_handle})` : ""}. If
              that wasn&apos;t you, ask your match organizer to review it.{" "}
              <InfoDot title="Match organizer">The match organizer is the person who sent you the invite.</InfoDot>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/" className={cn(buttonVariants({ variant: "outline" }))}>
              Go to Kubb Portal
            </Link>
          </CardContent>
        </Card>
      </Shell>
    );
  }

  // status === "ok"
  return (
    <Shell>
      <Card>
        <CardHeader>
          <span className="flex items-center gap-1.5 eyebrow text-muted-foreground">
            CLAIM YOUR IDENTITY
            <InfoDot title="Claim your identity">Your player profile has already been created. Confirm this is you and welcome to the Kubb Portal.</InfoDot>
          </span>
          <CardTitle className="display text-3xl">
            You played kubb as {firstName}
          </CardTitle>
          <CardDescription>
            Claim this identity to keep your results and play under your own
            account — anywhere, on any device.{" "}
            <InfoDot title="Why claim?">You may have already played a game of kubb that another user recorded. Claiming connects that result to your profile.</InfoDot>
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {preview.matches && preview.matches.length > 0 ? (
            <div className="flex flex-col gap-1.5 rounded-xl border border-border bg-muted/30 p-3">
              <span className="eyebrow text-[9px] text-muted-foreground">RECORDED MATCHES</span>
              {preview.matches.map((mm, i) => (
                <div key={i} className="flex items-center gap-2 text-[12px]">
                  <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                    {new Date(mm.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </span>
                  <span className="min-w-0 flex-1 truncate">vs {mm.opponent ?? "—"}</span>
                  <span
                    className={cn(
                      "shrink-0 font-mono text-[9px] font-bold tracking-widest",
                      mm.result === "won"
                        ? "text-[var(--dark-forest)]"
                        : "text-muted-foreground",
                    )}
                  >
                    {mm.result ? mm.result.toUpperCase() : "—"}
                  </span>
                </div>
              ))}
              <p className="mt-1 text-[11px] text-muted-foreground">
                Claiming this player connects these results to your Kubb Portal profile.
              </p>
            </div>
          ) : null}
          {user ? (
            <ClaimConfirm token={token} displayName={name} next={next} userEmail={user.email ?? undefined} />
          ) : (
            <div className="flex flex-col gap-3">
              <Suspense>
                <OAuthButtons redirectTo={claimPath} />
              </Suspense>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="h-px flex-1 bg-border" />
                OR
                <span className="h-px flex-1 bg-border" />
              </div>
              <Link
                href={`/signup?redirectTo=${encodeURIComponent(claimPath)}&name=${encodeURIComponent(name)}`}
                className={cn(buttonVariants({ variant: "outline" }), "w-full")}
              >
                Claim as {firstName} with email
              </Link>
              <Link
                href={`/login?redirectTo=${encodeURIComponent(claimPath)}`}
                className={cn(buttonVariants({ variant: "ghost" }), "w-full")}
              >
                I already have an account
              </Link>
              <p className="text-center text-xs text-muted-foreground">
                Not {firstName}? Just close this page — nothing happens.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </Shell>
  );
}
