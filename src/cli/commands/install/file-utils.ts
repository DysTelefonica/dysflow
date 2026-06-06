import { constants } from "node:fs";
import { access, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export function ensureObject(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function readJson(filePath: string): Promise<Record<string, unknown>> {
  let raw: string;
  try {
    raw = await readFile(filePath, "utf8");
  } catch (error: any) {
    if (error?.code === "ENOENT") {
      return {};
    }
    throw error;
  }
  try {
    const parsed = JSON.parse(raw);
    return ensureObject(parsed);
  } catch (error: any) {
    throw new Error(`Syntax error in JSON file ${filePath}: ${error.message}`);
  }
}

export async function writeFileAtomically(filePath: string, content: string): Promise<void> {
  const dir = path.dirname(filePath);
  await mkdir(dir, { recursive: true });
  const tempPath = `${filePath}.${Math.random().toString(36).slice(2)}.tmp`;
  await writeFile(tempPath, content, "utf8");
  try {
    await rename(tempPath, filePath);
  } catch (error) {
    // Clean up temp file on failure
    await writeFile(tempPath, "").catch(() => {});
    throw error;
  }
}

export async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFileAtomically(filePath, `${JSON.stringify(value, null, 2)}\n`);
}
