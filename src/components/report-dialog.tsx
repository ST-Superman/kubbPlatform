"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/**
 * Replaces window.prompt for reporting (F10) and adds the missing block
 * confirmation (F11).
 *
 * Why categories instead of free text: /admin/reports needs something to sort
 * and triage by, and "what's the problem?" as an open question mostly returns
 * one-word answers. The reason is PREFIXED onto p_reason — "[harassment] they
 * kept..." — so report_message needs no migration. Add a real column later if
 * moderation wants to filter on it.
 */
const REASONS = [
  { id: "harassment", label: "Harassment", autoBlock: true },
  { id: "spam", label: "Spam", autoBlock: false },
  { id: "cheating", label: "Cheating claim", autoBlock: false },
  { id: "other", label: "Something else", autoBlock: false },
] as const;

type ReasonId = (typeof REASONS)[number]["id"];

export function ReportDialog({
  open,
  onOpenChange,
  messageId,
  senderId,
  senderName,
  quoted,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  messageId: string;
  senderId: string;
  senderName: string;
  quoted: string;
  onDone?: () => void;
}) {
  const [reason, setReason] = useState<ReasonId | null>(null);
  const [detail, setDetail] = useState("");
  const [alsoBlock, setAlsoBlock] = useState(false);
  const [pending, start] = useTransition();

  function choose(r: (typeof REASONS)[number]) {
    setReason(r.id);
    setAlsoBlock(r.autoBlock); // harassment defaults to blocking too
  }

  function submit() {
    if (!reason) return;
    start(async () => {
      const supabase = createClient();
      const text = detail.trim() ? `[${reason}] ${detail.trim()}` : `[${reason}]`;
      const { error } = await supabase.rpc("report_message", {
        p_message_id: messageId,
        p_reason: text,
      });
      if (error) {
        toast.error("Couldn't file that report.");
        return;
      }
      if (alsoBlock) {
        const { error: blockError } = await supabase.rpc("block_player", {
          p_player: senderId,
        });
        if (blockError) {
          toast.error("Reported, but couldn't block that player.");
          onOpenChange(false);
          return;
        }
      }
      toast.success(
        alsoBlock ? "Reported and blocked." : "Reported — thanks. We'll take a look.",
      );
      onOpenChange(false);
      setReason(null);
      setDetail("");
      onDone?.();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogTitle className="display text-xl font-medium">Report this message</DialogTitle>

        <blockquote className="rounded-xl bg-muted px-3.5 py-2.5 text-sm italic text-muted-foreground">
          {quoted.length > 160 ? `${quoted.slice(0, 160)}…` : quoted}
        </blockquote>

        <fieldset>
          <legend className="eyebrow text-muted-foreground">WHAT’S THE PROBLEM?</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {REASONS.map((r) => (
              <button
                key={r.id}
                type="button"
                role="radio"
                aria-checked={reason === r.id}
                onClick={() => choose(r)}
                className={cn(
                  "rounded-full border px-3.5 py-2.5 font-mono text-[10px] font-bold tracking-[1.2px] uppercase transition-colors",
                  reason === r.id
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground hover:bg-muted",
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
        </fieldset>

        <Textarea
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
          maxLength={500}
          placeholder="Anything else we should know? (optional)"
          aria-label="Report detail"
        />

        <label className="flex items-center gap-2.5 text-sm">
          <input
            type="checkbox"
            checked={alsoBlock}
            onChange={(e) => setAlsoBlock(e.target.checked)}
            className="size-5 rounded-md accent-primary"
          />
          Also block {senderName}
        </label>

        <div className="flex gap-2.5">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="h-11 flex-1 rounded-xl border border-border font-mono text-[11px] font-bold tracking-[1.4px] text-muted-foreground uppercase"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!reason || pending}
            className="h-11 flex-1 rounded-xl bg-destructive font-mono text-[11px] font-bold tracking-[1.4px] text-white uppercase disabled:opacity-40"
          >
            {pending ? "Sending…" : "Send report"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** F11 — blocking must always confirm. One tap in a menu is not enough. */
export function BlockConfirm({
  open,
  onOpenChange,
  playerName,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  playerName: string;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogTitle className="display text-xl font-medium">
          Block {playerName}?
        </AlertDialogTitle>
        <AlertDialogDescription>
          They won’t be able to message you or add you to groups. Existing messages stay
          hidden. You can undo this in Message settings.
        </AlertDialogDescription>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-destructive text-white hover:bg-destructive/90"
          >
            Block
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
