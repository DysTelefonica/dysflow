/**
 * `vba-form-service-file-system-port.test.ts` — created in #hexagonal-tech-debt PR 4.
 *
 * Pins the spec scenario
 *   "VbaFormService.ts no longer imports `node:fs/promises`"
 *   (delta for `access-core-services`, #A, #624).
 *
 * The spec also requires
 *   "Default factory wires the Node adapter (happy)" and
 *   "Test injection path still works (regression)".
 * The first is exercised by every test in `test/core/services/vba-form-service.test.ts`
 * that constructs `new VbaFormService({ cwd })` without `fileSystem` and expects a
 * real-FS write to land on disk — those tests already pass and remain GREEN after
 * the refactor. The second is pinned by the same suite (49 existing tests inject
 * a fake `fileSystem`).
 *
 * This file adds ONLY the structural pin: the service source MUST NOT import
 * `node:fs/promises` and MUST NOT declare a local `const nodeFileSystem` —
 * the port adapter at `src/adapters/services/node-form-file-system.ts` is
 * the only owner of the Node implementation.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("VbaFormService fileSystem port structural pin (#A #624)", () => {
  it("vba-form-service.ts source does not import node:fs/promises and does not declare a local const nodeFileSystem", () => {
    const sourcePath = join(
      __dirname,
      "..",
      "..",
      "..",
      "src",
      "core",
      "services",
      "vba-form-service.ts",
    );
    const source = readFileSync(sourcePath, "utf8");

    // The only legal import that mentions `node:fs` is a JSDoc comment.
    // Match a real `import ... from "node:fs/promises"` statement, not a comment.
    const hasNodeFsPromisesImport = /^\s*import\s+[^;]*from\s+["']node:fs\/promises["']/m.test(
      source,
    );
    expect(hasNodeFsPromisesImport).toBe(false);

    // The service file MUST NOT declare a local `nodeFileSystem` constant —
    // the default impl lives in the adapter module instead.
    const hasLocalNodeFileSystemConst = /\bconst\s+nodeFileSystem\b\s*[:=]/.test(source);
    expect(hasLocalNodeFileSystemConst).toBe(false);
  });
});
