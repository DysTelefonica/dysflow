# Spec-007b: Pestaña General consume NCProyectoDetailVM (Dual-Path)

**Estado:** 🔵 ABIERTA  
**Prioridad:** Alta  
**Tipo:** Nueva Funcionalidad  
**Spec padre:** Spec-007  
**Plan origen:** PLAN-002 (T-07b)

---

## Propósito

Implementar patrón dual-path en la pestaña General de FormNCProyecto: **primero intentar leer desde NCProyectoDetailVM**, si no está disponible o no está cargado, **fallback al path antiguo** vía NCProyectoOperaciones.

---

## ADDED Requirements

### Requirement: Carga dual-path desde ViewModel para pestaña General

El formulario **DEBE** intentar cargar los controles de la pestaña General desde `NCProyectoDetailVM` cuando esté disponible y cargado. **SI** el VM no está disponible o `EstaCargado = False`, **ENTONCES** debe hacer fallback al path antiguo usando `NCProyectoOperaciones`.

#### Scenario: Carga exitosa desde VM

- GIVEN `m_VM` no es Nothing Y `m_VM.EstaCargado = True`
- WHEN se llama a `CargarControlesGeneral()`
- THEN cargar cada control desde la propiedad correspondiente del VM

#### Scenario: Fallback a path antiguo

- GIVEN `m_VM` es Nothing O `m_VM.EstaCargado = False`
- WHEN se llama a `CargarControlesGeneral()`
- THEN llamar a `constructor.getNCProyecto(p_IDNC)` para obtener el objeto NC
- AND cargar los controles desde las propiedades del objeto NC

---

## Datos disponibles en NCProyectoDetailVM para General

| Propiedad VM | Control destino |
|-------------|----------------|
| `IDNoConformidad` | lblID |
| `CodigoNoConformidad` | txtCodigo |
| `Estado` | txtEstado |
| `Descripcion` | txtDescripcion |
| `Causa` | txtCausa |
| `ResponsableTelefonica` | txtResponsableTel |
| `RESPONSABLECALIDAD` | txtResponsableCalidad |
| `Proyecto` | txtProyecto |
| `VEHICULO` | txtVehiculo |
| `Expediente` | txtExpediente |
| `FechaApertura` | txtFechaApertura |
| `FECHACIERRE` | txtFechaCierre |
| `FechaPrevCierre` | txtFechaPrevCierre |
| `Juridica` | txtJuridica |
| `Tipo` | txtTipo |
| `Notas` | txtNotas |
| `Cerrada` | txtCerrada |
| `RequiereACR` | chkRequiereACR |
| `ACR` | txtACR |
| `RequiereControlEficacia` | chkRequiereCE |
| `ControlEficacia` | txtControlEficacia |
| `Tipologia` | txtTipologia |
| `CodExp` | txtCodExp |
| `Nemotecnico` | txtNemotecnico |
| `CodigoRiesgo` | txtCodigoRiesgo |
| `DetectadoPor` | txtDetectadoPor |
| `ResponsableEjecucion` | txtResponsableEjecucion |

---

## Plan de Intervención

### Intervención 1: Añadir método CargarControlesGeneral() con dual-path

**Archivo:** `src/forms/Form_FormNCProyectoGeneral.cls`

**Descripción:**
```vba
Private Sub CargarControlesGeneral()
    If Not m_VM Is Nothing And m_VM.EstaCargado Then
        ' Path VM
        Me.txtDescripcion = m_VM.Descripcion
        Me.txtCausa = m_VM.Causa
        Me.txtResponsableTel = m_VM.ResponsableTelefonica
        ' ... etc para todos los campos
    Else
        ' Path fallback antiguo
        Dim objNC As NCProyecto
        Set objNC = constructor.getNCProyecto(p_IDNC:=m_IDNCActiva)
        Me.txtDescripcion = objNC.Descripcion
        Me.txtCausa = objNC.Causa
        ' ... etc
    End If
End Sub
```

**Precondición:** Spec-007 completada (m_VM disponible en el formulario contenedor)

---

## Criterios de Verificación

- [ ] Sin regresiones en pestaña General
- [ ] VM se usa cuando está disponible
- [ ] Fallback funciona cuando VM no está disponible
- [ ] Access cerrado antes de importar .cls

### Batería de Tests (REQUISITO DE CIERRE)

**Obligatorio para cerrar la spec.** Crear `src/modules/Test_Spec007b_General.bas` con ejecutor `Test_Spec007b_RunAll()`:

| Test | Descripción |
|------|-------------|
| `Test001_DualPath_VMDisponible` | GIVEN: VM disponible y cargado WHEN: CargarControlesGeneral THEN: controles desde VM |
| `Test002_DualPath_VMNil` | GIVEN: VM es Nothing WHEN: CargarControlesGeneral THEN: usa fallback |
| `Test003_DualPath_VMNoCargado` | GIVEN: VM no cargado (EstaCargado=False) WHEN: CargarControlesGeneral THEN: usa fallback |

**El ejecutor `Test_Spec007b_RunAll()` debe:**
- Mostrar `MsgBox` con resultado (OK o FALLIDA + count)
- Imprimir en `Debug.Print` con formato GIVEN/WHEN/THEN/RESULT
- Devolver 0 si todos pasan, >0 si fallan

---

## Importación Access

- **Tipo de cambio:** Solo código (.cls)
- **Comando:** `node cli.js import Form_FormNCProyectoGeneral`
