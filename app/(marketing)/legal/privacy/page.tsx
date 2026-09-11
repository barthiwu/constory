import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy Policy — Constory" };

export default function PrivacyPage() {
  return (
    <>
      <h1>Privacy Policy</h1>
      <p className="prose-legal-updated">Last updated: September 11, 2026</p>

      <p>
        This Privacy Policy explains what information Constory (&quot;we,&quot; &quot;us&quot;) collects
        when you use the Service, how we use it, and the choices you have. It&apos;s written to
        describe what Constory actually does, not generic boilerplate.
      </p>

      <h2>1. Information we collect</h2>
      <p><strong>Account information:</strong> your name, email address, and password (stored in hashed form by our authentication provider — we never see or store your raw password).</p>
      <p><strong>Brand and workspace information:</strong> the business details, industry, target audience, and other information you enter about each workspace/brand, plus any content strategy, ideas, calendar posts, and edits you or your teammates create.</p>
      <p><strong>Billing information:</strong> your subscription plan, billing interval, and payment status. Card details are collected and stored directly by our payment processor, Paystack — we store only a reference token, not your full card number.</p>
      <p><strong>Usage information:</strong> a log of AI generation requests (what was generated, when, and by whom) used to track your AI credit usage and to diagnose problems.</p>
      <p><strong>Team information:</strong> if you invite others into a workspace, we store their email address and assigned role until the invite is accepted, revoked, or expires.</p>

      <h2>2. How we use your information</h2>
      <ul>
        <li>To provide the Service — generating strategy, ideas, and content calendars, and keeping your workspaces and team access in sync;</li>
        <li>To process payments and manage your subscription;</li>
        <li>To send you service communications, such as password resets, billing receipts, team invites, and — where you&apos;ve opted in — notifications about low AI credits, upcoming scheduled posts, and a weekly summary digest;</li>
        <li>To maintain the security and reliability of the Service, including detecting abuse; and</li>
        <li>To improve the product, using aggregated or de-identified usage patterns where possible.</li>
      </ul>

      <h2>3. Who we share it with</h2>
      <p>We don&apos;t sell your data. We share information only with the service providers that make Constory work, each acting under their own obligations to protect it:</p>
      <ul>
        <li><strong>Supabase</strong> — hosts our database, authentication, and file storage.</li>
        <li><strong>OpenAI</strong> — processes the brand and content information needed to generate AI strategy, ideas, and posts. We do not send your billing or payment details to our AI provider.</li>
        <li><strong>Paystack</strong> — processes payments and stores your payment method on our behalf.</li>
        <li>Other members of a workspace you belong to can see the brand information, strategy, ideas, and calendar content within that shared workspace, according to their role.</li>
      </ul>
      <p>We may also disclose information if required by law, or to protect the rights, safety, or property of Constory, our users, or the public.</p>

      <h2>4. Cookies</h2>
      <p>
        We use a small number of essential cookies to keep you signed in and to remember which
        workspace you have active. We don&apos;t use third-party advertising or tracking cookies.
      </p>

      <h2>5. Data retention</h2>
      <p>
        We keep your account and workspace data for as long as your account is active. If you
        delete your account, we delete or anonymize your personal information within a reasonable
        period, except where we need to keep certain records (such as billing history) to comply
        with legal or accounting obligations.
      </p>

      <h2>6. Your choices and rights</h2>
      <p>
        You can review and update your account and workspace information at any time from your
        settings. Depending on where you live, you may have additional rights over your personal
        information — such as requesting a copy of it, asking us to correct or delete it, or
        objecting to certain processing. To exercise any of these, contact us at{" "}
        <strong>biwuoha@blitzhaus.org</strong>.
      </p>

      <h2>7. Notification preferences</h2>
      <p>
        Account and security emails (like password resets) can&apos;t be turned off, since they&apos;re
        necessary to operate the Service. Product notification emails — low AI credit warnings,
        scheduled-post reminders, and the weekly digest — can each be turned on or off individually
        from your notification settings.
      </p>

      <h2>8. Security</h2>
      <p>
        We use industry-standard measures — including encryption in transit, access controls, and
        row-level data isolation between workspaces — to protect your information. No method of
        transmission or storage is perfectly secure, and we can&apos;t guarantee absolute security.
      </p>

      <h2>9. International transfers</h2>
      <p>
        Our service providers may process and store data in countries other than your own. Where
        this happens, we rely on those providers&apos; own safeguards for cross-border data transfer.
      </p>

      <h2>10. Children&apos;s privacy</h2>
      <p>Constory is a business tool and is not directed at, or knowingly used by, children. We do not knowingly collect personal information from anyone under 16.</p>

      <h2>11. Changes to this policy</h2>
      <p>
        We may update this policy from time to time. If a change is material, we&apos;ll make
        reasonable efforts to notify you before it takes effect.
      </p>

      <h2>12. Contact</h2>
      <p>Questions about this policy, or requests about your data, can be sent to <strong>biwuoha@blitzhaus.org</strong>.</p>
    </>
  );
}
