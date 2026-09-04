import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const ENVELOPE_VERSION = "v1";

function assertKey(key: Buffer) {
  if (key.length !== 32) {
    throw new Error("Google Calendar token encryption key must be 32 bytes.");
  }
}

export function encryptRefreshToken(plainText: string, key: Buffer): string {
  assertKey(key);
  if (!plainText) throw new Error("Google Calendar refresh token is empty.");

  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    ENVELOPE_VERSION,
    iv.toString("base64url"),
    ciphertext.toString("base64url"),
    authTag.toString("base64url"),
  ].join(".");
}

export function decryptRefreshToken(envelope: string, key: Buffer): string {
  assertKey(key);
  const [version, ivPart, ciphertextPart, authTagPart, extra] = envelope.split(".");
  if (version !== ENVELOPE_VERSION || !ivPart || !ciphertextPart || !authTagPart || extra) {
    throw new Error("Invalid Google Calendar refresh-token envelope.");
  }

  try {
    const iv = Buffer.from(ivPart, "base64url");
    const ciphertext = Buffer.from(ciphertextPart, "base64url");
    const authTag = Buffer.from(authTagPart, "base64url");
    if (iv.length !== 12 || authTag.length !== 16 || ciphertext.length === 0) {
      throw new Error("Malformed envelope.");
    }

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    throw new Error("Google Calendar refresh-token envelope could not be decrypted.");
  }
}
