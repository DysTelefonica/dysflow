import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import type {
  ComparisonFileSystemPort,
  VbaComparisonContext,
  VbaVerifyResult,
} from "../../../src/core/services/vba-source-comparison";
import {
  type ChunkedVerifyOptions,
  type ChunkTimeoutBehavior,
  resolveChunkOptions,
  runChunkedVerify,
  splitIntoChunks,
} from "../../../src/core/services/vba-source-comparison-chunking";

class StubFs implements ComparisonFileSystemPort {
  async mkdtemp(prefix: string): Promise<string> {
    return join(tmpdir(), `stub-${prefix}`);
  }
  async readdir(): Promise<readonly { name: string; isDirectory(): boolean; isFile(): boolean }[]> {
    return [];
  }
  async readFile(): Promise<string> {
    return "";
  }
  async rm(): Promise<void> {}
  tmpdir(): string {
    return tmpdir();
  }
  async exists(): Promise<boolean> {
    return false;
  }
}

function stubFileSystem(): ComparisonFileSystemPort {
  return new StubFs();
}

function makeContext(): VbaComparisonContext {
  return {
    scriptPath: "scripts/dysflow-vba-manager.ps1",
    accessPassword: undefined,
    resolveExecutionTarget: async (p: Record<string, unknown>) => ({
      ok: true as const,
      data: {
        accessPath: typeof p.accessPath === "string" ? p.accessPath : "C:/db.accdb",
        destinationRoot: typeof p.destinationRoot === "string" ? p.destinationRoot : "C:/src",
        timeoutMs: 1000,
      },
      diagnostics: [],
      durationMs: 0,
    }),
    validateStrictContext: () => ({
      ok: true as const,
      data: undefined,
      diagnostics: [],
      durationMs: 0,
    }),
    runPreflightCleanup: async () => ({
      cleaned: [],
      killed: [],
      orphanedKilled: [],
      errors: [],
    }),
    runVbaManager: (async () => {
      throw new Error("not used");
    }) as never,
  };
}

function makeEmptyVerifyResult(sourceRoot: string): VbaVerifyResult {
  return {
    operation: "verify_code",
    ok: true,
    dryRun: true,
    willModifyAccess: false,
    sourceRoot,
    matched: [],
    different: [],
    missingInSource: [],
    missingInBinary: [],
    vbeCacheNote: "",
  };
}

describe("splitIntoChunks (#807 Feature 3)", () => {
  it("even chunks", () => {
    expect(splitIntoChunks(["a", "b", "c", "d"], 2)).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });
  it("uneven last chunk", () => {
    expect(splitIntoChunks(["a", "b", "c", "d", "e"], 2)).toEqual([["a", "b"], ["c", "d"], ["e"]]);
  });
  it("size larger than array", () => {
    expect(splitIntoChunks(["a", "b"], 10)).toEqual([["a", "b"]]);
  });
  it("empty input", () => {
    expect(splitIntoChunks([], 10)).toEqual([]);
  });
});

describe("resolveChunkOptions (#807 Feature 3)", () => {
  it("returns disabled: true when no chunk params are set", () => {
    const r = resolveChunkOptions({});
    expect(r.disabled).toBe(true);
  });

  it("returns options when chunkSize is set alone", () => {
    const r = resolveChunkOptions({ chunkSize: 10 });
    expect(r.disabled).toBe(false);
    const opts = r.options as ChunkedVerifyOptions;
    expect(opts.chunkSize).toBe(10);
    expect(opts.parallelChunks).toBe(2);
    expect(opts.onChunkTimeout).toBe("retry");
  });

  it("clamps parallelChunks to 1..8", () => {
    const low = resolveChunkOptions({ parallelChunks: 0 });
    expect(low.options?.parallelChunks).toBe(2);
    const high = resolveChunkOptions({ parallelChunks: 50 });
    expect(high.options?.parallelChunks).toBe(8);
    const neg = resolveChunkOptions({ parallelChunks: -3 });
    expect(neg.options?.parallelChunks).toBe(2);
  });

  it("maps onChunkTimeout to the three documented values", () => {
    expect(resolveChunkOptions({ onChunkTimeout: "skip" }).options?.onChunkTimeout).toBe("skip");
    expect(resolveChunkOptions({ onChunkTimeout: "fail" }).options?.onChunkTimeout).toBe("fail");
    expect(resolveChunkOptions({ onChunkTimeout: "retry" }).options?.onChunkTimeout).toBe("retry");
    expect(
      resolveChunkOptions({ onChunkTimeout: "garbage" as ChunkTimeoutBehavior }).options
        ?.onChunkTimeout,
    ).toBe("retry");
  });
});

describe("runChunkedVerify (#807 Feature 3)", () => {
  it("small list (≤chunkSize): falls back to single-flight semantics — default disabled", () => {
    // When chunkSize is omitted `resolveChunkOptions` returns
    // `disabled:true`, so the upstream `compareSourceAgainstBinary` skips
    // the chunked branch and preserves the v2.3.x single-round-trip
    // behavior. This is the legacy compat invariant.
    const r = resolveChunkOptions({});
    expect(r.disabled).toBe(true);
  });

  it("parallelChunks: 2 + 4 modules + chunkSize 2 → two chunks of 2 modules each", async () => {
    const tmpRoot = await mkdtemp(join(tmpdir(), "dysflow-chunk-"));
    const { rm } = await import("node:fs/promises");
    try {
      await mkdir(tmpRoot, { recursive: true });
      const ctx = makeContext();
      const chunksObserved: number[] = [];
      const compareChunk = async (params: Record<string, unknown>) => {
        const names = Array.isArray(params.moduleNames) ? (params.moduleNames as string[]) : [];
        chunksObserved.push(names.length);
        return {
          ok: true as const,
          data: makeEmptyVerifyResult(tmpRoot),
        };
      };
      const result = await runChunkedVerify({
        params: {},
        ctx,
        fileSystem: stubFileSystem(),
        requestedModules: ["Mod0", "Mod1", "Mod2", "Mod3"],
        options: { chunkSize: 2, parallelChunks: 2, onChunkTimeout: "retry" },
        compareChunk: compareChunk as never,
      });
      expect(result.operation).toBe("verify_code");
      expect(result.ok).toBe(true);
      expect(result.chunkFailures).toEqual([]);
      expect(result.chunkTimedOut).toEqual([]);
      // Two chunks of 2 modules each.
      expect(chunksObserved.sort()).toEqual([2, 2]);
    } finally {
      await rm(tmpRoot, { recursive: true, force: true });
    }
  });

  it("removes chunk controls before invoking each single-flight comparison", async () => {
    const tmpRoot = await mkdtemp(join(tmpdir(), "dysflow-chunk-single-flight-"));
    const { rm } = await import("node:fs/promises");
    try {
      const received: Record<string, unknown>[] = [];
      const compareChunk = async (params: Record<string, unknown>) => {
        received.push(params);
        return {
          ok: true as const,
          data: makeEmptyVerifyResult(tmpRoot),
        };
      };
      await runChunkedVerify({
        params: {
          chunkSize: 1,
          parallelChunks: 2,
          onChunkTimeout: "skip",
          timeoutMs: 1234,
          accessPath: "C:/db.accdb",
        },
        ctx: makeContext(),
        fileSystem: stubFileSystem(),
        requestedModules: ["Mod0", "Mod1"],
        options: { chunkSize: 1, parallelChunks: 2, onChunkTimeout: "skip" },
        compareChunk: compareChunk as never,
      });

      expect(received).toHaveLength(2);
      for (const params of received) {
        expect(params).not.toHaveProperty("chunkSize");
        expect(params).not.toHaveProperty("parallelChunks");
        expect(params).not.toHaveProperty("onChunkTimeout");
        expect(params).toMatchObject({ timeoutMs: 1234, accessPath: "C:/db.accdb" });
        expect(params.moduleNames).toEqual(expect.arrayContaining([expect.stringMatching(/^Mod/)]));
      }
    } finally {
      await rm(tmpRoot, { recursive: true, force: true });
    }
  });

  it("onChunkTimeout: retry re-runs the chunk once before giving up", async () => {
    const tmpRoot = await mkdtemp(join(tmpdir(), "dysflow-chunk-retry-"));
    const { rm } = await import("node:fs/promises");
    try {
      await mkdir(tmpRoot, { recursive: true });
      const ctx = makeContext();
      let callsForFirstChunk = 0;
      const compareChunk = async () => {
        callsForFirstChunk += 1;
        if (callsForFirstChunk === 1) {
          return {
            ok: false as const,
            error: {
              code: "VERIFY_CODE_PHASE_TIMEOUT" as const,
              message: "synthetic timeout",
              retryable: true,
            },
          };
        }
        return {
          ok: true as const,
          data: makeEmptyVerifyResult(tmpRoot),
        };
      };
      const result = await runChunkedVerify({
        params: {},
        ctx,
        fileSystem: stubFileSystem(),
        requestedModules: ["Mod0"],
        options: { chunkSize: 1, parallelChunks: 1, onChunkTimeout: "retry" },
        compareChunk: compareChunk as never,
      });
      expect(result.ok).toBe(true);
      expect(result.chunkFailures).toEqual([]);
      expect(callsForFirstChunk).toBe(2);
    } finally {
      await rm(tmpRoot, { recursive: true, force: true });
    }
  });

  it("onChunkTimeout: skip records the chunk's modules as chunkTimedOut", async () => {
    const tmpRoot = await mkdtemp(join(tmpdir(), "dysflow-chunk-skip-"));
    const { rm } = await import("node:fs/promises");
    try {
      await mkdir(tmpRoot, { recursive: true });
      const ctx = makeContext();
      const compareChunk = async () => ({
        ok: false as const,
        error: {
          code: "VERIFY_CODE_PHASE_TIMEOUT" as const,
          message: "synthetic timeout",
          retryable: true,
        },
      });
      const result = await runChunkedVerify({
        params: {},
        ctx,
        fileSystem: stubFileSystem(),
        requestedModules: ["Mod0"],
        options: { chunkSize: 1, parallelChunks: 1, onChunkTimeout: "skip" },
        compareChunk: compareChunk as never,
      });
      expect(result.chunkTimedOut).toEqual(["Mod0"]);
      expect(result.chunkFailures).toEqual([]);
    } finally {
      await rm(tmpRoot, { recursive: true, force: true });
    }
  });

  it("onChunkTimeout: fail propagates the timeout as a chunk failure", async () => {
    const tmpRoot = await mkdtemp(join(tmpdir(), "dysflow-chunk-fail-"));
    const { rm } = await import("node:fs/promises");
    try {
      await mkdir(tmpRoot, { recursive: true });
      const ctx = makeContext();
      const compareChunk = async () => ({
        ok: false as const,
        error: {
          code: "VERIFY_CODE_PHASE_TIMEOUT" as const,
          message: "synthetic timeout",
          retryable: true,
        },
      });
      const result = await runChunkedVerify({
        params: {},
        ctx,
        fileSystem: stubFileSystem(),
        requestedModules: ["Mod0"],
        options: { chunkSize: 1, parallelChunks: 1, onChunkTimeout: "fail" },
        compareChunk: compareChunk as never,
      });
      expect(result.chunkFailures.length).toBeGreaterThanOrEqual(1);
      const firstFailure = result.chunkFailures[0];
      expect(firstFailure?.error.code).toBe("VERIFY_CODE_PHASE_TIMEOUT");
    } finally {
      await rm(tmpRoot, { recursive: true, force: true });
    }
  });
});
