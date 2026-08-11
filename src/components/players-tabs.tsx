"use client";

import { useState } from "react";
import Link from "next/link";

import { type ActivePlayer, type ManagedPlayer } from "@/lib/supabase/players";
import { ManagedPlayers } from "@/components/managed-players";
import { InfoDot } from "@/components/info-dot";
import { cn } from "@/lib/utils";

type Tab = "current" | "new";

export function PlayersTabs({
  active,
  managed,
  baseUrl,
}: {
  active: ActivePlayer[];
  managed: ManagedPlayer[];
  baseUrl: string;
}) {
  const [tab, setTab] = useState<Tab>("current");

  return (
    <div className="flex flex-col gap-5">
      {/* Segmented tabs */}
      <div className="flex items-center gap-2">
        <div className="flex flex-1 gap-1 rounded-full border border-border bg-muted/40 p-1">
          {(
            [
              ["current", "Current Players"],
              ["new", "New Players"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={cn(
                "h-9 flex-1 rounded-full font-mono text-[11px] font-bold uppercase tracking-[1.2px] transition-colors",
                tab === key
                  ? "bg-card text-foreground shadow-sm ring-1 ring-foreground/10"
                  : "text-muted-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <InfoDot title="Players">
          Current Players are people with Kubb Platform accounts. New Players lets you add
          someone by name and invite them to the platform.
        </InfoDot>
      </div>

      {tab === "current" ? (
        <CurrentPlayers active={active} />
      ) : (
        <div className="flex flex-col gap-3">
          <p className="max-w-prose text-sm text-muted-foreground">
            Add someone by name — no account needed. They can claim the identity later
            from a single-use link, and every result recorded under it becomes theirs.
            {" "}
            <InfoDot term="managed-player" />
          </p>
          <ManagedPlayers players={managed} baseUrl={baseUrl} />
        </div>
      )}
    </div>
  );
}

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((w) => w[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function CurrentPlayers({ active }: { active: ActivePlayer[] }) {
  if (active.length === 0) {
    return <p className="text-sm text-muted-foreground">No players with accounts yet.</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      {active.map((p) => {
        const played = p.wins + p.losses;
        return (
          <Link
            key={p.player_id}
            href={`/u/${p.handle}`}
            className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 ring-1 ring-foreground/5 transition-colors hover:bg-muted"
          >
            <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-full bg-[var(--swedish-blue)] font-mono text-sm font-bold text-white">
              {p.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.avatar_url} alt="" className="h-full w-full object-cover" />
              ) : (
                initials(p.display_name)
              )}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{p.display_name}</div>
              <div className="truncate font-mono text-[11px] text-muted-foreground">@{p.handle}</div>
            </div>
            <div className="shrink-0 text-right">
              <div className="display text-lg tabular-nums">
                {p.wins}–{p.losses}
              </div>
              <div className="eyebrow text-[9px] text-muted-foreground">
                {played > 0 ? `${played} played` : "no matches"}
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
