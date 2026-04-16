# PLAN-002: Mejora de Rendimiento con ViewModel y Caché (RFC-001)

**Estado:** En revisión
**Fecha inicio:** 2026-03-14
**Rama Git:** `plan-002-cache-viewmodel-rfc001`
**Specs del plan:** 16 specs (Spec-001 a Spec-010 + Spec-007b a Spec-007g)
**RFC relacionada:** RFC-001

> **STOP 1:** Este Plan NO ha sido aprobado aún. No implementar código hasta recibir aprobación de este Plan.

---

## Objetivo

Mejorar el rendimiento de los formularios de gestión y edición de No Conformidades de Proyecto mediante:
1. Implementación de ViewModels aplanados para eliminar consultas N+1
2. Sistema de caché con invalidación transaccional post-commit para mantener coherencia
3. Reducción de tiempos de carga en FormNCProyectoGestion (listado/filtrados)
4. Cacheo de TODOS los datos de las 6 pestañas del formulario de detalle
5. Coherencia en cascada AR → AC → NC

**Cambios de esquema aprobados:**
- Añadir campo `DatosDocumentos` (Memo) a `TbCacheNCProyecto` para cachear `TbAnexos`
- Crear tabla `TbCacheListadoNC` para caché de listados
- Invalidación transaccional post-commit (NO TTL)
- Refresco manual mediante botones "Actualizar"

---

## Tareas del Plan

### T-01: Crear NCProyectoListItemVM.cls ✅ COMPLETADA
- **Spec:** Spec-001
- **Criterio:** ViewModel compila, propiedades de solo lectura para campos de listado
- **Validación:** 2026-03-16 - ✅ VALIDADA EN ACCESS

### T-02: Crear NCProyectoDetailVM.cls ✅ COMPLETADA
- **Spec:** Spec-002
- **Criterio:** ViewModel compila, propiedades para las 6 pestañas
- **Validación:** 2026-03-16 - ✅ VALIDADA EN ACCESS

### T-03: Extender CacheNCProyecto para listados (CAMPOS APLANADOS + SQL) ✅ COMPLETADA
- **Spec:** Spec-003
- **Enfoque:** Caché con **campos aplanados** por registro, filtrado mediante **consultas SQL directas**
- **Validación:** 2026-03-16 - ✅ VALIDADA EN ACCESS

### T-04: GetNCsFiltradosVM en constructor ✅ COMPLETADA
- **Spec:** Spec-004
- **Criterio:** Constructor.GetNCsFiltradosVM devuelve Colección de ListItemVM
- **Validación:** 2026-03-16 - ✅ VALIDADA EN ACCESS

### T-05: FormNCProyectoGestion usa VM + botón actualizar (FILTRADO SQL) ✅ COMPLETADA
- **Spec:** Spec-005
- **Enfoque:** Filtrado mediante **SQL sobre caché**, botón "Actualizar" borra y rebuild completo
- **Criterio:**
  - Listado usa SQL sobre TbCacheListadoNC
  - btnActualizarListado: DELETE + rebuild completo
- **Validación:** 2026-03-16 - ✅ VALIDADO EN ACCESS

### T-06: GetNCProyectoVM en constructor
- **Spec:** Spec-006
- **Criterio:** Constructor.GetNCProyectoVM devuelve DetailVM con todas las entidades

### T-07: FormNCProyecto contenedor usa VM + botón actualizar
- **Spec:** Spec-007 a Spec-007g
- **Criterio:** Contenedor usa ViewModel, btnActualizarDetalle regenera caché

### T-08: Invalidación transaccional en NCProyectoOperaciones
- **Spec:** Spec-008
- **Criterio:** Invalidación post-commit con coherencia AR → AC → NC
- **Transaccionalidad:** La operación de guardar NC y actualizar ambas tablas de caché debe ser atómica

### T-09: Precalentado manual de caché completo
- **Spec:** Spec-009
- **Criterio:** Comando manual ejecutable desde Ventana Inmediato

### T-10: Kill-switch operativo de caché
- **Spec:** Spec-010
- **Criterio:**
  - Con flag OFF la app funciona completa sin caché (ruta directa a BD)
  - Con flag ON vuelve a usar caché normalmente
  - Cambio de estado no requiere despliegue (Ventana Inmediato)

---

## Dependencias entre Tareas

```
T-01 (ListItemVM) ─┐
                   ├─> T-04 (GetNCsFiltradosVM) ─> T-05 (FormGestion VM)
T-02 (DetailVM) ──┤
                   │
                   ├─> T-06 (GetNCProyectoVM) ─> T-07 (FormProyecto VM)
                   │                                    │
                   │         T-07b..T-07g <─────────────┘
                   │
                   └─> T-03 (Cache listados) ─┬─> T-05
                                              └─> T-08 (Invalidación)

T-03, T-05, T-07g ──────────────────────────> T-08 (Invalidación)

T-03, T-06, T-08 ────────────────────────> T-09 (Precalentado)

T-03, T-06, T-08 ────────────────────────> T-10 (Kill-switch)
```

---

## Criterios de Aceptación del Plan

### Criterio de Aceptación Global (ATOMICIDAD)
> **CRÍTICO:** Este criterio prevalece sobre cualquier otro criterio funcional.

- [ ] **No se confirma ningún CRUD si falla la operación mínima de caché.**
- [ ] Tabla `TbCacheListadoNC` existe con campos esperados
- [ ] Campo `DatosDocumentos` existe en `TbCacheNCProyecto`
- [ ] FormNCProyectoGestion abre en <3s (P95)
- [ ] Aplicar filtros en FormNCProyectoGestion toma <1s (P95)
- [ ] FormNCProyecto abre en <2s (P95)
- [ ] Caché se invalida correctamente tras guardar NC
- [ ] Test de regresión: funcionalidad idéntica a versión anterior

---

## Norma OBLIGATORIA: Tratamiento de Errores

> **CRÍTICO:** Esta norma es de cumplimiento obligatorio para TODO el código VBA nuevo de este plan.

### Patrón de Errores (PRD-006)
Todo código VBA de las specs T-01 a T-10 debe seguir exactamente el patrón documentado en:
- `docs/PRD/PRD-006_Tratamiento_Errores.md`
- `docs/lecciones-aprendidas/LECCIONES_VBA.md`

### Reglas para Functions
1. Toda Function debe tener `Optional ByRef p_Error As String` como **último** parámetro
2. La función retorna Boolean (True = éxito, False = error)
3. Al inicio: `p_Error = ""`
4. Si hay error: `p_Error = "descripción del error"`
5. Quien llama debe verificar: `retorno = Funcion(...)` Y `p_Error = ""`
6. Si `p_Error <> ""` → propagar con `Err.Raise 1000`

### Reglas para Subs (Form_Load, eventos)
1. Usar `On Error GoTo errores` al inicio
2. En bloque de errores:
   - `DoCmd.Hourglass False`
   - Si `Err.Number <> 1000`: msgbox vbCritical + `CorreoAlAdministrador`
   - Si `Err.Number = 1000`: msgbox vbExclamation (sin email)