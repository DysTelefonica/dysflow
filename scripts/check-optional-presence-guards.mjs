#!/usr/bin/env node
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import ts from "typescript";

const DEFAULT_TARGETS = ["src"];
const SKIP_DIRECTORIES = new Set([".git", "coverage", "dist", "node_modules", "scratch"]);
const RELEVANT_NAMES = /(?:config|options|params|args|payload|request|input)$/i;
const ALLOW_MARKER = "optional-presence-guard: allow";

function isRelevantPresenceSubject(expression) {
  if (ts.isIdentifier(expression)) {
    return RELEVANT_NAMES.test(expression.text);
  }
  if (ts.isPropertyAccessExpression(expression)) {
    return RELEVANT_NAMES.test(expression.name.text);
  }
  if (ts.isParenthesizedExpression(expression)) {
    return isRelevantPresenceSubject(expression.expression);
  }
  return false;
}

function expressionText(sourceFile, expression) {
  return expression.getText(sourceFile).replace(/\s+/g, " ");
}

function isObjectHasOwn(callExpression, sourceFile) {
  return expressionText(sourceFile, callExpression.expression) === "Object.hasOwn";
}

function isObjectPrototypeHasOwnPropertyCall(callExpression, sourceFile) {
  return (
    expressionText(sourceFile, callExpression.expression) === "Object.prototype.hasOwnProperty.call"
  );
}

function hasOwnPropertyReceiver(callExpression) {
  const expression = callExpression.expression;
  if (
    ts.isPropertyAccessExpression(expression) &&
    expression.name.text === "hasOwnProperty"
  ) {
    return expression.expression;
  }
  return undefined;
}

function hasAllowMarker(sourceText, sourceFile, node) {
  const start = node.getStart(sourceFile);
  const line = sourceFile.getLineAndCharacterOfPosition(start).line;
  const lines = sourceText.split(/\r?\n/);
  return [lines[line - 1], lines[line]].some((candidate) => candidate?.includes(ALLOW_MARKER));
}

function lineAndColumn(sourceFile, node) {
  const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return { line: position.line + 1, column: position.character + 1 };
}

export function findOptionalPresenceGuardViolations(filePath, sourceText) {
  const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true);
  const violations = [];

  function report(node, subject, guard) {
    if (hasAllowMarker(sourceText, sourceFile, node)) return;
    const location = lineAndColumn(sourceFile, node);
    violations.push({
      filePath,
      line: location.line,
      column: location.column,
      subject: expressionText(sourceFile, subject),
      guard,
    });
  }

  function visit(node) {
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.InKeyword &&
      isRelevantPresenceSubject(node.right)
    ) {
      report(node, node.right, "in");
    }

    if (ts.isCallExpression(node)) {
      if (isObjectHasOwn(node, sourceFile)) {
        const subject = node.arguments[0];
        if (subject !== undefined && isRelevantPresenceSubject(subject)) {
          report(node, subject, "Object.hasOwn");
        }
      }

      if (isObjectPrototypeHasOwnPropertyCall(node, sourceFile)) {
        const subject = node.arguments[0];
        if (subject !== undefined && isRelevantPresenceSubject(subject)) {
          report(node, subject, "Object.prototype.hasOwnProperty.call");
        }
      }

      const hasOwnPropertySubject = hasOwnPropertyReceiver(node);
      if (
        hasOwnPropertySubject !== undefined &&
        isRelevantPresenceSubject(hasOwnPropertySubject)
      ) {
        report(node, hasOwnPropertySubject, "hasOwnProperty");
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return violations;
}

async function collectTypeScriptFiles(targetPath) {
  const absolutePath = path.resolve(targetPath);
  const files = [];

  async function walk(currentPath) {
    const entries = await readdir(currentPath, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRECTORIES.has(entry.name)) {
          await walk(entryPath);
        }
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

async function main() {
  const targets = process.argv.slice(2);
  const files = (
    await Promise.all((targets.length > 0 ? targets : DEFAULT_TARGETS).map(collectTypeScriptFiles))
  ).flat();
  const violations = [];

  for (const filePath of files) {
    const sourceText = await readFile(filePath, "utf8");
    violations.push(...findOptionalPresenceGuardViolations(filePath, sourceText));
  }

  if (violations.length === 0) return;

  console.error(
    "Optional config/params presence guard failed. Treat undefined optional fields as absent; use value checks instead of presence checks.",
  );
  for (const violation of violations) {
    console.error(
      `${violation.filePath}:${violation.line}:${violation.column} uses ${violation.guard} on ${violation.subject}`,
    );
  }
  process.exitCode = 1;
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  await main();
}
