import { redirect } from "next/navigation";
import Link from "next/link";

import { getMyProfile } from "@/lib/supabase/profiles";
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
