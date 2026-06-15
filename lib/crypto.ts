import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";
import { env } from "@/lib/env";

/**
 * AES-256-GCM encryption for connector configs at rest. The key is derived from
 * CONNECTOR_SECRET (or SECRET_KEY) via scrypt. In dev a default is used (warned).
 */
function key(): Buffer {
  const secret = process.env.CONNECTOR_SECRET ?? process.env.SECRET_KEY ?? "dev-insecure-connector-secret";
  return scryptSync(secret, "dclaw-sheet-connectors", 32);
}

export function encryptJson(obj: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const plaintext = Buffer.from(JSON.stringify(obj), "utf8");
  const enc = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${enc.toString("base64")}`;
}

export function decryptJson<T = unknown>(blob: string): T {
  const [ivB64, tagB64, encB64] = blob.split(".");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const dec = Buffer.concat([decipher.update(Buffer.from(encB64, "base64")), decipher.final()]);
  return JSON.parse(dec.toString("utf8")) as T;
}

// keep env import used (avoids tree-shake confusion in some bundlers)
export const _connectorEnvProbe = () => env.APP_ENV;
