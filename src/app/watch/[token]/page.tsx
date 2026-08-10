import { notFound } from "next/navigation";

import { getMatchStateByToken } from "@/lib/supabase/matches";
import { SpectatorView } from "@/components/spectator-view";

// Public — no auth required (spectate token grants read access). See proxy public routes.
export default async function WatchPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const state = await getMatchStateByToken(token);
  if (!state) notFound();

  return <SpectatorView token={token} initial={state} />;
}
