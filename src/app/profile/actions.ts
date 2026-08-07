"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

export type ProfileState = { error?: string; message?: string } | undefined;

const HANDLE_RE = /^[a-z0-9_]{3,30}$/;

export async function updateProfile(
  _prev: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const handle = String(formData.get("handle") ?? "")
    .trim()
    .toLowerCase();
  const displayName = String(formData.get("display_name") ?? "").trim();
  const avatarRaw = String(formData.get("avatar_url") ?? "").trim();

  if (!HANDLE_RE.test(handle)) {
    return {
      error:
        "Handle must be 3–30 characters, lowercase letters, numbers, or underscores.",
    };
  }
  if (displayName.length === 0) {
    return { error: "Display name can't be empty." };
  }
  if (avatarRaw && !/^https?:\/\//i.test(avatarRaw)) {
    return { error: "Avatar URL must start with http:// or https://" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const { error } = await supabase
    .from("profiles")
    .update({
      handle,
      display_name: displayName,
      avatar_url: avatarRaw || null,
    })
    .eq("id", user.id);

  if (error) {
    // 23505 = unique_violation → the handle is taken (citext unique index).
    if (error.code === "23505") {
      return { error: "That handle is already taken." };
    }
    return { error: error.message };
  }

  revalidatePath("/profile");
  revalidatePath("/dashboard");
  return { message: "Saved." };
}
