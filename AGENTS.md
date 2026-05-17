# No Conformidades — Guía del proyecto

## Identidad
Proyecto Microsoft Access/VBA para la gestión de no conformidades en Telefónica.
El código generado se trabaja mediante exportación a `src/` y validación posterior en Access.

## dysflow MCP — Este proyecto
- `accessPath`: `C:\00repos\codigo\00_NO_CONFORMIDADES_staging\NoConformidades.accdb`
- `backendPath`: `C:\00repos\codigo\00_NO_CONFORMIDADES_staging\NoConformidades_Datos.accdb`
- Contexto registrado: `00-no-conformidades-staging-clean`. En llamadas normales a dysflow usar solo `contextId`/`projectId`; no repetir `accessPath`, `backendPath` ni `destinationRoot` salvo override explícito contra otra base.
- Si `.dysflow/project.json` no existe o el contexto no está registrado, primero hay que provisionar/registrar el proyecto con esos paths y recién después operar contra Access. No usar variables heredadas ni paths implícitos como autorización para abrir bases.

## Alcance del repositorio principal
Este repositorio main debe contener solo lo imprescindible para operar y evolucionar el proyecto:

- frontend y archivos operativos de Access
- configuración necesaria
- código exportado en `src/`

La documentación funcional, técnica y metodológica vive fuera del repo main, en:

`C:\00repos\documentacion\OPENSPEC\00_No_Conformidades`

## Memoria y skills
Las memorias de Engram se exportan y centralizan en:

`C:\00repos\documentacion\.engram`

Los skills usados en este entorno son los **globales**. No deben mantenerse copias locales de skills dentro de este repositorio.

## Reglas técnicas del proyecto
1. **Zero regresiones:** lo que funciona, debe seguir funcionando.
2. **Transaccionalidad estricta:** no modificar datos críticos sin control transaccional.
3. **Workflow inmutable:** los cambios de estado deben respetar la lógica de negocio existente.
4. **Doble edición en formularios:** si se modifica un `.cls` de formulario, revisar también su `.form.txt`.
5. **UI documentada:** si se toca `.form.txt`, detallar los cambios de controles.
6. **Sin ruido metodológico en main:** no añadir aquí specs, PRDs, templates o reglas de proceso.
