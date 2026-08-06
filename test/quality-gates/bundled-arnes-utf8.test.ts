import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const START = "<!-- dysflow:arnés -->";
const END = "<!-- /dysflow:arnés -->";
const MOJIBAKE_SENTINELS = ["ÔÇ", "Ôå", "├", "┬º", "ï»¿", "�"];

function markerBlock(text: string): string {
  const lines = text.replaceAll("\r\n", "\n").split("\n");
  const starts = lines.flatMap((line, index) => (line === START ? [index] : []));
  const ends = lines.flatMap((line, index) => (line === END ? [index] : []));
  const start = starts[0];
  const end = ends[0];
  if (
    starts.length !== 1 ||
    ends.length !== 1 ||
    start === undefined ||
    end === undefined ||
    end <= start
  ) {
    throw new Error("dysflow arnés must contain exactly one standalone marker pair");
  }
  return lines.slice(start, end + 1).join("\n");
}

async function readUtf8(relativePath: string): Promise<string> {
  const bytes = await readFile(path.join(repoRoot, relativePath));
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

describe("bundled dysflow arnés release bytes (#1328)", () => {
  it("is valid UTF-8 and rejects known mojibake sentinels", async () => {
    const skill = await readUtf8("skills/dysflow-arnes/SKILL.md");

    for (const sentinel of MOJIBAKE_SENTINELS) expect(skill).not.toContain(sentinel);
    expect(skill).toContain('last_dysflow_version: "2.36.2"');
    expect(skill).toContain("dysflow harness v0.8.0");
  });

  it("embeds the canonical bundled marker block byte-for-byte in AGENTS.md", async () => {
    const skill = await readUtf8("skills/dysflow-arnes/SKILL.md");
    const agents = await readUtf8("AGENTS.md");

    expect(markerBlock(agents)).toBe(markerBlock(skill));
  });
});
