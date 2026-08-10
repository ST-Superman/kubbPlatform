import { redirect } from "next/navigation";
import { headers } from "next/headers";

import { createClient } from "@/lib/supabase/server";
import { getMyManagedPlayers } from "@/lib/supabase/players";
import { ManagedPlayers } from "@/components/managed-players";

export default async function PlayersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirectTo=/players");

  const players = await getMyManagedPlayers();

  // Build the absolute base for claim links server-side (the `origin` header is
  // absent on plain GET navigations, so derive it from host + forwarded proto).
  const h = await headers();
  const host = h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const baseUrl = host ? `${proto}://${host}` : "";

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-12 sm:py-16">
      <div>
        <span className="eyebrow text-muted-foreground">MANAGED PLAYERS</span>
        <h1 className="display mt-2 text-3xl font-medium">Add a player</h1>
        <p className="mt-2 max-w-prose text-sm text-muted-foreground">
          Add someone by name — no account needed. They can claim the identity
          later from a single-use link, and every result recorded under it
          becomes theirs.
        </p>
      </div>

      <ManagedPlayers players={players} baseUrl={baseUrl} />
    </div>
  );
}
