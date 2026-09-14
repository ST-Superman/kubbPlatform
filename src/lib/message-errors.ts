/**
 * Human copy for the error codes the messaging RPCs raise (send_message /
 * start_or_get_dm / start_or_get_match_conversation). Kept in its own module — with
 * no server imports — so client components can use it without pulling next/headers
 * into the browser bundle (src/lib/supabase/messages.ts imports the server client).
 */
export function messageErrorText(code: string | undefined | null): string {
  switch (code) {
    case "blocked":
      return "You can’t message this player.";
    case "rate_limited":
      return "Slow down a moment — too many messages.";
    case "dm_not_allowed":
      return "You can only message players you’ve played or challenged.";
    case "not_a_member":
      return "You’re not part of this conversation.";
    case "not_a_participant":
      return "Only players in this match can use match chat.";
    case "body_range":
      return "Message must be between 1 and 4000 characters.";
    default:
      return "Couldn’t send that — try again.";
  }
}
