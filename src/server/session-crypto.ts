import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { z } from "zod";

const tokens = z.strictObject({ accessToken: z.string().min(1), refreshToken: z.string().min(1) });
export const newSessionToken = () => randomBytes(32).toString("base64url");
export const hashSessionToken = (token: string) => createHash("sha256").update(token).digest("hex");

export function encryptTokens(value: z.infer<typeof tokens>, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(tokens.parse(value)), "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function decryptTokens(value: string, key: Buffer): z.infer<typeof tokens> {
  const [version, iv, tag, ciphertext, extra] = value.split(".");
  if (version !== "v1" || !iv || !tag || !ciphertext || extra !== undefined) throw new Error("Invalid token envelope.");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return tokens.parse(JSON.parse(Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()
  ]).toString("utf8")));
}
