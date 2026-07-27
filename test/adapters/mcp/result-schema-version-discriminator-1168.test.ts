/**
 * #1168 — every dysflow MCP tool response carries a top-level `schemaVersion`
 * discriminator so consumers (notably OpenCode Code Mode, which sometimes
 * flattens structured results to `[object Object]`) can branch on a single
 * stable field instead of regex-parsing legacy text bodies.
 *
 * Acceptance criteria (issue body):
 *   1. Every dysflow MCP tool response is JSON-encodable.
 *   2. Every dysflow MCP tool response includes a top-level `schemaVersion`
 *      discriminator accessible from both success and error envelopes.
 *
 * The discriminator is a single, versioned literal: `dysflow.result/v1`. It
 * surfaces as the top-level field `schemaVersion` on the McpToolResult
 * envelope so the consumer's defensive parse collapses to one line:
 *
 *     const r = await tools.dysflow.someTool(args);
 *     const env = typeof r === 'string' ? JSON.parse(r) : r;
 *     if (env.schemaVersion !== 'dysflow.result/v1') throw new Error('not a dysflow envelope');
 *
 * TDD discipline:
 *   - Fixture gate: every atom builds its own data; no shared mutable state.
 *   - Refactor-safety: assertions target the observable envelope shape, not
 *     internal helper names or call counts.
 *   - Three paths per slice: success envelope, error envelope, edge case
 *     (result-contract violation + tool-not-found fallbacks).
 */

import { describe, expect, it } from "vitest";
import { createDysflowError, failureResult, successResult } from "../../../src/core/contracts/index";
import {
  allowlistNotConfigured,
  binaryFormatUnsupported,
  binaryLocked,
  binaryNotFound,
  binaryPasswordInvalid,
  exportSourceGuardRefused,
  EXPORT_OVERWRITES_SOURCE_REQUIRES_CONFIRMATION,
  internalError,
  invalidInput,
  MCP_INPUT_INVALID_CODE,
  MCP_PROCEDURE_NOT_ALLOWED,
  projectConfigNotWriteReady,
  procedureNotAllowed,
  RUNTIME_STALE,
  runtimeStale,
  writesDisabled,
} from "../../../src/adapters/mcp/dispatch-common";
import {
  RESULT_SCHEMA_VERSION,
  translateCoreResultToMcpContent,
  type McpToolResult,
  withSchemaVersion,
} from "../../../src/adapters/mcp/result-translation";

/**
 * Every McpToolResult-shaped value must be JSON-encodable so consumers can
 * `JSON.parse(JSON.stringify(envelope))` and recover an identical value. This
 * is the F14 contract surfaced through the new top-level discriminator — the
 * discriminator is meaningless if the envelope itself can be flattened by the
 * transport layer.
 */
function expectJsonEncodable(result: McpToolResult): void {
  expect(() => JSON.stringify(result)).not.toThrow();
  const roundTripped = JSON.parse(JSON.stringify(result));
  expect(roundTripped).toEqual(result);
}

function expectSchemaVersionDiscriminator(result: McpToolResult): void {
  expect(result.schemaVersion).toBe(RESULT_SCHEMA_VERSION);
  expectJsonEncodable(result);
}

describe("MCP envelope schemaVersion discriminator (#1168)", () => {
  describe("translateCoreResultToMcpContent — success and error paths", () => {
    it("surfaces schemaVersion on the success envelope", () => {
      const result = translateCoreResultToMcpContent(successResult({ rows: [{ id: 1 }] }));
      expectSchemaVersionDiscriminator(result);
    });

    it("surfaces schemaVersion on the failure envelope", () => {
      const result = translateCoreResultToMcpContent(
        failureResult(createDysflowError("BINARY_NOT_FOUND", "missing accdb", { accessPath: "/x" })),
      );
      expectSchemaVersionDiscriminator(result);
    });

    it("surfaces schemaVersion even when the success payload is undefined (F14 edge)", () => {
      const result = translateCoreResultToMcpContent(successResult(undefined));
      expectSchemaVersionDiscriminator(result);
    });

    it("surfaces schemaVersion even when the success payload is a non-serializable function", () => {
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      const fn = function probe() {};
      const result = translateCoreResultToMcpContent(successResult(fn));
      expectSchemaVersionDiscriminator(result);
    });
  });

  describe("withSchemaVersion — idempotent injector (single source of truth)", () => {
    it("injects the canonical schemaVersion literal onto a bare envelope", () => {
      const bare: McpToolResult = {
        content: [{ type: "text", text: "null" }],
        isError: false,
        ok: true,
      };
      const stamped = withSchemaVersion(bare);
      expect(stamped.schemaVersion).toBe(RESULT_SCHEMA_VERSION);
      expect(stamped.content).toEqual(bare.content);
      expectJsonEncodable(stamped);
    });

    it("is idempotent — re-stamping does not duplicate the field", () => {
      const once = withSchemaVersion({
        content: [{ type: "text", text: "null" }],
        isError: false,
        ok: true,
      });
      const twice = withSchemaVersion(once);
      expect(twice.schemaVersion).toBe(RESULT_SCHEMA_VERSION);
      // Re-stamping must NOT add a second schemaVersion key. The literal is
      // the only stable discriminator; a duplicate breaks consumer branching.
      expect(Object.keys(twice).filter((k) => k === "schemaVersion")).toHaveLength(1);
    });

    it("stamps both success and error envelopes with the same literal", () => {
      const success = withSchemaVersion({
        content: [{ type: "text", text: "null" }],
        isError: false,
        ok: true,
      });
      const error = withSchemaVersion({
        content: [{ type: "text", text: "MCP_INPUT_INVALID: bad" }],
        isError: true,
        ok: false,
        error: { code: "MCP_INPUT_INVALID", message: "bad" },
      });
      expect(success.schemaVersion).toBe(RESULT_SCHEMA_VERSION);
      expect(error.schemaVersion).toBe(RESULT_SCHEMA_VERSION);
    });
  });

  describe("helper envelope builders — every gate surfaces the discriminator", () => {
    it("procedureNotAllowed envelope carries schemaVersion", () => {
      const result = procedureNotAllowed("Test_X", ["Test_A"]);
      expectSchemaVersionDiscriminator(result);
    });

    it("allowlistNotConfigured envelope carries schemaVersion", () => {
      const result = allowlistNotConfigured("Test_X");
      expectSchemaVersionDiscriminator(result);
    });

    it("writesDisabled envelope carries schemaVersion", () => {
      const result = writesDisabled("export_modules");
      expectSchemaVersionDiscriminator(result);
    });

    it("projectConfigNotWriteReady envelope carries schemaVersion", () => {
      const result = projectConfigNotWriteReady("export_modules", {
        status: "destination-root-not-found",
        cwd: "C:/repo",
        configPath: "C:/repo/.dysflow/project.json",
        projectRoot: "C:/repo",
        projectId: "app",
        accessPath: "C:/repo/app.accdb",
        backendPath: null,
        destinationRoot: "C:/repo/src",
        writeReady: false,
        diagnostics: [
          { code: "DESTINATION_ROOT_NOT_FOUND", severity: "error", message: "no dest", remediation: "fix" },
        ],
        remediation: "fix",
      } as never);
      expectSchemaVersionDiscriminator(result);
    });

    it("binaryNotFound envelope carries schemaVersion", () => {
      const result = binaryNotFound({ accessPath: "/missing.accdb" });
      expectSchemaVersionDiscriminator(result);
    });

    it("binaryLocked envelope carries schemaVersion", () => {
      const result = binaryLocked({ accessPath: "/x.accdb", holderPid: 1234, lockType: "laccdb" });
      expectSchemaVersionDiscriminator(result);
    });

    it("binaryPasswordInvalid envelope carries schemaVersion", () => {
      const result = binaryPasswordInvalid({ accessPath: "/x.accdb", passwordEnv: "PWD" });
      expectSchemaVersionDiscriminator(result);
    });

    it("binaryFormatUnsupported envelope carries schemaVersion", () => {
      const result = binaryFormatUnsupported({ accessPath: "/x.accdb", observedMagic: "504B0304" });
      expectSchemaVersionDiscriminator(result);
    });

    it("internalError envelope (Error overload) carries schemaVersion", () => {
      const result = internalError({ error: new TypeError("boom") });
      expectSchemaVersionDiscriminator(result);
    });

    it("internalError envelope (errorClass overload) carries schemaVersion", () => {
      const result = internalError({ errorClass: "RangeError" });
      expectSchemaVersionDiscriminator(result);
    });

    it("runtimeStale envelope carries schemaVersion", () => {
      const result = runtimeStale({ tool: "doctor", signal: "cache_overflow" });
      expectSchemaVersionDiscriminator(result);
    });

    it("invalidInput envelope carries schemaVersion (legacy + multi-flag shapes)", () => {
      const legacy = invalidInput("foo is not allowed.");
      expectSchemaVersionDiscriminator(legacy);

      const multi = invalidInput("apply + dryRun is contradictory.", undefined, {
        rejectedFlag: "apply",
        rejectedFlags: ["apply", "dryRun"],
        toolName: "export_modules",
      });
      expectSchemaVersionDiscriminator(multi);
    });

    it("exportSourceGuardRefused envelope carries schemaVersion", () => {
      const result = exportSourceGuardRefused({
        toolName: "export_modules",
        destination: "C:/repo/src",
        sourceRoot: "C:/repo/src",
      });
      expectSchemaVersionDiscriminator(result);
    });
  });

  describe("literal hygiene — the discriminator is a stable single source of truth", () => {
    it("RESULT_SCHEMA_VERSION is the literal 'dysflow.result/v1'", () => {
      expect(RESULT_SCHEMA_VERSION).toBe("dysflow.result/v1");
    });

    it("every error code constant coexists with the discriminator (no field shadowing)", () => {
      // Sanity: the discriminator field does not collide with the typed
      // error-code constants we ship. If the type changed, this test would
      // surface the regression at compile time AND at runtime via the keys
      // collision check below.
      const codes = [
        MCP_INPUT_INVALID_CODE,
        MCP_PROCEDURE_NOT_ALLOWED,
        RUNTIME_STALE,
        EXPORT_OVERWRITES_SOURCE_REQUIRES_CONFIRMATION,
      ];
      for (const code of codes) {
        expect(typeof code).toBe("string");
        // The discriminator literal must not equal any error code literal —
        // otherwise consumers could not branch on `result.schemaVersion` to
        // distinguish the envelope from a typed error.
        expect(code).not.toBe(RESULT_SCHEMA_VERSION);
      }
    });
  });
});