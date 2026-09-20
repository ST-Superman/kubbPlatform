import { createClient } from "@/lib/supabase/server";

/**
 * Messaging wrapper — types + server-side read helpers for the W1 chat surface,
 * matching the shape of src/lib/supabase/matches.ts. Every read goes through a
 * SECURITY DEFINER RPC keyed on auth.uid() (see 20260913120000_messaging_w1.sql).
 *
 * Interactive writes (send_message, mark_read, block_player, report_message,
 * start_or_get_dm / _match_conversation, set_message_prefs) are called inline from
 * client components via the browser client — this file only owns the shared types
 * + the server reads that seed the pages.
 */

export type ConversationType = "dm" | "group" | "match";

export type ConversationOther = {
  player_id: string;
  display_name: string;
  handle: string | null;
  avatar_url: string | null;
};

export type LastMessage = {
  body: string | null; // null when the last message was deleted
  created_at: string;
  sender_player_id: string;
  sender_display_name: string | null;
};

export type ConversationSummary = {
  conversation_id: string;
  type: ConversationType;
  title: string | null;
  match_id: string | null;
  muted: boolean;
  other: ConversationOther | null; // populated for DMs and match rows (the opponent)
  last_message: LastMessage | null;
  last_at: string | null;
  member_count: number;
  blocked: boolean; // dm/match: a block exists in either direction
  unread: number;
};

export type ThreadMessage = {
  id: string;
  sender_player_id: string;
  sender_display_name: string | null;
  sender_handle: string | null;
  body: string | null; // null when deleted
  deleted: boolean;
  created_at: string;
  sort_at: string; // thread ordering key (= created_at, or the match anchor for rolled-up messages)
  from_match_id: string | null; // set when this message was rolled up from a match
};

export type DmEmailCadence = "in_app" | "daily" | "weekly";

export type MessagePrefs = {
  dm_policy: "eligible" | "none";
  dm_emails: boolean;
  allow_group_add: boolean;
  announcement_promo: boolean;
  dm_email_cadence: DmEmailCadence;
  read_receipts: boolean;
};

export type GroupablePlayer = {
  player_id: string;
  display_name: string;
  handle: string | null;
  avatar_url: string | null;
};

export type GroupMember = GroupablePlayer & {
  role: "member" | "owner";
  joined_at: string;
};

export type AnnouncementSeverity = "promo" | "critical";

export type Announcement = {
  id: string;
  title: string;
  body: string;
  severity: AnnouncementSeverity;
  published_at: string | null;
  read?: boolean; // present on list_announcements; absent on the admin list
  created_at?: string; // present on list_all_announcements
};

export type ReportStatus = "open" | "reviewed" | "actioned" | "dismissed";

export type MessageReport = {
  report_id: string;
  status: ReportStatus;
  reason: string | null;
  created_at: string;
  message: {
    id: string;
    conversation_id: string;
    body: string;
    deleted: boolean;
    created_at: string;
  } | null;
  sender: { display_name: string; handle: string | null } | null;
  reporter: { display_name: string; handle: string | null } | null;
};

/** The signed-in user's inbox (conversations + last message + unread count). */
export async function getMyConversations(): Promise<ConversationSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_my_conversations");
  if (error || !data) return [];
  return data as ConversationSummary[];
}

/** One conversation's summary (for the thread header + membership check), or null. */
export async function getConversationSummary(
  conversationId: string,
): Promise<ConversationSummary | null> {
  const all = await getMyConversations();
  return all.find((c) => c.conversation_id === conversationId) ?? null;
}

/**
 * A page of a thread, oldest-first. `before` pages backwards (pass the oldest
 * message's created_at). Returns [] if the caller isn't a member.
 */
export async function getConversationMessages(
  conversationId: string,
  before?: string,
  limit = 50,
): Promise<ThreadMessage[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("conversation_messages", {
    p_conversation_id: conversationId,
    p_before: before ?? null,
    p_limit: limit,
  });
  if (error || !data) return [];
  return data as ThreadMessage[];
}

/** The caller's players.id (players has a public authenticated read policy), or null. */
export async function getMyPlayerId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("players")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

/** Sum of unread across all conversations — drives the nav badge. */
export async function getUnreadTotal(): Promise<number> {
  const convos = await getMyConversations();
  return convos.reduce((sum, c) => sum + (c.unread || 0), 0);
}

/** The caller's messaging privacy prefs (provisions defaults on first read). */
export async function getMyMessagePrefs(): Promise<MessagePrefs> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_message_prefs");
  const d = (data ?? {}) as Partial<MessagePrefs>;
  return {
    dm_policy: d.dm_policy ?? "eligible",
    dm_emails: d.dm_emails ?? true,
    allow_group_add: d.allow_group_add ?? true,
    announcement_promo: d.announcement_promo ?? true,
    dm_email_cadence: d.dm_email_cadence ?? "in_app",
    read_receipts: d.read_receipts ?? true, // absent until the migration lands → default on
  };
}

/** Accounts the caller may add to a group (shared history, not blocked, opted in). */
export async function getGroupablePlayers(): Promise<GroupablePlayer[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_groupable_players");
  if (error || !data) return [];
  return data as GroupablePlayer[];
}

/** The roster (with roles) for a conversation the caller belongs to. */
export async function getGroupMembers(conversationId: string): Promise<GroupMember[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("group_members", {
    p_conversation_id: conversationId,
  });
  if (error || !data) return [];
  return data as GroupMember[];
}

/** Published announcements the caller should see (promo mute honored), with read flags. */
export async function getAnnouncements(): Promise<Announcement[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_announcements");
  if (error || !data) return [];
  return data as Announcement[];
}

/** Whether the signed-in user is a platform admin. */
export async function isPlatformAdmin(): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("is_platform_admin");
  return data === true;
}

/** Admin: every announcement including drafts. Returns [] for non-admins. */
export async function getAllAnnouncements(): Promise<Announcement[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_all_announcements");
  if (error || !data) return [];
  return data as Announcement[];
}

/** Admin: the moderation queue. `status` filters; omit for all. Returns [] for non-admins. */
export async function getMessageReports(status?: ReportStatus): Promise<MessageReport[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_message_reports", {
    p_status: status ?? null,
  });
  if (error || !data) return [];
  return data as MessageReport[];
}

// Error-code copy for client toasts lives in src/lib/message-errors.ts (no server
// import) so client components can use it without pulling next/headers into the bundle.
