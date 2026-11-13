import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { env } from "@/lib/config";

export const dynamic = "force-dynamic";

/** Liveness and readiness probe. Reveals no member data. */
export async function GET() {
  const started = Date.now();
  try {
    const db = await getDb();
    await db.get("SELECT 1 AS ok");
    return NextResponse.json({
      status: "ok",
      database: db.dialect,
      ai: env.aiProvider(),
      payments: env.paymentsProvider(),
      demoMode: env.demoMode(),
      latencyMs: Date.now() - started,
      time: new Date().toISOString(),
    });
  } catch (e) {
    console.error("[belong:health]", e);
    return NextResponse.json({ status: "error", time: new Date().toISOString() }, { status: 503 });
  }
}
