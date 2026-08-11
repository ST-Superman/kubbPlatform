import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { ctaClass, LogoImage } from "@/components/brand";

const FEATURES = [
  {
    title: "Live scoring, remote matches (virtual)",
    body: "Each side scores their own turns — the round appears on your opponent's screen the moment it's submitted.",
    tint: "bg-[var(--swedish-blue)]/10 text-[var(--swedish-blue)]",
    icon: (
      <>
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="4" />
        <line x1="12" y1="1.5" x2="12" y2="5" />
        <line x1="12" y1="19" x2="12" y2="22.5" />
      </>
    ),
  },
  {
    title: "Invite with a link",
    body: "New opponent? Type their name, share the link — they claim their profile and score their own turns.",
    tint: "bg-[var(--dark-forest)]/10 text-[var(--dark-forest)] dark:text-[var(--chart-3)]",
    icon: (
      <>
        <path d="M10 13a5 5 0 007.5.5l3-3a5 5 0 00-7-7l-1.7 1.7" />
        <path d="M14 11a5 5 0 00-7.5-.5l-3 3a5 5 0 007 7l1.7-1.7" />
      </>
    ),
  },
  {
    title: "A record that follows you",
    body: "Wins, losses and every turn, saved to your public profile.",
    tint: "bg-[var(--swedish-gold)]/[0.18] text-[var(--gold-ink)]",
    icon: (
      <>
        <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 01-10 0V4z" />
        <path d="M7 6H4a2 2 0 002 4h1M17 6h3a2 2 0 01-2 4h-1" />
      </>
    ),
  },
];

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/dashboard");

  return (
    <div className="mx-auto max-w-md">
      {/* Hero */}
      <div className="flex flex-col items-center px-[22px] pt-8 pb-6 text-center">
        <LogoImage size={64} />
        <div className="eyebrow mt-[18px] text-[10px] tracking-[1.8px] text-primary">
          COMPETITIVE KUBB, ONLINE
        </div>
        <h1 className="display mt-2.5 text-[38px] leading-[1.05] italic tracking-[-1.6px]">
          Where kubb
          <br />
          lives online
        </h1>
        <p className="mt-3.5 max-w-[300px] text-[14.5px] leading-relaxed text-muted-foreground">
          Score matches live from the pitch, invite anyone with a link, and keep a record that
          follows you. Phone-first — no app to install.
        </p>

        <div className="mt-[22px] flex w-full flex-col gap-2.5">
          <Link href="/signup" className={ctaClass("primary")}>
            CREATE AN ACCOUNT
          </Link>
          <Link href="/login" className={ctaClass("outline")}>
            SIGN IN
          </Link>
        </div>
      </div>

      {/* Feature rows */}
      <div className="flex flex-col gap-2.5 px-5 pt-2 pb-6">
        {FEATURES.map((f) => (
          <div
            key={f.title}
            className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3.5"
          >
            <div className={`grid size-9 flex-none place-items-center rounded-full ${f.tint}`}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                {f.icon}
              </svg>
            </div>
            <div className="min-w-0">
              <div className="text-[13.5px] font-semibold">{f.title}</div>
              <div className="mt-0.5 text-[12px] leading-snug text-muted-foreground">{f.body}</div>
            </div>
          </div>
        ))}
        <div className="eyebrow pt-2.5 text-center text-[9px] tracking-[1.4px] text-muted-foreground/60">
          FREE WHILE IN BETA
        </div>
      </div>
    </div>
  );
}
