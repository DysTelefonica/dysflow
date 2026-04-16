# Spec-009: Precalentado Manual de Caché (Detalle + Gestión)

**Estado:** En revisión
**Fecha:** 2026-03-15
**Autor:** Arquitecto de Software Principal
**RFC origen:** [RFC-001: Arquitectura de Caché y ViewModel](../../../rfcs/RFC-001_arquitectura-cache-viewmodel.md)
**Plan origen:** [PLAN-002: Mejora de Rendimiento con ViewModel y Caché (T-09)](../../../plans/active/plan-002-cache-viewmodel-rfc001/PLAN_002_Cache_ViewModel_RFC001.md)
**Specs relacionadas:** Spec-003 (Cache listados), Spec-006 (GetNCProyectoVM), Spec-008 (Invalidación transaccional), Spec-010 (Kill-switch de caché - no bloqueante)

> **STOP 1:** Esta Spec NO ha sido aprobada aún. No implementar código hasta recibir aprobación.

---

## 1. Objetivo

Implementar un mecanismo de **precalentado manual de caché** que permita al usuario ejecutar manualmente el populate de caché para que tanto el **detalle** (todas las NCs con hijos: AC, AR, documentos, replanificaciones, riesgos) como el **listado/gestión** (filtros baseline) estén disponibles desde el primer uso, sin esperar a la carga bajo demanda.

## 2. Problema

- El sistema de caché actual funciona bajo demanda (lazy load): la primera vez que se abre un detalle o se aplica un filtro, se genera la caché.
- Esto implica que el **primer uso** siempre tiene latency.
- El usuario quiere que, tras ejecutar un comando manual, la caché ya esté poblada para los escenarios más frecuentes.

## 3. Propuesta

### 3.1 Alcance del precalentado

**Detalle (por NC):**
| Campo caché | Entidad |
|------------|---------|
| DatosNC | NC principal completa |
| DatosACs | Acciones Correctivas (incluye ARs anidados) |
| DatosARs | Acciones Realizadas/Tareas |
| DatosDocumentos | Documentos/Anexos |
| DatosReplanificaciones | Replanificaciones |
| DatosRiesgos | Riesgos |

**Listado (filtros baseline):**
| Filtro | Descripción |
|--------|-------------|
| Sin filtro | Listado completo |
| Por Estado | REGISTRADA, ENEJECUCION, Cerrada |
| Por Proyecto | Campo PROYECTO |
| Por Responsable Telefónica | Campo RESPONSABLETELEFONICA |
| Por rango de fechas | FechaApertura últimos 30 días |
| Por Estado + Proyecto | Combinación frecuente |

### 3.2 Interfaz de ejecución

**Comando desde Ventana Inmediato:**
```vba
CacheNCProyecto.PrecalentarCacheCompleto
```

**Función orquestadora:**
```vba
Public Sub PrecalentarCacheCompleto( _
    Optional ByVal batchSize As Long = 50, _
    Optional ByVal incluirListado As Boolean = True, _
    Optional ByVal filtrosListado As Variant = Empty, _
    Optional ByVal forceOverwrite As Boolean = False)
```

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `batchSize` | Long | NCs por lote para control de transacciones (default: 50) |
| `incluirListado` | Boolean | Si True, precalienta también caché de listado (default: True) |
| `filtrosListado` | Variant | Array de filtros a precalentar (si vacío, usa baseline predefinido) |
| `forceOverwrite` | Boolean | Si True, regenera incluso si ya hay caché válida (default: False) |

### 3.3 Funcionamiento interno

**Flujo de precalentado de detalle:**
1. Obtener lista de IDs de NCs desde `TbNoConformidades`
2. Para cada NC (en lotes de `batchSize`):
   - Iniciar transacción
   - Llamar a `Constructor.GetNCProyectoVM(idNC)` para obtener payload completo
   - Serializar a JSON y guardar en `TbCacheNCProyecto`
   - Commit transacción
   - Si error: rollback, registrar en log de errores, continuar con siguiente
3. Imprimir progreso cada N NCs (Debug.Print)
4. Generar resumen final

**Flujo de precalentado de listado:**
1. Para cada filtro en baseline (o array personalizado):
   - Llamar a `Constructor.GetNCsFiltradosVM(filtro)` 
   - Serializar resultado a JSON
   - Guardar en `TbCacheListadoNC` con clave combinada (nombre filtro)
2. Generar resumen de filtros precalentados

### 3.4 Idempotencia

- La función verifica `CacheValida` antes de escribir
- Si `forceOverwrite = False` y la NC ya tiene caché válida, se omite
- Si `forceOverwrite = True`, regenera toda la caché
- Los errores parciales no abortan la ejecución: se registran y se continúan

### 3.5 Progreso y logging

**Durante ejecución:**
```vba
Debug.Print "Procesando NCs " & startID & " - " & endID & ": " & processed & "/" & total
```

**Resumen final:**
```
=== PRECALENTADO COMPLETO ===
Detalle: X NCs procesadas, Y exitosas, Z fallidas
Listado: W filtros precalentados
Tiempo total: T.TTs
===========================
```

### 3.6 Control de errores

- Cada NC se procesa en su propia transacción (no rollback total)
- Errores capturados con `On Error Resume Next` + logging
- Si error crítico (ej. timeout global), lanzar excepción al final del proceso
- El resumen final siempre incluye: total procesadas, exitosas, fallidas, lista de IDs fallidos

---

## 4. Criterios de Aceptación

### 4.1 Funcionamiento básico

- [ ] Comando `CacheNCProyecto.PrecalentarCacheCompleto` ejecutable desde Ventana Inmediato
- [ ] Función detecta NCs con caché existente y las omite (idempotente)
- [ ] Parámetro `forceOverwrite` regenera incluso caché válida
- [ ] Parámetro `batchSize` controla tamaño de lote
- [ ] Parámetro `incluirListado` controla si se precalienta listado

### 4.2 Precalentado de detalle

- [ ] Precalienta todas las entidades hijos: ACs, ARs, Documentos, Replanificaciones, Riesgos
- [ ] Cada NC se guarda en `TbCacheNCProyecto` con todos los campos JSON
- [ ] Los errores parciales no interrumpe el proceso completo

### 4.3 Precalentado de listado

- [ ] Precalienta filtros baseline: sin filtro, por Estado, por Proyecto, por Responsable, por fecha, Estado+Proyecto
- [ ] Cada combinación de filtros se guarda en `TbCacheListadoNC`
- [ ] Filtros no precalentados funcionan on-demand (sin regression)

### 4.4 Validación UX

- [ ] Filtros de gestión responden con caché ya poblada desde primer uso
- [ ] Detalle de NC abre con caché ya poblada (sin delay de generación)
- [ ] Resumen final muestra: total NC procesadas, exitosas, fallidas, total filtros, tiempo total

### 4.5 No regresión

- [ ] Funcionalidad existente de caché bajo demanda no se ve afectada
- [ ] Invalidación post-commit sigue funcionando
- [ ] Botones "Actualizar" en formularios siguen operativos

---

## 5. Rollback / Recovery

### 5.1 Recovery ante fallo parcial

Si el precalentado falla en un lote intermedio:
- Parámetro `startID` permite reanudar desde un ID específico
- Parámetro `endID` permite limitar el rango
- Los logs de errores indican qué IDs fallaron

**Ejemplo de recovery:**
```vba
' Reanudar desde NC 500, hasta NC 1000
CacheNCProyecto.PrecalentarCacheCompleto batchSize:=50, startID:=500, endID:=1000
```

### 5.2 Rollback técnico

Si se necesita limpiar la caché precalentada:
```vba
' Limpiar toda la caché (precaución: esto fuerza regeneracion)
CacheNCProyecto.LimpiarCacheCompleta
```

### 5.3 Recuperación ante datos corruptos

- Si `CacheValida = False`, el sistema ignora esa entrada y regenera on-demand
- No hay riesgo de servir datos corruptos: la validación es automática

---

## 6. Pruebas Específicas

### 6.1 Pruebas de detalle + hijos

| ID | Escenario | Resultado esperado |
|----|-----------|-------------------|
| T9-D01 | Precalentar 1 NC con ACs, ARs, Documentos | Todos los campos JSON poblados correctamente |
| T9-D02 | Precalentar NC sin hijos (solo NC principal | DatosNC tiene valores, hijos vacíos [] |
| T9-D03 | Precalentar NC con múltiples ACs y ARs | JSON contiene array completo |
| T9-D04 | forceOverwrite=True sobre NC con caché válida | Se regenera, CacheValida=True |
| T9-D05 | forceOverwrite=False sobre NC con caché válida | Se omite, no hay escritura |

### 6.2 Pruebas de gestión + filtros

| ID | Escenario | Resultado esperado |
|----|-----------|-------------------|
| T9-L01 | Precalentar filtros baseline (6 filtros) | 6 entradas en TbCacheListadoNC |
| T9-L02 | Precalentar filtro por Estado=REGISTRADA | DatosListado contiene solo NCs en estado REGISTRADA |
| T9-L03 | Precalentar filtro Estado+Proyecto | DatosListado contiene combinación correcta |
| T9-L04 | Precalentar filtros personalizados | Solo los filtros especificados se precalientan |

### 6.3 Pruebas de rollback/recovery

| ID | Escenario | Resultado esperado |
|----|-----------|-------------------|
| T9-R01 | startID=100, endID=200 | Solo NCs 100-200 procesadas |
| T9-R02 | Ejecutar PrecalentarCacheCompleto 2 veces (idempotencia) | Segunda ejecución omite NCs ya cacheadas |
| T9-R03 | LimpiarCacheCompleta + abrir detalle | Detalle regenera on-demand (no error) |

### 6.4 Pruebas de no-regresión

| ID | Escenario | Resultado esperado |
|----|-----------|-------------------|
| T9-NR01 | Sin precalentar, abrir FormNCProyectoGestion | Funciona igual que antes (on-demand) |
| T9-NR02 | Sin precalentar, abrir detalle de NC | Funciona igual que antes (on-demand) |
| T9-NR03 | Precalentar, luego modificar NC y guardar | Invalidación funciona, caché se marca inválida |

---

## 7. Módulos / Archivos afectados

| Módulo / Archivo | Tipo de cambio | Notas |
| :--- | :--- | :--- |
| `src/modules/CacheNCProyecto.bas` | Extender | Añadir método `PrecalentarCacheCompleto`, `LimpiarCacheCompleta` |
| `src/modules/constructor.bas` | No cambia | Reutiliza métodos existentes |

---

## 8. Métricas de Validación

| Métrica | Método | Objetivo |
|---------|--------|----------|
| Tiempo precalentado detalle | Timer en PrecalentarCacheCompleto | < 60s por 1000 NCs |
| Tiempo precalentado listado | Timer en PrecalentarCacheCompleto | < 10s por 6 filtros |
| Primer uso detalle post-precalentado | Timer en apertura FormNCProyecto | < 500ms (desde caché) |
| Primer uso filtro post-precalentado | Timer en aplicar filtro | < 500ms (desde caché) |

---

## 9. Riesgos y Mitigaciones

| Riesgo | Probabilidad | Mitigación |
|--------|--------------|------------|
| R1: Tiempo excesivo en precalentado | Alta | batchSize configurable, ejecutar fuera de horario |
| R2: Memoria/JSON muy grande | Media | Validar tamaño antes de escribir, truncar si excede |
| R3: Concurrencia con usuarios | Baja | Ejecutar en mono-usuario o notificar |
| R4: Fallo parcial sin visibilidad | Media | Log detallado + resumen final siempre |

---

## 10. Decisiones de Diseño (NO CAMBIAR)

- **Sin TTL en detalle:** Decisión tomada en RFC-001, se mantiene
- **Refresco manual:** Decisión tomada en RFC-001, se mantiene
- **Invalidación post-commit AR → AC → NC:** Decisión tomada en RFC-001, se mantiene
- **Parámetros opcionales con valores por defecto:** Para simplificar uso desde Inmediato
