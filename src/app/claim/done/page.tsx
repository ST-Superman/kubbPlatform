import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function ClaimDonePage({
  searchParams,
}: {
  searchParams: Promise<{ name?: string }>;
}) {
  const { name } = await searchParams;
  const displayName = (name ?? "").trim();
  const firstName = displayName.split(/\s+/)[0] || "you";

  return (
    <div className="mx-auto flex max-w-md flex-col px-4 py-12 sm:py-16">
      <Card>
        <CardHeader>
          <span
            aria-hidden
            className="mb-2 grid size-12 place-items-center rounded-full bg-[var(--dark-forest)]/10 text-2xl text-[var(--dark-forest)]"
          >
            ✓
          </span>
          <span className="eyebrow text-[var(--dark-forest)]">
            IDENTITY CLAIMED
          </span>
          <CardTitle className="display text-3xl">
            Welcome, {firstName}
          </CardTitle>
          <CardDescription>
            Welcome to the Kubb Portal. Feel free to organize your own
            matches, or wait for another match invite.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Link href="/profile" className={cn(buttonVariants(), "w-full")}>
            Go to your profile
          </Link>
          <Link
            href="/dashboard"
            className={cn(buttonVariants({ variant: "ghost" }), "w-full")}
          >
            Back to your dashboard
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
