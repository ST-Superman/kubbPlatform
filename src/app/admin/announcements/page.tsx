import { notFound, redirect } from "next/navigation";
import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { getAllAnnouncements, isPlatformAdmin } from "@/lib/supabase/messages";
import { AnnouncementComposer } from "@/components/announcement-composer";
import { cn } from "@/lib/utils";

/** Admin-only: publish announcements + review drafts/published. */
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

      <AnnouncementComposer />

      <div className="flex flex-col gap-2">
        <span className="eyebrow text-muted-foreground">ALL ANNOUNCEMENTS</span>
        {announcements.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border px-6 py-10 text-center text-sm text-muted-foreground">
            None yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {announcements.map((a) => (
              <li key={a.id} className="rounded-xl border border-border bg-card px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">{a.title}</span>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                      a.published_at
                        ? "bg-muted text-muted-foreground"
                        : "bg-[var(--swedish-gold)]/15 text-[var(--gold-ink)]",
                    )}
                  >
                    {a.published_at ? a.severity : "draft"}
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-sm text-muted-foreground">
                  {a.body}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
