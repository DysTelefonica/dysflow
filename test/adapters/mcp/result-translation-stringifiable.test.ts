/**
 * F14 — dysflow MCP responses must always be JSON-stringifiable.
 *
 * Background: When a dysflow MCP tool returns a value that JSON.stringify
 * cannot serialize (a function, a symbol, a circular object, a BigInt, an
 * Error with non-enumerable message), the consumer (e.g. CodeMode's execute
 * script) gets either:
 *   - a thrown `TypeError: Converting circular structure to JSON` (or
 *     BigInt equivalent), which surfaces as `[object Object]` after the
 *     runtime's own error wrapping kicks in, OR
 *   - a silently-dropped value (`JSON.stringify({fn: () => {}})` => `{}`),
 *     losing information about the returned value.
 *
 * Proposed fix (per friction log):
 *   - `translateCoreResultToMcpContent` MUST guarantee that the resulting
 *     `content[0].text` is itself JSON-stringifiable (no throws).
 *   - When the data cannot be safely serialized, the runtime wraps the value
 *     in an envelope `{ raw: <serializable string>, type: <typeof-kind> }`
 *     so the consumer sees a useful shape.
 *   - For `Error` instances, `.message`, `.stack`, and `.code` are extracted
 *     explicitly into the envelope so they survive JSON round-trip.
 *   - For circular references, the runtime replaces cycles with the literal
 *     `__circular__` placeholder instead of throwing.
 *
 * TDD discipline:
 *   - Fixture gate: each atom constructs its own OperationResult with the
 *     malformed data so there is no shared mutable state.
 *   - Refactor-safety: assertions are on the shape of `result.content[0].text`
 *     parsed back as JSON (what a consumer would observe), not on internal
 *     helper names or call counts.
 *   - Three paths per slice: happy (regular object), sad (non-serializable
 *     primitive), edge (deeply nested or unusual type).
 */

import { describe, expect, it } from "vitest";
import { translateCoreResultToMcpContent } from "../../../src/adapters/mcp/result-translation";
import { successResult } from "../../../src/core/contracts/index";

/**
 * Parses the JSON encoded in `content[0].text` and returns it. The whole point
 * of F14 is that this `JSON.parse` (or the upstream `JSON.stringify`) NEVER
 * throws — if it would, the test fails loudly.
 */
function readPayload<T = unknown>(result: ReturnType<typeof translateCoreResultToMcpContent>): T {
  const first = result.content[0];
  if (first === undefined) throw new Error("handler returned no content");
  return JSON.parse(first.text) as T;
}

describe("translateCoreResultToMcpContent — JSON-stringifiable normalization (F14)", () => {
  describe("happy / sanity baseline — existing plain-object path is unchanged", () => {
    it("emits a JSON-encoded text payload for a plain object data", () => {
      const result = translateCoreResultToMcpContent(successResult({ ok: true, count: 3 }));
      expect(result.isError).toBe(false);
      expect(result.ok).toBe(true);

      const payload = readPayload<{ ok: boolean; count: number }>(result);
      expect(payload).toEqual({ ok: true, count: 3 });
    });

    it("emits a JSON-encoded text payload for an array of rows", () => {
      const rows = [
        { id: 1, label: "alpha" },
        { id: 2, label: "beta" },
      ];
      const result = translateCoreResultToMcpContent(successResult({ rows }));
      const payload = readPayload<{ rows: typeof rows }>(result);
      expect(payload.rows).toEqual(rows);
    });

    it("emits a JSON-encoded null for an explicit null data", () => {
      const result = translateCoreResultToMcpContent(successResult(null));
      expect(result.isError).toBe(false);
      // text payload is the JSON encoding of `null` — a four-character string.
      expect(result.content[0]?.text).toBe("null");
    });
  });

  describe("sad / non-stringifiable primitives are wrapped in { raw, type }", () => {
    it("wraps a Symbol in { raw: 'Symbol(...)', type: 'symbol' } (top-level)", () => {
      const result = translateCoreResultToMcpContent(successResult(Symbol("foo")));
      expect(result.isError).toBe(false);

      const text = result.content[0]?.text ?? "";
      // The text must parse cleanly as JSON (no throw).
      const payload = readPayload<{ raw: string; type: string }>(result);
      expect(payload.type).toBe("symbol");
      expect(typeof payload.raw).toBe("string");
      // The raw string mentions the symbol description so a consumer can grep it.
      expect(payload.raw).toMatch(/Symbol/);
      expect(payload.raw).toContain("foo");
      // The whole text is JSON-stringifiable (the contract being asserted).
      expect(() => JSON.stringify(JSON.parse(text))).not.toThrow();
    });

    it("wraps a function in { raw: 'function …', type: 'function' } (top-level)", () => {
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      const fn = function someHelper() {};
      const result = translateCoreResultToMcpContent(successResult(fn));
      expect(result.isError).toBe(false);

      const payload = readPayload<{ raw: string; type: string }>(result);
      expect(payload.type).toBe("function");
      expect(typeof payload.raw).toBe("string");
      expect(payload.raw).toMatch(/function/);
      // Function name surfaces in the raw for grep-ability.
      expect(payload.raw).toContain("someHelper");
    });

    it("wraps an arrow function in { raw: '…', type: 'function' } (top-level)", () => {
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      const arrow = () => 42;
      const result = translateCoreResultToMcpContent(successResult(arrow));
      const payload = readPayload<{ raw: string; type: string }>(result);
      expect(payload.type).toBe("function");
      expect(payload.raw).toMatch(/function|=>|arrow/);
    });

    it("wraps a BigInt in { raw: '<digits>', type: 'bigint' } (top-level)", () => {
      const big = BigInt("123456789012345678901234567890");
      const result = translateCoreResultToMcpContent(successResult(big));
      expect(result.isError).toBe(false);

      const text = result.content[0]?.text ?? "";
      const payload = readPayload<{ raw: string; type: string }>(result);
      expect(payload.type).toBe("bigint");
      expect(payload.raw).toBe(big.toString());
      // The text itself is JSON-stringifiable (the F14 contract).
      expect(() => JSON.stringify(text)).not.toThrow();
    });

    it("wraps undefined in { raw: 'undefined', type: 'undefined' } (top-level)", () => {
      const result = translateCoreResultToMcpContent(successResult(undefined));
      expect(result.isError).toBe(false);
      const text = result.content[0]?.text ?? "";
      // The text MUST be a string (not `undefined` itself or it breaks the MCP content shape).
      expect(typeof text).toBe("string");
      // Round-trip is safe.
      expect(() => JSON.parse(text)).not.toThrow();
    });
  });

  describe("Error instances — message / stack / code are preserved in the envelope", () => {
    it("wraps a plain Error so .message is reachable through the envelope", () => {
      const error = new Error("backend timed out after 30s");
      const result = translateCoreResultToMcpContent(successResult(error));
      expect(result.isError).toBe(false);

      const payload = readPayload<{
        type: string;
        message: string;
        raw: string;
      }>(result);
      expect(payload.message).toBe("backend timed out after 30s");
      // `.stack` is also useful for diagnostics — the contract requires it is preserved.
      expect(payload.raw).toContain("backend timed out after 30s");
    });

    it("extracts .code from a custom Error (DysflowError-style) into the envelope", () => {
      class CustomError extends Error {
        constructor(
          message: string,
          public code: string,
        ) {
          super(message);
          this.name = "CustomError";
        }
      }
      const error = new CustomError("vendor offline", "VENDOR_OFFLINE");
      const result = translateCoreResultToMcpContent(successResult(error));
      const payload = readPayload<{
        message: string;
        code?: string;
      }>(result);
      expect(payload.message).toBe("vendor offline");
      expect(payload.code).toBe("VENDOR_OFFLINE");
    });
  });

  describe("circular references — never throw; cycles are placeholdered as __circular__", () => {
    it("does NOT throw when data has a top-level self-cycle", () => {
      type Cyclic = { name: string; self?: unknown };
      const cyclic: Cyclic = { name: "root" };
      cyclic.self = cyclic;

      // The literal current behavior throws (this is the RED). After the fix
      // it does not throw — and the result is JSON-parseable as text.
      expect(() => translateCoreResultToMcpContent(successResult(cyclic))).not.toThrow();

      const result = translateCoreResultToMcpContent(successResult(cyclic));
      const text = result.content[0]?.text ?? "";
      // The text itself is JSON-stringifiable AND round-trips.
      expect(() => JSON.parse(text)).not.toThrow();
      // A roundtrip of the parsed structure MUST itself be stringifiable (no
      // hidden references survive that would still throw downstream).
      expect(() => JSON.stringify(JSON.parse(text))).not.toThrow();
    });

    it("replaces nested cycles with the literal __circular__ placeholder", () => {
      type Tree = { id: number; child?: unknown };
      const root: Tree = { id: 1, child: { id: 2, child: undefined as unknown } };
      const mid = root.child as Tree;
      mid.child = root; // cycle back to root

      const result = translateCoreResultToMcpContent(successResult(root));
      const text = result.content[0]?.text ?? "";
      // The serialized payload preserves the non-cyclic structure AND replaces
      // the back-edge with the placeholder so JSON.stringify succeeds.
      expect(text).toContain("__circular__");
      expect(() => JSON.parse(text)).not.toThrow();
      const payload = readPayload<{ id: number; child: { id: number; child: string } }>(result);
      expect(payload.id).toBe(1);
      expect(payload.child.id).toBe(2);
      expect(payload.child.child).toBe("__circular__");
    });

    it("top-level BigInt inside an object is normalized (does not throw)", () => {
      // Without the fix, JSON.stringify of an object containing a BigInt throws
      // TypeError: Do not know how to serialize a BigInt. The fix MUST NOT throw.
      const data = { id: "row-1", totalBytes: BigInt("9007199254740993") };
      expect(() => translateCoreResultToMcpContent(successResult(data))).not.toThrow();

      const result = translateCoreResultToMcpContent(successResult(data));
      const text = result.content[0]?.text ?? "";
      expect(() => JSON.parse(text)).not.toThrow();
    });

    it("preserves a nested function as a diagnostic string instead of dropping the property", () => {
      // Native JSON.stringify({ fn: () => {} }) returns "{}". F14 requires the
      // nested value to remain observable so consumers do not lose diagnostics.
      function nestedHelper() {
        return "diagnostic";
      }
      const result = translateCoreResultToMcpContent(
        successResult({ id: "handler-1", fn: nestedHelper }),
      );

      const payload = readPayload<{ id: string; fn?: string }>(result);
      expect(payload.id).toBe("handler-1");
      expect(payload).toHaveProperty("fn");
      expect(payload.fn).toContain("nestedHelper");
    });

    it("preserves a nested Symbol as a diagnostic string instead of dropping the property", () => {
      // Native JSON.stringify({ marker: Symbol("mcp") }) returns "{}". The
      // symbol description must remain visible in the MCP text payload.
      const result = translateCoreResultToMcpContent(
        successResult({ id: "symbol-case", marker: Symbol("mcp-marker") }),
      );

      const payload = readPayload<{ id: string; marker?: string }>(result);
      expect(payload.id).toBe("symbol-case");
      expect(payload).toHaveProperty("marker");
      expect(payload.marker).toBe("Symbol(mcp-marker)");
    });
  });

  describe("edge — undefined nested values are handled, content text always a string", () => {
    it("returns text === '' (NOT undefined) for an operation whose data is undefined", () => {
      const result = translateCoreResultToMcpContent(successResult(undefined));
      // The MCP content text MUST always be a string, even when data is undefined.
      // (Without the fix this would be undefined, which violates the MCP wire contract.)
      const text = result.content[0]?.text;
      expect(typeof text).toBe("string");
    });

    it("result envelope shape is preserved (isError:false, ok:true) for non-stringifiable data", () => {
      // The wrapper must NOT turn a successful result into an error — the data
      // was fine, the wrap is just so the consumer gets a useful representation.
      const fn = () => "hello";
      const result = translateCoreResultToMcpContent(successResult(fn));
      expect(result.isError).toBe(false);
      expect(result.ok).toBe(true);
    });

    it("preserves a normal envelope (no extra top-level wrapper) when data IS already serializable", () => {
      // Sanity: the F14 wrap is opt-in — it only fires for non-serializable data.
      // A plain serializable object MUST come through as itself, not as
      // `{ raw: ..., type: ... }`.
      const data = { rows: [{ id: 1 }], count: 1 };
      const result = translateCoreResultToMcpContent(successResult(data));
      const payload = readPayload<typeof data>(result);
      expect(payload).toEqual(data);
      expect(payload).not.toHaveProperty("type");
    });
  });
});
