import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Issue #480: docs/security/ used to reference internal source code by
 * `file:line` numbers (e.g. `access-runner.ts:596-608`). Those refs rotted on
 * the first refactor after they were written. This test asserts that the docs
 * now use symbol anchors and contain no exact-line refs to internal TypeScript
 * implementation details.
 */
describe("docs/security — uses symbol anchors, not file:line refs (#480)", () => {
  async function readAllSecurityDocs(): Promise<Map<string, string>> {
    const dir = "docs/security";
    const entries = await readdir(dir);
    const out = new Map<string, string>();
    for (const name of entries) {
      if (!name.endsWith(".md")) continue;
      out.set(name, await readFile(join(dir, name), "utf8"));
    }
    return out;
  }

  it("contains no exact line refs to internal TypeScript source positions", async () => {
    const docs = await readAllSecurityDocs();
    // Matches things like `foo.ts:123` or `foo.ts:123-456`. We exclude
    // `http://`, `https://`, and any URL with a scheme. The refs we ban point
    // at relative `src/...` paths.
    const lineRefPattern = /`?src\/[^\s`]+\.ts:\d+(?:-\d+)?`?/g;
    const offenders: string[] = [];
    for (const [name, content] of docs) {
      const matches = content.match(lineRefPattern);
      if (matches) {
        for (const m of matches) offenders.push(`${name}: ${m}`);
      }
    }
    expect(offenders, `found stale file:line refs in security docs`).toEqual([]);
  });

  it("update-trust-model.md documents both arg-construction call sites by symbol", async () => {
    const content = await readFile("docs/security/update-trust-model.md", "utf8");
    // The two callers are now anchored by their function name + the file, not
    // by a line range.
    expect(content).toContain("`buildPowerShellArguments`");
    expect(content).toContain("`spawnVbaManager`");
    expect(content).toContain("src/core/runner/access-runner.ts");
    expect(content).toContain("src/adapters/vba-sync/vba-sync-adapter.ts");
  });
});
