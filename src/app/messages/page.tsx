import { redirect } from "next/navigation";
import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { getMyConversations } from "@/lib/supabase/messages";
import { ConversationList } from "@/components/conversation-list";

/** Inbox — the signed-in user's conversations. */
export default async function MessagesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirectTo=/messages");

  const conversations = await getMyConversations();

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-10 sm:py-14">
      <div className="flex items-end justify-between gap-3">
        <div>
          <span className="eyebrow text-muted-foreground">MESSAGES</span>
          <h1 className="display mt-2 text-3xl font-medium">Your conversations</h1>
          <p className="mt-2 max-w-prose text-sm text-muted-foreground">
            Chat with players you’ve played or challenged. Messages update live.
          </p>
        </div>
        <Link
          href="/messages/new"
          className="shrink-0 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
        >
          New group
        </Link>
      </div>
      <ConversationList initial={conversations} />
    </div>
  );
}
