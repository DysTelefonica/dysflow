# Issue 1814 — Destination readiness coherence
Branch: fix/1814-destinationroot-coherence; delivery: ask-on-risk; forecast: below 400 authored lines for fix.
Runner: pnpm exec vitest run (focused), pnpm test; release via release-prepare.ps1.

## Specs
S1: "resuelve en wt la issue 1814 luego pr merge a main si ci verde y release"
S2: "tienes qu eacabar de arreglar la issue 1814 no pares hasta sacar release"
S3: Issue #1814 requirements and reported examples, verbatim:
### Verified symptom

Runtime 4.4.11, MCP stdio, Windows 11. Locus: tool. Evidence: observed.

Within one process and one project state, `diagnose` reports the project as valid
and write-ready with the `destinationRoot` present, while every write-class export
rejects that same `destinationRoot` as non-existent. Both print the same absolute
path.

`diagnose({cwd})`:

```
projectConfig.status            : valid
projectConfig.writeReady        : true
projectConfig.diagnostics       : []
filesystem.destinationRoot      : { path: "<worktree>/src", exists: true }
runtime.staleMarkers            : 0
runtime.activeOps                : 0
```

`export_all` against that state, with the destination declared through each of the
three documented spellings (`destinationRoot` absolute, `exportPath`, and
`allowConfiguredDestinationRoot`):

```
DESTINATION_ROOT_NOT_FOUND: destinationRoot directory does not exist:
  <worktree>/src.  [legacy: PROJECT_CONFIG_NOT_WRITE_READY]
```

The directory existed on disk before the first call, was created by
`setup_project`'s resolved config, and was never removed.

### Reproduction evidence

No secrets below. Paths are generalized to `<worktree>`; the structure is exact.

1. New worktree with no `.dysflow/project.json`.
2. Write the config through the sanctioned tool, not by hand:

```
setup_project({
  cwd: "<worktree>",
  projectId: "consumer-side-project-id",
  frontendFile: "<frontend>.accdb",
  backendPath: "<worktree>/<backend>.accdb",
  destinationRoot: "<worktree>/src",
  capabilities: { allowWrites: true },
  apply: true
})
-> { ok: true, mode: "apply", dryRun: false }
```

3. Confirm the project is healthy:

```
get_capabilities({ view: "full" }).projectConfig
-> status "valid", writeReady true, diagnostics []
```

4. Probe the filesystem:

```
diagnose({ cwd: "<worktree>" })
-> destinationRoot.exists true, projectConfig.status "valid", writeReady true
```

5. Attempt the export with the configured destination opted in:

```
export_all({
  cwd: "<worktree>",
  projectId: "consumer-side-project-id",
  allowConfiguredDestinationRoot: true,
  apply: true
})
-> DESTINATION_ROOT_NOT_FOUND: destinationRoot directory does not exist: <worktree>/src
```

Expected: the export runs. Observed: it is refused for a path the runtime just
reported as existing.

### Expected behavior

`diagnose` and the write gate must agree about the same path in the same process.
If `diagnose` reports `destinationRoot.exists: true` and `writeReady: true`, a
write-class export to that destination must not fail with
`DESTINATION_ROOT_NOT_FOUND`.

Two related observations that make the current behavior actively misleading:

1. The error's own remediation says to run
   `mkdir -p '<destinationRoot>/{classes,modules,forms,reports}'`, then retry.
   That was executed verbatim, all four subdirectories created, and the verdict
   did not change. A remediation that, once followed, leaves the identical error
   should either not point at the filesystem or should say the filesystem is not
   the cause.

2. `export_all` with an explicit `destinationRoot` override pointing at a
   different path succeeds: 170 modules exported, `binaryMutated: false`,
   `postprocess.errors: []`. Only the configured value is rejected. A guard that
   fails closed on the configured value while accepting a semantically identical
   operation through a different parameter spelling pushes consumers to diagnose
   the tool when the problem is the config they authored.

Relation to #1438: same error code and subsystem, already closed as high priority.
This report is not a duplicate claim, it is a sharper repro plus the internal
inconsistency, which #1438 does not contain. Specifically, in #1438 the
destination directory was missing because of `git rm -r src/`. Here it existed from
the start, and the config was authored by `setup_project` rather than by hand. The
consumer-side error that triggered the original investigation is acknowledged and
is not part of this report; what remains is the `diagnose` vs write-gate
disagreement, which is independent of how the config was written.

### RED test plan

Test location: the export/project-config integration suite in the dysflow repo.

Scenario A (the core defect): given a project whose `destinationRoot` resolves to an
existing directory and where `diagnose` reports `writeReady: true`, then
`export_all` with `allowConfiguredDestinationRoot: true` and `apply: true` must not
fail with `DESTINATION_ROOT_NOT_FOUND`.

Scenario B (guard coherence): for the same fixture, assert that the
`destinationRoot` string in the `diagnose` filesystem block is byte-equal to the
path echoed in any `DESTINATION_ROOT_NOT_FOUND` message, and that when the former
says `exists: true` the latter cannot be produced.

Scenario C (override parity): assert that a write to the configured destination and
the same write through an explicit `destinationRoot` override to that same
directory produce the same verdict.

No assertion is proposed for the consumer-side hand-written-config path; that is
out of scope for this report.

### Acceptance criteria

- [ ] A project configured through `setup_project`, with an existing
      `destinationRoot`, completes `export_all` with `apply: true` and
      `allowConfiguredDestinationRoot: true`, reporting `binaryMutated: false`.
- [ ] `diagnose` and the write gate cannot disagree about the same resolved
      `destinationRoot` in the same process.
- [ ] When `DESTINATION_ROOT_NOT_FOUND` is raised, the path in the message is
      byte-equal to the `destinationRoot` path reported by `diagnose`.
- [ ] A configured destination and an explicit override to that identical
      directory yield the same outcome.
- [ ] The remediation text for `DESTINATION_ROOT_NOT_FOUND` is either correct for
      the filesystem, or it states that the filesystem is not the cause. Following
      it verbatim must change the outcome or change the message.
- [ ] Regression coverage: the full export suite plus the project-config suite stay
      green.

Suggested branch convention: `fix/diagnose-write-gate-destinationroot-coherence`.
No version bump is prescribed.

### Pre-submission checks

- [x] I searched open and closed issues for an equivalent report.
- [x] I removed secrets and private environment details from this report.

## Tasks
- [x] T1 — S1,S3 — delegated: cache coherence fixed; RED observed (stale missing and stale ready); full suite 6099 passed, 1 skipped, 1 todo; independent focused verification 43+24 passed; commit 3266408091f60b54c420c8c163f83dfd9493f045.
- [ ] T2 — S1,S2 — inline: native review, PR, exact-head CI and merge; commit 3266408091f60b54c420c8c163f83dfd9493f045.
- [ ] T3 — S1,S2 — delegated: release checklist/audit/preparation; inline delivery, exact-SHA CI, tag and published release proof; commit 3266408091f60b54c420c8c163f83dfd9493f045.

## Log
L1: "resuelve en wt la issue 1814 luego pr merge a main si ci verde y release"
L2: "tienes qu eacabar de arreglar la issue 1814 no pares hasta sacar release"
L3: Explorer found cached filesystem diagnostics versus uncached diagnose; exact incident cause not yet proven. Existing focused tests 39/39; pnpm install --frozen-lockfile complete. Worktree starts at 6e0804cc. Bugfix release assumption: patch increment under existing release procedure.
L4: Issue comment https://github.com/DysTelefonica/dysflow/issues/1814#issuecomment-5990376225 at 10/05/2026 07:53:44, verbatim:
## Observación secundaria (no bloqueante): el camino de fallo no conduce a `setup_project`

No es un segundo bug. Es la razón por la que el principal costó media sesión, y
lo dejo aparte para que se pueda descartar sin tocar el reporte de arriba.

**Runtime** 4.4.11 · **Locus** tool (ergonomía de discovery) · **Evidencia** observed

### El problema

La acción más frecuente al abrir un worktree nuevo es "configurar el proyecto",
y para eso hay una herramienta dedicada: `setup_project`. Un consumidor que no
la conoce **no tiene forma de descubrirla desde el camino de error**, porque
todo lo que dice el envelope apunta a otro lado:

- El código es `DESTINATION_ROOT_NOT_FOUND`: habla de **disco**.
- La remediación dice correr `mkdir -p '<destinationRoot>/{classes,modules,forms,reports}'`.
- Ejecutada al pie de la letra, con los cuatro subdirectorios creados, el
  veredicto **no cambió**: mismo código, misma ruta.

Para un consumidor que llega por el error, la conclusión razonable es "el disco",
y ahí se va la diagnóstico. Eso es exactamente lo que me pasó a mí: el error me
mandó a auditar el sistema de archivos cuando el sistema de archivos era
irrelevante.

### Por qué el número importa

De las 16 reglas duras del arnés, HR-10 es la única que gobierna la preparación
de un worktree nuevo, y es la décima. El error que la habría evitado es
justamente el que se comete cuando no se la carga. Es un ciclo: **el error más
común es el que hace invisible la regla que lo evita.**

`bootstrap` ya expone las puertas de escritura (`writesProcess.enabled`,
`writesProject.allowWrites`), pero no expone `projectConfig.status` ni
`projectConfig.writeReady`. Con lo que `bootstrap` devuelve hoy, un consumidor
recibe luz verde y descubre el problema recién en la primera escritura.

### Pide, sin prescribir fix

- [ ] Cuando la causa sea el config y no el disco, el envelope lo dice y nombra
      la herramienta que lo corrige (`setup_project`).
- [ ] `bootstrap` incluye `projectConfig.status` y `projectConfig.writeReady`, o
      indica explícitamente que hay que pedir `get_capabilities({view:"full"})`
      para conocer la disposición real de escritura.
- [ ] Si el config no fue autorado por `setup_project`, eso es detectable y se
      comunica, en vez de producir un veredicto incoherente más adelante.

### Regresión que lo cubre

- [ ] Un config escrito a mano, con un `destinationRoot` existente, falla hoy con
      `DESTINATION_ROOT_NOT_FOUND`. Ese fixture debe seguir fallando **con un
      mensaje que nombre la causa real**, no con uno que apunte al disco.
- [ ] El mismo config, re-escrito por `setup_project`, debe pasar sin overrides.

### Alcance

Reconozco que el config que disparó mi caso lo escribí a mano, y que eso es error
del consumidor. Lo que queda aquí es independiente: la ausencia de una ruta de
descubrimiento desde el punto de fallo, y que la evidencia que el propio error
ofrece diga "disco" cuando el disco no es la causa.

L5: Secondary comment is explicitly nonblocking. Verify hand-authored versus setup serialization claims; no authorization inferred for new provenance enforcement. Primary S3 remains unchanged.

L6: Only export readiness refreshed. Exact original incident timeline unproven; boundary regression reproduces both stale rejection and stale acceptance. Real Access export not run; binaryMutated:false asserted on external-I/O stub. Parent focused test passed. Verifier confirmed production operation routing and no provenance rule. Source normalizers/lint/tsc passed.

L7: User explicitly requested global review disable; observed off. Independent verification retained. Add trust-model evidence for export gate freshness. Implementation/test authored230 lines; automated verbatim task tracking240 lines separately retained. Single coherent fix PR, no code-golf. Prettier unavailable; repository biome formatting passed instead.

L8: PR CI on 32cb4b9 reproduced three fixture failures because Windows TEMP used an 8.3 user alias and ownership checks canonicalized the worktree. Canonicalize the temporary fixture root with realpathSync; production guards unchanged. Focused coherence/cache tests: 20 passed. CI remains the full-suite proof. Memory mirror pending because runtime session registration is unavailable.
