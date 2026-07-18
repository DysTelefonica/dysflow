/**
 * Issue #957 — `form_set_property apply:true` second successive call fails
 * with FORM_IMPORT_GATE_FAILED → VBA_IMPORT_PHASE_FAILED (ACE 3265:
 * "La clave de búsqueda no se encontró en ningún registro.").
 *
 * Repro:
 *   - First `form_set_property apply:true` against form F, control A
 *     → succeeds (importGate:"passed").
 *   - Second `form_set_property apply:true` against the SAME form F, any
 *     control (same or different) → fails with VBA_IMPORT_PHASE_FAILED
 *     because Access's internal state of the form is dirty after the first
 *     mutation, and the canonical-header rebuild's `SaveAsText` call
 *     inside the `remove-existing` phase surfaces ACE 3265.
 *
 * Acceptance criterion:
 *   - Two consecutive `form_set_property apply:true` calls on the same
 *     form (different controls) both return `ok:true` and the
 *     `importGate:"passed"` status. The second call must NOT surface
 *     VBA_IMPORT_PHASE_FAILED.
 *
 * Implementation note (test fidelity):
 *   The two calls run in the SAME MCP session (single child process).
 *   Killing the child between calls (the prior pattern) leaves zombie
 *   MSACCESS.EXE processes that corrupt the .accdb file state and
 *   muddy the repro. A single long-lived MCP session matches how a
 *   real consumer drives chained mutations.
 *
 * Run with: pnpm test:integration (or vitest run -c vitest.integration.config.ts)
 * Requires: DYSFLOW_E2E_COMMAND, E2E_testing/*.accdb fixtures, Access COM,
 *           ACCESS_VBA_PASSWORD env var.
 */
import { execFileSync, spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createGitOwnedE2eWorkspace } from "../integration/_helpers/git-owned-e2e-workspace";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const cliCommand =
  process.env.DYSFLOW_E2E_COMMAND ?? join(repoRoot, "test-runtime", "bin", "dysflow.cmd");
const fixtureFront = join(repoRoot, "E2E_testing", "NoConformidades.accdb");
const fixtureBackend = join(repoRoot, "E2E_testing", "NoConformidades_Datos.accdb");

// Form_Form0BDOpcionesTecnicos has two large CommandButtons in the Detalle
// section: ComandoBusquedaSimple and ComandoBusquedaCompleta. Both carry a
// Caption property and are independent (no shared event handlers).
const FORM_NAME = "Form_Form0BDOpcionesTecnicos";
const CONTROL_A = "ComandoBusquedaSimple";
const CONTROL_B = "ComandoBusquedaCompleta";
const CAPTION_A = '"PROBE-A_957"';
const CAPTION_B = '"PROBE-B_957"';

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
    "[form-set-property-second-call-957] Skipping: DYSFLOW_E2E_COMMAND, E2E_testing/*.accdb, " +
      "Access COM, or ACCESS_VBA_PASSWORD are unavailable.",
  );
}

// ---------------------------------------------------------------------------
// Workspace
// ---------------------------------------------------------------------------

const ownedWorkspace = canRunE2e
  ? createGitOwnedE2eWorkspace(repoRoot, "form-second-call-957")
  : undefined;
const workspaceRoot = ownedWorkspace?.root ?? join(repoRoot, ".dysflow-e2e", "form-957-skipped");
const projectId = "dysflow-form-second-call-957-e2e";

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

  // Copy the .form.txt + .cls from the fixtures so the form is importable
  // and the form-set-property mutations have valid source to mutate.
  const realFormTxt = join(repoRoot, "E2E_testing", "src", "forms", `${FORM_NAME}.form.txt`);
  const realCls = join(repoRoot, "E2E_testing", "src", "forms", `${FORM_NAME}.cls`);
  cpSync(realFormTxt, join(workspaceRoot, "src", "forms", `${FORM_NAME}.form.txt`));
  cpSync(realCls, join(workspaceRoot, "src", "forms", `${FORM_NAME}.cls`));
}

// ---------------------------------------------------------------------------
// MCP helper — single long-lived session, multiple tool calls.
// ---------------------------------------------------------------------------

interface McpToolResponse {
  ok: boolean;
  isError: boolean;
  text: string;
  timedOut: boolean;
}

interface McpSession {
  callTool(toolName: string, args: Record<string, unknown>, timeoutMs?: number): Promise<McpToolResponse>;
  close(): Promise<void>;
}

async function openMcpSession(): Promise<McpSession> {
  const child = spawn(cliCommand, ["mcp"], {
    cwd: workspaceRoot,
    shell: true,
    stdio: ["pipe", "pipe", "pipe"],
    env: {
      ...process.env,
      ACCESS_VBA_PASSWORD: process.env.ACCESS_VBA_PASSWORD ?? process.env.DYSFLOW_ACCESS_PASSWORD,
      DYSFLOW_ACCESS_PASSWORD:
        process.env.ACCESS_VBA_PASSWORD ?? process.env.DYSFLOW_ACCESS_PASSWORD,
      DYSFLOW_BACKEND_PASSWORD:
        process.env.ACCESS_VBA_PASSWORD ?? process.env.DYSFLOW_BACK_PASSWORD,
    },
  });

  // JSON-RPC message queue, one Promise per request id, FIFO dispatch.
  const pending = new Map<number, { resolve: (r: McpToolResponse) => void; reject: (e: Error) => void }>();
  let nextId = 1;
  let buf = "";
  let closed = false;
  let closeReason: Error | null = null;

  child.stdout.on("data", (chunk) => {
    buf += chunk.toString();
    const nl = buf.lastIndexOf("\n");
    if (nl < 0) return;
    const slice = buf.slice(0, nl);
    buf = buf.slice(nl + 1);
    for (const l of slice.split("\n")) {
      const s = l.trim();
      if (!s) continue;
      let msg: { id?: number; result?: unknown; error?: { message?: string } };
      try {
        msg = JSON.parse(s) as typeof msg;
      } catch {
        continue;
      }
      if (msg.id === undefined) continue;
      const waiter = pending.get(msg.id);
      if (!waiter) continue;
      pending.delete(msg.id);
      const r = msg.result as
        | { content?: Array<{ type: string; text?: string }>; isError?: boolean }
        | undefined;
      const text = r?.content?.map((c) => c.text ?? "").join("\n") ?? "";
      const isError = Boolean(msg.error) || Boolean(r?.isError);
      waiter.resolve({ ok: !isError, isError, text, timedOut: false });
    }
  });

  child.on("error", (e) => {
    closed = true;
    closeReason = e;
    for (const w of pending.values()) w.reject(e);
    pending.clear();
  });
  child.on("close", () => {
    closed = true;
    if (!closeReason) closeReason = new Error("MCP session closed");
    for (const w of pending.values()) w.reject(closeReason);
    pending.clear();
  });

  // Send the initialize handshake.
  child.stdin.write(
    `${JSON.stringify({
      jsonrpc: "2.0",
      id: nextId,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "tool-e2e-957", version: "1" },
      },
    })}\n`,
  );
  await new Promise<void>((resInit, rejInit) => {
    pending.set(nextId, {
      resolve: () => resInit(),
      reject: (e) => rejInit(e),
    });
    nextId += 1;
  });
  child.stdin.write(
    `${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} })}\n`,
  );

  return {
    async callTool(
      toolName: string,
      args: Record<string, unknown>,
      timeoutMs = 60_000,
    ): Promise<McpToolResponse> {
      if (closed) throw closeReason ?? new Error("MCP session closed");
      const id = nextId;
      nextId += 1;
      return await new Promise<McpToolResponse>((resolveCall, rejectCall) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          resolveCall({ ok: false, isError: true, text: "MCP timeout", timedOut: true });
        }, timeoutMs);
        pending.set(id, {
          resolve: (r) => {
            clearTimeout(timer);
            resolveCall(r);
          },
          reject: (e) => {
            clearTimeout(timer);
            rejectCall(e);
          },
        });
        try {
          child.stdin.write(
            `${JSON.stringify({
              jsonrpc: "2.0",
              id,
              method: "tools/call",
              params: { name: toolName, arguments: args },
            })}\n`,
          );
        } catch (err) {
          clearTimeout(timer);
          pending.delete(id);
          rejectCall(err instanceof Error ? err : new Error(String(err)));
        }
      });
    },
    async close(): Promise<void> {
      if (closed) return;
      try {
        child.stdin.end();
      } catch {
        /* ignore */
      }
      // Give the child a chance to exit gracefully before we kill it.
      await new Promise<void>((resWait) => {
        if (closed) return resWait();
        const t = setTimeout(() => {
          try {
            child.kill();
          } catch {
            /* ignore */
          }
          resWait();
        }, 5_000);
        child.on("close", () => {
          clearTimeout(t);
          resWait();
        });
      });
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseEnvelope(text: string): {
  ok: boolean;
  mode?: string;
  importGate?: string;
  errorCode?: string;
  raw: unknown;
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, raw: text };
  }
  // MCP tool results wrap the body in a content array; pull the first text.
  const env = (() => {
    if (typeof parsed === "object" && parsed !== null) {
      const obj = parsed as Record<string, unknown>;
      if (Array.isArray(obj.content)) {
        const c0 = obj.content[0] as { text?: string } | undefined;
        if (c0 && typeof c0.text === "string") {
          try {
            return JSON.parse(c0.text) as Record<string, unknown>;
          } catch {
            return undefined;
          }
        }
      }
      return obj;
    }
    return undefined;
  })();
  if (!env || typeof env !== "object") return { ok: false, raw: parsed };
  const e = env as Record<string, unknown>;
  return {
    ok: e.ok === true || e.mode === "apply",
    mode: typeof e.mode === "string" ? e.mode : undefined,
    importGate: typeof e.importGate === "string" ? e.importGate : undefined,
    errorCode:
      typeof e.code === "string"
        ? e.code
        : typeof (e.error as Record<string, unknown> | undefined)?.code === "string"
          ? String((e.error as Record<string, unknown>).code)
          : undefined,
    raw: parsed,
  };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe.skipIf(!canRunE2e)(
  "form_set_property chained apply: second successive call must not regress (#957)",
  () => {
    let session: McpSession | null = null;

    beforeAll(() => {
      setupWorkspace();
    });

    afterAll(async () => {
      if (session) {
        await session.close();
        session = null;
      }
      ownedWorkspace?.cleanup();
    });

    it("two consecutive form_set_property apply:true calls on the same form both succeed", async () => {
      session = await openMcpSession();
      const sourcePath = `src/forms/${FORM_NAME}.form.txt`;

      // Import the form into the .accdb FIRST so it exists in the binary
      // when the two `form_set_property apply:true` calls run. This
      // matches the consumer's reproducer bench (#957) where the form
      // already exists in the .accdb and the test exercises chained
      // mutations of an existing document. Without the pre-import the
      // first call would CREATE the form (a different code path that
      // does not reproduce the #957 regression).
      const importResult = await session.callTool(
        "import_modules",
        {
          projectId,
          moduleNames: [FORM_NAME],
          importMode: "Auto",
          dryRun: false,
        },
        90_000,
      );
      expect(importResult.timedOut, `import timed out: ${importResult.text}`).toBe(false);
      expect(
        importResult.isError,
        `pre-import must succeed: ${importResult.text}`,
      ).toBe(false);

      // --- First mutation: Caption on ComandoBusquedaSimple -----------------
      // Pre-fix: succeeds (well-trodden path, no dirty state yet).
      const first = await session.callTool(
        "form_set_property",
        {
          projectId,
          sourcePath,
          controlName: CONTROL_A,
          property: "Caption",
          value: CAPTION_A,
          apply: true,
        },
        90_000,
      );
      expect(first.timedOut, `first call timed out: ${first.text}`).toBe(false);
      const firstEnv = parseEnvelope(first.text);
      expect(
        firstEnv.ok,
        `first call should succeed, got: ${first.text}`,
      ).toBe(true);
      expect(firstEnv.importGate, `first call importGate: ${first.text}`).toBe("passed");

      // --- Second mutation: Caption on ComandoBusquedaCompleta -------------
      // Pre-fix: fails with VBA_IMPORT_PHASE_FAILED / ACE 3265 because
      // Access's internal state of the form is dirty after the first
      // mutation; the canonical-header rebuild's SaveAsText surfaces the
      // "La clave de búsqueda no se encontró en ningún registro" error.
      // Post-fix: must succeed (importGate:"passed") — same control-state
      // shape as the first call.
      const second = await session.callTool(
        "form_set_property",
        {
          projectId,
          sourcePath,
          controlName: CONTROL_B,
          property: "Caption",
          value: CAPTION_B,
          apply: true,
        },
        90_000,
      );
      expect(second.timedOut, `second call timed out: ${second.text}`).toBe(false);

      const secondEnv = parseEnvelope(second.text);
      expect(
        secondEnv.ok,
        `second call should succeed (issue #957). Envelope: ${second.text}`,
      ).toBe(true);
      expect(
        secondEnv.importGate,
        `second call importGate must be "passed" (issue #957). Envelope: ${second.text}`,
      ).toBe("passed");
      // The second call must NOT surface the ACE 3265 import phase failure.
      expect(
        secondEnv.errorCode,
        `second call must not surface VBA_IMPORT_PHASE_FAILED (issue #957). Envelope: ${second.text}`,
      ).not.toBe("VBA_IMPORT_PHASE_FAILED");
      expect(
        secondEnv.errorCode,
        `second call must not surface FORM_IMPORT_GATE_FAILED (issue #957). Envelope: ${second.text}`,
      ).not.toBe("FORM_IMPORT_GATE_FAILED");
    }, 300_000);
  },
);
