import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getMyChallenges } from "@/lib/supabase/challenges";
import { ChallengeInbox } from "@/components/challenge-inbox";

export default async function ChallengesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirectTo=/challenges");

  const challenges = await getMyChallenges();

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-12 sm:py-16">
      <div>
        <span className="eyebrow text-muted-foreground">CHALLENGES</span>
        <h1 className="display mt-2 text-3xl font-medium">Your challenges</h1>
        <p className="mt-2 max-w-prose text-sm text-muted-foreground">
          Challenges you&rsquo;ve received and ones you&rsquo;ve sent. Accept to start the
          match, decline to pass, or cancel one you sent.
        </p>
      </div>

      {challenges.length > 0 ? (
        <ChallengeInbox initial={challenges} />
      ) : (
        <p className="text-sm text-muted-foreground">
          No pending challenges.{" "}
          <Link href="/matches" className="font-semibold text-primary underline-offset-4 hover:underline">
            Start a match
          </Link>{" "}
          to challenge someone.
        </p>
      )}
    </div>
  );
}
