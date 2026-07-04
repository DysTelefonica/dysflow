/**
 * `vba-form-service-file-system-port.test.ts` — created in #hexagonal-tech-debt PR 4.
 *
 * Pins the spec scenario
 *   "VbaFormService.ts no longer imports `node:fs/promises`"
 *   (delta for `access-core-services`, #A, #624).
 *
 * The production Node adapter is injected by adapter-side composition roots.
 * `test/core/services/vba-form-service.test.ts` covers both explicit production
 * injection and fake-port injection paths.
 *
 * This file adds ONLY the structural pin: the service source MUST NOT import
 * `node:fs/promises` and MUST NOT declare a local Node filesystem constant —
 * the port adapter at `src/adapters/services/node-form-file-system.ts` is
 * the only owner of the Node implementation.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("VbaFormService fileSystem port structural pin (#A #624)", () => {
  it("vba-form-service.ts source does not import node:fs/promises and does not declare a local Node filesystem constant", () => {
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

    // The service file MUST NOT declare a local Node filesystem constant —
    // concrete implementations live in adapter modules instead.
    const hasLocalNodeFileSystemConst = /\bconst\s+node(?:Form)?FileSystem\b\s*[:=]/.test(source);
    expect(hasLocalNodeFileSystemConst).toBe(false);
  });
});
