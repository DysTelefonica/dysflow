delete process.env.DYSFLOW_HOME;

/**
 * Regression test: form import with stale CodeBehindForm section.
 *
 * When importing a form with importMode "Auto", dysflow runs two phases:
 *   Phase 1 — LoadFromText from the .form.txt (compiles the embedded CodeBehindForm)
 *   Phase 2 — CodeModule.DeleteLines + AddFromFile from the sibling .cls (canonical code wins)
 *
 * This test verifies that, after importMode "Auto", the re-exported .cls reflects the
 * .cls source — NOT the stale CodeBehindForm embedded in the .form.txt.
 *
 * Covered scenarios:
 *   - importMode "Auto" (the regression surface: Phase 1 runs, Phase 2 must win)
 *   - importMode "Auto" + compile:true (compile after stale CodeBehindForm overwrite must succeed)
 *   - importMode "Code" (control case: only the .cls is used; CodeBehindForm is not involved)
 */
import { execFileSync, spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const cliCommand =
  process.env.DYSFLOW_E2E_COMMAND ?? join(repoRoot, "test-runtime", "bin", "dysflow.cmd");
const fixtureFront = join(repoRoot, "E2E_testing", "NoConformidades.accdb");
const fixtureBackend = join(repoRoot, "E2E_testing", "NoConformidades_Datos.accdb");

// The form under test — simple, has both .cls and .form.txt with a CodeBehindForm section.
const FORM_NAME = "Form_frmBusy";

// Unique marker strings used to distinguish canonical .cls code from stale CodeBehindForm code.
const CANONICAL_CLS_MARKER = "' CANONICAL_CLS_MARKER";
const STALE_CODEBEHIND_MARKER = "' STALE_CODEBEHIND_MARKER";

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

function hasAccessCom(): boolean {
  try {
    const output = execFileSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "try { $a = New-Object -ComObject Access.Application; $a.Quit(); 'ok' } catch { 'missing' }",
      ],
      { encoding: "utf8", windowsHide: true, timeout: 20_000 },
    );
    return output.includes("ok");
  } catch {
    return false;
  }
}

const canRunE2e =
  existsSync(cliCommand) &&
  existsSync(fixtureFront) &&
  existsSync(fixtureBackend) &&
  hasAccessCom() &&
  (process.env.ACCESS_VBA_PASSWORD ?? process.env.DYSFLOW_ACCESS_PASSWORD) !== undefined;

if (!canRunE2e) {
  console.warn(
    "[form-codebehind-stale-import] Skipping: DYSFLOW_E2E_COMMAND, E2E_testing/*.accdb, " +
      "Access COM, or ACCESS_VBA_PASSWORD are unavailable.",
  );
}

// ---------------------------------------------------------------------------
// Workspace
// ---------------------------------------------------------------------------

const workspaceRoot = join(tmpdir(), `dysflow-stale-codebehind-e2e-${process.pid}-${Date.now()}`);
const projectId = "dysflow-stale-codebehind-e2e";

function setupWorkspace(): void {
  mkdirSync(join(workspaceRoot, ".dysflow"), { recursive: true });
  mkdirSync(join(workspaceRoot, "src", "forms"), { recursive: true });

  cpSync(fixtureFront, join(workspaceRoot, "NoConformidades.accdb"));
  cpSync(fixtureBackend, join(workspaceRoot, "NoConformidades_Datos.accdb"));

  writeFileSync(
    join(workspaceRoot, ".dysflow", "project.json"),
    `${JSON.stringify(
      {
        id: projectId,
        accessPath: "NoConformidades.accdb",
        backendPath: "NoConformidades_Datos.accdb",
        destinationRoot: "src",
        allowWrites: true,
        timeoutMs: 120_000,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  // -------------------------------------------------------------------------
  // Prepare the stale .form.txt
  //
  // Read the real fixture, locate the "CodeBehindForm" marker, and replace
  // everything from that line onward with a stale section that contains
  // STALE_CODEBEHIND_MARKER.  This simulates an out-of-date .form.txt whose
  // embedded CodeBehindForm has old (stale) code.
  // -------------------------------------------------------------------------
  const realFormTxt = join(repoRoot, "E2E_testing", "src", "forms", `${FORM_NAME}.form.txt`);
  const formTxtContent = readFileSync(realFormTxt, "utf8");
  const cbfIndex = formTxtContent.indexOf("\nCodeBehindForm");
  if (cbfIndex === -1) {
    throw new Error(
      `${FORM_NAME}.form.txt does not contain a CodeBehindForm section — pick a different form`,
    );
  }
  // Keep everything up to and including the "CodeBehindForm" line, then
  // replace the rest with a minimal stale code section that contains the marker.
  const formTxtHeader = formTxtContent.slice(0, cbfIndex);
  const staleCodeBehind = [
    "",
    "CodeBehindForm",
    "Attribute VB_GlobalNameSpace = False",
    "Attribute VB_Creatable = True",
    "Attribute VB_PredeclaredId = True",
    "Attribute VB_Exposed = False",
    STALE_CODEBEHIND_MARKER,
    "Option Compare Database",
    "Option Explicit",
    "",
    "' This stale code was injected by the regression test.",
    "' Phase 2 of Auto import must overwrite this with the canonical .cls content.",
    "Private Sub Form_Open(Cancel As Integer)",
    "    ' STALE: This sub must NOT appear in the exported .cls after Auto import.",
    "End Sub",
    "",
  ].join("\r\n");
  const patchedFormTxt = formTxtHeader + staleCodeBehind;
  writeFileSync(
    join(workspaceRoot, "src", "forms", `${FORM_NAME}.form.txt`),
    patchedFormTxt,
    "utf8",
  );

  // -------------------------------------------------------------------------
  // Prepare the canonical .cls
  //
  // Use the real fixture .cls and prepend the CANONICAL_CLS_MARKER comment so
  // assertions can distinguish between the two code paths.
  // -------------------------------------------------------------------------
  const realCls = join(repoRoot, "E2E_testing", "src", "forms", `${FORM_NAME}.cls`);
  const clsContent = readFileSync(realCls, "utf8");
  const canonicalCls = `${CANONICAL_CLS_MARKER}\r\n${clsContent}`;
  writeFileSync(join(workspaceRoot, "src", "forms", `${FORM_NAME}.cls`), canonicalCls, "utf8");
}

// ---------------------------------------------------------------------------
// MCP helper (verbatim copy from import-modules-regression.e2e.test.ts)
// ---------------------------------------------------------------------------

interface McpToolResponse {
  ok: boolean;
  isError: boolean;
  text: string;
  timedOut: boolean;
}

async function callMcp(
  toolName: string,
  args: Record<string, unknown>,
  options: { timeoutMs?: number; cwd?: string } = {},
): Promise<McpToolResponse> {
  const timeoutMs = options.timeoutMs ?? 30_000;
  const cwd = options.cwd ?? workspaceRoot;
  return await new Promise((resolveCall) => {
    const child = spawn(cliCommand, ["mcp"], {
      cwd,
      shell: true,
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        ACCESS_VBA_PASSWORD: process.env.ACCESS_VBA_PASSWORD ?? process.env.DYSFLOW_ACCESS_PASSWORD,
        DYSFLOW_ACCESS_PASSWORD:
          process.env.ACCESS_VBA_PASSWORD ?? process.env.DYSFLOW_ACCESS_PASSWORD,
        DYSFLOW_BACKEND_PASSWORD:
          process.env.ACCESS_VBA_PASSWORD ?? process.env.DYSFLOW_BACKEND_PASSWORD,
      },
    });
    let buf = "";
    let settled = false;
    const finish = (r: McpToolResponse) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        child.stdin.end();
      } catch {
        /* ignore */
      }
      try {
        child.kill();
      } catch {
        /* ignore */
      }
      resolveCall(r);
    };
    const timer = setTimeout(() => {
      finish({ ok: false, isError: true, text: "MCP timeout", timedOut: true });
    }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      buf += chunk.toString();
      const nl = buf.lastIndexOf("\n");
      if (nl < 0) return;
      for (const l of buf.slice(0, nl).split("\n")) {
        const s = l.trim();
        if (!s) continue;
        try {
          const m = JSON.parse(s) as {
            id: number;
            result?: { content: Array<{ type: string; text?: string }>; isError?: boolean };
            error?: unknown;
          };
          if (m.id !== 3) continue;
          const text = m.result?.content?.map((c) => c.text ?? "").join("\n") ?? "";
          const isError = Boolean(m.error ?? m.result?.isError);
          finish({ ok: !isError, isError, text, timedOut: false });
          return;
        } catch {
          /* keep reading */
        }
      }
    });
    child.on("error", (e) =>
      finish({ ok: false, isError: true, text: e.message, timedOut: false }),
    );
    child.on("close", () => {
      if (!settled) finish({ ok: false, isError: true, text: "MCP closed", timedOut: false });
    });
    child.stdin.write(
      `${JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "tool-e2e", version: "1" },
        },
      })}\n`,
    );
    child.stdin.write(
      `${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} })}\n`,
    );
    child.stdin.write(
      `${JSON.stringify({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: toolName, arguments: args },
      })}\n`,
    );
  });
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe.skipIf(!canRunE2e)(
  "form-codebehind-stale-import: Phase 2 (.cls) must win over stale CodeBehindForm",
  () => {
    beforeAll(() => {
      setupWorkspace();
    });

    afterAll(() => {
      try {
        rmSync(workspaceRoot, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    });

    it('importMode "Auto": re-exported .cls reflects the .cls source, not the stale CodeBehindForm', async () => {
      // Phase 1 — import the form (LoadFromText from .form.txt, then AddFromFile from .cls).
      const importResult = await callMcp(
        // feat-759-no-compile (v1.19.0) — `compile` parameter is gone;
        // the import persists via save-only (acCmdSaveAllModules = 280).
        "import_modules",
        {
          projectId,
          moduleNames: [FORM_NAME],
          importMode: "Auto",
          dryRun: false,
        },
        { timeoutMs: 90_000 },
      );
      expect(importResult.timedOut, `import timed out: ${importResult.text}`).toBe(false);
      expect(importResult.isError, `import failed: ${importResult.text}`).toBe(false);
      expect(importResult.ok, `import not ok: ${importResult.text}`).toBe(true);

      // Phase 2 — export the form so we can read what Access has stored.
      // export_modules writes to src/forms/ inside the workspace (destinationRoot = "src").
      const exportResult = await callMcp(
        "export_modules",
        {
          projectId,
          moduleNames: [FORM_NAME],
        },
        { timeoutMs: 60_000 },
      );
      expect(exportResult.timedOut, `export timed out: ${exportResult.text}`).toBe(false);
      expect(exportResult.isError, `export failed: ${exportResult.text}`).toBe(false);
      expect(exportResult.ok, `export not ok: ${exportResult.text}`).toBe(true);

      // Read the re-exported .cls from the workspace filesystem.
      const exportedClsPath = join(workspaceRoot, "src", "forms", `${FORM_NAME}.cls`);
      expect(existsSync(exportedClsPath), `Expected exported .cls at ${exportedClsPath}`).toBe(
        true,
      );
      const exportedCls = readFileSync(exportedClsPath, "utf8");

      // Assert: the canonical .cls marker must be present — Phase 2 won.
      expect(
        exportedCls,
        `Expected CANONICAL_CLS_MARKER in exported .cls — Phase 2 (.cls) must overwrite Phase 1 (CodeBehindForm)`,
      ).toContain(CANONICAL_CLS_MARKER);

      // Assert: the stale CodeBehindForm marker must NOT be present — Phase 1 code was replaced.
      expect(
        exportedCls,
        `Expected STALE_CODEBEHIND_MARKER to be absent from exported .cls — Phase 2 must have won`,
      ).not.toContain(STALE_CODEBEHIND_MARKER);

      // NOTE (issue #646): a VB_Name-survives-import assertion was evaluated here but
      // dropped — export_modules writes a form/report .cls from
      // `CodeModule.Lines(1, CodeModule.CountOfLines)` (dysflow-vba-manager.ps1), and the
      // VBE `CodeModule.Lines` API never returns `Attribute` statements (they are
      // metadata, not code lines). So the exported .cls can NEVER contain
      // `Attribute VB_Name`, regardless of whether import normalization preserves it —
      // this artifact cannot verify the fix. The Pester suite
// (scripts/tests/dysflow-vba-manager.Tests.ps1, `Normalize-VbaImportText`
      // context) is the primary pinning seam for VB_Name reaching `AddFromFile`.
    }, 180_000);

    // feat-759-no-compile (v1.19.0) — the
    // 'importMode "Auto" + compile:true: form import does NOT hard-fail;
    // compile is reported unverified (#543)' atom was deleted. The compile
    // step is gone from the runtime; the form-import path now persists via
    // save-only (acCmdSaveAllModules = RunCommand 280) without a separate
    // compile gate.

    it('importMode "Code": re-exported .cls reflects the .cls source (control case)', async () => {
      // importMode "Code" uses only the .cls — the .form.txt CodeBehindForm is not involved.
      // This is a control: the canonical marker must still be present regardless.
      const importResult = await callMcp(
        "import_modules",
        {
          projectId,
          moduleNames: [FORM_NAME],
          importMode: "Code",
          dryRun: false,
          // feat-759-no-compile (v1.19.0) — `compile` parameter removed.
        },
        { timeoutMs: 90_000 },
      );
      expect(importResult.timedOut, `import timed out: ${importResult.text}`).toBe(false);
      expect(importResult.isError, `import failed: ${importResult.text}`).toBe(false);
      expect(importResult.ok, `import not ok: ${importResult.text}`).toBe(true);

      const exportResult = await callMcp(
        "export_modules",
        {
          projectId,
          moduleNames: [FORM_NAME],
        },
        { timeoutMs: 60_000 },
      );
      expect(exportResult.timedOut, `export timed out: ${exportResult.text}`).toBe(false);
      expect(exportResult.isError, `export failed: ${exportResult.text}`).toBe(false);
      expect(exportResult.ok, `export not ok: ${exportResult.text}`).toBe(true);

      const exportedClsPath = join(workspaceRoot, "src", "forms", `${FORM_NAME}.cls`);
      expect(existsSync(exportedClsPath), `Expected exported .cls at ${exportedClsPath}`).toBe(
        true,
      );
      const exportedCls = readFileSync(exportedClsPath, "utf8");

      // Assert: the canonical .cls content was used (Code mode reads only .cls).
      expect(
        exportedCls,
        `Expected CANONICAL_CLS_MARKER in exported .cls — importMode Code must use the .cls`,
      ).toContain(CANONICAL_CLS_MARKER);
    }, 180_000);
  },
);
