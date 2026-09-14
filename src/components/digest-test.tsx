"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";

/**
 * Admin utility: fire a digest run now (same path as the pg_cron schedule) so email
 * changes can be tested without waiting for 13:00 UTC. This is a REAL run — it emails
 * every user on that cadence who has unread messages, not just the admin.
 */
export function DigestTest() {
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<"daily" | "weekly" | null>(null);

  function fire(cadence: "daily" | "weekly") {
    setBusy(cadence);
    start(async () => {
      const { error } = await createClient().rpc("admin_send_test_digest", { p_cadence: cadence });
      setBusy(null);
      if (error) {
        toast.error(error.message === "not_admin" ? "Admins only." : "Couldn’t fire the digest.");
        return;
      }
      toast.success(`${cadence === "daily" ? "Daily" : "Weekly"} digest fired — recipients with unread get an email shortly.`);
    });
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="text-sm font-semibold">Digest testing</div>
      <p className="mt-0.5 text-sm text-muted-foreground">
        Runs the digest job now (same as the scheduled run) — emails every user on that
        cadence who has unread messages. Check the <code>notify-message</code> logs after.
      </p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => fire("daily")}
          disabled={pending}
          className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
        >
          {busy === "daily" ? "Firing…" : "Send daily digest now"}
        </button>
        <button
          type="button"
          onClick={() => fire("weekly")}
          disabled={pending}
          className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
        >
          {busy === "weekly" ? "Firing…" : "Send weekly digest now"}
        </button>
      </div>
    </div>
  );
}
