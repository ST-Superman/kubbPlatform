import { redirect } from "next/navigation";
import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { NotificationSettings } from "@/components/notification-settings";
import { MessageSettings } from "@/components/message-settings";
import { getMyMessagePrefs } from "@/lib/supabase/messages";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * Email notification preferences.
 *
 * Reached three ways:
 *  - signed-in, from the app or the email's "Manage email preferences" link → toggle;
 *  - from /api/unsubscribe?...  → redirects here with ?done=1 (logged-out friendly);
 *  - anywhere else while logged-out → sent to login first.
 */
export default async function NotificationSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ done?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // One-tap unsubscribe confirmation — must render without a session.
  if (!user) {
    if (sp.done) {
      return (
        <div className="mx-auto flex w-full max-w-lg flex-col gap-6 px-4 py-10">
          <Card>
            <CardHeader>
              <CardTitle>You&rsquo;re unsubscribed</CardTitle>
              <CardDescription>
                You won&rsquo;t get challenge emails from Kubb Portal anymore. You can turn
                them back on any time from your account.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link
                href="/login?redirectTo=/settings/notifications"
                className="text-sm font-medium text-primary underline-offset-4 hover:underline"
              >
                Sign in to manage preferences →
              </Link>
            </CardContent>
          </Card>
        </div>
      );
    }
    redirect("/login?redirectTo=/settings/notifications");
  }

  const { data } = await supabase.rpc("my_notification_prefs");
  const challengeEmails =
    (data as { challenge_emails?: boolean } | null)?.challenge_emails ?? true;
  const messagePrefs = await getMyMessagePrefs();

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-6 px-4 py-10">
      <div>
        <span className="font-mono text-[10px] font-bold uppercase tracking-[1.6px] text-muted-foreground">
          Settings
        </span>
        <h1 className="mt-1 font-heading text-2xl font-semibold">Email notifications</h1>
      </div>

      {sp.done ? (
        <p className="rounded-xl border border-[var(--swedish-gold)]/55 bg-[var(--swedish-gold)]/10 px-4 py-3 text-sm font-medium text-[var(--gold-ink)]">
          You&rsquo;ve been unsubscribed from challenge emails.
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>What we email you</CardTitle>
          <CardDescription>
            Only the essentials — no marketing. Turn any of these off whenever you like.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <NotificationSettings initialChallengeEmails={challengeEmails} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Messaging</CardTitle>
          <CardDescription>
            Control who can send you direct messages.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MessageSettings
            initialDmPolicy={messagePrefs.dm_policy}
            initialAnnouncementPromo={messagePrefs.announcement_promo}
            initialDmEmailCadence={messagePrefs.dm_email_cadence}
          />
        </CardContent>
      </Card>

      <Link
        href="/profile"
        className="self-start text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        ← Back to profile
      </Link>
    </div>
  );
}
