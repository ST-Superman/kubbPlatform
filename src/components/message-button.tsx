"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import { messageErrorText } from "@/lib/message-errors";
import { ctaClass } from "@/components/brand";

/**
 * "Message" affordance on a player profile. Opens (or creates) the 1:1 DM with this
 * player via start_or_get_dm — which enforces can_dm server-side — then routes to the
 * thread. Only rendered when the viewer is already eligible (can_dm true), so a click
 * normally succeeds; the toast covers the race where eligibility changed meanwhile.
 */
export function MessageButton({ playerId, label }: { playerId: string; label: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function open() {
    start(async () => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("start_or_get_dm", {
        p_target_player: playerId,
      });
      if (error || !data) {
        toast.error(messageErrorText(error?.message));
        return;
      }
      router.push(`/messages/${data as string}`);
    });
  }

  return (
    <button type="button" onClick={open} disabled={pending} className={ctaClass("outline")}>
      {pending ? "…" : `MESSAGE ${label.toUpperCase()}`}
    </button>
  );
}
