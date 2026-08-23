/**
 * Issue #1521 — one `ReleaseUpdateProvider` contract, three implementations.
 *
 * These tests pin what each channel actually does at its I/O boundary: which
 * URL it reaches for, how far verification goes, and (for `main`) that the
 * downloaded source is built before it is handed to the installer. The HTTP
 * boundary and the process boundary are the only things stubbed.
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const execFileMock = vi.hoisted(() => vi.fn());
vi.mock("node:child_process", () => ({ execFile: execFileMock }));

import {
  createMainBranchArchiveProvider,
  createPrereleaseGitHubReleaseProvider,
  createReleaseUpdateProviderForChannel,
} from "../../../src/cli/commands/install/downloader";

type ExecCall = { file: string; args: string[]; cwd: string | undefined };

let execCalls: ExecCall[];
let originalFetch: typeof globalThis.fetch;

/**
 * Default process double: every subprocess succeeds with empty stdout, and a
 * `tar -xzf` materializes the single top-level directory a real GitHub branch
 * archive would have unpacked.
 */
function installExecMock(): void {
  execCalls = [];
  execFileMock.mockImplementation(
    (file: unknown, args: unknown, options: unknown, callback: (...a: unknown[]) => void) => {
      const cb = typeof options === "function" ? options : callback;
      const argList = Array.isArray(args) ? (args as string[]) : [];
      const cwd =
        typeof options === "object" && options !== null
          ? ((options as { cwd?: string }).cwd ?? undefined)
          : undefined;
      execCalls.push({ file: String(file), args: argList, cwd });
      if (argList.includes("-xzf") && cwd !== undefined) {
        mkdirSync(path.join(cwd, "dysflow-main"), { recursive: true });
      }
      if (cb) queueMicrotask(() => cb(null, { stdout: "", stderr: "" }));
    },
  );
}

beforeEach(() => {
  installExecMock();
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("createReleaseUpdateProviderForChannel", () => {
  it.each(["stable", "beta", "main"] as const)("returns the %s provider", (channel) => {
    expect(createReleaseUpdateProviderForChannel(channel).channel).toBe(channel);
  });

  it("marks only the main channel as rolling", () => {
    expect(createReleaseUpdateProviderForChannel("stable").isRolling).toBeUndefined();
    expect(createReleaseUpdateProviderForChannel("beta").isRolling).toBeUndefined();
    expect(createReleaseUpdateProviderForChannel("main").isRolling).toBe(true);
  });
});

describe("beta channel — prerelease resolution", () => {
  it("picks the newest published prerelease tag", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        { tag_name: "v2.40.0-rc.2", prerelease: true },
        { tag_name: "v2.40.0-rc.1", prerelease: true },
        { tag_name: "v2.39.0", prerelease: false },
      ],
    });
    globalThis.fetch = mockFetch as unknown as typeof globalThis.fetch;

    const release = await createPrereleaseGitHubReleaseProvider().resolveLatestRelease();

    expect(release).toEqual({ tagName: "v2.40.0-rc.2", version: "2.40.0-rc.2" });
  });

  it("skips drafts and tags outside the Dysflow tag grammar", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        { tag_name: "v2.41.0-rc.1", draft: true },
        { tag_name: "v2.40.0-rc1", prerelease: true },
        { tag_name: "nightly-2026-08-23", prerelease: true },
        { tag_name: "v2.40.0-beta.3", prerelease: true },
      ],
    });
    globalThis.fetch = mockFetch as unknown as typeof globalThis.fetch;

    const release = await createPrereleaseGitHubReleaseProvider().resolveLatestRelease();

    expect(release.tagName).toBe("v2.40.0-beta.3");
  });

  it("reports the documented code when no prerelease is published", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ tag_name: "v2.39.0", prerelease: false }],
    });
    globalThis.fetch = mockFetch as unknown as typeof globalThis.fetch;

    await expect(createPrereleaseGitHubReleaseProvider().resolveLatestRelease()).rejects.toThrow(
      /DYSFLOW_PRERELEASE_TAG_NOT_FOUND/,
    );
  });

  it("verifies SHA-256 but never asks for a release signature", async () => {
    const { createHash } = await import("node:crypto");
    const archiveBytes = Buffer.from("BETA_ARCHIVE");
    const archiveHash = createHash("sha256").update(archiveBytes).digest("hex");
    const mockFetch = vi.fn();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      arrayBuffer: async () => new Uint8Array(archiveBytes).slice().buffer,
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => `${archiveHash}  dysflow-v2.40.0-rc.1.tar.gz\n`,
    });
    globalThis.fetch = mockFetch as unknown as typeof globalThis.fetch;

    const prepared = await createPrereleaseGitHubReleaseProvider().preparePackage({
      version: "2.40.0-rc.1",
      tagName: "v2.40.0-rc.1",
    });

    // Archive + SHA256SUMS only: no third request for SHA256SUMS.sig.
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(String(mockFetch.mock.calls[0]?.[0])).toContain(
      "releases/download/v2.40.0-rc.1/dysflow-v2.40.0-rc.1.tar.gz",
    );
    await prepared.cleanup?.();
  });

  it("refuses a prerelease archive whose checksum does not match", async () => {
    const mockFetch = vi.fn();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      arrayBuffer: async () => new Uint8Array(Buffer.from("TAMPERED")).slice().buffer,
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => `${"0".repeat(64)}  dysflow-v2.40.0-rc.1.tar.gz\n`,
    });
    globalThis.fetch = mockFetch as unknown as typeof globalThis.fetch;

    await expect(
      createPrereleaseGitHubReleaseProvider().preparePackage({
        version: "2.40.0-rc.1",
        tagName: "v2.40.0-rc.1",
      }),
    ).rejects.toThrow(/Checksum mismatch/);
  });
});

describe("main channel — unverified source build", () => {
  it("downloads the branch archive and builds it before handing it over", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: async () => new Uint8Array(Buffer.from("MAIN_ARCHIVE")).slice().buffer,
    });
    globalThis.fetch = mockFetch as unknown as typeof globalThis.fetch;

    const prepared = await createMainBranchArchiveProvider().preparePackage({
      version: "main",
      commitSha: "c".repeat(40),
    });

    expect(String(mockFetch.mock.calls[0]?.[0])).toBe(
      "https://github.com/DysTelefonica/dysflow/archive/refs/heads/main.tar.gz",
    );
    expect(prepared.packageRoot.endsWith("dysflow-main")).toBe(true);
    expect(prepared.commitSha).toBe("c".repeat(40));

    const pnpmCalls = execCalls.filter(
      (call) => call.args.includes("pnpm.cmd") || call.file === "pnpm",
    );
    const flattened = pnpmCalls.map((call) => call.args.join(" "));
    expect(flattened.some((args) => args.includes("install"))).toBe(true);
    expect(flattened.some((args) => args.includes("build"))).toBe(true);
    for (const call of pnpmCalls) expect(call.cwd).toBe(prepared.packageRoot);

    await prepared.cleanup?.();
  });

  it("still refuses an archive listing that would escape the extraction root", async () => {
    execFileMock.mockImplementation(
      (file: unknown, args: unknown, options: unknown, callback: (...a: unknown[]) => void) => {
        const cb = typeof options === "function" ? options : callback;
        const argList = Array.isArray(args) ? (args as string[]) : [];
        const stdout = argList.includes("-tzf") ? "dysflow-main/ok.js\n../../evil.sh\n" : "";
        execCalls.push({ file: String(file), args: argList, cwd: undefined });
        if (cb) queueMicrotask(() => cb(null, { stdout, stderr: "" }));
      },
    );
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: async () => new Uint8Array(Buffer.from("MAIN_ARCHIVE")).slice().buffer,
    });
    globalThis.fetch = mockFetch as unknown as typeof globalThis.fetch;

    await expect(
      createMainBranchArchiveProvider().preparePackage({ version: "main" }),
    ).rejects.toThrow(/unsafe/i);
  });

  it("surfaces a failed branch-archive download instead of installing nothing", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 503 }) as unknown as typeof globalThis.fetch;

    await expect(
      createMainBranchArchiveProvider().preparePackage({ version: "main" }),
    ).rejects.toThrow(/HTTP 503/);
  });

  it("resolves HEAD without failing when the commit lookup is unavailable", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 403 }) as unknown as typeof globalThis.fetch;

    const release = await createMainBranchArchiveProvider().resolveLatestRelease();

    expect(release).toEqual({ version: "main" });
  });

  it("records the resolved HEAD commit when the lookup succeeds", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ sha: "d".repeat(40) }),
    }) as unknown as typeof globalThis.fetch;

    const release = await createMainBranchArchiveProvider().resolveLatestRelease();

    expect(release).toEqual({ version: "main", commitSha: "d".repeat(40) });
  });
});
