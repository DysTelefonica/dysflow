/**
 * Release tag validation for every install channel.
 *
 * Lifted out of `downloader.ts` (issue #1521) so the stable, prerelease, and
 * main-branch providers share exactly one definition of what a Dysflow release
 * tag looks like, and so the accepted/rejected forms carry their own unit
 * coverage instead of riding along with the download path.
 *
 * The tag is interpolated into a `releases/download/<tag>/...` URL, so it must
 * stay a closed, anchored grammar: anything that is not a Dysflow release tag
 * is refused before a request is built.
 */

/**
 * Accepted: `v2.39.0`, `v2.39.0-rc.1`, `v2.39.0-beta.3`, `v2.39.0-alpha.10`,
 * `v2.39.0-prerelease.2`.
 *
 * Rejected: `2.39.0` (no `v`), `v2.39` (not three components), `v2.39.0-rc1`
 * (missing the dot before the counter), `v2.39.0-final` (channel word outside
 * the closed set), `main`, and anything carrying shell metacharacters.
 */
export const RELEASE_TAG_PATTERN = /^v\d+\.\d+\.\d+(?:-(?:rc|beta|alpha|prerelease)\.\d+)?$/;

/** True when the tag is a stable release tag with no prerelease suffix. */
export function isStableReleaseTagName(tagName: string): boolean {
  return /^v\d+\.\d+\.\d+$/.test(tagName);
}

/** True when the tag names a prerelease (`-rc.N`, `-beta.N`, `-alpha.N`, `-prerelease.N`). */
export function isPrereleaseTagName(tagName: string): boolean {
  return RELEASE_TAG_PATTERN.test(tagName) && !isStableReleaseTagName(tagName);
}

/** Non-throwing predicate form of {@link validateReleaseTagName}. */
export function isValidReleaseTagName(tagName: string): boolean {
  return RELEASE_TAG_PATTERN.test(tagName);
}

/**
 * Returns the tag unchanged when it is a valid Dysflow release tag.
 *
 * @throws when the tag does not match {@link RELEASE_TAG_PATTERN}.
 */
export function validateReleaseTagName(tagName: string): string {
  if (!isValidReleaseTagName(tagName)) {
    throw new Error(`Invalid Dysflow release tag: ${tagName}`);
  }
  return tagName;
}

/** Strips the leading `v` so a tag becomes the package version it carries. */
export function normalizeReleaseVersion(value: string): string {
  return value.startsWith("v") ? value.slice(1) : value;
}
