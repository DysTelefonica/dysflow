# Relink-directory orchestration

`relink_directory` separates policy from Microsoft Access I/O. The core owns which files and
links are inspected, which mutations are planned, their order, and how failures appear in the
report.

PowerShell retains filesystem enumeration, DAO open/read/write, backup, and TableDef primitives.

## Behavior matrix

| Scenario | Core decision | PowerShell responsibility | Observable result |
|---|---|---|---|
| Recursive traversal | Keep contained `.accdb` and `.mdb` candidates at any depth | Enumerate candidate files | Every selected file is inspected in core order |
| Non-recursive traversal | Keep only candidates whose parent is the root | Enumerate the same candidate set | Nested databases are not scanned |
| Root containment | Accept the root and true descendants, case-insensitively | Return absolute candidate paths | A sibling such as `root-other` is never local |
| Unique basename and extension | Plan the single exact `.accdb` or `.mdb` match | Report raw link metadata | No cross-extension match is attempted |
| Alias mapping | Apply `maps.from` to `maps.to` before lookup | Transport the requested maps | The mapped basename still requires one exact match |
| Missing or ambiguous target | Mark the link unresolved | Report link and backend existence | No relink action is sent |
| Password fallback | Keep password policy outside core | Try the frontend password, then the backend password | Inspection and apply preserve existing fallback behavior |
| Dry run | Complete after inspection | Perform no backup or DAO mutation | Plans and counts are returned without writes |
| Apply with backup | Request backup before a file's actions | Copy the file, then open it for write | Backup path is reported before successful mutations |
| Apply with `noBackup` | Set `createBackup` to false | Open the file without copying | Mutation semantics are otherwise unchanged |
| Backup failure | Skip that file's actions and continue later file plans | Return `backupError` | The error is reported and later files still run |
| Multi-hop link | Follow inspected TableDefs up to five hops | Supply raw TableDef evidence | The plan points directly to the native endpoint |
| Cycle | Emit no mutation action for the cyclic link | Perform no cycle detection | The link is reported with `cycleDetected: true` |
| Target table missing | Mark unresolved and record the reason | Supply the target database's table inventory | `target-table-missing` is reported |
| Remove unresolved | Plan an ordered remove action when requested | Delete the named TableDef | Successful removal is reported as `removed` |
| Per-link failure | Continue the remaining actions in that file | Return one result per action | Successful later actions are retained |
| Per-file open failure | Continue later file plans | Return `openError` | The failed file and global report carry the error |
| External, denied, broken | Count unresolved links from core evidence | Report original path existence | `externalLinkCount`, `datosteLinkCount`, and `brokenLinkCount` remain stable |

## Core state machine

`src/core/services/relink-directory-orchestration.ts` is the policy owner. Its decisions form a
bounded state machine:

1. `inspect` selects contained files and fixes their inspection order.
2. `apply` contains ordered per-file plans and ordered relink/remove actions.
3. `complete` projects the public `RelinkDirectoryReport`.

The core rejects inspection or apply results returned out of order. It executes ports
sequentially and continues after typed backup, open, or action failures.

This keeps partial-failure semantics deterministic without teaching DAO details to the core.

## PowerShell boundary

`scripts/lib/dysflow-relink-directory-transport.psm1` transports JSON decisions between
PowerShell and `dist/cli/relink-directory-orchestration.js`.

The runner exposes only primitives for enumeration, inspection, backup, DAO open, relink, and
removal.

The transport uses a base64 environment payload and a base64 result marker so command quoting
cannot alter JSON. It restores the previous environment value after every decision call.

The runtime installation path is unchanged. Development builds remain in the repository or the
throwaway test runtime, never in the production runtime.

## Contract evidence

- Core behavior and failure policy: `test/core/services/relink-directory-orchestration.test.ts`.
- PowerShell transport order and dry-run boundary:
  `scripts/tests/dysflow-relink-directory-transport.Tests.ps1`.
- DAO primitive fallback and partial failures: `scripts/tests/dysflow-access-runner.Tests.ps1`.
- Real Access behavior: `test/e2e/access-relink-directory.test.ts` and
  `test/e2e/access-relink-directory-apply.test.ts`.
