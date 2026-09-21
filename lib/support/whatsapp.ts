// Builds a "click to chat" WhatsApp link (https://wa.me/<number>?text=...).
// This is the whole mechanism -- no WhatsApp Business API integration, no
// webhook, nothing that could tell us a visitor merely opened the app. The
// only signal Constory ever gets is the one already wired up separately:
// the "a chat started" email fired from app/api/support/chat/route.ts the
// moment someone sends the AI widget its first message.

/** Digits only, no "+", per WhatsApp's wa.me link format (e.g. "2348012345678"). */
function sanitizeNumber(rawNumber: string): string {
  return rawNumber.replace(/[^0-9]/g, "");
}

export function buildWhatsAppLink(rawNumber: string, prefillText?: string): string {
  const number = sanitizeNumber(rawNumber);
  const base = `https://wa.me/${number}`;
  if (!prefillText) return base;
  return `${base}?text=${encodeURIComponent(prefillText)}`;
}
