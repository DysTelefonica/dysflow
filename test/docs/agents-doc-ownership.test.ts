import { readdir, readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

/**
 * Doc-anchor test for the "Documentation ownership" section of AGENTS.md.
 *
 * The section tells contributors which doc to update per change and which test anchors it.
 * A table of paths rots silently: a renamed test or a moved doc leaves the table pointing at
 * nothing, and the reader follows a dead reference. These assertions keep the table honest.
 *
 * The section also names which anchors compare a doc against the live surface rather than a
 * literal string. That is a claim about this directory, so it is asserted against the directory.
 */
const OWNERSHIP_HEADING = "## Documentation ownership — keep docs with the change";
const NEXT_HEADING = "## VBA semantic diff — behavioral contract";

/** Anchors that derive their expectation from the runtime or its source, not a fixed string. */
const RUNTIME_ANCHORS = [
  "add-a-tool-checklist-1493.test.ts",
  "architecture-doc.test.ts",
  "dysflow-usage-examples-1611.test.ts",
  "example-input-properties-contract.test.ts",
  "mcp-readme-tool-surface.test.ts",
  "project-config-removed-fields-contract-1580.test.ts",
  "resolve-project-recovery-example.test.ts",
  "verify-code-diagnostic-contract-1535.test.ts",
  "write-tool-preflight.test.ts",
] as const;

/**
 * An anchor is runtime-derived when it imports a symbol from `src/`, or binds a `src/` path it
 * later reads. Asserting that a doc *contains* the text `src/...` is a literal-string anchor and
 * must not match here.
 */
const DERIVES_FROM_SOURCE = /from "\.\.\/\.\.\/src\/|=\s*"src\//;

describe("AGENTS.md documentation ownership", () => {
  it("names only anchor tests that exist", async () => {
    const section = await ownershipSection();
    const named = [...section.matchAll(/`test\/docs\/([\w.-]+\.test\.ts)`/g)].map((m) => m[1]);
    const present = new Set(await readdir("test/docs"));

    expect(named.length, "the table should cite at least one anchor test").toBeGreaterThan(0);
    expect(named.filter((name) => name !== undefined && !present.has(name))).toEqual([]);
  });

  it("links only documents that exist", async () => {
    const section = await ownershipSection();
    const links = [...section.matchAll(/\]\(\.\/([^)#]+)\)/g)].map((m) => m[1]);
    const missing: string[] = [];

    for (const link of links) {
      if (link === undefined) continue;
      try {
        await readFile(link, "utf8");
      } catch {
        missing.push(link);
      }
    }

    expect(links.length, "the section should link the docs it owns").toBeGreaterThan(0);
    expect(missing).toEqual([]);
  });

  it("names every anchor that compares a doc against src", async () => {
    const anchors = (await readdir("test/docs")).filter((file) => file.endsWith(".test.ts"));
    const comparesSrc: string[] = [];

    for (const anchor of anchors) {
      if (anchor === "agents-doc-ownership.test.ts") continue;
      const source = await readFile(`test/docs/${anchor}`, "utf8");
      if (DERIVES_FROM_SOURCE.test(source)) comparesSrc.push(anchor);
    }

    expect(
      comparesSrc.sort(),
      "AGENTS.md lists the runtime-comparing anchors; update that list and this one together",
    ).toEqual([...RUNTIME_ANCHORS].sort());
  });

  it("names those anchors in the section itself", async () => {
    const section = await ownershipSection();

    for (const anchor of RUNTIME_ANCHORS) {
      expect(section, `the section should name ${anchor}`).toContain(anchor);
    }
  });
});

async function ownershipSection(): Promise<string> {
  const agents = await readFile("AGENTS.md", "utf8");
  const start = agents.indexOf(OWNERSHIP_HEADING);
  const end = agents.indexOf(NEXT_HEADING, start + OWNERSHIP_HEADING.length);

  expect(start, `AGENTS.md should include ${OWNERSHIP_HEADING}`).toBeGreaterThanOrEqual(0);
  expect(end, `AGENTS.md should include ${NEXT_HEADING} after it`).toBeGreaterThan(start);

  return agents.slice(start, end);
}
