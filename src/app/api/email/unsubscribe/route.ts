import { NextResponse } from "next/server";
import { unsubscribe } from "@/lib/services/email-notifications";

export const dynamic = "force-dynamic";

/** RFC 8058 one-click unsubscribe, called by email clients from the List-Unsubscribe header. */
export async function POST(req: Request) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const res = await unsubscribe(token);
  return res ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Invalid link." }, { status: 400 });
}
