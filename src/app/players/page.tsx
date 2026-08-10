import { redirect } from "next/navigation";
import { headers } from "next/headers";

import { createClient } from "@/lib/supabase/server";
import { getMyManagedPlayers, getActivePlayers } from "@/lib/supabase/players";
import { PlayersTabs } from "@/components/players-tabs";

export default async function PlayersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirectTo=/players");

  const [managed, active] = await Promise.all([
    getMyManagedPlayers(),
    getActivePlayers(),
  ]);

  // Absolute base for claim/invite links, derived from the request (origin header
  // is absent on plain GET navigations).
  const h = await headers();
  const host = h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const baseUrl = host ? `${proto}://${host}` : "";

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-12 sm:py-16">
      <div>
        <span className="eyebrow text-muted-foreground">PLAYERS</span>
        <h1 className="display mt-2 text-3xl font-medium">Players</h1>
      </div>
      <PlayersTabs active={active} managed={managed} baseUrl={baseUrl} />
    </div>
  );
}
