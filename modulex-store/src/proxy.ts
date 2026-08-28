import type { NextRequest } from "next/server";
import { updateDealerSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateDealerSession(request);
}

export const config = {
  matcher: ["/dealer/:path*"],
};
