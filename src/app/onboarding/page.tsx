import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { OnboardingForm } from "@/components/onboarding-form";
import { ClaimMatchedCard } from "@/components/claim-matched-card";
import { LogoImage, LogoMark } from "@/components/brand";

function safeNext(v: string | undefined): string {
  return v && v.startsWith("/") && !v.startsWith("//") ? v : "/dashboard";
}

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next: rawNext } = await searchParams;
  const next = safeNext(rawNext);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?redirectTo=/onboarding`);

  const { data: prof } = await supabase
    .from("profiles")
    .select("handle, display_name, onboarded_at")
    .eq("id", user.id)
    .maybeSingle();

  // Already onboarded (or somehow missing) → don't show the step again.
  if (!prof || prof.onboarded_at) redirect(next);

  // The auto-generated handle can contain a hyphen; sanitize to a valid suggestion.
  const suggestedHandle = String(prof.handle ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .slice(0, 30);
  const isClaim = next.startsWith("/claim");

  // If this new account's email matches an unclaimed managed profile an organizer
  // set up, offer a one-tap claim (skip when they're already mid-claim of a token).
  const claimable = isClaim
    ? null
    : ((await supabase.rpc("my_claimable_profile")).data as {
        player_id: string;
        display_name: string;
        match_count: number;
      } | null);

  return (
    <div className="mx-auto flex max-w-md flex-col px-6 py-12 sm:py-16">
      <div className="flex flex-col items-center text-center">
        <LogoImage size={44} className="dark:hidden" />
        <LogoMark size={52} className="hidden dark:grid" />
        <h1 className="display mt-3 text-[27px] italic tracking-[-0.8px]">
          {isClaim ? "Confirm your profile" : "Finish your profile"}
        </h1>
        <p className="mt-1.5 text-[13.5px] text-muted-foreground">
          Pick how your name and handle appear on the Kubb Portal.
        </p>
      </div>

      <div className="mt-6">
        {claimable ? (
          <ClaimMatchedCard
            displayName={claimable.display_name}
            matchCount={claimable.match_count}
          />
        ) : null}
        <OnboardingForm
          initialHandle={suggestedHandle}
          initialName={prof.display_name ?? ""}
          next={next}
        />
      </div>
    </div>
  );
}
