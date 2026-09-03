import Link from "next/link";

export const metadata = { title: "Privacy Policy — Kubb Portal" };

export default function PrivacyPage() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-12 sm:py-16">
      <div>
        <span className="eyebrow text-muted-foreground">LEGAL</span>
        <h1 className="display mt-2 text-3xl font-medium">Privacy Policy</h1>
        <p className="mt-1 text-sm text-muted-foreground">Last updated: [DATE]</p>
      </div>

      <div className="rounded-xl border border-[var(--swedish-gold)]/50 bg-[var(--swedish-gold)]/12 px-4 py-3 text-sm text-[var(--gold-ink)]">
        <strong>⚠️ DRAFT — placeholder, not legal advice.</strong> This is a structural
        starting point only. Replace the wording with text reviewed by a lawyer or a
        reputable policy generator before taking real payments or submitting to the App
        Store, and confirm every specific (legal entity, contact address, jurisdiction, age
        threshold, retention periods).
      </div>

      <section className="flex flex-col gap-5 text-sm leading-relaxed text-foreground/90">
        <div>
          <h2 className="text-base font-semibold">Who we are</h2>
          <p>
            Kubb Portal (&ldquo;we&rdquo;, &ldquo;us&rdquo;) operates kubbportal.com. You
            can reach us at support@kubbportal.com.
          </p>
        </div>
        <div>
          <h2 className="text-base font-semibold">Information we collect</h2>
          <p>
            Account details you provide (email, display name, handle); gameplay data
            (matches, turns, results, teams); and, if you buy a membership, limited billing
            details handled by our payment processor — we never store card numbers. If you
            sign in with Apple or Google, we receive basic profile information from them.
          </p>
        </div>
        <div>
          <h2 className="text-base font-semibold">How we use your information</h2>
          <p>
            To provide and operate the service (accounts, matches, leaderboards,
            memberships), to communicate with you (such as email confirmation), and to
            secure and improve the platform.
          </p>
        </div>
        <div>
          <h2 className="text-base font-semibold">Service providers</h2>
          <p>
            We share data with processors that run the service on our behalf: Supabase
            (database &amp; authentication), Stripe (payments), Resend (email), Vercel
            (hosting), and Apple/Google (sign-in). Each processes data under its own terms.
          </p>
        </div>
        <div>
          <h2 className="text-base font-semibold">Data retention &amp; deletion</h2>
          <p>
            We keep your data while your account is active. You can request deletion by
            contacting us; match records that involve other players may be retained in an
            anonymized / unowned form so their results stay intact.
          </p>
        </div>
        <div>
          <h2 className="text-base font-semibold">Your rights</h2>
          <p>
            Depending on where you live (for example the EEA/UK under GDPR, or California
            under CCPA/CPRA), you may have rights to access, correct, delete, or export your
            data and to object to certain processing. Contact us to exercise them.
          </p>
        </div>
        <div>
          <h2 className="text-base font-semibold">Cookies</h2>
          <p>
            We use essential cookies to keep you signed in. We do not currently use
            non-essential or advertising cookies. [Update if analytics are added.]
          </p>
        </div>
        <div>
          <h2 className="text-base font-semibold">Children</h2>
          <p>The service is not directed to children under [AGE]. [Confirm your threshold.]</p>
        </div>
        <div>
          <h2 className="text-base font-semibold">Changes</h2>
          <p>
            We may update this policy; we&rsquo;ll revise the &ldquo;last updated&rdquo; date
            above and, where appropriate, notify you.
          </p>
        </div>
        <div>
          <h2 className="text-base font-semibold">Contact</h2>
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
