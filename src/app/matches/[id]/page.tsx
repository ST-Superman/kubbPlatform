import { notFound, redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getMatchState, getBotMatchContext } from "@/lib/supabase/matches";
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

  const [state, botCtx] = await Promise.all([getMatchState(id), getBotMatchContext(id)]);
  if (!state) notFound();

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-12">
      <MatchClient matchId={id} initial={state} myUserId={user.id} botCtx={botCtx} />
    </div>
  );
}
