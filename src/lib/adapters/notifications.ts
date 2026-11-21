/**
 * Outbound notification channels (email, push). In-app notifications are
 * always stored in the database; these adapters deliver the same event to
 * external channels once the owner configures a provider.
 */
export interface OutboundNotification {
  type: string;
  title: string;
  body: string;
  href?: string;
}

export interface EmailProvider {
  readonly name: string;
  send(msg: { to: string; subject: string; text: string; headers?: Record<string, string> }): Promise<void>;
}

export interface PushProvider {
  readonly name: string;
  send(userId: string, n: OutboundNotification): Promise<void>;
}

export interface OutboxEmail {
  to: string;
  subject: string;
  text: string;
  headers?: Record<string, string>;
  sentAt: string;
}

/** Development outbox: nothing leaves the machine. Shared across module copies within the process. */
const g = globalThis as unknown as { __belongOutbox?: OutboxEmail[] };
export const devOutbox: OutboxEmail[] = (g.__belongOutbox ??= []);

const outboxEmail: EmailProvider = {
  name: "dev-outbox",
  async send(msg) {
    devOutbox.unshift({ ...msg, sentAt: new Date().toISOString() });
    if (devOutbox.length > 200) devOutbox.pop();
  },
};

/**
 * Resend (resend.com) over its HTTP API. Activated by EMAIL_PROVIDER=resend with
 * EMAIL_API_KEY and EMAIL_FROM. Written against Resend's documented API but not
 * yet tested with a live key — see INTEGRATION_CHECKLIST.md.
 */
const resendEmail: EmailProvider = {
  name: "resend",
  async send(msg) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.EMAIL_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [msg.to], subject: msg.subject, text: msg.text, ...(msg.headers ? { headers: msg.headers } : {}) }),
    });
    if (!res.ok) throw new Error(`Resend responded ${res.status}`);
  },
};

/** True when real email delivery is configured. */
export const emailConfigured = () => process.env.EMAIL_PROVIDER === "resend" && Boolean(process.env.EMAIL_API_KEY && process.env.EMAIL_FROM);

const noopPush: PushProvider = { name: "none", async send() {} };

/** Resend when configured; otherwise the local development outbox. Other providers can be added here. */
export function getEmailProvider(): EmailProvider {
  return emailConfigured() ? resendEmail : outboxEmail;
}

/** Integration point: return a web-push/FCM/OneSignal implementation when PUSH_API_KEY is set. */
export function getPushProvider(): PushProvider {
  return noopPush;
}

export async function deliverNotification(userId: string, n: OutboundNotification): Promise<void> {
  try {
    await getPushProvider().send(userId, n);
  } catch (e) {
    console.error("[belong:push] delivery failed", e);
  }
}
