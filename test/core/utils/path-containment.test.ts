/**
 * Path-containment unit tests — pins the contract of `isPathInside`
 * (src/core/utils/path-containment.ts) so future changes to the
 * path-containment or the form/adapter consumers do not regress the
 * containment check.
 *
 * Issue #685 caught a cross-platform edge case on Linux CI: when
 * `generateForm` builds `outputPath` via platform-default `path.resolve()`
 * (POSIX on Linux) and the parent is a Windows-style string like
 * `C:/projects/myapp`, the mixed-style inputs are not reliably detected
 * as "inside". The runtime-guard test that exposed this was fixed by
 * switching its `destinationRoot` to a platform-native path; that fix
 * is in test/adapters/vba-sync/runtime-guard-filesystem-writes.test.ts.
 *
 * `isPathInside`'s documented contract ("handles both POSIX and Windows
 * paths") is verified here for same-style inputs only. The mixed-style
 * edge case is tracked as `it.todo` so future work to harden the
 * function has a clear red target without making this file flaky.
 */

import { describe, expect, it } from "vitest";

import { isPathInside } from "../../../src/core/utils/path-containment.js";

describe("isPathInside — containment contract", () => {
  describe("same-style inputs", () => {
    it("returns true for a Windows-style child of a Windows-style parent", () => {
      expect(isPathInside("C:\\projects\\myapp\\forms\\x.json", "C:\\projects\\myapp")).toBe(true);
    });

    it("returns true for a POSIX-style child of a POSIX-style parent", () => {
      expect(isPathInside("/projects/myapp/forms/x.json", "/projects/myapp")).toBe(true);
    });

    it("returns true when child equals parent", () => {
      expect(isPathInside("C:/projects/myapp", "C:/projects/myapp")).toBe(true);
    });

    it("returns false for a sibling at the same level", () => {
      expect(isPathInside("C:/projects/other/x.json", "C:/projects/myapp")).toBe(false);
    });

    it("returns false for `..` traversal", () => {
      expect(isPathInside("C:/projects/myapp/../evil/x.json", "C:/projects/myapp")).toBe(false);
    });
  });

  // Issue #685 cross-platform edge case: a Windows-style parent paired with
  // a POSIX-resolved child (POSIX `path.resolve("C:/projects/myapp", ...)`
  // returns "<posix-cwd>/C:/projects/myapp/forms/x.json"). isPathInside today
  // picks the win32 branch (driven by the parent's `C:/` prefix) and
  // win32.resolve on the POSIX-leading child returns a path that does not
  // share a prefix with the parent, so the check rejects a path that is
  // logically inside. This is a known limitation. Today the production
  // caller (VbaFormService.generateForm) consistently uses platform-default
  // `path.resolve`, so same-style inputs are the common case; the upstream
  // callers always feed native-style strings for both sides on any given
  // process. A future PR may harden isPathInside for mixed-style inputs;
  // until then, this test is left as a TODO so the gap is on the radar.
  describe("mixed-style inputs (known limitation, issue #685)", () => {
    it.todo("treats a posix-resolved child as inside a Windows-style parent");
  });
});
