// Single source of truth for both the public /faq page and the AI support
// widget's grounding context (see app/api/support/chat/route.ts) — every
// answer here must be checkable against the actual product, the same rule
// applied to AI-generated content in lib/ai/safety-checks.ts. Do not add an
// item describing a feature Constory doesn't have yet (e.g. direct
// publishing to social platforms) — see the "does Constory publish for me"
// entry below for how to phrase that honestly instead.

export interface FaqItem {
  category: string;
  question: string;
  answer: string;
}

export const FAQ_ITEMS: FaqItem[] = [
  {
    category: "Getting started",
    question: "What does Constory actually do?",
    answer:
      "Constory is a workspace for planning content with purpose: it turns your brand information into a content strategy, specific content ideas, and an organized content calendar you can edit, regenerate, and export.",
  },
  {
    category: "Getting started",
    question: "Does Constory publish or schedule my posts to Instagram, TikTok, etc. for me?",
    answer:
      "Not yet — Constory doesn't connect to your social accounts or post on your behalf. It helps you plan and write the content and tells you which platform(s) each idea or post fits best, but publishing it is still on you, the same way you'd post something you wrote in a doc.",
  },
  {
    category: "AI & credits",
    question: "What are AI credits and how many do I get?",
    answer:
      "AI credits are what generating or regenerating content costs. Free includes 10 credits a month, Creator includes 85, and Pro includes 260. Generating a batch of ideas costs 2 credits, a full strategy costs 4, a full calendar costs 4, and generating, regenerating, or improving a single post costs 1.",
  },
  {
    category: "AI & credits",
    question: "What happens when I run out of AI credits?",
    answer:
      "AI generation pauses until your credits reset at the start of your next monthly usage period, or until you upgrade. Everything else — writing, editing, and organizing content by hand — stays fully available regardless of your credit balance.",
  },
  {
    category: "AI & credits",
    question: "Do unused AI credits roll over to next month?",
    answer:
      "No. Credits reset every month and don't carry over, even on a quarterly or annual billing plan — credits are always allocated monthly.",
  },
  {
    category: "Billing & plans",
    question: "What plans does Constory offer?",
    answer:
      "Free ($0, 1 brand, 10 AI credits/month), Creator ($12/month, up to 3 brands, unlimited strategies/pillars/ideas/calendars, 85 AI credits/month), and Pro ($23/month, up to 10 brands, 260 AI credits/month). Quarterly and annual billing get a 5% and 20% discount respectively.",
  },
  {
    category: "Billing & plans",
    question: "Can I change or cancel my plan?",
    answer:
      "Yes, any time from Settings → Billing. A plan change takes effect at the end of your current billing period rather than immediately, and your data is never deleted — if a downgrade would put you over a limit (like number of active brands), you'll be asked which ones stay active.",
  },
  {
    category: "Billing & plans",
    question: "What payment methods do you accept?",
    answer:
      "Payments run through Paystack. Support for currencies beyond Naira is in progress — if you're trying to pay from outside Nigeria and it's not working yet, tell us and we'll follow up directly.",
  },
  {
    category: "Account & security",
    question: "I signed up but never got a confirmation email — what do I do?",
    answer:
      "Check spam first. If it's genuinely not there, use the \"Resend confirmation email\" option on the login screen — it'll send a fresh link.",
  },
  {
    category: "Account & security",
    question: "Is two-factor authentication available?",
    answer: "Yes — you can turn it on from Settings → Security.",
  },
  {
    category: "Account & security",
    question: "Can other workspaces or accounts see my content?",
    answer:
      "No. Every brand's data — strategy, ideas, calendars — is isolated to its own workspace at the database level, so only people you've explicitly invited into that workspace can see or edit it.",
  },
  {
    category: "Team",
    question: "How do I add teammates to a workspace?",
    answer:
      "From Settings → Team, invite them by email and pick a role (admin, editor, or viewer). They'll get an invite link to accept.",
  },
];

export function faqContextBlock(): string {
  return FAQ_ITEMS.map((item) => `Q: ${item.question}\nA: ${item.answer}`).join("\n\n");
}
