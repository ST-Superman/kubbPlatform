import { redirect } from "next/navigation";
import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { getGroupablePlayers } from "@/lib/supabase/messages";
import { NewGroupForm } from "@/components/new-group-form";

/** Create a new group conversation. */
export default async function NewGroupPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirectTo=/messages/new");

  const players = await getGroupablePlayers();

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-6 px-4 py-10 sm:py-14">
      <div>
        <Link href="/messages" className="eyebrow text-muted-foreground hover:underline">
          ← Messages
        </Link>
        <h1 className="display mt-2 text-3xl font-medium">New group</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Name the group and add players you’ve played or challenged.
        </p>
      </div>
      <NewGroupForm players={players} />
    </div>
  );
}
