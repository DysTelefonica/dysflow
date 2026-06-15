# vba-orphan-audit Specification

## Purpose
Audits discrepancies between database VBA objects and local source files.

## Requirements

### Requirement: VBA Orphan Auditing
The system MUST compare local source files with the database VBE catalog and report:
- Orphans (disk files missing in DB)
- Missing (DB modules missing on disk)
- Placeholders/Duplicates

#### Scenario: File exists on disk but not in DB
- GIVEN a local file "ModDisk.bas" that is absent in the database
- WHEN the orphan audit executes
- THEN the result MUST flag "ModDisk.bas" as a disk-only orphan

#### Scenario: Module exists in DB but not on disk
- GIVEN a database module "ModDB" that has no corresponding disk file
- WHEN the orphan audit executes
- THEN the result MUST flag "ModDB" as database-only missing source
