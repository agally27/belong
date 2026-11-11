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
  send(msg: { to: string; subject: string; text: string }): Promise<void>;
}

export interface PushProvider {
  readonly name: string;
  send(userId: string, n: OutboundNotification): Promise<void>;
}

/** Development outbox: nothing leaves the machine. */
export const devOutbox: { to: string; subject: string; text: string }[] = [];

const consoleEmail: EmailProvider = {
  name: "dev-outbox",
  async send(msg) {
    devOutbox.push(msg);
    if (devOutbox.length > 200) devOutbox.shift();
  },
};

const noopPush: PushProvider = { name: "none", async send() {} };

/** Integration point: return a Resend/Postmark/SES implementation when EMAIL_API_KEY is set. */
export function getEmailProvider(): EmailProvider {
  return consoleEmail;
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
