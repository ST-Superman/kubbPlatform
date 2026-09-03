import { createClient } from "@/lib/supabase/server";
import { MembershipCta } from "@/components/membership-cta";
import { Card, CardContent } from "@/components/ui/card";

type MyMembership = {
  expires_at: string | null;
  entitled: boolean;
  trial_redeemed: boolean;
  beta_free_until: string | null;
};

function fmt(d: string | null): string | null {
  return d
    ? new Date(d).toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;
}

export default async function MembershipPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_membership");
  const m = (Array.isArray(data) ? data[0] : data) as MyMembership | undefined;

  const activeUntil = fmt(m?.expires_at ?? null);
  const betaUntil = fmt(m?.beta_free_until ?? null);
  const betaOpen = !!(m?.beta_free_until && new Date(m.beta_free_until) > new Date());

  return (
    <div className="mx-auto flex max-w-md flex-col px-6 py-12 sm:py-16">
      <div className="flex flex-col gap-1.5">
        <span className="eyebrow text-muted-foreground">KUBB PORTAL MEMBERSHIP</span>
        <h1 className="display text-[27px] italic tracking-[-0.8px]">
          Virtual matches &amp; leagues
        </h1>
        <p className="text-[13.5px] text-muted-foreground">
          A 12-month membership unlocks virtual matches. One-time payment — no
          auto-renewal.
        </p>
      </div>

      {status === "success" ? (
        <p
          className="mt-5 rounded-xl border border-[var(--dark-forest)]/40 bg-[var(--dark-forest)]/10 px-4 py-3 text-sm text-[var(--dark-forest)]"
          role="status"
        >
          Payment received — your membership is active. (If it doesn&rsquo;t show
          below yet, give it a few seconds and refresh.)
        </p>
      ) : null}
      {status === "cancelled" ? (
        <p
          className="mt-5 rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground"
          role="status"
        >
          Checkout cancelled — no charge was made.
        </p>
      ) : null}

      <Card className="mt-6">
        <CardContent className="flex flex-col gap-4 py-5">
          <div className="flex flex-col gap-1">
            <span className="eyebrow text-[9.5px] text-muted-foreground">STATUS</span>
            {activeUntil ? (
              <p className="text-sm font-semibold">
                Membership active until {activeUntil}
              </p>
            ) : betaOpen ? (
              <p className="text-sm font-semibold">
                Free during Beta{betaUntil ? ` · through ${betaUntil}` : ""}
              </p>
            ) : (
              <p className="text-sm font-semibold text-muted-foreground">
                No active membership
              </p>
            )}
            {activeUntil && betaOpen ? (
              <p className="text-xs text-muted-foreground">
                Beta is free for everyone right now; your paid window is banked for
                when it ends.
              </p>
            ) : null}
          </div>

          <MembershipCta
            label={activeUntil ? "Extend 12 months — $5.99" : "Get 12 months — $5.99"}
          />
          <p className="text-[11px] text-muted-foreground">
            Secure checkout via Stripe. Extending stacks onto any time you already
            have.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
