"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import type { GroupMember, GroupablePlayer } from "@/lib/supabase/messages";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

/**
 * Group roster + management, opened from the group thread header. Everyone can see
 * the roster and leave; the owner can rename, remove members, and add eligible
 * players (loaded lazily). All writes go through the W2 SECURITY DEFINER RPCs.
 */
export function GroupManage({
  conversationId,
  myPlayerId,
  initialMembers,
}: {
  conversationId: string;
  myPlayerId: string;
  initialMembers: GroupMember[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [members, setMembers] = useState<GroupMember[]>(initialMembers);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [candidates, setCandidates] = useState<GroupablePlayer[] | null>(null);

  const amOwner = members.find((m) => m.player_id === myPlayerId)?.role === "owner";
  const supabase = () => createClient();

  async function refetchMembers() {
    const { data } = await supabase().rpc("group_members", {
      p_conversation_id: conversationId,
    });
    if (data) setMembers(data as GroupMember[]);
    router.refresh();
  }

  async function leave() {
    if (!confirm("Leave this group?")) return;
    setBusy(true);
    const { error } = await supabase().rpc("leave_group", { p_conversation_id: conversationId });
    setBusy(false);
    if (error) {
      toast.error("Couldn’t leave the group.");
      return;
    }
    toast.success("You left the group.");
    router.push("/messages");
  }

  async function rename() {
    const next = window.prompt("Group name");
    if (next === null || !next.trim()) return;
    const { error } = await supabase().rpc("rename_group", {
      p_conversation_id: conversationId,
      p_title: next.trim(),
    });
    if (error) {
      toast.error("Couldn’t rename the group.");
      return;
    }
    toast.success("Group renamed.");
    router.refresh();
  }

  async function removeMember(playerId: string) {
    setBusy(true);
    const { error } = await supabase().rpc("remove_group_member", {
      p_conversation_id: conversationId,
      p_player: playerId,
    });
    setBusy(false);
    if (error) {
      toast.error("Couldn’t remove that member.");
      return;
    }
    await refetchMembers();
  }

  async function openAdd() {
    setAdding(true);
    if (candidates === null) {
      const { data } = await supabase().rpc("list_groupable_players");
      setCandidates((data ?? []) as GroupablePlayer[]);
    }
  }

  async function addMember(playerId: string) {
    setBusy(true);
    const { error } = await supabase().rpc("add_group_members", {
      p_conversation_id: conversationId,
      p_member_player_ids: [playerId],
    });
    setBusy(false);
    if (error) {
      toast.error("Couldn’t add that player.");
      return;
    }
    setCandidates((c) => (c ? c.filter((p) => p.player_id !== playerId) : c));
    await refetchMembers();
  }

  const existingIds = new Set(members.map((m) => m.player_id));
  const addable = (candidates ?? []).filter((c) => !existingIds.has(c.player_id));

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
      >
        {members.length} {members.length === 1 ? "member" : "members"}
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title="Group members">
        <div className="flex flex-col gap-3 px-4 pt-1 pb-2">
          <div className="flex items-center justify-between">
            <span className="text-base font-semibold">Members</span>
            {amOwner ? (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={rename}
                  className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium hover:bg-muted"
                >
                  Rename
                </button>
                <button
                  type="button"
                  onClick={openAdd}
                  className="rounded-lg bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground"
                >
                  Add
                </button>
              </div>
            ) : null}
          </div>

          <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border">
            {members.map((m) => (
              <li key={m.player_id} className="flex items-center gap-3 px-3 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {m.display_name}
                    {m.player_id === myPlayerId ? " (you)" : ""}
                  </span>
                  {m.handle ? (
                    <span className="block truncate text-xs text-muted-foreground">@{m.handle}</span>
                  ) : null}
                </span>
                {m.role === "owner" ? (
                  <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                    Owner
                  </span>
                ) : amOwner ? (
                  <button
                    type="button"
                    onClick={() => removeMember(m.player_id)}
                    disabled={busy}
                    className="shrink-0 text-xs font-medium text-destructive hover:underline disabled:opacity-50"
                  >
                    Remove
                  </button>
                ) : null}
              </li>
            ))}
          </ul>

          {adding ? (
            <div>
              <div className="mb-1 text-sm font-medium">Add players</div>
              {addable.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                  No one else to add.
                </p>
              ) : (
                <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border">
                  {addable.map((p) => (
                    <li key={p.player_id} className="flex items-center gap-3 px-3 py-2.5">
                      <span className="min-w-0 flex-1 truncate text-sm">{p.display_name}</span>
                      <button
                        type="button"
                        onClick={() => addMember(p.player_id)}
                        disabled={busy}
                        className="shrink-0 rounded-lg bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground disabled:opacity-50"
                      >
                        Add
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}

          <button
            type="button"
            onClick={leave}
            disabled={busy}
            className={cn(
              "mt-1 h-10 rounded-xl border border-destructive/40 text-sm font-semibold text-destructive hover:bg-destructive/10 disabled:opacity-50",
            )}
          >
            Leave group
          </button>
        </div>
      </Sheet>
    </>
  );
}
