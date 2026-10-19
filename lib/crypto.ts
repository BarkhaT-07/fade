import { randomBytes, createCipheriv, createDecipheriv } from "crypto";

function getKey(): Buffer {
  const hex = process.env.NOTE_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error(
      "NOTE_KEY is missing or invalid. Set a 64-character hex string in .env " +
        "(generate one with: openssl rand -hex 32)"
    );
  }
  return Buffer.from(hex, "hex");
}

export function encryptText(plainText: string): string {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plainText, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decryptText(payload: string): string {
  const key = getKey();
  const buf = Buffer.from(payload, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ciphertext = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}
