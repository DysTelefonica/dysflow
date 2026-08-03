# Git history size assessment and migration plan

> **Recommendation:** schedule a coordinated history-rewrite window only if reclaiming roughly 1.39 GiB from published refs justifies changing 50 tag object IDs and updating 44 GitHub release tags. Until that window is approved, do nothing to history. The forward leak is already closed.

This assessment is intentionally non-destructive. It does not rewrite refs, run garbage collection, force-push, change `.gitattributes`, or move the E2E fixtures into Git.

## Decision snapshot

| Question | Evidence | Decision |
|---|---|---|
| Is new Access binary history still accumulating? | `origin/main` tracks zero `.accdb` or `.laccdb` files; `.gitignore` excludes the E2E Access fixtures and lock files. | No. Keep the existing ignore and attribute rules unchanged. |
| Is the local 2.47 GiB object store equal to clone cost? | No. It includes local unreachable objects. GitHub reports 1,478,666 KiB (about 1.41 GiB) for published repository storage. | Separate clone debt from local garbage. |
| Is a rewrite technically worthwhile? | Published Access artifacts occupy about 1.389 GiB in the local pack representation. | Potentially: a rewritten/repacked mirror is projected to fall into the low tens of MiB, subject to mirror verification. |
| Is it operationally cheap? | 50 of 265 tags and 44 GitHub releases descend from Access-bearing history. Their target SHAs change. | No. Require an explicit maintenance window and collaborator reset plan. |
| Should this PR rewrite history? | Issue #1357 requests measurement and planning only. | No. This document is the complete scope. |

## Measured state

Assessment authority: `origin/main` at `e07f7785942da0fd89fe720a96adfb0cc85a0c24` (`v2.34.2`), measured 2026-08-03.

| Measurement | Result | Meaning |
|---|---:|---|
| Local packed object store | 2.47 GiB | Shared local Git common directory; not a clean-clone estimate. |
| GitHub repository size | 1,444.01 MiB (1.410 GiB) | Published-ref estimate returned by the GitHub repository API. |
| Reachable historical Access artifacts | 74 unique blobs, 1.784 GiB logical, 1.389 GiB on disk | Payload retained by published tags/releases. |
| Reachable Access blobs above 10 MiB | 68 | Fully enumerated below. |
| Local unreachable blobs above 10 MiB | 21, 0.744 GiB on disk | Local-only garbage; a fresh clone does not need it. No `gc` was run. |
| `NoConformidades.accdb` history | 59 commits with `--follow` | Confirms the issue's original revision count. |
| All Access artifact history | 63 commits across nine historical paths | Includes backend files, the lock file, and five compact-repair backups. |
| Current tracked Access files | 0 | The forward leak is closed. |
| Remote branches | `main` only | No published feature branch currently needs rebasing. |
| Open pull requests at assessment time | 0 | Recheck immediately before a rewrite window. |
| Tags / affected tags | 265 / 50 | Affected tag object IDs must be force-updated; unaffected tags should remain byte-identical. |
| GitHub releases / affected release tags | 248 / 44 | Release assets can remain, but the associated tags move. |

### Reachable storage by historical path

| Historical path | Unique blobs | Logical MiB | On-disk MiB |
|---|---:|---:|---:|
| `E2E_testing/NoConformidades_Datos.accdb.bak-20260709115155` | 1 | 26.17 | 26.17 |
| `E2E_testing/NoConformidades_Datos.accdb.bak-20260709120009` | 1 | 16.18 | 16.18 |
| `E2E_testing/NoConformidades_Datos.accdb.bak-20260709120818` | 1 | 16.18 | 16.18 |
| `E2E_testing/NoConformidades_Datos.accdb.bak-20260709121641` | 1 | 16.18 | 16.18 |
| `E2E_testing/NoConformidades_Datos.accdb.bak-20260709122305` | 1 | 16.18 | 16.18 |
| `Lanzadera_Datos.accdb` | 1 | 5.41 | 5.41 |
| `NoConformidades.accdb` | 55 | 1,427.44 | 1,150.74 |
| `NoConformidades.laccdb` | 1 | 0.00 | 0.00 |
| `NoConformidades_Datos.accdb` | 12 | 303.17 | 174.94 |

### Projected savings by candidate set

These are planning estimates, not promises. GitHub's repository-size field and Git's local `objectsize:disk` are different measurements; the release-grade number is the size of a freshly rewritten and repacked disposable mirror.

| Purge set | Estimated reclaimed MiB | Estimated residual from GitHub size | Tradeoff |
|---|---:|---:|---|
| `NoConformidades.accdb` only | 1,150.74 | 293.27 MiB | Largest saving with the narrowest path set. |
| Frontend + `NoConformidades_Datos.accdb` | 1,325.68 | 118.33 MiB | Removes the main frontend/backend fixture history. |
| Frontend + backend + five backups | 1,416.57 | 27.44 MiB | Also removes accidental compact-repair backups. |
| All nine Access artifact paths | 1,421.98 | 22.03 MiB | Recommended rewrite set if the team proceeds; avoids leaving small or lock-file remnants. |

## Large reachable blob inventory

The following table lists every reachable Access artifact above 10 MiB. The introducing commit is the first Access-touching commit whose tree contains that blob; it is review evidence, not a claim that the commit belongs to `origin/main`'s first-parent history.

| Blob | MiB | On-disk MiB | Historical path | First introducing commit |
|---|---:|---:|---|---|
| `e47b91f20d48` | 26.17 | 26.17 | `E2E_testing/NoConformidades_Datos.accdb.bak-20260709115155` | `24b91c76e09a` · 2026-07-09 · feat(forms): finalize AI-first form UI builder workflow |
| `28a674be1cae` | 16.18 | 16.18 | `E2E_testing/NoConformidades_Datos.accdb.bak-20260709120009` | `24b91c76e09a` · 2026-07-09 · feat(forms): finalize AI-first form UI builder workflow |
| `3b26d58cee27` | 16.18 | 16.18 | `E2E_testing/NoConformidades_Datos.accdb.bak-20260709120818` | `24b91c76e09a` · 2026-07-09 · feat(forms): finalize AI-first form UI builder workflow |
| `6e0529147a5d` | 16.18 | 16.18 | `E2E_testing/NoConformidades_Datos.accdb.bak-20260709121641` | `24b91c76e09a` · 2026-07-09 · feat(forms): finalize AI-first form UI builder workflow |
| `bca4be93eebc` | 16.18 | 16.18 | `E2E_testing/NoConformidades_Datos.accdb.bak-20260709122305` | `24b91c76e09a` · 2026-07-09 · feat(forms): finalize AI-first form UI builder workflow |
| `84351c7bd461` | 58.38 | 58.38 | `NoConformidades.accdb` | `5c2f08832f92` · 2026-05-28 · fix(access): sync PRUEBA-004 forms |
| `9443783539b8` | 57.88 | 57.88 | `NoConformidades.accdb` | `f7c7958d7334` · 2026-04-17 · fix(cache): add 4 missing methods to CacheNCProyecto.bas |
| `ea5090eca779` | 54.12 | 54.14 | `NoConformidades.accdb` | `f605d21de557` · 2026-02-13 · Carga inicial No_conformidades |
| `a3191d1ea1c1` | 44.11 | 44.11 | `NoConformidades.accdb` | `5f17e5080d14` · 2026-06-16 · chore(binary): import 5 test modules after issue-67 e386a8b / 2c8ee54 |
| `0a4b4017087d` | 41.25 | 0.02 | `NoConformidades.accdb` | `3fe801e72f2c` · 2026-06-16 · chore(binary): sync frontend after rebase on staging post-merge #69 |
| `29eddfeaa375` | 41.25 | 41.25 | `NoConformidades.accdb` | `a6c442767c33` · 2026-06-01 · chore(access): sync compiled frontend binary |
| `44b66aae1d16` | 41.25 | 41.25 | `NoConformidades.accdb` | `8f5963096c05` · 2026-06-16 · chore(binary): delete dead class InformeNCAuditorias from frontend |
| `4ef671e99e4c` | 41.25 | 41.25 | `NoConformidades.accdb` | `711368aa71ed` · 2026-06-15 · chore(access): sync frontend binary with Issue #18 VBA source update |
| `99c15e20e551` | 41.25 | 41.25 | `NoConformidades.accdb` | `07d3ff86ef0d` · 2026-06-01 · fix(cache): sync NC list cache updates |
| `bb82e249312f` | 41.25 | 41.25 | `NoConformidades.accdb` | `4ff8f4f7c74e` · 2026-06-01 · refactor(tests): split stateful indicator suites into dedicated manifests |
| `a8f304665d6b` | 38.84 | 38.84 | `NoConformidades.accdb` | `5c89e67feeb5` · 2026-05-28 · chore(access): sync compiled staging binary |
| `cec30f347b30` | 38.84 | 0.04 | `NoConformidades.accdb` | `3e09db87868d` · 2026-05-28 · fix(vba): restore cache fixtures and config compatibility |
| `cf8aeda9fed6` | 38.36 | 38.36 | `NoConformidades.accdb` | `7fe71cbbb9e6` · 2026-06-16 · feat(cache-listado-nc): scheduled audit + HTML report + email queue |
| `0a78e2c3330d` | 36.58 | 36.59 | `NoConformidades.accdb` | `24c8d0b496a1` · 2026-05-12 · release: 2026-006 |
| `904b1e7a71cb` | 36.12 | 6.38 | `NoConformidades.accdb` | `74e41c70d392` · 2026-04-16 · chore: pre-export safety commit before fixing ModuloX naming |
| `ab9fa304a5cd` | 32.58 | 32.58 | `NoConformidades.accdb` | `a45231882589` · 2026-05-28 · fix(release): restore main from validated Access binary |
| `99e5e15976b6` | 30.02 | 30.03 | `NoConformidades.accdb` | `e834d95664c5` · 2026-04-16 · refactor: align main with production baseline |
| `6aa491f2d257` | 25.94 | 25.94 | `NoConformidades.accdb` | `3501a82266f3` · 2026-05-26 · fix(indicators): initialize materialized cache on startup |
| `85e6568a13a7` | 25.94 | 25.94 | `NoConformidades.accdb` | `a63c4b1758e3` · 2026-05-26 · fix(indicators): force seguimiento manual refresh |
| `4754554d1610` | 25.86 | 25.87 | `NoConformidades.accdb` | `6ad65c2105ac` · 2026-05-26 · chore(access): update staging binaries |
| `331c0d1230b7` | 23.32 | 23.32 | `NoConformidades.accdb` | `c9a830d9b1f0` · 2026-05-24 · test(vba): make cache tests deterministic |
| `74afd1cf009d` | 23.32 | 23.32 | `NoConformidades.accdb` | `7d9f1cd9081f` · 2026-05-25 · test(vba): harden config core fixtures |
| `79b8f7660214` | 23.32 | 23.32 | `NoConformidades.accdb` | `35d950fa0436` · 2026-05-25 · test(vba): gate KillSwitch config fixture (#35) |
| `c1c4ba10c9bf` | 23.32 | 23.32 | `NoConformidades.accdb` | `8c953687906a` · 2026-05-25 · test(vba): harden backend config path fixture |
| `c5a996bd5b89` | 23.32 | 23.32 | `NoConformidades.accdb` | `16e16da06932` · 2026-05-25 · test(vba): harden cache e2e fixtures |
| `e8e264790668` | 23.32 | 23.32 | `NoConformidades.accdb` | `efb31679423c` · 2026-05-25 · test(vba): seed KillSwitch config fixture |
| `ee0221d951ed` | 23.32 | 23.32 | `NoConformidades.accdb` | `8e4c38ba76b5` · 2026-05-25 · test(vba): harden motivo persistence fixtures |
| `268b542bcfa3` | 23.12 | 23.13 | `NoConformidades.accdb` | `bc95573c226b` · 2026-05-24 · perf(indicators): use Proyecto fast summary path |
| `3bf3a84028bf` | 22.85 | 22.85 | `NoConformidades.accdb` | `fc82f676d296` · 2026-05-23 · test(vba): harden access tdd compliance |
| `4a7c65c1cc93` | 22.85 | 22.85 | `NoConformidades.accdb` | `9278c43fd84e` · 2026-05-23 · feat(indicators): add Proyecto fast count helper |
| `5f57605a8c59` | 22.85 | 7.08 | `NoConformidades.accdb` | `9279453c801d` · 2026-05-20 · chore(sync): snapshot local changes |
| `621c851a4c12` | 22.85 | 22.85 | `NoConformidades.accdb` | `67ca122ee637` · 2026-05-23 · feat(indicators): add startup telemetry |
| `74faf8d98cbc` | 22.85 | 0.02 | `NoConformidades.accdb` | `6aa1d5e563cb` · 2026-05-21 · chore(bin): sync Access binary after issue cleanup |
| `7b978315998b` | 22.85 | 22.85 | `NoConformidades.accdb` | `0259eb85de75` · 2026-05-21 · fix(issue-20): sanitize local user paths |
| `b35d912702df` | 22.85 | 22.85 | `NoConformidades.accdb` | `1ead04f23220` · 2026-05-19 · chore(bin): update Access binaries after form and indicator refactor |
| `f3216b00766d` | 22.85 | 22.85 | `NoConformidades.accdb` | `4f4604a54e88` · 2026-05-24 · feat(access): show indicator progress status |
| `fe9ecd71fda0` | 22.85 | 8.14 | `NoConformidades.accdb` | `7f6686bf1488` · 2026-05-24 · fix(forms): restore Motivos No CE button icon |
| `4e9306c811fb` | 15.99 | 3.93 | `NoConformidades.accdb` | `3f74d22ee76f` · 2026-05-18 · feat(config): centralize database access |
| `54bfe6125b81` | 15.99 | 0.11 | `NoConformidades.accdb` | `5082b59b6cc1` · 2026-05-18 · feat(config): add config migration helper |
| `6a322ffc22e6` | 15.99 | 0.86 | `NoConformidades.accdb` | `b270f626db27` · 2026-05-17 · fix(config): validate infra paths at startup |
| `7c6be3d0027d` | 15.99 | 15.99 | `NoConformidades.accdb` | `017228297a2a` · 2026-05-19 · fix(vba): resolve motive popup compile error |
| `8ed7bb942873` | 15.99 | 15.99 | `NoConformidades.accdb` | `53a76b4cfc78` · 2026-05-18 · chore(config): apply config table migration |
| `b5be06de50ce` | 15.99 | 2.34 | `NoConformidades.accdb` | `8a653a5b2093` · 2026-05-19 · fix(vba): stabilize staging validation |
| `dc1e154910a2` | 15.99 | 3.41 | `NoConformidades.accdb` | `01e6205c4220` · 2026-05-19 · fix(nc): persist control efficacy motive |
| `dd2bf8b6160a` | 15.99 | 3.98 | `NoConformidades.accdb` | `a138cca68ce4` · 2026-05-17 · fix(report): restore control efficacy motive |
| `4a61a6b599ca` | 15.97 | 15.97 | `NoConformidades.accdb` | `5471be6cd0aa` · 2026-05-16 · feat(cache): validate operational cache readiness |
| `56f09171f4df` | 15.97 | 15.97 | `NoConformidades.accdb` | `561a4c432005` · 2026-05-16 · test(vba): keep only automatable suite entries |
| `87b932cb94d0` | 15.97 | 15.97 | `NoConformidades.accdb` | `6ac42b8b9359` · 2026-05-16 · fix(config): add frontend backend configuration |
| `f78b2d24d5df` | 15.97 | 0.13 | `NoConformidades.accdb` | `2b0feba5190d` · 2026-05-16 · feat(config): use backend config for db routing |
| `1ed14a341241` | 13.85 | 3.27 | `NoConformidades.accdb` | `9da1014eb529` · 2026-04-18 · feat(cache): implement PrecalentarCacheCompleto, SincronizarCache, InvalidateListItem |
| `68f9f8de044d` | 10.71 | 10.72 | `NoConformidades.accdb` | `c6554ca2e240` · 2026-04-16 · solo se aplica caché si lo indica la variable global |
| `033894c66a2c` | 10.09 | 10.09 | `NoConformidades.accdb` | `b18528e5e276` · 2026-04-14 · Add .ini |
| `17defd172a2a` | 42.45 | 42.45 | `NoConformidades_Datos.accdb` | `1396a0f01dd7` · 2026-06-16 · docs(catalog): add v2-aligned capability + feature catalog (Issue #67) — #67 |
| `38490b0c6449` | 26.17 | 12.02 | `NoConformidades_Datos.accdb` | `01e6205c4220` · 2026-05-19 · fix(nc): persist control efficacy motive |
| `408679e88a2f` | 26.17 | 11.03 | `NoConformidades_Datos.accdb` | `8a653a5b2093` · 2026-05-19 · fix(vba): stabilize staging validation |
| `6944f3a13ca1` | 26.17 | 11.27 | `NoConformidades_Datos.accdb` | `017228297a2a` · 2026-05-19 · fix(vba): resolve motive popup compile error |
| `975069c18430` | 26.17 | 0.00 | `NoConformidades_Datos.accdb` | `53a76b4cfc78` · 2026-05-18 · chore(config): apply config table migration |
| `a74056cdaf1a` | 26.17 | 26.06 | `NoConformidades_Datos.accdb` | `5082b59b6cc1` · 2026-05-18 · feat(config): add config migration helper |
| `b0d7e3ff5231` | 26.17 | 1.88 | `NoConformidades_Datos.accdb` | `efb31679423c` · 2026-05-25 · test(vba): seed KillSwitch config fixture |
| `bf6eda176424` | 26.17 | 0.99 | `NoConformidades_Datos.accdb` | `5471be6cd0aa` · 2026-05-16 · feat(cache): validate operational cache readiness |
| `c0f205154fba` | 26.17 | 26.06 | `NoConformidades_Datos.accdb` | `1ead04f23220` · 2026-05-19 · chore(bin): update Access binaries after form and indicator refactor |
| `fb20c84c0ee1` | 26.17 | 26.06 | `NoConformidades_Datos.accdb` | `6ad65c2105ac` · 2026-05-26 · chore(access): update staging binaries |
| `d62215bc21d8` | 16.88 | 16.66 | `NoConformidades_Datos.accdb` | `24c8d0b496a1` · 2026-05-12 · release: 2026-006 |

## Local unreachable objects are separate

These objects are not reachable from current refs or reflogs. They explain why this checkout is materially larger than GitHub's published size estimate and must not be presented as remote clone debt.

| Blob | Logical MiB | On-disk MiB | Header classification |
|---|---:|---:|---|
| `0ef9ecd0d5a9` | 76.49 | 76.50 | PE executable |
| `a9f85e5b8a7a` | 75.57 | 30.10 | PE executable |
| `5713cd2e5da6` | 66.96 | 66.96 | Access ACE database |
| `77136135d950` | 66.96 | 66.96 | Access ACE database |
| `d6be6523fc64` | 66.96 | 66.96 | Access ACE database |
| `37744b0e9a51` | 66.96 | 66.96 | Access ACE database |
| `9e665c92fc1a` | 54.12 | 54.13 | Access ACE database |
| `32948a7735ec` | 43.82 | 43.82 | Access ACE database |
| `6d479c2ff630` | 43.82 | 43.82 | Access ACE database |
| `ab22d140dc00` | 43.32 | 43.32 | Access ACE database |
| `35759bb3cd8b` | 29.46 | 12.86 | SQLite database |
| `044a4432983c` | 27.93 | 27.93 | Access ACE database |
| `ea805c417755` | 27.93 | 27.93 | Access ACE database |
| `94fde595f2ad` | 27.93 | 10.23 | Access ACE database |
| `905acad99629` | 26.17 | 26.06 | Access ACE database |
| `8629f7b45028` | 22.38 | 22.39 | PE executable |
| `684128bc47ec` | 19.54 | 19.54 | Access ACE database |
| `794dcc1b07db` | 18.03 | 18.03 | SQLite database |
| `a46fbd87b6cc` | 14.83 | 14.83 | Other/opaque |
| `94b66d75aaa5` | 11.61 | 11.61 | Access ACE database |
| `5af34ef6780a` | 11.13 | 11.13 | PE executable |

Header summary: **14 Access ACE databases, 4 PE executables, 2 SQLite databases, and 1 other opaque object**. The previously untitled 44–76 MiB objects are not one homogeneous Access-fixture set.

Local cleanup is outside this issue. A normal maintenance `gc` or a fresh clone can remove unreachable storage without rewriting published history, but no `gc` should run while active worktrees share this object store.

## Live-reference impact

### What is not coupled to old Git object IDs

- No current CI workflow names `NoConformidades`, an `.accdb` path, or an internal 40-character commit SHA.
- None of the 480 inspected release assets is an Access database or `NoConformidades` fixture.
- The E2E harness expects gitignored local fixtures. It does not recover them with `git show`, `git checkout`, or `git archive`.
- `origin/main` itself has no Access-bearing commit in its reachable history, so its current SHA is expected to remain unchanged. Verify this in the candidate mirror; do not assume it.

### What will change

- 50 tags resolve through Access-bearing history and will receive new object IDs.
- 44 GitHub releases use affected tags. Their assets need not change, but their tag/target relationship must be verified after the force-update.
- Commit links, external bookmarks, signed tag/commit verification, forks, cached CI clones, and local worktrees that reference rewritten objects become stale.
- Any PR opened after this assessment must be merged, closed, or explicitly rebased before the window.

Affected tags: `2026-005.2`, `2026-006`, `2026-007`, `2026-008`, `PRUEBA-003`, `v0.1.0-staging.1`, `v2.2.1`, `v2.3.0`, `v2.3.1`, `v2.4.0`, `v2.5.0`, `v2.5.1`, `v2.5.2`, `v2.5.3`, `v2.5.4`, `v2.6.0`, `v2.7.0`, `v2.8.0`, `v2.9.0`, `v2.9.1`, `v2.9.2`, `v2.9.3`, `v2.10.0`, `v2.10.1`, `v2.11.0`, `v2.11.1`, `v2.12.0`, `v2.12.1`, `v2.13.0`, `v2.13.1`, `v2.13.2`, `v2.13.3`, `v2.14.0`, `v2.14.1`, `v2.14.2`, `v2.15.0`, `v2.16.0`, `v2.17.0`, `v2.17.1`, `v2.19.0`, `v2.20.0`, `v2.21.0`, `v2.21.1`, `v2.22.0`, `v2.22.1`, `v2.23.0`, `v2.23.1`, `v2.24.0`, `v2.24.1`, and `v2.24.2`. Of these, 44 have GitHub release records. Regenerate the exact list immediately before the maintenance window.

## Reproduce the assessment

Run from a clone that has fetched every branch and tag. These commands are read-only:

```powershell
git fetch --all --tags --prune
git rev-parse origin/main
git count-objects -vH
git ls-files '*.accdb' '*.laccdb'
git log --all --follow --format='%H' -- '*NoConformidades.accdb'
git log --all --format='%H' -- '*.accdb' '*.laccdb' '*.accdb.bak-*'
gh api repos/DysTelefonica/dysflow --jq '.size'
gh pr list --repo DysTelefonica/dysflow --state open
gh release list --repo DysTelefonica/dysflow --limit 300 --json tagName
```

To reproduce object sizes without materializing blob contents:

```powershell
git rev-list --objects --all > reachable-objects.txt
git cat-file --batch-check='%(objectname) %(objecttype) %(objectsize) %(objectsize:disk)' < object-ids.txt
```

Filter `reachable-objects.txt` to the nine paths above, then feed those object IDs to `cat-file`. Use `git fsck --unreachable --no-reflogs` plus the same batch query for the local-only table. Do not use local unreachable totals as a clone projection.

## Coordinated migration plan

### 1. Approve or reject the disruption

Approval must name an owner, maintenance window, communication channel, force-push authority, and rollback owner. Recheck branches, PRs, tags, releases, protected-branch rules, and signed-object requirements immediately before freezing writes.

### 2. Freeze and back up

1. Announce a no-push window.
2. Merge or close every open PR; record its head SHA.
3. Create an offline mirror backup on separate storage.
4. Create a full bundle from the untouched mirror.
5. Run `git fsck --full` in the backup and record its checksum and object counts.
6. Prove the backup can restore into a new bare repository before filtering anything.

```powershell
git clone --mirror https://github.com/DysTelefonica/dysflow.git dysflow-before-history-rewrite.git
Set-Location dysflow-before-history-rewrite.git
git fsck --full
git bundle create ../dysflow-before-history-rewrite.bundle --all
git bundle verify ../dysflow-before-history-rewrite.bundle
```

### 3. Build a disposable candidate mirror

Never run `filter-repo` in an active developer clone or in the backup. Clone the backup into a disposable candidate and remove the exact path set:

```powershell
git clone --mirror dysflow-before-history-rewrite.git dysflow-history-candidate.git
Set-Location dysflow-history-candidate.git
git filter-repo --force --invert-paths --path NoConformidades.accdb --path NoConformidades_Datos.accdb --path Lanzadera_Datos.accdb --path NoConformidades.laccdb --path E2E_testing/NoConformidades_Datos.accdb.bak-20260709115155 --path E2E_testing/NoConformidades_Datos.accdb.bak-20260709120009 --path E2E_testing/NoConformidades_Datos.accdb.bak-20260709120818 --path E2E_testing/NoConformidades_Datos.accdb.bak-20260709121641 --path E2E_testing/NoConformidades_Datos.accdb.bak-20260709122305
```

Review `git filter-repo`'s commit/ref mapping before any push.

### 4. Verify the candidate before publication

- `git fsck --full` passes.
- `git rev-list --objects --all` contains none of the nine paths.
- `git log --all -- '*.accdb' '*.laccdb' '*.accdb.bak-*'` returns no entries.
- `origin/main`'s tree matches the pre-rewrite tree exactly: compare `old-main^{tree}` with `new-main^{tree}`.
- Every unaffected tag retains its exact old object ID.
- The expected 50 affected tags have an explicit old-to-new mapping.
- A fresh non-mirror clone has the projected low size and checks out cleanly.
- `pnpm install --frozen-lockfile`, `pnpm build`, `pnpm lint`, and `pnpm test` pass in that fresh clone.
- Release assets and their checksums remain available.
- The E2E harness still requests local gitignored fixtures and never fetches them from history.

### 5. Publish only with explicit final approval

`filter-repo` normally removes `origin` as a safety measure. Re-add the reviewed GitHub URL only after candidate verification. Coordinate branch/tag protections, then force-update exactly the reviewed branches and tags. Do **not** use an unreviewed `git push --mirror` against GitHub because it may attempt to alter provider-owned refs.

```powershell
git remote add origin https://github.com/DysTelefonica/dysflow.git
git push --force-with-lease origin refs/heads/main:refs/heads/main
$affectedTags = Get-Content ../affected-tags.txt
foreach ($tag in $affectedTags) {
  git push --force origin "refs/tags/${tag}:refs/tags/${tag}"
}
```

Because `main` is expected to be unchanged, its force-with-lease push should be a no-op; abort if it is not. Generate `affected-tags.txt` from the reviewed old/new mapping. Tags lack an equivalent safe lease workflow here, so compare every old/new tag immediately before these explicit pushes. Never push every tag merely for convenience.

### 6. Re-clone and verify service restoration

- Every collaborator archives unpushed patches, removes old worktrees/clones, and re-clones.
- Invalidate CI caches and hosted mirrors.
- Give fork owners the old/new mapping and reset instructions.
- Verify branch protection, the latest release, all affected release tag links, and one fresh CI run.
- End the freeze only after fresh-clone verification succeeds.

## Rollback position

The offline mirror and bundle are the rollback authority. If candidate verification or post-push validation fails:

1. Restore branches and tags from the untouched mirror during the same freeze window.
2. Re-verify `git fsck`, tag IDs, release links, and a fresh clone.
3. Tell collaborators to discard any clone made from the failed rewritten state and re-clone again.
4. Preserve both old/new mapping reports and incident evidence.

Rollback after collaborators resume work is substantially harder: new commits created on rewritten history must be preserved separately and replayed. Keep the write freeze active until validation completes.

## Do-nothing alternative

Doing nothing is legitimate. It preserves every SHA, tag signature, release relationship, fork, cached clone, and external link. The cost is roughly 1.41 GiB for a full published-ref clone and continued storage/checkout overhead.

Keep the do-nothing state until the team can schedule a real maintenance window. When clone frequency, CI transfer cost, or onboarding pain justifies the disruption, execute the all-nine-path plan—not a partial rewrite—and validate it in a disposable mirror first.

## Acceptance checklist

- [x] Forward leak confirmed closed.
- [x] Reachable clone debt separated from local unreachable garbage.
- [x] Every reachable Access blob above 10 MiB listed with path and introducing commit.
- [x] Projected savings stated as estimates with mandatory mirror measurement.
- [x] CI, fixture, tag, and release consequences checked.
- [x] Exact filter path set, coordination plan, verification, and rollback documented.
- [x] Do-nothing alternative and tradeoff stated.
- [x] No history rewrite, force-push, `gc`, `.gitattributes` edit, or runtime change performed.
