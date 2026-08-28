import { NextResponse } from "next/server";
import { readDealerPortalSession } from "@/lib/dealer/auth";
import { getDealerDocumentDownload } from "@/lib/portal/dealer";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await readDealerPortalSession();
  if (!session.context) {
    const target = session.hasAuthenticatedClaims ? "/dealer/session/clear" : "/dealer/login";
    return NextResponse.redirect(new URL(target, request.url));
  }

  const { id } = await params;
  const document = await getDealerDocumentDownload(id);
  if (!document) {
    return NextResponse.redirect(new URL("/dealer/documents?status=unavailable", request.url));
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.storage
    .from(document.storage_bucket)
    .createSignedUrl(document.storage_path, 60);

  if (error || !data?.signedUrl) {
    return NextResponse.redirect(new URL("/dealer/documents?status=unavailable", request.url));
  }

  return NextResponse.redirect(data.signedUrl);
}
