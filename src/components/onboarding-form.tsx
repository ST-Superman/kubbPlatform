"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { InfoDot } from "@/components/info-dot";
import { ctaClass } from "@/components/brand";

const ERR: Record<string, string> = {
  handle_invalid: "Handle must be 3–30 characters: lowercase letters, numbers, underscores.",
  handle_taken: "That handle is already taken.",
  display_required: "Enter a display name.",
  auth_required: "Please sign in again.",
};
function friendly(msg: string | undefined): string {
  const code = msg?.match(/[a-z_]+/)?.[0];
  return (code && ERR[code]) || msg || "Something went wrong.";
}

const FIELD = "h-12 rounded-[12px] border-input bg-card px-[14px] text-base md:text-base";
const LABEL = "eyebrow text-[9.5px] text-muted-foreground";

export function OnboardingForm({
  initialHandle,
  initialName,
  next,
}: {
  initialHandle: string;
  initialName: string;
  next: string;
}) {
  const router = useRouter();
  const [handle, setHandle] = useState(initialHandle);
  const [name, setName] = useState(initialName);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    start(async () => {
      const supabase = createClient();
      const { error } = await supabase.rpc("complete_onboarding", {
        p_handle: handle.toLowerCase(),
        p_display_name: name,
      });
      if (error) {
        setError(friendly(error.message));
        return;
      }
      router.push(next);
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3.5">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="display_name" className="flex items-center gap-1.5">
          <span className={LABEL}>DISPLAY NAME</span>
          <InfoDot term="display-name" />
        </label>
        <Input
          id="display_name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="How your name shows on match cards"
          className={FIELD}
          required
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="handle" className="flex items-center gap-1.5">
          <span className={LABEL}>HANDLE</span>
          <InfoDot term="handle" />
        </label>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">@</span>
          <Input
            id="handle"
            value={handle}
            onChange={(e) => setHandle(e.target.value.toLowerCase())}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="your_handle"
            className={FIELD}
            required
          />
        </div>
        <p className="text-[11px] text-muted-foreground">
          3–30 characters: lowercase letters, numbers, underscores.
        </p>
      </div>

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <button type="submit" disabled={pending} className={`${ctaClass("primary")} mt-1`}>
        {pending ? "SAVING…" : "CONTINUE"}
      </button>
    </form>
  );
}
