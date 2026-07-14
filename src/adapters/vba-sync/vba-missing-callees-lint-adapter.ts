import { readdir, readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import {
  lintVbaMissingCallees,
  type VbaLintSource,
  type VbaMissingCalleesLintOptions,
  type VbaMissingCalleesLintResult,
} from "../../core/services/vba-missing-callees-lint-service.js";

export async function lintVbaMissingCalleesSourceTree(
  projectRoot: string,
  sourceRoot: string,
  options: VbaMissingCalleesLintOptions = {},
): Promise<VbaMissingCalleesLintResult> {
  const absoluteSourceRoot = resolve(projectRoot, sourceRoot);
  const files = await listVbaFiles(absoluteSourceRoot);
  if (files.length === 0) {
    throw new Error(`No .bas or .cls files found under source root: ${sourceRoot}`);
  }
  const sources: VbaLintSource[] = await Promise.all(
    files.map(async (file) => ({
      path: relative(projectRoot, file).replaceAll("\\", "/"),
      text: await readFile(file, "utf8"),
    })),
  );
  return lintVbaMissingCallees(sources, options);
}

async function listVbaFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry): Promise<string[]> => {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) return listVbaFiles(path);
      return entry.isFile() && /\.(?:bas|cls)$/i.test(entry.name) ? [path] : [];
    }),
  );
  return nested.flat().sort((left, right) => left.localeCompare(right));
}
