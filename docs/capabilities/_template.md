<!--
PLANTILLA DE DOCUMENTO DE CAPACIDAD — grado SDD, reproducible sin código.

Flujo canónico: access-vba-capability-docs v2.

Regla de verdad:
- SDD / product owner / tracker = POR QUÉ e intención.
- Código Access/VBA exportado + verificación Dysflow = QUÉ y CÓMO.

Profundidad por nivel:
- minimal  → §0, §1 breve, §2 reglas + señales de aceptación, §7
- standard → §0–§5, §7
- critical → todas las secciones completas

Redactar todos los entregables en castellano de España. Conservar sin traducir identificadores de código, nombres de pruebas, manifests, herramientas Dysflow, valores de enumeraciones, rutas, commits, referencias y URLs.

Sustituye los placeholders. No elimines nada sin moverlo. Marca las incógnitas como Confirmación pendiente.
-->

# Capacidad: <nombre de negocio, no un nombre de módulo>

## §0 Identidad

- **ID de capacidad**: `<CAP-xxx>`
- **Nivel**: `critical` / `standard` / `minimal`
- **Estado**: `active` / `deprecated` / `broken` / `draft`
- **Fuente**: `sdd` / `reverse-engineered` / `hybrid`
- **Responsable / autoridad de producto**: `Confirmación pendiente`
- **Referencia tracker de origen**: `Confirmación pendiente`
- **Última verificación**: `Evidencia Dysflow pendiente`
- **Confianza global**: `mixed — see §7`

## §1 Intención de negocio — POR QUÉ

> Fuente de verdad: artefactos SDD, historial de tracker, product owner / equipo de calidad. El código no explica por qué.

- **Propósito**: Pendiente.
- **Usuarios / personas**: Pendiente.
- **Problema que resuelve**: Pendiente.
- **Valor de negocio**: Pendiente.
- **No objetivos**: Pendiente.
- **Fuente de intención**: `Confirmación pendiente`

## §2 Contrato de comportamiento — QUÉ

> Ancla de regresión. Esta sección debe permitir que una IA detecte que la funcionalidad está rota o ausente y la reconstruya según especificación.

### Escenarios (Given / When / Then)

- **GIVEN** `<state>` **WHEN** `<user action>` **THEN** `<observable result>`
- **GIVEN** `<alternate state>` **WHEN** `<user action>` **THEN** `<observable result>`
- **GIVEN** `<invalid state>` **WHEN** `<user action>` **THEN** `<validation/error>`

### Reglas de negocio

> Cada regla debe tener una prueba. Si falta `Test`, crear una mediante `access-vba-tdd` y demostrarla con `dysflow.test_vba` antes de afirmar `Verified-runtime`.

| ID de regla | Enunciado | Autoridad | ¿Aplicada en código? | Prueba / evidencia | Confianza |
|---|---|---|---|---|---|
| BR-1 | Pendiente. | Pendiente. | Pendiente. | FALTA → crear mediante `access-vba-tdd` | `Intended` |

### Validaciones

| Validación | Cuándo se aplica | ¿Bloqueante? | Evidencia | Confianza |
|---|---|---|---|---|
| Pendiente | Pendiente | Pendiente | Pendiente | `Likely` |

### Transiciones de estado

| Desde | Hacia | Disparador | Guarda / validación | Evidencia | Confianza |
|---|---|---|---|---|---|
| Pendiente | Pendiente | Pendiente | Pendiente | Pendiente | `Likely` |

### Caminos límite y de error

- Pendiente.

### Señales de aceptación / presencia

- Señal observable pendiente. Si falta, la capacidad puede estar ausente o haber regresado.

## §3 Mapa de implementación — CÓMO

> Fuente de verdad: código Access/VBA exportado y confirmado mediante Dysflow.

- **Puntos de entrada UI**: Pendiente.
- **Puntos de entrada de fuente**: Pendiente.
- **Datos tocados**: Pendiente.
- **Salidas**: Pendiente.
- **Dependencias / integraciones**: Pendiente.
- **Sincronización fuente↔binario**: Evidencia `dysflow.verify_binary` pendiente.
- **Evaluación de diseño (as-built vs ideal)**: Pendiente.

## §4 Receta de reconstrucción — REPRODUCIBILIDAD

> Pasos ordenados para reconstruir esta capacidad. Todas las operaciones fuente↔binario pasan por Dysflow MCP.

1. Pendiente.
2. Importar cambios con `dysflow.import_modules` / `dysflow.import_all` según corresponda.
3. El usuario compila manualmente en Access VBE cuando la política del proyecto lo requiere.
4. Verificar fuente↔binario con `dysflow.verify_binary`.
5. Demostrar el comportamiento frente a §2 con `dysflow.test_vba`.

## §5 Evidencia y trazabilidad

### Pruebas

| Prueba / manifest | Comprueba | Última ejecución Dysflow | Resultado | Confianza |
|---|---|---|---|---|
| Pendiente | Pendiente | Pendiente | Pendiente | `Intended` |

### Documentos de funcionalidad de apoyo

| Documento de funcionalidad | Qué soporta | Estado |
|---|---|---|
| Pendiente | Pendiente | Pendiente |

### Trazabilidad de release

| Elemento (funcionalidad o arreglo) | Ref. tracker | Versión staging (UAT) | Estado UAT | Release de producción | Fecha en prod | Nota |
|---|---|---|---|---|---|---|
| Pendiente | Pendiente | Pendiente | pending | Pendiente | Pendiente | Pendiente |

### Tabla de diagnóstico de regresión

| Síntoma | Causa probable | Comprobación (Dysflow / docs) | Ancla documental | Siguiente acción |
|---|---|---|---|---|
| Pendiente | Pendiente | Pendiente | Pendiente | Pendiente |

## §6 Notas de migración web

- **Preservar**: Pendiente.
- **Transformar**: Pendiente.
- **NO copiar (legacy)**: Pendiente.
- **Preguntas abiertas de migración**: Pendiente.

## §7 Libro de confianza

> `Verified-static` es deuda temporal: debe una prueba en runtime. Llevarlo a `Verified-runtime` mediante `access-vba-tdd` y `dysflow.test_vba`.

| Hecho | Confianza | Evidencia | Fecha |
|---|---|---|---|
| Pendiente | `Likely` | Pendiente | YYYY-MM-DD |

## Divergencias (intención SDD ≠ realidad del código)

- Pendiente. Marca toda divergencia para revisión humana; no la ocultes.
