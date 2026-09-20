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
import { ArrowUp, MoreVertical } from "lucide-react";
import type { RealtimeChannel } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/client";
import { messageErrorText } from "@/lib/message-errors";
import type { ThreadMessage } from "@/lib/supabase/messages";
import { toRows, timeLabel } from "@/lib/group-messages";
import { ctaClass } from "@/components/brand";
import { MessageBody } from "@/components/message-body";
import { ReportDialog, BlockConfirm } from "@/components/report-dialog";
import { ThreadStatus, useTypingName, type Conn } from "@/components/thread-status";
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

// [F15] Empty-state one-taps — in a match they double as always-available quick replies.
const MATCH_REPLIES = ["Good luck", "Nice throw", "Rematch?"];
const DM_OPENERS = ["Good game", "Rematch?"];

type SendPhase = "sending" | "queued" | "failed" | "sent";

/**
 * The reusable conversation thread — used by the DM page (/messages/[id]) and the
 * in-match chat panel. Subscribes to the `conv:<id>` broadcast, sends optimistically,
 * marks read on mount + on inbound, exposes per-message block/report.
 *
 * Pass 1: 16px composer · dvh + safe area · list scroll · auto-grow · drafts.
 * Pass 2: desktop-only Enter · load-earlier paging · touch actions · 44px Send · links.
 * Pass 3: [F8/F9] runs, day dividers, timestamps OUTSIDE the bubble, optimistic-at-60%,
 * inline retry · [Q4] dedicated bubble tokens · [Q6] connection status slot + offline
 * send queue · [F15] empty-state quick replies.
 * (Typing + seen + the read_receipts gate land with their migration — deferred.)
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

  // [F6] Desktop pointer → Enter sends; touch → Enter is a newline.
  const isFine = useSyncExternalStore(subscribeFinePointer, getFinePointer, () => false);

  // [Q6] Connection state drives the status slot + the offline send queue.
  const [conn, setConn] = useState<Conn>("live");
  // Per-message send phase for MY optimistic messages (absent → confirmed "sent").
  const [sendState, setSendState] = useState<Record<string, SendPhase>>({});
  const queueRef = useRef<{ id: string; body: string }[]>([]); // held while offline

  // [Q6] Typing + seen ride the same conv:<id> channel, gated on read receipts.
  const channelRef = useRef<RealtimeChannel | null>(null);
  const [readReceipts, setReadReceipts] = useState(true);
  const readReceiptsRef = useRef(true);
  useEffect(() => {
    readReceiptsRef.current = readReceipts;
  });
  const [myName, setMyName] = useState("You");
  const [seenAt, setSeenAt] = useState<string | null>(null);
  const { typingName, onTyping } = useTypingName(myPlayerId);
  const onTypingRef = useRef(onTyping);
  useEffect(() => {
    onTypingRef.current = onTyping;
  });
  const lastTypingPing = useRef(0);

  // My read-receipts pref (gates typing + seen, both ways) + display name (typing payload).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data: prefs } = await supabase.rpc("my_message_prefs");
      const rr = (prefs as { read_receipts?: boolean } | null)?.read_receipts;
      if (!cancelled && typeof rr === "boolean") setReadReceipts(rr);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data: me } = await supabase
        .from("players")
        .select("display_name")
        .eq("user_id", user.id)
        .maybeSingle();
      const name = (me as { display_name?: string } | null)?.display_name;
      if (!cancelled && name) setMyName(name);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  function pingTyping() {
    if (!readReceipts) return;
    const ch = channelRef.current;
    if (!ch) return;
    const now = Date.now();
    if (now - lastTypingPing.current < 3000) return; // throttle: one ping / 3s
    lastTypingPing.current = now;
    void ch.send({ type: "broadcast", event: "typing", payload: { id: myPlayerId, name: myName } });
  }

  // History paging.
  const [hasMore, setHasMore] = useState(initialMessages.length >= 50);
  const [loadingMore, setLoadingMore] = useState(false);
  const anchor = useRef<number | null>(null);

  // Message-action state.
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [reportFor, setReportFor] = useState<ThreadMessage | null>(null);
  const [blockFor, setBlockFor] = useState<{ id: string; name: string } | null>(null);

  // Draft survives the sheet unmounting / navigating away, per conversation.
  const draftKey = `kubb:draft:${conversationId}`;
  const [input, setInput] = useState<string>(() =>
    typeof window === "undefined" ? "" : (sessionStorage.getItem(draftKey) ?? ""),
  );
  useEffect(() => {
    if (input) sessionStorage.setItem(draftKey, input);
    else sessionStorage.removeItem(draftKey);
  }, [draftKey, input]);

  const listRef = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
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
    // [Q6] Tell the other side we've read (gated on our receipts pref); `by` lets
    // them ignore their own reads. They mark their messages older than `at` as seen.
    if (readReceiptsRef.current) {
      void channelRef.current?.send({
        type: "broadcast",
        event: "read",
        payload: { at: new Date().toISOString(), by: myPlayerId },
      });
    }
    router.refresh(); // updates the nav unread badge (server-rendered)
  }, [conversationId, supabase, router, myPlayerId]);

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
          setMessages((m) =>
            m.some((x) => x.id === row.id) ? m : [...m, row as ThreadMessage],
          );
        } else {
          scheduleRefetch();
        }
        scheduleMarkRead();
      })
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        if (readReceiptsRef.current) onTypingRef.current(payload as { id: string; name: string });
      })
      .on("broadcast", { event: "read" }, ({ payload }) => {
        const p = payload as { at: string; by: string };
        if (p.by !== myPlayerId && readReceiptsRef.current) setSeenAt(p.at);
      })
      .subscribe((status) => {
        // [Q6] Map channel status onto our three connection states.
        if (status === "SUBSCRIBED") {
          setConn("live");
          void refetch(); // reconnect is the correctness path
        } else if (status === "CHANNEL_ERROR") {
          setConn("reconnecting");
        } else if (status === "TIMED_OUT" || status === "CLOSED") {
          setConn("offline");
        }
      });
    channelRef.current = channel;
    return () => {
      if (readTimer.current) clearTimeout(readTimer.current);
      if (refetchTimer.current) clearTimeout(refetchTimer.current);
      channelRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [conversationId, supabase, refetch, scheduleRefetch, scheduleMarkRead, myPlayerId]);

  // [Q6] The channel can be slow to notice a dropped network; listen to the browser too.
  useEffect(() => {
    const onOnline = () => setConn("reconnecting");
    const onOffline = () => setConn("offline");
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  // Clear unread when the thread opens.
  useEffect(() => {
    void markRead();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  // One layout effect owns scroll on every message change: a prepend (paging)
  // restores position; otherwise pin to bottom only if the reader was already there.
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (anchor.current != null) {
      el.scrollTop += el.scrollHeight - anchor.current;
      anchor.current = null;
    } else if (pinned.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  function onListScroll() {
    const el = listRef.current;
    if (!el) return;
    pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }

  async function loadEarlier() {
    const first = messages[0];
    if (!first || loadingMore) return;
    setLoadingMore(true);
    anchor.current = listRef.current?.scrollHeight ?? null; // capture BEFORE the prepend
    const { data } = await supabase.rpc("conversation_messages", {
      p_conversation_id: conversationId,
      p_before: first.sort_at, // paginate by the thread's sort key, not created_at
      p_limit: 50,
    });
    const rows = (data ?? []) as ThreadMessage[];
    setHasMore(rows.length === 50);
    setMessages((m) => [...rows, ...m]);
    setLoadingMore(false);
  }

  // The one network write, shared by send / retry / offline-flush. `p_client_id`
  // makes it idempotent, so a re-send (retry, or a double flush) never duplicates.
  const postMessage = useCallback(
    async (body: string, clientId: string) => {
      setSendState((s) => ({ ...s, [clientId]: "sending" }));
      const { error } = await supabase.rpc("send_message", {
        p_conversation_id: conversationId,
        p_body: body,
        p_client_id: clientId,
      });
      if (error) {
        setSendState((s) => ({ ...s, [clientId]: "failed" })); // [F9] keep the bubble, offer retry
        toast.error(messageErrorText(error.message));
        return;
      }
      setSendState((s) => {
        const next = { ...s };
        delete next[clientId]; // → confirmed "sent"
        return next;
      });
      sessionStorage.removeItem(draftKey);
      void refetch(); // reconcile with the canonical row (same id → no duplicate)
    },
    [conversationId, supabase, draftKey, refetch],
  );

  function sendBody(raw: string) {
    const body = raw.trim();
    if (!body) return;
    const clientId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`;

    const nowIso = new Date().toISOString();
    const optimistic: ThreadMessage = {
      id: clientId,
      sender_player_id: myPlayerId,
      sender_display_name: "You",
      sender_handle: null,
      body,
      deleted: false,
      created_at: nowIso,
      sort_at: nowIso,
      from_match_id: null,
    };
    setMessages((m) => [...m, optimistic]);
    pinned.current = true; // sending always scrolls you down

    if (conn === "offline") {
      // [Q6] Hold it; the flush effect resends in order when we're back.
      queueRef.current.push({ id: clientId, body });
      setSendState((s) => ({ ...s, [clientId]: "queued" }));
      return;
    }
    void postMessage(body, clientId);
  }

  function send() {
    if (!input.trim()) return;
    const body = input;
    setInput("");
    sendBody(body);
  }

  // [Q6] Flush the offline queue in order once we're live again.
  const flush = useCallback(() => {
    if (queueRef.current.length === 0) return;
    const batch = queueRef.current;
    queueRef.current = [];
    void (async () => {
      for (const q of batch) await postMessage(q.body, q.id);
    })();
  }, [postMessage]);
  useEffect(() => {
    if (conn === "live") flush();
  }, [conn, flush]);

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
      send();
    }
  }

  const menuMsg = menuFor ? (messages.find((m) => m.id === menuFor) ?? null) : null;
  // Name labels only make sense with more than one other voice (groups / match).
  const showNames = useMemo(
    () =>
      variant === "panel" ||
      new Set(
        messages.filter((m) => m.sender_player_id !== myPlayerId).map((m) => m.sender_player_id),
      ).size > 1,
    [messages, myPlayerId, variant],
  );
  const rows = useMemo(() => toRows(messages), [messages]);
  const showQuickReplies = variant === "panel" && !input.trim();

  return (
    <div
      className={cn(
        "flex flex-col",
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
        className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-1 py-3"
      >
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
          // [F15] The quick replies ARE the empty state.
          <div className="flex flex-1 flex-col items-center justify-center gap-3 py-10">
            <p className="text-sm text-muted-foreground">
              {variant === "panel" ? "Say something to your opponent." : "Start the conversation."}
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {(variant === "panel" ? MATCH_REPLIES : DM_OPENERS).map((t) => (
                <QuickChip key={t} text={t} onSend={sendBody} />
              ))}
            </div>
          </div>
        ) : (
          rows.map((row) => {
            if (row.kind === "day") return <DayDivider key={`d-${row.label}`} label={row.label} />;
            if (row.kind === "match")
              return <MatchDivider key={`fm-${row.id}`} label={row.label} />;
            return (
              <MessageRow
                key={row.m.id}
                m={row.m}
                mine={row.m.sender_player_id === myPlayerId}
                first={row.first}
                last={row.last}
                showName={showNames}
                phase={(sendState[row.m.id] as SendPhase) ?? "sent"}
                seen={
                  row.m.sender_player_id === myPlayerId &&
                  readReceipts &&
                  seenAt != null &&
                  +new Date(row.m.created_at) <= +new Date(seenAt)
                }
                onRetry={() => row.m.body && void postMessage(row.m.body, row.m.id)}
                onOpenMenu={() => setMenuFor(row.m.id)}
              />
            );
          })
        )}
      </div>

      {/* [F15] Match quick replies stay reachable while the composer is empty. */}
      {showQuickReplies && messages.length > 0 ? (
        <div className="flex flex-wrap gap-2 px-4 pb-1">
          {MATCH_REPLIES.map((t) => (
            <QuickChip key={t} text={t} onSend={sendBody} small />
          ))}
        </div>
      ) : null}

      {/* [Q6] One reserved status slot above the composer; typing shown only if receipts on. */}
      <ThreadStatus conn={conn} typingName={readReceipts ? typingName : null} />

      <div className="border-t border-border pt-3 pb-[max(0.25rem,env(safe-area-inset-bottom))]">
        <div className="flex items-end gap-2">
          <Textarea
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              pingTyping(); // [Q6] throttled typing broadcast (gated on read receipts)
            }}
            onKeyDown={onKeyDown}
            maxLength={4000}
            placeholder="Message…"
            aria-label="Message"
            className="flex-1"
          />
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => send()}
            disabled={!input.trim()}
            aria-label="Send message"
            className={cn(ctaClass("primary", "sm"), "size-11 shrink-0 md:w-auto md:px-5")}
          >
            <ArrowUp className="size-5 md:hidden" />
            <span className="hidden md:inline">Send</span>
          </button>
        </div>
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

/** [F15] A one-tap opener / quick reply. */
function QuickChip({
  text,
  onSend,
  small,
}: {
  text: string;
  onSend: (t: string) => void;
  small?: boolean;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => onSend(text)}
      className={cn(
        "rounded-full border border-border text-foreground hover:bg-muted",
        small ? "px-3 py-1.5 text-[13px]" : "px-4 py-2 text-sm",
      )}
    >
      {text}
    </button>
  );
}

/** [F9] Hairline day divider — same 9px mono vocabulary as the Journey timeline. */
function DayDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 py-2">
      <div className="h-px flex-1 bg-border" />
      <span className="eyebrow text-[9px] text-muted-foreground">{label}</span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

/** [Q5] Once at the top of a rolled-up match block — chart-5 to match the inbox chip. */
function MatchDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 py-2">
      <div className="h-px flex-1 bg-border" />
      <span className="eyebrow text-[9px] text-chart-5">{label}</span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

/** [F8][F9] Send state, shown outside the bubble on my last-in-run message. */
function SendState({ phase, seen }: { phase: SendPhase; seen: boolean }) {
  if (phase === "sending") return <span>Sending…</span>;
  if (phase === "queued") return <span>Will send when you’re back</span>;
  if (seen) return <span className="text-(--status-live-ink)">✓ Seen</span>;
  return <span>✓ Sent</span>;
}

/**
 * One message. [F9] runs share a name + one timestamp and square their inner
 * corner; the timestamp lives OUTSIDE the bubble ([F8], retiring white-on-blue).
 * [F4] the bubble is the long-press / right-click target. [Q4] dedicated tokens.
 */
function MessageRow({
  m,
  mine,
  first,
  last,
  showName,
  phase,
  seen,
  onRetry,
  onOpenMenu,
}: {
  m: ThreadMessage;
  mine: boolean;
  first: boolean;
  last: boolean;
  showName: boolean;
  phase: SendPhase;
  seen: boolean;
  onRetry: () => void;
  onOpenMenu: () => void;
}) {
  const press = useLongPress(onOpenMenu);
  const actionable = !mine;
  const pending = mine && (phase === "sending" || phase === "queued");

  return (
    <div className={cn("flex flex-col", mine ? "items-end" : "items-start", !first && "mt-[3px]")}>
      {first && !mine && showName ? (
        <div className="mb-0.5 ml-1.5 eyebrow text-[9px] text-muted-foreground">
          {m.sender_display_name ?? "Player"}
        </div>
      ) : null}

      <div className={cn("group flex items-end gap-1.5", mine ? "flex-row-reverse" : "flex-row")}>
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
            "max-w-[80%] px-3.5 py-2 text-[15px] leading-snug",
            actionable && "cursor-default select-none [-webkit-touch-callout:none]",
            mine
              ? "bg-bubble-mine text-bubble-mine-foreground"
              : "bg-bubble-them text-bubble-them-foreground",
            mine
              ? first
                ? "rounded-2xl rounded-br-md"
                : "rounded-2xl rounded-tr-md rounded-br-md"
              : first
                ? "rounded-2xl rounded-bl-md"
                : "rounded-2xl rounded-tl-md rounded-bl-md",
            pending && "opacity-60",
          )}
        >
          {m.deleted ? (
            <span className="italic opacity-70">Message removed</span>
          ) : (
            <MessageBody body={m.body ?? ""} mine={mine} />
          )}
        </div>
      </div>

      {last ? (
        <div
          className={cn(
            "mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground",
            mine ? "mr-1 self-end" : "ml-1.5 self-start",
          )}
        >
          <time dateTime={m.created_at}>{timeLabel(m.created_at)}</time>
          {mine ? (
            phase === "failed" ? (
              <button
                type="button"
                onClick={onRetry}
                className="font-semibold text-destructive hover:underline"
              >
                Failed · Tap to retry
              </button>
            ) : (
              <SendState phase={phase} seen={seen} />
            )
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
