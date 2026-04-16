# Spec-006: GetNCProyectoVM - Constructor con ViewModel Aplanado

**Estado:** ✅ VALIDADA (2026-03-23)
**Prioridad:** Alta
**Tipo:** Corrección + Nueva Funcionalidad
**Módulos PRD afectados:** PRD-01_NC_Proyectos
**Spec padre:** —
**Specs relacionadas:** Spec-002, Spec-007
**RFC origen:** RFC-001
**Plan origen:** PLAN-002 (T-06)
**Fecha de creación:** 2026-03-14
**Fecha de actualización:** 2026-03-16
**Fecha límite:** Sin límite
**Cierre:** Pendiente

---

> **Regla anti-placeholder (obligatoria):**
> Este archivo contiene contenido completo en secciones 1 a 9.

## 1. Resumen Técnico

- **Problema / Necesidad:** Constructor necesita método para devolver NCProyectoDetailVM con datos aplanados de todas las subentidades (NC principal + ACs + ARs + Documentos + Replanificaciones).
- **Causa raíz:**
  - El método `getNCProyectoDetailVM` ya existe en constructor.bas ( Spec-002 )
  - PERO el método `CargarPorID` en NCProyectoDetailVM no carga las ARs (TbNCAccionesRealizadas)
  - La tabla TbNCAccionesRealizadas no está siendo consultada
- **Solución propuesta:**
  - Añadir carga de ARs en NCProyectoDetailVM.CargarPorID
  - Documentar la estrategia de múltiples queries vs SQL único con JOINs
- **Solución descartada:** Usar una sola SQL con LEFT JOINs para todo
  - **Por qué se descarta:** En Access/DAO, múltiples LEFT JOINs producen registros duplicados (producto cartesiano cuando hay relaciones 1:N). Cada combinación de AC+AR+Doc+Replanif genera una fila distinta. Procesar esto en VBA requiere deserializar y deducir, lo cual es más complejo y propenso a errores que múltiples queries independientes.
- **Restricciones conocidas:**
  - Solo lectura (no modifica datos)
  - Sin transacciones (solo consultas SELECT)
  - Debe mantener el patrón de manejo de errores existente

---

## 2. Historia de Usuario

> Como sistema, quiero poder obtener el detalle completo de una NC como ViewModel aplanado que incluya todas sus subentidades (datos principales, ACs, ARs, Documentos, Replanificaciones), para mostrar en FormNCProyecto.

**Contexto adicional:**
El formulario de detalle de NC (FormNCProyecto) necesita mostrar información de 6 pestañas:
1. **General** - Datos principales de la NC
2. **Acciones** - ARs (Acciones Recomendadas) y ACs (Acciones Correctivas)
3. **Control Eficacia** - Datos de eficacia
4. **Notas** - Notas relacionadas
5. **Documentos** - Anexos
6. **Replanificaciones** - Historial de replanificaciones

Actualmente, el método `getNCProyectoDetailVM` existe pero no carga las ARs (TbNCAccionesRealizadas).

---

## 3. Análisis de Impacto

### 3.1 Módulos afectados

| PRD | Módulo / Clase | Tipo de impacto | Notas |
| :--- | :--- | :--- | :--- |
| PRD-01_NC_Proyectos | constructor.bas | Ya existe | getNCProyectoDetailVM ya implementado |
| PRD-01_NC_Proyectos | NCProyectoDetailVM.cls | Modificación | Añadir carga de ARs |

### 3.2 Archivos a modificar

| Archivo | Tipo de cambio | Descripción del cambio |
| :--- | :--- | :--- |
| `src/classes/NCProyectoDetailVM.cls` | Modificación método | Añadir query y carga de ARs en CargarPorID |
| `src/modules/constructor.bas` | Sin cambios | Ya existe el método requerido |

> **Nota:** El archivo constructor.bas NO necesita modificaciones porque el método `getNCProyectoDetailVM` ya existe y deleg appropriately al método `CargarPorID` de la clase.

### 3.3 Tablas / Entidades de datos afectadas

| Tabla | Cambio | Detalle |
| :--- | :--- | :--- |
| TbNoConformidades | Solo lectura | Datos principales (ya cargado) |
| TbNCAccionCorrectivas | Solo lectura | ACs - Acciones Correctivas (ya cargado) |
| TbNCAccionesRealizadas | Solo lectura | **ARs - Acciones Recomendadas (FALTA AÑADIR)** |
| TbAnexos | Solo lectura | Documentos (ya cargado) |
| TbReplanificacionesProyecto | Solo lectura | Replanificaciones (ya cargado) |

#### Detalle de campos por tabla:

**TbNoConformidades** (datos principales):
- IDNoConformidad, CodigoNoConformidad, ESTADO, DESCRIPCION, CAUSA
- RESPONSABLETELEFONICA, RESPONSABLECALIDAD, PROYECTO, VEHICULO, EXPEDIENTE
- FECHAAPERTURA, FECHACIERRE, FPREVCIERRE, Juridica, TIPO
- NOTAS, Cerrada, RequiereACR, ACR
- RequiereControlEficacia, ControlEficacia, FechaControlEficacia, ConformeControlEficacia
- IDTipo, Tipologia, IDExpediente, CodExp, Nemotecnico
- CodigoRiesgo, DetectadoPor, ResponsableEjecucion
- IDNCAsociada, CodigoNoConformidadAsociada

**TbNCAccionCorrectivas** (ACs - Acciones Correctivas):
- IDAccionCorrectiva, NAccion, AccionCorrectiva, Responsable
- ESTADO, FechaAccionCorrectiva, FechaFinPrevistaUltima, FechaFinalUltima

**TbNCAccionesRealizadas** (ARs - Acciones Recomendadas):
- IDAccionRealizada, IDNoConformidad, NAccionRealizada
- DescripcionAccionRealizada, Responsable, Estado
- FechaRealizada, FechaPrevista

**TbAnexos** (Documentos):
- IDAnexo, IDNoConformidad, TituloAnexo, NombreArchivoFinalAnexo, FechaAnexo

**TbReplanificacionesProyecto** (Replanificaciones):
- IDReplanificacion, IDNoConformidad, Observaciones
- FechaPrevistaAlInicio, FechaPrevistaReplanificada, FechaReprogramacion

### 3.4 Formularios / UI afectados

Ninguno. Este cambio es solo de lógica (capa de datos/servicio).

### 3.5 Deuda técnica relacionada

| ID | Descripción | Relación |
| :--- | :--- | :--- |
| DT-001 | ViewModels para optimización rendimiento | Genera |
| DT-006 | Gap: ARs no cargadas en NCProyectoDetailVM | **Resuelve** |

### 3.6 Riesgos

| Riesgo | Probabilidad | Impacto | Mitigación |
| :--- | :--- | :--- | :--- |
| R-1: Query de ARs lento | Baja | Medio | Índices en IDNoConformidad ya existen |
| R-2: Campos de ARs incorrectos | Baja | Alto | Verificar contra ERD y formulario actual |
| R-3: Incompatibilidad con datos existentes | Baja | Medio | Solo lectura, no modifica datos |

---

## 4. Plan de Intervención

### Intervención 1: Añadir carga de ARs en NCProyectoDetailVM.CargarPorID

**Archivo:** `src/classes/NCProyectoDetailVM.cls`
**Tipo:** Modificación de método existente
**Precondición:** —

**Descripción:**
Añadir query a TbNCAccionesRealizadas y cargar los datos en m_ColARs. El método actual ya tiene la estructura (línea 271 inicializa m_ColARs como Collection vacío), pero no hay código que lo rellene.

**Pasos:**
1. Añadir变量 rsARs As dao.Recordset después de rsACs
2. Construir SQL para ARs:
```vba
sql = "SELECT IDAccionRealizada, NAccionRealizada, DescripcionAccionRealizada, " & _
      "Responsable, Estado, FechaRealizada, FechaPrevista " & _
      "FROM TbNCAccionesRealizadas " & _
      "WHERE IDNoConformidad = " & p_IDNoConformidad & " " & _
      "ORDER BY NAccionRealizada"
```
3. Iterar el recordset y añadir cada AR a m_ColARs como Array
4. Cerrar y limpiar rsARs en Cleanup
5. Añadir al bloque de error: cerrar rsARs si está abierto

**Postcondición:** Al llamar CargarPorID, m_ColARs contiene las ARs de la NC.

---

### Intervención 2: Verificar consistencia de propiedades ColARs

**Archivo:** `src/classes/NCProyectoDetailVM.cls`
**Tipo:** Verificación
**Precondición:** Intervención 1 completada

**Descripción:**
Verificar que la propiedad ColARs devuelve la colección correctamente y que el formato de Array coincide con lo esperado por los formularios que consumen este ViewModel.

**Postcondición:** ColARs devuelve Collection con Arrays de 7 elementos (campos de AR).

---

## 5. Criterios de Verificación

### 5.1 Auto-verificación (IA — revisión estática de código)

- [ ] Método CargarPorID incluye query a TbNCAccionesRealizadas
- [ ] Query filtra por IDNoConformidad correcto
- [ ] Los datos de ARs se cargan en m_ColARs (no en otra colección)
- [ ] Cleanup del método cierra rsARs en caso de error
- [ ] Bloque de error incluye limpieza de rsARs
- [ ] Cumple el patrón de manejo de errores (On Error GoTo / Exit Function / ErrorHandler)

### 5.2 Validación en Access

- [ ] Llamar getNCProyectoDetailVM con ID de NC que tenga ARs
- [ ] Verificar que vm.ColARs.Count > 0
- [ ] Acceder a vm.ColARs(1) y verificar que Array tiene 7 elementos
- [ ] Verificar que los datos son coherentes con TbNCAccionesRealizadas

### 5.3 Criterios de aceptación

- [ ] Clase compila sin errores en VBA Editor
- [ ] NCProyectoDetailVM.CargarPorID carga ARs correctamente
- [ ] Sin regresiones: ACs, Documentos y Replanificaciones siguen cargando
- [ ] Rendimiento <2s P95 para detalle de NC con ARs

---

## 6. Informe de Cambios UI

Sin cambios de UI.

---

## 7. Gaps y Decisiones

### Gap identificado: ARs no cargadas

**Descripción:** El método CargarPorID de NCProyectoDetailVM inicializa m_ColARs (línea 271) pero no carga ningún dato. Las ARs (Acciones Recomendadas) de TbNCAccionesRealizadas no se consultan.

**Impacto:** Formularios que usen ColARs recibirán una colección vacía.

**Solución:** Añadir query y carga en CargarPorID (Intervención 1).

---

### Decisión: Múltiples SQL vs SQL único con JOINs

**Pregunta del usuario:** ¿Por qué no usar una sola SQL para aplanar todas las subentidades?

**Respuesta técnica:**

Access/DAO tiene limitaciones importantes con queries que combinan múltiples relaciones 1:N:

1. **Producto cartesiano:** Cuando haces LEFT JOIN de NC (1) → ACs (N) → ARs (N) → Documentos (N), el resultado es el producto cartesiano de todas las tablas N. Una NC con 3 ACs, 2 ARs y 5 documentos genera 30 filas (3×2×5).

2. **Deserialización compleja:** VBA tendría que detectar cambios en cada grupo de campos para reconstruir las entidades, lo cual es propenso a errores.

3. **Multiple queries independientes:** Es más limpio y predecible. Cada query devuelve una lista plana que se procesa directamente en un bucle Do While.

4. **Mantenibilidad:** Añadir o quitar campos de una colección es trivial vs reescribir la lógica de deserialización.

**Conclusión:** La estrategia actual de múltiples queries independientes es la correcta para este contexto.

---

## 8. Notas de Implementación

- La caché de detalle se implementa en Spec-007 (no en esta spec)
- El método getNCProyectoDetailVM en constructor.bas ya existe y delega apropiadamente
- Esta spec solo corrige el gap de ARs no cargadas
- No requiere transacciones (solo SELECTs)

---

## 9. Checklist de Cierre

- [ ] Intervención 1 implementada y verificada
- [ ] Intervención 2 verificada
- [ ] Auto-verificación 5.1 completada
- [ ] Validación en Access 5.2 completada
- [ ] Criterios de aceptación 5.3 cumplidos
- [ ] Sin cambios de UI (sección 6)
- [ ] Gap de ARs resuelto
- [ ] Decisión documentada (múltiples SQL)

---

## 10. Batería de Pruebas de Aceptación

**Instrucciones:** Estas pruebas debe ejecutarlas el usuario manualmente en su Access después de importar el módulo.

### Prerrequisitos
- Access abierto con la BD `NoConformidades.accdb`
- Una NC existente que tenga ACs y ARs vinculados
- Conocer el ID de esa NC (ej: ID=1)

### Ejecución en Ventana Inmediato (VBE → Ver → Ventana Inmediato)

| ID | Escenario | Pasos | Resultado esperado | Verificación |
|----|-----------|-------|-------------------|--------------|
| **PA-01** | Carga de ARs exitosa | 1. Escribir: `? constructor.getNCProyectoDetailVM(1).colARs.Count` | Número > 0 si la NC tiene ARs | Verificar que devuelve la cantidad real de ARs en TbNCAccionesRealizadas para esa NC |
| **PA-02** | NC sin ARs | 1. Elegir NC sin ARs: `? constructor.getNCProyectoDetailVM(ID_SIN_AR).colARs.Count` | Devuelve 0 | Verificar que no da error y la colección está vacía |
| **PA-03** | Verificar estructura Array de AR | 1. `Dim vm As NCProyectoDetailVM: Set vm = constructor.getNCProyectoDetailVM(1)`<br>2. `Dim ar: ar = vm.colARs(1)`<br>3. `? UBound(ar)` | Devuelve 9 (10 elementos, índice 0-9) | Los elementos son: ID, NAccion, AccionRealizada, Responsable, Estado, FechaAccionRealizada, FechaInicio, FechaFinPrevista, FechaFinReal, Notas |
| **PA-04** | ACs siguen cargando | 1. `? constructor.getNCProyectoDetailVM(1).ColACs.Count` | Número > 0 si la NC tiene ACs | Verificar que no hubo regresión en la carga de ACs |
| **PA-05** | Documentos siguen cargando | 1. `? constructor.getNCProyectoDetailVM(1).ColDocumentos.Count` | Número >= 0 | Verificar que no hubo regresión en la carga de Documentos |
| **PA-06** | Replanificaciones siguen cargando | 1. `? constructor.getNCProyectoDetailVM(1).ColReplanificaciones.Count` | Número >= 0 | Verificar que no hubo regresión en la carga de Replanificaciones |
| **PA-07** | NC inexistente no crashea | 1. `? constructor.getNCProyectoDetailVM(999999).EstaCargado` | Devuelve False | Verificar que no da error de runtime |
| **PA-08** | Sin regresión: datos principales cargados | 1. `Dim vm As NCProyectoDetailVM: Set vm = constructor.getNCProyectoDetailVM(1)`<br>2. `? vm.Estado, vm.Descripcion` | Devuelve valores coherentes con TbNoConformidades | Verificar que campos principales siguen funcionando |

### Validación visual (opcional)
1. Abrir formulario `FormNCProyecto` con una NC que tenga ARs
2. Ir a pestaña "Acciones"
3. Verificar que se muestran las ARs correctamente

### Criterio de paso
**TODAS** las pruebas PA-01 a PA-08 deben retornar el resultado esperado.
Si alguna falla, no se considera validada la spec.