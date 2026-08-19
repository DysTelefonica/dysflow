/**
 * #1440 — Disk-backed regression for the `nodeVbaSourceResolver` used by
 * `run_vba`'s preflight. The consumer reproduction shows `run_vba`
 * reporting `PROCEDURE_NOT_FOUND` while `list_procedures` accepts the
 * same procedure; both walk the same `modules/<name>.bas` probe list in
 * their respective code paths. This suite proves the wiring at the
 * adapter boundary so a regression that introduces a stale cache, a
 * stale destinationRoot, or a path-divergence between the two resolvers
 * is caught before shipping.
 *
 * Cheap by construction: pure filesystem I/O, no Access, no PowerShell.
 * The real-Access coverage lives in `test/e2e/run-vba-procedure-exists-after-import.e2e.test.ts`.
 */

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createNodeVbaSourceResolver } from "../../../src/adapters/services/node-vba-source-resolver.js";
import { listVbaProcedures } from "../../../src/core/services/vba-procedure-service.js";

const freshModuleSource = [
  'Attribute VB_Name = "modDiagnosticoMigracionTbCambiosParaPublicacion"',
  "Option Compare Database",
  "Option Explicit",
  "",
  "Public Function DumpSchema() As String",
  '    DumpSchema = "ok"',
  "End Function",
].join("\r\n");

describe("#1440 — nodeVbaSourceResolver (disk-backed) for run_vba preflight", () => {
  let destinationRoot: string;

  beforeEach(async () => {
    destinationRoot = await mkdtemp(join(tmpdir(), "dysflow-1448-resolver-"));
    await mkdir(join(destinationRoot, "modules"), { recursive: true });
    await mkdir(join(destinationRoot, "classes"), { recursive: true });
    await mkdir(join(destinationRoot, "forms"), { recursive: true });
    await mkdir(join(destinationRoot, "reports"), { recursive: true });
  });

  afterEach(async () => {
    if (destinationRoot) await rm(destinationRoot, { recursive: true, force: true });
  });

  it("resolves a freshly-written module file by moduleName → returns the source verbatim", async () => {
    await writeFile(
      join(destinationRoot, "modules", "modDiagnosticoMigracionTbCambiosParaPublicacion.bas"),
      freshModuleSource,
      "utf8",
    );
    const resolver = createNodeVbaSourceResolver(destinationRoot);

    const source = await resolver.resolveModuleSource(
      "modDiagnosticoMigracionTbCambiosParaPublicacion",
    );

    expect(source).toBe(freshModuleSource);
    // The same parser `run_vba` uses must accept the procedure.
    expect(listVbaProcedures(source ?? "").map((p) => p.name)).toContain("DumpSchema");
  });

  it("does NOT cache: a subsequent module-write changes the resolved source on the next call", async () => {
    const modulePath = join(
      destinationRoot,
      "modules",
      "modDiagnosticoMigracionTbCambiosParaPublicacion.bas",
    );
    await writeFile(modulePath, freshModuleSource, "utf8");
    const resolver = createNodeVbaSourceResolver(destinationRoot);

    const first = await resolver.resolveModuleSource(
      "modDiagnosticoMigracionTbCambiosParaPublicacion",
    );
    expect(first).toBe(freshModuleSource);

    // Overwrite the file — simulate a fresh import that mutated the on-disk
    // source. The next resolve call must see the new bytes.
    const replaced = freshModuleSource.replace(
      "Public Function DumpSchema() As String",
      "Public Function DumpSchema2() As String",
    );
    await writeFile(modulePath, replaced, "utf8");

    const second = await resolver.resolveModuleSource(
      "modDiagnosticoMigracionTbCambiosParaPublicacion",
    );
    expect(second).toBe(replaced);
    expect(second).not.toBe(freshModuleSource);
  });

  it("resolveAllModuleSources returns the same source bytes as the single-module resolver", async () => {
    await writeFile(
      join(destinationRoot, "modules", "modDiagnosticoMigracionTbCambiosParaPublicacion.bas"),
      freshModuleSource,
      "utf8",
    );
    const resolver = createNodeVbaSourceResolver(destinationRoot);

    const all = await resolver.resolveAllModuleSources();
    const single = await resolver.resolveModuleSource(
      "modDiagnosticoMigracionTbCambiosParaPublicacion",
    );

    expect(all.modDiagnosticoMigracionTbCambiosParaPublicacion).toBe(single);
    expect(
      listVbaProcedures(all.modDiagnosticoMigracionTbCambiosParaPublicacion ?? "").map(
        (p) => p.name,
      ),
    ).toContain("DumpSchema");
  });

  it("returns undefined for an unknown moduleName — the preflight's fallback path stays non-fatal", async () => {
    await writeFile(
      join(destinationRoot, "modules", "modDiagnosticoMigracionTbCambiosParaPublicacion.bas"),
      freshModuleSource,
      "utf8",
    );
    const resolver = createNodeVbaSourceResolver(destinationRoot);

    const source = await resolver.resolveModuleSource("moduleThatDoesNotExist");
    expect(source).toBeUndefined();
  });

  it("returns undefined when destinationRoot is empty — the preflight short-circuits to the runner", async () => {
    const resolver = createNodeVbaSourceResolver(undefined);
    const source = await resolver.resolveModuleSource(
      "modDiagnosticoMigracionTbCambiosParaPublicacion",
    );
    expect(source).toBeUndefined();
  });

  it("class probing: the procedure exists in the resolved source — i.e. the preflight would accept it", async () => {
    // Direct proof of the bug's shape: when the consumer runs
    // `run_vba({procedureName: "modDiagnosticoMigracionTbCambiosParaPublicacion.DumpSchema"})`,
    // the resolver returns the source the parser already accepts.
    await writeFile(
      join(destinationRoot, "modules", "modDiagnosticoMigracionTbCambiosParaPublicacion.bas"),
      freshModuleSource,
      "utf8",
    );
    const resolver = createNodeVbaSourceResolver(destinationRoot);

    const source = await resolver.resolveModuleSource(
      "modDiagnosticoMigracionTbCambiosParaPublicacion",
    );
    const procedures = listVbaProcedures(source ?? "").map((p) => p.name);
    expect(procedures).toContain("DumpSchema");
  });
});
