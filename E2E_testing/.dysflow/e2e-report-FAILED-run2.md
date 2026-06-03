# Dysflow MCP E2E Report

Project: noconformidades-e2e
Frontend: C:\Proyectos\dysflow\E2E_testing\NoConformidades.accdb
Backend: C:\Proyectos\dysflow\E2E_testing\NoConformidades_Datos.accdb
Tools advertised: 48
Passed: 97
Failed: 7

| Result | Area | Tool | Expected | ms | Summary |
|---|---|---|---|---:|---|
| PASS | protocol | tools/list | success | 329 | {"code":0,"signal":null} |
| PASS | protocol | tools/list:zombie-check | no MSACCESS.EXE | 276 | clean |
| PASS | protocol | advertised-tool-count | 48 tools | 0 | advertised=48 |
| PASS | diagnostics | dysflow_doctor | success | 6259 | {"checks":[{"name":"access-db-path","ok":true,"message":"configured"},{"name":"access-open","ok":true,"message":"opened"}]} |
| PASS | diagnostics | dysflow_doctor:zombie-check | no MSACCESS.EXE | 259 | clean |
| PASS | query | dysflow_query_execute | success | 2083 | {"rows":[{"RowCount":438}]} |
| PASS | query | dysflow_query_execute:zombie-check | no MSACCESS.EXE | 255 | clean |
| PASS | vba | dysflow_vba_execute | error | 5979 | RUNNER_FAILED: PowerShell runner failed with exit code 1: Excepci�n al llamar a "Run" con los argumentos "31": "No Conformidades no encuentra el procedimiento 'DysflowMcpE2EMissingProcedure'." |
| PASS | vba | dysflow_vba_execute:zombie-check | no MSACCESS.EXE | 1120 | clean |
| PASS | operations | dysflow_access_operations_list | success | 384 | [{"operationId":"dysflow-7e9a7a8c-45db-4c53-90a5-4475a73773da","action":"vba","accessPath":"C:\\Proyectos\\dysflow\\E2E_testing\\NoConformidades.accdb","projectRootAbs":"C:\\Proyectos\\dysflow\\E2E_testing","destinationRootAbs":"C:\\Proyectos\\dysflow\\E2E_tes |
| PASS | operations | dysflow_access_operations_list:zombie-check | no MSACCESS.EXE | 250 | clean |
| PASS | operations | dysflow_access_cleanup | error | 338 | CLEANUP_OPERATION_NOT_FOUND: Operation missing-operation was not found. |
| PASS | operations | dysflow_access_cleanup:zombie-check | no MSACCESS.EXE | 241 | clean |
| PASS | query | query_sql | success | 2872 | {"rows":[{"RowCount":438}]} |
| PASS | query | query_sql:zombie-check | no MSACCESS.EXE | 239 | clean |
| PASS | security | query_sql | error | 309 | MCP_INPUT_INVALID: DROP statements are not allowed in read-only queries. Use exec_sql or dysflow_query_execute with mode "write" for write operations. |
| PASS | security | query_sql:zombie-check | no MSACCESS.EXE | 260 | clean |
| PASS | security | dysflow_query_execute | error | 309 | MCP_INPUT_INVALID: DELETE statements are not allowed in read-only queries. Use exec_sql or dysflow_query_execute with mode "write" for write operations. |
| PASS | security | dysflow_query_execute:zombie-check | no MSACCESS.EXE | 278 | clean |
| PASS | query | list_tables | success | 2853 | {"tables":["Copia de TbNCARAvisos","TbAnexos","TbAnexosAuditoria","TbAnexosNCAuditorias","TbAuditoriaLog","TbAuditorias","TbAuxPuntoNorma","TbCacheIndicadoresProyectoDetalle","TbCacheIndicadoresProyectoHeader","TbCacheListadoNC","TbCacheNCProyecto","TbConexion |
| PASS | query | list_tables:zombie-check | no MSACCESS.EXE | 245 | clean |
| PASS | query | get_schema | success | 3028 | {"schema":[{"name":"IDNoConformidad","type":4,"size":4,"required":true,"allowZeroLength":false},{"name":"Juridica","type":10,"size":255,"required":false,"allowZeroLength":true},{"name":"CodigoNoConformidad","type":10,"size":255,"required":true,"allowZeroLength |
| PASS | query | get_schema:zombie-check | no MSACCESS.EXE | 2584 | clean |
| PASS | query | count_rows | success | 3173 | {"rows":[{"RowCount":438}]} |
| PASS | query | count_rows:zombie-check | no MSACCESS.EXE | 278 | clean |
| PASS | query | distinct_values | success | 2868 | {"rows":[{"Value":"ACSSINTAREAS"},{"Value":"BORRADA"},{"Value":"Cerrada"},{"Value":"CERRADAPTECE"},{"Value":"CERRADAPTECECADUCADA"},{"Value":"ENEJECUCION"},{"Value":"ENEJECUCIONFUERADEPLAZO"},{"Value":"PLANIFICADA"},{"Value":"REGISTRADA"}]} |
| PASS | query | distinct_values:zombie-check | no MSACCESS.EXE | 270 | clean |
| PASS | query | list_linked_tables | success | 2892 | {"tables":["Copia de TbNCARAvisos","TbAnexos","TbAnexosAuditoria","TbAnexosNCAuditorias","TbAuditoriaLog","TbAuditorias","TbAuxPuntoNorma","TbCacheIndicadoresProyectoDetalle","TbCacheIndicadoresProyectoHeader","TbCacheListadoNC","TbCacheNCProyecto","TbConexion |
| PASS | query | list_linked_tables:zombie-check | no MSACCESS.EXE | 2997 | clean |
| PASS | query | list_links | success | 6583 | {"links":[{"name":"Copia de TbNCARAvisos","sourceTableName":"Copia de TbNCARAvisos","connect":"MS Access;DATABASE=C:\\Proyectos\\dysflow\\E2E_testing\\NoConformidades_Datos.accdb","backendPath":"C:\\Proyectos\\dysflow\\E2E_testing\\NoConformidades_Datos.accdb" |
| PASS | query | list_links:zombie-check | no MSACCESS.EXE | 244 | clean |
| PASS | query | get_relationships | success | 1945 | {"relationships":[{"name":"MSysNavPaneGroupCategoriesMSysNavPaneGroups","table":"MSysNavPaneGroupCategories","foreignTable":"MSysNavPaneGroups","fields":[{"name":"Id","foreignName":"GroupCategoryID"}]},{"name":"TbAuditoriasTbDocumentosAuditorias","table":"TbAu |
| PASS | query | get_relationships:zombie-check | no MSACCESS.EXE | 279 | clean |
| PASS | query | compare_backends | success | 2948 | {"comparison":{"backendPath":"C:\\Proyectos\\dysflow\\E2E_testing\\NoConformidades_Datos.accdb","currentTables":["TbConfiguracionBackends","TbTipologiaAux"],"backendTables":["Copia de TbNCARAvisos","TbAnexos","TbAnexosAuditoria","TbAnexosNCAuditorias","TbAudit |
| PASS | query | compare_backends:zombie-check | no MSACCESS.EXE | 250 | clean |
| PASS | query | list_access_files | success | 2294 | {"files":["C:\\Proyectos\\dysflow\\E2E_testing\\.mcp.json","C:\\Proyectos\\dysflow\\E2E_testing\\integration-run.log","C:\\Proyectos\\dysflow\\E2E_testing\\mcp-e2e.mjs","C:\\Proyectos\\dysflow\\E2E_testing\\NoConformidades.accdb","C:\\Proyectos\\dysflow\\E2E_t |
| PASS | query | list_access_files:zombie-check | no MSACCESS.EXE | 234 | clean |
| PASS | query | export_queries | success | 6127 | {"exportPath":"C:\\Proyectos\\dysflow\\E2E_testing\\.dysflow\\mcp-e2e-temp\\exports\\queries.json","queries":[{"name":"Consulta1","sql":"SELECT TbNCDocumentosAux AS Expr1\r\nFROM TbNCDocumentosAux;\r\n","returnsRecords":true},{"name":"Consulta2","sql":"SELECT  |
| PASS | query | export_queries:zombie-check | no MSACCESS.EXE | 285 | clean |
| PASS | query | import_queries | success | 5416 | {"imported":1,"queries":[{"name":"Q_DysflowMcpE2E","sql":"SELECT 1 AS One"}]} |
| PASS | query | import_queries:zombie-check | no MSACCESS.EXE | 274 | clean |
| PASS | maintenance | compact_repair | success | 1793 | {"dryRun":true,"sourcePath":"C:\\Proyectos\\dysflow\\E2E_testing\\NoConformidades_Datos.accdb","targetPath":"C:\\Proyectos\\dysflow\\E2E_testing\\NoConformidades_Datos.compacted.accdb","wouldReplaceSource":true} |
| PASS | maintenance | compact_repair:zombie-check | no MSACCESS.EXE | 260 | clean |
| PASS | links | link_tables | success | 12231 | {"backendPath":"C:\\Proyectos\\dysflow\\E2E_testing\\NoConformidades_Datos.accdb","linkedTables":[{"name":"Copia de TbNCARAvisos","backendPath":"C:\\Proyectos\\dysflow\\E2E_testing\\NoConformidades_Datos.accdb"},{"name":"TbAnexos","backendPath":"C:\\Proyectos\ |
| PASS | links | link_tables:zombie-check | no MSACCESS.EXE | 250 | clean |
| PASS | links | relink_tables | success | 11622 | {"backendPath":"C:\\Proyectos\\dysflow\\E2E_testing\\NoConformidades_Datos.accdb","linkedTables":[{"name":"Copia de TbNCARAvisos","backendPath":"C:\\Proyectos\\dysflow\\E2E_testing\\NoConformidades_Datos.accdb"},{"name":"TbAnexos","backendPath":"C:\\Proyectos\ |
| PASS | links | relink_tables:zombie-check | no MSACCESS.EXE | 247 | clean |
| PASS | links | localize_backend_links | success | 11845 | {"backendPath":"C:\\Proyectos\\dysflow\\E2E_testing\\NoConformidades_Datos.accdb","linkedTables":[{"name":"Copia de TbNCARAvisos","backendPath":"C:\\Proyectos\\dysflow\\E2E_testing\\NoConformidades_Datos.accdb"},{"name":"TbAnexos","backendPath":"C:\\Proyectos\ |
| PASS | links | localize_backend_links:zombie-check | no MSACCESS.EXE | 237 | clean |
| PASS | links | unlink_table | success | 5150 | {"unlinkedTables":[]} |
| PASS | links | unlink_table:zombie-check | no MSACCESS.EXE | 4290 | clean |
| PASS | links | relink_directory | success | 2350 | {"relinkDirectory":{"mode":"apply","root":"C:\\Proyectos\\dysflow\\E2E_testing","filesScanned":2,"linkedTablesFound":47,"alreadyLocal":40,"plannedRelinks":0,"appliedRelinks":0,"unresolved":[{"database":"C:\\Proyectos\\dysflow\\E2E_testing\\NoConformidades_Dato |
| PASS | links | relink_directory:zombie-check | no MSACCESS.EXE | 257 | clean |
| PASS | write | create_table | success | 5242 | {"dryRun":false,"sql":"CREATE TABLE [ZZZ_DysflowMcpE2E_1780338078322] (ID INTEGER, Name TEXT(50))","affectedRows":0} |
| PASS | write | create_table:zombie-check | no MSACCESS.EXE | 249 | clean |
| PASS | write | exec_sql | success | 4544 | {"dryRun":false,"affectedRows":1,"sql":"INSERT INTO [ZZZ_DysflowMcpE2E_1780338078322] ([ID], [Name]) VALUES (1, 'exec')"} |
| PASS | write | exec_sql:zombie-check | no MSACCESS.EXE | 220 | clean |
| PASS | write | run_script | success | 4419 | {"dryRun":false,"statements":["INSERT INTO [ZZZ_DysflowMcpE2E_1780338078322] ([ID], [Name]) VALUES (2, 'script')"]} |
| FAIL | write | run_script:zombie-check | no MSACCESS.EXE | 5141 | Zombie MSACCESS.EXE lingered after run_script |
| PASS | write | seed_fixture | success | 4390 | {"dryRun":false,"affectedRows":1,"tableName":"ZZZ_DysflowMcpE2E_1780338078322"} |
| PASS | write | seed_fixture:zombie-check | no MSACCESS.EXE | 2379 | clean |
| PASS | write | teardown_fixture | success | 4467 | {"dryRun":false,"sql":"DELETE FROM [ZZZ_DysflowMcpE2E_1780338078322]","affectedRows":3} |
| PASS | write | teardown_fixture:zombie-check | no MSACCESS.EXE | 233 | clean |
| PASS | write | drop_table | success | 4148 | {"dryRun":false,"sql":"DROP TABLE [ZZZ_DysflowMcpE2E_1780338078322]","affectedRows":0} |
| PASS | write | drop_table:zombie-check | no MSACCESS.EXE | 248 | clean |
| PASS | vba-sync | list_objects | success | 12779 | {"forms":["Form0BDOpciones","Form0BDOpcionesAuditorias","Form0BDOpcionesParteProyectos","Form0BDTecnicos","FormARAuditoriaDocumentos","FormARProyectoDocumentos","FormAuditoria","FormAuditoriaDocumentos","FormAuditoriaSeleccion","FormAuditoriasGestion","FormCor |
| FAIL | vba-sync | list_objects:zombie-check | no MSACCESS.EXE | 5049 | Zombie MSACCESS.EXE lingered after list_objects |
| PASS | vba-sync | exists | success | 11928 | {"moduleName":"DysflowMcpE2EMissing","accessObjectExists":false,"accessObjectKind":null,"accessObjectName":null,"accessObjectCandidates":["DysflowMcpE2EMissing","Form_DysflowMcpE2EMissing","Report_DysflowMcpE2EMissing"],"vbComponentExists":false,"vbComponentNa |
| FAIL | vba-sync | exists:zombie-check | no MSACCESS.EXE | 5139 | Zombie MSACCESS.EXE lingered after exists |
| PASS | vba-sync | export_modules | success | 10822 | {"ok":true,"stdout":"Accion: Export\nBase de datos: C:\\Proyectos\\dysflow\\E2E_testing\\NoConformidades.accdb\nCarpeta: C:\\Proyectos\\dysflow\\E2E_testing\\src\n[1/1] Exportando: Funciones Generales\nOK Export completado (1)"} |
| PASS | vba-sync | export_modules:zombie-check | no MSACCESS.EXE | 245 | clean |
| PASS | vba-sync | export_all | success | 8022 | {"ok":true,"stdout":"Accion: Export\nBase de datos: C:\\Proyectos\\dysflow\\E2E_testing\\NoConformidades.accdb\nCarpeta: C:\\Proyectos\\dysflow\\E2E_testing\\src\n[1/1] Exportando: Funciones Generales\nOK Export completado (1)"} |
| PASS | vba-sync | export_all:zombie-check | no MSACCESS.EXE | 246 | clean |
| PASS | vba-sync | import_modules | success | 323 | {"operation":"import_modules","dryRun":true,"willModifyAccess":false,"requestedProjectId":"noconformidades-e2e","resolvedProjectId":"noconformidades-e2e","configSource":"explicit-overrides","projectRoot":"C:\\Proyectos\\dysflow\\E2E_testing","accessPath":"C:\\ |
| PASS | vba-sync | import_modules:zombie-check | no MSACCESS.EXE | 250 | clean |
| PASS | vba-sync | import_all | success | 331 | {"operation":"import_all","dryRun":true,"willModifyAccess":false,"requestedProjectId":"noconformidades-e2e","resolvedProjectId":"noconformidades-e2e","configSource":"explicit-overrides","projectRoot":"C:\\Proyectos\\dysflow\\E2E_testing","accessPath":"C:\\Proy |
| PASS | vba-sync | import_all:zombie-check | no MSACCESS.EXE | 235 | clean |
| PASS | vba-sync | compile_vba | success | 8106 | {"ok":true,"phase":"compile","error":null,"component":null,"line":null,"column":null,"endLine":null,"endColumn":null,"sourceLine":null} |
| PASS | vba-sync | compile_vba:zombie-check | no MSACCESS.EXE | 241 | clean |
| PASS | vba-sync | test_vba | error | 304 | VBA_NO_TESTS_SELECTED: proceduresJson must contain at least one VBA test procedure. |
| PASS | vba-sync | test_vba:zombie-check | no MSACCESS.EXE | 241 | clean |
| PASS | vba-sync | verify_code | success | 8391 | {"operation":"verify_code","ok":true,"dryRun":true,"willModifyAccess":false,"sourceRoot":"C:\\Proyectos\\dysflow\\E2E_testing\\src","matched":[{"moduleName":"Funciones Generales","fileType":"bas","sourcePath":"modules/Funciones Generales.bas","binaryPath":"mod |
| PASS | vba-sync | verify_code:zombie-check | no MSACCESS.EXE | 247 | clean |
| PASS | vba-sync | delete_module | error | 10679 | VBA_MANAGER_FAILED: delete_module failed with exit code 1: Delete no pudo completar 1/1 objeto(s): DysflowMcpE2EMissing: No existe objeto/componente para eliminar: DysflowMcpE2EMissing En [PATH]: 3111 Car�cter: 13 + throw ("Delete no pudo completar {0}/{1} obj |
| PASS | vba-sync | delete_module:zombie-check | no MSACCESS.EXE | 262 | clean |
| PASS | vba-sync | fix_encoding | success | 1654 | {"ok":true,"stdout":"Accion: Fix-Encoding\nBase de datos: C:\\Proyectos\\dysflow\\E2E_testing\\NoConformidades.accdb\nCarpeta: C:\\Proyectos\\dysflow\\E2E_testing\\src\nFix-Encoding (Src): 0\nOK Fix-Encoding completado"} |
| PASS | vba-sync | fix_encoding:zombie-check | no MSACCESS.EXE | 247 | clean |
| PASS | vba-sync | generate_erd | success | 8439 | {"ok":true,"stdout":"Accion: Generate-ERD\nBackend: C:\\Proyectos\\dysflow\\E2E_testing\\NoConformidades_Datos.accdb\nERD Folder: C:\\Proyectos\\dysflow\\E2E_testing\\.dysflow\\mcp-e2e-temp\\ERD\nOK ERD generado en: C:\\Proyectos\\dysflow\\E2E_testing\\.dysflo |
| PASS | vba-sync | generate_erd:zombie-check | no MSACCESS.EXE | 274 | clean |
| PASS | forms | validate_form_spec | success | 289 | {"valid":true,"name":"Form_DysflowMcpE2E","kind":"Form","controlCount":0,"controls":[],"specPath":"C:\\Proyectos\\dysflow\\E2E_testing\\.dysflow\\mcp-e2e-temp\\form-spec.json"} |
| PASS | forms | validate_form_spec:zombie-check | no MSACCESS.EXE | 238 | clean |
| PASS | forms | generate_form | success | 287 | {"generated":true,"outputPath":"C:\\Proyectos\\dysflow\\E2E_testing\\src\\forms\\Form_DysflowMcpE2E.form.json","name":"Form_DysflowMcpE2E","kind":"Form","controlCount":0} |
| PASS | forms | generate_form:zombie-check | no MSACCESS.EXE | 243 | clean |
| PASS | forms | catalog_add_control | success | 289 | {"catalogPath":"C:\\Proyectos\\dysflow\\E2E_testing\\.dysflow\\mcp-e2e-temp\\catalog.json","formName":"Form_DysflowMcpE2E","controlCount":1} |
| PASS | forms | catalog_add_control:zombie-check | no MSACCESS.EXE | 253 | clean |
| PASS | forms | harvest_form_catalog | success | 290 | {"destinationRoot":"C:\\Proyectos\\dysflow\\E2E_testing\\src","forms":[{"name":"Form_DysflowMcpE2E","kind":"Form","controls":0,"specPath":"C:\\Proyectos\\dysflow\\E2E_testing\\src\\forms\\Form_DysflowMcpE2E.form.json"}],"reports":[],"total":1} |
| PASS | forms | harvest_form_catalog:zombie-check | no MSACCESS.EXE | 197 | clean |
| PASS | legacy | run_vba | error | 5182 | RUNNER_FAILED: PowerShell runner failed with exit code 1: Excepci�n al llamar a "Run" con los argumentos "31": "No Conformidades no encuentra el procedimiento 'DysflowMcpE2EMissingProcedure'." |
| FAIL | legacy | run_vba:zombie-check | no MSACCESS.EXE | 5319 | Zombie MSACCESS.EXE lingered after run_vba |
| PASS | legacy | cleanup_access_operation | error | 313 | CLEANUP_OPERATION_NOT_FOUND: Operation missing-operation was not found. |
| FAIL | legacy | cleanup_access_operation:zombie-check | no MSACCESS.EXE | 5290 | Zombie MSACCESS.EXE lingered after cleanup_access_operation |
| PASS | legacy | list_access_operations | success | 317 | [{"operationId":"dysflow-09f8a359-6235-4506-aa75-a24181947ae3","action":"vba","accessPath":"C:\\Proyectos\\dysflow\\E2E_testing\\NoConformidades.accdb","projectRootAbs":"C:\\Proyectos\\dysflow\\E2E_testing","destinationRootAbs":"C:\\Proyectos\\dysflow\\E2E_tes |
| FAIL | legacy | list_access_operations:zombie-check | no MSACCESS.EXE | 5309 | Zombie MSACCESS.EXE lingered after list_access_operations |
| FAIL | zombies | lingering-access-check | no MSACCESS.EXE processes running | 0 | Lingering MSACCESS.EXE processes detected! |

## Advertised tools
- catalog_add_control
- cleanup_access_operation
- compact_repair
- compare_backends
- compile_vba
- count_rows
- create_table
- delete_module
- distinct_values
- drop_table
- dysflow_access_cleanup
- dysflow_access_operations_list
- dysflow_doctor
- dysflow_query_execute
- dysflow_vba_execute
- exec_sql
- exists
- export_all
- export_modules
- export_queries
- fix_encoding
- generate_erd
- generate_form
- get_relationships
- get_schema
- harvest_form_catalog
- import_all
- import_modules
- import_queries
- link_tables
- list_access_files
- list_access_operations
- list_linked_tables
- list_links
- list_objects
- list_tables
- localize_backend_links
- query_sql
- relink_directory
- relink_tables
- run_script
- run_vba
- seed_fixture
- teardown_fixture
- test_vba
- unlink_table
- validate_form_spec
- verify_code
