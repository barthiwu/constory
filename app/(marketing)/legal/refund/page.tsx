import type { Metadata } from "next";

export const metadata: Metadata = { title: "Refund Policy — Constory" };

export default function RefundPage() {
  return (
    <>
      <h1>Refund Policy</h1>
      <p className="prose-legal-updated">Last updated: September 11, 2026</p>

      <p>
        This policy explains how charges, cancellations, and refunds work for Constory
        subscriptions. It&apos;s meant to be read alongside our <a href="/legal/terms">Terms of
        Service</a>.
      </p>

      <h2>1. Free plan</h2>
      <p>Constory&apos;s Free plan does not require payment and is not covered by this policy.</p>

      <h2>2. Subscription billing</h2>
      <p>
        Paid plans (Creator and Pro) are billed in advance for the billing interval you choose —
        monthly, quarterly, or annual — and renew automatically until cancelled. You can see your
        current plan, interval, and next billing date at any time from your billing settings.
      </p>

      <h2>3. Cancelling</h2>
      <p>
        You can cancel a paid subscription at any time from your billing settings. When you
        cancel, your plan remains fully active until the end of the period you&apos;ve already paid
        for — we don&apos;t cut off access early. At the end of that period, your account moves to the
        Free plan unless you resubscribe. You can resume a cancelled subscription before the
        period ends to keep it running without interruption.
      </p>

      <h2>4. Downgrades</h2>
      <p>
        Switching to a cheaper paid plan is scheduled to take effect at the start of your next
        billing period, rather than charged and applied immediately — so you always get the full
        value of what you&apos;ve already paid for on your current plan before the lower plan and
        price take over.
      </p>

      <h2>5. Refunds</h2>
      <p>
        Because AI credits and workspace access are granted for the billing period as soon as it
        starts, payments for a period already in progress are generally non-refundable — including
        for partial use, unused AI credits, or simply changing your mind partway through a period.
      </p>
      <p>We make an exception, and will issue a full or partial refund, if:</p>
      <ul>
        <li>You were charged in error (for example, a duplicate charge, or a charge after you had already cancelled);</li>
        <li>A technical problem on our side meant you couldn&apos;t meaningfully use the Service during the period you were charged for, and we weren&apos;t able to fix it within a reasonable time; or</li>
        <li>You are within your first billing period as a first-time paying customer and the plan clearly wasn&apos;t what you expected — contact us within 7 days of the charge.</li>
      </ul>
      <p>
        To request a refund, contact <strong>[support email]</strong> with your account email and
        the reason for the request. We review requests individually and aim to respond within a
        few business days.
      </p>

      <h2>6. Failed or disputed payments</h2>
      <p>
        If a renewal payment fails, we&apos;ll let you know and give you an opportunity to update your
        payment method before any access is affected. If you dispute a charge directly with your
        bank or card issuer instead of contacting us first, we reserve the right to suspend the
        associated account while the dispute is resolved.
      </p>

      <h2>7. Changes to this policy</h2>
      <p>We may update this policy from time to time; material changes will be communicated before they take effect.</p>
    </>
  );
}
