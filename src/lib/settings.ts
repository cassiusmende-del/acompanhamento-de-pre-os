import { randomBytes } from "node:crypto";
import type { PrismaClient } from "@/generated/prisma/client";

export const SETTING_KEYS = {
  extensionToken: "extension_token",
  captureDedupeMinutes: "capture_dedupe_minutes",
} as const;

export const DEFAULT_CAPTURE_DEDUPE_MINUTES = 30;

export async function getSetting<T>(db: PrismaClient, key: string): Promise<T | null> {
  const row = await db.setting.findUnique({ where: { key } });
  return row ? (row.value as T) : null;
}

export async function setSetting(db: PrismaClient, key: string, value: unknown): Promise<void> {
  const json = value as object;
  await db.setting.upsert({
    where: { key },
    create: { key, value: json },
    update: { value: json },
  });
}

function newToken(): string {
  return randomBytes(24).toString("base64url");
}

/** Token que a extensão envia em cada requisição. Criado na primeira vez que é pedido. */
export async function getOrCreateExtensionToken(db: PrismaClient): Promise<string> {
  const existing = await getSetting<string>(db, SETTING_KEYS.extensionToken);
  if (existing) return existing;
  const token = newToken();
  await setSetting(db, SETTING_KEYS.extensionToken, token);
  return token;
}

export async function regenerateExtensionToken(db: PrismaClient): Promise<string> {
  const token = newToken();
  await setSetting(db, SETTING_KEYS.extensionToken, token);
  return token;
}

export async function getCaptureDedupeMinutes(db: PrismaClient): Promise<number> {
  const value = await getSetting<number>(db, SETTING_KEYS.captureDedupeMinutes);
  return typeof value === "number" && value >= 0 ? value : DEFAULT_CAPTURE_DEDUPE_MINUTES;
}
