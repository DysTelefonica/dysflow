// Vitest quality gate that walks Pester test files and flags any test
// whose body is implementation-coupled to PowerShell source text (#585).
//
// Prohibited patterns:
//   - `Get-Content -Raw` of a .ps1 file followed by `Should -Match` (text scan)
//   - `$script:X | Should -Match` where `$script:X` is derived from a
//     `$ast.Extent.Text` extraction of a .ps1 file
//   - `[regex]::Matches` on extracted function text where the match
//     pattern targets PowerShell statements/assignments
//
// AST extraction is allowed only as a LOADER (Invoke-Expression
// $ast.Extent.Text is fine; the helper is loaded into the test scope).
// AST counts (e.g. FindAll + .Count) on command nodes are also fine
// because they are structural metadata, not source-text assertions.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const PESTER_DIR = "scripts/tests";

function listPs1Files(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...listPs1Files(full));
    } else if (entry.endsWith(".Tests.ps1")) {
      out.push(full);
    }
  }
  return out;
}

function stripComments(source: string): string {
  return source
    .replace(/<#[\s\S]*?#>/g, "") // block comments
    .replace(/(^|\s)#.*$/gm, "$1"); // line comments
}

function hasGetContentRawOfPs1(body: string): boolean {
  return /Get-Content\s+-Raw\s+["']?[^"']*\.ps1["']?/i.test(body);
}

function hasScriptVarFromExtentText(body: string): boolean {
  return /\$script:\w+\s*=\s*(?:if\s*\([^)]+\)\s*\{\s*)?\$(\w+)Ast\.Extent\.Text/.test(body);
}

function hasRegexMatchesOnScriptVar(body: string): boolean {
  // [regex]::Matches($script:SomeText, ...) — banned when the script var
  // is the function-text extraction pattern above.
  return /\[regex\]::Matches\s*\(\s*\$script:\w+/.test(body);
}

describe("Pester source-text coupling guard (#585)", () => {
  it("no Pester test reads a .ps1 file with Get-Content -Raw and then asserts Should -Match on it", () => {
    const offenders: string[] = [];
    for (const file of listPs1Files(PESTER_DIR)) {
      const text = stripComments(readFileSync(file, "utf8"));
      // The test must not have BOTH Get-Content -Raw of a .ps1 AND a
      // Should -Match assertion that references the same variable.
      if (!hasGetContentRawOfPs1(text)) continue;
      // Find the It block that has both. The simplest regex over the full
      // text catches the common case: the file has both patterns in the
      // same logical region. We then look for `$source` or `$text` style
      // vars followed by `Should -Match` within ~10 lines.
      const lines = text.split("\n");
      for (let i = 0; i < lines.length; i += 1) {
        if (!/Get-Content\s+-Raw/.test(lines[i] ?? "")) continue;
        const window = lines.slice(i, i + 12).join("\n");
        if (
          /Should\s+-Match\s*\(?\s*\$source|Should\s+-Match\s*\(?\s*\$text|Should\s+-Match\s*\(?\s*\$runnerText/i.test(
            window,
          )
        ) {
          offenders.push(`${file}:${i + 1}`);
        }
      }
    }
    expect(
      offenders,
      "Pester tests must not assert on PowerShell source body text. Use AST as a loader only.",
    ).toEqual([]);
  });

  it("no Pester test asserts on a $script:X assigned from $Ast.Extent.Text", () => {
    // The legacy pattern was:
    //     $script:NewVbFnText = if ($fnAst) { $fnAst.Extent.Text } else { "" }
    //     ... $script:NewVbFnText | Should -Match ...
    // The replacement pattern loads the AST and Invoke-Expressions the
    // helper into the test scope. Text assignments like the above are
    // banned — they couple the test to the source.
    const offenders: string[] = [];
    for (const file of listPs1Files(PESTER_DIR)) {
      const text = stripComments(readFileSync(file, "utf8"));
      if (!hasScriptVarFromExtentText(text)) continue;
      // Check that the same script var is later used in a Should -Match.
      const matches = [
        ...text.matchAll(
          /\$script:(\w+)\s*=\s*(?:if\s*\([^)]+\)\s*\{\s*)?\$(\w+)Ast\.Extent\.Text/g,
        ),
      ];
      for (const m of matches) {
        const scriptVar = m[1];
        const usesMatch = new RegExp(
          `\\$script:${scriptVar}\\b[\\s\\S]{0,200}?Should\\s+-(?:Not\\s+)?Match`,
        ).test(text);
        if (usesMatch) {
          const lineNum = text.slice(0, m.index ?? 0).split("\n").length;
          offenders.push(`${file}:${lineNum} ($${scriptVar})`);
        }
      }
    }
    expect(
      offenders,
      "Pester tests must not assign function text to a $script: var and then assert on it. Load via AST as a function, not as text.",
    ).toEqual([]);
  });

  it("no Pester test uses [regex]::Matches on a $script:X holding extracted function text", () => {
    const offenders: string[] = [];
    for (const file of listPs1Files(PESTER_DIR)) {
      const text = stripComments(readFileSync(file, "utf8"));
      if (!hasRegexMatchesOnScriptVar(text)) continue;
      // Confirm the same $script: var is the function-text extraction.
      const matches = [...text.matchAll(/\[regex\]::Matches\s*\(\s*\$script:(\w+)/g)];
      for (const m of matches) {
        const scriptVar = m[1];
        const assigned = new RegExp(
          `\\$script:${scriptVar}\\s*=\\s*(?:if[^}]*\\$)\\s*\\w+Ast\\.Extent\\.Text`,
        ).test(text);
        if (assigned) {
          const lineNum = text.slice(0, m.index ?? 0).split("\n").length;
          offenders.push(`${file}:${lineNum} ($${scriptVar})`);
        }
      }
    }
    expect(
      offenders,
      "Pester tests must not use [regex]::Matches on extracted function text. Use AST FindAll + .Count on command nodes instead.",
    ).toEqual([]);
  });
});
