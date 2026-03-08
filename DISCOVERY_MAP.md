# DISCOVERY_MAP — No Conformidades

## Resumen Ejecutivo

Proyecto **VBA/Access** para gestión de **No Conformidades** en Telefónica.
- **41 clases** de dominio
- **50+ formularios** (.form.txt + .cls)
- **2 grandes dominios:** NC de Proyectos y NC de Auditorías

---

## 1. Módulos Funcionales

### 1.1 NC Proyectos (Dominio Principal)
**Propósito:** Gestión integral de No Conformidades derivadas de proyectos.

| Formulario | Propósito |
| :--- | :--- |
| FormNCProyectoGestion | Listado y gestión de NC de Proyectos |
| FormNCProyectoGeneral | Datos generales de la NC |
| FormNCProyectoGeneralConVinculoNC | Alta de NC con vínculo a NC asociada |
| FormNCProyectoAcciones | Gestión de Acciones Correctivas |
| FormNCProyectoAC | Auditoría de Cumplimiento (AC) |
| FormNCProyectoAR | Auditoría de Resultados (AR) |
| FormNCProyectoDocumentos | Gestión documental |
| FormNCProyectoSeguimiento | Vista de seguimiento general |
| FormNCProyectoSeguimientoNC | Seguimiento de NC vinculadas |
| FormNCProyectoSeguimientoTareas | Seguimiento de tareas |
| FormNCProyectoReplanificaciones | Reprogramaciones de fechas |
| FormNCProyectoControlEficacia | Control de eficacia |
| FormNCProyectoControlEficaciaAlta | Alta control de eficacia |
| FormNCProyectoTipologiaGestion | Gestión de tipologías |
| FormTipologiaNCProyecto | Catálogo de tipologías |
| FormNCProyectoNota | Notas asociadas |
| FormNCProyectoMotivoEliminado | Motivo de eliminación |

**Clases asociadas:**
- `NCProyecto` + `NCProyectoOperaciones`
- `ACProyecto` + `ACProyectoOperaciones`
- `ARProyecto` + `ARProyectoOperaciones`
- `SegNCProyecto`
- `SegTareasProyecto`
- `ReplanificacionesProyecto` + `ReplanificacionesProyectoOperaciones`
- `TipologiaNCProyectos`
- `DocumentoProyecto` + `DocumentoProyectoOperaciones`

**Tablas principales:**
- `TbNoConformidades` — NC principal de proyectos
- `TbNCAccionCorrectivas` — Acciones correctivas
- `TbNCAccionesRealizadas` — Ejecución de acciones
- `TbNCDocumentos` — Documentos asociados

---

### 1.2 NC Auditorías (Dominio Principal)
**Propósito:** Gestión integral de No Conformidades derivadas de auditorías.

| Formulario | Propósito |
| :--- | :--- |
| FormNCAuditoriaGestion | Listado y gestión de NC de Auditorías |
| FormNCAuditoriaGeneral | Datos generales de la NC |
| FormNCAuditoriaAcciones | Gestión de Acciones Correctivas |
| FormNCAuditoriaAC | Auditoría de Cumplimiento (AC) |
| FormNCAuditoriaAR | Auditoría de Resultados (AR) |
| FormNCAuditoriaDocumentos | Gestión documental |
| FormNCAuditoriaSeguimiento | Vista de seguimiento general |
| FormNCAuditoriaSeguimientoNC | Seguimiento de NC vinculadas |
| FormNCAuditoriaSeguimientoTareas | Seguimiento de tareas |
| FormNCAuditoriaReplanificaciones | Reprogramaciones de fechas |
| FormNCAuditoriaControlEficacia | Control de eficacia |
| FormNCAuditoriaControlEficaciaAlta | Alta control de eficacia |
| FormNCAuditoriaNota | Notas asociadas |
| FormNCAuditoriaMotivoEliminado | Motivo de eliminación |

**Clases asociadas:**
- `NCAuditoria` + `NCaUDITORIAOperaciones`
- `ACAuditoria` + `ACAuditoriaOperaciones`
- `ARAuditoria` + `ARAuditoriaOperaciones`
- `SegNCAuditoria`
- `SegTareasAuditoria`
- `ReplanificacionesAuditoria` + `ReplanificacionesAuditoriaOperaciones`
- `LogNCAuditoria`

**Tablas principales:**
- `TbNoConformidadesAuditoria` — NC principal de auditorías
- `TbNCAuditoriaAccionCorrectivas` — Acciones correctivas
- `TbNCAuditoriaAccionesRealizadas` — Ejecución de acciones

---

### 1.3 Gestión de Auditorías
**Propósito:** Administración del catálogo de auditorías.

| Formulario | Propósito |
| :--- | :--- |
| FormAuditoriasGestion | Listado de auditorías |
| FormAuditoria | Datos de auditoría |
| FormAuditoriaDocumentos | Documentos de auditoría |
| FormAuditoriaSeleccion | Selector de auditorías |

**Clases asociadas:**
- `Auditoria` + `AuditoriaOperaciones`
- `DocumentoAuditoria` + `DocumentoAuditoriaOperaciones`

**Tablas principales:**
- `TbAuditorias` — Catálogo de auditorías

---

### 1.4 Configuración y Utilidades
**Propósito:** Menús de navegación y configuración.

| Formulario | Propósito |
| :--- | :--- |
| Form0BDOpciones | Menú principal de opciones |
| Form0BDOpcionesParteProyectos | Opciones del área de proyectos |
| Form0BDOpcionesAuditorias | Opciones del área de auditorías |
| Form0BDTecnicos | Gestión de técnicos |

---

### 1.5 Integración Externa
**Propósito:** Integración con sistemas externos.

| Formulario | Propósito |
| :--- | :--- |
| FormExpedientesBusqueda | Búsqueda de expedientes (vinculado) |
| FormIndicadores | Informes de indicadores |
| FormCorreo | Envío de correos |

**Servicios:**
- `RiesgoServicio` — Integración con sistema de riesgos
- `Correo` — Envío de notificaciones
- `Entorno` — Configuración de entorno

---

### 1.6 Seguridad y Usuarios
**Propósito:** Gestión de autenticación y permisos.

| Clase | Propósito |
| :--- | :--- |
| `Usuario` | Entidad de usuario |
| `UsuarioAplicacionPermisos` | Permisos por aplicación |

**Roles identificados:**
- Administrador
- Calidad
- Economía
- Secretaría
- Técnico
- Sin acceso

---

## 2. Grafo de Dependencias entre Formularios

```
Form0BDOpciones
    ├── Form0BDOpcionesParteProyectos
    │       ├── FormNCProyecto (alta)
    │       ├── FormNCProyectoGestion
    │       ├── FormNCProyectoTipologiaGestion → FormTipologiaNCProyecto
    │       ├── FormNCProyectoSeguimiento
    │       │       ├── FormNCProyecto
    │       │       └── FormExpedientesBusqueda
    │       ├── FormIndicadores
    │       └── Form0BDOpcionesAuditorias
    └── Form0BDOpcionesAuditorias
            ├── FormAuditoria (alta)
            ├── FormAuditoriasGestion
            │       ├── FormNCAuditoria (alta)
            │       ├── FormAuditoria → FormAuditoriaDocumentos
            │       └── FormNCAuditoriaGestion
            ├── FormNCAuditoriaGestion
            │       └── FormNCAuditoria
            ├── FormNCAuditoriaSeguimiento
            │       └── FormNCAuditoria
            └── Form0BDOpcionesParteProyectos

FormNCProyectoGestion
    ├── FormNCProyectoGeneralConVinculoNC
    │       └── FormExpedientesBusqueda
    ├── FormNCProyecto
    │       ├── FormExpedientesBusqueda
    │       ├── FormNCProyectoControlEficaciaAlta
    │       └── formRiesgosSeleccion (externo)
    ├── FormNCProyectoAR → FormARProyectoDocumentos
    ├── FormNCProyectoAC
    ├── FormCorreo
    └── FormExpedientesBusqueda

FormNCProyectoAcciones
    ├── FormNCProyectoAC
    └── FormNCProyectoAR → FormARProyectoDocumentos

FormNCProyectoSeguimientoNC
    ├── FormNCProyecto
    └── FormExpedientesBusqueda

FormNCProyectoSeguimientoTareas
    ├── FormNCProyecto
    └── FormExpedientesBusqueda

FormNCAuditoriaGestion
    ├── FormNCAuditoria
    ├── FormCorreo
    └── FormAuditoriasGestion

FormNCAuditoriaAcciones
    ├── FormNCAuditoriaAC
    ├── FormNCAuditoriaAR → FormARAuditoriaDocumentos
    └── FormARAuditoriaDocumentos

FormNCAuditoriaAR
    └── FormARAuditoriaDocumentos
```

---

## 3. Entidades del ERD (Principales)

| Tabla | Propósito | Dominio |
| :--- | :--- | :--- |
| `TbNoConformidades` | NC de proyectos | NC Proyectos |
| `TbNoConformidadesAuditoria` | NC de auditorías | NC Auditorías |
| `TbNCAccionCorrectivas` | Acciones correctivas (proyectos) | NC Proyectos |
| `TbNCAccionesRealizadas` | Ejecución acciones (proyectos) | NC Proyectos |
| `TbNCAuditoriaAccionCorrectivas` | Acciones correctivas (auditorías) | NC Auditorías |
| `TbNCAuditoriaAccionesRealizadas` | Ejecución acciones (auditorías) | NC Auditorías |
| `TbAuditorias` | Catálogo de auditorías | Auditorías |
| `TbExpedientes` | Expedientes (vinculado) | Integración |
| `TbRiesgos` | Riesgos (vinculado) | Integración |
| `TbNCInformacionRAC` | Info causa raíz | NC Proyectos |
| `TbReplanificacionesProyecto` | Reprogramaciones (proyectos) | NC Proyectos |
| `TbReplanificacionesAuditoria` | Reprogramaciones (auditorías) | NC Auditorías |

---

## 4. Zonas de Riesgo Identificadas

### 4.1 Lógica de negocio en formularios
**Severidad:** Alta
- Los `.cls` de formularios contienen lógica de negocio (validaciones, cálculos,workflow)
- Mezcla de UI y dominio — difícil de testear y mantener

### 4.2 Duplicación NC Proyectos vs NC Auditorías
**Severidad:** Media
- Gran paralelismo entre ambas ramas: clases, formularios, tablas
- Cambios en workflow requieren更改 en dos sitios
- Riesgo de divergencia funcional

### 4.3 Integración con sistemas externos
**Severidad:** Media
- `TbExpedientes` y `TbRiesgos` son tablas vinculadas (sin control directo)
- `TbCorreosEnviados` vinculado a aplicación externa
- Fallos en sistemas externos pueden romper funcionalidad

### 4.4 Workflow de estados no encapsulado
**Severidad:** Media
- Los cambios de estado se realizan en múltiples puntos (forms + clases Operaciones)
- No hay Servicio de Workflow centralizado
- Difícil auditar y garantizar consistencia

### 4.5 Cache de NC Proyecto
**Severidad:** Baja
- `TbCacheNCProyecto` con lógica de cacheo compleja
- `TbLogCache` para auditoría de cache
- Potencial fuente de inconsistencias si el cache se invalida incorrectamente

---

## 5. Límites de Dominio

| Dominio | Entidades Core | Dependencias Externas |
| :--- | :--- | :--- |
| **NC Proyectos** | NCProyecto, AC, AR, SegNC, Replanif | Expedientes, Riesgos |
| **NC Auditorías** | NCAuditoria, AC, AR, SegNC, Replanif | Auditorías |
| **Auditorías** | Auditoria, DocumentoAuditoria | — |
| **Configuración** | Usuario, TipologiaNCProyectos | — |
| **Integración** | Correo, Entorno | TbExpedientes, TbRiesgos, TbCorreosEnviados |

---

## 6. Candidatos a PRD (Orden de Prioridad)

| Orden | Módulo | Justificación |
| :--- | :--- | :--- |
| 1 | **PRD-01: NC Proyectos** | Dominio principal, mayor complejidad, más usado |
| 2 | **PRD-02: NC Auditorías** | Dominio paralelo a NC Proyectos |
| 3 | **PRD-03: Auditorías** | Dependencia de NC Auditorías |
| 4 | **PRD-04: Configuración y Usuarios** | Base para seguridad y tipologías |
| 5 | **PRD-05: Integración Externa** | Expedientes, Riesgos, Correos |

---

## 7. Próximos Pasos

1. **Aprobar** este DISCOVERY_MAP
2. Generar **PRD-01: NC Proyectos** (prioridad más alta)
3. Tras aprobación, continuar con los siguientes PRDs

---

*Documento generado: 2026-03-08*
*Estado: Pendiente de aprobación*
