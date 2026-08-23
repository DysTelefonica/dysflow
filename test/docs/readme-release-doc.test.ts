import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
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

      // #1521 scoped the guarantee to the channels that fetch published release archives.
      // It is no longer absolute, so the channels it covers must be named alongside it.
      expect(doc, "the no-fallback guarantee must name the channels it covers").toMatch(
        /`stable` (?:and|or) `beta`/,
      );

      // The guarantee may be scoped, never annulled. Only a terminator or `exists` may follow
      // the phrase, so a weakening clause (" except on ...", " is available ...") fails here.
      expect(doc).not.toMatch(/(?:source-build|git-clone) fallback(?!(?:[.:]|\s+exists\b))/i);
    }
  });

  it("documents the insecure-update gate the installer actually enforces (#1521)", async () => {
    const gates = await installerGateNames();
    expect(gates, "the installer should enforce exactly one insecure-update gate").toHaveLength(1);

    const gate = gates[0] as string;
    const readme = await readFile("README.md", "utf8");
    const trustModel = await readFile("docs/security/update-trust-model.md", "utf8");
    const updateSection = sectionBetween(readme, "### Updating Dysflow", "## OpenCode MCP config");

    for (const doc of [updateSection, trustModel]) {
      expect(doc, `both documents must name ${gate} as the gate`).toContain(gate);

      // Qualification is asserted per paragraph, not per document. A document-wide match would
      // be satisfied by the words appearing anywhere, which lets the paragraph that actually
      // makes the claim lose its gate or its "verifies nothing" without any test noticing.
      const claims = doc
        .split(/\r?\n\s*\r?\n/)
        .filter(
          (paragraph) =>
            /`main`/.test(paragraph) &&
            /source build|builds from|building from source/i.test(paragraph),
        );

      expect(claims.length, "the `main` source build must be documented").toBeGreaterThan(0);
      for (const claim of claims) {
        expect(claim, "every `main` source-build claim must name its gate").toContain(gate);
        expect(claim, "every `main` source-build claim must state it verifies nothing").toMatch(
          /verifies nothing|no verification|unverified/i,
        );
      }
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

  it("uses env-first HTTP token configuration in the HTTP API section (#592)", async () => {
    const readme = await readFile("README.md", "utf8");
    const httpApiSection = sectionBetween(readme, "## HTTP API (local)", "## CLI");

    expect(httpApiSection).toContain("httpTokenEnv");
    expect(httpApiSection).toContain("DYSFLOW_HTTP_TOKEN");
    expect(httpApiSection).toContain("env-first");
    expect(httpApiSection).toContain("inline `httpToken` is local-only");
    expect(httpApiSection).toContain("must not be committed");
    expect(httpApiSection).not.toMatch(/set `httpToken` in \.dysflow\/project\.json/i);
  });

  it("does not reintroduce stale security-sensitive README guidance", async () => {
    const readme = await readFile("README.md", "utf8");
    const installSection = sectionBetween(readme, "## Installation", "### Runtime install");
    const updateSection = sectionBetween(readme, "### Updating Dysflow", "## OpenCode MCP config");
    const inlineTokenLines = readme
      .split(/\r?\n/)
      .filter((line) => line.includes("httpToken") && !line.includes("httpTokenEnv"));

    expect(
      inlineTokenLines.every(
        (line) =>
          line.includes("local-only") ||
          line.includes("must not be committed") ||
          line.includes("When neither"),
      ),
    ).toBe(true);
    expect(updateSection).toContain("no source-build or git-clone fallback");
    expect(updateSection).not.toMatch(
      /(?:source-build|git-clone) fallback(?!(?:[.:]|\s+exists\b))/i,
    );
    expect(installSection).not.toMatch(
      /git\+https:\/\/github\.com\/DysTelefonica\/dysflow\.git#v\d+\.\d+\.\d+/i,
    );
    expect(installSection).not.toMatch(/v\d+\.\d+\.\d+/i);
  });
});

/**
 * The insecure-update gate is enforced by the installer, not by prose. Deriving its name from the
 * installer source means renaming the variable in code fails this test until both documents are
 * corrected, instead of leaving docs that name a variable nothing reads.
 */
async function installerGateNames(): Promise<string[]> {
  const directory = "src/cli/commands/install";
  const names = new Set<string>();

  for (const entry of await readdir(directory)) {
    if (!entry.endsWith(".ts")) continue;
    const source = await readFile(join(directory, entry), "utf8");
    for (const match of source.matchAll(/\bDYSFLOW_[A-Z0-9_]*INSECURE[A-Z0-9_]*\b/g)) {
      names.add(match[0]);
    }
  }

  return [...names];
}

function sectionBetween(content: string, startHeading: string, endHeading: string): string {
  const start = content.indexOf(startHeading);
  const end = content.indexOf(endHeading, start + startHeading.length);
  expect(start, `missing start heading ${startHeading}`).toBeGreaterThanOrEqual(0);
  expect(end, `missing end heading ${endHeading}`).toBeGreaterThan(start);
  return content.slice(start, end);
}
