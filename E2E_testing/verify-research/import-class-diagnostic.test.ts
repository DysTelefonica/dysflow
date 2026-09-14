import { createHash } from "node:crypto";
import { access, cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { platform, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { VbaSyncAdapter } from "../../src/adapters/vba-sync/vba-sync-adapter.js";
import { noopPreflightCleanup } from "../../test/_helpers/noop-preflight-cleanup.js";

const REPO_ROOT = resolve(import.meta.dirname, "..", "..");
const FIXTURE_FRONT = join(REPO_ROOT, "E2E_testing", "NoConformidades.accdb");
const FIXTURE_BACK = join(REPO_ROOT, "E2E_testing", "NoConformidades_Datos.accdb");
const RESULT_PATH = join(
  REPO_ROOT,
  "E2E_testing",
  "verify-research",
  "results",
  "import-class-diagnostic.json",
);
const PASSWORD = process.env.ACCESS_VBA_PASSWORD ?? process.env.DYSFLOW_ACCESS_PASSWORD;

const classContentV1 = [
  "VERSION 1.0 CLASS",
  "BEGIN",
  "  MultiUse = -1  'True",
  "END",
  'Attribute VB_Name = "TempVerifyClass"',
  "Attribute VB_GlobalNameSpace = False",
  "Attribute VB_Creatable = False",
  "Attribute VB_PredeclaredId = False",
  "Attribute VB_Exposed = False",
  'Attribute VB_Description = "V1"',
  "Option Compare Database",
  "Option Explicit",
  "",
  "Public Sub Test()",
  "End Sub",
].join("\r\n");

async function sha256(path: string): Promise<string> {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

function sanitizeEnvelope(
  input: unknown,
  replacements: ReadonlyArray<readonly [string | undefined, string]>,
): unknown {
  const seen = new WeakSet<object>();

  const sanitizeString = (value: string): string => {
    let sanitized = value;
    for (const [secret, replacement] of replacements) {
      if (!secret) continue;
      sanitized = sanitized.replaceAll(secret, replacement);
      sanitized = sanitized.replaceAll(secret.replaceAll("\\", "/"), replacement);
    }
    return sanitized.length <= 4_000 ? sanitized : `${sanitized.slice(0, 4_000)}<truncated>`;
  };

  const visit = (value: unknown, depth: number): unknown => {
    if (depth > 12) return "<depth-limit>";
    if (typeof value === "string") return sanitizeString(value);
    if (value === null || typeof value !== "object") return value;
    if (seen.has(value)) return "<circular>";
    seen.add(value);

    if (Array.isArray(value)) {
      const bounded = value.slice(0, 100).map((entry) => visit(entry, depth + 1));
      if (value.length > 100) bounded.push(`<${value.length - 100} entries truncated>`);
      return bounded;
    }

    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 100)
        .map(([key, entry]) => [key, visit(entry, depth + 1)]),
    );
  };

  return visit(input, 0);
}

const skipReason =
  platform() !== "win32"
    ? "Windows is required"
    : !PASSWORD
      ? "ACCESS_VBA_PASSWORD or DYSFLOW_ACCESS_PASSWORD must be present"
      : undefined;

describe.skipIf(skipReason !== undefined)("single disposable class-import diagnostic", () => {
  it("captures one complete sanitized import envelope without retry or VBA execution", async () => {
    await access(FIXTURE_FRONT);
    await access(FIXTURE_BACK);

    const sourceVersion = JSON.parse(await readFile(join(REPO_ROOT, "package.json"), "utf8"))
      .version as string;
    const beforeHashes = {
      frontend: await sha256(FIXTURE_FRONT),
      backend: await sha256(FIXTURE_BACK),
    };
    const tempWorkspace = await mkdtemp(join(tmpdir(), "dysflow-verify-import-diagnostic-"));
    const copiedFrontend = join(tempWorkspace, "NoConformidades.accdb");
    const copiedBackend = join(tempWorkspace, "NoConformidades_Datos.accdb");
    const destinationRoot = join(tempWorkspace, "src");
    const tempClassPath = join(destinationRoot, "modules", "TempVerifyClass.cls");
    const startedAt = new Date().toISOString();
    const startMs = Date.now();
    let capturedStage: "list_objects" | "import_modules" = "list_objects";
    let sanitizedResult: unknown;
    let cleanupStatus: "pending" | "removed" | "failed" = "pending";

    try {
      await cp(FIXTURE_FRONT, copiedFrontend);
      await cp(FIXTURE_BACK, copiedBackend);
      await mkdir(join(destinationRoot, "modules"), { recursive: true });
      await writeFile(tempClassPath, classContentV1, "utf8");

      const service = new VbaSyncAdapter({
        preflightCleanup: noopPreflightCleanup(),
        accessPath: copiedFrontend,
        destinationRoot,
        cwd: REPO_ROOT,
        accessPassword: PASSWORD,
        timeoutMs: 90_000,
      });
      const replacements: ReadonlyArray<readonly [string | undefined, string]> = [
        [PASSWORD, "<credential-redacted>"],
        [tempWorkspace, "<temp-workspace>"],
        [REPO_ROOT, "<repo-root>"],
        [process.env.USERPROFILE, "<user-profile>"],
        [FIXTURE_FRONT, "<golden-frontend>"],
        [FIXTURE_BACK, "<golden-backend>"],
      ];

      const listResult = await service.execute("list_objects", {});
      if (!listResult.ok) {
        sanitizedResult = sanitizeEnvelope(listResult, replacements);
      } else {
        capturedStage = "import_modules";
        const importResult = await service.execute("import_modules", {
          moduleNames: ["TempVerifyClass"],
          importMode: "Code",
          apply: true,
        });
        sanitizedResult = sanitizeEnvelope(importResult, replacements);
      }
    } finally {
      try {
        await rm(tempWorkspace, { recursive: true, force: true });
        cleanupStatus = "removed";
      } catch {
        cleanupStatus = "failed";
      }
    }

    const afterHashes = {
      frontend: await sha256(FIXTURE_FRONT),
      backend: await sha256(FIXTURE_BACK),
    };
    const artifact = {
      schemaVersion: "verify-research.import-diagnostic/v1",
      generatedAt: new Date().toISOString(),
      startedAt,
      sourceVersion,
      operation: capturedStage,
      elapsedMs: Date.now() - startMs,
      passwordPresent: true,
      passwordLogged: false,
      goldenHashes: { before: beforeHashes, after: afterHashes },
      goldenUnchanged:
        beforeHashes.frontend === afterHashes.frontend && beforeHashes.backend === afterHashes.backend,
      tempCleanup: cleanupStatus,
      applicationDataOperationRequested: false,
      backendRelinkVerified: false,
      topologyIsolationClaimed: false,
      startupOrVbaExecutionRequested: false,
      retryCount: 0,
      result: sanitizedResult,
    };

    await mkdir(resolve(RESULT_PATH, ".."), { recursive: true });
    await writeFile(RESULT_PATH, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");

    expect(capturedStage).toBe("import_modules");
    expect(sanitizedResult).toBeDefined();
    expect(artifact.goldenUnchanged).toBe(true);
    expect(cleanupStatus).toBe("removed");
  }, 180_000);
});
