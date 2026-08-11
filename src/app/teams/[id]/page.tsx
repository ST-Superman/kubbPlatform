import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getTeamStats } from "@/lib/supabase/teams";
import { StatsBlock } from "@/components/stats-block";
import { InfoDot } from "@/components/info-dot";

export default async function TeamStatsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?redirectTo=/teams/${id}`);

  const stats = await getTeamStats(id);
  if (!stats) notFound();

  const { team, members, metrics, matches_counted } = stats;

  return (
    <div className="mx-auto flex max-w-md flex-col gap-3 px-4 py-6">
      {/* Hero card */}
      <div className="flex flex-col gap-3.5 rounded-2xl border border-border bg-card p-4 shadow-[0_1px_2px_rgba(19,24,43,.04),0_4px_10px_rgba(19,24,43,.04)]">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="eyebrow text-[9px] tracking-[1.3px] text-muted-foreground">TEAM</div>
            <p className="truncate text-[18px] font-semibold">{team.name}</p>
          </div>
          <div className="shrink-0 text-right">
            <div className="display text-[24px] leading-none italic tabular-nums">
              {matches_counted}
            </div>
            <div className="flex items-center justify-end gap-1">
              <span className="eyebrow text-[9px] tracking-[1.3px] text-muted-foreground">MATCHES</span>
              <InfoDot title="Matches">The number of finished matches feeding these team stats.</InfoDot>
            </div>
          </div>
        </div>
        {members.length > 0 ? (
          <div className="flex flex-wrap gap-1.5 border-t border-foreground/10 pt-3.5">
            {members.map((m) =>
              m.handle ? (
                <Link
                  key={m.player_id}
                  href={`/u/${m.handle}`}
                  className="rounded-full border border-border px-2.5 py-1 text-[11px] font-semibold transition-colors hover:bg-secondary"
                >
                  {m.display_name}
                </Link>
              ) : (
                <span
                  key={m.player_id}
                  className="rounded-full border border-border px-2.5 py-1 text-[11px] font-semibold text-muted-foreground"
                >
                  {m.display_name}
                </span>
              ),
            )}
          </div>
        ) : null}
      </div>

      {/* Team throwing stats */}
      <div className="mt-1 flex flex-col gap-2.5 rounded-2xl border border-border bg-card p-4 shadow-[0_1px_2px_rgba(19,24,43,.04),0_4px_10px_rgba(19,24,43,.04)]">
        <span className="eyebrow text-[10px] tracking-[1.5px] text-muted-foreground">
          TEAM STATS
        </span>
        {matches_counted > 0 ? (
          <StatsBlock metrics={metrics} />
        ) : (
          <p className="text-sm text-muted-foreground">
            No completed matches yet — stats appear once this team finishes a match.
          </p>
        )}
      </div>
    </div>
  );
}
