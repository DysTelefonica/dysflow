import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("release signing key bootstrap", () => {
  it("generates release signing keys outside the repository by default", async () => {
    const script = await readFile(".github/scripts/generate-release-signing-key.sh", "utf8");

    expect(script).toContain("mktemp -d");
    expect(script).not.toMatch(/OUT_DIR=.*1:-\./);
    expect(script).toContain("RELEASE_SIGNING_KEY");
    expect(script).toContain("RELEASE_SIGNING_PUBLIC_KEY_PEM");
  });

  it("keeps generated private release keys out of git by default", async () => {
    const gitignore = await readFile(".gitignore", "utf8");
    const trustModel = await readFile("docs/security/update-trust-model.md", "utf8");

    expect(gitignore).toContain("dysflow-release.key");
    expect(gitignore).toContain("*.release-signing.key");
    expect(trustModel).toContain("GitHub Actions secret `RELEASE_SIGNING_KEY`");
    expect(trustModel).toContain("Do not commit the private key");
  });

  it("requires signed checksum manifests in the release workflow", async () => {
    const workflow = await readFile(".github/workflows/release.yml", "utf8");

    expect(workflow).toContain("Require release signing key");
    expect(workflow).toContain("secrets.RELEASE_SIGNING_KEY");
    expect(workflow).toContain("SHA256SUMS.sig");
    expect(workflow).toContain("fail_on_unmatched_files: true");
    expect(workflow).not.toMatch(/checksum-only \(unchanged\)/i);
  });
});
