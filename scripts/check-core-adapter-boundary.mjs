#!/usr/bin/env node
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_TARGET = "src/core";
const SKIP_DIRECTORIES = new Set([".git", "coverage", "dist", "node_modules", "scratch"]);

const ADAPTER_IMPORT = /^\s*(?:import|export)\s+(?:type\s+)?[^;\n]*\s+from\s+["'][^"']*adapters\//m;

async function collectTypeScriptFiles(targetPath) {
  const absolutePath = path.resolve(targetPath);
  const files = [];

  async function walk(currentPath) {
    const entries = await readdir(currentPath, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRECTORIES.has(entry.name)) await walk(entryPath);
      } else if (entry.isFile() && entry.name.endsWith(".ts")) {
        files.push(entryPath);
      }
    }
  }

  if (absolutePath.endsWith(".ts")) {
    files.push(absolutePath);
  } else {
    await walk(absolutePath);
  }

  return files;
}

function lineAndColumn(sourceText, index) {
  const prefix = sourceText.slice(0, index);
  const lines = prefix.split(/\r?\n/);
  return { line: lines.length, column: lines.at(-1).length + 1 };
}

export async function findCoreAdapterBoundaryViolations(targetPath = DEFAULT_TARGET) {
  const files = await collectTypeScriptFiles(targetPath);
  const violations = [];

  for (const filePath of files) {
    const sourceText = await readFile(filePath, "utf8");
    const match = sourceText.match(ADAPTER_IMPORT);
    if (match?.index !== undefined) {
      const location = lineAndColumn(sourceText, match.index);
      violations.push({ filePath, line: location.line, column: location.column });
    }
  }

  return violations;
}

async function main() {
  const targets = process.argv.slice(2);
  const violations = (
    await Promise.all(
      (targets.length > 0 ? targets : [DEFAULT_TARGET]).map((target) =>
        findCoreAdapterBoundaryViolations(target),
      ),
    )
  ).flat();

  if (violations.length === 0) return;

  console.error(
    "Core adapter boundary failed. Files under src/core must not import from src/adapters; inject adapter implementations from composition roots instead.",
  );
  for (const violation of violations) {
    console.error(
      `${violation.filePath}:${violation.line}:${violation.column} imports from adapters`,
    );
  }
  process.exitCode = 1;
}

if (
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  await main();
}
