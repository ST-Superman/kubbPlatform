"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import type { Announcement, AnnouncementSeverity } from "@/lib/supabase/messages";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/**
 * Admin announcements: compose new ones + manage existing (edit title/body/severity,
 * publish/unpublish, delete). Owns the list in state and refetches list_all_announcements
 * after every write, so the page stays in sync without a full navigation.
 */
export function AnnouncementsAdmin({ initial }: { initial: Announcement[] }) {
  const [items, setItems] = useState<Announcement[]>(initial);
  const [pending, start] = useTransition();

  async function refetch() {
    const { data } = await createClient().rpc("list_all_announcements");
    setItems((data ?? []) as Announcement[]);
  }

  function errText(msg?: string) {
    if (msg === "not_admin") return "Admins only.";
    if (msg === "title_range") return "Title must be 1–200 characters.";
    if (msg === "body_range") return "Body must be 1–8000 characters.";
    return "Couldn’t save that — try again.";
  }

  return (
    <div className="flex flex-col gap-6">
      <Composer
        pending={pending}
        onCreate={(title, body, severity, publish) =>
          start(async () => {
            const { error } = await createClient().rpc("publish_announcement", {
              p_title: title,
              p_body: body,
              p_severity: severity,
              p_publish: publish,
            });
            if (error) {
              toast.error(errText(error.message));
              return;
            }
            toast.success(publish ? "Announcement published." : "Draft saved.");
            await refetch();
          })
        }
      />

      <div className="flex flex-col gap-2">
        <span className="eyebrow text-muted-foreground">ALL ANNOUNCEMENTS</span>
        {items.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border px-6 py-10 text-center text-sm text-muted-foreground">
            None yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {items.map((a) => (
              <Row
                key={a.id}
                a={a}
                pending={pending}
                errText={errText}
                onChange={(fn) => start(fn)}
                refetch={refetch}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Composer({
  pending,
  onCreate,
}: {
  pending: boolean;
  onCreate: (title: string, body: string, severity: AnnouncementSeverity, publish: boolean) => void;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [severity, setSeverity] = useState<AnnouncementSeverity>("promo");

  function go(publish: boolean) {
    if (!title.trim() || !body.trim() || pending) return;
    onCreate(title.trim(), body.trim(), severity, publish);
    setTitle("");
    setBody("");
    setSeverity("promo");
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={200}
        placeholder="Title"
      />
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={8000}
        maxRows={10}
        placeholder="Message to all users…"
        className="min-h-24"
      />
      <SeverityPicker value={severity} onChange={setSeverity} />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => go(true)}
          disabled={pending || !title.trim() || !body.trim()}
          className="h-10 flex-1 rounded-xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          Publish now
        </button>
        <button
          type="button"
          onClick={() => go(false)}
          disabled={pending || !title.trim() || !body.trim()}
          className="h-10 rounded-xl border border-border px-4 text-sm font-medium hover:bg-muted disabled:opacity-50"
        >
          Save draft
        </button>
      </div>
    </div>
  );
}

function Row({
  a,
  pending,
  errText,
  onChange,
  refetch,
}: {
  a: Announcement;
  pending: boolean;
  errText: (msg?: string) => string;
  onChange: (fn: () => Promise<void>) => void;
  refetch: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(a.title);
  const [body, setBody] = useState(a.body);
  const [severity, setSeverity] = useState<AnnouncementSeverity>(a.severity);
  const published = a.published_at != null;

  function save() {
    if (!title.trim() || !body.trim()) return;
    onChange(async () => {
      const { error } = await createClient().rpc("update_announcement", {
        p_id: a.id,
        p_title: title.trim(),
        p_body: body.trim(),
        p_severity: severity,
      });
      if (error) {
        toast.error(errText(error.message));
        return;
      }
      toast.success("Announcement updated.");
      setEditing(false);
      await refetch();
    });
  }

  function togglePublish() {
    onChange(async () => {
      const { error } = await createClient().rpc("set_announcement_published", {
        p_id: a.id,
        p_publish: !published,
      });
      if (error) {
        toast.error(errText(error.message));
        return;
      }
      toast.success(published ? "Unpublished (now a draft)." : "Published.");
      await refetch();
    });
  }

  function del() {
    if (!confirm(`Delete “${a.title}”? This can’t be undone.`)) return;
    onChange(async () => {
      const { error } = await createClient().rpc("delete_announcement", { p_id: a.id });
      if (error) {
        toast.error(errText(error.message));
        return;
      }
      toast.success("Announcement deleted.");
      await refetch();
    });
  }

  return (
    <li className="rounded-xl border border-border bg-card px-4 py-3">
      {editing ? (
        <div className="flex flex-col gap-2">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
          />
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={8000}
            maxRows={8}
            className="min-h-20"
          />
          <SeverityPicker value={severity} onChange={setSeverity} />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={save}
              disabled={pending || !title.trim() || !body.trim()}
              className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setTitle(a.title);
                setBody(a.body);
                setSeverity(a.severity);
              }}
              disabled={pending}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold">{a.title}</span>
            <span
              className={cn(
                "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                published
                  ? "bg-muted text-muted-foreground"
                  : "bg-[var(--swedish-gold)]/15 text-[var(--gold-ink)]",
              )}
            >
              {published ? a.severity : "draft"}
            </span>
          </div>
          <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-sm text-muted-foreground">{a.body}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setEditing(true)}
              disabled={pending}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={togglePublish}
              disabled={pending}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
            >
              {published ? "Unpublish" : "Publish"}
            </button>
            <button
              type="button"
              onClick={del}
              disabled={pending}
              className="rounded-lg border border-destructive/40 px-3 py-1.5 text-xs font-semibold text-destructive hover:bg-destructive/10 disabled:opacity-50"
            >
              Delete
            </button>
          </div>
        </>
      )}
    </li>
  );
}

function SeverityPicker({
  value,
  onChange,
}: {
  value: AnnouncementSeverity;
  onChange: (s: AnnouncementSeverity) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium text-muted-foreground">Severity:</span>
      {(["promo", "critical"] as const).map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => onChange(s)}
          className={cn(
            "rounded-full px-3 py-1 text-xs font-medium capitalize",
            value === s
              ? "bg-primary text-primary-foreground"
              : "border border-border text-muted-foreground hover:bg-muted",
          )}
        >
          {s}
        </button>
      ))}
      <span className="text-[11px] text-muted-foreground">
        {value === "critical" ? "Always shown (can’t be muted)" : "Users can mute promo"}
      </span>
    </div>
  );
}
