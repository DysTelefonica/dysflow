import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import type { DoctorCategoryCheck } from "./types.js";

/**
 * Issue #1057 (F9) — Category A: validate `.dysflow/project.json` schema,
 * path resolution, and conventions. Read-only; never opens Access.
 */
export function runProjectConfigChecks(cwd: string): DoctorCategoryCheck[] {
  const configPath = path.join(cwd, ".dysflow", "project.json");
  if (!existsSync(configPath)) {
    return [
      {
        ok: false,
        name: "project.json schema",
        message: `.dysflow/project.json not found at ${configPath}. Run \`dysflow setup --write-project\` to create it.`,
        severity: "critical",
      },
    ];
  }

  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(readFileSync(configPath, "utf8")) as Record<string, unknown>;
  } catch (error) {
    return [
      {
        ok: false,
        name: "project.json schema",
        message: `.dysflow/project.json is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
        severity: "critical",
      },
    ];
  }

  const checks: DoctorCategoryCheck[] = [];
  const missing = ["id", "accessPath", "destinationRoot"].filter(
    (field) => typeof raw[field] !== "string" || (raw[field] as string).length === 0,
  );
  checks.push(
    missing.length === 0
      ? {
          ok: true,
          name: "project.json schema",
          message: "all required fields present (id, accessPath, destinationRoot)",
          severity: "warning",
        }
      : {
          ok: false,
          name: "project.json schema",
          message: `missing required field(s): ${missing.join(", ")}`,
          severity: "critical",
        },
  );

  const accessPath =
    typeof raw.accessPath === "string" ? path.resolve(cwd, raw.accessPath) : undefined;
  if (accessPath !== undefined) {
    if (existsSync(accessPath)) {
      const sizeMb = (statSync(accessPath).size / (1024 * 1024)).toFixed(1);
      checks.push({
        ok: true,
        name: "accessPath resolves",
        message: `${accessPath} (${sizeMb} MB)`,
        severity: "warning",
      });
    } else {
      checks.push({
        ok: false,
        name: "accessPath resolves",
        message: `${accessPath} does not exist on disk`,
        severity: "critical",
      });
    }
  }

  const backendPath =
    typeof raw.backendPath === "string" ? path.resolve(cwd, raw.backendPath) : undefined;
  if (backendPath !== undefined) {
    checks.push(
      existsSync(backendPath)
        ? {
            ok: true,
            name: "backendPath resolves",
            message: backendPath,
            severity: "warning",
          }
        : {
            ok: false,
            name: "backendPath resolves",
            message: `${backendPath} does not exist on disk`,
            severity: "critical",
          },
    );
  }

  const destinationRoot =
    typeof raw.destinationRoot === "string" ? path.resolve(cwd, raw.destinationRoot) : undefined;
  if (destinationRoot !== undefined) {
    checks.push(
      existsSync(destinationRoot) && statSync(destinationRoot).isDirectory()
        ? {
            ok: true,
            name: "destinationRoot resolves",
            message: destinationRoot,
            severity: "warning",
          }
        : {
            ok: false,
            name: "destinationRoot resolves",
            message: `${destinationRoot} is not an existing directory`,
            severity: "critical",
          },
    );
  }

  if (typeof raw.id === "string" && raw.id.length > 0) {
    const conventional = /^[a-z0-9][a-z0-9-]*$/.test(raw.id);
    checks.push({
      ok: conventional,
      name: "projectId matches convention",
      message: conventional
        ? `'${raw.id}' (lowercase kebab-case)`
        : `'${raw.id}' does not match the lowercase kebab-case convention ([a-z0-9-])`,
      severity: "warning",
    });
  }

  const capabilities =
    typeof raw.capabilities === "object" && raw.capabilities !== null
      ? (raw.capabilities as Record<string, unknown>)
      : {};
  const policy = capabilities.writeExecutionPolicy;
  if (policy !== undefined) {
    const known = policy === "safe-by-default" || policy === "developer";
    checks.push({
      ok: known,
      name: "writeExecutionPolicy known",
      message: known
        ? `'${String(policy)}'`
        : `'${String(policy)}' is not a known policy (expected safe-by-default | developer)`,
      severity: "warning",
    });
  }

  return checks;
}
