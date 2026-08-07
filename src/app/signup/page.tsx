import { Suspense } from "react";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { signup } from "@/app/auth/actions";
import { AuthForm } from "@/components/auth-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function SignupPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/dashboard");

  return (
    <div className="mx-auto flex max-w-md flex-col px-4 py-16">
      <Card>
        <CardHeader>
          <CardTitle className="display text-2xl">
            Create your account
          </CardTitle>
          <CardDescription>
            Join the platform to play ranked and friendly kubb matches.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense>
            <AuthForm mode="signup" action={signup} />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  );
}
