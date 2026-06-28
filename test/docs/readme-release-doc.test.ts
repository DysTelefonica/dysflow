import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("README release and update guidance", () => {
  it("uses current release guidance instead of hardcoded latest install versions (#588)", async () => {
    const readme = await readFile("README.md", "utf8");
    const installSection = sectionBetween(readme, "## Installation", "### Runtime install");

    expect(installSection).toContain("https://github.com/DysTelefonica/dysflow/releases/latest");
    expect(installSection).toContain("release asset");
    expect(installSection).not.toMatch(/Latest version from GitHub remote/i);
    expect(installSection).not.toMatch(
      /git\+https:\/\/github\.com\/DysTelefonica\/dysflow\.git#v\d+\.\d+\.\d+/i,
    );
  });

  it("aligns update instructions with the release tarball trust model (#589)", async () => {
    const readme = await readFile("README.md", "utf8");
    const trustModel = await readFile("docs/security/update-trust-model.md", "utf8");
    const updateSection = sectionBetween(readme, "### Updating Dysflow", "## OpenCode MCP config");

    for (const doc of [updateSection, trustModel]) {
      expect(doc).toContain("GitHub Release archive");
      expect(doc).toContain("SHA-256");
      expect(doc).toContain("no source-build or git-clone fallback");
      expect(doc).toContain("release asset/checksum");
      expect(doc).toContain("abort");
    }
  });

  it("uses env-first HTTP token configuration in the project config example (#592)", async () => {
    const readme = await readFile("README.md", "utf8");
    const configSection = sectionBetween(
      readme,
      "### Project config examples",
      "### Runtime operation state",
    );

    expect(configSection).toContain('"httpTokenEnv": "DYSFLOW_HTTP_TOKEN"');
    expect(configSection).toContain("env-first");
    expect(configSection).toContain("inline `httpToken` is local-only");
    expect(configSection).toContain("must not be committed");
  });
});

function sectionBetween(content: string, startHeading: string, endHeading: string): string {
  const start = content.indexOf(startHeading);
  const end = content.indexOf(endHeading, start + startHeading.length);
  expect(start, `missing start heading ${startHeading}`).toBeGreaterThanOrEqual(0);
  expect(end, `missing end heading ${endHeading}`).toBeGreaterThan(start);
  return content.slice(start, end);
}
