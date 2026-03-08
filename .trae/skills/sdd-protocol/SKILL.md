---
name: sdd-protocol
description: >
  Activar cuando el usuario describe una historia de usuario, bug o mejora para el proyecto CONDOR,
  o cuando dice "modo SDD", "nueva spec", "quiero implementar", "crea una spec", o cuando envía
  el trigger de cierre "VALIDADO EN ACCESS: Spec-XXX". Este skill orquesta el flujo completo:
  análisis → spec → implementación → cierre. NO activar para preguntas genéricas sobre VBA o Access
  que no sean cambios concretos al proyecto CONDOR.
---

# SDD Protocol — Spec-Driven Development V4.0

## Rutas absolutas del proyecto (referencia rápida)

| Recurso | Ruta |
|---------|------|
| Este protocolo | `...\CONDOR\00_Condor\docs\sdd\sdd_protocol.md` |
| Discovery Map | `...\CONDOR\00_Condor\docs\DISCOVERY_MAP.md` |
| PRDs | `...\CONDOR\00_Condor\docs\PRD\` |
| Modelo de datos | `...\CONDOR\00_Condor\ERD\Estructura_Datos.md` |
| Specs activas | `...\CONDOR\00_Condor\docs\specs\active\` |
| Specs completadas | `...\CONDOR\00_Condor\docs\specs\completed\` |
| Skill Spec Writer | `...\CONDOR\00_Condor\skills\spec-writer\references\SKILL.md` |
| Spec Template | `...\CONDOR\00_Condor\skills\spec-writer\references\spec_template.md` |
| Skill PRD Writer | `...\CONDOR\00_Condor\skills\prd-writer\SKILL.md` |
| PRD Template | `...\CONDOR\00_Condor\skills\prd-writer\references\prd_template.md` |
| Diario template | `...\CONDOR\00_Condor\docs\templates\diario_template.md` |
| Deuda Técnica | `...\CONDOR\00_Condor\docs\DEUDA_TECNICA.md` |
| Diario de Sesiones | `...\CONDOR\00_Condor\docs\Diario_Sesiones.md` |

---

## Flujo principal — 5 fases, 2 STOPs

### INICIO DE SESIÓN (siempre, antes de cualquier fase)

Antes de hacer cualquier cosa, ejecutar:

```
mem_context
```

Esto recupera el estado de sesiones anteriores: specs en curso, decisiones tomadas, gaps pendientes. Si hay una Spec activa en Engram, retomarla desde donde se dejó sin pedir al usuario que repita el contexto.

---

### FASE 1 — Análisis y generación de Spec

**Trigger**: el usuario describe lo que quiere (historia de usuario, bug, mejora).

La IA ejecuta todo esto sin detenerse:

1. Buscar en Engram antes de leer ficheros:
   ```
   mem_search "[módulo o área afectada]"
   mem_search "[término clave de la historia de usuario]"
   ```
   Si Engram tiene contexto suficiente, usarlo directamente. Solo ir a los ficheros si Engram no lo cubre.
2. Leer `DISCOVERY_MAP.md` → localizar módulos y archivos físicos afectados.
3. Leer los PRDs relevantes en `docs/PRD/` → entender la arquitectura actual. Guardar en Engram si se aprende algo nuevo:
   ```
   mem_save title="[PRD leído]" type="architecture" content="..."
   ```
4. Inspeccionar el código fuente en `src/` → confirmar el estado real.
5. Generar la Spec siguiendo `skills/spec-writer/SKILL.md` y su plantilla.
6. Guardar en `docs/specs/active/spec-{NNN}-{slug}/Spec-{NNN}_{Titulo}.md`.

**Numeración**: escanear `docs/specs/` (active + completed) y usar el siguiente número disponible.

---

### STOP 1 — Validación de Spec

La IA presenta la Spec y **se detiene**. El usuario revisa:
- ¿El análisis de impacto es correcto?
- ¿Las intervenciones cubren todo lo necesario?
- ¿Los criterios de verificación son los adecuados?

**Si pide cambios** → modificar Spec y volver a presentar.
**Si aprueba** → pasar a Fase 2.

---

### FASE 2 — Implementación

La IA ejecuta todo esto sin detenerse:

1. Leer la Spec aprobada.
2. Implementar cada intervención en el código fuente.
3. Aplicar las reglas técnicas de `REGLAS_TECNICAS.md`.
4. Auto-verificar contra los criterios de verificación de la Spec (revisión de código, no ejecución).
5. Si se modificaron formularios (`.form.txt`), generar el Informe de Cambios UI (ver sección 3).

La IA presenta al usuario:

```
Módulos modificados:
- src/classes/Archivo1.cls
- src/modules/Archivo2.bas

[Si aplica: Informe de Cambios UI]
```

---

### STOP 2 — Validación en Access

La IA **se detiene y espera**. El usuario:
1. Copia los módulos a su proyecto VBA/Access.
2. Compila y prueba.
3. Responde con uno de:
   - `VALIDADO EN ACCESS: Spec-XXX` → ir a Fase 4 (Cierre).
   - Descripción de un gap → ir a Fase 3 (Iteración).

---

### FASE 3 — Iteración por gaps

Si el usuario reporta un gap:

1. Documentar el gap en la sección de Gaps de la Spec existente.
2. Guardar el gap en Engram:
   ```
   mem_save title="Gap Spec-XXX: [descripción breve]" type="bugfix" content="[causa + corrección]"
   ```
3. Analizar la causa y proponer la corrección.
4. Implementar la corrección.
5. Auto-verificar.
6. Presentar módulos modificados adicionales.
7. Volver al **STOP 2**.

Repetir hasta recibir `VALIDADO EN ACCESS: Spec-XXX`.

---

### FASE 4 — Cierre

**Trigger único**: `VALIDADO EN ACCESS: Spec-XXX`

> Si el usuario no incluye el número de Spec, preguntar cuál antes de proceder.

La IA ejecuta **todos estos pasos en orden sin detenerse**:

| Paso | Acción |
|------|--------|
| 1 | **Archivar Spec**: actualizar estado a `✅ VALIDADO EN ACCESS` y mover carpeta de `active/` a `completed/`. |
| 2 | **Crear o actualizar PRD**: seguir `skills/prd-writer/SKILL.md`. Si no existe el PRD del módulo, crearlo. Si existe, actualizarlo con los cambios de la Spec. |
| 3 | **Actualizar DEUDA_TECNICA.md**: copiar hallazgos de la sección 12 del PRD. Si la Spec resuelve hallazgos previos, marcarlos como `Resuelto: Spec-XXX`. |
| 4 | **Revisar DISCOVERY_MAP**: si hay archivos o módulos nuevos, actualizar el mapa. Si no, indicarlo en el checklist. |
| 5 | **Registrar en Diario**: añadir entrada **AL PRINCIPIO** de `Diario_Sesiones.md` usando `diario_template.md`. **NUNCA borrar contenido previo.** |
| 6 | **Guardar en Engram**: ejecutar `mem_save` con el resumen de la Spec (decisiones clave, cambios arquitectónicos, lecciones aprendidas). Usar type: `bugfix`, `architecture` o `lesson-learned` según corresponda. |
| 7 | **Cerrar sesión en Engram**: ejecutar `mem_session_summary` con formato Goal/Discoveries/Accomplished/Files. **Obligatorio. No omitir.** |
| 8 | **Imprimir checklist de cierre** (obligatorio). |

#### Checklist de cierre (OBLIGATORIO — sin este checklist el cierre no es válido)

```
## Checklist de Cierre — Spec-XXX
- [ ] Spec archivada en docs/specs/completed/
- [ ] Estado actualizado a ✅ VALIDADO EN ACCESS
- [ ] PRD creado/actualizado → [archivo + resumen de cambios]
- [ ] DEUDA_TECNICA.md actualizado → [hallazgos añadidos / resueltos / sin cambios]
- [ ] DISCOVERY_MAP revisado → [actualizado: qué / sin impacto: justificación]
- [ ] Diario actualizado (entrada AL PRINCIPIO, sin borrar contenido previo)
- [ ] mem_save ejecutado → [title + type usado]
- [ ] mem_session_summary ejecutado → [Goal / Discoveries / Accomplished / Files]
```

**REGLA ANTI-OMISIÓN**: Si algún paso no aplica, marcarlo como "N/A" con justificación. Nunca omitirlo silenciosamente.

---

## Informe de Cambios UI

Obligatorio cuando se modifica un archivo `.form.txt`. Aparece en dos sitios: dentro de la Spec (sección permanente) y en la respuesta al usuario (junto a los módulos modificados).

```markdown
## Informe de Cambios UI

### Formulario: frmNombreFormulario

**Controles añadidos:**
| Control | Tipo | Propiedades clave |
|---------|------|-------------------|
| `cmdNuevoBoton` | CommandButton | Caption="Guardar", Left=1200, Top=3400, Width=2000 |

**Controles modificados:**
| Control | Propiedad | Antes | Después |
|---------|-----------|-------|---------|
| `cmdGuardar` | Visible | True | False |

**Controles eliminados:**
| Control | Tipo | Motivo |
|---------|------|--------|
| `cmdObsoleto` | CommandButton | Reemplazado por flujo web |

**Instrucciones para el usuario:**
1. Abrir `frmNombreFormulario` en vista Diseño.
2. [Instrucciones paso a paso de lo que debe hacer manualmente.]
```

---

## Principios de conducta

1. **Engram primero**: antes de leer cualquier fichero, buscar en Engram. El conocimiento ya aprendido no se re-aprende.
2. **Analizar antes de especificar**: consultar DISCOVERY_MAP y PRDs antes de escribir la Spec.
3. **Especificar antes de implementar**: no tocar código hasta que el usuario apruebe la Spec.
4. **No sobreingeniería**: resolver exactamente lo que pide la historia de usuario.
5. **Dos STOPs, no más**: validación de Spec y validación en Access.
6. **Auto-verificar**: tras implementar, revisar que el código cumple cada criterio de la Spec.
7. **Trazabilidad total**: historia de usuario → Spec → código → PRD → Engram → Diario.
8. **No ejecutar importación**: entregar la lista de módulos; el usuario los importa manualmente.
9. **Informar cambios UI**: si se toca un `.form.txt`, siempre generar el informe detallado.
10. **Cerrar siempre en Engram**: `mem_session_summary` es obligatorio al finalizar. Sin él, la próxima sesión empieza ciega.