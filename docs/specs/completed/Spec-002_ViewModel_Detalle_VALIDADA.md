# Spec-002: ViewModel Detalle (NCProyectoDetailVM)

**Estado:** ✅ CERRADA
**Prioridad:** Alta
**Tipo:** Nueva Funcionalidad
**Módulos PRD afectados:** PRD-01_NC_Proyectos
**Spec padre:** —
**Specs relacionadas:** Spec-006, Spec-007
**RFC origen:** RFC-001
**Plan origen:** PLAN-002 (T-02)
**Fecha de creación:** 2026-03-14
**Fecha de cierre:** 2026-03-16
**Validación:** ✅ VALIDADA EN ACCESS por usuario

---

## 1. Resumen Técnico

- **Problema / Necesidad:** FormNCProyecto (detalle multi-pestaña) tarda >2s en abrir porque carga NCProyecto completa con todos los hijos.
- **Causa raíz:** Propiedades como Riesgos, ARs, ACs, Documentos, Replanificaciones se cargan lazily pero se inicializan todas.
- **Solución propuesta:** Crear NCProyectoDetailVM con datos aplanados para las 6 pestañas (General, Acciones, ControlEficacia, Nota, Documentos, Replanificaciones). Sin TTL, refresco manual.
- **Restricciones:** No modificar NCProyecto.cls. Refresco mediante botón "Actualizar" manual.

---

## 2. Historia de Usuario

> Como usuario de FormNCProyecto, quiero que el detalleabra en <2s para editar sin esperar, con opción de refrescar manualmente.

**Contexto:**
- 6 pestañas: General, Acciones, ControlEficacia, Nota, Documentos, Replanificaciones
- Objetivo P95: <2s apertura (desde caché, sin TTL)

---

## 3. Análisis de Impacto

### 3.1 Módulos afectados

| PRD | Módulo / Clase | Tipo de impacto | Notas |
| :--- | :--- | :--- | :--- |
| PRD-01_NC_Proyectos | NCProyectoDetailVM.cls | Nueva func. | ViewModel aplanado para detalle |

### 3.2 Archivos a modificar

| Archivo | Tipo de cambio | Descripción del cambio |
| :--- | :--- | :--- |
| `src/classes/NCProyectoDetailVM.cls` | Nuevo | Clase con propiedades aplanadas para 6 pestañas |

### 3.3 Tablas / Entidades de datos afectadas

| Tabla | Cambio | Detalle |
| :--- | :--- | :--- |
| TbNoConformidades | Solo lectura | Datos principales |
| TbNCAccionCorrectivas | Solo lectura | ARs y ACs |
| TbAnexos | Solo lectura | Documentos |
| TbReplanificacionesProyecto | Solo lectura | Replanificaciones |

### 3.4 Formularios / UI afectados

Ninguno.

### 3.5 Deuda técnica relacionada

| ID | Descripción | Relación |
| :--- | :--- | :--- |
| DT-001 | ViewModels para optimización rendimiento | Genera |

### 3.6 Riesgos

| Riesgo | Probabilidad | Impacto | Mitigación |
| :--- | :--- | :--- | :--- |
| R-1: VM no cubre campos de alguna pestaña | Baja | Alto | Mapear todos los campos de las 6 pestañas |

---

## 4. Plan de Intervención

### Intervención 1: Crear NCProyectoDetailVM.cls

**Archivo:** `src/classes/NCProyectoDetailVM.cls`
**Tipo:** Nuevo módulo
**Precondición:** —

**Descripción:**
Crear clase con propiedades aplanadas para las 6 pestañas. Constructor acepta IDNoConformidad y carga datos desde recordsets directos.

```vba
' Propiedades por pestaña:
' General: IDNoConformidad, Codigo, Estado, Descripcion, Causa, Responsable, etc.
' Acciones: Colección de ARs y ACs (solo datos, sin objetos complejos)
' ControlEficacia: Campos de eficacia
' Nota: Notas relacionadas
' Documentos: Lista de documentos (solo metadatos, sin binarios)
' Replanificaciones: Lista de replanificaciones
```

**Postcondición:** Clase compila con propiedades para las 6 pestañas.

---

## 5. Criterios de Verificación

### 5.1 Auto-verificación

- [ ] Archivo `NCProyectoDetailVM.cls` existe en `src/classes/`
- [ ] Clase tiene constructor que acepta IDNoConformidad
- [ ] Propiedades cubiquen las 6 pestañas
- [ ] No se cargan objetos completos (solo datos aplanados)

### 5.2 Validación en Access

- [ ] Crear instancia con ID de NC existente → devuelve datos de todas las pestañas
- [ ] Acceder a propiedades de cada pestaña → no genera errores

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

Clase liviana sin TTL. Refresco manual mediante botón "Actualizar" en formulario.