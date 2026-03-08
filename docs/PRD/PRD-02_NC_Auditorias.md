# PRD-02: NC Auditorías

## 0. User Stories

| ID | Prioridad | Descripción |
|:---|:---------:|:-------------|
| US-NC-001 | Alta | Como auditor, quiero registrar una No Conformidad detectada en una auditoría específica para documentar el hallazgo. |
| US-NC-002 | Alta | Como auditor, quiero vincular una NC de Auditoría a una auditoría existente, para mantener trazabilidad del origen. |
| US-NC-003 | Alta | Como responsable de calidad, quiero registrar acciones correctivas (AC) específicas de la NC de auditoría. |
| US-NC-004 | Alta | Como responsable de calidad, quiero cerrar la NC de auditoría con fecha de cierre y verificar completion de ACs. |
| US-NC-005 | Alta | Como responsable de calidad, quiero registrar el control de eficacia de la NC de auditoría. |
| US-NC-006 | Media | Como usuario, quiero consultar NCs de auditoría filtradas por auditoría, estado o fecha, para generar informes. |
| US-NC-007 | Baja | Como auditor, quiero vincular documentos de evidencia a la NC de auditoría. |

---

## 1. Objetivo

Documentar el módulo de **No Conformidades de Auditorías** del sistema No Conformidades. Este módulo gestiona las NCs originadas durante auditorías (internas o externas), diferenciándose de NC Proyectos por su vinculación a auditorías específicas.

**Dominio:** NCs detectadas en auditorías.
**Diferenciación:** Se distingue de NC Proyectos por su origen (auditoría vs. proyecto) y por usar tablas separadas.

---

## 2. Entidades y Tabla Fuente de Verdad

### 2.1 Entidad Principal: NCAuditoria

**Clase:** `NCAuditoria.cls` (src/classes/)
**Tabla fuente de verdad:** `TbNoConformidadesAuditoria`

#### 2.1.1 Esquema de Datos

| Campo Access | Tipo Dato | Nullable | PK/FK | Descripción |
|:-------------|:----------|:---------|:-----|:------------|
| ID | Long Integer (4) | NO | PK | Identificador único |
| IDAuditoria | Long Integer (4) | SÍ | FK | FK a TbAuditorias |
| FechaApertura | Date/Time (8) | SÍ | | Fecha de detección |
| Numero | Text (255) | SÍ | | Número de NC (secuencial) |
| DESCRIPCION | Memo (12) | SÍ | | Descripción del hallazgo |
| CAUSARAIZ | Memo (12) | SÍ | | Causa raíz identificada |
| ACCIONCORRECTIVA | Memo (12) | SÍ | | Descripción de AC |
| CORRECCION | Memo (12) | SÍ | | Corrección aplicada |
| FECHACIERRE | Date/Time (8) | SÍ | | Fecha real de cierre |
| FPREVCIERRE | Date/Time (8) | SÍ | | Fecha prevista de cierre |
| RESPONSABLEIMPLANTACION | Text (255) | SÍ | | Responsable de implementar AC |
| RequiereControlEficacia | Text (25) | SÍ | | Flag: ¿Requiere control eficacia? |
| ControlEficacia | Memo (12) | SÍ | | Resultado del control |
| FechaControlEficacia | Date/Time (8) | SÍ | | Fecha del control |
| FechaPrevistaControlEficacia | Date/Time (8) | SÍ control | | Fecha prevista |
| ResultadoControlEficacia | Memo (12) | SÍ | | Resultado detallado |
| ConformeControlEficacia | Text (2) | SÍ | | Conforme/No Conforme |
| RequiereAccionCorrectiva | Text (2) | SÍ | | Flag: ¿Tiene AC? |
| MotivoNoAccionCorrectiva | Memo (12) | SÍ | | Justificación si no hay AC |
| Tipo | Text (255) | SÍ | | Tipo de NC |
| PuntoNorma | Text (255) | SÍ | | Punto de norma afectado |
| ESTADO | Text (255) | SÍ | | Estado (texto) |
| Borrado | Yes/No (1) | SÍ | | Flag de borrado lógico |
| MotivoBorrado | Memo (12) | SÍ | | Motivo del borrado |
| Notas | Memo (12) | SÍ | | Notas adicionales |
| Cerrada | Text (2) | SÍ | | Flag cerrado |

#### 2.1.2 Propiedades Calculadas

| Propiedad | Tipo Retorno | Lógica |
|:----------|:-------------|:-------|
| Particula | String | Retorna "de Auditoría" |
| Titulo | String | NC + Particula + Número |
| NAccionCalculado | String | Conteo de ACs |
| FECHACIERRECalculada | String | FECHACIERRE o vacío |
| FPREVCIERRECalculada | String | Calculada o vacío |
| CerradaCalculada | EnumSino | Sí si FECHACIERRE no vacío |
| EstadoCalculado | EnumEstadoNC | Calculado según lógica |
| EstadoCalculadoTexto | String | Texto del estado |
| ACs | Scripting.Dictionary | Colección de ACs |
| ARsSinFinalizar | Scripting.Dictionary | ARs sin fecha |
| Documentos | Scripting.Dictionary | Documentos asociados |
| Auditoria | Auditoria | Objeto cargado por IDAuditoria |
| Replanificaciones | Scripting.Dictionary | Colección de replanificaciones |
| DatosGeneralesOK | EnumSino | Validación de campos obligatorios |
| EficaciaOK | EnumSino | Validación de control eficacia |
| AccionesOK | EnumSino | Validación de ACs completadas |

#### 2.1.3 Enumeraciones

Iguales a NCProyecto:
- `EnumSino` (Sí/No/Ninguno)
- `EnumEstadoNC` (Abierta/EnPlazo/ConRetraso/Cerrada/etc.)

---

## 3. UX / Flujo de Interfaz

*(Pendiente de documentar - requiere análisis de formularios)*

Formularios esperados:
- Form_frmNCAuditorias (listado)
- Form_frmNCAuditoria (edición)

---

## 4. Reglas de Negocio / Ciclo de Vida

### 4.1 Estados Posibles

| Estado | Condición |
|:-------|:----------|
| Abierta | NC creada, sin cerrar |
| EnPlazo | Abierta y FPREVCIERRE > fecha actual |
| ConRetraso | Abierta y FPREVCIERRE < fecha actual |
| Cerrada | FECHACIERRE tiene valor |
| ACRPendiente | Hay ACs sin completar |
| ControlEficaciaPendiente | Cerrada sin control eficacia |

### 4.2 Diferencias Clave vs NC Proyectos

| Aspecto | NC Proyectos | NC Auditorías |
|:--------|:-------------|:--------------|
| FK Principal | IDExpediente | IDAuditoria |
| Campo causa | CAUSA | CAUSARAIZ |
| Campo AC | ACR | ACCIONCORRECTIVA |
| Campo adicional | VEHICULO, PROYECTO | PuntoNorma |
| Tabla acciones | TbNCAccionCorrectivas | TbNCAuditoriaAccionCorrectivas |
| Tabla AR | TbNCAccionesRealizadas | TbNCAuditoriaAccionesRealizadas |

### 4.3 Reglas de Cierre

- RequiereControlEficacia por defecto = "Sí"
- No permite cerrar sin AC si RequiereAccionCorrectiva = "Sí"
- Si ControlEficacia = No Conforme → reopen

---

## 5. Algoritmos y Lógica No Trivial

### 5.1 Cálculo de Estado

```
Similar a NCProyecto:
- Si FECHACIERRE no vacío → Cerrada
- Verificar ACs pendientes
- Verificar plazos
- Verificar control de eficacia
```

### 5.2 Validaciones

| Campo | Regla |
|:------|:------|
| IDAuditoria | Debe existir en TbAuditorias |
| Numero | Único por auditoría |
| FECHACIERRE | >= FechaApertura |
| RequiereAccionCorrectiva | Obligatorio |

---

## 6. Flujos Principales

### 6.1 Alta de NC Auditoría

1. Usuario selecciona auditoría (IDAuditoria)
2. Ingresa número secuencial (calculado o manual)
3. Completa DESCRIPCION, CAUSARAIZ
4. Define RequiereAccionCorrectiva (Sí/No)
5. Si Sí → define ACCIONCORRECTIVA
6. Calcula FPREVCIERRE (fecha apertura + configurable)
7. Persiste en TbNoConformidadesAuditoria

### 6.2 Cierre de NC Auditoría

1. Verifica ACs completadas (ARs con fecha)
2. Registra FECHACIERRE
3. Si RequiereControlEficacia = Sí → pendiente de control
4. Si resultado = No Conforme → reopen

### 6.3 Replanificación

- Similar a NC Proyectos
- Usa tabla TbReplanificacionesAuditoria

---

## 7. Transaccionalidad

Igual patrón que NC Proyectos:
- BeginTrans / CommitTrans / Rollback
- Uso de Workspace DAO

---

## 8. Pestañas / Secciones Funcionales

*(Pendiente)*

Esperado:
- Datos Generales (auditoría, número, tipo)
- Descripción y Causa Raíz
- Acción Correctiva
- Control de Eficacia
- Documentos
- Notas

---

## 9. Fases Alternativas

- **Sin AC justificable:** MotivoNoAccionCorrectiva
- **Reapertura:** Por control eficacia negativo

---

## 10. Casos Borde

| Caso | Comportamiento |
|:-----|:---------------|
| NC sin auditoría | Error: IDAuditoria obligatorio |
| Cerrar sin ACs | Warn si RequiereAccionCorrectiva=Sí |
| Auditoría eliminada | Mantener NC (no cascade) |

---

## 11. Puntos de Integración

| Sistema | Punto | Datos |
|:--------|:------|:------|
| Auditorías | TbAuditorias | IDAuditoria → Auditoría completa |
| ACs Auditoría | TbNCAuditoriaAccionCorrectivas | ID → Colección AC |
| ARs Auditoría | TbNCAuditoriaAccionesRealizadas | ID → ARs |
| Documentos | TbDocumentosAuditorias | ID → Documentos |

---

## 12. Casos de Prueba

### 12.1 Alta NC Auditoría

```
GIVEN auditoría existente con ID=10
WHEN usuario registra NC: Numero="NC-2024-AUD-001", Descripcion="Falta documentación"
AND RequiereAccionCorrectiva="Sí", ACCIONCORRECTIVA="Elaborar procedimiento"
THEN sistema calcula FPREVCIERRE
AND persiste en TbNoConformidadesAuditoria
```

### 12.2 Cierre con Reopen

```
GIVEN NC Auditoría cerrada con control eficacia="No Conforme"
WHEN usuario registra control eficacia negativo
THEN sistema limpia FECHACIERRE
AND estado vuelve a "Abierta"
AND registra en notas: "Reapertura por control eficacia negativo"
```

---

## 13. Registro de Deuda Técnica

| ID | Descripción | Prioridad | Estado |
|:---|:------------|:----------|:-------|
| D-006 | Duplicidad de lógica con NCProyecto (herencia no implementada) | Alta | Pendiente |
| D-007 | Campos desnormalizados entre NCs | Media | Pendiente |
| D-008 | Formularios no documentados | Alta | Pendiente |

---

## Historial

| Versión | Fecha | Autor |
|:--------|:------|:------|
| 1.0 | 2026-03-08 | Arquitecto |

---

*Documento generado como parte del PRD-02: NC Auditorías*
