import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
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
  if (/^\d+$/.test(lines[0])) return lines[1];
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

export function isSafeToDelete(dirPath: string, env: NodeJS.ProcessEnv): boolean {
  const resolved = path.resolve(dirPath);
  const normalized = resolved.replace(/\\/g, "/").toLowerCase();

  // Guard against empty, null, or root paths
  if (!normalized || normalized.length <= 4) {
    return false;
  }

  const systemPaths = [
    env.SystemDrive ? path.join(env.SystemDrive, "/") : "c:/",
    env.SystemRoot ? path.resolve(env.SystemRoot) : "c:/windows",
    env.ProgramData ? path.resolve(env.ProgramData) : "c:/programdata",
    env.ProgramFiles ? path.resolve(env.ProgramFiles) : "c:/program files",
    env.ProgramFilesX86 ? path.resolve(env.ProgramFilesX86) : "c:/program files (x86)",
    env.USERPROFILE ? path.resolve(env.USERPROFILE) : "",
    env.HOME ? path.resolve(env.HOME) : "",
    env.LOCALAPPDATA ? path.resolve(env.LOCALAPPDATA) : "",
    env.APPDATA ? path.resolve(env.APPDATA) : "",
    env.TEMP ? path.resolve(env.TEMP) : "",
    env.TMP ? path.resolve(env.TMP) : "",
    tmpdir() ? path.resolve(tmpdir()) : "",
  ].filter(Boolean).map(p => path.resolve(p).replace(/\\/g, "/").toLowerCase());

  // Add user folders
  const usersDir = path.resolve(env.SystemDrive ?? "C:", "Users").replace(/\\/g, "/").toLowerCase();
  systemPaths.push(usersDir);
  systemPaths.push("c:/users");
  systemPaths.push("/home");
  systemPaths.push("/");

  // Add standard profile subfolders to systemPaths
  const userProfile = env.USERPROFILE || env.HOME;
  if (userProfile) {
    const resolvedProfile = path.resolve(userProfile);
    const subfolders = ["documents", "desktop", "downloads", "pictures", "music", "videos"];
    for (const sub of subfolders) {
      systemPaths.push(path.join(resolvedProfile, sub).replace(/\\/g, "/").toLowerCase());
    }
  }

  const systemPathsSet = new Set(systemPaths.map(p => p.replace(/\/$/, "")));

  for (const sysDir of systemPathsSet) {
    if (sysDir === normalized || sysDir.startsWith(normalized + "/")) {
      return false;
    }
  }

  return true;
}
