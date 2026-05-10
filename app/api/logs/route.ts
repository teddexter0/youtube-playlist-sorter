import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/session";
import { getLogs } from "@/lib/store";

export async function GET() {
  const userId = getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Not connected" }, { status: 401 });
  return NextResponse.json({ logs: await getLogs(userId) });
}
