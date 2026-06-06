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

const DAO_CONNECT_PWD_PATTERN = /;PWD=[^;]*/gi;

export function sanitizeConnectStrings(value: string): string {
  return value.replace(DAO_CONNECT_PWD_PATTERN, "");
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

/**
 * Heuristic check — not a security boundary.
 * Returns true if sql looks like a single SELECT or read-only CTE (WITH ... SELECT).
 * Denies write keywords (insert, update, delete, create, drop, alter, truncate, into, exec, execute, grant, revoke).
 */
export function looksLikeReadOnlySql(sql: string): boolean {
  // Step 1: strip line comments and block comments
  const withoutComments = sql
    .replace(/--.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .trim()
    .toLowerCase();

  // Step 2: strip string literals so that ; or keywords inside them are invisible
  const tokenized = withoutComments.replace(/'([^']|'')*'/g, "''").replace(/"([^"]|"")*"/g, '""');

  // Step 3: split on top-level semicolons and filter empty fragments
  const statements = tokenized
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  // Step 4: must be exactly one non-empty statement
  if (statements.length !== 1) return false;

  const stmt = statements[0];
  if (stmt === undefined) return false;
  const firstToken = stmt.match(/^[a-z]+/)?.[0];
  if (firstToken !== "select" && firstToken !== "with") return false;

  // Step 5: block DDL/DML write keywords
  const forbiddenKeywords =
    /\b(insert|update|delete|create|drop|alter|truncate|into|exec|execute|grant|revoke)\b/;
  if (forbiddenKeywords.test(tokenized)) return false;

  // Step 6: CTE queries must contain at least one SELECT
  if (firstToken === "with" && !/\bselect\b/.test(tokenized)) return false;

  return true;
}

export function detectWriteSqlKeyword(sql: string): string | undefined {
  if (looksLikeReadOnlySql(sql)) return undefined;
  const match = sql
    .toLowerCase()
    .match(/\b(insert|update|delete|create|drop|alter|truncate|into|exec|execute|grant|revoke)\b/);
  const matchVal = match?.[1];
  return matchVal !== undefined
    ? matchVal.toUpperCase()
    : (sql.trim().split(/\s+/)[0]?.toUpperCase() ?? "");
}

export * from "./path-utils.js";
