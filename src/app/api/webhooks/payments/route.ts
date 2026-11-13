import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Payment provider webhook — INTEGRATION POINT, not yet implemented.
 * When Stripe is configured (see INTEGRATION_CHECKLIST.md):
 *   1. verify the signature with STRIPE_WEBHOOK_SECRET against the raw body;
 *   2. on checkout.session.completed / customer.subscription.updated, call
 *      applyPlan(client_reference_id, metadata.planId, "stripe", subscriptionId);
 *   3. on customer.subscription.deleted, call applyPlan(userId, "free", "stripe", null).
 */
export async function POST() {
  return NextResponse.json({ error: "Payments are not configured." }, { status: 501 });
}
