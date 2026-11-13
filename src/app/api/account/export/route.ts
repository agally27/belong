import { NextResponse } from "next/server";
import { exportUserData } from "@/lib/services/account";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/** UK GDPR data portability: the signed-in member's own data as a JSON download. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const data = await exportUserData(user.id);
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="belong-data-${new Date().toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
