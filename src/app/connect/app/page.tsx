"use client";

import { useEffect, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { LogoMark } from "@/components/brand";

/**
 * App connect hand-off.
 *
 * The Kubb Coach iOS app opens this page inside an ASWebAuthenticationSession
 * (callback scheme `kubbcoach`). This route is gated by the proxy, so an
 * unauthenticated visitor is bounced through /login (email or OAuth, carrying
 * redirectTo=/connect/app) and lands back here with a session. We then read that
 * session in the browser and redirect to the app's callback scheme, handing the
 * access + refresh tokens back over the URL *fragment* (never sent to a server;
 * delivered only to the initiating app by ASWebAuthenticationSession).
 *
 * The app persists the session in its Keychain and auto-refreshes it — the user
 * stays connected until they sign out. We hand over tokens, never a password.
 *
 * Opened in a normal browser this page is a dead-end (the kubbcoach:// link does
 * nothing), so it shows a short explanation instead.
 */
const APP_SCHEME = "kubbcoach://auth-callback";

export default function ConnectAppPage() {
  const [status, setStatus] = useState<"working" | "ready" | "nosession">("working");
  const [handoffUrl, setHandoffUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (cancelled) return;

      if (!session) {
        // Belt-and-suspenders — the proxy normally gates this route to signed-in
        // users, so we rarely get here.
        setStatus("nosession");
        window.location.replace("/login?redirectTo=/connect/app");
        return;
      }

      const fragment = new URLSearchParams({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      }).toString();
      const url = `${APP_SCHEME}#${fragment}`;
      setHandoffUrl(url);
      setStatus("ready");
      window.location.href = url;
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center px-6 text-center">
      <LogoMark size={56} />
      <h1 className="display mt-4 text-2xl font-medium">Connecting Kubb Coach…</h1>

      {status === "ready" ? (
        <>
          <p className="mt-2 text-sm text-muted-foreground">
            Returning you to the app. If nothing happens, tap the button below.
          </p>
          {handoffUrl ? (
            <a
              href={handoffUrl}
              className="mt-5 inline-flex h-12 items-center justify-center rounded-[14px] bg-primary px-6 font-mono text-[12px] font-bold uppercase tracking-[1.4px] text-primary-foreground"
            >
              Open Kubb Coach
            </a>
          ) : null}
          <p className="mt-6 text-[12px] text-muted-foreground">
            You can close this window once the app reopens.
          </p>
        </>
      ) : status === "nosession" ? (
        <p className="mt-2 text-sm text-muted-foreground">Taking you to sign in…</p>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">One moment…</p>
      )}
    </div>
  );
}
