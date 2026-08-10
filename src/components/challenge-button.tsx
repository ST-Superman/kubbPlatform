"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import { ctaClass } from "@/components/brand";

const CREATE_ERRORS: Record<string, string> = {
  auth_required: "You must be signed in.",
  cannot_play_self: "You can't challenge yourself.",
  opponent_not_found: "That player no longer exists.",
  no_player_for_account: "Your account has no player row yet.",
};

function friendly(message: string | undefined): string {
  const code = message?.match(/[a-z_]+/)?.[0];
  return (code && CREATE_ERRORS[code]) || message || "Something went wrong.";
}

export function ChallengeButton({
  playerId,
  label,
}: {
  playerId: string;
  label: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function challenge() {
    start(async () => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("create_match", {
        p_race_to: 2,
        p_opponent_player_id: playerId,
      });
      if (error) {
        toast.error(friendly(error.message));
        return;
      }
      const id = (data as { match_id?: string } | null)?.match_id;
      if (id) router.push(`/matches/${id}`);
    });
  }

  return (
    <button
      type="button"
      onClick={challenge}
      disabled={pending}
      className={ctaClass("primary")}
    >
      {pending ? "STARTING…" : `CHALLENGE ${label.toUpperCase()}`}
    </button>
  );
}
