#!/usr/bin/env node

import { readdirSync, readFileSync, statSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import ts from "typescript";

function compareUtf16CodeUnits(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function parseArgs(argv) {
  let root = process.cwd();
  let files;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--root") {
      root = resolve(argv[++index]);
    } else if (argument === "--files") {
      files = [];
      while (index + 1 < argv.length && !argv[index + 1].startsWith("--")) {
        files.push(argv[++index]);
      }
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  return { root, files };
}

function walk(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...walk(path));
    else if (entry.isFile() && /(?<!\.d)\.(?:ts|tsx)$/.test(entry.name)) files.push(path);
  }
  return files;
}

function reportPath(root, path) {
  return relative(root, path).split(sep).join("/");
}

function buildGraph(root, selectedFiles) {
  const sourceRoot = resolve(root, "src");
  const discovered = walk(sourceRoot).map((path) => resolve(path));
  const selected = selectedFiles?.map((path) => resolve(root, path)) ?? discovered;
  const nodes = [...new Set(selected)].sort(compareUtf16CodeUnits);
  const nodeSet = new Set(nodes);
  const compilerOptions = {
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    resolveJsonModule: false,
  };
  const graph = new Map(nodes.map((node) => [node, []]));

  for (const source of nodes) {
    if (!statSync(source).isFile()) throw new Error(`Not a file: ${reportPath(root, source)}`);
    const sourceFile = ts.createSourceFile(
      source,
      readFileSync(source, "utf8"),
      ts.ScriptTarget.Latest,
      false,
    );
    const imports = sourceFile.statements.flatMap((statement) => {
      if (
        (ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) &&
        statement.moduleSpecifier !== undefined &&
        ts.isStringLiteral(statement.moduleSpecifier)
      ) {
        return [statement.moduleSpecifier.text];
      }
      if (
        ts.isImportEqualsDeclaration(statement) &&
        ts.isExternalModuleReference(statement.moduleReference) &&
        statement.moduleReference.expression !== undefined &&
        ts.isStringLiteral(statement.moduleReference.expression)
      ) {
        return [statement.moduleReference.expression.text];
      }
      return [];
    });
    const targets = new Set();
    for (const imported of imports) {
      if (!imported.startsWith(".")) continue;
      const resolved = ts.resolveModuleName(imported, source, compilerOptions, ts.sys)
        .resolvedModule?.resolvedFileName;
      if (resolved !== undefined && nodeSet.has(resolve(resolved))) targets.add(resolve(resolved));
    }
    graph.set(source, [...targets].sort(compareUtf16CodeUnits));
  }
  return graph;
}

function stronglyConnectedComponents(graph) {
  let nextIndex = 0;
  const indices = new Map();
  const lowLinks = new Map();
  const stack = [];
  const onStack = new Set();
  const components = [];

  function visit(node) {
    indices.set(node, nextIndex);
    lowLinks.set(node, nextIndex);
    nextIndex += 1;
    stack.push(node);
    onStack.add(node);
    for (const target of graph.get(node) ?? []) {
      if (!indices.has(target)) {
        visit(target);
        lowLinks.set(node, Math.min(lowLinks.get(node), lowLinks.get(target)));
      } else if (onStack.has(target)) {
        lowLinks.set(node, Math.min(lowLinks.get(node), indices.get(target)));
      }
    }
    if (lowLinks.get(node) !== indices.get(node)) return;
    const component = [];
    let member;
    do {
      member = stack.pop();
      onStack.delete(member);
      component.push(member);
    } while (member !== node);
    components.push(component.sort(compareUtf16CodeUnits));
  }

  for (const node of graph.keys()) if (!indices.has(node)) visit(node);
  return components;
}

const { root, files } = parseArgs(process.argv.slice(2));
const graph = buildGraph(root, files);
const components = stronglyConnectedComponents(graph);
const cycles = components
  .filter(
    (component) => component.length > 1 || (graph.get(component[0]) ?? []).includes(component[0]),
  )
  .map((component) => component.map((path) => reportPath(root, path)))
  .sort((a, b) => compareUtf16CodeUnits(a.join("\0"), b.join("\0")));
const result = {
  modules: graph.size,
  edges: [...graph.values()].reduce((total, targets) => total + targets.length, 0),
  sccs: components.length,
  cyclicSccs: cycles.length,
  cyclicSizes: cycles.map((cycle) => cycle.length).sort((a, b) => b - a),
  cycles,
};
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
