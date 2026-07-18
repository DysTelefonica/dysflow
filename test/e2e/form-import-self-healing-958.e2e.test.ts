delete process.env.DYSFLOW_HOME;

/**
 * Issue #958 E2E — self-healing form import + structural quality gate,
 * exercised against a REAL Access binary through the packaged CLI.
 *
 * Scenario A (self-healing): a legacy `.form.txt` (the fixture with its
 * `AutoResize = NotDefault` root marker REMOVED, simulating a pre-v2.14.0
 * export) is imported with `import_modules`. The import must succeed, and the
 * subsequent `export_modules` round-trip must show the marker restored right
 * after `Begin Form` with the form's control tree intact — proving the text
 * was canonicalized BEFORE LoadFromText instead of breaking the binary form.
 *
 * Scenario B (fail-closed gate): a structurally broken `.form.txt`
 * (unbalanced Begin/End) must be rejected with FORM_SOURCE_MALFORMED without
 * ever reaching Access.
 *
 * Run with: vitest run -c vitest.integration.config.ts test/e2e/form-import-self-healing-958.e2e.test.ts
 * Requires: DYSFLOW_E2E_COMMAND (or test-runtime/bin/dysflow.cmd),
 *           E2E_testing/*.accdb fixtures, Access COM, ACCESS_VBA_PASSWORD.
 */
import { execFileSync, spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createGitOwnedE2eWorkspace } from "../integration/_helpers/git-owned-e2e-workspace";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const cliCommand =
  process.env.DYSFLOW_E2E_COMMAND ?? join(repoRoot, "test-runtime", "bin", "dysflow.cmd");
const fixtureFront = join(repoRoot, "E2E_testing", "NoConformidades.accdb");
const fixtureBackend = join(repoRoot, "E2E_testing", "NoConformidades_Datos.accdb");

const FORM_NAME = "Form_frmBusy";
const BROKEN_FORM_NAME = "Form_Roto958";

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
    "[form-import-self-healing-958] Skipping: DYSFLOW_E2E_COMMAND, E2E_testing/*.accdb, " +
      "Access COM, or ACCESS_VBA_PASSWORD are unavailable.",
  );
}

const ownedWorkspace = canRunE2e
  ? createGitOwnedE2eWorkspace(repoRoot, "self-healing-958")
  : undefined;
const workspaceRoot = ownedWorkspace?.root ?? join(repoRoot, ".dysflow-e2e", "958-skipped");
const projectId = "dysflow-self-healing-958-e2e";

/** First control Name ="..." found in the fixture layout — must survive the round-trip. */
let sentinelControlName = "";

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
        capabilities: { allowWrites: true },
        timeoutMs: 120_000,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  // Scenario A fixture: the REAL exported .form.txt in issue #902's legacy
  // shape. The committed Form_frmBusy fixture genuinely carries NO AutoResize
  // root marker (it predates the v2.14.0 export fix) — exactly the
  // dysflow <= v2.13.x source this issue is about, so it is used verbatim;
  // if the fixture is ever regenerated with the marker, strip it to keep the
  // scenario meaningful.
  const realFormTxt = join(repoRoot, "E2E_testing", "src", "forms", `${FORM_NAME}.form.txt`);
  const formTxtContent = readFileSync(realFormTxt, "utf8");
  const legacyFormTxt = formTxtContent.replace(/^[ \t]*AutoResize\s*=.*\r?\n/m, "");
  if (/^\s*AutoResize\s*=/m.test(legacyFormTxt)) {
    throw new Error("Failed to strip the AutoResize marker from the fixture");
  }
  writeFileSync(join(workspaceRoot, "src", "forms", `${FORM_NAME}.form.txt`), legacyFormTxt, "utf8");

  const controlMatch = formTxtContent.match(/^\s*Name\s*=\s*"([^"]+)"/m);
  sentinelControlName = controlMatch?.[1] ?? "";

  const realCls = join(repoRoot, "E2E_testing", "src", "forms", `${FORM_NAME}.cls`);
  cpSync(realCls, join(workspaceRoot, "src", "forms", `${FORM_NAME}.cls`));

  // Scenario B fixture: unbalanced Begin/End layout tree.
  writeFileSync(
    join(workspaceRoot, "src", "forms", `${BROKEN_FORM_NAME}.form.txt`),
    [
      "Version =21",
      "Begin Form",
      "    AutoResize = NotDefault",
      "    Begin Section",
      "        Begin TextBox",
      '            Name ="txtRoto"',
      "    End",
      "End",
      "CodeBehindForm",
      `Attribute VB_Name = "${BROKEN_FORM_NAME}"`,
      "",
    ].join("\r\n"),
    "utf8",
  );
}

interface McpToolResponse {
  ok: boolean;
  isError: boolean;
  text: string;
  timedOut: boolean;
}

const activeMcpChildren = new Set<ReturnType<typeof spawn>>();

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
    activeMcpChildren.add(child);
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
    child.on("error", (e) => finish({ ok: false, isError: true, text: e.message, timedOut: false }));
    child.on("close", () => {
      activeMcpChildren.delete(child);
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

describe.skipIf(!canRunE2e)(
  "form-import-self-healing-958: legacy metadata heals on import; structural damage fails closed",
  () => {
    beforeAll(() => {
      setupWorkspace();
    });

    afterAll(async () => {
      const deadline = Date.now() + 10_000;
      while (activeMcpChildren.size > 0 && Date.now() < deadline) {
        await new Promise((resolveWait) => setTimeout(resolveWait, 100));
      }
      ownedWorkspace?.cleanup();
    });

    it("Scenario A: a legacy AutoResize-less .form.txt imports successfully and round-trips canonical", async () => {
      const importResult = await callMcp(
        "import_modules",
        {
          projectId,
          moduleNames: [FORM_NAME],
          importMode: "Auto",
          dryRun: false,
        },
        { timeoutMs: 120_000 },
      );
      expect(importResult.timedOut, `import timed out: ${importResult.text}`).toBe(false);
      expect(importResult.isError, `import failed: ${importResult.text}`).toBe(false);

      const exportResult = await callMcp(
        "export_modules",
        { projectId, moduleNames: [FORM_NAME] },
        { timeoutMs: 90_000 },
      );
      expect(exportResult.timedOut, `export timed out: ${exportResult.text}`).toBe(false);
      expect(exportResult.isError, `export failed: ${exportResult.text}`).toBe(false);

      const roundTrippedPath = join(workspaceRoot, "src", "forms", `${FORM_NAME}.form.txt`);
      expect(existsSync(roundTrippedPath)).toBe(true);
      const roundTripped = readFileSync(roundTrippedPath, "utf8");

      // The canonical marker is back, immediately after Begin Form.
      expect(roundTripped).toMatch(/Begin Form\r?\n[ \t]*AutoResize\s*=\s*NotDefault/);

      // The control tree survived — the form was NOT half-loaded to zero controls.
      expect(sentinelControlName, "fixture must yield a sentinel control").not.toBe("");
      expect(roundTripped).toContain(`"${sentinelControlName}"`);
    });

    it("Scenario B: a structurally broken .form.txt is rejected with FORM_SOURCE_MALFORMED before Access", async () => {
      const importResult = await callMcp(
        "import_modules",
        {
          projectId,
          moduleNames: [BROKEN_FORM_NAME],
          importMode: "Auto",
          dryRun: false,
        },
        { timeoutMs: 60_000 },
      );
      expect(importResult.timedOut, `gate call timed out: ${importResult.text}`).toBe(false);
      expect(importResult.isError, "structural damage must fail the import").toBe(true);
      expect(importResult.text).toContain("FORM_SOURCE_MALFORMED");
      expect(importResult.text).toContain(`${BROKEN_FORM_NAME}.form.txt`);
    });
  },
);
