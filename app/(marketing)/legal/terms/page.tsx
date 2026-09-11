import type { Metadata } from "next";

export const metadata: Metadata = { title: "Terms of Service — Constory" };

// Entity name, governing jurisdiction, and support address below are
// Constory's actual details (Blitz Haus LTD, Nigeria). Everything else
// reflects how the product actually works today (plans, credits, Paystack
// billing, workspaces/teams, AI-generated content) rather than generic
// boilerplate.
export default function TermsPage() {
  return (
    <>
      <h1>Terms of Service</h1>
      <p className="prose-legal-updated">Last updated: September 11, 2026</p>

      <p>
        These Terms of Service (&quot;Terms&quot;) govern your access to and use of Constory (the
        &quot;Service&quot;), operated by <strong>Blitz Haus LTD</strong> (&quot;Constory,&quot; &quot;we,&quot;
        &quot;us&quot;). By creating an account or otherwise using the Service, you agree to these
        Terms. If you are using the Service on behalf of a business or team, you are agreeing on
        that organization&apos;s behalf and confirming you have the authority to do so.
      </p>

      <h2>1. The Service</h2>
      <p>
        Constory helps businesses plan content: turning brand information into a content
        strategy, content ideas, and an organized, AI-assisted content calendar across social
        platforms. The Service is provided on a subscription basis with a Free plan and paid
        plans (currently Creator and Pro), each with its own limits on workspaces, AI credits, and
        features, as described on our{" "}
        <a href="/pricing">pricing page</a>.
      </p>

      <h2>2. Accounts</h2>
      <p>
        You must provide accurate information when creating an account and keep your login
        credentials secure. You are responsible for all activity that happens under your account,
        including actions taken by anyone you invite into a workspace you own or administer. Tell
        us right away if you suspect unauthorized access to your account.
      </p>

      <h2>3. Workspaces, teams, and roles</h2>
      <p>
        An account may create one or more workspaces (&quot;brands&quot;), subject to your plan&apos;s
        limits, and invite other people into a workspace with a defined role (owner, admin,
        editor, or viewer). The workspace owner is responsible for who they invite and what access
        those roles grant. Removing a member or revoking an invite takes effect immediately for
        future access; it does not retroactively undo actions already taken.
      </p>

      <h2>4. AI-generated content</h2>
      <p>
        Constory uses third-party AI models to generate strategy, ideas, and post content based on
        the brand information you provide. AI output can be inaccurate, generic, or unsuitable for
        your intended use, and you are responsible for reviewing, editing, and approving any
        content before you publish or rely on it — including for factual accuracy, trademark and
        copyright clearance, and compliance with each platform&apos;s own policies. We do not
        guarantee that AI-generated content is original, error-free, or fit for any particular
        purpose.
      </p>

      <h2>5. AI credits</h2>
      <p>
        Paid and free plans each include a monthly allowance of AI credits, consumed as you
        generate or regenerate content. Credits reset each billing period and do not roll over or
        carry a cash value. We may change how many actions a given credit covers as models and
        costs change, but we will not reduce your plan&apos;s stated monthly allowance without notice.
      </p>

      <h2>6. Billing and subscriptions</h2>
      <p>
        Paid plans are billed in advance on a monthly, quarterly, or annual basis through our
        payment processor (currently Paystack). By subscribing, you authorize us to charge your
        chosen payment method on a recurring basis until you cancel. You can cancel at any time
        from your billing settings; your plan stays active until the end of the period you&apos;ve
        already paid for, after which it moves to the Free plan unless you resubscribe. Downgrades
        to a cheaper paid plan take effect at the start of your next billing period rather than
        immediately, so you keep what you already paid for. See our{" "}
        <a href="/legal/refund">Refund Policy</a> for how payments and refunds are handled.
      </p>

      <h2>7. Acceptable use</h2>
      <p>You agree not to use the Service to:</p>
      <ul>
        <li>Generate or publish content that is unlawful, fraudulent, or infringes someone else&apos;s intellectual property or other rights;</li>
        <li>Attempt to gain unauthorized access to the Service, other accounts, or our systems;</li>
        <li>Interfere with or disrupt the Service, or reverse-engineer it beyond what applicable law permits;</li>
        <li>Use the Service to build a competing product by systematically extracting its content or design; or</li>
        <li>Resell or provide the Service to third parties as your own product without our written permission.</li>
      </ul>

      <h2>8. Your content</h2>
      <p>
        You retain ownership of the brand information, strategy edits, and final content you
        create or approve in Constory. You grant us a limited license to store, process, and
        display that content back to you (and to anyone you&apos;ve invited into the relevant
        workspace) as necessary to operate the Service, including sending it to our AI and
        infrastructure providers solely to generate and deliver your content.
      </p>

      <h2>9. Termination</h2>
      <p>
        You may stop using the Service and cancel your subscription at any time. We may suspend or
        terminate access to accounts that violate these Terms, that we reasonably believe pose a
        security risk, or that have significantly overdue payments, after reasonable notice where
        practical.
      </p>

      <h2>10. Disclaimers and limitation of liability</h2>
      <p>
        The Service is provided &quot;as is&quot; without warranties of any kind, express or implied,
        including any warranty that AI-generated content will be accurate, original, or suitable
        for a particular purpose. To the maximum extent permitted by law, Constory will not be
        liable for indirect, incidental, or consequential damages, or for any amount exceeding
        what you paid us in the twelve months before the claim arose.
      </p>

      <h2>11. Changes to these Terms</h2>
      <p>
        We may update these Terms from time to time. If a change is material, we&apos;ll make
        reasonable efforts to notify you (such as by email or an in-app notice) before it takes
        effect. Continuing to use the Service after a change becomes effective means you accept
        the updated Terms.
      </p>

      <h2>12. Governing law</h2>
      <p>These Terms are governed by the laws of <strong>Nigeria</strong>, without regard to its conflict-of-law principles.</p>

      <h2>13. Contact</h2>
      <p>
        Questions about these Terms can be sent to <strong>biwuoha@blitzhaus.org</strong>.
      </p>
    </>
  );
}
