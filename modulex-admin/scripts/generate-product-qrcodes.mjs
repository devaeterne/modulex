import dotenv from "dotenv";
import QRCode from "qrcode";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const BUCKET_NAME = "product-qrcodes";

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

function safeFileName(value) {
  return String(value)
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9-_]/g, "-");
}

async function main() {
  console.log("Loading products...");

  const { data: products, error } = await supabase
    .from("products")
    .select("id, sku, qr_value, color_code")
    .not("qr_value", "is", null)
    .order("sku", { ascending: true });

  if (error) {
    console.error("Failed to load products:", error.message);
    process.exit(1);
  }

  if (!products || products.length === 0) {
    console.log("No products found.");
    return;
  }

  console.log(`Found ${products.length} products.`);

  let successCount = 0;
  let errorCount = 0;

  for (const product of products) {
    try {
      const qrValue = product.qr_value || product.sku;
      const colorCode = product.color_code || "NO-COLOR";
      const fileName = `${safeFileName(product.sku)}.svg`;
      const filePath = `${colorCode}/${fileName}`;

      const svg = await QRCode.toString(qrValue, {
        type: "svg",
        errorCorrectionLevel: "H",
        margin: 2,
        width: 512,
      });

      const { error: uploadError } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(filePath, svg, {
          contentType: "image/svg+xml",
          upsert: true,
        });

      if (uploadError) {
        throw uploadError;
      }

      const { data: publicUrlData } = supabase.storage
        .from(BUCKET_NAME)
        .getPublicUrl(filePath);

      const qrSvgUrl = publicUrlData.publicUrl;

      const { error: updateError } = await supabase
        .from("products")
        .update({
          qr_svg_path: filePath,
          qr_svg_url: qrSvgUrl,
          qr_generated_at: new Date().toISOString(),
        })
        .eq("id", product.id);

      if (updateError) {
        throw updateError;
      }

      successCount += 1;
      console.log(`OK: ${product.sku} → ${filePath}`);
    } catch (err) {
      errorCount += 1;
      console.error(`ERROR: ${product.sku}`, err.message || err);
    }
  }

  console.log("Done.");
  console.log(`Success: ${successCount}`);
  console.log(`Errors: ${errorCount}`);
}

main();