// Issue #1890 (N4) — concurrent writers on the real base store. A stale writer
// must never restore an older hash, and writers for different modules must
// never drop each other's entries.
import { mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync } from "node:fs";
import * as fsp from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FileVerifyBaseStore } from "../../../src/adapters/vba-sync/verify-base-file-store.js";
import * as base from "../../../src/core/services/vba-verify-base.js";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function project(fs?: ConstructorParameters<typeof FileVerifyBaseStore>[1]) {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), "issue-1890-store-")));
  roots.push(root);
  mkdirSync(join(root, ".dysflow"));
  const store = new FileVerifyBaseStore(root, fs);
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

  // Issue #1939 item 3 — two writers race on the SAME key. Both check the
  // existing value before either writes, then the newer write lands first and
  // the older one lands last. The newer observation must still win.
  function interleavedFs(stamp: (text: string) => string) {
    const held: { text: string; release: () => void }[] = [];
    let landed: (() => void) | undefined;
    const fs = {
      ...fsp,
      writeFile: (async (file: string, text: string, encoding: BufferEncoding) => {
        await new Promise<void>((release) => {
          held.push({ text, release });
          if (held.length < 2) return;
          held.sort((a, b) => stamp(b.text).localeCompare(stamp(a.text)));
          const [newer, older] = held;
          landed = () => older?.release();
          newer?.release();
        });
        await fsp.writeFile(file, text, encoding);
      }) as typeof fsp.writeFile,
      rename: (async (from: string, to: string) => {
        await fsp.rename(from, to);
        const next = landed;
        landed = undefined;
        next?.();
      }) as typeof fsp.rename,
    };
    return fs;
  }

  it("the newer agreement wins when the older same-key write lands last", async () => {
    const fs = interleavedFs((text) => JSON.parse(text).entry.observedAt);
    const { store, target, sourceRoot } = project(fs);

    await Promise.all([
      base.recordVerifyBaseAgreement(
        store,
        target,
        sourceRoot,
        [{ moduleName: "Probe", fileType: "bas", hash: "newer" }],
        at(20),
      ),
      base.recordVerifyBaseAgreement(
        store,
        target,
        sourceRoot,
        [{ moduleName: "Probe", fileType: "bas", hash: "older" }],
        at(10),
      ),
    ]);

    const { lookup } = await base.loadVerifyBaseLookup(
      new FileVerifyBaseStore(target.projectRoot),
      target,
      sourceRoot,
    );
    expect(lookup?.get(base.verifyBaseModuleKey("Probe", "bas"))).toBe("newer");
  });

  it("the newer invalidation wins when the older same-scope write lands last", async () => {
    const fs = interleavedFs((text) => JSON.parse(text).invalidation.invalidatedAt);
    const { store, target, sourceRoot } = project(fs);
    const plain = new FileVerifyBaseStore(target.projectRoot);
    const agreed = [{ moduleName: "Probe", fileType: "bas", hash: "h" }];
    // Observed between the two invalidations: only the newer one voids it.
    await base.recordVerifyBaseAgreement(plain, target, sourceRoot, agreed, at(15));

    await Promise.all([
      base.invalidateVerifyBase(store, target, ["Probe"], at(20)),
      base.invalidateVerifyBase(store, target, ["Probe"], at(10)),
    ]);

    const { lookup } = await base.loadVerifyBaseLookup(plain, target, sourceRoot);
    expect(lookup).toBeUndefined();
  });

  it("prunes older observations of a key once a newer one is stored", async () => {
    const { store, target, sourceRoot } = project();
    for (const [index, hash] of ["a", "b", "c"].entries()) {
      await base.recordVerifyBaseAgreement(
        store,
        target,
        sourceRoot,
        [{ moduleName: "Probe", fileType: "bas", hash }],
        at(index + 1),
      );
    }
    const baseDir = join(target.projectRoot, ".dysflow", "runtime", "verify-base");
    const [binaryDir] = readdirSync(baseDir);
    expect(readdirSync(join(baseDir, String(binaryDir)))).toHaveLength(1);
    const { lookup } = await base.loadVerifyBaseLookup(store, target, sourceRoot);
    expect(lookup?.get(base.verifyBaseModuleKey("Probe", "bas"))).toBe("c");
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
