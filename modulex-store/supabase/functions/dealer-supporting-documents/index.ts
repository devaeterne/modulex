import { createClient } from "npm:@supabase/supabase-js@2";

const BUCKET = "dealer-supporting-documents";
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);
const ALLOWED_DOCUMENT_TYPES = new Set(["business_license", "resale_certificate", "showroom_company_documentation", "other"]);

function json(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}

function secretKey() {
  const current = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (current) {
    const keys = JSON.parse(current) as Record<string, string>;
    if (keys.default) return keys.default;
  }
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  throw new Error("Supabase server secret is unavailable");
}

function normalizeFilename(value: string, extension: string) {
  const basename = value.split(/[\\/]/).pop() ?? "";
  const cleaned = basename.replace(/[\u0000-\u001f\u007f]/g, "").replace(/[^A-Za-z0-9 _.,()'\-]/g, "_").replace(/\s+/g, " ").trim().slice(0, 180);
  return cleaned || `document.${extension}`;
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function validateSignature(file: File) {
  const bytes = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  if (file.type === "application/pdf") return bytes.length >= 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d;
  if (file.type === "image/jpeg") return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (file.type === "image/png") {
    const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return bytes.length >= png.length && png.every((byte, index) => bytes[index] === byte);
  }
  return false;
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const form = await request.formData();
    const token = String(form.get("token") ?? "").trim().toLowerCase();
    const documentType = String(form.get("document_type") ?? "").trim();
    const file = form.get("file");
    if (!/^[0-9a-f]{64}$/.test(token)) return json({ error: "Invalid upload authorization" }, 403);
    if (!ALLOWED_DOCUMENT_TYPES.has(documentType)) return json({ error: "Invalid document type" }, 400);
    if (!(file instanceof File) || file.size < 1 || file.size > MAX_FILE_BYTES || !ALLOWED_TYPES.has(file.type)) return json({ error: "Unsupported file" }, 400);
    if (!(await validateSignature(file))) return json({ error: "File content does not match its declared type" }, 400);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, secretKey(), { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    const { data: leadId, error: claimError } = await supabase.rpc("claim_store_lead_document_upload", { p_token_hash: await sha256Hex(token) });
    if (claimError || !leadId) return json({ error: "Upload authorization is invalid or expired" }, 403);

    const extension = file.type === "application/pdf" ? "pdf" : file.type === "image/png" ? "png" : "jpg";
    const storagePath = `${leadId}/${crypto.randomUUID()}.${extension}`;
    const originalFilename = normalizeFilename(file.name, extension);
    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(storagePath, file, { contentType: file.type, upsert: false, cacheControl: "3600" });
    if (uploadError) return json({ error: "Unable to store supporting document" }, 503);

    const { error: metadataError } = await supabase.from("store_lead_documents").insert({ lead_id: leadId, document_type: documentType, storage_path: storagePath, original_filename: originalFilename, mime_type: file.type, size_bytes: file.size });
    if (metadataError) {
      await supabase.storage.from(BUCKET).remove([storagePath]);
      return json({ error: "Unable to register supporting document" }, 503);
    }
    return json({ ok: true }, 201);
  } catch (error) {
    console.error("dealer-supporting-documents", error);
    return json({ error: "Unable to process supporting document" }, 500);
  }
});
