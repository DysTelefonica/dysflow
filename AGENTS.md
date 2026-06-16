# No Conformidades ÔÇö Reglas locales del proyecto

## Identidad
Proyecto Microsoft Access/VBA para la gesti├│n de no conformidades en Telef├│nica.
El c├│digo generado se trabaja mediante exportaci├│n a `src/` y validaci├│n posterior en Access.

---

## dysflow MCP ÔÇö Este proyecto

- `projectId`: `00-no-conformidades-staging-clean`
- `accessPath`: `NoConformidades.accdb` (relativo al repo)
- `backendPath`: `NoConformidades_Datos.accdb` (relativo al repo)
- `destinationRoot`: `src`
- `projectRoot`: `.`
- `allowWrites`: `true`
- `timeoutMs`: `300000`
- La contrase├▒a se resuelve con `ACCESS_VBA_PASSWORD`; no pasar ni documentar passwords inline.

**No usar** `projectId: "no_conformidades"` ÔÇö puede resolver a otro entorno. El identificador seguro es `00-no-conformidades-staging-clean`.

---

## Regla de compilaci├│n ÔÇö SIEMPRE el usuario compila

> **El usuario es el ├║nico que compila. Yo nunca compilo.**

Despu├®s de cualquier `import_modules` o `import_all`:
1. **NOTIFICAR**: "M├│dulo(s) importado(s). Compil├í vos manualmente en Access VBE ÔåÆ Debug ÔåÆ Compile."
2. **ESPERAR** confirmaci├│n del usuario antes de ejecutar tests o procedimientos.
3. **NUNCA** usar `compile_vba` para compilar autom├íticamente.

---

## Reglas t├®cnicas del proyecto

1. **Zero regresiones:** lo que funciona, debe seguir funcionando.
2. **Transaccionalidad estricta:** no modificar datos cr├¡ticos sin control transaccional.
3. **Workflow inmutable:** los cambios de estado deben respetar la l├│gica de negocio existente.
4. **Doble edici├│n en formularios:** si se modifica un `.cls` de formulario, revisar tambi├®n su `.form.txt`.
5. **UI documentada:** si se toca `.form.txt`, detallar los cambios de controles.
6. **Documentaci├│n fuera del repo main**: `C:\00repos\documentacion\OPENSPEC\00_No_Conformidades`

---

## Tests Access/VBA ÔÇö Fixture expl├¡cita obligatoria

Regla dura para cualquier test que toque datos, tablas, configuraci├│n, cach├® persistente/local o backend:

1. **ERD/schema primero:** antes de escribir o aceptar un seed, inspeccionar el schema real de cada tabla tocada: PK, FKs, campos `Required`/`NOT NULL`, tipos y valores v├ílidos. Si falta ese conocimiento, parar e inspeccionar; no adivinar.
2. **Poblar no es verificar:** el test debe insertar/controlar exactamente las filas que necesita antes del Act. No vale `SELECT TOP 1`, no vale ÔÇ£si existe una filaÔÇØ, no vale depender de datos de usuario.
3. **Sandbox/local obligatorio:** toda escritura de test debe ir contra backend local/sandbox mediante el patr├│n `ForceLocalBackend` / `m_TestingMode` cuando aplique.
4. **Orden FK:** crear padres antes que hijos; borrar en orden inverso. Los teardowns solo pueden borrar IDs/marcadores determin├¡sticos de test.
5. **Asserts fuertes:** adem├ís de que no explote, verificar valores concretos, cardinalidad esperada y efectos secundarios.
6. **Test inv├ílido:** si pasa porque el dato ÔÇ£justo estabaÔÇØ, el test est├í mal aunque est├® verde. Reescribir antes de confiar en la implementaci├│n.

---

## Skills

- `jira-confluence-sdd`, `access-vba-tdd`
- Los skills se resuelven desde las instalaciones globales/locales del entorno; no mantener copias vendorizadas en `.agents/skills/` dentro del repo salvo decisi├│n expl├¡cita.

## Dysflow

This project is a dysflow consumer. **All Access/VBA work goes through dysflow.**

For the full reference (every tool, the sync loop, secret management, safe cleanup), read the opencode global `AGENTS.md` `<!-- gentle-ai:dysflow-reference -->` block.

