# PRD-03: Auditorías

## 0. User Stories

| ID | Prioridad | Descripción |
|:---|:---------:|:-------------|
| US-AUD-001 | Alta | Como usuario de calidad, quiero registrar una auditoría con su tipo y fechas de inicio/fin para documentar el proceso de auditoría. |
| US-AUD-002 | Alta | Como usuario de calidad, quiero consultar el listado de auditorías para ver el histórico de auditorías realizadas. |
| US-AUD-003 | Alta | Como auditor, quiero registrar NCs asociadas a una auditoría para documentar los hallazgos. |
| US-AUD-004 | Alta | Como auditor, quiero vincular documentos a una auditoría para mantener evidencia attached. |
| US-AUD-005 | Media | Como usuario de calidad, quiero eliminar una auditoría (borrado lógico) manteniendo las NCs asociadas. |
| US-AUD-006 | Baja | Como usuario, quiero consultar NCs de una auditoría específica para generar informes. |

---

## 1. Objetivo

Documentar el módulo de **Auditorías** del sistema No Conformidades. Este módulo gestiona las auditorías (internas o externas) realizadas por Telefónica, sirviendo como contenedor padre de las NCs de auditoría.

**Dominio:** Auditorías que generan NCs.
**Relación:** Una auditoría puede tener múltiples NCs asociadas (1:N con TbNoConformidadesAuditoria).

---

## 2. Entidades y Tabla Fuente de Verdad

### 2.1 Entidad Principal: Auditoria

**Clase:** `Auditoria.cls` (src/classes/)
**Tabla fuente de verdad:** `TbAuditorias`

#### 2.1.1 Esquema de Datos

| Campo Access | Tipo Dato | Nullable | PK/FK | Descripción |
|:-------------|:----------|:---------|:-----|:------------|
| IDAuditoria | Long Integer (4) | NO | PK | Identificador único |
| Tipo | Text (255) | SÍ | | Tipo de auditoría (Interna/Externa/etc.) |
| FechaInicio | Date/Time (8) | SÍ | | Fecha de inicio de la auditoría |
| FechaFin | Date/Time (8) | SÍ | | Fecha de fin de la auditoría |

#### 2.1.2 Propiedades Calculadas

| Propiedad | Tipo Retorno | Lógica |
|:----------|:-------------|:-------|
| NombreAuditoria | String | Construye: "Auditoría de [Tipo] - [FechaInicio] a [FechaFin]" |
| URLDirectorio | String | URL del directorio SharePoint/Drive asociado |
| IDAuditoriaCalculada | String | Retorna IDAuditoria o vacío |
| NCs | Scripting.Dictionary | Colección de NCAuditoria asociadas |
| Documentos | Scripting.Dictionary | Documentos adjuntos a la auditoría |
| ColCampos | Collection | Campos del formulario |
| NumeroNCCalculado | String | Calcula siguiente número de NC para esta auditoría |

#### 2.1.3 Enumeraciones

*(No tiene enumeraciones propias - usa las de NCs)*

---

## 3. UX / Flujo de Interfaz

*(Pendiente de documentar)*

Formularios esperados:
- Form_frmAuditoriasGestion (listado)
- Form_frmAuditoria (edición)

---

## 4. Reglas de Negocio / Ciclo de Vida

### 4.1 Estados Posibles

| Estado | Condición |
|:-------|:----------|
| Pendiente | FechaInicio > fecha actual |
| EnCurso | FechaInicio <= fecha actual <= FechaFin |
| Cerrada | FechaFin < fecha actual |
| SinNCs | No tiene NCs asociadas |

### 4.2 Reglas de Negocio

| Regla | Descripción |
|:-------|:------------|
| Fechas | FechaFin debe ser >= FechaInicio |
| Tipo | Obligatorio, valores predefinidos |
| Eliminación | Borrado lógico, mantiene NCs asociadas |

---

## 5. Algoritmos y Lógica No Trivial

### 5.1 Generación de Número de NC

```
Function NumeroNCCalculado(p_Tipo As String) As String
    ' Formato: NC-AAAA-TIPO-###
    ' Ejemplo: NC-2024-AUD-001
    Return "NC-" & Year(Now()) & "-" & UCase(Left(p_Tipo,3)) & "-" & Format(SiguienteNumero, "000")
End Function
```

### 5.2 Nombre de Auditoría

```
NombreAuditoria = "Auditoría de " & Tipo & " - " & Format(FechaInicio, "dd/mm/yyyy") & " a " & Format(FechaFin, "dd/mm/yyyy")
```

---

## 6. Flujos Principales

### 6.1 Alta de Auditoría

1. Usuario ingresa Tipo de auditoría
2. Define FechaInicio y FechaFin
3. Sistema calcula NombreAuditoria
4. Persiste en TbAuditorias

### 6.2 Registro de NC en Auditoría

1. Usuario selecciona auditoría existente
2. Sistema calcula NumeroNCCalculado
3. Usuario registra NC con número propuesto
4. NC se vincula automáticamente a IDAuditoria

### 6.3 Eliminación de Auditoría

1. Usuario solicita eliminación
2. Sistema verifica NCs asociadas
3. Si hay NCs → warn pero permite (NCs se mantienen)
4. Marca auditoría como borrada

---

## 7. Transaccionalidad

- Alta: BeginTrans → Insert → CommitTrans / Rollback
- Modificación: BeginTrans → Update → CommitTrans / Rollback
- Eliminación: BeginTrans → Update (Borrado) → CommitTrans / Rollback

---

## 8. Pestañas / Secciones Funcionales

*(Pendiente)*

Esperado:
- Datos Generales (tipo, fechas)
- NCs Asociadas
- Documentos
- Informes

---

## 9. Fases Alternativas

- **Auditoría sin NCs:** Permitida, quedan como "vacías"
- **Auditoría con NCs pendientes:** Las NCs mantienen su propio estado

---

## 10. Casos Borde

| Caso | Comportamiento |
|:-----|:---------------|
| Eliminar auditoría con NCs | Warn, mantiene NCs |
| FechaFin < FechaInicio | Error de validación |
| Auditoría sin tipo | Error: Tipo obligatorio |

---

## 11. Puntos de Integración

| Sistema | Punto | Datos |
|:--------|:------|:------|
| NC Auditorías | TbNoConformidadesAuditoria | IDAuditoria → NCs |
| Documentos | TbDocumentosAuditorias | IDAuditoria → Documentos |
| Logs | TbAuditoriaLog | IDAuditoria → Log de cambios |

---

## 12. Casos de Prueba

### 12.1 Alta Auditoría

```
GIVEN formulario de alta de auditoría
WHEN usuario ingresa: Tipo="Interna", FechaInicio=2024-01-01, FechaFin=2024-01-15
THEN sistema calcula NombreAuditoria="Auditoría de Interna - 01/01/2024 a 15/01/2024"
AND persiste en TbAuditorias
```

### 12.2 Eliminación con NCs

```
GIVEN auditoría con 5 NCs asociadas
WHEN usuario elimina la auditoría
THEN sistema muestra warn: "5 NCs asociadas se mantendrán"
AND marca auditoría como borrada
AND las 5 NCs siguen vigentes con IDAuditoria intacto
```

---

## 13. Registro de Deuda Técnica

| ID | Descripción | Prioridad | Estado |
|:---|:------------|:----------|:-------|
| D-009 | Auditoría con pocos campos (expansible) | Baja | Pendiente |
| D-010 | Sin workflow de estados propio | Baja | Pendiente |

---

## Historial

| Versión | Fecha | Autor |
|:--------|:------|:------|
| 1.0 | 2026-03-08 | Arquitecto |

---

*Documento generado como parte del PRD-03: Auditorías*
