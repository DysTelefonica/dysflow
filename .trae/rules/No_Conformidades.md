# No Conformidades — Reglas de Proyecto

## Contexto
No Conformidades es una aplicación VBA/Access para gestión de no conformidades
en entorno Telefónica. El código generado siempre es para **copiar manualmente
al editor VBA** y probar allí.

## Estado del proyecto
Proyecto en fase inicial. Aún no hay PRDs ni Specs creadas.
El primer paso antes de cualquier desarrollo es generar el Discovery Map
y los PRDs de los módulos principales.

## Arquitectura Objetivo
- **Patrón:** MVVM estricto (Formulario → ViewModel → Servicio → Repositorio)
- **Persistencia:** Transacciones DAO explícitas (`Workspace.BeginTrans / CommitTrans`)
- **Cambios de estado:** SOLO mediante Servicio de Workflow — nunca SQL directo

## Memoria Persistente (Engram)
Antes de cualquier tarea, ejecutar `mem_search` para recuperar contexto previo.
Al cerrar sesión, ejecutar `mem_session_summary` para guardar lo trabajado.
Las decisiones arquitectónicas importantes se guardan con `mem_save`.

## Workflow SDD
- Sin PRD aprobado no se genera ninguna Spec.
- Sin Spec aprobada no se genera ningún código.
- Specs numeradas desde `Spec-001`.
- Deuda técnica detectada → registrar en `DEUDA_TECNICA.md`, no interrumpir la tarea.
- Gaps detectados durante implementación → registrar en sección 6 de la Spec activa, no crear Spec nueva.
- Al cerrar sesión o recibir `VALIDADO EN ACCESS` → activar skill `diario-sesion`.

## Referencias Obligatorias
Antes de implementar, consultar (cuando existan):
- `docs/PRD/` — para reglas de negocio y contratos de interfaz
- `ERD/Estructura_Datos.md` — para cualquier modificación de esquema de datos
- `DISCOVERY_MAP.md` — para dependencias entre formularios

## Casos Especiales
- **Hotfixes urgentes:** Documentar inline con `' HOTFIX-YYYYMMDD: descripción`
- **Refactors menores:** No requieren Spec si no alteran contratos de interfaz
- **Doble edición:** Si se toca un `.cls` de formulario, tocar también su `.form.txt`
- **Informe UI:** Si se toca `.form.txt`, generar informe detallado de cambios en controles