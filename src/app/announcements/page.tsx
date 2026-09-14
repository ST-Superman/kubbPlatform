import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getAnnouncements } from "@/lib/supabase/messages";
import { AnnouncementsView } from "@/components/announcements-view";

/** Public (authenticated) announcements list. */
export default async function AnnouncementsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirectTo=/announcements");

  const announcements = await getAnnouncements();

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-10 sm:py-14">
      <div>
        <span className="eyebrow text-muted-foreground">ANNOUNCEMENTS</span>
        <h1 className="display mt-2 text-3xl font-medium">What’s new</h1>
      </div>
      <AnnouncementsView announcements={announcements} />
    </div>
  );
}
