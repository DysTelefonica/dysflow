# Spec-001: ViewModel Listado (NCProyectoListItemVM)

**Estado:** ✅ CERRADA
**Prioridad:** Alta
**Tipo:** Nueva Funcionalidad
**Módulos PRD afectados:** PRD-01_NC_Proyectos
**Spec padre:** —
**Specs relacionadas:** Spec-004, Spec-005
**RFC origen:** RFC-001
**Plan origen:** PLAN-002 (T-01)
**Fecha de creación:** 2026-03-14
**Fecha de cierre:** 2026-03-16
**Validación:** ✅ VALIDADA EN ACCESS por usuario

---

## 1. Resumen Técnico

- **Problema / Necesidad:** FormNCProyectoGestion tarda >3s en abrir con ~5000 NCs porque carga entidades completas con hijos lazy-load.
- **Causa raíz:** NCProyecto.cls carga propiedades relacionadas (Riesgos, ARs, ACs, Documentos) en cada instancia, generando N+1 queries.
- **Solución propuesta:** Crear clase NCProyectoListItemVM con propiedades aplanadas de solo lectura, sin carga de hijos.
- **Restricciones:** Sin TTL, refresco manual mediante botón. No modificar NCProyecto.cls existente.

---

## 2. Historia de Usuario

> Como usuario de FormNCProyectoGestion, quiero que el listado de NCs cargue en <3s para poder filtrar y buscar sin esperar.

**Contexto:**
- Dataset actual: ~5000 NCs
- Objetivo P95: <3s apertura, <1s aplicación de filtros

---

## 3. Análisis de Impacto

### 3.1 Módulos afectados

| PRD | Módulo / Clase | Tipo de impacto | Notas |
| :--- | :--- | :--- | :--- |
| PRD-01_NC_Proyectos | NCProyectoListItemVM.cls | Nueva func. | ViewModel aplanado sin hijos |

### 3.2 Archivos a modificar

| Archivo | Tipo de cambio | Descripción del cambio |
| :--- | :--- | :--- |
| `src/classes/NCProyectoListItemVM.cls` | Nuevo | Clase con propiedades aplanadas |

### 3.3 Tablas / Entidades de datos afectadas

| Tabla | Cambio | Detalle |
| :--- | :--- | :--- |
| TbNoConformidades | Solo lectura | Consulta aplanada sin joins a hijos |

### 3.4 Formularios / UI afectados

Ninguno.

### 3.5 Deuda técnica relacionada

| ID | Descripción | Relación |
| :--- | :--- | :--- |
| DT-001 | ViewModels para optimización rendimiento | Genera |

### 3.6 Riesgos

| Riesgo | Probabilidad | Impacto | Mitigación |
| :--- | :--- | :--- | :--- |
| R-1: VM no cubre todos los campos del listado | Baja | Alto | Mapear todos los campos visibles en FormNCProyectoGestion |

---

## 4. Plan de Intervención

### Intervención 1: Crear NCProyectoListItemVM.cls

**Archivo:** `src/classes/NCProyectoListItemVM.cls`
**Tipo:** Nuevo módulo
**Precondición:** —

**Descripción:**
Crear clase con propiedades aplanadas de solo lectura. Constructor acepta IDNoConformidad y carga datos desde Recordset directo.

```vba
' Propiedades de solo lectura (sin carga de hijos):
' - IDNoConformidad, CodigoNoConformidad, Estado, PROYECTO
' - VEHICULO, Descripcion, FechaApertura, FECHACIERRE
' - ResponsableTelefonica, RESPONSABLECALIDAD, Cerrada
' - RequiereACR, ACR, RequiereControlEficacia
```

**Postcondición:** Clase compila y tiene propiedades accesibles.

---

## 5. Criterios de Verificación

### 5.1 Auto-verificación

- [ ] Archivo `NCProyectoListItemVM.cls` existe en `src/classes/`
- [ ] Clase tiene constructor que acepta IDNoConformidad
- [ ] Propiedades son de solo lectura (Property Get, sin Let)
- [ ] No se instancian objetos hijos (Riesgos, ARs, ACs, Documentos)

### 5.2 Validación en Access

- [ ] Crear instancia con ID de NC existente → devuelve datos correctos
- [ ] Acceder a todas las propiedades → no genera errores

### 5.3 Criterios de aceptación

- [ ] Clase compila sin errores en VBA Editor
- [ ] Propiedades devuelven valores coherentes con NCProyecto original

---

## 6. Informe de Cambios UI

Sin cambios de UI.

---

## 7. Gaps y Decisiones

Ninguno identificado.

---

## 8. Notas de Implementación

Clase liviana enfocada en rendimiento. No incluye lógica de negocio, solo datos aplanados.