import { redirect } from "next/navigation";
import Link from "next/link";

import { getMyProfile } from "@/lib/supabase/profiles";
import { createClient } from "@/lib/supabase/server";
import { ProfileForm } from "@/components/profile-form";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function ProfilePage() {
  const profile = await getMyProfile();

  // Middleware gates this route; if there's somehow no profile, send to login.
  if (!profile) redirect("/login?redirectTo=/profile");

  const memberSince = new Date(profile.created_at).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
  });

  // Membership status (my_membership returns one row; entitled reflects paid OR Beta window).
  const supabase = await createClient();
  const { data: memData } = await supabase.rpc("my_membership");
  const m = (Array.isArray(memData) ? memData[0] : memData) as
    | { expires_at: string | null; beta_free_until: string | null }
    | undefined;
  const fmtDate = (d: string | null | undefined) =>
    d
      ? new Date(d).toLocaleDateString(undefined, {
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      : null;
  const membershipUntil = fmtDate(m?.expires_at);
  const betaThrough = fmtDate(m?.beta_free_until);
  const betaOpen = !!(m?.beta_free_until && new Date(m.beta_free_until) > new Date());

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-12 sm:py-16">
      <div>
        <span className="eyebrow text-muted-foreground">YOUR PROFILE</span>
        <h1 className="display mt-2 text-3xl font-medium">Profile</h1>
      </div>

      <Card>
        <CardContent className="flex items-center gap-4 pt-6">
          <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-full bg-secondary text-lg font-semibold text-secondary-foreground">
            {profile.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.avatar_url}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              profile.display_name.charAt(0).toUpperCase()
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate text-lg font-medium">
              {profile.display_name}
            </p>
            <p className="truncate font-mono text-sm text-muted-foreground">
              @{profile.handle}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Member since {memberSince}
            </p>
          </div>
        </CardContent>
      </Card>

      <Link
        href={`/u/${profile.handle}`}
        className="self-start text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        View your player card →
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>Membership</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {membershipUntil ? (
            <div>
              <p className="text-sm font-medium">Active until {membershipUntil}</p>
              {betaOpen ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Beta is free for everyone right now — your paid time is banked for
                  when it ends.
                </p>
              ) : null}
            </div>
          ) : betaOpen ? (
            <div>
              <p className="text-sm font-medium">Free during Beta</p>
              {betaThrough ? (
                <p className="mt-1 text-xs text-muted-foreground">Through {betaThrough}.</p>
              ) : null}
            </div>
          ) : (
            <p className="text-sm font-medium text-muted-foreground">
              No active membership
            </p>
          )}
          <Link
            href="/membership"
            className="self-start text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            {membershipUntil ? "Extend membership →" : "Get a membership →"}
          </Link>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Edit profile</CardTitle>
        </CardHeader>
        <CardContent>
          <ProfileForm profile={profile} />
        </CardContent>
      </Card>

      <Link
        href="/reset-password"
        className="self-start text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        Change password →
      </Link>
    </div>
  );
}
