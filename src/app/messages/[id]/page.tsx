import { notFound, redirect } from "next/navigation";
import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import {
  getConversationMessages,
  getConversationSummary,
  getGroupMembers,
  getMyPlayerId,
} from "@/lib/supabase/messages";
import { ChatThread } from "@/components/chat-thread";
import { GroupManage } from "@/components/group-manage";

/** A single conversation thread. */
export default async function ThreadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?redirectTo=/messages/${id}`);

  const [summary, myPlayerId] = await Promise.all([
    getConversationSummary(id),
    getMyPlayerId(),
  ]);
  // Not in my conversation list → not a member (or it doesn't exist).
  if (!summary || !myPlayerId) notFound();

  const [messages, groupMembers] = await Promise.all([
    getConversationMessages(id),
    summary.type === "group" ? getGroupMembers(id) : Promise.resolve([]),
  ]);

  const title =
    summary.type === "dm"
      ? summary.other?.display_name ?? "Player"
      : summary.type === "match"
        ? "Match chat"
        : summary.title ?? "Group";
  const handle = summary.type === "dm" ? summary.other?.handle ?? null : null;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col px-4 py-6">
      <div className="flex items-center gap-3 border-b border-border pb-3">
        <Link
          href="/messages"
          aria-label="Back to messages"
          className="grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-muted"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </Link>
        <div className="min-w-0 flex-1">
          <div className="truncate text-base font-semibold">{title}</div>
          {handle ? (
            <Link href={`/u/${handle}`} className="text-xs text-muted-foreground hover:underline">
              @{handle}
            </Link>
          ) : null}
        </div>
        {summary.type === "group" ? (
          <GroupManage
            conversationId={id}
            myPlayerId={myPlayerId}
            initialMembers={groupMembers}
          />
        ) : null}
      </div>

      <ChatThread conversationId={id} myPlayerId={myPlayerId} initialMessages={messages} />
    </div>
  );
}
