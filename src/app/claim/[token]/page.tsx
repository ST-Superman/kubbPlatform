import { Suspense } from "react";
import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { ClaimConfirm } from "@/components/claim-confirm";
import { OAuthButtons } from "@/components/oauth-buttons";
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
              organizer for a fresh one.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/" className={cn(buttonVariants({ variant: "outline" }))}>
              Go to kubb.coach
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
              are safe — ask the organizer for a fresh link.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/" className={cn(buttonVariants({ variant: "outline" }))}>
              Go to kubb.coach
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
              that wasn&apos;t you, ask your match organizer to review it.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/" className={cn(buttonVariants({ variant: "outline" }))}>
              Go to kubb.coach
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
          <span className="eyebrow text-muted-foreground">
            CLAIM YOUR IDENTITY
          </span>
          <CardTitle className="display text-3xl">
            You played kubb as {firstName}
          </CardTitle>
          <CardDescription>
            Claim this identity to keep your results and play under your own
            account — anywhere, on any device.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {user ? (
            <ClaimConfirm token={token} displayName={name} next={next} />
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
                href={`/signup?redirectTo=${encodeURIComponent(claimPath)}`}
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
