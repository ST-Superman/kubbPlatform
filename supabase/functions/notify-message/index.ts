// notify-message — Supabase Edge Function
//
// DIGEST sender, fired (fire-and-forget) by pg_cron via pg_net:
//   • { cadence: 'daily' | 'weekly' } → one recap email to each user on that cadence
//     who has unread messages (message_digest_payload).
//
// Recipients + emails are resolved server-side (auth.users email is service_role only).
//
// Deploy:   supabase functions deploy notify-message --no-verify-jwt
// Secrets:  RESEND_API_KEY, NOTIFY_SECRET, MAIL_FROM, SITE_URL
//           (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const LOGO_URL = "https://kubbportal.com/logo-transparent.png";

type Recipient = { to_email: string; to_name: string | null; unsub_token: string };
type DigestConversation = { label: string; unread: number; last_body: string | null; last_at: string };
type DigestUser = Recipient & { total_unread: number; conversations: DigestConversation[] };
type DigestPayload = { kind: "digest"; cadence: "daily" | "weekly"; users: DigestUser[] };

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}
function clip(s: string, n: number): string {
  const t = s.trim();
  return t.length <= n ? t : t.slice(0, n - 1) + "…";
}
function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const expected = Deno.env.get("NOTIFY_SECRET") ?? "";
  const auth = req.headers.get("Authorization") ?? "";
  if (!expected || auth !== `Bearer ${expected}`) return json(401, { error: "unauthorized" });

  let body: { cadence?: string };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "bad_json" });
  }

  const resendKey = Deno.env.get("RESEND_API_KEY");
  const mailFrom = Deno.env.get("MAIL_FROM") ?? "Kubb Portal <support@kubbportal.com>";
  const siteUrl = (Deno.env.get("SITE_URL") ?? "https://kubbportal.com").replace(/\/+$/, "");
  if (!resendKey) return json(500, { error: "resend_not_configured" });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  async function send(to: string, subject: string, html: string, text: string, unsubToken: string) {
    const unsubUrl = `${siteUrl}/api/unsubscribe?token=${encodeURIComponent(unsubToken)}&kind=messages`;
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: mailFrom,
        to: [to],
        subject,
        html,
        text,
        headers: {
          "List-Unsubscribe": `<${unsubUrl}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      }),
    });
    return res.ok;
  }

  // ---- DIGEST ----
  if (body.cadence === "daily" || body.cadence === "weekly") {
    const { data, error } = await admin.rpc("message_digest_payload", { p_cadence: body.cadence });
    if (error) return json(500, { error: "payload_failed", detail: error.message });
    const p = data as DigestPayload | null;
    if (!p || p.users.length === 0) return json(200, { skipped: "no_unread", cadence: body.cadence });

    const window = body.cadence === "daily" ? "today" : "this week";
    let sent = 0;
    for (const u of p.users) {
      const subject = `You have ${u.total_unread} unread message${u.total_unread === 1 ? "" : "s"} on Kubb Portal`;
      const cta = `${siteUrl}/messages`;
      const html = renderDigest({ name: u.to_name, window, total: u.total_unread, conversations: u.conversations, cta, manage: `${siteUrl}/settings/notifications`, unsub: unsubUrlOf(siteUrl, u.unsub_token) });
      const text = digestText(u, window, cta, siteUrl);
      if (await send(u.to_email, subject, html, text, u.unsub_token)) sent++;
    }
    return json(200, { mode: "digest", cadence: body.cadence, sent, of: p.users.length });
  }

  return json(400, { error: "missing_or_invalid_cadence" });
});

function unsubUrlOf(site: string, token: string): string {
  return `${site}/api/unsubscribe?token=${encodeURIComponent(token)}&kind=messages`;
}

// ---------------------------------------------------------------------------
// Templates — table-based, inline styles, gold accent, dark-mode aware.
// ---------------------------------------------------------------------------
function shell(inner: string, footer: string): string {
  const sans = `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`;
  return `<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<style>@media (prefers-color-scheme: dark){.bg{background:#0c0e12!important}.card{background:#1c2028!important;border-color:rgba(255,255,255,.12)!important}.ink{color:#f5f5f7!important}.muted{color:rgba(245,245,247,.62)!important}.panel{background:#111418!important;border-color:rgba(255,255,255,.12)!important}}a{text-decoration:none}</style>
</head><body class="bg" style="margin:0;padding:0;background:#e8eaef;font-family:${sans};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="bg" style="background:#e8eaef;"><tr><td align="center" style="padding:28px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" class="card" style="width:600px;max-width:600px;background:#fff;border:1px solid rgba(60,60,67,.16);border-radius:20px;overflow:hidden;">
<tr><td style="height:4px;background:#fecc02;line-height:4px;font-size:4px;">&nbsp;</td></tr>
<tr><td style="padding:18px 28px;border-bottom:1px solid rgba(60,60,67,.16);">
  <table role="presentation" width="100%"><tr>
    <td width="24" style="padding-right:9px;"><img src="${LOGO_URL}" width="20" height="20" alt="Kubb Portal" style="display:block;border:0;"></td>
    <td class="ink" style="font-family:ui-monospace,Menlo,monospace;font-size:11.5px;font-weight:700;letter-spacing:1.6px;color:#13254a;">KUBB&nbsp;PORTAL</td>
  </tr></table>
</td></tr>
<tr><td style="padding:26px 28px;">${inner}</td></tr>
<tr><td style="padding:0 28px 26px;"><p class="muted" style="margin:0;font-size:12px;line-height:1.6;color:#5c5c66;">${footer}</p></td></tr>
</table></td></tr></table></body></html>`;
}

function footerLinks(manage: string, unsub: string): string {
  return `You're getting this because of your Kubb Portal message settings.<br>
    <a href="${manage}" style="color:#006aa7;">Manage email preferences</a> &nbsp;·&nbsp;
    <a href="${unsub}" style="color:#006aa7;">Turn message emails off</a>`;
}

function renderDigest(o: { name: string | null; window: string; total: number; conversations: DigestConversation[]; cta: string; manage: string; unsub: string }): string {
  const first = (o.name ?? "there").trim().split(/\s+/)[0];
  const rows = o.conversations
    .map(
      (c) => `<tr><td style="padding:10px 0;border-top:1px solid rgba(60,60,67,.12);">
        <table role="presentation" width="100%"><tr>
          <td class="ink" style="font-size:14px;font-weight:600;color:#13182b;">${esc(c.label)}</td>
          <td align="right"><span style="display:inline-block;min-width:20px;padding:1px 7px;background:#006aa7;border-radius:10px;font-size:11px;font-weight:700;color:#fff;">${c.unread}</span></td>
        </tr></table>
        ${c.last_body ? `<div class="muted" style="margin-top:2px;font-size:13px;color:#5c5c66;">${esc(clip(c.last_body, 90))}</div>` : ""}
      </td></tr>`,
    )
    .join("");
  const inner = `
    <div style="font-family:ui-monospace,Menlo,monospace;font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#8a6700;">${o.window === "today" ? "DAILY" : "WEEKLY"} RECAP</div>
    <h1 class="ink" style="margin:10px 0 4px;font-size:22px;font-weight:600;color:#13182b;">Hi ${esc(first)} — ${o.total} unread</h1>
    <p class="muted" style="margin:0 0 8px;font-size:14px;color:#5c5c66;">Messages waiting for you from ${o.window}.</p>
    <table role="presentation" width="100%">${rows}</table>
    <table role="presentation" style="margin:20px 0 4px;"><tr><td align="center" bgcolor="#006aa7" style="border-radius:12px;">
      <a href="${o.cta}" style="display:block;padding:14px 22px;font-family:ui-monospace,Menlo,monospace;font-size:12px;font-weight:700;letter-spacing:1.3px;text-transform:uppercase;color:#fff;border-radius:12px;">Read your messages</a>
    </td></tr></table>`;
  return shell(inner, footerLinks(o.manage, o.unsub));
}

function digestText(u: DigestUser, window: string, cta: string, site: string): string {
  const lines = u.conversations.map((c) => `- ${c.label} (${c.unread})${c.last_body ? `: ${clip(c.last_body, 90)}` : ""}`);
  return [
    `You have ${u.total_unread} unread message${u.total_unread === 1 ? "" : "s"} from ${window}.`,
    ``,
    ...lines,
    ``,
    `Read them: ${cta}`,
    `Manage emails: ${site}/settings/notifications`,
  ].join("\n");
}
