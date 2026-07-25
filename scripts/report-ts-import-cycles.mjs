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
  let baseline;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--root") {
      root = resolve(argv[++index]);
    } else if (argument === "--check") {
      baseline = argv[++index];
    } else if (argument === "--files") {
      files = [];
      while (index + 1 < argv.length && !argv[index + 1].startsWith("--")) {
        files.push(argv[++index]);
      }
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  return { root, files, baseline };
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

function readBaseline(root, baselinePath) {
  const path = resolve(root, baselinePath);
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  if (
    parsed?.version !== 1 ||
    !Array.isArray(parsed.cycles) ||
    !parsed.cycles.every(
      (cycle) => Array.isArray(cycle) && cycle.every((member) => typeof member === "string"),
    )
  ) {
    throw new Error(`Invalid TypeScript import cycle baseline: ${reportPath(root, path)}`);
  }
  return parsed.cycles;
}

function baselineViolations(root, graph, cycles, baselineCycles) {
  const baselineSets = baselineCycles.map((cycle) => new Set(cycle));
  const reviewedMembers = new Set(baselineCycles.flat());
  const graphByReportPath = new Map(
    [...graph.entries()].map(([source, targets]) => [
      reportPath(root, source),
      targets.map((target) => reportPath(root, target)),
    ]),
  );

  return cycles.flatMap((cycle) => {
    if (baselineSets.some((baseline) => cycle.every((member) => baseline.has(member)))) return [];

    const cycleMembers = new Set(cycle);
    const newMembers = cycle.filter((member) => !reviewedMembers.has(member));
    const overlappingBaselines = baselineSets.filter((baseline) =>
      cycle.some((member) => baseline.has(member)),
    );
    const edges = cycle.flatMap((source) =>
      (graphByReportPath.get(source) ?? [])
        .filter((target) => cycleMembers.has(target))
        .map((target) => `${source} -> ${target}`),
    );
    return [
      {
        cycle,
        newMembers,
        merged: newMembers.length === 0 && overlappingBaselines.length > 1,
        edges,
      },
    ];
  });
}

function checkBaseline(root, graph, cycles, baselinePath) {
  const violations = baselineViolations(root, graph, cycles, readBaseline(root, baselinePath));
  if (violations.length === 0) return;

  process.stderr.write("TypeScript import cycle baseline failed.\n");
  for (const violation of violations) {
    process.stderr.write(`Unexpected cyclic SCC: ${violation.cycle.join(", ")}\n`);
    if (violation.newMembers.length > 0) {
      process.stderr.write(`Unapproved cyclic members: ${violation.newMembers.join(", ")}\n`);
    } else if (violation.merged) {
      process.stderr.write("Reason: baseline SCCs were merged.\n");
    } else {
      process.stderr.write(
        "Reason: cyclic members are not covered by one reviewed baseline SCC.\n",
      );
    }
    process.stderr.write("Import edges:\n");
    for (const edge of violation.edges) process.stderr.write(`  ${edge}\n`);
  }
  process.exitCode = 1;
}

const { root, files, baseline } = parseArgs(process.argv.slice(2));
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
if (baseline === undefined) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else {
  checkBaseline(root, graph, cycles, baseline);
}
