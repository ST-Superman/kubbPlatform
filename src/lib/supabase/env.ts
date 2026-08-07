/**
 * Reads and normalizes the Supabase connection env vars.
 *
 * People often paste the REST endpoint ("https://<ref>.supabase.co/rest/v1/")
 * or a URL with a trailing slash into NEXT_PUBLIC_SUPABASE_URL. The auth client
 * appends its own paths, so any extra path produces a broken request like
 * ".../rest/v1/auth/v1/signup" → "Invalid path specified in request URL".
 * We reduce whatever is provided to its origin (scheme + host) to prevent that.
 */
export function getSupabaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!raw) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL is not set. Copy .env.example to .env.local and add your Supabase Project URL.",
    );
  }
  try {
    // Keep only scheme + host, e.g. https://<ref>.supabase.co
    return new URL(raw).origin;
  } catch {
    throw new Error(
      `NEXT_PUBLIC_SUPABASE_URL is not a valid URL: "${raw}". Use your base Project URL, e.g. https://your-ref.supabase.co`,
    );
  }
}

export function getSupabaseAnonKey(): string {
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY is not set. Copy .env.example to .env.local and add your anon / publishable key.",
    );
  }
  return key;
}
