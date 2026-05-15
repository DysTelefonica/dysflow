import type { DysflowFileSystem } from "../../src/core/services/ai-editor-installer";

export function createMemoryFileSystem(initial: Record<string, string> = {}): DysflowFileSystem & { files: Map<string, string> } {
  const files = new Map(Object.entries(initial).map(([path, content]) => [normalize(path), content]));
  return {
    files,
    readFile: async (path) => files.get(normalize(path)),
    writeFile: async (path, content) => {
      files.set(normalize(path), content);
    },
    mkdir: async () => undefined,
  };
}

function normalize(path: string): string {
  return path.replace(/\\/g, "/");
}
