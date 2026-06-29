import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

/**
 * Doc-anchor test for the Form UI Factory README honesty claim.
 *
 * Issue #596 (slice 1) closed the read half of #563. The slice 1 deliverable includes
 * a README fix that explicitly states `generate_form` writes a `.form.json` stub and
 * does NOT create a live Access form. This test pins that claim and the matching
 * source-only claim for `inspect_form` so a future revert is caught before it lands.
 *
 * Strategy: locate the inventory line for each tool in the MCP tool surface, then
 * assert the presence of honest markers (`.form.json` / `Does not …` /
 * `offline` / `read-only`) and the absence of the pre-slice-1 capability lies
 * (`compile a live Access form` / `create a live Access form` / `build a live
 * Access form`) used as positive claims.
 */
describe("Form UI Factory README honesty (#596)", () => {
  it("README documents `generate_form` as a `.form.json` stub writer, not a form compiler", async () => {
    const readme = await readFile("README.md", "utf8");
    const line = readmeInventoryLine(readme, "generate_form");

    // Positive: the entry mentions the `.form.json` stub.
    expect(line, "generate_form inventory entry").toContain(".form.json");
    // Positive: the entry uses the "Does not …" honesty form.
    expect(line, "generate_form inventory entry").toMatch(/Does not/i);
    // Negative: the entry does NOT make an UN-NEGATED claim that the tool
    // compiles / creates / builds a live Access form. The substring "compile a live
    // Access form" / "create a live Access form" is allowed ONLY when it sits
    // inside a "Does not …" clause. We split the line on the first "Does not"
    // (or any other negation) and forbid the lie in the un-negated prefix.
    const unNegatedPrefix = line.split(/does not/i)[0] ?? line;
    const lie = /\b(compile|create|build)s?\s+a\s+live\s+Access\s+form\b/i;
    expect(
      unNegatedPrefix,
      "un-negated prefix of the generate_form entry must not claim it compiles/creates a live Access form",
    ).not.toMatch(lie);
  });

  it("README documents `inspect_form` as source-only, read-only, and offline", async () => {
    const readme = await readFile("README.md", "utf8");
    const line = readmeInventoryLine(readme, "inspect_form");

    // Positive: the entry mentions the source `.form.txt` file format.
    expect(line, "inspect_form inventory entry").toContain(".form.txt");
    // Positive: the entry claims offline / read-only / without-Access behaviour.
    // At least one of these three phrasings is required.
    const hasOfflineClaim =
      /offline/i.test(line) ||
      /read-only/i.test(line) ||
      /Access is not required/i.test(line) ||
      /without Access/i.test(line);
    expect(
      hasOfflineClaim,
      "inspect_form inventory entry must claim source-only / offline / read-only behaviour",
    ).toBe(true);
  });
});

function readmeInventoryLine(readme: string, toolName: string): string {
  const lines = readme.split(/\r?\n/);
  const line = lines.find((l) => l.includes(`**\`${toolName}\`**`));
  expect(line, `README must include an inventory entry for \`${toolName}\``).toBeDefined();
  return line ?? "";
}
