"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

/**
 * Messaging privacy toggles, self-only via set_message_prefs (SECURITY DEFINER):
 *  - dm_policy ('eligible' | 'none') — gates can_dm (who may DM you).
 *  - announcement_promo — mute promotional announcements ('critical' always shows).
 * Both optimistic. dm_emails / allow_group_add columns exist for later phases and
 * aren't surfaced yet.
 */
export function MessageSettings({
  initialDmPolicy,
  initialAnnouncementPromo,
}: {
  initialDmPolicy: "eligible" | "none";
  initialAnnouncementPromo: boolean;
}) {
  const [dmOn, setDmOn] = useState(initialDmPolicy === "eligible");
  const [promoOn, setPromoOn] = useState(initialAnnouncementPromo);
  const [pending, start] = useTransition();

  function save(
    args: { p_dm_policy?: "eligible" | "none"; p_announcement_promo?: boolean },
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

  return (
    <div className="flex flex-col gap-5">
      <Row
        title="Direct messages"
        description="When on, players you’ve played or challenged can message you. When off, no one can start or continue a DM with you."
        checked={dmOn}
        onToggle={toggleDm}
        disabled={pending}
      />
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
