#!/usr/bin/env node
import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const DEFAULT_TARGET = "src/core";
const SKIP_DIRECTORIES = new Set([".git", "coverage", "dist", "node_modules", "scratch"]);

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

  if (absolutePath.endsWith(".ts")) files.push(absolutePath);
  else await walk(absolutePath);
  return files.sort((left, right) => left.localeCompare(right));
}

function loadCompilerOptions(projectRoot) {
  const configPath = ts.findConfigFile(projectRoot, ts.sys.fileExists, "tsconfig.json");
  if (configPath === undefined) throw new Error(`tsconfig.json not found from ${projectRoot}`);
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  if (config.error !== undefined)
    throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, "\n"));
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, path.dirname(configPath));
  if (parsed.errors.length > 0) {
    throw new Error(
      parsed.errors
        .map((error) => ts.flattenDiagnosticMessageText(error.messageText, "\n"))
        .join("\n"),
    );
  }
  return parsed.options;
}

function canonical(value) {
  const normalized = path.resolve(value).replaceAll("/", path.sep);
  return ts.sys.useCaseSensitiveFileNames ? normalized : normalized.toLowerCase();
}

function isWithin(candidate, directory) {
  const relative = path.relative(canonical(directory), canonical(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function moduleReferences(sourceFile) {
  const references = [];
  function add(node, specifier) {
    if (ts.isStringLiteralLike(specifier)) references.push({ node, specifier: specifier.text });
  }
  function visit(node) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      if (node.moduleSpecifier !== undefined) add(node, node.moduleSpecifier);
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      node.moduleReference.expression !== undefined
    ) {
      add(node, node.moduleReference.expression);
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length >= 1
    ) {
      add(node, node.arguments[0]);
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return references;
}

export async function findCoreAdapterBoundaryViolations(
  targetPath = DEFAULT_TARGET,
  projectRoot = process.cwd(),
) {
  const options = loadCompilerOptions(projectRoot);
  const adapterRoot = path.join(projectRoot, "src", "adapters");
  const files = await collectTypeScriptFiles(targetPath);
  const violations = [];
  const seen = new Set();

  for (const filePath of files) {
    const sourceText = ts.sys.readFile(filePath);
    if (sourceText === undefined) continue;
    const sourceFile = ts.createSourceFile(
      filePath,
      sourceText,
      options.target ?? ts.ScriptTarget.ES2022,
      true,
    );
    for (const reference of moduleReferences(sourceFile)) {
      const resolved = ts.resolveModuleName(
        reference.specifier,
        filePath,
        options,
        ts.sys,
      ).resolvedModule;
      if (resolved === undefined || !isWithin(resolved.resolvedFileName, adapterRoot)) continue;
      const start = reference.node.getStart(sourceFile);
      const key = `${canonical(filePath)}:${start}:${canonical(resolved.resolvedFileName)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const location = sourceFile.getLineAndCharacterOfPosition(start);
      violations.push({
        filePath,
        resolvedTarget: resolved.resolvedFileName,
        line: location.line + 1,
        column: location.character + 1,
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
  violations.sort((left, right) =>
    `${left.filePath}:${left.line}:${left.column}:${left.resolvedTarget}`.localeCompare(
      `${right.filePath}:${right.line}:${right.column}:${right.resolvedTarget}`,
    ),
  );

  if (violations.length === 0) return;
  console.error(
    "Core adapter boundary failed. Files under src/core must not import from src/adapters; inject adapter implementations from composition roots instead.",
  );
  for (const violation of violations) {
    console.error(
      `${violation.filePath}:${violation.line}:${violation.column} -> ${violation.resolvedTarget}`,
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
