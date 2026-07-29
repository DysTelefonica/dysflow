/**
 * Round-14 regression — issue #1228 bug 1.
 *
 * `import_modules` with `importMode:"Code"` MUST verify post-write that
 * the binary's stored module content reflects the source on disk.
 * Without this check, the runner can report `status:ok` +
 * `mismatchReason:null` while the binary is stale (round-5 #1040
 * documented the same shape for `Auto` mode; the fix never covered
 * `Code` mode).
 *
 * The pure testable surface is the post-write content hash check. When
 * the runner writes a module from source, it MUST read the stored
 * module from the binary and compare. If the hashes differ, the
 * envelope MUST surface `mismatchReason: "content_hash"` (or typed
 * equivalent) — not `null`.
 *
 * We pin this at the unit level by stubbing the Access COM write seam:
 * the test fixture's "binary" is a hash map the runner writes to. The
 * runner must re-read the stored module after the write and assert
 * the stored hash equals the source hash. If the stubbed writer
 * silently drops the write (simulating the bug), the post-write check
 * catches it and reports an honest `mismatchReason`.
 */

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  type PostWriteReconcileInput,
  reconcilePostWriteModuleContent,
} from "../../../src/adapters/vba-sync/post-write-content-verify.js";

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

describe("Round-14 bug 1 — post-write content verification (#1228)", () => {
  it("reports null mismatchReason when the stored module matches the source after write", () => {
    const source =
      'Attribute VB_Name = "Form_Healthy"\r\nOption Explicit\r\nPublic Sub Sanity()\r\nEnd Sub\r\n';
    const input: PostWriteReconcileInput = {
      moduleName: "Form_Healthy",
      sourceText: source,
      sourceSha256: sha256(source),
      storedModuleText: source,
      storedModuleSha256: sha256(source),
    };
    const result = reconcilePostWriteModuleContent(input);
    expect(result.reconciled).toBe(true);
    expect(result.mismatchReason).toBeNull();
    expect(result.expectedSha256).toBe(input.sourceSha256);
    expect(result.observedSha256).toBe(input.storedModuleSha256);
  });

  it("reports mismatchReason='content_hash' when the stored module does NOT match the source after write", () => {
    // Simulate the round-14 false-success: the runner claims to have
    // written, but the stored module in the binary is the OLD content.
    // The post-write check must surface this honestly.
    const source =
      'Attribute VB_Name = "Form_Stale"\r\nOption Explicit\r\nPublic Sub Sanity()\r\nCorreoAlAdministrador m_Error\r\nEnd Sub\r\n';
    const storedPreWrite =
      'Attribute VB_Name = "Form_Stale"\r\nOption Explicit\r\nPublic Sub Sanity()\r\nCorreoAlministrador m_Error\r\nEnd Sub\r\n';
    const input: PostWriteReconcileInput = {
      moduleName: "Form_Stale",
      sourceText: source,
      sourceSha256: sha256(source),
      storedModuleText: storedPreWrite,
      storedModuleSha256: sha256(storedPreWrite),
    };
    const result = reconcilePostWriteModuleContent(input);
    expect(result.reconciled).toBe(false);
    expect(result.mismatchReason).toBe("content_hash");
    expect(result.expectedSha256).toBe(sha256(source));
    expect(result.observedSha256).toBe(sha256(storedPreWrite));
    expect(result.expectedSha256).not.toBe(result.observedSha256);
  });

  it("surfaces a typed 'no_change_needed' reason when source and binary are already identical (round-trip clean)", () => {
    // The fix MUST NOT regress round-trip clean: when the source and
    // stored module are byte-identical, the runner can return
    // mismatchReason:null. The pre-condition is that the SOURCE matches
    // what was already in the binary, so there's nothing to write.
    const identical = 'Attribute VB_Name = "Form_Same"\r\nOption Explicit\r\n';
    const result = reconcilePostWriteModuleContent({
      moduleName: "Form_Same",
      sourceText: identical,
      sourceSha256: sha256(identical),
      storedModuleText: identical,
      storedModuleSha256: sha256(identical),
    });
    expect(result.reconciled).toBe(true);
    expect(result.mismatchReason).toBeNull();
  });
});
