import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const tag = process.argv[2];
const usage = "Usage: node scripts/check-release-notes.mjs <version-tag>";
if (tag === "--help" && process.argv.length === 3) {
  console.log(usage);
  process.exit(0);
}
try {
  if (
    process.argv.length !== 3 ||
    !/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(tag ?? "")
  ) {
    throw new Error(usage);
  }
  const text = await readFile(resolve("docs", "releases", `${tag}.md`), "utf8");
  if (!text.trim()) throw new Error("Release notes are empty");
  if (text.replace(/^\uFEFF/, "").split(/\r?\n/)[0] !== `# ${tag}`) {
    throw new Error("Release notes title does not match the tag");
  }
  const headings = new Set([...text.matchAll(/^## (.+)$/gm)].map((match) => match[1].trim()));
  for (const heading of [
    "Summary",
    "Provenance",
    "Integrated pull requests",
    "Verification evidence",
    "Compatibility and configuration",
    "Upgrade and rollback",
    "Closure register",
  ]) {
    if (!headings.has(heading)) throw new Error(`Missing release notes section: ${heading}`);
  }
  console.log(`Validated release notes for ${tag}.`);
} catch (error) {
  console.error(`Release notes validation failed: ${error.message}`);
  process.exitCode = 1;
}
