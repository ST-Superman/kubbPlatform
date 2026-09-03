import Link from "next/link";

export const metadata = { title: "Terms of Service — Kubb Portal" };

export default function TermsPage() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-12 sm:py-16">
      <div>
        <span className="eyebrow text-muted-foreground">LEGAL</span>
        <h1 className="display mt-2 text-3xl font-medium">Terms of Service</h1>
        <p className="mt-1 text-sm text-muted-foreground">Last updated: [DATE]</p>
      </div>

      <div className="rounded-xl border border-[var(--swedish-gold)]/50 bg-[var(--swedish-gold)]/12 px-4 py-3 text-sm text-[var(--gold-ink)]">
        <strong>⚠️ DRAFT — placeholder, not legal advice.</strong> This is a structural
        starting point only. Replace the wording with text reviewed by a lawyer or a
        reputable generator before taking real payments or submitting to the App Store, and
        confirm every specific (legal entity, governing law, refund terms, liability caps).
      </div>

      <section className="flex flex-col gap-5 text-sm leading-relaxed text-foreground/90">
        <div>
          <h2 className="text-base font-semibold">1. Acceptance</h2>
          <p>
            By creating an account or using kubbportal.com (the &ldquo;Service&rdquo;) you
            agree to these Terms and to our{" "}
            <Link href="/privacy" className="text-primary underline underline-offset-4">
              Privacy Policy
            </Link>
            . If you don&rsquo;t agree, don&rsquo;t use the Service.
          </p>
        </div>
        <div>
          <h2 className="text-base font-semibold">2. Your account</h2>
          <p>
            You&rsquo;re responsible for your account and for activity under it. Provide
            accurate information and keep your credentials secure. You must be at least [AGE]
            to use the Service.
          </p>
        </div>
        <div>
          <h2 className="text-base font-semibold">3. Membership &amp; payments</h2>
          <p>
            A membership is a <strong>one-time purchase</strong> that unlocks virtual matches
            for a <strong>12-month</strong> access window. It does <strong>not auto-renew</strong>
            {" "}— access ends when the window expires unless you purchase again (early
            purchases extend from your current expiry). Payments are processed by Stripe; we
            don&rsquo;t store card details. Prices are shown at checkout and include applicable
            taxes where stated. Memberships are sold only on this website.
          </p>
        </div>
        <div>
          <h2 className="text-base font-semibold">4. Refunds &amp; cancellation</h2>
          <p>
            [State your refund policy.] Because access is granted immediately, [describe
            whether/when refunds are available]. Consumers in some regions (e.g. the EU/UK)
            may have statutory withdrawal rights for digital purchases; where they apply, they
            take precedence. Contact support@kubbportal.com for billing questions.
          </p>
        </div>
        <div>
          <h2 className="text-base font-semibold">5. Acceptable use &amp; content</h2>
          <p>
            Don&rsquo;t misuse the Service, break the law, or post handles, names, or other
            content that is offensive, infringing, or impersonating. We may remove content or
            suspend accounts that violate these Terms.
          </p>
        </div>
        <div>
          <h2 className="text-base font-semibold">6. Disclaimers &amp; limitation of liability</h2>
          <p>
            The Service is provided &ldquo;as is&rdquo; without warranties. To the maximum
            extent permitted by law, our liability is limited [insert cap / exclusions as
            advised]. Nothing here limits liability that cannot be limited by law.
          </p>
        </div>
        <div>
          <h2 className="text-base font-semibold">7. Termination</h2>
          <p>
            You can stop using the Service anytime. We may suspend or terminate access for
            violations of these Terms. You can request account deletion by contacting us.
          </p>
        </div>
        <div>
          <h2 className="text-base font-semibold">8. Governing law</h2>
          <p>These Terms are governed by the laws of [JURISDICTION]. [Confirm with counsel.]</p>
        </div>
        <div>
          <h2 className="text-base font-semibold">9. Changes</h2>
          <p>
            We may update these Terms; we&rsquo;ll revise the &ldquo;last updated&rdquo; date
            above and, where appropriate, notify you. Continued use means you accept the
            changes.
          </p>
        </div>
        <div>
          <h2 className="text-base font-semibold">10. Contact</h2>
          <p>Questions? Email support@kubbportal.com.</p>
        </div>
      </section>

      <Link
        href="/"
        className="self-start text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        ← Back to Kubb Portal
      </Link>
    </div>
  );
}
