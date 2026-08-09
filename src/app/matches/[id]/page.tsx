import { notFound, redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getMatchState } from "@/lib/supabase/matches";
import { MatchClient } from "@/components/match-client";

export default async function MatchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?redirectTo=/matches/${id}`);

  const state = await getMatchState(id);
  if (!state) notFound();

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-12">
      <MatchClient matchId={id} initial={state} myUserId={user.id} />
    </div>
  );
}
