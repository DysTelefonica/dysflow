# Capacidad: Instalador / bootstrap del sistema

> **Estado**: `draft` (propuesto) · **Nivel**: `minimal` · **Fuente**: `reverse-engineered`
>
> Esta capacidad fue identificada durante el inventario de Fase 1 (2026-06-15) en `docs/inventory/feature-matrix.md` §6 "capacidades faltantes propuestas". Aún no tiene product owner asignado.

## §0 Identidad

- **ID de capacidad**: `CAP-BOOT` (propuesto)
- **Nivel**: `minimal`
- **Estado**: `draft` — propuesta pendiente de producto
- **Fuente**: `reverse-engineered` desde `src/modules/Instalador.bas`
- **Responsable / autoridad de producto**: `Confirmación pendiente`
- **Referencia tracker de origen**: `Confirmación pendiente`
- **Última verificación**: `Evidencia Dysflow pendiente`

## §1 Resumen ejecutivo (resumen ejecutivo del producto)

El módulo `Instalador.bas` contiene la lógica de bootstrap del sistema: setup inicial, creación de tablas si no existen, seed de catálogos, verificación de entorno, mensaje de bienvenida. Se ejecuta típicamente la primera vez que se abre el `.accdb` o tras una migración.

El inventario lo separó como capacidad propia porque:

1. `Instalador.bas` no es referenciado por ninguna clase de dominio (`NCAuditoria.cls`, `NCProyecto.cls`); es entry point independiente.
2. La lógica de bootstrap tiene reglas de negocio (qué tablas crear, qué seed insertar, qué versiones soportar) que no encajan en CAP-CAT ni CAP-CFG.
3. La web tendrá un equivalente (script de migraciones, seed de BD, verificación de entorno) que necesita su propio mapping.

## §2 Reglas de negocio (a confirmar con producto)

- `BR-BOOT-1` (TBD): La primera ejecución crea todas las tablas requeridas y siembra los catálogos mínimos. **FALTA → autor** confirmar lista de tablas y catálogos.
- `BR-BOOT-2` (TBD): El instalador es idempotente (segunda ejecución no rompe nada). **FALTA → autor** confirmar comportamiento ante tablas existentes.
- `BR-BOOT-3` (TBD): El instalador verifica la versión de Access y muestra un error si es incompatible. **FALTA → autor** confirmar versión mínima.
- `BR-BOOT-4` (TBD): Hay un log de instalación (qué se hizo, qué falló, timestamps). **FALTA → autor** confirmar destino del log.

## §3 Puntos de entrada (a inventariar)

- `src/modules/Instalador.bas` — entry point principal.
- `src/forms/Form_Inicio.cls` (si existe) — el form que se muestra al abrir el `.accdb`.
- Tablas: `TbConfiguracionBackends` (vinculable a CAP-CFG), `TbTiposNC*` (vinculable a CAP-CAT).

## §4 Pruebas atómicas (cuando producto cierre §2)

- `Test_Boot_Idempotente_Atomic`: ejecutar el instalador dos veces, la segunda no debe fallar.
- `Test_Boot_TablasRequeridas_Atomic`: verificar que tras la primera ejecución existen todas las tablas del schema.
- Manifest dedicado: `tests/tests.vba.boot.json` (a crear).

## §5 Riesgos y vínculos

- **Riesgo de duplicación**: el instalador pisa lógica de CAP-CAT y CAP-CFG. Si las reglas de bootstrap son mínimas (e.g., "verificar que existen las tablas"), fusionar con CAP-CFG.
- **Riesgo de testing**: ejecutar el instalador en CI es caro (toca múltiples tablas). Considerar tests solo de las sub-funciones públicas, no del instalador completo.
- **Vinculado a**: CAP-CAT, CAP-CFG, CAP-LOG (si el log de instalación es el mismo log general).

## §6 Notas de migración web

### §6.1 Conservar
- La idempotencia del bootstrap (BR-BOOT-2) sobrevive a la web: las migraciones de BD se ejecutan con `IF NOT EXISTS` o equivalente.
- La verificación de versión (BR-BOOT-3) sobrevive como health-check del backend al arrancar.

### §6.2 Transformar
- `Instalador.bas` se reformula como un script de migraciones (e.g., `migrations/001_initial.sql`, `migrations/002_seed_catalogs.sql`).
- La verificación de entorno se reformula como un endpoint `GET /api/health` que devuelve 200 si todo OK, 503 si falta algo.

### §6.3 NO copiar
- El mensaje de bienvenida ("Bienvenido a NoConformidades") se descarta — la web tiene su propia UI de login.
- La creación de tablas con `CREATE TABLE` desde VBA se descarta — la web usa migraciones declarativas versionadas.

### §6.4 Preguntas abiertas al product owner
- ¿El instalador crea las tablas en la primera ejecución o requiere un script externo?
- ¿La verificación de versión Access es solo informativo o bloqueante?

## §7 Registro de confianza

| BR | Resumen | Confianza | Evidencia | Fecha |
|---|---|---|---|---|
| `BR-BOOT-1` | Crea tablas y seed | `Intended` | FALTA → autor confirmar listas | 2026-06-15 |
| `BR-BOOT-2` | Idempotente | `Intended` | FALTA → autor confirmar comportamiento | 2026-06-15 |
| `BR-BOOT-3` | Verifica versión Access | `Intended` | FALTA → autor confirmar versión mínima | 2026-06-15 |
| `BR-BOOT-4` | Log de instalación | `Intended` | FALTA → autor confirmar destino | 2026-06-15 |

## §8 Próximo paso

1. Leer `src/modules/Instalador.bas` (es un módulo grande típicamente) y mapear todas las funciones públicas a BRs tentativas.
2. Confirmar con producto si CAP-BOOT se mantiene como capacidad propia o se fusiona con CAP-CFG.
3. Si se mantiene, escribir el primer test atómico (`Test_Boot_Idempotente_Atomic`) y crear `tests/tests.vba.boot.json`.
