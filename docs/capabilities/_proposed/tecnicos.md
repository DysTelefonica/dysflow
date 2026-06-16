# Capacidad: Técnicos (CRUD de personal técnico del sistema)

> **Estado**: `draft` (propuesto) · **Nivel**: `minimal` · **Fuente**: `reverse-engineered`
>
> Esta capacidad fue identificada durante el inventario de Fase 1 (2026-06-15) en `docs/inventory/feature-matrix.md` §6 "capacidades faltantes propuestas". Aún no tiene product owner asignado.

## §0 Identidad

- **ID de capacidad**: `CAP-TECH` (propuesto)
- **Nivel**: `minimal`
- **Estado**: `draft` — propuesta pendiente de producto
- **Fuente**: `reverse-engineered` desde `src/forms/Form_Form0BDTecnicos.cls` (a confirmar)
- **Responsable / autoridad de producto**: `Confirmación pendiente`
- **Referencia tracker de origen**: `Confirmación pendiente`
- **Última verificación**: `Evidencia Dysflow pendiente`

## §1 Resumen ejecutivo (resumen ejecutivo del producto)

La capacidad "Técnicos" cubre el CRUD del personal técnico que aparece en combos, asignaciones, informes: alta, baja, modificación de datos, asignación a proyecto, histórico de participación. El form `Form_Form0BDTecnicos` (a confirmar nombre) es el entry point visual.

El inventario lo separó como capacidad propia porque:

1. `Form_Form0BDTecnicos` no es consumido por `NCAuditoria.cls` o `NCProyecto.cls` directamente — es un form de mantenimiento independiente.
2. Los técnicos son un dominio aparte de usuarios (CAP-UPN): un usuario del sistema puede o no ser técnico de un proyecto.
3. La web tendrá un CRUD equivalente que necesita su propio mapping.

## §2 Reglas de negocio (a confirmar con producto)

- `BR-TECH-1` (TBD): Los técnicos tienen un ID único, nombre, apellidos, email, teléfono, especialidad, fecha de alta. **FALTA → autor** confirmar campos obligatorios.
- `BR-TECH-2` (TBD): Un técnico puede ser asignado a múltiples proyectos simultáneamente. **FALTA → autor** confirmar cardinalidad.
- `BR-TECH-3` (TBD): La baja de un técnico no borra el histórico de su participación en proyectos pasados. **FALTA → autor** confirmar comportamiento.
- `BR-TECH-4` (TBD): El técnico responsable de una NC debe estar activo (no dado de baja). **FALTA → autor** confirmar si esto se enforce.

## §3 Puntos de entrada (a inventariar)

- `src/forms/Form_Form0BDTecnicos.cls` — form principal.
- Tabla: ¿`TbTecnicos`? ¿`TbPersonalTecnico`? — a inspeccionar con `dysflow.get_schema`.
- Clases de dominio que referencian técnicos: `NCAuditoria.cls`, `NCProyecto.cls`, `Expediente.cls` (todavía a confirmar).

## §4 Pruebas atómicas (cuando producto cierre §2)

- `Test_Tech_CRUD_Atomic`: alta, lectura, modificación, baja de un técnico.
- `Test_Tech_AsignacionMultiple_Atomic`: asignar un técnico a 2 proyectos y verificar que aparece en ambos.
- Manifest dedicado: `tests/tests.vba.tech.json` (a crear).

## §5 Riesgos y vínculos

- **Riesgo de duplicación**: si la tabla `TbTecnicos` es la misma que `TbUsuarios` o `TbPersonas`, fusionar con CAP-UPN.
- **Riesgo de scope**: si los técnicos son solo "personas que pueden ser responsables de NC", la lógica es transversal a CAP-NCA-LC y CAP-NCP-LC; si son "personas con especialidad técnica" (auditores, consultores), es un dominio aparte.
- **Vinculado a**: CAP-UPN (usuarios), CAP-NCA-LC, CAP-NCP-LC.

## §6 Notas de migración web

### §6.1 Conservar
- El modelo de datos del técnico (BR-TECH-1) sobrevive tal cual a una tabla `tecnicos` en la web.
- La invariancia de no borrar histórico (BR-TECH-3) sobrevive como soft-delete.

### §6.2 Transformar
- `Form_Form0BDTecnicos` se reformula como una página web `/admin/tecnicos` con tabla editable.
- Las validaciones del form (e.g., email único) se reformulan como constraints en la BD web.

### §6.3 NO copiar
- El uso de controles Access `ComboBox` con `RowSource` se descarta — la web usa selects HTML con API REST.
- Las macros `Form_BeforeUpdate` para validar se descartan — la web valida en backend.

### §6.4 Preguntas abiertos al product owner
- ¿La tabla `TbTecnicos` es la misma que `TbUsuarios` o son tablas distintas?
- ¿Los técnicos pueden ser del sistema (login) o solo figurativos (para asignar)?

## §7 Registro de confianza

| BR | Resumen | Confianza | Evidencia | Fecha |
|---|---|---|---|---|
| `BR-TECH-1` | Modelo de datos del técnico | `Intended` | FALTA → autor confirmar campos | 2026-06-15 |
| `BR-TECH-2` | Asignación a múltiples proyectos | `Intended` | FALTA → autor confirmar cardinalidad | 2026-06-15 |
| `BR-TECH-3` | Baja no borra histórico | `Intended` | FALTA → autor confirmar comportamiento | 2026-06-15 |
| `BR-TECH-4` | Responsable debe estar activo | `Intended` | FALTA → autor confirmar enforcement | 2026-06-15 |

## §8 Próximo paso

1. Localizar `Form_Form0BDTecnicos.cls` y la tabla subyacente.
2. Confirmar con producto si los técnicos son un dominio aparte o un atributo de usuarios.
3. Si son dominio aparte, escribir el primer test atómico y promover el stub.
