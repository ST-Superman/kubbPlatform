"use client";

import { cn } from "@/lib/utils";

/**
 * Message text, linkified at render time.
 *
 * Bodies are stored and rendered as plain text — we never persist or inject
 * HTML. This only wraps URL matches on the way out, so there is no
 * dangerouslySetInnerHTML anywhere in the path.
 */
const LINK_RE = /\b(https?:\/\/[^\s<]+|kubbportal\.com\/[^\s<]+)/gi;

export function MessageBody({ body, mine }: { body: string; mine: boolean }) {
  // split() with a capturing group interleaves text and matches.
  const parts = body.split(LINK_RE);

  return (
    <span className="whitespace-pre-wrap break-words">
      {parts.map((p, i) => {
        if (!p) return null;
        const isLink = /^(https?:\/\/|kubbportal\.com\/)/i.test(p);
        if (!isLink) return <span key={i}>{p}</span>;
        return (
          <a
            key={i}
            href={p.startsWith("http") ? p : `https://${p}`}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className={cn(
              "underline underline-offset-2",
              mine ? "text-primary-foreground" : "text-primary",
            )}
          >
            {p}
          </a>
        );
      })}
    </span>
  );
}

/**
 * First in-app URL in a message gets a preview card under the bubble:
 *   /matches/<id> → match card (score, date, "View match")
 *   /u/<handle>   → player card
 *
 * Resolve these SERVER-SIDE in the thread page and pass them down with the
 * messages. Two reasons: the client has no cheap way to batch the lookups, and
 * visibility must be enforced — if the viewer can't see that match, render no
 * card. Never leak a private result through a link preview.
 */
export function firstInAppTarget(body: string): { kind: "match" | "player"; id: string } | null {
  const m = body.match(/kubbportal\.com\/(matches|u)\/([\w-]+)/i);
  if (!m) return null;
  return { kind: m[1].toLowerCase() === "matches" ? "match" : "player", id: m[2] };
}
