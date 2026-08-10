"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ResetPasswordForm() {
  const router = useRouter();
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pw.length < 6) {
      toast.error("Password must be at least 6 characters.");
      return;
    }
    if (pw !== confirm) {
      toast.error("Passwords don't match.");
      return;
    }
    start(async () => {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password: pw });
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("Password updated.");
      router.push("/dashboard");
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">
          <span className="eyebrow text-muted-foreground">New password</span>
        </Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          className="h-12 text-base"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          minLength={6}
          required
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="confirm">
          <span className="eyebrow text-muted-foreground">Confirm password</span>
        </Label>
        <Input
          id="confirm"
          type="password"
          autoComplete="new-password"
          className="h-12 text-base"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          minLength={6}
          required
        />
      </div>
      <Button type="submit" disabled={pending} className="h-12 w-full">
        {pending ? "Saving…" : "Update password"}
      </Button>
    </form>
  );
}
