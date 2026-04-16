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
| FormNCProyectoAcciones | Gestión de Acciones Correctivas |
| FormNCProyectoControlEficacia | Control de eficacia |
| FormNCProyectoNota | Notas asociadas |
| FormNCProyectoDocumentos | Gestión documental |
| FormNCProyectoReplanificaciones | Reprogramaciones de fechas |

**Clases asociadas:**
- `NCProyecto` + `NCProyectoOperaciones`
- `ACProyecto` + `ACProyectoOperaciones`
- `ARProyecto` + `ARProyectoOperaciones`
- `SegNCProyecto`
- `ReplanificacionesProyecto` + `ReplanificacionesProyectoOperaciones`
- `TipologiaNCProyectos`
- `DocumentoProyecto` + `DocumentoProyectoOperaciones`

### 1.2 NC Auditorías (Dominio Principal)
**Propósito:** Gestión integral de No Conformidades derivadas de auditorías.

| Formulario | Propósito |
| :--- | :--- |
| FormNCAuditoriaGestion | Listado y gestión de NC de Auditorías |
| FormNCAuditoriaGeneral | Datos generales de la NC |
| FormNCAuditoriaAcciones | Gestión de Acciones Correctivas |
| FormNCAuditoriaControlEficacia | Control de eficacia |
| FormNCAuditoriaNota | Notas asociadas |
| FormNCAuditoriaDocumentos | Gestión documental |
| FormNCAuditoriaReplanificaciones | Reprogramaciones de fechas |

### 1.3 Gestión de Auditorías
**Propósito:** Administración del catálogo de auditorías.

| Formulario | Propósito |
| :--- | :--- |
| FormAuditoriasGestion | Listado de auditorías |
| FormAuditoria | Datos de auditoría |

### 1.4 Configuración y Utilidades
| Formulario | Propósito |
| :--- | :--- |
| Form0BDOpciones | Menú principal de opciones |
| Form0BDOpcionesParteProyectos | Opciones del área de proyectos |
| Form0BDOpcionesAuditorias | Opciones del área de auditorías |

---

## 2. Grafo de Dependencias entre Formularios

```
Form0BDOpciones
    ├── Form0BDOpcionesParteProyectos
    │       ├── FormNCProyecto (alta)
    │       ├── FormNCProyectoGestion
    │       └── FormAuditoriasGestion
    └── Form0BDOpcionesAuditorias
            ├── FormAuditoria (alta)
            └── FormAuditoriasGestion

FormNCProyectoGestion
    ├── FormNCProyecto
    └── FormCorreo
```

---

## 3. Tratamiento de Errores (Transversal)

| Concepto | Descripción |
| :--- | :--- |
| **p_Error** | Parámetro `Optional ByRef p_Error As String` en toda Function |
| **Err.Raise 1000** | Error controlado de negocio (no de sistema) |
| **Form_Load** | Punto final: msgbox vbCritical + email si error sistema, vbExclamation si error negocio |

**Documentación:**
- `docs/PRD/PRD-006_Tratamiento_Errores.md`
- `docs/lecciones-aprendidas/LECCIONES_VBA.md`

---

## 4. Candidatos a PRD (Orden de Prioridad)

| Orden | Módulo | Justificación |
| :--- | :--- | :--- |
| 1 | **PRD-01: NC Proyectos** | Dominio principal, mayor complejidad |
| 2 | **PRD-02: NC Auditorías** | Dominio paralelo a NC Proyectos |
| 3 | **PRD-03: Auditorías** | Dependencia de NC Auditorías |
| 4 | **PRD-04: Configuración y Usuarios** | Base para seguridad y tipologías |
| 5 | **PRD-05: Integración Externa** | Expedientes, Riesgos, Correos |
| 6 | **PRD-06: Tratamiento de Errores** | Transversal |

---

*Documento generado: 2026-03-08*