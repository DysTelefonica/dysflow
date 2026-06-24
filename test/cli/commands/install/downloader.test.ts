import { createHash, sign as cryptoSign, generateKeyPairSync } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  assertSafeArchiveEntries,
  createGitHubReleaseRequestHeaders,
  createGitHubReleaseUpdateProvider,
  validateReleaseTagName,
  verifyChecksumsSignature,
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

describe("assertSafeArchiveEntries", () => {
  it("accepts a listing of normal relative entries", () => {
    const listing = [
      "source/",
      "source/package.json",
      "source/dist/cli/index.js",
      "source/scripts/dysflow-access-runner.ps1",
    ].join("\n");
    expect(() => assertSafeArchiveEntries(listing)).not.toThrow();
  });

  it("ignores blank and whitespace-only lines", () => {
    const listing = "\nsource/package.json\n  \n\tsource/dist/index.js\n";
    expect(() => assertSafeArchiveEntries(listing)).not.toThrow();
  });

  it("accepts filenames that merely contain dots (not a .. segment)", () => {
    expect(() => assertSafeArchiveEntries("source/foo..bar.js\nsource/...rc")).not.toThrow();
  });

  it("rejects a parent-traversal segment", () => {
    expect(() => assertSafeArchiveEntries("source/../../etc/cron.d/evil")).toThrow(/unsafe/i);
  });

  it("rejects a leading parent-traversal segment", () => {
    expect(() => assertSafeArchiveEntries("../outside.js")).toThrow(/unsafe/i);
  });

  it("rejects an absolute POSIX path", () => {
    expect(() => assertSafeArchiveEntries("/etc/passwd")).toThrow(/unsafe/i);
  });

  it("rejects a Windows drive-letter absolute path", () => {
    expect(() => assertSafeArchiveEntries("C:/Windows/System32/evil.dll")).toThrow(/unsafe/i);
  });

  it("rejects a Windows backslash drive-letter absolute path", () => {
    expect(() => assertSafeArchiveEntries("C:\\Windows\\System32\\evil.dll")).toThrow(/unsafe/i);
  });

  it("rejects a UNC path", () => {
    expect(() => assertSafeArchiveEntries("//server/share/evil")).toThrow(/unsafe/i);
  });

  it("rejects a backslash parent-traversal segment", () => {
    expect(() => assertSafeArchiveEntries("source\\..\\..\\evil")).toThrow(/unsafe/i);
  });
});

describe("verifyChecksumsSignature", () => {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const pubPem = publicKey.export({ format: "pem", type: "spki" }).toString();
  const checksums =
    "1111111111111111111111111111111111111111111111111111111111111111  dysflow-v1.0.0.tar.gz\n";
  const signature = cryptoSign(null, Buffer.from(checksums, "utf8"), privateKey).toString("base64");

  it("returns true for a valid signature over the checksums", () => {
    expect(verifyChecksumsSignature(checksums, signature, pubPem)).toBe(true);
  });

  it("returns false when the checksums text was tampered", () => {
    expect(verifyChecksumsSignature(`${checksums}# tampered`, signature, pubPem)).toBe(false);
  });

  it("returns false for a signature produced by a different key", () => {
    const other = generateKeyPairSync("ed25519");
    const otherSig = cryptoSign(null, Buffer.from(checksums, "utf8"), other.privateKey).toString(
      "base64",
    );
    expect(verifyChecksumsSignature(checksums, otherSig, pubPem)).toBe(false);
  });

  it("returns false for a malformed public key", () => {
    expect(verifyChecksumsSignature(checksums, signature, "-----not a key-----")).toBe(false);
  });

  it("returns false for a malformed signature", () => {
    expect(verifyChecksumsSignature(checksums, "!!! not base64 !!!", pubPem)).toBe(false);
  });
});

describe("createGitHubReleaseUpdateProvider — signature verification (fail-closed)", () => {
  it("rejects the update when a signing key is configured and the signature is invalid", async () => {
    const originalFetch = globalThis.fetch;
    const mockFetch = vi.fn();
    globalThis.fetch = mockFetch;
    const { publicKey } = generateKeyPairSync("ed25519");
    const pubPem = publicKey.export({ format: "pem", type: "spki" }).toString();
    try {
      const archiveBytes = Buffer.from("FAKE_ARCHIVE");
      const archiveHash = createHash("sha256").update(archiveBytes).digest("hex");
      // 1: archive
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new Uint8Array(archiveBytes).slice().buffer,
        status: 200,
      });
      // 2: SHA256SUMS (hash matches, so failure can only come from the signature gate)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => `${archiveHash}  dysflow-v1.0.0.tar.gz\n`,
      });
      // 3: SHA256SUMS.sig — a syntactically valid but WRONG signature
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => Buffer.from("not-the-real-signature").toString("base64"),
      });

      const provider = createGitHubReleaseUpdateProvider({ signingPublicKeyPem: pubPem });
      await expect(
        provider.preparePackage({ version: "1.0.0", tagName: "v1.0.0" }),
      ).rejects.toThrow(/signature/i);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("does NOT fetch a signature when no signing key is configured (default)", async () => {
    const originalFetch = globalThis.fetch;
    const mockFetch = vi.fn();
    globalThis.fetch = mockFetch;
    try {
      const archiveBytes = Buffer.from("FAKE_ARCHIVE");
      const archiveHash = createHash("sha256").update(archiveBytes).digest("hex");
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new Uint8Array(archiveBytes).slice().buffer,
        status: 200,
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => `${archiveHash}  dysflow-v1.0.0.tar.gz\n`,
      });
      const provider = createGitHubReleaseUpdateProvider();
      // tar is mocked to empty stdout, so extraction proceeds; the point is only TWO fetches
      // (archive + checksums), never a third for the signature.
      await provider.preparePackage({ version: "1.0.0", tagName: "v1.0.0" }).catch(() => {});
      expect(mockFetch).toHaveBeenCalledTimes(2);
    } finally {
      globalThis.fetch = originalFetch;
    }
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

  it("throws HTTP error verbatim when GitHub API returns non-ok status (no gh CLI fallback)", async () => {
    const originalFetch = globalThis.fetch;
    const mockFetch = vi.fn();
    globalThis.fetch = mockFetch;
    execFileMock.mockClear();
    try {
      // API returns 403
      mockFetch.mockResolvedValueOnce({ ok: false, status: 403 });
      const provider = createGitHubReleaseUpdateProvider();
      await expect(provider.resolveLatestRelease()).rejects.toThrow("HTTP 403");
      // gh must NOT have been invoked
      expect(execFileMock).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("throws HTTP error verbatim when API returns 503 (no gh CLI fallback)", async () => {
    const originalFetch = globalThis.fetch;
    const mockFetch = vi.fn();
    globalThis.fetch = mockFetch;
    execFileMock.mockClear();
    try {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 503 });
      const provider = createGitHubReleaseUpdateProvider();
      await expect(provider.resolveLatestRelease()).rejects.toThrow("HTTP 503");
      expect(execFileMock).not.toHaveBeenCalled();
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

  it("refuses to extract when the archive listing contains a traversal entry", async () => {
    const originalFetch = globalThis.fetch;
    const mockFetch = vi.fn();
    globalThis.fetch = mockFetch;
    execFileMock.mockClear();
    // `tar -tzf` returns a malicious listing; everything else returns empty.
    execFileMock.mockImplementation(
      (_file: unknown, args: unknown, options: unknown, callback: (...a: unknown[]) => void) => {
        const cb = typeof options === "function" ? options : callback;
        const argList = Array.isArray(args) ? (args as string[]) : [];
        const stdout = argList.includes("-tzf") ? "source/package.json\n../../evil.sh\n" : "";
        if (cb) queueMicrotask(() => cb(null, { stdout, stderr: "" }));
      },
    );
    try {
      const archiveBytes = Buffer.from("FAKE_ARCHIVE");
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new Uint8Array(archiveBytes).slice().buffer,
        status: 200,
      });
      const provider = createGitHubReleaseUpdateProvider();
      await expect(
        provider.preparePackage({ version: "1.0.0", tagName: "v1.0.0" }, { skipChecksum: true }),
      ).rejects.toThrow(/unsafe/i);
    } finally {
      globalThis.fetch = originalFetch;
      // Restore the default empty-stdout mock for subsequent tests.
      execFileMock.mockImplementation(
        (_file: unknown, _args: unknown, options: unknown, callback: (...a: unknown[]) => void) => {
          const cb = typeof options === "function" ? options : callback;
          if (cb) queueMicrotask(() => cb(null, { stdout: "", stderr: "" }));
        },
      );
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
