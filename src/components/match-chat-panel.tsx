"use client";

import { useEffect, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { ChatThread } from "@/components/chat-thread";
import type { ThreadMessage } from "@/lib/supabase/messages";

/**
 * In-match chat, lazily wired when the panel opens: resolves (or creates) the
 * match's `type='match'` conversation via start_or_get_match_conversation, loads
 * the caller's players.id + the thread, then hands off to the shared ChatThread
 * (its own `conv:<id>` topic, separate from the match's `match:<id>` state topic).
 */
export function MatchChatPanel({ matchId }: { matchId: string }) {
  const [ready, setReady] = useState<{
    convId: string;
    myPlayerId: string;
    messages: ThreadMessage[];
  } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        if (!cancelled) setFailed(true);
        return;
      }
      const [convRes, playerRes] = await Promise.all([
        supabase.rpc("start_or_get_match_conversation", { p_match_id: matchId }),
        supabase.from("players").select("id").eq("user_id", user.id).maybeSingle(),
      ]);
      const convId = convRes.data as string | null;
      const playerId = (playerRes.data as { id: string } | null)?.id ?? null;
      if (convRes.error || !convId || !playerId) {
        if (!cancelled) setFailed(true);
        return;
      }
      const { data: msgs } = await supabase.rpc("conversation_messages", {
        p_conversation_id: convId,
        p_before: null,
        p_limit: 50,
      });
      if (!cancelled) {
        setReady({ convId, myPlayerId: playerId, messages: (msgs ?? []) as ThreadMessage[] });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [matchId]);

  if (failed) {
    return (
      <p className="px-4 py-8 text-center text-sm text-muted-foreground">
        Couldn’t open match chat.
      </p>
    );
  }
  if (!ready) {
    return (
      <p className="px-4 py-8 text-center text-sm text-muted-foreground">Loading chat…</p>
    );
  }
  return (
    <div className="px-4 pb-2">
      <ChatThread
        conversationId={ready.convId}
        myPlayerId={ready.myPlayerId}
        initialMessages={ready.messages}
        variant="panel"
      />
    </div>
  );
}
