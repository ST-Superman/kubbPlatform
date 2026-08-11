"use client";

import { useActionState } from "react";

import { updateProfile, type ProfileState } from "@/app/profile/actions";
import { type Profile } from "@/lib/supabase/profiles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InfoDot } from "@/components/info-dot";

export function ProfileForm({ profile }: { profile: Profile }) {
  const [state, formAction, pending] = useActionState<ProfileState, FormData>(
    updateProfile,
    undefined,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-1.5">
          <Label htmlFor="handle">Handle</Label>
          <InfoDot term="handle" />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">@</span>
          <Input
            id="handle"
            name="handle"
            defaultValue={profile.handle}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="your_handle"
            required
          />
        </div>
        <p className="text-xs text-muted-foreground">
          3–30 characters: lowercase letters, numbers, underscores.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-1.5">
          <Label htmlFor="display_name">Display name</Label>
          <InfoDot term="display-name" />
        </div>
        <Input
          id="display_name"
          name="display_name"
          defaultValue={profile.display_name}
          placeholder="How your name shows on match cards"
          required
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="avatar_url">Avatar URL</Label>
        <Input
          id="avatar_url"
          name="avatar_url"
          type="url"
          defaultValue={profile.avatar_url ?? ""}
          placeholder="https://…"
        />
        <p className="text-xs text-muted-foreground">
          Paste an image link for now — uploads come later.
        </p>
      </div>

      {state?.error ? (
        <p className="text-sm text-destructive" role="alert">
          {state.error}
        </p>
      ) : null}
      {state?.message ? (
        <p className="text-sm text-[var(--dark-forest)]" role="status">
          {state.message}
        </p>
      ) : null}

      <Button type="submit" disabled={pending} className="mt-1 w-full sm:w-fit">
        {pending ? "Saving…" : "Save changes"}
      </Button>
    </form>
  );
}
