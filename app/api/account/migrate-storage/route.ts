import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/session";
import { getUserSettings } from "@/lib/store";
import { adminDb } from "@/lib/firebase";
import { envValue } from "@/lib/runtime-config";
import { copyAccountStorage, migrationDatabase, storageTarget } from "@/lib/storage-migration";
export const maxDuration = 300;
export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return NextResponse.json({error:"Invalid origin"},{status:403});
  const id = getCurrentUserId();
  if (!id) return NextResponse.json({error:"Connect Google first."},{status:401});
  const user = await getUserSettings(id);
  const owner = envValue("PERSONAL_STATION_EMAIL");
  if (!owner || user?.email?.toLowerCase() !== owner.toLowerCase()) return NextResponse.json({error:"Owner operation only."},{status:403});
  if (envValue("FIREBASE_PROJECT_ID") === storageTarget) return NextResponse.json({ok:true,alreadyConnected:true});
  try {
    const connected = await adminDb().collection("users").where("encryptedRefreshToken", "!=", "").get();
    if (connected.docs.some(doc => doc.id !== id && doc.data().encryptedRefreshToken)) {
      return NextResponse.json({error:"Another connected account needs to be included before switching shared storage."},{status:409});
    }
    return NextResponse.json({ok:true,...await copyAccountStorage(adminDb(),migrationDatabase(),id)});
  }
  catch { return NextResponse.json({error:"Storage could not be copied and verified. Check destination database access; the original data remains intact."},{status:409}); }
}
