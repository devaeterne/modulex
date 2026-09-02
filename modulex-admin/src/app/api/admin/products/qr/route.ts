import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { requireAdmin } from "@/lib/auth/admin-api";
import { withApiTiming } from "@/lib/observability/apiTiming";
import { supabaseAdmin } from "@/lib/supabase/server-admin";

async function handlePost(request: Request) {
  try {
    const auth = await requireAdmin(request);
    if ("response" in auth && auth.response) return auth.response;
    const actor = auth.actor;
    const body = await request.json() as { product_id?: unknown; force?: boolean };
    if (typeof body.product_id !== "string") return NextResponse.json({ error: "product_id is required" }, { status: 400 });
    const { data: product, error } = await supabaseAdmin.from("products").select("id,sku,qr_value,qr_svg_path,color_code").eq("id", body.product_id).single();
    if (error || !product) return NextResponse.json({ error: "Product not found" }, { status: 404 });
    if (!body.force && product.qr_svg_path && product.qr_value === product.sku) return NextResponse.json({ ok: true, skipped: true, qr_svg_path: product.qr_svg_path });
    // The scanner payload is canonical current SKU; never reuse a stale qr_value.
    const value = product.sku;
    const svg = await QRCode.toString(value, { type: "svg", errorCorrectionLevel: "H", margin: 2, width: 512 });
    const safeSku = product.sku.trim().replace(/\s+/g, "-").replace(/[^a-zA-Z0-9-_]/g, "-");
    const path = `${product.color_code || "NO-COLOR"}/${safeSku}.svg`;
    const { error: uploadError } = await supabaseAdmin.storage.from("product-qrcodes").upload(path, svg, { contentType: "image/svg+xml", upsert: true });
    if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 502 });
    const { data: urlData } = supabaseAdmin.storage.from("product-qrcodes").getPublicUrl(path);
    const { error: updateError } = await supabaseAdmin.from("products").update({ qr_value: value, qr_svg_path: path, qr_svg_url: urlData.publicUrl, qr_generated_at: new Date().toISOString() }).eq("id", product.id);
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
    if (product.qr_svg_path && product.qr_svg_path !== path) {
      const { error: cleanupError } = await supabaseAdmin.storage.from("product-qrcodes").remove([product.qr_svg_path]);
      if (cleanupError) console.warn("QR old asset cleanup failed after successful replacement", cleanupError.message);
    }
    return NextResponse.json({ ok: true, actor: actor.profile.id, qr_value: value, qr_svg_path: path, qr_svg_url: urlData.publicUrl, qr_generated_at: new Date().toISOString() });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to generate QR" }, { status: 403 }); }
}

export async function POST(request: Request) {
  return withApiTiming({ route: "/api/admin/products/qr", method: "POST" }, () => handlePost(request));
}
