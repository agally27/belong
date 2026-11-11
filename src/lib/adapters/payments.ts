/**
 * Payments boundary. The mock provider completes "checkout" instantly so the
 * whole membership experience works locally. To go live, implement
 * StripeProvider below (see INTEGRATION_CHECKLIST.md §Stripe) — nothing else
 * in the app needs to change.
 */
export interface CheckoutRequest {
  userId: string;
  planId: string;
  pricePence: number;
  currency: string;
}

export interface CheckoutSession {
  /** True when payment is already complete (mock). False when the member must visit `url`. */
  completed: boolean;
  url?: string;
  reference: string | null;
}

export interface PaymentProvider {
  readonly name: string;
  readonly simulated: boolean;
  createCheckout(req: CheckoutRequest): Promise<CheckoutSession>;
  cancel(req: { userId: string }): Promise<void>;
}

const mockPayments: PaymentProvider = {
  name: "mock",
  simulated: true,
  async createCheckout(req) {
    return { completed: true, reference: `mock_${req.planId}_${Date.now()}` };
  },
  async cancel() {},
};

/**
 * Stripe integration point (NOT yet implemented — owner configuration).
 * Expected env: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_PLUS, STRIPE_PRICE_PREMIUM.
 * createCheckout should create a Checkout Session (mode: subscription,
 * client_reference_id: userId, metadata.planId) and return { completed: false, url }.
 * The webhook at /api/webhooks/payments then calls applyPlan().
 */
const stripePayments: PaymentProvider = {
  name: "stripe",
  simulated: false,
  async createCheckout() {
    throw new Error("Stripe is not configured yet. See INTEGRATION_CHECKLIST.md.");
  },
  async cancel() {
    throw new Error("Stripe is not configured yet. See INTEGRATION_CHECKLIST.md.");
  },
};

export function getPaymentProvider(): PaymentProvider {
  return process.env.STRIPE_SECRET_KEY && process.env.BELONG_PAYMENTS_PROVIDER === "stripe" ? stripePayments : mockPayments;
}
