# Dysflow 2.22.1 — mapa de funcionalidades y parámetros

Fuente: `schema({})` y `get_capabilities({})` del runtime live, capturados el 2026-07-23. El CSV hermano contiene las 992 apariciones de parámetros sin resumir.

## Bootstrap/diagnóstico

| Tool | Clase | Requeridos | Parámetros funcionales opcionales | Intención de escritura |
|---|---|---|---|---|
| `describe_tool` | read | — | `name`, `toolName` | — |
| `diagnose` | read | — | — | — |
| `doctor` | read | — | `includeEnvironment` | — |
| `get_capabilities` | read | — | — | — |
| `logs` | read | — | `cwd`, `options` | — |
| `resolve_project` | read | — | `cwd` | — |
| `schema` | read | — | — | — |
| `state` | read | — | — | — |

## Procesos/recuperación

| Tool | Clase | Requeridos | Parámetros funcionales opcionales | Intención de escritura |
|---|---|---|---|---|
| `access_force_cleanup_orphaned` | write | — | `confirmPid` | apply (default: noop) |
| `clean_stale_markers` | write | — | — | apply (default: noop) |
| `cleanup_access_operation` | write | `operationId`, `accessPath` | `force` | apply (default: noop) |
| `list_access_operations` | read | — | — | — |

## Sync VBA

| Tool | Clase | Requeridos | Parámetros funcionales opcionales | Intención de escritura |
|---|---|---|---|---|
| `delete_module` | write | — | `moduleName`, `moduleNames`, `force` | apply (default: noop) |
| `exists` | read | — | `name`, `moduleName` | — |
| `export_all` | write | — | `filter`, `prune`, `exportPath`, `verbose`, `confirmOverwriteSource` | apply (default: writes) |
| `export_modules` | write | — | `moduleNames`, `filter`, `exportPath`, `mutateBinary`, `verbose`, `confirmOverwriteSource`, `allowExternalAccessPath`, `transactional`, `dryRunWithPreflight` | apply (default: writes) |
| `fix_encoding` | write | — | `location` | apply (default: plan) |
| `import_all` | write | — | `importMode`, `verbose` | apply (default: plan) |
| `import_modules` | write | — | `moduleNames`, `importMode`, `verbose`, `sourceDir`, `recursive`, `filePattern`, `includeTests`, `includeForms`, `chunkSize`, `onChunkError`, `transactional`, `dryRunWithPreflight` | apply (default: plan) |
| `list_objects` | read | — | `filter`, `allowExternalAccessPath` | — |
| `list_vba_modules` | read | — | `typeFilter`, `namePattern`, `allowExternalAccessPath` | — |
| `sync_binary` | write | — | `moduleNames`, `directoryPath`, `recursive`, `includeTests`, `includeForms`, `strict`, `direction`, `acceptBothChanged`, `scope`, `batchSize`, `onChunkError`, `parallelChunks`, `returnFullDiff`, `transactional`, `dryRunWithPreflight` | apply (default: plan) |
| `verify_code` | read | — | `strict`, `moduleNames`, `chunkSize`, `parallelChunks`, `onChunkTimeout`, `allowExternalAccessPath` | — |

## Análisis VBA

| Tool | Clase | Requeridos | Parámetros funcionales opcionales | Intención de escritura |
|---|---|---|---|---|
| `detect_dead_code` | read | `scope` | `module`, `modules` | — |
| `find_references` | read | `symbol` | `scope`, `limit`, `offset`, `module`, `modules` | — |
| `get_procedure` | read | `module`, `procedure` | `source` | — |
| `lint_module` | read | `module` | `source`, `rules` | — |
| `list_procedures` | read | `module` | `filter`, `kind`, `source` | — |
| `validate_manifest` | read | — | `testsPath`, `path`, `manifest`, `modules`, `validateManifestIncludesAllowlistCheck` | — |
| `vba_orphan_audit` | read | — | — | — |

## Ejecución/tests VBA

| Tool | Clase | Requeridos | Parámetros funcionales opcionales | Intención de escritura |
|---|---|---|---|---|
| `run_vba` | write | `procedureName` | `argsJson` | apply (default: plan) |
| `test_vba` | write | — | `proceduresJson`, `filter`, `testsPath` | dryRun (default: plan) |
| `vba_inline_execution` | write | `code` | — | apply (default: plan) |

## Artefactos form/report

| Tool | Clase | Requeridos | Parámetros funcionales opcionales | Intención de escritura |
|---|---|---|---|---|
| `catalog_add_control` | write | — | `catalogPath`, `controlName`, `controlType`, `type`, `spec`, `specPath` | apply (default: plan) |
| `compare_form` | read | — | `sourcePath`, `path`, `targetPath`, `target`, `formName`, `name`, `targetName`, `targetForm` | — |
| `create_form_from_template` | write | `sourceForm`, `targetForm`, `tokenMap` | `missingTokenPolicy`, `strictMissingTokens`, `overwrite` | apply (default: plan) |
| `form_deserialize` | write | `sourcePath`, `ir` | `path`, `formName` | apply (default: plan) |
| `form_serialize` | read | `sourcePath` | `path`, `formName`, `includeSerialized` | — |
| `generate_form` | write | — | `specPath`, `spec`, `kind`, `name`, `replace` | apply (default: plan) |
| `harvest_form_catalog` | read | — | `catalogPath`, `filter` | — |
| `inspect_form` | read | — | `sourcePath`, `path`, `formName`, `name` | — |
| `lint_form_code` | read | — | `sourceRoot`, `formName`, `moduleNames`, `rules`, `strict` | — |
| `validate_form_spec` | read | — | `specPath`, `spec` | — |

## UI de formularios

| Tool | Clase | Requeridos | Parámetros funcionales opcionales | Intención de escritura |
|---|---|---|---|---|
| `analyze_form_layout` | read | — | `sourcePath`, `path`, `alignmentThresholdTwips`, `sectionBounds`, `controlSection` | — |
| `analyze_form_ui` | read | — | `sourcePath`, `path` | — |
| `apply_form_design_plan` | write | `sourcePath`, `plan` | `path` | apply (default: plan) |
| `copy_form_ui_pattern` | read | `behaviorMap`, `referencePattern` | — | — |
| `diff_form_preview` | read | — | `beforePath`, `before`, `afterPath`, `after`, `beforeName`, `beforeForm`, `afterName`, `afterForm`, `output`, `viewportScale`, `ascii`, `epsilon` | — |
| `form_add_control` | write | `sourcePath`, `controlName`, `controlType` | `path`, `type`, `targetSectionName`, `properties` | apply (default: plan) |
| `form_align_controls` | write | `sourcePath`, `controlNames`, `edge` | `path` | apply (default: plan) |
| `form_delete_control` | write | `sourcePath`, `controlName` | `path` | apply (default: plan) |
| `form_distribute_controls` | write | `sourcePath`, `controlNames`, `axis` | `path`, `spacing` | apply (default: plan) |
| `form_duplicate_control` | write | `sourcePath`, `sourceControlName`, `newName` | `path`, `targetSectionName`, `overrides` | apply (default: plan) |
| `form_get_geometry` | read | `controlName` | `sourcePath`, `path`, `formName`, `name` | — |
| `form_list_controls` | read | — | `sourcePath`, `path`, `formName`, `name`, `section`, `limit` | — |
| `form_move_control` | write | `sourcePath`, `controlName` | `path`, `left`, `top` | apply (default: plan) |
| `form_rename_control` | write | `sourcePath`, `controlName`, `newName` | `path` | apply (default: plan) |
| `form_set_properties` | write | `sourcePath`, `controlName`, `properties` | `path` | apply (default: plan) |
| `form_set_property` | write | `sourcePath`, `controlName` | `path`, `property`, `propertyName`, `value`, `commitScope` | apply (default: plan) |
| `generate_form_design_plan` | read | `behaviorMap`, `plan` | — | — |
| `map_form_behavior` | read | — | `sourcePath`, `path`, `codegraphEvidence`, `autoFetchCodeGraph` | — |
| `render_form_preview` | read | — | `sourcePath`, `path`, `output`, `viewportScale` | — |
| `verify_form_bindings` | read | — | `sourcePath`, `path`, `schema`, `formName`, `name` | — |
| `verify_form_ui` | read | `sourceContract`, `appliedContract` | — | — |

## Lectura DB/esquema

| Tool | Clase | Requeridos | Parámetros funcionales opcionales | Intención de escritura |
|---|---|---|---|---|
| `compare_backends` | read | — | `comparePath` | — |
| `count_rows` | read | — | `databasePath`, `sourcePath`, `target`, `tableName`, `table`, `sql`, `query` | — |
| `distinct_values` | read | — | `databasePath`, `sourcePath`, `target`, `tableName`, `table`, `columnName`, `column`, `sql`, `query` | — |
| `generate_erd` | write | — | `erdPath` | apply (default: noop) |
| `get_relationships` | read | — | `databasePath`, `sourcePath`, `target` | — |
| `get_schema` | read | — | `databasePath`, `sourcePath`, `target`, `tableName`, `table` | — |
| `list_access_files` | read | — | `rootPath`, `directory` | — |
| `list_linked_tables` | read | — | `target` | — |
| `list_tables` | read | — | `databasePath`, `sourcePath`, `target` | — |
| `query_sql` | read | `sql` | `databasePath`, `sourcePath`, `target`, `query` | — |

## Escritura DB

| Tool | Clase | Requeridos | Parámetros funcionales opcionales | Intención de escritura |
|---|---|---|---|---|
| `compact_repair` | write | — | `databasePath`, `sourcePath`, `target`, `backupFirst` | apply (default: plan) |
| `create_table` | write | — | `databasePath`, `sourcePath`, `tableName`, `table`, `definition`, `fields` | apply (default: plan) |
| `drop_table` | write | — | `databasePath`, `sourcePath`, `tableName`, `table` | apply (default: plan) |
| `exec_sql` | write | — | `databasePath`, `sourcePath`, `sql`, `query`, `allowTables`, `allowTable`, `denyTables`, `denyTable` | apply (default: plan) |
| `query_execute` | write | `sql`, `mode` | `databasePath`, `sourcePath`, `allowTables`, `denyTables` | apply (default: plan) |
| `run_script` | write | — | `databasePath`, `sourcePath`, `scriptPath`, `path`, `allowTables`, `allowTable`, `denyTables`, `denyTable` | apply (default: plan) |
| `seed_fixture` | write | — | `databasePath`, `sourcePath`, `tableName`, `table`, `rows`, `allowTables`, `allowTable`, `denyTables`, `denyTable` | apply (default: plan) |
| `teardown_fixture` | write | — | `databasePath`, `sourcePath`, `tableName`, `table`, `allowTables`, `allowTable`, `denyTables`, `denyTable` | apply (default: plan) |

## Backends/enlaces

| Tool | Clase | Requeridos | Parámetros funcionales opcionales | Intención de escritura |
|---|---|---|---|---|
| `link_tables` | write | — | `target`, `mode`, `tableNames` | apply (default: plan) |
| `list_links` | read | — | `target` | — |
| `localize_backend_links` | write | — | `target` | apply (default: plan) |
| `relink_directory` | write | — | `rootPath`, `backup`, `recursive`, `maps`, `denyPrefixes`, `strictLocal`, `removeUnresolved`, `passwordEnv`, `backendPassword`, `password` | apply (default: plan) |
| `relink_tables` | write | — | `target` | apply (default: plan) |
| `unlink_table` | write | — | `target`, `tableName`, `table` | apply (default: plan) |

## Queries guardadas

| Tool | Clase | Requeridos | Parámetros funcionales opcionales | Intención de escritura |
|---|---|---|---|---|
| `export_queries` | read | — | `target`, `exportPath`, `path` | — |
| `import_queries` | write | — | `target`, `importPath`, `queryDefinitions`, `queries` | apply (default: plan) |

