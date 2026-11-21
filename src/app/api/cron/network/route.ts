import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { flushEmailOutbox, queueDailyDigests } from "@/lib/services/email-notifications";
import { runNetwork } from "@/lib/services/network";

export const dynamic = "force-dynamic";

/**
 * Scheduled agent-network run (expires temporary signals, refreshes matches).
 * Call from your platform's scheduler, e.g. every 15 minutes:
 *   curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cron/network
 * Disabled unless CRON_SECRET is set.
 */
async function handle(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not configured." }, { status: 503 });
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return NextResponse.json({ error: "Unauthorised." }, { status: 401 });
  }
  const network = await runNetwork();
  // Daily summaries, then send anything waiting (including emails a failed send left behind).
  const digests = await queueDailyDigests();
  const emails = await flushEmailOutbox(200);
  return NextResponse.json({ ...network, digestsQueued: digests, emails });
}

// Schedulers differ: some send POST, some (e.g. Vercel Cron) send GET. Both need the secret.
export const POST = handle;
export const GET = handle;
