---
name: sdd-protocol
description: >
  Activar cuando el usuario describe una historia de usuario, bug o mejora,
  o cuando dice "modo SDD", "nueva spec", "quiero implementar", "crea una spec",
  o cuando envía el trigger de cierre "VALIDADO EN ACCESS: Spec-XXX".
  Este skill orquesta el flujo completo: análisis → spec → implementación → cierre.
  NO activar para preguntas genéricas sobre VBA o Access que no sean cambios
  concretos al proyecto activo.
---

# SDD Protocol — Spec-Driven Development V4.0

## Rutas del proyecto

Esta skill NO tiene rutas hardcodeadas. Leer `references/project_context.md`
para obtener las rutas reales antes de ejecutar cualquier fase.

Rutas estándar (confirmar en `project_context.md`):

| Recurso | Ruta estándar |
| :--- | :--- |
| DISCOVERY_MAP | `docs/DISCOVERY_MAP.md` |
| PRDs | `docs/PRD/` |
| Modelo de datos (ERDs) | `docs/ERD/` — un archivo `.md` por cada `*_Datos.accdb` (backend propio + backends vinculados). Leer **todos** los ERDs presentes para tener el modelo completo. |
| Specs activas | `docs/specs/active/` |
| Specs completadas | `docs/specs/completed/` |
| Skill spec-writer | `{SKILLS_DIR}/spec-writer/SKILL.md` |
| Plantilla Spec | `{SKILLS_DIR}/spec-writer/references/spec_template.md` |
| Skill prd-writer | `{SKILLS_DIR}/prd-writer/SKILL.md` |
| Plantilla PRD | `{SKILLS_DIR}/prd-writer/references/prd_template.md` |
| Skill diario-sesion | `{SKILLS_DIR}/diario-sesion/SKILL.md` |
| Plantilla Diario | `{SKILLS_DIR}/diario-sesion/references/diario_template.md` |
| Deuda Técnica | `docs/DEUDA_TECNICA.md` |
| Diario de Sesiones | `docs/Diario_Sesiones.md` |
| Rule calidad Engram | `{RULES_DIR}/engram-memory-quality.md` |

---

## Flujo principal — 4 fases, 2 STOPs

### INICIO DE SESIÓN (siempre, antes de cualquier fase)

```
1. mem_session_start
2. mem_context
```

Esto recupera el estado de sesiones anteriores: specs en curso, decisiones tomadas,
gaps pendientes. Si hay una Spec activa en Engram, retomarla desde donde se dejó
sin pedir al usuario que repita el contexto.

---

### FASE 1 — Análisis y generación de Spec

**Trigger:** el usuario describe lo que quiere (historia de usuario, bug, mejora).

La IA ejecuta todo esto sin detenerse:

1. Buscar en Engram antes de leer ningún fichero:
   ```
   mem_search "[módulo o área afectada]"
   mem_search "[término clave de la historia de usuario]"
   ```
   Si Engram tiene contexto suficiente → usarlo directamente.
   Solo ir a los ficheros si Engram no lo cubre.

2. Leer `docs/DISCOVERY_MAP.md` → localizar módulos y archivos físicos afectados.
   Leer **todos los ERDs** en `docs/ERD/` para tener el modelo de datos completo
   (incluye el backend propio del proyecto y los backends vinculados de otros sistemas).

3. Verificar que el módulo afectado tiene PRD en `docs/PRD/`.
   - Si no tiene PRD → activar `prd-writer` para crearlo antes de continuar.
   - Si tiene PRD → leerlo para entender la arquitectura actual.
   - Si se aprende algo nuevo del PRD que no está en Engram:
     ```
     mem_save
       title: "[hallazgo del PRD] — [módulo]"
       type: "architecture"
       content: What/Why/Where/Learned
     ```

4. Inspeccionar el código fuente en `src/` solo si el PRD no es suficiente.

4b. **Detectar si la historia es una Epic** — si el análisis revela que la historia afecta a
    **más de 3 módulos distintos** o tiene **más de 5 intervenciones independientes**, presentar
    al usuario:

    ```
    Esta historia de usuario es amplia y puede beneficiarse de un Plan de Actuación.
    ¿Prefieres:
    A) Una sola Spec completa (flujo normal)
    B) Un Plan de Actuación con múltiples Specs coordinadas
    ```

    - Si elige **A** → flujo normal, continuar en paso 5.
    - Si elige **B** → activar `{SKILLS_DIR}/plan-writer/SKILL.md` para generar el Plan
      antes de crear las Specs individuales. Seguir las instrucciones de plan-writer.

5. Generar la Spec siguiendo `{SKILLS_DIR}/spec-writer/SKILL.md` y su plantilla.

6. Guardar en `docs/specs/active/spec-{NNN}-{slug}/Spec-{NNN}_{Titulo}.md`.

**Numeración:** escanear `docs/specs/` (active + completed) y usar el siguiente número disponible.

7. **Crear rama Git**: indicar al usuario que ejecute:
   ```
   dysflow spec {NNN}
   ```
   Esto crea la rama `spec-{NNN}-{slug}` en GitHub desde `develop`.
   El usuario debe ejecutarlo antes de pasar a implementación.

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
3. Aplicar las convenciones de código de `references/project_context.md`.
4. Auto-verificar contra los criterios de verificación de la Spec
   (revisión de código, no ejecución real).
5. Si se modificaron formularios (`.frm.txt`) → generar Informe de Cambios UI (ver más abajo).

Presentar al usuario:

```
Módulos modificados:
- src/clases/Archivo1.cls
- src/modulos/Archivo2.bas

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
2. Guardar en Engram **antes de corregir** (aplicar `{RULES_DIR}/engram-memory-quality.md`):
   ```
   mem_save
     title: "Gap Spec-XXX: [descripción breve] — [módulo]"
     type: "bugfix"
     content:
       What: descripción exacta del gap
       Why: causa raíz identificada
       Where: archivo y método concreto
       Learned: qué condición lo provocaba
   ```
3. Analizar la causa raíz y proponer la corrección.
4. Implementar la corrección.
5. Auto-verificar.
6. Presentar módulos modificados adicionales.
7. Volver al **STOP 2**.

Repetir hasta recibir `VALIDADO EN ACCESS: Spec-XXX`.

---

### FASE 4 — Cierre

**Trigger único:** `VALIDADO EN ACCESS: Spec-XXX`

> Si el usuario no incluye el número de Spec, preguntar cuál antes de proceder.

La IA ejecuta **todos estos pasos en orden sin detenerse:**

| Paso | Acción |
| :--- | :--- |
| 1 | **Archivar Spec**: actualizar estado a `✅ VALIDADO EN ACCESS` y mover carpeta de `active/` a `completed/` |
| 2 | **Crear o actualizar PRD**: seguir `{SKILLS_DIR}/prd-writer/SKILL.md`. **SIEMPRE aplica**, incluso en refactorings internos. Si no hay cambios funcionales, actualizar la sección de última actualización del PRD afectado. Si no existe PRD del módulo, crearlo. |
| 3 | **Actualizar DEUDA_TECNICA.md**: copiar hallazgos de la Sección 13 del PRD. Si la Spec resuelve hallazgos previos, marcarlos como `Resuelto: Spec-XXX`. |
| 4 | **Revisar DISCOVERY_MAP**: si hay archivos o módulos nuevos, actualizar el mapa. Si no, indicarlo en el checklist con justificación. |
| 5 | **Registrar en Diario**: activar `{SKILLS_DIR}/diario-sesion/SKILL.md` para añadir entrada **AL PRINCIPIO** de `docs/Diario_Sesiones.md`. **NUNCA borrar contenido previo.** |
| 6 | **Guardar en Engram**: ejecutar `mem_save` aplicando `{RULES_DIR}/engram-memory-quality.md`. Usar `type: "bugfix"`, `"architecture"` o `"lesson-learned"` según corresponda. |
| 7 | **Cerrar sesión en Engram**: ejecutar `mem_session_summary` con formato Goal/Discoveries/Accomplished/Files. **Obligatorio. No omitir.** |
| 8 | **Actualizar CHANGELOG**: indicar al usuario que ejecute `dysflow changelog` para registrar los cambios en `CHANGELOG.md`. |
| 9 | **Imprimir checklist de cierre** (obligatorio — sin él el cierre no es válido). |

#### Checklist de cierre

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
- [ ] CHANGELOG actualizado → dysflow changelog (ejecutar en el proyecto)
- [ ] Release Git: ver instrucción abajo
```

**REGLA ANTI-OMISIÓN**: Si algún paso no aplica, marcarlo como "N/A" con justificación.
Nunca omitirlo silenciosamente.

#### Release Git tras cierre

Tras imprimir el checklist, preguntar al usuario:

> ¿Es esta la última spec de la release actual? Si es así, ejecuta `dysflow release`
> para hacer merge de develop → main, crear el tag `YYYY-NNN` y subir a GitHub.
>
> Si quedan más specs pendientes, continúa en `develop` con la siguiente.

---

## Informe de Cambios UI

Obligatorio cuando se modifica un archivo `.frm.txt`.
Aparece en dos sitios: dentro de la Spec (sección permanente) y en la respuesta al usuario.

```markdown
## Informe de Cambios UI

### Formulario: {NombreFormulario}

**Controles añadidos:**
| Control | Tipo | Propiedades clave |
| :--- | :--- | :--- |
| `cmdNuevoBoton` | CommandButton | Caption="Guardar", Left=1200, Top=3400, Width=2000 |

**Controles modificados:**
| Control | Propiedad | Antes | Después |
| :--- | :--- | :--- | :--- |
| `cmdGuardar` | Visible | True | False |

**Controles eliminados:**
| Control | Tipo | Motivo |
| :--- | :--- | :--- |
| `cmdObsoleto` | CommandButton | Reemplazado por nuevo flujo |

**Instrucciones para el usuario:**
1. Abrir `{NombreFormulario}` en vista Diseño en Access.
2. [Instrucciones paso a paso de lo que debe hacer manualmente.]
```

---

---

## Flujo Hotfix — Bug urgente en producción

**Trigger:** el usuario reporta un bug en producción que hay que corregir ya, sin esperar a la próxima release.

1. **Antes de generar la Spec**, indicar al usuario que ejecute:
   ```
   dysflow hotfix <nombre-descriptivo>
   ```
   Esto crea la rama `hotfix-<nombre>` desde `main` y la sube a GitHub.

2. Generar la Spec normalmente (Fase 1) con prefijo `hotfix` en el título.

3. Implementar y validar (Fases 2-3) igual que en el flujo estándar.

4. En el Cierre (Fase 4), ejecutar el checklist normal **con estas diferencias**:

   **⚠️ NO usar `dysflow release`** — ese comando fusiona `develop → main`, pero el hotfix está en `hotfix-<nombre>`, no en develop.

   En su lugar, indicar al usuario que ejecute estos pasos manualmente:
   ```bash
   # 1. Fusionar hotfix en main y taggear
   git checkout main
   git pull
   git merge hotfix-<nombre>
   dysflow next-release     # ver qué tag se usará (ej: 2026-002)
   git tag 2026-NNN         # usar el número que devolvió next-release
   git push origin main
   git push origin 2026-NNN

   # 2. Fusionar hotfix de vuelta en develop (mantener sincronizado)
   git checkout develop
   git pull
   git merge main
   git push origin develop
   ```
   El hotfix llega a `main` sin pasar por develop, y luego se fusiona en develop para no perder el fix.

---

## Principios de conducta

1. **Engram primero**: antes de leer cualquier fichero, buscar en Engram.
   El conocimiento ya aprendido no se re-aprende.
2. **PRD primero**: si el módulo afectado no tiene PRD, crearlo antes de generar la Spec.
3. **Analizar antes de especificar**: DISCOVERY_MAP → PRD → código. En ese orden.
4. **Especificar antes de implementar**: no tocar código sin Spec aprobada.
5. **No sobreingeniería**: resolver exactamente lo que pide la historia de usuario.
6. **Dos STOPs, no más**: validación de Spec y validación en Access.
7. **Auto-verificar**: tras implementar, revisar que el código cumple cada criterio de la Spec.
8. **Trazabilidad total**: historia → Spec → código → PRD → Engram → Diario.
9. **Entrega manual**: listar módulos modificados; el usuario los importa manualmente.
10. **Informe UI obligatorio**: si se toca un `.frm.txt`, siempre generar el informe detallado.
11. **Cerrar siempre en Engram**: `mem_session_summary` es obligatorio. Sin él, la próxima
    sesión empieza ciega.
12. **Guardar con criterio**: aplicar `{RULES_DIR}/engram-memory-quality.md` antes de
    cualquier `mem_save`. Un save de calidad vale más que diez de ruido.
13. **RFC para cambios de arquitectura**: si la historia implica cambios estructurales profundos
    (modelo de datos, módulos transversales, patrones de diseño), crear primero un RFC usando
    `docs/templates/rfc_template.md` antes de generar las Specs. Un RFC aprobado define el
    marco; las Specs implementan los detalles.
14. **Epics como Planes**: si una historia afecta a >3 módulos o tiene >5 intervenciones,
    ofrecer siempre el Plan de Actuación (opción B) antes de crear Specs individuales.
