import { logSwallowedIoError } from "../utils/log-swallowed-io-error.js";
import type { OsProcessInfo } from "./access-operation-cleanup.js";

export const PROCESS_INSPECTOR_TIMEOUT_MS = 5_000;

const DMTF_PATTERN = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\.(\d{6})([+-]\d{3})$/;

export function parseCimDateTimeToIso(value: string | null | undefined): string {
  if (value == null || value.length === 0) return "";

  const match = DMTF_PATTERN.exec(value);
  if (match === null) {
    // Not DMTF — check if it already looks like ISO 8601; pass through or return empty
    if (/^\d{4}-\d{2}-\d{2}T/.test(value)) return value;
    return "";
  }

  const [, year, month, day, hour, minute, second, microseconds, offsetRaw] = match;
  if (offsetRaw === undefined) return "";
  const ms = Math.floor(Number(microseconds) / 1000);
  const msStr = String(ms).padStart(3, "0");

  // Convert offset "+ooo" / "-ooo" (minutes-from-UTC as 3 digits) to ISO offset
  const sign = offsetRaw[0];
  if (sign === undefined) return "";
  const offsetMinutes = Number(offsetRaw.slice(1));
  if (offsetMinutes === 0) {
    return `${year}-${month}-${day}T${hour}:${minute}:${second}.${msStr}Z`;
  }

  const offsetHours = Math.floor(offsetMinutes / 60);
  const offsetMins = offsetMinutes % 60;
  const isoOffset = `${sign}${String(offsetHours).padStart(2, "0")}:${String(offsetMins).padStart(2, "0")}`;
  return `${year}-${month}-${day}T${hour}:${minute}:${second}.${msStr}${isoOffset}`;
}

function normalizeMainWindowHandle(value: unknown): number | undefined {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value >= 0 ? value : undefined;
  }
  if (value === null || typeof value !== "object") {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const nestedValue = record.Value ?? record.value;
  return typeof nestedValue === "number" && Number.isSafeInteger(nestedValue) && nestedValue >= 0
    ? nestedValue
    : undefined;
}

export function normalizeProcessList(stdout: string): OsProcessInfo[] {
  if (stdout.trim().length === 0) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch (err) {
    logSwallowedIoError("windows-processes:normalize-process-list", err);
    return [];
  }
  if (parsed === null || typeof parsed !== "object") {
    return [];
  }
  const rawList = Array.isArray(parsed) ? parsed : [parsed];
  const results: OsProcessInfo[] = [];
  for (const item of rawList) {
    if (item === null || typeof item !== "object") {
      continue;
    }
    const p = item as Record<string, unknown>;
    const pid = p.ProcessId;
    const name = p.Name;
    if (typeof pid !== "number" || typeof name !== "string") {
      continue;
    }
    const creationDate = typeof p.CreationDate === "string" ? p.CreationDate : undefined;
    const commandLine = typeof p.CommandLine === "string" ? p.CommandLine : undefined;
    const startTime = creationDate ? parseCimDateTimeToIso(creationDate) : undefined;
    const mainWindowHandle = normalizeMainWindowHandle(p.MainWindowHandle);
    results.push({
      pid,
      name,
      startTime: startTime || undefined,
      commandLine: commandLine || undefined,
      mainWindowHandle,
    });
  }
  return results;
}
