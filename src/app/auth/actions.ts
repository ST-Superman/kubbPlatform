"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export type AuthState = { error?: string; message?: string } | undefined;

function safeRedirect(target: FormDataEntryValue | null): string {
  const value = typeof target === "string" ? target : "";
  // Only allow same-site relative paths to avoid open-redirects.
  return value.startsWith("/") && !value.startsWith("//") ? value : "/dashboard";
}

export async function login(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const redirectTo = safeRedirect(formData.get("redirectTo"));

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  redirect(redirectTo);
}

const HANDLE_RE = /^[a-z0-9_]{3,30}$/;

export async function signup(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const displayName = String(formData.get("display_name") ?? "").trim();
  const handle = String(formData.get("handle") ?? "").trim().toLowerCase();
  const redirectTo = safeRedirect(formData.get("redirectTo"));

  if (displayName.length === 0) return { error: "Enter a display name." };
  if (!HANDLE_RE.test(handle)) {
    return {
      error:
        "Handle must be 3–30 characters, lowercase letters, numbers, or underscores.",
    };
  }

  const origin = (await headers()).get("origin") ?? "";
  const supabase = await createClient();

  // Pre-check handle availability so the signup trigger doesn't fail on a
  // unique-violation (which would surface as an opaque error).
  const { data: available } = await supabase.rpc("handle_available", {
    p_handle: handle,
  });
  if (available === false) return { error: "That handle is already taken." };

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { handle, display_name: displayName },
      emailRedirectTo: `${origin}/auth/confirm?next=${encodeURIComponent(redirectTo)}`,
    },
  });
  if (error) return { error: error.message };

  // With email confirmation disabled (spike setting), signUp returns a live
  // session — send the user straight on so flows like the claim link (which pass
  // ?redirectTo=/claim/<token>) survive signup. Otherwise fall back to the
  // confirm-email message.
  if (data.session) {
    revalidatePath("/", "layout");
    redirect(redirectTo);
  }

  return {
    message:
      "Check your email for a confirmation link to finish creating your account.",
  };
}

export async function signout(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/");
}
