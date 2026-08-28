import { NextRequest, NextResponse } from "next/server";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_REQUEST_BYTES = MAX_FILE_BYTES + 256 * 1024;
const ALLOWED_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);
const ALLOWED_DOCUMENT_TYPES = new Set(["business_license", "resale_certificate", "showroom_company_documentation", "other"]);

export async function POST(request: NextRequest) {
  const contentLength = Number(request.headers.get("content-length") || "0");
  if (contentLength > MAX_REQUEST_BYTES) return NextResponse.json({ error: "File is too large." }, { status: 413 });

  const origin = request.headers.get("origin");
  if (origin) {
    try {
      if (new URL(origin).host !== request.nextUrl.host) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
    } catch {
      return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
    }
  }

  let data: FormData;
  try { data = await request.formData(); }
  catch { return NextResponse.json({ error: "Invalid upload request." }, { status: 400 }); }

  const token = String(data.get("token") ?? "").trim().toLowerCase();
  const documentType = String(data.get("document_type") ?? "").trim();
  const file = data.get("file");
  if (!/^[0-9a-f]{64}$/.test(token) || !ALLOWED_DOCUMENT_TYPES.has(documentType)) {
    return NextResponse.json({ error: "Invalid upload request." }, { status: 400 });
  }
  if (!(file instanceof File) || file.size < 1 || file.size > MAX_FILE_BYTES || !ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ error: "Use a PDF, JPG, or PNG file up to 10 MB." }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) return NextResponse.json({ error: "Document upload is temporarily unavailable." }, { status: 503 });

  const forwarded = new FormData();
  forwarded.set("token", token);
  forwarded.set("document_type", documentType);
  forwarded.set("file", file, file.name);

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/dealer-supporting-documents`, {
      method: "POST",
      headers: { apikey: supabaseKey },
      body: forwarded,
      cache: "no-store",
    });
    if (!response.ok) {
      console.error("Dealer supporting document upload failed", response.status, await response.text());
      return NextResponse.json({ error: response.status === 403 ? "Document upload authorization expired." : "Unable to upload supporting document." }, { status: response.status === 403 ? 403 : 503 });
    }
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    console.error("Dealer supporting document proxy failed", error);
    return NextResponse.json({ error: "Unable to upload supporting document." }, { status: 503 });
  }
}
