import { notFound, redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getPlayerProfile } from "@/lib/supabase/matches";
import { MatchRow } from "@/components/match-row";
import { Card, CardContent } from "@/components/ui/card";

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?redirectTo=/u/${handle}`);

  const profile = await getPlayerProfile(handle);
  if (!profile) notFound();

  const { player, record, matches } = profile;
  const memberSince = new Date(player.created_at).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
  });
  const played = record.wins + record.losses;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-12 sm:py-16">
      <Card>
        <CardContent className="flex items-center gap-4 pt-6">
          <div className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-full bg-secondary text-lg font-semibold text-secondary-foreground">
            {player.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={player.avatar_url} alt="" className="h-full w-full object-cover" />
            ) : (
              player.display_name.charAt(0).toUpperCase()
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-medium">{player.display_name}</p>
            <p className="truncate font-mono text-sm text-muted-foreground">@{player.handle}</p>
            <p className="mt-1 text-xs text-muted-foreground">Member since {memberSince}</p>
          </div>
          <div className="shrink-0 text-right">
            <div className="display text-2xl tabular-nums">
              {record.wins}–{record.losses}
            </div>
            <div className="eyebrow text-muted-foreground">RECORD</div>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2">
        <span className="eyebrow text-muted-foreground">
          MATCH HISTORY{played > 0 ? ` · ${played} played` : ""}
        </span>
        {matches.length === 0 ? (
          <p className="text-sm text-muted-foreground">No matches yet.</p>
        ) : (
          matches.map((m) => <MatchRow key={m.match_id} row={m} />)
        )}
      </div>
    </div>
  );
}
