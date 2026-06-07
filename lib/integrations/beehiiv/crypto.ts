// lib/integrations/beehiiv/crypto.ts
//
// Application-layer encryption for Beehiiv OAuth tokens (AES-256-GCM). Avoids the
// pgsodium EXECUTE-permission issues of DB column encryption. The key is derived
// from BEEHIIV_TOKEN_ENC_KEY (any non-empty secret) via scrypt, so the env value
// doesn't have to be exactly 32 bytes. Ciphertext format: "v1:iv:tag:data" (base64).

import crypto from "node:crypto";

function key(): Buffer {
  const secret = process.env.BEEHIIV_TOKEN_ENC_KEY;
  if (!secret) throw new Error("BEEHIIV_TOKEN_ENC_KEY is not set");
  return crypto.scryptSync(secret, "beehiiv-oauth-v1", 32);
}

export function encryptToken(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
}

export function decryptToken(ciphertext: string): string {
  const parts = ciphertext.split(":");
  if (parts.length !== 4 || parts[0] !== "v1") throw new Error("invalid Beehiiv token ciphertext format");
  const iv = Buffer.from(parts[1], "base64");
  const tag = Buffer.from(parts[2], "base64");
  const data = Buffer.from(parts[3], "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}
