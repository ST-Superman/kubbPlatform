// notify-push — Supabase Edge Function (APNs sender for new messages)
//
// Fired (fire-and-forget) by the messages AFTER INSERT trigger via pg_net:
//   { message_id } → message_push_payload → APNs (api.push.apple.com) per device token.
//
// Token-based APNs auth: an ES256 provider JWT signed with the .p8 auth key, reused
// for ~50 min (APNs caps provider tokens at 1h). Recipients + tokens are resolved
// service_role inside message_push_payload (it reads OTHER users' device tokens).
//
// Deploy:   supabase functions deploy notify-push --no-verify-jwt
// Secrets:  NOTIFY_SECRET, APNS_KEY (full .p8 PEM), APNS_KEY_ID, APNS_TEAM_ID,
//           APNS_BUNDLE_ID, optional APNS_HOST (force sandbox while testing).
//           (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are injected.)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";

type Recipient = { token: string; environment: "production" | "sandbox" };
type Payload = {
  conversation_id: string;
  title: string;
  body: string;
  recipients: Recipient[];
};

const PROD_HOST = "api.push.apple.com";
const SANDBOX_HOST = "api.sandbox.push.apple.com";

function b64urlFromString(s: string): string {
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlFromBytes(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ---- APNs provider JWT (ES256), cached ----
let cachedToken: { jwt: string; issuedAt: number } | null = null;

async function importSigningKey(pem: string): Promise<CryptoKey> {
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey(
    "pkcs8",
    der.buffer,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
}

async function providerToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && now - cachedToken.issuedAt < 2700) return cachedToken.jwt; // <45 min

  const keyId = Deno.env.get("APNS_KEY_ID")!;
  const teamId = Deno.env.get("APNS_TEAM_ID")!;
  const pem = Deno.env.get("APNS_KEY")!;
  const key = await importSigningKey(pem);

  const header = b64urlFromString(JSON.stringify({ alg: "ES256", kid: keyId }));
  const claims = b64urlFromString(JSON.stringify({ iss: teamId, iat: now }));
  const signingInput = `${header}.${claims}`;
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(signingInput),
  );
  const jwt = `${signingInput}.${b64urlFromBytes(sig)}`;
  cachedToken = { jwt, issuedAt: now };
  return jwt;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const expected = Deno.env.get("NOTIFY_SECRET") ?? "";
  const auth = req.headers.get("Authorization") ?? "";
  if (!expected || auth !== `Bearer ${expected}`) return json(401, { error: "unauthorized" });

  let body: { message_id?: string };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "bad_json" });
  }
  if (!body.message_id) return json(400, { error: "missing_message_id" });

  const bundleId = Deno.env.get("APNS_BUNDLE_ID");
  if (!Deno.env.get("APNS_KEY") || !bundleId) return json(500, { error: "apns_not_configured" });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { data, error } = await admin.rpc("message_push_payload", { p_message_id: body.message_id });
  if (error) return json(500, { error: "payload_failed", detail: error.message });
  const p = data as Payload | null;
  if (!p || p.recipients.length === 0) return json(200, { skipped: "no_recipients" });

  const jwt = await providerToken();
  const hostOverride = Deno.env.get("APNS_HOST"); // optional force
  const apnsBody = JSON.stringify({
    aps: { alert: { title: p.title, body: p.body }, sound: "default", "thread-id": p.conversation_id },
    conversation_id: p.conversation_id,
  });

  let sent = 0;
  let failed = 0;
  for (const r of p.recipients) {
    const host = hostOverride ?? (r.environment === "sandbox" ? SANDBOX_HOST : PROD_HOST);
    try {
      const res = await fetch(`https://${host}/3/device/${r.token}`, {
        method: "POST",
        headers: {
          authorization: `bearer ${jwt}`,
          "apns-topic": bundleId,
          "apns-push-type": "alert",
          "apns-priority": "10",
        },
        body: apnsBody,
      });
      if (res.ok) {
        sent++;
      } else {
        failed++;
        // 410 Unregistered / 400 BadDeviceToken → prune the dead token.
        if (res.status === 410 || res.status === 400) {
          await admin.from("device_tokens").delete().eq("token", r.token);
        }
      }
    } catch {
      failed++;
    }
  }

  return json(200, { sent, failed, of: p.recipients.length });
});
