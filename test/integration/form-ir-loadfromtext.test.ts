/**
 * Integration gate: serialize a parsed real fixture and push it through the
 * actual import / LoadFromText path, asserting Access accepts it.
 *
 * This is the primary risk-reduction test for Slice 3 (form-ui-factory).
 * It validates that the serializer output is property-ordering-compatible with
 * Access LoadFromText, not just structurally correct in isolation.
 *
 * Requires: Windows + Access COM (MSACCESS.EXE) + the test .accdb reachable.
 * Skip automatically on non-Windows platforms or when pwsh is unavailable.
 */

import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { platform, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseFormTxt, serializeFormTxt } from "../../src/core/services/form-ir-service";

const REPO_ROOT = resolve(__dirname, "..", "..");
const SCRIPT_PATH = join(REPO_ROOT, "scripts", "dysflow-vba-manager.ps1");
const ACCESS_PATH = join(REPO_ROOT, "E2E_testing", "NoConformidades.accdb");
const FIXTURES_DIR = join(REPO_ROOT, "E2E_testing", "src", "forms");

const IS_WINDOWS = platform() === "win32";

interface SpawnResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

async function runPwsh(args: readonly string[]): Promise<SpawnResult> {
  return new Promise((resolvePromise) => {
    const child = spawn("pwsh", ["-NoProfile", "-NonInteractive", "-File", SCRIPT_PATH, ...args], {
      env: { ...process.env },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("close", (code) => {
      resolvePromise({ stdout, stderr, exitCode: code ?? -1 });
    });
  });
}

interface DysflowResultPayload {
  ok?: boolean;
  status?: string;
  module?: string;
  warnings?: Array<Record<string, unknown>>;
  error?: string;
}

function parseDysflowResult(stdout: string): DysflowResultPayload | null {
  for (const line of stdout.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.startsWith("DYSFLOW_RESULT ")) {
      try {
        return JSON.parse(trimmed.slice("DYSFLOW_RESULT ".length)) as DysflowResultPayload;
      } catch {
        return null;
      }
    }
  }
  return null;
}

describe.skipIf(!IS_WINDOWS)(
  "serializeFormTxt — LoadFromText integration gate",
  { timeout: 240_000 },
  () => {
    it("serialized frmBusy round-trips through Access LoadFromText without error", async () => {
      // 1. Parse + re-serialize frmBusy from the canonical fixture
      const fixturePath = join(FIXTURES_DIR, "Form_frmBusy.form.txt");
      const rawText = readFileSync(fixturePath, "utf8");
      const ir = parseFormTxt(rawText, { name: "frmBusy" });
      const serialized = serializeFormTxt(ir);

      // 2. Write the serialized content to a temp forms/ directory
      const tempDir = await mkdtemp(join(tmpdir(), "dysflow-loadfromtext-gate-"));
      const tempFormsDir = join(tempDir, "forms");
      const { mkdir } = await import("node:fs/promises");
      await mkdir(tempFormsDir, { recursive: true });
      const tempFormPath = join(tempFormsDir, "Form_frmBusy.form.txt");
      // Access LoadFromText uses ANSI (CP-1252). The PS1 handles encoding conversion,
      // but we write UTF-8 here (same as the source fixtures) since the PS1 reads
      // with [System.IO.File]::ReadAllText($src, [System.Text.Encoding]::UTF8).
      await writeFile(tempFormPath, serialized, "utf8");

      // 3. Import via the PS1 Import action — exercises the full LoadFromText path
      //    including Normalize-AccessDocumentTextForLoadFromText and the actual COM call.
      const result = await runPwsh([
        "-Action",
        "Import",
        "-AccessPath",
        ACCESS_PATH,
        "-DestinationRoot",
        tempDir,
        "-ModuleName",
        "frmBusy",
        "-Json",
      ]);

      // 4. Cleanup temp directory before assertions so a failure doesn't leave garbage
      await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);

      // 5. Assert Access accepted the serialized form
      //    exitCode 0 and ok:true are the only acceptable outcomes.
      expect(
        result.exitCode,
        `PS1 exited with ${result.exitCode}.\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
      ).toBe(0);

      const payload = parseDysflowResult(result.stdout);
      expect(payload, "DYSFLOW_RESULT missing from stdout").not.toBeNull();
      expect(
        payload?.ok || payload?.status === "ok",
        `Import reported ok:false. stdout: ${result.stdout}\nstderr: ${result.stderr}`,
      ).toBe(true);
    });
  },
);
