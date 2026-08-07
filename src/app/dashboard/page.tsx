import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
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

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-16">
      <div>
        <span className="eyebrow text-muted-foreground">YOUR ACCOUNT</span>
        <h1 className="display mt-2 text-3xl font-medium">Dashboard</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Signed in</CardTitle>
          <CardDescription>
            The auth session reached a Server Component and RLS can see{" "}
            <code className="font-mono text-xs">auth.uid()</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Email</span>
            <span className="font-medium">{user.email}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">User ID</span>
            <span className="font-mono text-xs">{user.id}</span>
          </div>
        </CardContent>
      </Card>

      <p className="text-sm text-muted-foreground">
        Next up (Phase 1): a <code className="font-mono text-xs">profiles</code>{" "}
        row created on signup, editable handle and display name, and claimable
        managed players.
      </p>
    </div>
  );
}
