#!/usr/bin/env node

import { access, mkdir, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const RELEASE_SKILL_NAMES = [
  "dysflow-arnes",
  "dysflow-usage",
  "dysflow-codegraph-update",
  "dysflow-examples-sync",
  "dysflow-pointer-rollout",
];

export const RELEASE_ARCHIVE_ENTRIES = [
  "dist",
  "scripts",
  "skills",
  "plugin",
  "references/error-codes.md",
  "docs/diagnostics/hresult-guide.md",
  "docs/diagnostics/form-import-gate-failures.md",
  "package.json",
  "pnpm-lock.yaml",
  "README.md",
  "CHANGELOG.md",
];

function requiredSkillPath(name) {
  return `skills/${name}/SKILL.md`;
}

export async function assertBundledSkillFiles(packageRoot) {
  for (const name of RELEASE_SKILL_NAMES) {
    const relativePath = requiredSkillPath(name);
    try {
      await access(path.join(packageRoot, relativePath));
    } catch {
      throw new Error(`Release bundle is missing required skill: ${relativePath}`);
    }
  }
}

export function assertReleaseArchiveManifest(listing) {
  const entries = new Set(
    listing
      .split(/\r?\n/)
      .map((entry) => entry.trim().replace(/^\.\//, "").replaceAll("\\", "/"))
      .filter(Boolean),
  );
  for (const name of RELEASE_SKILL_NAMES) {
    const required = requiredSkillPath(name);
    if (!entries.has(required)) {
      throw new Error(`Release archive is missing required skill: ${required}`);
    }
  }
}

function runTar(args, cwd) {
  const result = spawnSync("tar", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(
      `tar ${args[0] ?? ""} failed (${result.status ?? "unknown"}): ${result.stderr.trim()}`,
    );
  }
  return result.stdout;
}

export async function createReleaseArchive({ packageRoot, outputPath }) {
  const resolvedRoot = path.resolve(packageRoot);
  const resolvedOutput = path.resolve(outputPath);
  await assertBundledSkillFiles(resolvedRoot);
  await mkdir(path.dirname(resolvedOutput), { recursive: true });

  try {
    runTar(["-czf", resolvedOutput, ...RELEASE_ARCHIVE_ENTRIES], resolvedRoot);
    const listing = runTar(["-tzf", resolvedOutput], resolvedRoot);
    assertReleaseArchiveManifest(listing);
  } catch (error) {
    await rm(resolvedOutput, { force: true });
    throw error;
  }
}

async function main() {
  const outputPath = process.argv[2];
  if (outputPath === undefined || outputPath.trim().length === 0) {
    throw new Error("Usage: node .github/scripts/create-release-archive.mjs <output.tar.gz>");
  }
  await createReleaseArchive({ packageRoot: process.cwd(), outputPath });
}

if (process.argv[1] !== undefined && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
