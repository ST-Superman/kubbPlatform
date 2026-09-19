"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowUp, Loader2, MoreVertical } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { messageErrorText } from "@/lib/message-errors";
import type { ThreadMessage } from "@/lib/supabase/messages";
import { ctaClass } from "@/components/brand";
import { MessageBody } from "@/components/message-body";
import { ReportDialog, BlockConfirm } from "@/components/report-dialog";
import { Sheet } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useLongPress } from "@/hooks/use-long-press";
import { cn } from "@/lib/utils";

// [F6] `(pointer:fine)` as an external store (stable refs for useSyncExternalStore).
const POINTER_FINE = "(pointer:fine)";
function subscribeFinePointer(cb: () => void) {
  const mq = window.matchMedia(POINTER_FINE);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
const getFinePointer = () => window.matchMedia(POINTER_FINE).matches;

/**
 * The reusable conversation thread — used by the DM page (/messages/[id]) and the
 * in-match chat panel. Subscribes to the `conv:<id>` broadcast (same transport as
 * match-client's `match:<id>`), sends optimistically, marks read on mount + on
 * inbound, and exposes per-message block/report affordances.
 *
 * Pass 1: [F1] 16px composer · [F2] dvh + safe area · [F3] list scroll · [F5]
 * auto-grow · [Q2] drafts · [Q8] one round-trip per message.
 * Pass 2: [F6] desktop-only Enter-to-send + hint/counter · [Q1] load-earlier
 * paging with scroll anchoring · [F4] touch-reachable actions (long-press /
 * right-click / ⋮ → one action sheet) · [F14] 44px Send · [Q7] linkified bodies.
 * Transport, RPCs, optimistic send and can_dm gating are unchanged.
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
  const [sending, setSending] = useState(false);

  // [F6] Desktop pointer → Enter sends; touch → Enter is a newline. Read the media
  // query as an external store: reactive, SSR-safe (server = touch), and no
  // setState-in-effect.
  const isFine = useSyncExternalStore(subscribeFinePointer, getFinePointer, () => false);

  // [Q1] History paging.
  const [hasMore, setHasMore] = useState(initialMessages.length >= 50);
  const [loadingMore, setLoadingMore] = useState(false);
  const anchor = useRef<number | null>(null); // pre-prepend scrollHeight

  // [F4] Message-action state.
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [reportFor, setReportFor] = useState<ThreadMessage | null>(null);
  const [blockFor, setBlockFor] = useState<{ id: string; name: string } | null>(null);

  // [Q2] Draft survives the sheet unmounting / navigating away, per conversation.
  const draftKey = `kubb:draft:${conversationId}`;
  const [input, setInput] = useState<string>(() =>
    typeof window === "undefined" ? "" : (sessionStorage.getItem(draftKey) ?? ""),
  );
  useEffect(() => {
    if (input) sessionStorage.setItem(draftKey, input);
    else sessionStorage.removeItem(draftKey);
  }, [draftKey, input]);

  // [F3] Scroll the list, not the document.
  const listRef = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);

  // [Q8] Debounce the read/refresh and the fallback refetch.
  const readTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // [Q8] was: every broadcast → refetch 50 rows → mark_read → router.refresh().
  const scheduleMarkRead = useCallback(() => {
    if (readTimer.current) clearTimeout(readTimer.current);
    readTimer.current = setTimeout(() => void markRead(), 1500);
  }, [markRead]);

  const scheduleRefetch = useCallback(() => {
    if (refetchTimer.current) clearTimeout(refetchTimer.current);
    refetchTimer.current = setTimeout(() => void refetch(), 300);
  }, [refetch]);

  useEffect(() => {
    const channel = supabase
      .channel(`conv:${conversationId}`)
      .on("broadcast", { event: "message" }, ({ payload }) => {
        const row = payload as Partial<ThreadMessage> | undefined;
        if (row?.id && row.body !== undefined) {
          // Append the row we were handed — dedupe covers our own optimistic copy.
          setMessages((m) =>
            m.some((x) => x.id === row.id) ? m : [...m, row as ThreadMessage],
          );
        } else {
          // TODO: have send_message broadcast the full row, then drop this branch.
          scheduleRefetch();
        }
        scheduleMarkRead();
      })
      .subscribe((status) => {
        // Reconnect is the correctness path — resync in full.
        if (status === "SUBSCRIBED") void refetch();
      });
    return () => {
      if (readTimer.current) clearTimeout(readTimer.current);
      if (refetchTimer.current) clearTimeout(refetchTimer.current);
      void supabase.removeChannel(channel);
    };
  }, [conversationId, supabase, refetch, scheduleRefetch, scheduleMarkRead]);

  // Clear unread when the thread opens.
  useEffect(() => {
    void markRead();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  // [F3]/[Q1] One layout effect owns scroll on every message change, branching so
  // the two cases never fight: a prepend (paging) restores the reader's position,
  // otherwise pin to the bottom only if they were already there.
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (anchor.current != null) {
      el.scrollTop += el.scrollHeight - anchor.current; // keep position across prepend
      anchor.current = null;
    } else if (pinned.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  // [F3] Track whether the reader is at the bottom — an inbound message must never
  // yank someone out of the history they're reading.
  function onListScroll() {
    const el = listRef.current;
    if (!el) return;
    pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }

  // [Q1] Page older messages in, anchoring scroll so the reader doesn't jump.
  async function loadEarlier() {
    const first = messages[0];
    if (!first || loadingMore) return;
    setLoadingMore(true);
    anchor.current = listRef.current?.scrollHeight ?? null; // capture BEFORE the prepend
    const { data } = await supabase.rpc("conversation_messages", {
      p_conversation_id: conversationId,
      p_before: first.created_at,
      p_limit: 50,
    });
    const rows = (data ?? []) as ThreadMessage[];
    setHasMore(rows.length === 50);
    setMessages((m) => [...rows, ...m]);
    setLoadingMore(false);
  }

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
    pinned.current = true; // sending always scrolls you down
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
      setInput(body); // [Q2] restores the draft, and re-persists it
      toast.error(messageErrorText(error.message));
      return;
    }
    sessionStorage.removeItem(draftKey); // [Q2] only on a CONFIRMED send
    void refetch(); // reconcile with the canonical row (same id → no duplicate)
  }

  // [F11] Blocking always confirms first (BlockConfirm), then this runs.
  async function confirmBlock(playerId: string) {
    const { error } = await supabase.rpc("block_player", { p_player: playerId });
    if (error) {
      toast.error("Couldn’t block that player.");
      return;
    }
    toast.success("Player blocked. You won’t see their messages.", {
      action: { label: "Settings", onClick: () => router.push("/settings/notifications") },
    });
    await refetch();
    router.refresh();
  }

  function copyText(m: ThreadMessage) {
    void navigator.clipboard?.writeText(m.body ?? "").then(
      () => toast.success("Message copied."),
      () => toast.error("Couldn’t copy."),
    );
    setMenuFor(null);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!isFine) return; // [F6] touch: let Enter insert a newline
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  const menuMsg = menuFor ? (messages.find((m) => m.id === menuFor) ?? null) : null;

  return (
    <div
      className={cn(
        "flex flex-col",
        // [F2] dvh tracks the visual viewport; vh does not shrink for the keyboard.
        variant === "page"
          ? "h-[calc(100dvh-13rem)] min-h-[24rem]"
          : "h-[60dvh] max-h-[80dvh]",
      )}
    >
      <div
        ref={listRef}
        onScroll={onListScroll}
        role="log"
        aria-live="polite"
        aria-label="Messages"
        className="flex-1 space-y-2 overflow-y-auto px-1 py-3"
      >
        {/* [Q1] Explicit, predictable pager — an IntersectionObserver can come later. */}
        {hasMore ? (
          <div className="flex justify-center py-1">
            <button
              type="button"
              onClick={() => void loadEarlier()}
              disabled={loadingMore}
              className="rounded-full border border-border px-3.5 py-2 font-mono text-[9.5px] font-bold tracking-[1.4px] text-muted-foreground uppercase disabled:opacity-50"
            >
              {loadingMore ? "Loading…" : "Load earlier"}
            </button>
          </div>
        ) : null}

        {messages.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No messages yet — say hello.
          </p>
        ) : (
          messages.map((m) => (
            <MessageRow
              key={m.id}
              m={m}
              mine={m.sender_player_id === myPlayerId}
              onOpenMenu={() => setMenuFor(m.id)}
            />
          ))
        )}
      </div>

      {/* [F2] safe-area padding: the app sets viewportFit: cover. */}
      <div className="border-t border-border pt-3 pb-[max(0.25rem,env(safe-area-inset-bottom))]">
        <div className="flex items-end gap-2">
          {/* [F1][F5] 16px on touch + auto-grow, both owned by the shared component. */}
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            maxLength={4000}
            placeholder="Message…"
            aria-label="Message"
            className="flex-1"
          />
          {/* [F14] 44px CTA; arrow on mobile, SEND on desktop, spinner while in flight. */}
          <button
            type="button"
            // Without this the first tap blurs the composer, the keyboard collapses,
            // the layout shifts, and the click never lands — you have to tap twice.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => void send()}
            disabled={sending || !input.trim()}
            aria-label="Send message"
            aria-busy={sending}
            className={cn(ctaClass("primary", "sm"), "size-11 shrink-0 md:w-auto md:px-5")}
          >
            {sending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <>
                <ArrowUp className="size-5 md:hidden" />
                <span className="hidden md:inline">Send</span>
              </>
            )}
          </button>
        </div>
        {/* [F6] Hint only where Enter sends; counter only near the cap. */}
        {isFine || input.length > 3800 ? (
          <div className="mt-1 flex items-center justify-between px-1">
            {isFine ? (
              <span className="eyebrow text-muted-foreground/70">
                ENTER TO SEND · SHIFT+ENTER NEWLINE
              </span>
            ) : (
              <span />
            )}
            {input.length > 3800 ? (
              <span className="eyebrow text-muted-foreground/70">{input.length} / 4000</span>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* [F4] One action menu for long-press / right-click / desktop ⋮; ≥52px rows. */}
      <Sheet open={menuFor != null} onClose={() => setMenuFor(null)} title="Message actions">
        {menuMsg ? (
          <div className="px-4 pb-2">
            <blockquote className="mb-2 line-clamp-2 rounded-xl bg-muted px-3.5 py-2.5 text-sm italic text-muted-foreground">
              {menuMsg.deleted ? "Message removed" : menuMsg.body}
            </blockquote>
            <div className="flex flex-col">
              <button type="button" onClick={() => copyText(menuMsg)} className={actionRow}>
                Copy text
              </button>
              <button
                type="button"
                onClick={() => {
                  setReportFor(menuMsg);
                  setMenuFor(null);
                }}
                className={actionRow}
              >
                Report message
              </button>
              <button
                type="button"
                onClick={() => {
                  setBlockFor({
                    id: menuMsg.sender_player_id,
                    name: menuMsg.sender_display_name ?? "this player",
                  });
                  setMenuFor(null);
                }}
                className={cn(actionRow, "text-destructive")}
              >
                Block {menuMsg.sender_display_name ?? "player"}
              </button>
            </div>
          </div>
        ) : null}
      </Sheet>

      {/* [F10] Categorised report dialog (replaces window.prompt). */}
      {reportFor ? (
        <ReportDialog
          open
          onOpenChange={(v) => {
            if (!v) setReportFor(null);
          }}
          messageId={reportFor.id}
          senderId={reportFor.sender_player_id}
          senderName={reportFor.sender_display_name ?? "this player"}
          quoted={reportFor.body ?? ""}
          onDone={() => {
            void refetch();
            router.refresh();
          }}
        />
      ) : null}

      {/* [F11] Block confirmation. */}
      {blockFor ? (
        <BlockConfirm
          open
          onOpenChange={(v) => {
            if (!v) setBlockFor(null);
          }}
          playerName={blockFor.name}
          onConfirm={() => void confirmBlock(blockFor.id)}
        />
      ) : null}
    </div>
  );
}

const actionRow =
  "flex min-h-[52px] items-center rounded-lg px-3 text-left text-sm hover:bg-muted";

/**
 * One message bubble. [F4] the bubble itself is the long-press / right-click
 * target (own component so `useLongPress` isn't called inside a map), and a
 * hover-revealed ⋮ opens the same menu on desktop — all three routes into
 * `onOpenMenu`. [Q7] body is linkified via MessageBody. Actions are offered on
 * other people's messages only.
 */
function MessageRow({
  m,
  mine,
  onOpenMenu,
}: {
  m: ThreadMessage;
  mine: boolean;
  onOpenMenu: () => void;
}) {
  const press = useLongPress(onOpenMenu);
  const actionable = !mine;

  return (
    <div className={cn("group flex items-end gap-1.5", mine ? "justify-end" : "justify-start")}>
      {actionable ? (
        <button
          type="button"
          aria-label="Message options"
          onClick={onOpenMenu}
          className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100 focus-visible:opacity-100"
        >
          <MoreVertical className="size-4" />
        </button>
      ) : null}
      <div
        {...(actionable ? press : {})}
        className={cn(
          "max-w-[78%] rounded-2xl px-3.5 py-2 text-sm",
          actionable && "cursor-default select-none [-webkit-touch-callout:none]",
          mine ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
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
          <MessageBody body={m.body ?? ""} mine={mine} />
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
}
