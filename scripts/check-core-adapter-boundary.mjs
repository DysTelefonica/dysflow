#!/usr/bin/env node
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_TARGET = "src/core";
const SKIP_DIRECTORIES = new Set([".git", "coverage", "dist", "node_modules", "scratch"]);

// Label documentation for violation types:
//   "static"          — same-line named import  : import { Foo } from "...adapters/..."
//   "multiline-static"— multi-line named import : import { ... } from "...adapters/..."
//                                        OR multi-line dynamic : import(... ) from "...adapters/..."
//   "sideeffect"      — bare side-effect import : import "...adapters/...";  (no { ... } or from)

const SAME_LINE_ADAPTER_IMPORT =
  /^\s*(?:import|export)\s+(?:type\s+)?[^;"']*?\s+from\s+["'][^"']*adapters\//gm;

const MULTILINE_ADAPTER_IMPORT =
  /(?:^|\n)import\s*\{[\s\S]*?\}\s+from\s+["'][^"']*adapters\/[^"']*["']|(?:^|\n)export\s*\{[\s\S]*?\}\s+from\s+["'][^"']*adapters\/[^"']*["']|(?:^|\n)import\s*\([\s\S]*?\)\s+from\s+["'][\s\S]*?adapters\/[\s\S]*?["']/g;

// Bare side-effect import — no { ... }, no from, just the path string
const SIDEEFFECT_ADAPTER_IMPORT =
  /import\s+["'][^"']*adapters\/[^"']*["']\s*(?![\s]*from\b)[^;]*;/g;

// Dynamic import(...) to adapters/ (import(...) without a following 'from')
const DYNAMIC_ADAPTER_IMPORT = /import\s*\([\s\S]*?adapters\/[\s\S]*?\)/g;

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

    // Same-line static import/export: use match index for precise location
    for (const match of sourceText.matchAll(SAME_LINE_ADAPTER_IMPORT)) {
      const location = lineAndColumn(sourceText, match.index);
      violations.push({
        filePath,
        line: location.line,
        column: location.column,
        type: "static",
      });
    }

    // Multiline named import OR multi-line dynamic import: matchAll gives each occurrence's index
    for (const match of sourceText.matchAll(MULTILINE_ADAPTER_IMPORT)) {
      const location = lineAndColumn(sourceText, match.index);
      violations.push({
        filePath,
        line: location.line,
        column: location.column,
        type: "multiline-static",
      });
    }

    // Dynamic import(...): matchAll gives each occurrence's index
    for (const match of sourceText.matchAll(DYNAMIC_ADAPTER_IMPORT)) {
      const location = lineAndColumn(sourceText, match.index);
      violations.push({
        filePath,
        line: location.line,
        column: location.column,
        type: "dynamic",
      });
    }

    // Bare side-effect import — no { ... }, no from, just the path string
    for (const match of sourceText.matchAll(SIDEEFFECT_ADAPTER_IMPORT)) {
      const location = lineAndColumn(sourceText, match.index);
      violations.push({
        filePath,
        line: location.line,
        column: location.column,
        type: "sideeffect",
      });
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
      `${violation.filePath}:${violation.line}:${violation.column} imports from adapters (${violation.type})`,
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
