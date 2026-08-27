import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

async function text(relativePath: string): Promise<string> {
  return await readFile(path.join(repoRoot, relativePath), "utf8");
}

function expectProgressiveDiscovery(content: string): void {
  const bootstrap = content.indexOf("bootstrap");
  const capabilities = content.indexOf("get_capabilities");
  expect(bootstrap).toBeGreaterThanOrEqual(0);
  expect(capabilities).toBeGreaterThan(bootstrap);
  expect(content).toMatch(/schema\s*\(?.{0,40}view.{0,20}index/is);
  expect(content).toMatch(/compact/i);
  expect(content).toMatch(/full/i);
  expect(content).toMatch(/advertis/i);
  expect(content).toMatch(/callable|invocable/i);
}

describe("progressive Dysflow discovery bundle (#1520)", () => {
  it.each([
    "skills/dysflow-usage/SKILL.md",
    "skills/dysflow-arnes/SKILL.md",
    "skills/dysflow-pointer-rollout/assets/pointer.md",
    "skills/dysflow-codegraph-update/SKILL.md",
    "docs/api/mcp-tools.md",
  ])("teaches bootstrap-first bounded discovery in %s", async (relativePath) => {
    expectProgressiveDiscovery(await text(relativePath));
  });

  it("teaches structured result parsing without treating bounded text as canonical (#1636)", async () => {
    const usage = await text("skills/dysflow-usage/SKILL.md");

    expect(usage).toMatch(/prefer `structuredContent` first/i);
    expect(usage).toMatch(/use `content\[0\]\.text` only when it contains the complete payload/i);
  });

  it("keeps the embedded AGENTS harness byte-equal to the canonical harness", async () => {
    const start = "<!-- dysflow:arnés -->";
    const end = "<!-- /dysflow:arnés -->";
    const block = (content: string) => {
      const normalized = content.replaceAll("\r\n", "\n");
      const startIndex = normalized.indexOf(`${start}\n`);
      const endIndex = normalized.indexOf(`\n${end}`, startIndex);
      return normalized.slice(startIndex, endIndex + end.length + 1);
    };
    expect(block(await text("AGENTS.md"))).toBe(block(await text("skills/dysflow-arnes/SKILL.md")));
  });
});
