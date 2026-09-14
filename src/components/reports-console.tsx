"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import type { MessageReport, ReportStatus } from "@/lib/supabase/messages";
import { cn } from "@/lib/utils";

const FILTERS: { key: ReportStatus | "all"; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "reviewed", label: "Reviewed" },
  { key: "actioned", label: "Actioned" },
  { key: "dismissed", label: "Dismissed" },
  { key: "all", label: "All" },
];

/** Minimal moderation queue — filter by status, resolve reports, soft-delete messages. */
export function ReportsConsole({ initial }: { initial: MessageReport[] }) {
  const [filter, setFilter] = useState<ReportStatus | "all">("open");
  const [reports, setReports] = useState<MessageReport[]>(initial);
  const [pending, start] = useTransition();

  function load(next: ReportStatus | "all") {
    setFilter(next);
    start(async () => {
      const supabase = createClient();
      const { data } = await supabase.rpc("list_message_reports", {
        p_status: next === "all" ? null : next,
      });
      setReports((data ?? []) as MessageReport[]);
    });
  }

  function resolve(reportId: string, status: ReportStatus, deleteMessage: boolean) {
    start(async () => {
      const supabase = createClient();
      const { error } = await supabase.rpc("resolve_report", {
        p_report_id: reportId,
        p_status: status,
        p_delete_message: deleteMessage,
      });
      if (error) {
        toast.error("Couldn’t update that report.");
        return;
      }
      toast.success(deleteMessage ? "Message removed; report actioned." : `Report ${status}.`);
      const { data } = await supabase.rpc("list_message_reports", {
        p_status: filter === "all" ? null : filter,
      });
      setReports((data ?? []) as MessageReport[]);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => load(f.key)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium",
              filter === f.key
                ? "bg-primary text-primary-foreground"
                : "border border-border text-muted-foreground hover:bg-muted",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {reports.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">
          No reports {filter === "all" ? "" : `(${filter})`}.
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {reports.map((r) => (
            <li key={r.report_id} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-center justify-between gap-2">
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                    r.status === "open"
                      ? "bg-destructive/10 text-destructive"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {r.status}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {new Date(r.created_at).toLocaleString()}
                </span>
              </div>

              <div className="mt-2 rounded-xl border border-border bg-muted/40 px-3 py-2 text-sm">
                {r.message ? (
                  <>
                    <span className={cn("whitespace-pre-wrap break-words", r.message.deleted && "italic opacity-60")}>
                      {r.message.body}
                    </span>
                    {r.message.deleted ? (
                      <span className="ml-1 text-[11px] font-medium text-muted-foreground">(removed)</span>
                    ) : null}
                  </>
                ) : (
                  <span className="italic text-muted-foreground">Message no longer exists.</span>
                )}
              </div>

              <div className="mt-2 grid gap-0.5 text-xs text-muted-foreground">
                <span>
                  Sender: {r.sender ? `${r.sender.display_name}${r.sender.handle ? ` (@${r.sender.handle})` : ""}` : "—"}
                </span>
                <span>
                  Reporter: {r.reporter ? `${r.reporter.display_name}${r.reporter.handle ? ` (@${r.reporter.handle})` : ""}` : "—"}
                </span>
                {r.reason ? <span>Reason: {r.reason}</span> : null}
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => resolve(r.report_id, "reviewed", false)}
                  disabled={pending}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
                >
                  Mark reviewed
                </button>
                <button
                  type="button"
                  onClick={() => resolve(r.report_id, "dismissed", false)}
                  disabled={pending}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
                >
                  Dismiss
                </button>
                <button
                  type="button"
                  onClick={() => resolve(r.report_id, "actioned", true)}
                  disabled={pending || !r.message || r.message.deleted}
                  className="rounded-lg border border-destructive/40 px-3 py-1.5 text-xs font-semibold text-destructive hover:bg-destructive/10 disabled:opacity-50"
                >
                  Remove message + action
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
