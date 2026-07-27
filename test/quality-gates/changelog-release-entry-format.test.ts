import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * `CHANGELOG.md` is packaged into the release tarball, so every released entry is a
 * user-facing artifact. `release-prepare.ps1` generates the initial entry, and an
 * operator may curate it further. This gate prevents either path from preserving a
 * pasted `git log` dump — merge-commit subjects, or a whole release folded onto one
 * physical line.
 *
 * This gate reads the changelog as data: it discovers released version entries from
 * their headings rather than naming any single release, so every future release is
 * covered the moment it is added.
 *
 * `LEGACY_UNCURATED_RELEASES` grandfathers entries that already shipped in this shape
 * before the gate existed. It is frozen and may only shrink: a release that is not
 * listed here is checked, and `keeps the newest release outside the legacy exemption`
 * makes it impossible to grow the list to cover a new release.
 */
const LEGACY_UNCURATED_RELEASES: ReadonlySet<string> = new Set([
  "v2.24.0",
  "v2.17.0",
  "v2.15.0",
  "v2.12.1",
  "v2.12.0",
  "v2.11.1",
  "v2.10.0",
  "v2.9.3",
  "v2.9.2",
  "v2.9.1",
  "v2.9.0",
  "v2.8.0",
  "v2.7.0",
  "v2.6.0",
  "v2.5.4",
  "v2.2.1",
  "v2.1.6",
  "v1.15.0",
  "v1.13.0",
  "v1.11.2",
  "v1.11.1",
]);

const RELEASE_HEADING = /^## \[?(v\d+\.\d+\.\d+[^\]\s]*)\]?/;
const BULLET = /^\s*[-*] (.*)$/;
/** ` - ` between two non-space characters starts a second bullet on the same line. */
const COLLAPSED_BULLET_SEPARATOR = /(?<=\S) - (?=\S)/;
const MERGE_COMMIT_SUBJECT = "Merge pull request";

interface Bullet {
  readonly lineNumber: number;
  readonly text: string;
}

interface ReleaseEntry {
  readonly version: string;
  readonly bullets: readonly Bullet[];
}

interface Violation {
  readonly version: string;
  readonly lineNumber: number;
  readonly problem: string;
  readonly excerpt: string;
}

function parseReleaseEntries(changelog: string): ReleaseEntry[] {
  const entries: ReleaseEntry[] = [];
  let bullets: Bullet[] | undefined;

  changelog.split(/\r?\n/).forEach((line, index) => {
    if (line.startsWith("## ")) {
      const version = RELEASE_HEADING.exec(line)?.[1];
      bullets = undefined;
      if (version !== undefined) {
        bullets = [];
        entries.push({ version, bullets });
      }
      return;
    }

    const text = BULLET.exec(line)?.[1];
    if (text !== undefined) bullets?.push({ lineNumber: index + 1, text });
  });

  return entries;
}

function parseSoleReleaseEntry(fixture: string): ReleaseEntry {
  const [entry] = parseReleaseEntries(fixture);
  if (entry === undefined) throw new Error(`fixture declares no release entry:\n${fixture}`);
  return entry;
}

function findViolations(entry: ReleaseEntry): Violation[] {
  const violations: Violation[] = [];

  for (const bullet of entry.bullets) {
    const excerpt = bullet.text.slice(0, 80);
    if (bullet.text.includes(MERGE_COMMIT_SUBJECT)) {
      violations.push({
        version: entry.version,
        lineNumber: bullet.lineNumber,
        problem: "merge-commit subject used as a release note",
        excerpt,
      });
    }
    const collapsed = bullet.text.split(COLLAPSED_BULLET_SEPARATOR).length;
    if (collapsed > 1) {
      violations.push({
        version: entry.version,
        lineNumber: bullet.lineNumber,
        problem: `${collapsed} bullets collapsed onto one physical line`,
        excerpt,
      });
    }
  }

  return violations;
}

function describeViolations(violations: readonly Violation[]): string[] {
  return violations.map(
    ({ version, lineNumber, problem, excerpt }) =>
      `${version} (CHANGELOG.md:${lineNumber}): ${problem} — "${excerpt}"`,
  );
}

// The override lets the release-script Pester suite exercise this exact gate
// against isolated fixtures without mutating the repository changelog.
const changelog = readFileSync(process.env.DYSFLOW_CHANGELOG_PATH ?? "CHANGELOG.md", "utf8");
const releaseEntries = parseReleaseEntries(changelog);
const curatedEntries = releaseEntries.filter(
  (entry) => !LEGACY_UNCURATED_RELEASES.has(entry.version),
);

describe("changelog release entry format", () => {
  it("discovers released version entries from the file instead of a hard-coded list", () => {
    expect(releaseEntries.length).toBeGreaterThan(LEGACY_UNCURATED_RELEASES.size);
    expect(curatedEntries.length).toBeGreaterThan(0);
    expect(releaseEntries.every((entry) => entry.version.startsWith("v"))).toBe(true);
  });

  it("keeps every curated release entry free of raw git-history noise", () => {
    const violations = curatedEntries.flatMap(findViolations);

    expect(describeViolations(violations)).toEqual([]);
  });

  it("keeps the newest release outside the legacy exemption", () => {
    const newest = releaseEntries.at(0)?.version;

    expect(newest).toMatch(/^v\d+\.\d+\.\d+/);
    expect(LEGACY_UNCURATED_RELEASES.has(newest ?? "")).toBe(false);
  });

  it("keeps the legacy exemption list honest as entries are curated", () => {
    const stillUncurated = new Set(
      releaseEntries.filter((entry) => findViolations(entry).length > 0).map((e) => e.version),
    );
    const obsolete = [...LEGACY_UNCURATED_RELEASES].filter((v) => !stillUncurated.has(v));

    expect(obsolete).toEqual([]);
  });

  it.each([
    {
      shape: "a merge-commit subject",
      bullet: "- Merge pull request #1144 from DysTelefonica/test/1136-parity-assertions",
      problem: "merge-commit subject used as a release note",
    },
    {
      shape: "two commit subjects on one physical line",
      bullet: "- fix(ci): resolve the audit tool (#1151) - ci: run the quality gates (#1145)",
      problem: "2 bullets collapsed onto one physical line",
    },
  ])("rejects $shape in a release entry", ({ bullet, problem }) => {
    const entry = parseSoleReleaseEntry(`## [v9.9.9] - 2026-01-01\n\n${bullet}\n`);

    expect(findViolations(entry).map((violation) => violation.problem)).toEqual([problem]);
  });

  it.each([
    "Explicit `AbortSignal` cancellation and execution timeout are now reported separately.",
    "#1114 — `fix(gitignore): stop hiding canonical Access form sources`",
    "`Visible =0` is equivalent to `Visible = NotDefault` — the value written is the same.",
  ])("accepts curated prose: %s", (text) => {
    const entry = parseSoleReleaseEntry(`## [v9.9.9] - 2026-01-01\n\n- ${text}\n`);

    expect(findViolations(entry)).toEqual([]);
  });
});
