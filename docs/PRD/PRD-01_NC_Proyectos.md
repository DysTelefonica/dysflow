# PRD-01: NC Proyectos

## 0. User Stories

| ID | Prioridad | Descripción |
|:---|:---------:|:-------------|
| US-001 | Alta | Como usuario de gestión, quiero registrar una nueva No Conformidad de Proyecto con todos sus datos identificativos (código, expediente, proyecto, vehículo, descripción, causa) para iniciar su ciclo de vida. |
| US-002 | Alta | Como usuario de gestión, quiero modificar los datos de una NC Proyecto existente para corregir errores o actualizar información. |
| US-003 | Alta | Como usuario de gestión, quiero eliminar (borrado lógico) una NC Proyecto indicando el motivo, para mantener el registro histórico sin perder trazabilidad. |
| US-004 | Alta | Como usuario de gestión, quiero vincular una NC Proyecto a otra NC (ANC) para establecer relaciones jerárquicas entre no conformidades. |
| US-005 | Alta | Como usuario de calidad, quiero registrar acciones correctivas (AC) asociadas a una NC Proyecto para iniciar su resolución. |
| US-006 | Alta | Como usuario de calidad, quiero cerrar una NC Proyecto registrando la fecha de cierre, para dar por finalizada su fase de corrección. |
| US-007 | Alta | Como usuario de calidad, quiero registrar control de eficacia de una NC Proyecto para verificar que las acciones correctivas fueron efectivas. |
| US-008 | Media | Como usuario de gestión, quiero consultar el listado de NC Proyectos con filtros por estado, fecha, proyecto, para identificar atrasos o situaciones críticas. |
| US-009 | Media | Como usuario de gestión, quiero asociar riesgos a una NC Proyecto para mantener la trazabilidad de impactos. |
| US-010 | Baja | Como usuario de calidad, quiero vincular documentos a una NC Proyecto para mantener evidencia attached. |

---

## 1. Objetivo

Documentar el módulo de **No Conformidades de Proyectos** del sistema No Conformidades. Este módulo gestiona el ciclo de vida completo de las NCs detectadas en proyectos de Telefónica, incluyendo:

- Alta, modificación y eliminación de NCs
- Vinculación entre NCs (principal ↔ asociada)
- Gestión de acciones correctivas (AC)
- Control de eficacia
- Cálculos automáticos de estado, fechas y contadores
- Association con riesgos y documentos

**Dominio principal:** NCs originadas en proyectos.
**Diferenciación:** Se distingue de NC Auditorías por su origen (proyecto vs. auditoría).

---

## 2. Entidades y Tabla Fuente de Verdad

### 2.1 Entidad Principal: NCProyecto

**Clase:** `NCProyecto.cls` (src/classes/)
**Tabla fuente de verdad:** `TbNoConformidades`

#### 2.1.1 Esquema de Datos

| Campo Access | Tipo Dato | Nullable | PK/FK | Descripción |
|:-------------|:----------|:---------|:-----|:------------|
| IDNoConformidad | Long Integer (4) | NO | PK | Identificador único secuencial |
| Juridica | Text (255) | SÍ | | Jurídica asociada |
| CodigoNoConformidad | Text (255) | NO | | Código identificativo externo ( uniqueness) |
| EsNoConformidad | Yes/No (1) | SÍ | | Flag: ¿Es NC o solo observación? |
| EXPEDIENTE | Text (255) | SÍ | | Número de expediente |
| PROYECTO | Text (255) | SÍ | | Nombre del proyecto |
| VEHICULO | Text (255) | SÍ | | Vehículo asociado |
| DESCRIPCION | Memo (12) | SÍ | | Descripción detallada del problema |
| CAUSA | Memo (12) | SÍ | | Causa identificada |
| ENTIDADRESPONSABLE | Text (50) | SÍ | | Entidad externa responsable |
| RESPONSABLETELEFONICA | Text (50) | SÍ | | Usuario red Telefónica responsable |
| FECHAAPERTURA | Date/Time (8) | SÍ | | Fecha de apertura de la NC |
| FECHACIERRE | Date/Time (8) | SÍ | | Fecha real de cierre |
| FPREVCIERRE | Date/Time (8) | SÍ | | Fecha prevista de cierre |
| TIPO | Text (255) | SÍ | | Tipo de NC (liga a TbTiposNCProyectos) |
| NOTAS | Memo (12) | SÍ | | Notas adicionales |
| Borrado | Yes/No (1) | SÍ | | Flag de borrado lógico |
| RequiereACR | Yes/No (1) | SÍ | | Flag: ¿Requiere Acción Correctiva? |
| ACR | Memo (12) | SÍ | | Descripción de la Acción Correctiva |
| MotivoBorrado | Memo (12) | SÍ | | Motivo del borrado lógico |
| RequiereControlEficacia | Text (255) | SÍ | | Flag: ¿Requiere control de eficacia? (Sí/No) |
| ControlEficacia | Memo (12) | SÍ | | Resultado del control de eficacia |
| FechaControlEficacia | Date/Time (8) | SÍ | | Fecha de realización del control |
| FechaPrevistaControlEficacia | Date/Time (8) | SÍ | | Fecha prevista para el control |
| ResultadoControlEficacia | Memo (12) | SÍ | | Resultado detallado del control |
| ConformeControlEficacia | Text (2) | SÍ | | Conforme/No Conforme |
| RESPONSABLECALIDAD | Text (255) | SÍ | | Responsable de calidad asignado |
| IDExpediente | Long Integer (4) | SÍ | FK | FK a TbExpedientes |
| CodExp | Text (255) | SÍ | | Código del expediente (desnormalizado) |
| Nemotecnico | Text (255) | SÍ | | Nemotécnico del expediente |
| JuridicaExp | Text (255) | SÍ | | Jurídica del expediente (desnormalizado) |
| RESPONSABLECALIDADExp | Text (255) | SÍ | | Responsable calidad del expediente |
| CausaYAnalisRaiz | Memo (12) | SÍ | | Causa y análisis de raíz |
| Tipologia | Text (255) | SÍ | | Tipología de NC |
| IDProyecto | Long Integer (4) | SÍ | | ID del proyecto |
| CodigoRiesgo | Text (255) | SÍ | | Código de riesgo asociado |
| DetectadoPor | Text (255) | SÍ | | Quién detectó la NC |
| ResponsableEjecucion | Text (255) | SÍ | | Responsable de ejecución |
| ESTADO | Text (255) | SÍ | | Estado de la NC (texto, para búsquedas) |
| IDTipo | Long Integer (4) | SÍ | FK | FK a TbTiposNCProyectos |
| Cerrada | Text (2) | SÍ | | Flag cerrado (Sí/No) |
| IDNCAsociada | Long Integer (4) | SÍ | FK | FK a TbNoConformidades (autorreferencia) |
| CodigoNoConformidadAsociada | Text (255) | SÍ | | Código NC asociada (desnormalizado) |
| CodConcesionAsociada | Text (255) | SÍ | | Código de concesión asociada |

#### 2.1.2 Propiedades Calculadas (No persisten en BD)

| Propiedad | Tipo Retorno | Lógica de Cálculo |
|:----------|:-------------|:------------------|
| FECHACIERRECalculada | String | Retorna FECHACIERRE si existe, o cadena vacía |
| FPREVCIERRECalculada | String | Calcula: fecha apertura + 30 días (o configurable) |
| CerradaCalculada | EnumSino | Retorna Sí si FECHACIERRE no está vacío |
| EstadoCalculado | EnumEstadoNC | Calcula: Abierta/EnPlazo/ConRetraso/Cerrada/SinAC/etc. |
| EstadoCalculadoTexto | String | Texto descriptivo del estado |
| EstadoTitulo | String | Título para UI según estado |
| NAccionCalculado | String | Conteo de acciones correctivas asociadas |
| CodRiesgosAsociados | String | Códigos de riesgos vinculados |
| TipoNCProyecto | TipologiaNCProyectos | Objeto tipología cargado por IDTipo |
| Riesgos | Scripting.Dictionary | Colección de objetos Riesgo asociados |
| ACs | Scripting.Dictionary | Colección de acciones correctivas |
| ARsSinFinalizar | Scripting.Dictionary | ACs sin fecha de realización |
| Documentos | Scripting.Dictionary | Documentos asociados |
| NCProyectoAsociada | NCProyecto | Objeto NC asociada cargado por IDNCAsociada |
| ExpedienteObj | Expediente | Objeto expediente cargado por IDExpediente |
| ResponsableTelefonicaObj | usuario | Objeto usuario RD chargé |
| ResponsableCalidadObj | usuario | Objeto usuario calidad |

#### 2.1.3 Enumeraciones Utilizadas

```vba
Enum EnumSino
    Sí = 1
    No = 0
    Ninguno = -1
End Enum

Enum EnumEstadoNC
    Abierta = 0
    EnPlazo = 1
    ConRetraso = 2
    Cerrada = 3
    SinAC = 4
    ACRPendiente = 5
    ControlEficaciaPendiente = 6
End Enum
```

---

## 3. UX / Flujo de Interfaz

*(Pendiente de documentar - requiere análisis de formularios)*

Formularios esperados según DISCOVERY_MAP:
- Form_frmNCProyectos (listado principal)
- Form_frmNCProyecto (edición detalle)

---

## 4. Reglas de Negocio / Ciclo de Vida

### 4.1 Estados Posibles

| Estado | Condición de Transición |
|:-------|:----------------------|
| Abierta | NC creada, sin cerrar |
| EnPlazo | Abierta y fecha prevista cierre > fecha actual |
| ConRetraso | Abierta y fecha prevista cierre < fecha actual |
| Cerrada | FECHACIERRE tiene valor |
| SinAC | RequiereACR = Sí pero no hay AC registradas |
| ACRPendiente | Hay ACs asociadas sin completar |
| ControlEficaciaPendiente | Cerrada pero sin control de eficacia |

### 4.2 Reglas de Cálculo de Estado

1. **CerradaCalculada:** Retorna Sí si `FECHACIERRE` no es vacío
2. **EstadoCalculado:** 
   - Si no cerrada → verificar plazos y ACs
   - Si cerrada → verificar control de eficacia

### 4.3 Validaciones de Negocio

| Campo | Regla |
|:------|:------|
| CodigoNoConformidad | Obligatorio, único en sistema |
| FECHAAPERTURA | No puede ser futura |
| FECHACIERRE | Debe ser >= FECHAAPERTURA |
| IDNCAsociada | No puede ser la misma NC (autorreferencia circular) |
| IDTipo | Debe existir en TbTiposNCProyectos |
| RequiereControlEficacia | Solo editable si Cerrada = Sí |

---

## 5. Algoritmos y Lógica No Trivial

### 5.1 Cálculo de Fecha Prevista de Cierre

```
FPREVCIERRECalculada = FECHAAPERTURA + 30 días (configurable por tipología)
```

### 5.2 Cálculo de Estado

```
Function GetEstadoCalculado() As EnumEstadoNC
    If Me.FECHACIERRE <> "" Then
        ' Cerrada
        If Me.RequiereControlEficacia = "Sí" And Me.FechaControlEficacia = "" Then
            Return ControlEficaciaPendiente
        Else
            Return Cerrada
        End If
    Else
        ' Abierta - verificar ACs
        If Me.RequiereACR = True And Me.ACs.Count = 0 Then
            Return SinAC
        ElseIf Me.ACsHaySinFinalizar() Then
            Return ACRPendiente
        End If
        
        ' Verificar plazos
        If Me.FPREVCIERRE <> "" And Me.FPREVCIERRE < Now() Then
            Return ConRetraso
        Else
            Return EnPlazo
        End If
    End If
End Function
```

---

## 6. Flujos Principales

### 6.1 Alta de NC Proyecto

1. Usuario accede a formulario de alta
2. Sistema genera ID secuencial (auto)
3. Usuario ingresa: Código NC, Proyecto, Vehículo, Descripción, Causa, Entidad responsable
4. Usuario selecciona Tipología (IDTipo)
5. Sistema calcula FPREVCIERRECalculada
6. Usuario guarda → `NCProyectoOperaciones.RegistrarDatosUnicos()`
7. Sistema valida unicidad de CodigoNoConformidad
8. Sistema persiste en TbNoConformidades dentro de transacción
9. Sistema commit transacción

### 6.2 Modificación de NC Proyecto

1. Usuario modifica campos editables
2. Sistema recalcula propiedades calculadas si corresponde
3. Sistema guarda → `NCProyectoOperaciones.RegistrarCambiosDatosUnicosConVinculoNC()`
4. Sistema persiste cambios dentro de transacción

### 6.3 Eliminación (Borrado Lógico)

1. Usuario solicita eliminación
2. Sistema solicita motivo de borrado
3. Sistema ejecuta `NCProyectoOperaciones.Eliminar()` 
   - Actualiza `Borrado = True`
   - Registra `MotivoBorrado`
   - **NO elimina registros relacionados** (AC, documentos, riesgos se mantienen)

### 6.4 Vinculación a NC Asociada

1. Usuario selecciona NC origen
2. Usuario busca y selecciona NC asociada
3. Sistema valida que no sea la misma NC
4. Sistema ejecuta actualización de IDNCAsociada y campos desnormalizados

### 6.5 Cierre de NC

1. Usuario solicita cierre
2. Sistema verifica que no haya ACs sin finalizar (opcional: warn)
3. Usuario confirma fecha de cierre
4. Sistema ejecuta `NCProyectoOperaciones.CIERREGrabar()`
   - Actualiza FECHACIERRE
   - Calcula estado Cerrada
   - Si RequiereControlEficacia = Sí, agenda control

### 6.6 Control de Eficacia

1. Usuario registra resultado del control
2. Sistema ejecuta `NCProyectoOperaciones.RegistrarControlEficacia()`
   - Actualiza ControlEficacia, FechaControlEficacia, ResultadoControlEficacia
3. Si resultado = No Conforme → reopen NC (FECHACIERRE = null)

---

## 7. Transaccionalidad

### 7.1 Transacciones Requeridas

| Operación | Transacción |
|:----------|:------------|
| Alta | BeginTrans → Insert → CommitTrans / Rollback |
| Modificación | BeginTrans → Update → CommitTrans / Rollback |
| Eliminación | BeginTrans → Update (Borrado) → CommitTrans / Rollback |
| Vinculación | BeginTrans → Update FK + desnormalizados → CommitTrans / Rollback |
| Cierre | BeginTrans → Update FECHACIERRE → CommitTrans / Rollback |

### 7.2 Manejo de Errores

```vba
On Error GoTo errores
WS.BeginTrans
' operaciones...
WS.CommitTrans
Exit Function

errores:
    WS.Rollback
    p_Error = Err.Description
```

---

## 8. Pestañas / Secciones Funcionales

*(Pendiente - requiere análisis de formularios)*

Secciones esperadas en UI:
- Datos Generales (identificación, proyecto, vehículo)
- Descripción y Causa
- Responsables
- Fechas (apertura, cierre, prevista)
- Acciones Correctivas
- Control de Eficacia
- Documentos Adjuntos
- Riesgos Asociados
- Notas

---

## 9. Fases Alternativas o Secundarias

### 9.1 Reapertura de NC

Si control de eficacia resulta "No Conforme", el sistema debe permitir reopen:
- Limpiar FECHACIERRE
- Resetear estado a Abierta
- Registrar motivo de reopen en NOTAS

### 9.2 Vinculación Múltiple

Una NC puede tener múltiples NCs asociadas (padre/hijo). Actual schema permite solo una FK, pero podría expandirse a tabla relacional.

---

## 10. Casos Borde

| Caso | Comportamiento Esperado |
|:-----|:------------------------|
| NC sin código | Error: CodigoNoConformidad obligatorio |
| Fecha cierre < apertura | Error: validación de fechas |
| Eliminar NC con ACs activas | Warn: ACs quedan huerfanas, mantenerlas |
| Autoeliminación por inactividad | No implementada (pendiente) |
| NC con FK a NC eliminada | Mantener FK (no cascade delete) |
| Concurrencia de edición | No contemplada (Access es monousuario) |

---

## 11. Puntos de Integración

| Sistema Externo | Punto de Integración | Datos Intercambiados |
|:----------------|:--------------------|:---------------------|
| Expedientes | TbExpedientes | IDExpediente, CodExp, Nemotecnico |
| Tipologías | TbTiposNCProyectos | IDTipo, Tipologia |
| Riesgos | TbRiesgosNC | IDNoConformidad ↔ IDRiesgo |
| Documentos | TbNCDocumentos | IDNoConformidad ↔ IDAnexo |
| Usuarios | Directorio Telefónica | USuariored ↔ usuario |

---

## 12. Casos de Prueba (Given-When-Then)

### 12.1 Alta NC Proyecto

```
GIVEN usuario en formulario de alta de NC Proyecto
WHEN ingresa CodigoNoConformidad="NC-2024-001", Proyecto="PROY-001", 
      FECHAAPERTURA=2024-01-15, RequiereACR=True
THEN sistema calcula FPREVCIERRECalculada=2024-02-14
AND sistema persiste registro con Estado="EnPlazo"
```

### 12.2 Cierre NC sin Control de Eficacia

```
GIVEN NC Proyecto abierta con RequiereControlEficacia="Sí"
WHEN usuario intenta cerrar sin registrar control de eficacia
THEN sistema muestra warn pero permite cierre
AND estado final="ControlEficaciaPendiente"
```

### 12.3 Vinculación Circular

```
GIVEN NC-001 relacionada a NC-002
WHEN usuario intenta relacionar NC-002 a NC-001
THEN sistema muestra error: "No se permite vinculación circular"
```

### 12.4 Eliminación con ACs

```
GIVEN NC Proyecto con 3 acciones correctivas asociadas
WHEN usuario elimina la NC
THEN sistema marca Borrado=True
AND sistema mantiene las 3 ACs (no las elimina)
AND sistema muestra info: "3 acciones correctivas asociadas se mantendrán"
```

---

## 13. Registro de Deuda Técnica

| ID | Descripción | Prioridad | Estado |
|:---|:------------|:----------|:-------|
| D-001 | Un solo campo IDNCAsociada (no soporta múltiples) | Media | Pendiente |
| D-002 | Campos desnormalizados (CodExp, Nemotecnico, etc.) - riesgo de inconsistencia | Alta | Pendiente |
| D-003 | Estado como texto en BD (ESTADO) - redundante con cálculo | Baja | Pendiente |
| D-004 | Sin auditoría de cambios en NC | Media | Pendiente |
| D-005 | Formularios no documentados en este PRD | Alta | Pendiente |

---

## Historial de Versiones

| Versión | Fecha | Autor | Cambios |
|:--------|:------|:------|:--------|
| 1.0 | 2026-03-08 | Arquitecto | Versión inicial - análisis de código |

---

*Documento generado como parte del PRD-01: NC Proyectos*
