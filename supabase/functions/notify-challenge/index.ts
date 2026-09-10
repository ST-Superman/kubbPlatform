// notify-challenge — Supabase Edge Function
//
// Called (fire-and-forget) by the challenge triggers via pg_net:
//   • on_challenge_created   → event 'challenge_created'   (notify the challenged)
//   • on_challenge_responded → 'challenge_accepted' | 'challenge_declined'
//                              (notify the challenger)
// Resolves the recipient + other party server-side, honors the recipient's
// opt-out, renders the on-brand email for the event, and sends it via Resend.
//
// Deploy:   supabase functions deploy notify-challenge --no-verify-jwt
// Secrets:  RESEND_API_KEY, NOTIFY_SECRET, MAIL_FROM, SITE_URL
//           (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const LOGO_URL = "https://kubbportal.com/logo-transparent.png";

type Ev = "challenge_created" | "challenge_accepted" | "challenge_declined";

type Payload = {
  event: Ev;
  challenge_id: string;
  match_id: string | null;
  status: string;
  send: boolean;
  to_email: string;
  to_name: string | null;
  other_name: string | null;
  other_handle: string | null;
  race_to: number;
  unsub_token: string;
};

type Content = {
  subject: string;
  preheader: string;
  eyebrow: string;
  headline: string;
  introHtml: string;
  introText: string;
  otherFull: string;
  handleLineHtml: string;
  otherInitials: string;
  raceTo: number;
  games: string;
  ctaLabel: string;
  ctaUrl: string;
  reassureHtml: string | null;
  reassureText: string | null;
  footerReasonHtml: string;
  footerReasonText: string;
  reviewUrl: string;
  manageUrl: string;
  unsubUrl: string;
};

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}
function firstName(name: string | null): string {
  return (name ?? "a player").trim().split(/\s+/)[0] || "a player";
}
function initials(name: string | null): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "KP";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}
function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const expected = Deno.env.get("NOTIFY_SECRET") ?? "";
  const auth = req.headers.get("Authorization") ?? "";
  if (!expected || auth !== `Bearer ${expected}`) return json(401, { error: "unauthorized" });

  let body: { challenge_id?: string; event?: Ev };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "bad_json" });
  }
  const challengeId = body.challenge_id;
  const event: Ev = body.event ?? "challenge_created";
  if (!challengeId) return json(400, { error: "missing_challenge_id" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const resendKey = Deno.env.get("RESEND_API_KEY");
  const mailFrom = Deno.env.get("MAIL_FROM") ?? "Kubb Portal <support@kubbportal.com>";
  const siteUrl = (Deno.env.get("SITE_URL") ?? "https://kubbportal.com").replace(/\/+$/, "");
  if (!resendKey) return json(500, { error: "resend_not_configured" });

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await admin.rpc("challenge_email_payload", {
    p_challenge_id: challengeId,
    p_event: event,
  });
  if (error) return json(500, { error: "payload_failed", detail: error.message });

  const p = data as Payload | null;
  if (!p) return json(200, { skipped: "no_payload" });
  if (!p.send) return json(200, { skipped: "opted_out" });

  const other = firstName(p.other_name);
  const otherFull = (p.other_name ?? "A Kubb Portal player").trim();
  const ofEsc = esc(otherFull);
  const raceTo = p.race_to;
  const games = raceTo === 1 ? "game" : "games";

  const reviewUrl = `${siteUrl}/challenges`;
  const playersUrl = `${siteUrl}/players`;
  const matchUrl = p.match_id ? `${siteUrl}/matches/${p.match_id}` : `${siteUrl}/matches`;
  const profileUrl = p.other_handle
    ? `${siteUrl}/u/${encodeURIComponent(p.other_handle)}`
    : reviewUrl;
  const manageUrl = `${siteUrl}/settings/notifications`;
  const unsubUrl = `${siteUrl}/api/unsubscribe?token=${encodeURIComponent(p.unsub_token)}`;

  const handleLineHtml = p.other_handle
    ? `<a href="${profileUrl}" style="color:#006aa7;text-decoration:none;font-weight:600">@${esc(
        p.other_handle,
      )}</a>`
    : `on Kubb Portal`;

  const base = {
    otherFull,
    handleLineHtml,
    otherInitials: initials(p.other_name),
    raceTo,
    games,
    reviewUrl,
    manageUrl,
    unsubUrl,
  };

  let c: Content;
  if (event === "challenge_accepted") {
    c = {
      ...base,
      subject: `✅ ${other} accepted your challenge — race to ${raceTo}`,
      preheader: `Your match is ready — first to ${raceTo}.`,
      eyebrow: `✅  Challenge accepted`,
      headline: `${other} accepted. Game on.`,
      introHtml: `<b style="color:#13182b;font-weight:600;">${ofEsc}</b> accepted your race to ${raceTo}. Your match is ready — jump in whenever you both are.`,
      introText: `${otherFull} accepted your race to ${raceTo}. Your match is ready — jump in whenever you both are.`,
      ctaLabel: `Go to the match`,
      ctaUrl: matchUrl,
      reassureHtml: `First to ${raceTo} ${games} wins. Good luck out there.`,
      reassureText: `First to ${raceTo} ${games} wins. Good luck out there.`,
      footerReasonHtml: `You're getting this because you challenged ${ofEsc} on Kubb Portal.`,
      footerReasonText: `You're getting this because you challenged ${otherFull} on Kubb Portal.`,
    };
  } else if (event === "challenge_declined") {
    c = {
      ...base,
      subject: `${other} declined your challenge`,
      preheader: `No worries — line up your next match.`,
      eyebrow: `Challenge declined`,
      headline: `${other} passed on this one.`,
      introHtml: `<b style="color:#13182b;font-weight:600;">${ofEsc}</b> declined your race to ${raceTo}. No worries — plenty of players are up for a game.`,
      introText: `${otherFull} declined your race to ${raceTo}. No worries — plenty of players are up for a game.`,
      ctaLabel: `Find your next match`,
      ctaUrl: playersUrl,
      reassureHtml: `You can send a new challenge any time.`,
      reassureText: `You can send a new challenge any time.`,
      footerReasonHtml: `You're getting this because you challenged ${ofEsc} on Kubb Portal.`,
      footerReasonText: `You're getting this because you challenged ${otherFull} on Kubb Portal.`,
    };
  } else {
    c = {
      ...base,
      subject: `⚔️ ${other} challenged you — race to ${raceTo}`,
      preheader: `Accept when you’re ready — the match starts the moment you do.`,
      eyebrow: `⚔️  You've been challenged`,
      headline: `${other} wants to play.`,
      introHtml: `<b style="color:#13182b;font-weight:600;">${ofEsc}</b> just challenged you to a match on Kubb Portal. Here's the matchup — accept whenever you're ready.`,
      introText: `${otherFull} just challenged you to a match on Kubb Portal. Here's the matchup — accept whenever you're ready.`,
      ctaLabel: `Review the challenge`,
      ctaUrl: reviewUrl,
      reassureHtml: `<span style="color:#1f6646;font-weight:600;">Nothing happens until you say go.</span> The match starts the instant you accept — decline or ignore and it just waits in your challenges.`,
      reassureText: `Nothing happens until you say go — the match starts the instant you accept. Decline or ignore and it just waits in your challenges.`,
      footerReasonHtml: `You're getting this because ${ofEsc} challenged you on Kubb Portal.`,
      footerReasonText: `You're getting this because ${otherFull} challenged you on Kubb Portal.`,
    };
  }

  const res = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: mailFrom,
      to: [p.to_email],
      subject: c.subject,
      html: renderHtml(c),
      text: renderText(c),
      headers: {
        "List-Unsubscribe": `<${unsubUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    return json(502, { error: "resend_failed", status: res.status, detail });
  }
  const sent = await res.json();
  return json(200, { sent: true, event, id: sent?.id ?? null });
});

// ---------------------------------------------------------------------------
// Templates — table-based, inline styles, literal hex. One skeleton for every
// event; the eyebrow uses a class so it lifts to gold in dark mode.
// ---------------------------------------------------------------------------
function renderHtml(c: Content): string {
  const serif = `'Fraunces', Georgia, 'Times New Roman', serif`;
  const sans = `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`;
  const mono = `'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace`;
  const reassure = c.reassureHtml
    ? `<p class="muted" style="margin:0;text-align:center;font-size:12.5px;line-height:1.55;color:#5c5c66;">${c.reassureHtml}</p>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${esc(c.headline)}</title>
<style>
  @media (prefers-color-scheme: dark) {
    .bg     { background:#0c0e12 !important; }
    .card   { background:#1c2028 !important; border-color:rgba(255,255,255,.12) !important; }
    .panel  { background:#111418 !important; border-color:rgba(255,255,255,.12) !important; }
    .ink    { color:#f5f5f7 !important; }
    .muted  { color:rgba(245,245,247,.62) !important; }
    .rule   { border-color:rgba(255,255,255,.12) !important; background:rgba(255,255,255,.12) !important; }
    .hbrand { color:#e7ecf5 !important; }
    .ey     { color:#fecc02 !important; }
  }
  a { text-decoration:none; }
</style>
</head>
<body class="bg" style="margin:0;padding:0;background:#e8eaef;font-family:${sans};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;font-size:1px;line-height:1px;color:#e8eaef;">${esc(
    c.preheader,
  )}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="bg" style="background:#e8eaef;">
    <tr><td align="center" style="padding:28px 12px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" class="card" style="width:600px;max-width:600px;background:#ffffff;border:1px solid rgba(60,60,67,.16);border-radius:20px;overflow:hidden;">
        <tr><td style="height:4px;background:#fecc02;line-height:4px;font-size:4px;">&nbsp;</td></tr>
        <tr><td style="padding:20px 32px;border-bottom:1px solid rgba(60,60,67,.16);">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
            <td width="26" style="padding-right:10px;">
              <table role="presentation" cellpadding="0" cellspacing="0"><tr><td width="26" height="26" align="center" valign="middle" style="width:26px;height:26px;background:#fecc02;border-radius:13px;">
                <img src="${LOGO_URL}" width="16" height="16" alt="Kubb Portal" style="display:block;border:0;">
              </td></tr></table>
            </td>
            <td class="hbrand" style="font-family:${mono};font-size:11.5px;font-weight:700;letter-spacing:1.6px;color:#13254a;">KUBB&nbsp;PORTAL</td>
            <td align="right" class="muted" style="font-family:${mono};font-size:10.5px;letter-spacing:.6px;color:#5c5c66;">kubbportal.com</td>
          </tr></table>
        </td></tr>
        <tr><td style="padding:32px;">
          <div class="ey" style="font-family:${mono};font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#8a6700;">${esc(
            c.eyebrow,
          )}</div>
          <h1 class="ink" style="margin:12px 0 10px;font-family:${serif};font-size:30px;font-weight:600;line-height:1.1;letter-spacing:-.015em;color:#13182b;">${esc(
            c.headline,
          )}</h1>
          <p class="muted" style="margin:0 0 22px;font-size:15px;line-height:1.6;color:#5c5c66;">${c.introHtml}</p>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="panel" style="background:#faf8f3;border:1px solid rgba(60,60,67,.16);border-radius:16px;">
            <tr><td style="padding:16px 18px;">
              <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                <td width="46" style="padding-right:14px;">
                  <table role="presentation" cellpadding="0" cellspacing="0"><tr><td width="46" height="46" align="center" valign="middle" style="width:46px;height:46px;background:#e2edf4;border-radius:23px;font-family:${mono};font-size:15px;font-weight:700;color:#006aa7;">${esc(
                    c.otherInitials,
                  )}</td></tr></table>
                </td>
                <td>
                  <div class="ink" style="font-size:16px;font-weight:700;color:#13182b;">${esc(
                    c.otherFull,
                  )}</div>
                  <div class="muted" style="font-size:13px;color:#5c5c66;margin-top:2px;">${c.handleLineHtml}</div>
                </td>
              </tr></table>
            </td></tr>
            <tr><td style="padding:0 18px;"><div class="rule" style="height:1px;background:rgba(60,60,67,.16);line-height:1px;font-size:1px;">&nbsp;</div></td></tr>
            <tr><td style="padding:16px 18px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
                <td valign="middle">
                  <div style="font-family:${mono};font-size:10px;letter-spacing:1.4px;text-transform:uppercase;color:#5c5c66;">The match</div>
                  <div class="muted" style="font-size:13px;color:#5c5c66;margin-top:3px;">First to ${c.raceTo} ${c.games} wins.</div>
                </td>
                <td valign="middle" align="right">
                  <span style="font-family:${mono};font-size:10px;letter-spacing:1.4px;text-transform:uppercase;color:#5c5c66;">Race to&nbsp;</span>
                  <span class="ink" style="font-family:${mono};font-size:30px;font-weight:700;color:#13182b;">${c.raceTo}</span>
                </td>
              </tr></table>
            </td></tr>
          </table>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0 14px;"><tr>
            <td align="center" bgcolor="#006aa7" style="border-radius:14px;">
              <a href="${c.ctaUrl}" style="display:block;padding:16px 20px;font-family:${mono};font-size:12.5px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:#ffffff;border-radius:14px;">${esc(
                c.ctaLabel,
              )}</a>
            </td>
          </tr></table>
          ${reassure}

          <div class="rule" style="height:1px;background:rgba(60,60,67,.16);line-height:1px;font-size:1px;margin:26px 0 16px;">&nbsp;</div>

          <p class="muted" style="margin:0;font-size:12px;line-height:1.6;color:#5c5c66;">
            ${c.footerReasonHtml}<br>
            <a href="${c.reviewUrl}" style="color:#006aa7;">Review all challenges</a> &nbsp;·&nbsp;
            <a href="${c.manageUrl}" style="color:#006aa7;">Manage email preferences</a> &nbsp;·&nbsp;
            <a href="${c.unsubUrl}" style="color:#006aa7;">Unsubscribe</a>
          </p>
          <p class="muted" style="margin:8px 0 0;font-size:11px;color:#8a8a90;">© 2026 Kubb Portal · kubbportal.com</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function renderText(c: Content): string {
  return [
    c.eyebrow,
    ``,
    c.introText,
    `Match: first to ${c.raceTo} ${c.games} wins (race to ${c.raceTo}).`,
    ``,
    `${c.ctaLabel}: ${c.ctaUrl}`,
    ...(c.reassureText ? [``, c.reassureText] : []),
    ``,
    `—`,
    c.footerReasonText,
    `Manage email preferences: ${c.manageUrl}`,
    `Unsubscribe: ${c.unsubUrl}`,
    `© 2026 Kubb Portal · kubbportal.com`,
  ].join("\n");
}
