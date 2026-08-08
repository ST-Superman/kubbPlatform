import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/profiles";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Belt-and-suspenders: middleware already gates this route.
  if (!user) redirect("/login?redirectTo=/dashboard");

  const profile = await getMyProfile();

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-16">
      <div>
        <span className="eyebrow text-muted-foreground">YOUR ACCOUNT</span>
        <h1 className="display mt-2 text-3xl font-medium">
          Welcome{profile ? `, ${profile.display_name}` : ""}
        </h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Your identity</CardTitle>
          <CardDescription>
            Created automatically on signup by the{" "}
            <code className="font-mono text-xs">handle_new_user</code> trigger.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Handle</span>
            <span className="font-mono">
              {profile ? `@${profile.handle}` : "—"}
            </span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Display name</span>
            <span className="font-medium">{profile?.display_name ?? "—"}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Email</span>
            <span className="font-medium">{user.email}</span>
          </div>
          <Link
            href="/profile"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-2 w-fit")}
          >
            Edit profile
          </Link>
        </CardContent>
      </Card>

      <p className="text-sm text-muted-foreground">
        Add someone by name on the{" "}
        <Link href="/players" className="font-medium text-primary underline-offset-4 hover:underline">
          Players
        </Link>{" "}
        page and share a claim link — they can claim the identity later and every
        result recorded under it becomes theirs.
      </p>
    </div>
  );
}
