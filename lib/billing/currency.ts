// Currency conversion between Constory's USD-denominated pricing (shown to
// every user worldwide — see lib/billing/plans.ts) and whatever currency is
// actually enabled/chargeable on the connected Paystack integration.
//
// Why this exists: Paystack only lets an account charge in currencies it has
// enabled. Most Nigeria-registered businesses only have NGN enabled by
// default — USD requires Paystack's "international payments" approval (a
// Zenith Bank USD domiciliary account plus a ~48h review; only Kenya- and
// Nigeria-based businesses can hold USD at all). Constory's prices are shown
// in USD everywhere since the product isn't Nigeria-only, but the actual
// Paystack charge has to happen in whatever currency this integration
// supports — currently NGN. This module is the one place that conversion
// happens, so it's easy to find, change, or extend to other currencies
// (GHS, KES, ZAR, ...) later, or to drop entirely once/if USD is enabled.
//
// IMPORTANT CAVEAT: the Paystack Plan codes in paystack-plan-codes.ts
// (PLN_...) were created directly in the Paystack Dashboard with their own
// fixed amount *and* currency baked in at creation time. Per Paystack's
// docs, when a `plan` code is passed to /transaction/initialize, Paystack
// charges the plan's own configured amount and overrides the `amount` we
// pass — so USD_TO_NGN_RATE below only needs to be reasonably close (it
// drives the audit-trail metadata and whatever Paystack shows pre-charge,
// not the actual debit). The real price charged is governed by what those
// Plans were set to in the Dashboard. If plans.ts prices change, the
// Paystack Plans themselves (or new plan codes) need updating to match —
// this file doesn't do that for you.

/**
 * The currency this Paystack integration is actually able to charge in.
 * Must match a currency enabled on the Paystack account AND the currency
 * the Plan codes were created in, or /transaction/initialize fails with
 * "Currency not supported by merchant" (code: unsupported_currency).
 */
export const CHARGE_CURRENCY = process.env.PAYSTACK_CHARGE_CURRENCY || "NGN";

/**
 * Manually-maintained USD -> CHARGE_CURRENCY rate. NGN floats significantly
 * against the dollar, so this needs periodic updating via the
 * USD_TO_NGN_RATE env var — it is NOT a "set once" value. A future
 * improvement would fetch this from a live FX source with a cached/
 * fallback value instead of a static env var.
 */
const DEFAULT_USD_TO_NGN_RATE = 1500;

function usdToChargeCurrencyRate(): number {
  const raw = process.env.USD_TO_NGN_RATE;
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_USD_TO_NGN_RATE;
}

/**
 * Converts a USD price (in whole cents, e.g. from priceForInterval) into
 * the smallest unit of CHARGE_CURRENCY (kobo for NGN) that Paystack expects
 * in its `amount` field. Paystack's minor-unit convention is x100 for every
 * currency it currently supports (NGN, GHS, KES, ZAR, USD).
 */
export function usdCentsToChargeCurrencyMinorUnits(usdCents: number): number {
  const usd = usdCents / 100;
  const converted = usd * usdToChargeCurrencyRate();
  return Math.round(converted * 100);
}

/** For the metadata audit trail — the rate actually used for a given conversion. */
export function currentUsdToChargeCurrencyRate(): number {
  return usdToChargeCurrencyRate();
}
