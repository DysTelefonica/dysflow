/**
 * Issue #1866 item 5 — a verify_code response must carry the same `ok` in its
 * text payload and in its structuredContent. The envelope's operation success
 * (`ok: true`) must not overwrite the verdict the payload reports.
 */

import { describe, expect, it } from "vitest";
import { withWireResponseEnvelope } from "../../../src/adapters/mcp/response-envelope.js";

function verifyCodeResult(payload: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload) }],
    isError: false,
    ok: true,
  };
}

describe("verify_code ok is the same in text and structuredContent (#1866 item 5)", () => {
  it("keeps the payload ok false when the envelope reports the operation as successful", () => {
    const wired = withWireResponseEnvelope(
      verifyCodeResult({ operation: "verify_code", ok: false, actionableOk: true }),
    );

    const textOk = (JSON.parse(wired.content[0]?.text ?? "{}") as { ok?: unknown }).ok;
    expect(textOk).toBe(false);
    expect(wired.structuredContent?.ok).toBe(textOk);
  });

  it("leaves other tools' envelope ok unchanged", () => {
    const wired = withWireResponseEnvelope({
      content: [{ type: "text" as const, text: JSON.stringify({ ok: false, operation: "list" }) }],
      isError: false,
      ok: true,
    });
    expect(wired.structuredContent?.ok).toBe(true);
  });
});
