import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";

export const REDACTED_SECRET = "[REDACTED]";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function stringValue(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function truthy(value: unknown): boolean {
  return value === true || value === "true" || value === 1 || value === "1";
}

export function sanitizeSecrets(value: string, secrets: readonly string[]): string {
  let result = value;
  for (const secret of secrets) {
    if (secret.length === 0) continue;
    result = result.split(secret).join(REDACTED_SECRET);
  }
  return result;
}

export function readJsonFileSync<T>(path: string): T {
  const raw = readFileSync(path, "utf8");
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error(`Invalid JSON file: ${path}`);
  }
}

export async function readJsonFileAsync<T>(path: string): Promise<T> {
  const raw = await readFile(path, "utf8");
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error(`Invalid JSON file: ${path}`);
  }
}
