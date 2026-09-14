import { notFound, redirect } from "next/navigation";
import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { getMessageReports, isPlatformAdmin } from "@/lib/supabase/messages";
import { ReportsConsole } from "@/components/reports-console";
import { DigestTest } from "@/components/digest-test";

/** Admin-only moderation queue. Non-admins get a 404 (no admin surface leaked). */
export default async function AdminReportsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirectTo=/admin/reports");
  if (!(await isPlatformAdmin())) notFound();

  const reports = await getMessageReports("open");

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-10 sm:py-14">
      <div className="flex items-end justify-between gap-3">
        <div>
          <span className="eyebrow text-muted-foreground">ADMIN</span>
          <h1 className="display mt-2 text-3xl font-medium">Reports</h1>
        </div>
        <Link href="/admin/announcements" className="text-sm font-medium text-primary hover:underline">
          Announcements →
        </Link>
      </div>
      <ReportsConsole initial={reports} />
      <DigestTest />
    </div>
  );
}
