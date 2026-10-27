// Issue #1890 (N4) — concurrent writers on the real base store. A stale writer
// must never restore an older hash, and writers for different modules must
// never drop each other's entries.
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FileVerifyBaseStore } from "../../../src/adapters/vba-sync/verify-base-file-store.js";
import * as base from "../../../src/core/services/vba-verify-base.js";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function project() {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), "issue-1890-store-")));
  roots.push(root);
  mkdirSync(join(root, ".dysflow"));
  const store = new FileVerifyBaseStore(root);
  const target = { accessPath: join(root, "Front.accdb"), projectRoot: root };
  const sourceRoot = join(root, "src");
  return { store, target, sourceRoot };
}

const at = (ms: number) => new Date(Date.UTC(2026, 9, 27, 0, 0, 0, ms));

describe("verify base store under concurrent writers", () => {
  it("keeps every module when writers for different modules interleave", async () => {
    const { store, target, sourceRoot } = project();
    const names = Array.from({ length: 12 }, (_, index) => `Module${index}`);

    await Promise.all(
      names.map((moduleName, index) =>
        base.recordVerifyBaseAgreement(
          store,
          target,
          sourceRoot,
          [{ moduleName, fileType: "bas", hash: `hash-${index}` }],
          at(index),
        ),
      ),
    );

    const { lookup } = await base.loadVerifyBaseLookup(store, target, sourceRoot);
    expect(lookup?.size).toBe(names.length);
  });

  it("a stale agreement written after an invalidation never restores the old hash", async () => {
    const { store, target, sourceRoot } = project();
    const agreed = [{ moduleName: "Probe", fileType: "bas", hash: "old" }];
    await base.recordVerifyBaseAgreement(store, target, sourceRoot, agreed, at(1));

    // A verify observed agreement at t=5; an import finished and invalidated at
    // t=10; the verify's write lands only afterwards.
    await base.invalidateVerifyBase(store, target, ["Probe"], at(10));
    await base.recordVerifyBaseAgreement(store, target, sourceRoot, agreed, at(5));

    const { lookup } = await base.loadVerifyBaseLookup(store, target, sourceRoot);
    expect(lookup).toBeUndefined();
  });

  it("an agreement observed after the invalidation is used again", async () => {
    const { store, target, sourceRoot } = project();
    await base.invalidateVerifyBase(store, target, "all", at(10));
    await base.recordVerifyBaseAgreement(
      store,
      target,
      sourceRoot,
      [{ moduleName: "Probe", fileType: "bas", hash: "fresh" }],
      at(11),
    );

    const { lookup } = await base.loadVerifyBaseLookup(store, target, sourceRoot);
    expect(lookup?.get(base.verifyBaseModuleKey("Probe", "bas"))).toBe("fresh");
  });
});
