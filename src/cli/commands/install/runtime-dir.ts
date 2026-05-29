import { readFileSync } from "node:fs";
import path from "node:path";

export const RUNTIME_MARKER_FILE = ".dysflow-marker";
export const RUNTIME_MARKER_VERSION = "1";
export const RUNTIME_MARKER_PATH_ENV = "DYSFLOW_RUNTIME_MARKER_PATH";

export function getSystemMarkerPath(env: NodeJS.ProcessEnv): string {
  const explicitMarkerPath = env[RUNTIME_MARKER_PATH_ENV];
  if (explicitMarkerPath !== undefined && explicitMarkerPath.trim().length > 0) {
    return path.resolve(explicitMarkerPath);
  }

  const programData = env.ProgramData ?? path.join(env.SystemDrive ?? "C:", "ProgramData");
  return path.join(programData, "dysflow", RUNTIME_MARKER_FILE);
}

export function parseRuntimeMarker(content: string): string | undefined {
  const lines = content
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) return undefined;
  if (lines[0] === RUNTIME_MARKER_VERSION) return lines[1];
  return lines[0];
}

export function resolveRuntimeDir(
  runtimeOverride: string | undefined,
  env: NodeJS.ProcessEnv,
): string {
  if (runtimeOverride !== undefined) {
    return path.resolve(runtimeOverride);
  }

  if (env.DYSFLOW_HOME !== undefined && env.DYSFLOW_HOME.trim().length > 0) {
    return path.resolve(env.DYSFLOW_HOME);
  }

  const markerPath = getSystemMarkerPath(env);
  try {
    const markedRuntimeDir = parseRuntimeMarker(readFileSync(markerPath, "utf8"));
    if (markedRuntimeDir !== undefined) {
      return path.resolve(markedRuntimeDir);
    }
  } catch {
    // Marker not found or unreadable — fall through to default
  }

  const localAppData =
    env.LOCALAPPDATA ?? path.join(env.USERPROFILE ?? env.HOME ?? "", "AppData", "Local");

  return path.join(localAppData, "dysflow");
}
