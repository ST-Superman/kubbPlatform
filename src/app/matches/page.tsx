import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getMyMatches, getOpponents } from "@/lib/supabase/matches";
import { MatchesClient } from "@/components/matches-client";

export default async function MatchesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirectTo=/matches");

  const [matches, opponents] = await Promise.all([
    getMyMatches(),
    getOpponents(),
  ]);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-16">
      <div>
        <span className="eyebrow text-muted-foreground">MATCHES</span>
        <h1 className="display mt-2 text-3xl font-medium">Play a match</h1>
        <p className="mt-2 max-w-prose text-sm text-muted-foreground">
          Start a 1v1 against another player, then score it live from two devices.
          This is spike scaffolding to exercise the match engine.
        </p>
      </div>
      <MatchesClient initial={matches} opponents={opponents} />
    </div>
  );
}
