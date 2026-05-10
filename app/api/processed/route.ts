import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/session";
import { getProcessedList } from "@/lib/store";

export async function GET() {
  const userId = getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Not connected" }, { status: 401 });
  return NextResponse.json({ videos: await getProcessedList(userId) });
}
