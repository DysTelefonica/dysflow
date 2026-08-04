export const RELEASE_SKILL_NAMES: readonly string[];
export const RELEASE_ARCHIVE_ENTRIES: readonly string[];

export function tarForceLocalArgs(cwd: string): string[];
export function assertBundledSkillFiles(packageRoot: string): Promise<void>;
export function assertReleaseArchiveManifest(listing: string): void;
export function createReleaseArchive(options: {
  packageRoot: string;
  outputPath: string;
}): Promise<void>;
