"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MoreVertical } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { messageErrorText } from "@/lib/message-errors";
import type { ThreadMessage } from "@/lib/supabase/messages";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/**
 * The reusable conversation thread — used by the DM page (/messages/[id]) and the
 * in-match chat panel. Subscribes to the `conv:<id>` broadcast (same transport as
 * match-client's `match:<id>`), sends optimistically, marks read on mount + on
 * inbound, and exposes per-message block/report affordances for other people's
 * messages. Writes go straight through the SECURITY DEFINER RPCs.
 */
export function ChatThread({
  conversationId,
  myPlayerId,
  initialMessages,
  variant = "page",
}: {
  conversationId: string;
  myPlayerId: string;
  initialMessages: ThreadMessage[];
  variant?: "page" | "panel";
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [messages, setMessages] = useState<ThreadMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const refetch = useCallback(async () => {
    const { data } = await supabase.rpc("conversation_messages", {
      p_conversation_id: conversationId,
      p_before: null,
      p_limit: 50,
    });
    if (data) setMessages(data as ThreadMessage[]);
  }, [conversationId, supabase]);

  const markRead = useCallback(async () => {
    await supabase.rpc("mark_read", { p_conversation_id: conversationId });
    router.refresh(); // updates the nav unread badge (server-rendered)
  }, [conversationId, supabase, router]);

  // Live updates: refetch canonical rows on any broadcast, then clear unread.
  useEffect(() => {
    const channel = supabase
      .channel(`conv:${conversationId}`)
      .on("broadcast", { event: "message" }, () => {
        void refetch().then(markRead);
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [conversationId, supabase, refetch, markRead]);

  // Clear unread when the thread opens.
  useEffect(() => {
    void markRead();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  // Keep pinned to the latest message.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  async function send() {
    const body = input.trim();
    if (!body || sending) return;
    const clientId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`;

    const optimistic: ThreadMessage = {
      id: clientId,
      sender_player_id: myPlayerId,
      sender_display_name: "You",
      sender_handle: null,
      body,
      deleted: false,
      created_at: new Date().toISOString(),
    };
    setMessages((m) => [...m, optimistic]);
    setInput("");
    setSending(true);

    const { error } = await supabase.rpc("send_message", {
      p_conversation_id: conversationId,
      p_body: body,
      p_client_id: clientId,
    });
    setSending(false);

    if (error) {
      setMessages((m) => m.filter((x) => x.id !== clientId)); // revert optimistic
      setInput(body); // restore the draft
      toast.error(messageErrorText(error.message));
      return;
    }
    void refetch(); // reconcile with the canonical row (same id → no duplicate)
  }

  async function blockSender(playerId: string) {
    const { error } = await supabase.rpc("block_player", { p_player: playerId });
    if (error) {
      toast.error("Couldn’t block that player.");
      return;
    }
    toast.success("Player blocked. You won’t see their messages.");
    await refetch();
    router.refresh();
  }

  async function reportMessage(messageId: string) {
    const reason = window.prompt("Report this message — what’s the problem?");
    if (reason === null || !reason.trim()) return;
    const { error } = await supabase.rpc("report_message", {
      p_message_id: messageId,
      p_reason: reason.trim(),
    });
    if (error) {
      toast.error("Couldn’t file that report.");
      return;
    }
    toast.success("Reported — thanks. We’ll take a look.");
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  return (
    <div
      className={cn(
        "flex flex-col",
        variant === "page" ? "h-[calc(100vh-13rem)] min-h-[24rem]" : "h-[60vh] max-h-[70vh]",
      )}
    >
      <div className="flex-1 space-y-2 overflow-y-auto px-1 py-3">
        {messages.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No messages yet — say hello.
          </p>
        ) : (
          messages.map((m) => {
            const mine = m.sender_player_id === myPlayerId;
            return (
              <div
                key={m.id}
                className={cn("group flex items-end gap-1.5", mine ? "justify-end" : "justify-start")}
              >
                {!mine ? (
                  <MessageMenu
                    onBlock={() => blockSender(m.sender_player_id)}
                    onReport={() => reportMessage(m.id)}
                  />
                ) : null}
                <div
                  className={cn(
                    "max-w-[78%] rounded-2xl px-3.5 py-2 text-sm",
                    mine
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-foreground",
                  )}
                >
                  {!mine ? (
                    <div className="mb-0.5 text-[11px] font-semibold text-muted-foreground">
                      {m.sender_display_name ?? "Player"}
                    </div>
                  ) : null}
                  {m.deleted ? (
                    <span className="italic opacity-70">Message removed</span>
                  ) : (
                    <span className="whitespace-pre-wrap break-words">{m.body}</span>
                  )}
                  <div
                    className={cn(
                      "mt-0.5 text-[10px]",
                      mine ? "text-primary-foreground/70" : "text-muted-foreground",
                    )}
                  >
                    {new Date(m.created_at).toLocaleTimeString([], {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      <div className="flex items-end gap-2 border-t border-border pt-3">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          maxLength={4000}
          placeholder="Message…"
          className="max-h-32 min-h-[2.5rem] flex-1 resize-none rounded-xl border border-input bg-background px-3.5 py-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
        />
        <button
          type="button"
          onClick={() => void send()}
          disabled={sending || !input.trim()}
          className="h-10 shrink-0 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </div>
  );
}

function MessageMenu({ onBlock, onReport }: { onBlock: () => void; onReport: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Message options"
        className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100 focus-visible:opacity-100"
      >
        <MoreVertical className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem onClick={onReport}>Report message</DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onClick={onBlock}>
          Block sender
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
