"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import type { AnnouncementSeverity } from "@/lib/supabase/messages";
import { cn } from "@/lib/utils";

/** Admin composer: publish an announcement now, or save a draft. */
export function AnnouncementComposer() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [severity, setSeverity] = useState<AnnouncementSeverity>("promo");
  const [pending, start] = useTransition();

  function submit(publish: boolean) {
    if (!title.trim() || !body.trim() || pending) return;
    start(async () => {
      const supabase = createClient();
      const { error } = await supabase.rpc("publish_announcement", {
        p_title: title.trim(),
        p_body: body.trim(),
        p_severity: severity,
        p_publish: publish,
      });
      if (error) {
        toast.error(error.message === "not_admin" ? "Admins only." : "Couldn’t save that.");
        return;
      }
      toast.success(publish ? "Announcement published." : "Draft saved.");
      setTitle("");
      setBody("");
      setSeverity("promo");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={200}
        placeholder="Title"
        className="w-full rounded-xl border border-input bg-background px-3.5 py-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={8000}
        rows={4}
        placeholder="Message to all users…"
        className="w-full resize-y rounded-xl border border-input bg-background px-3.5 py-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
      />
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">Severity:</span>
        {(["promo", "critical"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSeverity(s)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium capitalize",
              severity === s
                ? "bg-primary text-primary-foreground"
                : "border border-border text-muted-foreground hover:bg-muted",
            )}
          >
            {s}
          </button>
        ))}
        <span className="text-[11px] text-muted-foreground">
          {severity === "critical" ? "Always shown (can’t be muted)" : "Users can mute promo"}
        </span>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => submit(true)}
          disabled={pending || !title.trim() || !body.trim()}
          className="h-10 flex-1 rounded-xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          Publish now
        </button>
        <button
          type="button"
          onClick={() => submit(false)}
          disabled={pending || !title.trim() || !body.trim()}
          className="h-10 rounded-xl border border-border px-4 text-sm font-medium hover:bg-muted disabled:opacity-50"
        >
          Save draft
        </button>
      </div>
    </div>
  );
}
