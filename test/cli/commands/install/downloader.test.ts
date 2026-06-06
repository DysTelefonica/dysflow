import { describe, expect, it, vi } from "vitest";
import {
  createGitHubReleaseRequestHeaders,
  createGitHubReleaseUpdateProvider,
  validateReleaseTagName,
} from "../../../../src/cli/commands/install/downloader";

// Mock child_process for runCommand/runCommandOutput
const execFileMock = vi.hoisted(() => vi.fn());
vi.mock("node:child_process", () => ({
  execFile: execFileMock,
}));

execFileMock.mockImplementation(
  (_file: unknown, _args: unknown, options: unknown, callback: (...args: unknown[]) => void) => {
    const cb = typeof options === "function" ? options : callback;
    if (cb) {
      queueMicrotask(() => cb(null, { stdout: "", stderr: "" }));
    }
  },
);

describe("createGitHubReleaseRequestHeaders", () => {
  it("omits Authorization header when no token is present", () => {
    const headers = createGitHubReleaseRequestHeaders({});
    expect(headers).not.toHaveProperty("Authorization");
    expect(headers.Accept).toBe("application/vnd.github+json");
  });

  it("includes Authorization header when GH_TOKEN is set", () => {
    const headers = createGitHubReleaseRequestHeaders({ GH_TOKEN: "ghp_token123" });
    expect(headers.Authorization).toBe("Bearer ghp_token123");
  });

  it("includes Authorization header when GITHUB_TOKEN is set (GH_TOKEN takes precedence)", () => {
    const headers = createGitHubReleaseRequestHeaders({ GITHUB_TOKEN: "gh_fallback" });
    expect(headers.Authorization).toBe("Bearer gh_fallback");
  });

  it("omits Authorization header when token is empty string", () => {
    const headers = createGitHubReleaseRequestHeaders({ GH_TOKEN: "" });
    expect(headers).not.toHaveProperty("Authorization");
  });
});

describe("validateReleaseTagName", () => {
  it("accepts valid semver tags", () => {
    expect(validateReleaseTagName("v1.2.3")).toBe("v1.2.3");
    expect(validateReleaseTagName("v0.0.1")).toBe("v0.0.1");
  });

  it("throws for tags without v prefix", () => {
    expect(() => validateReleaseTagName("1.2.3")).toThrow("Invalid Dysflow release tag");
  });

  it("throws for pre-release tags", () => {
    expect(() => validateReleaseTagName("v1.2.3-beta")).toThrow("Invalid Dysflow release tag");
  });
});

describe("createGitHubReleaseUpdateProvider — resolveLatestRelease", () => {
  it("returns release info when GitHub API responds with valid tag_name", async () => {
    const originalFetch = globalThis.fetch;
    const mockFetch = vi.fn();
    globalThis.fetch = mockFetch;
    try {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ tag_name: "v2.0.0" }),
      });
      const provider = createGitHubReleaseUpdateProvider();
      const release = await provider.resolveLatestRelease();
      expect(release.version).toBe("2.0.0");
      expect(release.tagName).toBe("v2.0.0");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("throws when GitHub API response has no tag_name", async () => {
    const originalFetch = globalThis.fetch;
    const mockFetch = vi.fn();
    globalThis.fetch = mockFetch;
    try {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ name: "Latest Release" }), // no tag_name
      });
      const provider = createGitHubReleaseUpdateProvider();
      await expect(provider.resolveLatestRelease()).rejects.toThrow("tag_name");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("throws when GitHub API response has empty tag_name string", async () => {
    const originalFetch = globalThis.fetch;
    const mockFetch = vi.fn();
    globalThis.fetch = mockFetch;
    try {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ tag_name: "" }),
      });
      const provider = createGitHubReleaseUpdateProvider();
      await expect(provider.resolveLatestRelease()).rejects.toThrow("tag_name");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("falls back to gh CLI when GitHub API returns non-ok status and gh succeeds", async () => {
    const originalFetch = globalThis.fetch;
    const mockFetch = vi.fn();
    globalThis.fetch = mockFetch;
    try {
      // API returns 403
      mockFetch.mockResolvedValueOnce({ ok: false, status: 403 });

      // gh CLI returns a valid tag
      execFileMock.mockImplementationOnce(
        (
          _file: unknown,
          _args: unknown,
          options: unknown,
          callback: (...args: unknown[]) => void,
        ) => {
          const cb = typeof options === "function" ? options : callback;
          if (cb) {
            queueMicrotask(() => cb(null, { stdout: "v3.1.0\n", stderr: "" }));
          }
        },
      );

      const provider = createGitHubReleaseUpdateProvider();
      const release = await provider.resolveLatestRelease();
      expect(release.version).toBe("3.1.0");
      expect(release.tagName).toBe("v3.1.0");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("throws with HTTP status when API returns non-ok AND gh fallback also fails", async () => {
    const originalFetch = globalThis.fetch;
    const mockFetch = vi.fn();
    globalThis.fetch = mockFetch;
    try {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 503 });

      // gh CLI fails
      execFileMock.mockImplementationOnce(
        (
          _file: unknown,
          _args: unknown,
          options: unknown,
          callback: (...args: unknown[]) => void,
        ) => {
          const cb = typeof options === "function" ? options : callback;
          if (cb) {
            queueMicrotask(() => cb(new Error("gh not found"), null));
          }
        },
      );

      const provider = createGitHubReleaseUpdateProvider();
      await expect(provider.resolveLatestRelease()).rejects.toThrow("HTTP 503");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("createGitHubReleaseUpdateProvider — preparePackage", () => {
  it("skips checksum verification when skipChecksum is true", async () => {
    const originalFetch = globalThis.fetch;
    const mockFetch = vi.fn();
    globalThis.fetch = mockFetch;
    try {
      const archiveBytes = Buffer.from("FAKE_ARCHIVE");
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new Uint8Array(archiveBytes).slice().buffer,
        status: 200,
      });

      const provider = createGitHubReleaseUpdateProvider();
      let pkg: { cleanup?: () => Promise<void> } | undefined;
      try {
        // Will fail at tar extraction in test env — that's OK, we just need to get past checksum
        pkg = await provider.preparePackage(
          { version: "1.0.0", tagName: "v1.0.0" },
          { skipChecksum: true },
        );
      } catch {
        // tar extraction may fail in test environment
      }
      // Should have only fetched the archive, not the checksums file
      expect(mockFetch).toHaveBeenCalledTimes(1);
      await pkg?.cleanup?.();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("throws when checksums file download fails (non-ok status)", async () => {
    const originalFetch = globalThis.fetch;
    const mockFetch = vi.fn();
    globalThis.fetch = mockFetch;
    try {
      const archiveBytes = Buffer.from("FAKE_ARCHIVE");
      // Archive download succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new Uint8Array(archiveBytes).slice().buffer,
        status: 200,
      });
      // Checksums download fails
      mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });

      const provider = createGitHubReleaseUpdateProvider();
      await expect(
        provider.preparePackage({ version: "1.0.0", tagName: "v1.0.0" }),
      ).rejects.toThrow(/checksum|SHA256/i);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("throws when archive name not found in checksums file", async () => {
    const originalFetch = globalThis.fetch;
    const mockFetch = vi.fn();
    globalThis.fetch = mockFetch;
    try {
      const archiveBytes = Buffer.from("FAKE_ARCHIVE");
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new Uint8Array(archiveBytes).slice().buffer,
        status: 200,
      });
      // Checksums file does not contain the expected archive name
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () =>
          "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa  other-tool-v1.0.0.tar.gz\n",
      });

      const provider = createGitHubReleaseUpdateProvider();
      await expect(
        provider.preparePackage({ version: "1.0.0", tagName: "v1.0.0" }),
      ).rejects.toThrow("Expected hash");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("uses v-prefixed tag when release has no tagName but has version", async () => {
    const originalFetch = globalThis.fetch;
    const mockFetch = vi.fn();
    globalThis.fetch = mockFetch;
    try {
      const archiveBytes = Buffer.from("FAKE_ARCHIVE");
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new Uint8Array(archiveBytes).slice().buffer,
        status: 200,
      });
      mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });

      const provider = createGitHubReleaseUpdateProvider();
      // version without tagName — should derive tagName as "v2.0.0"
      await expect(
        provider.preparePackage({ version: "2.0.0" }), // no tagName
      ).rejects.toThrow(); // will fail at checksums, but proves it constructed the tag
      // The archive URL should include v2.0.0
      const archiveCall = mockFetch.mock.calls[0]?.[0] as string;
      expect(archiveCall).toContain("v2.0.0");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("throws an error on HTTP 404 archive not found", async () => {
    const originalFetch = globalThis.fetch;
    const mockFetch = vi.fn();
    globalThis.fetch = mockFetch;
    try {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });

      const provider = createGitHubReleaseUpdateProvider();
      await expect(
        provider.preparePackage({ version: "1.0.0", tagName: "v1.0.0" }),
      ).rejects.toThrow(/Release archive not available for version v1.0.0/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
