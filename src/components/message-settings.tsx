"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import type { DmEmailCadence } from "@/lib/supabase/messages";
import { cn } from "@/lib/utils";

const CADENCE_OPTIONS: { value: DmEmailCadence; label: string; description: string }[] = [
  { value: "in_app", label: "In-app only", description: "No emails — just the unread badge and the Messages tab. (Default)" },
  { value: "daily", label: "Daily review", description: "One email a day recapping unread messages." },
  { value: "weekly", label: "Weekly review", description: "One email each Saturday recapping unread messages." },
];

/**
 * Messaging preferences, self-only via set_message_prefs (SECURITY DEFINER):
 *  - dm_policy ('eligible' | 'none') — gates can_dm (who may DM you).
 *  - dm_email_cadence — how (and whether) we email you about DMs.
 *  - announcement_promo — mute promotional announcements ('critical' always shows).
 * All optimistic. allow_group_add exists in the schema and isn't surfaced yet.
 */
export function MessageSettings({
  initialDmPolicy,
  initialAnnouncementPromo,
  initialDmEmailCadence,
}: {
  initialDmPolicy: "eligible" | "none";
  initialAnnouncementPromo: boolean;
  initialDmEmailCadence: DmEmailCadence;
}) {
  const [dmOn, setDmOn] = useState(initialDmPolicy === "eligible");
  const [promoOn, setPromoOn] = useState(initialAnnouncementPromo);
  const [cadence, setCadence] = useState<DmEmailCadence>(initialDmEmailCadence);
  const [pending, start] = useTransition();

  function save(
    args: {
      p_dm_policy?: "eligible" | "none";
      p_announcement_promo?: boolean;
      p_dm_email_cadence?: DmEmailCadence;
    },
    revert: () => void,
    okMsg: string,
  ) {
    start(async () => {
      const supabase = createClient();
      const { error } = await supabase.rpc("set_message_prefs", args);
      if (error) {
        revert();
        toast.error("Couldn’t save that — try again.");
        return;
      }
      toast.success(okMsg);
    });
  }

  function toggleDm() {
    const next = !dmOn;
    setDmOn(next);
    save(
      { p_dm_policy: next ? "eligible" : "none" },
      () => setDmOn(!next),
      next ? "Direct messages on" : "Direct messages off",
    );
  }

  function togglePromo() {
    const next = !promoOn;
    setPromoOn(next);
    save(
      { p_announcement_promo: next },
      () => setPromoOn(!next),
      next ? "Promo announcements on" : "Promo announcements muted",
    );
  }

  function chooseCadence(next: DmEmailCadence) {
    if (next === cadence) return;
    const prev = cadence;
    setCadence(next);
    save({ p_dm_email_cadence: next }, () => setCadence(prev), "Email preference saved");
  }

  return (
    <div className="flex flex-col gap-6">
      <Row
        title="Direct messages"
        description="When on, players you’ve played or challenged can message you. When off, no one can start or continue a DM with you."
        checked={dmOn}
        onToggle={toggleDm}
        disabled={pending}
      />

      <div>
        <div className="text-sm font-semibold">Message emails</div>
        <p className="mt-0.5 text-sm text-muted-foreground">
          How you’re emailed about unread direct messages.
        </p>
        <div className="mt-2 flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border">
          {CADENCE_OPTIONS.map((o) => {
            const selected = cadence === o.value;
            return (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => chooseCadence(o.value)}
                disabled={pending}
                className="flex items-start gap-3 px-3.5 py-3 text-left hover:bg-muted/50 disabled:opacity-60"
              >
                <span
                  className={cn(
                    "mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border",
                    selected ? "border-primary" : "border-input",
                  )}
                >
                  {selected ? <span className="size-2 rounded-full bg-primary" /> : null}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{o.label}</span>
                  <span className="block text-sm text-muted-foreground">{o.description}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <Row
        title="Promotional announcements"
        description="Product news and tips. Turn off to mute promos — important (critical) announcements are always shown."
        checked={promoOn}
        onToggle={togglePromo}
        disabled={pending}
      />
    </div>
  );
}

function Row({
  title,
  description,
  checked,
  onToggle,
  disabled,
}: {
  title: string;
  description: string;
  checked: boolean;
  onToggle: () => void;
  disabled: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <div className="text-sm font-semibold">{title}</div>
        <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={title}
        onClick={onToggle}
        disabled={disabled}
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60",
          checked ? "bg-primary" : "bg-input",
        )}
      >
        <span
          className={cn(
            "inline-block size-5 rounded-full bg-white shadow transition-transform",
            checked ? "translate-x-[22px]" : "translate-x-0.5",
          )}
        />
      </button>
    </div>
  );
}
