"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import type { GroupablePlayer } from "@/lib/supabase/messages";
import { cn } from "@/lib/utils";

/**
 * Create a group: pick a title + at least one eligible player, then create_group
 * and jump to the new thread. The player list is pre-filtered server-side to those
 * the caller may add (shared history, opted in), so anyone shown is addable.
 */
export function NewGroupForm({ players }: { players: GroupablePlayer[] }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function create() {
    if (!title.trim() || selected.size === 0 || pending) return;
    start(async () => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("create_group", {
        p_title: title.trim(),
        p_member_player_ids: [...selected],
      });
      if (error || !data) {
        toast.error(
          error?.message === "title_range"
            ? "Give the group a name (1–100 characters)."
            : "Couldn’t create the group — try again.",
        );
        return;
      }
      router.push(`/messages/${data as string}`);
    });
  }

  if (players.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border px-6 py-12 text-center">
        <p className="text-sm font-medium">No one to add yet</p>
        <p className="mt-1 text-sm text-muted-foreground">
          You can add players you’ve played or challenged (and who allow group invites).
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <label htmlFor="group-title" className="text-sm font-medium">
          Group name
        </label>
        <input
          id="group-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={100}
          placeholder="Weekend crew"
          className="mt-1 w-full rounded-xl border border-input bg-background px-3.5 py-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
        />
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-sm font-medium">Add players</span>
          <span className="text-xs text-muted-foreground">{selected.size} selected</span>
        </div>
        <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-2xl border border-border">
          {players.map((p) => {
            const checked = selected.has(p.player_id);
            return (
              <li key={p.player_id}>
                <button
                  type="button"
                  onClick={() => toggle(p.player_id)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/50"
                >
                  <span
                    className={cn(
                      "grid size-5 shrink-0 place-items-center rounded-md border",
                      checked ? "border-primary bg-primary text-primary-foreground" : "border-input",
                    )}
                  >
                    {checked ? (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    ) : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{p.display_name}</span>
                    {p.handle ? (
                      <span className="block truncate text-xs text-muted-foreground">@{p.handle}</span>
                    ) : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <button
        type="button"
        onClick={create}
        disabled={pending || !title.trim() || selected.size === 0}
        className="h-11 rounded-xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50"
      >
        {pending ? "Creating…" : "Create group"}
      </button>
    </div>
  );
}
