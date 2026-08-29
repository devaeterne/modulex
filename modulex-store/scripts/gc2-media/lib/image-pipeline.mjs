import crypto from "node:crypto";
import sharp from "sharp";
import { MAX_SOURCE_BYTES, OPTIMIZED_WEBP_QUALITY } from "./types.mjs";

export function sha256(buffer) {
  if (!Buffer.isBuffer(buffer)) throw new Error("SHA-256 input must be a Buffer.");
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

export async function processImage({ bytes, targetLongEdge }) {
  if (!Buffer.isBuffer(bytes) || bytes.length === 0 || bytes.length > MAX_SOURCE_BYTES) {
    throw new Error("Source image bytes are invalid or exceed 20 MB.");
  }
  if (!Number.isInteger(targetLongEdge) || targetLongEdge <= 0) {
    throw new Error("Target long edge must be a positive integer.");
  }

  const metadata = await sharp(bytes, { failOn: "error" }).metadata();
  if (!metadata.width || !metadata.height || !metadata.format) {
    throw new Error("Unable to verify image metadata.");
  }

  let pipeline = sharp(bytes, { failOn: "error" }).rotate();
  if (Math.max(metadata.width, metadata.height) > targetLongEdge) {
    pipeline = pipeline.resize({
      width: targetLongEdge,
      height: targetLongEdge,
      fit: "inside",
      withoutEnlargement: true,
    });
  }

  const optimizedBytes = await pipeline
    .webp({ quality: OPTIMIZED_WEBP_QUALITY, smartSubsample: true })
    .toBuffer();
  const output = await sharp(optimizedBytes, { failOn: "error" }).metadata();

  if (!output.width || !output.height || output.format !== "webp") {
    throw new Error("Unable to verify optimized WebP output.");
  }

  return {
    original: {
      sha256: sha256(bytes),
      bytes: bytes.length,
      width: metadata.width,
      height: metadata.height,
      format: metadata.format,
    },
    optimized: {
      sha256: sha256(optimizedBytes),
      bytes: optimizedBytes.length,
      width: output.width,
      height: output.height,
      mimeType: "image/webp",
    },
    optimizedBytes,
  };
}
