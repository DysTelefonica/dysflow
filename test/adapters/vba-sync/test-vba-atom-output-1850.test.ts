import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { translateCoreResultToMcpContent } from "../../../src/adapters/mcp/result-translation";
import {
  type VbaManagerExecutionRequest,
  VbaSyncAdapter,
} from "../../../src/adapters/vba-sync/vba-sync-adapter";
import { createDysflowError, failureResult } from "../../../src/core/contracts/index";
import { noopPreflightCleanup } from "../../_helpers/noop-preflight-cleanup.js";

/**
 * #1850 — `test_vba` lost the whole call to a generic `MCP_TOOL_ERROR`
 * ("Expected double-quoted property name in JSON at position N") for atoms
 * whose output carries text read from files, while `run_vba` returned the
 * same atom's output intact.
 *
 * The ports under test are the two ends of the test_vba path: the VBA-manager
 * executor (faked — it is the PowerShell/Access boundary) feeds the real
 * adapter, and the real MCP translation renders what the agent receives.
 * Nothing in between is mocked.
 */

type RunnerTest = Record<string, unknown>;

async function adapterReturning(tests: RunnerTest[]): Promise<VbaSyncAdapter> {
  const root = await mkdtemp(join(tmpdir(), "dysflow-1850-"));
  return new VbaSyncAdapter({
    accessPath: join(root, "front.accdb"),
    destinationRoot: root,
    preflightCleanup: noopPreflightCleanup(),
    env: {},
    executor: async (_request: VbaManagerExecutionRequest) => ({
      exitCode: 0,
      stdout: `DYSFLOW_RESULT ${JSON.stringify({ tests })}`,
      stderr: "",
      durationMs: 1,
      timedOut: false,
    }),
  });
}

/** The record the PowerShell runner emits for one atom (Invoke-AccessProcedure). */
function atom(procedure: string, envelope: Record<string, unknown> | string): RunnerTest {
  const returnValue = typeof envelope === "string" ? envelope : JSON.stringify(envelope);
  let payload: unknown = null;
  try {
    payload = JSON.parse(returnValue);
  } catch {
    payload = null;
  }
  const record = (payload ?? {}) as Record<string, unknown>;
  return {
    ok: record.ok !== false,
    procedure,
    argsCount: 0,
    returnValue,
    returnType: "System.String",
    byref_values: {},
    payload,
    logs: Array.isArray(record.logs) ? record.logs : [],
    error: record.ok === false ? (record.error ?? null) : null,
    durationMs: 12,
  };
}

async function runTestVba(tests: RunnerTest[]) {
  const adapter = await adapterReturning(tests);
  const core = await adapter.execute("test_vba", {
    proceduresJson: JSON.stringify(tests.map((test) => test.procedure)),
    apply: true,
  });
  return translateCoreResultToMcpContent(core) as unknown as {
    isError?: boolean;
    ok: boolean;
    content: Array<{ type: string; text: string }>;
    error?: {
      code: string;
      details?: {
        failedCount: number;
        failures: Array<Record<string, unknown>>;
        results: Array<Record<string, unknown>>;
      };
    };
  };
}

// The issue's verbatim run_vba returnValue for Test_Manifest_NoDuplicateProcedures.
const ISSUE_RETURN_VALUE =
  '{"ok":true,"value":"manifest_no_duplicate_procedures","payload":null,"error":null,"logs":["1. Arrange: leer manifests principal y smoke","2. Act: extraer procedures","3. Assert: no hay procedures duplicados entre manifests","Principal: 518 procedures","Smoke: 6 procedures"]}';

const SANDBOX = "C:\\Users\\aroman\\AppData\\Local\\Temp\\dysflow-sandbox-1a2b\\";

/**
 * Failing atoms whose text came from files. Each one used to make the whole
 * call throw instead of returning the per-atom report.
 */
const FILE_READING_FAILURES: Record<string, Record<string, unknown>> = {
  "a Windows path inside quotes": {
    ok: false,
    error: `No existe el fichero "${SANDBOX}tests\\tests.vba.json"`,
    logs: ["1. Arrange: leer manifests principal y smoke", `Leyendo "${SANDBOX}tests"`],
  },
  "a Windows path followed by a comma": {
    ok: false,
    error: `Ruta ${SANDBOX}tests\\smoke.json, no encontrada`,
    logs: [`Principal: ${SANDBOX}tests\\tests.vba.json`, "Smoke: 6 procedures"],
  },
  "a database path followed by more fields": {
    ok: false,
    error: `Frontend ${SANDBOX}front.accdb distinto`,
    logs: [`Leyendo ${SANDBOX}src\\forms\\Form_X.form.txt`, `Backend ${SANDBOX}back.accdb`],
  },
  "a POSIX path": {
    ok: false,
    error: "leer /repo/tests/tests.vba.json, luego /repo/src/forms/Form_X.form.txt",
    logs: [" /repo/tests/tests.vba.json"],
  },
  "embedded quotes, CR/LF/tab and Spanish accents": {
    ok: false,
    error: 'Procedimiento "Test_Ñandú" duplicado:\r\n\tmódulo «Pruebas»\r\nfin',
    logs: ['Línea "1"\tcolumna 2', "acción\r\nsiguiente"],
  },
  "a HRESULT that appends remediation advice": {
    ok: false,
    error: "Error 0x800ADEB9 al leer el formulario",
    logs: [],
  },
  "a long value reaching the reported positions": {
    ok: false,
    error: `Duplicados: ${Array.from({ length: 40 }, (_, i) => `"${SANDBOX}m${i}.bas"`).join(", ")}`,
    logs: Array.from({ length: 20 }, (_, i) => `Leído ${SANDBOX}tests\\slice_${i}.json, ok`),
  },
};

describe("test_vba atom output — #1850", () => {
  it("reports the issue's single atom as a per-atom pass", async () => {
    const result = await runTestVba([
      atom("Test_Manifest_NoDuplicateProcedures", JSON.parse(ISSUE_RETURN_VALUE)),
    ]);

    expect(result.ok).toBe(true);
    const data = JSON.parse(result.content[0]?.text ?? "{}") as {
      passed: number;
      failed: number;
      tests: Array<{ procedure: string; returnValue: string }>;
    };
    expect(data.passed).toBe(1);
    expect(data.failed).toBe(0);
    expect(data.tests[0]?.procedure).toBe("Test_Manifest_NoDuplicateProcedures");
    expect(data.tests[0]?.returnValue).toBe(ISSUE_RETURN_VALUE);
  });

  for (const [label, envelope] of Object.entries(FILE_READING_FAILURES)) {
    it(`returns the per-atom failure report for an atom whose output carries ${label}`, async () => {
      const passing = atom("Test_Punto01_Ok", JSON.parse(ISSUE_RETURN_VALUE));
      const failing = atom("Test_Manifest_NoDuplicateProcedures", envelope);

      const result = await runTestVba([passing, failing]);

      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe("VBA_TESTS_FAILED");
      expect(result.error?.details?.failedCount).toBe(1);
      expect(result.error?.details?.failures[0]?.procedure).toBe(
        "Test_Manifest_NoDuplicateProcedures",
      );
      expect(result.error?.details?.results.map((entry) => entry.procedure)).toEqual([
        "Test_Punto01_Ok",
        "Test_Manifest_NoDuplicateProcedures",
      ]);
      // The serialized atom output survives as valid JSON, as run_vba returns it.
      const returnValue = result.error?.details?.results[1]?.returnValue;
      expect(typeof returnValue).toBe("string");
      expect(() => JSON.parse(returnValue as string)).not.toThrow();
      // Path redaction still applies to the error details.
      expect(JSON.stringify(result.error?.details)).not.toContain("aroman");
    });
  }

  it("reports an unparsable atom output as a typed per-atom error and keeps the other atoms", async () => {
    const broken = `{"ok":true,"value":"x","logs":["Leído ${"a".repeat(600)}",]}`;
    const result = await runTestVba([
      atom("Test_Punto01_Ok", JSON.parse(ISSUE_RETURN_VALUE)),
      atom("Test_Manifest_Broken", broken),
    ]);

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("VBA_TESTS_FAILED");
    expect(result.error?.details?.failedCount).toBe(1);
    const failure = result.error?.details?.failures[0] as {
      procedure: string;
      error: string;
      cause: { code: string; retryable: boolean; remediation: string };
      outputExcerpt: string;
    };
    expect(failure.procedure).toBe("Test_Manifest_Broken");
    expect(failure.cause.code).toBe("ATOM_OUTPUT_UNPARSABLE");
    expect(failure.cause.retryable).toBe(false);
    expect(failure.cause.remediation.length).toBeGreaterThan(0);
    expect(failure.error).toContain("Test_Manifest_Broken");
    expect(failure.outputExcerpt.length).toBeGreaterThan(0);
    expect(failure.outputExcerpt.length).toBeLessThanOrEqual(240);
    expect(broken).toContain(failure.outputExcerpt.replace(/^…|…$/g, ""));
    const results = result.error?.details?.results ?? [];
    expect(results.map((entry) => [entry.procedure, entry.ok])).toEqual([
      ["Test_Punto01_Ok", true],
      ["Test_Manifest_Broken", false],
    ]);
  });

  it("still redacts secrets, connect-string passwords and paths in error details", () => {
    const result = translateCoreResultToMcpContent(
      failureResult(
        createDysflowError("VBA_TESTS_FAILED", "1 VBA test(s) failed", {
          details: {
            failures: [
              {
                error: "open C:\\Users\\aroman\\front.accdb with s3cr3t;PWD=hunter2;",
                returnValue: JSON.stringify({ ok: false, error: "\\\\srv\\share\\x s3cr3t" }),
                logs: ["/home/aroman/repo/tests.json"],
              },
            ],
          },
        }),
      ),
      ["s3cr3t"],
    ) as unknown as { error: { details: { failures: Array<Record<string, unknown>> } } };

    const text = JSON.stringify(result.error.details);
    for (const leaked of ["aroman", "s3cr3t", "hunter2", "srv"]) {
      expect(text).not.toContain(leaked);
    }
    expect(text).toContain("[PATH]");
    expect(text).toContain("[REDACTED]");
    const failure = result.error.details.failures[0] as { returnValue: string };
    expect(JSON.parse(failure.returnValue)).toEqual({ ok: false, error: "[PATH] [REDACTED]" });
  });

  it("keeps a JSON leaf byte-for-byte when redaction changes nothing in it", () => {
    const returnValue =
      '{ "ok": false, "error": "caf\\u00e9", "ratio": 1.0, "id": 12345678901234567890 }';
    const result = translateCoreResultToMcpContent(
      failureResult(
        createDysflowError("VBA_TESTS_FAILED", "1 VBA test(s) failed", {
          details: { failures: [{ procedure: "Test_X", returnValue }] },
        }),
      ),
    ) as unknown as { error: { details: { failures: Array<{ returnValue: string }> } } };

    expect(result.error.details.failures[0]?.returnValue).toBe(returnValue);
  });

  it("keeps a GUID-style braced return value a pass, as before", async () => {
    const result = await runTestVba([atom("Test_Guid", "{3F2504E0-4F89-11D3-9A0C-0305E82C3301}")]);

    expect(result.ok).toBe(true);
    const data = JSON.parse(result.content[0]?.text ?? "{}") as { passed: number };
    expect(data.passed).toBe(1);
  });

  it("keeps a plain non-JSON atom return value a pass, as before", async () => {
    const result = await runTestVba([atom("Test_Plain", "OK")]);

    expect(result.ok).toBe(true);
    const data = JSON.parse(result.content[0]?.text ?? "{}") as { passed: number };
    expect(data.passed).toBe(1);
  });
});
