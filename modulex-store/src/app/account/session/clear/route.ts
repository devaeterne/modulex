import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut({ scope: "local" });
  return NextResponse.redirect(new URL("/account/login?status=access-unavailable", request.url));
}
