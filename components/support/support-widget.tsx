"use client";

import { useState, useRef, useEffect } from "react";
import { MessageCircle, X, Send, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { buildWhatsAppLink } from "@/lib/support/whatsapp";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  whatsappLink?: string | null;
}

const GREETING: ChatMessage = {
  role: "assistant",
  content: "Hi! Ask me anything about Constory — plans, credits, your account, whatever. I'll bring in the team directly if I can't help.",
};

function clientWhatsAppFallback(lastMessage: string): string | null {
  const number = process.env.NEXT_PUBLIC_WHATSAPP_SUPPORT_NUMBER;
  if (!number) return null;
  return buildWhatsAppLink(number, `Hi, I need help with Constory. ${lastMessage}`.slice(0, 500));
}

/**
 * Floating support widget, mounted globally in app/layout.tsx so it's on
 * every page (marketing site, auth, and the app shell alike). AI-first: every
 * message goes to /api/support/chat, which answers from the FAQ content
 * (lib/support/faq.ts) and only surfaces a WhatsApp handoff when it can't
 * help. Chat state is plain component state -- it survives client-side
 * navigation (this component stays mounted across route changes as part of
 * the root layout) but resets on a full page reload, deliberately, rather
 * than adding persistence for a first pass.
 */
export function SupportWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([GREETING]);
  const [chatId, setChatId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, open]);

  async function handleSend() {
    const text = input.trim();
    if (!text || sending) return;

    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setSending(true);

    try {
      const res = await fetch("/api/support/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId, message: text, pagePath: window.location.pathname }),
      });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data: { chatId: string; reply: string; needsHuman: boolean; whatsappLink: string | null } = await res.json();
      setChatId(data.chatId);
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply, whatsappLink: data.whatsappLink }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Sorry, that didn't go through. You can reach us directly on WhatsApp instead.",
          whatsappLink: clientWhatsAppFallback(text),
        },
      ]);
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      {open && (
        <div
          role="dialog"
          aria-label="Constory support chat"
          className="fixed bottom-24 right-5 z-50 flex h-[70vh] max-h-[520px] w-[calc(100vw-2.5rem)] max-w-sm flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-xl"
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <span className="text-sm font-semibold text-text-primary">Constory support</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close support chat"
              className="rounded-sm text-text-muted transition-colors hover:text-text-primary"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {messages.map((m, i) => (
              <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[85%] rounded-lg px-3 py-2 text-sm",
                    m.role === "user"
                      ? "bg-constory-blue text-white"
                      : "bg-surface-secondary text-text-primary",
                  )}
                >
                  <p className="whitespace-pre-wrap">{m.content}</p>
                  {m.whatsappLink && (
                    <a
                      href={m.whatsappLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-constory-blue underline underline-offset-2"
                    >
                      Continue on WhatsApp →
                    </a>
                  )}
                </div>
              </div>
            ))}
            {sending && (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 rounded-lg bg-surface-secondary px-3 py-2 text-sm text-text-muted">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Thinking...
                </div>
              </div>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex items-center gap-2 border-t border-border p-3"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type a message..."
              aria-label="Message"
              disabled={sending}
              className="h-9 flex-1 rounded-md border border-border bg-surface px-3 text-sm text-text-primary placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-constory-blue"
            />
            <Button type="submit" size="icon" disabled={sending || !input.trim()} aria-label="Send message">
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close support chat" : "Open support chat"}
        title="Chat with us"
        className={cn(
          // Shifted left of the fixed bottom-right theme toggle (see
          // components/theme-toggle.tsx) so the two floating buttons never
          // overlap -- right-20 (5rem) clears its right-5/h-11 footprint
          // with room to spare.
          "fixed bottom-5 right-20 z-50 flex h-11 w-11 items-center justify-center rounded-full",
          "bg-constory-blue text-white shadow-lg transition-colors hover:bg-blue-hover",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-constory-blue focus-visible:ring-offset-2 focus-visible:ring-offset-app-background",
        )}
      >
        {open ? <X className="h-5 w-5" aria-hidden="true" /> : <MessageCircle className="h-5 w-5" aria-hidden="true" />}
      </button>
    </>
  );
}
