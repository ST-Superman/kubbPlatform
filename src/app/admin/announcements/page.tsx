import { notFound, redirect } from "next/navigation";
import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { getAllAnnouncements, isPlatformAdmin } from "@/lib/supabase/messages";
import { AnnouncementsAdmin } from "@/components/announcements-admin";

/** Admin-only: publish, edit, publish-toggle, and delete announcements. */
export default async function AdminAnnouncementsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirectTo=/admin/announcements");
  if (!(await isPlatformAdmin())) notFound();

  const announcements = await getAllAnnouncements();

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-10 sm:py-14">
      <div className="flex items-end justify-between gap-3">
        <div>
          <span className="eyebrow text-muted-foreground">ADMIN</span>
          <h1 className="display mt-2 text-3xl font-medium">Announcements</h1>
        </div>
        <Link href="/admin/reports" className="text-sm font-medium text-primary hover:underline">
          Reports →
        </Link>
      </div>

      <AnnouncementsAdmin initial={announcements} />
    </div>
  );
}
