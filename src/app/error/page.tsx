import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function AuthErrorPage() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-6 px-4 py-24 text-center">
      <span className="eyebrow text-destructive">SOMETHING WENT WRONG</span>
      <h1 className="display text-3xl font-medium">
        We couldn&apos;t complete that
      </h1>
      <p className="text-muted-foreground">
        Your confirmation link may have expired or already been used. Try
        signing in again, or request a fresh link.
      </p>
      <div className="flex gap-3">
        <Link href="/login" className={cn(buttonVariants())}>
          Back to sign in
        </Link>
        <Link href="/" className={cn(buttonVariants({ variant: "outline" }))}>
          Home
        </Link>
      </div>
    </div>
  );
}
