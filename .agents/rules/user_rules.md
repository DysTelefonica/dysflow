# Reglas de Conducta del Agente

Estas reglas se aplican en **todas las sesiones y en todos los proyectos**, independientemente del stack, dominio o fase del proyecto.

Son reglas **globales del framework** y se encuentran en:


.agent/rules/user_rules.md


---

# 1. Inicio de sesión obligatorio

Siempre, sin excepción, al comenzar cualquier sesión:


mem_session_start
mem_context


Si Engram devuelve una **Spec activa**, el agente debe retomarla automáticamente sin pedir al usuario que repita contexto ya existente.

Nunca iniciar una sesión sin recuperar primero el estado del proyecto.

---

# 2. Orden de consulta obligatorio

Antes de abrir cualquier archivo o escribir cualquier código:


mem_search / mem_context

docs/PRD

docs/DISCOVERY_MAP.md

src/


Explicación:

- **mem_search / mem_context** → recuperar conocimiento previo.
- **PRDs** → entender arquitectura antes de modificar código.
- **DISCOVERY_MAP** → localizar módulos y dependencias.
- **src** → último recurso, solo lo necesario.

Leer código sin entender arquitectura genera inconsistencias.

---

# 3. Descubrimiento de Skills

Resolver `SKILLS_DIR` con este orden:
1. `.agents/skills/`
2. `skills/`
3. `.agent/skills/`

Cada subcarpeta dentro de `SKILLS_DIR` corresponde a **una skill independiente**.

Regla:

Antes de asumir que una habilidad no existe, el agente debe revisar el contenido de `SKILLS_DIR`.

Regla crítica:

Si la carpeta de una skill existe en `SKILLS_DIR`, el agente NO puede responder "skill no disponible"
sin leer antes `SKILLS_DIR/<skill>/SKILL.md`.


---

# 4. Prerequisito de PRD

**Sin PRD del módulo afectado, no hay Spec.  
Sin Spec, no hay código.**

Si el módulo afectado no tiene PRD:


activar prd-writer


antes de cualquier otra acción.

No hay excepciones, ni siquiera para cambios pequeños.

---

# 5. Flujo obligatorio SDD

Todo cambio debe seguir el protocolo **SDD**.

Flujo estándar:


Analizar
Spec
STOP aprobación
Implementar
Validar
Cerrar


Nunca escribir código antes de que exista una **Spec aprobada**.

---

# 6. Validación humana antes de implementar

El **STOP 1 del protocolo SDD es obligatorio**.

El agente nunca debe implementar código sin que el usuario haya aprobado explícitamente la Spec.

---

# 6.1 Entregables obligatorios para RFC y Plan

Si se activa `rfc-writer`, el RFC debe crearse como archivo en:

`docs/rfcs/RFC-{NNN}_{slug}.md`

Si se activa `plan-writer`, el plan debe crearse como archivo en:

`docs/plans/active/plan-{NNN}-{slug}/PLAN_{NNN}_{Titulo}.md`

No se considera completado si el contenido queda solo en chat.

Siempre devolver al usuario:
- ruta exacta del archivo creado
- resumen ejecutivo breve

---

# 7. Integración con Git

Cada Spec se implementa en una rama independiente.

Convención de ramas:


spec-XXX-descripcion


Ejemplo:


spec-042-fix-calculo-importes


Convención de commits:


spec-XXX: implementación
spec-XXX-fix: corrección
spec-XXX-refactor: refactor


Merge estándar:


spec branch → develop


Proceso de release:


develop → main
tag version
crear release


---

# 8. Entrega manual de código

El agente:

- entrega lista de módulos modificados
- describe cambios
- proporciona instrucciones de integración

El usuario:

- importa código en Access/VBA
- compila
- valida en entorno real

El agente **nunca ejecuta compilaciones ni importaciones automáticas**.

---

# 9. Zero regresiones

Un fix o una nueva funcionalidad **no deben romper lo que ya funcionaba**.

Antes de implementar:

- identificar módulos afectados
- revisar PRDs relacionados

Después de implementar:

- verificar criterios de la Spec
- confirmar que no hay regresiones.

---

# 10. No sobreingeniería

Resolver **exactamente** lo que pide la historia de usuario.

Si durante la implementación aparece algo adicional que parece necesario:


registrarlo como deuda técnica


pero **no implementarlo sin aprobación explícita**.

---

# 11. Calidad de memoria Engram

Antes de cualquier `mem_save` aplicar la regla:


rules/engram-memory-quality.md (o `RULES_DIR/engram-memory-quality.md`)


Guardar solo:

- decisiones técnicas
- patrones arquitectónicos
- descubrimientos relevantes
- dependencias importantes

Evitar guardar información trivial o repetida.

---

# 12. Cierre de sesión obligatorio

Al finalizar cualquier sesión ejecutar:


mem_session_summary
mem_session_end


Formato de `mem_session_summary`:


Goal
Discoveries
Accomplished
Files


Sin este resumen la próxima sesión comienza sin contexto.

---

# 13. Compactación de contexto

Si el agente detecta que el contexto se ha compactado:


mem_session_start
mem_context
mem_search "[proyecto] spec activa"


y continuar desde ese punto sin pedir al usuario repetir información.

---

# 14. Corrección de entregables

Si el usuario indica que un PRD, Spec o documento no cumple el estándar:


detener progreso

releer la skill correspondiente

releer engram-memory-quality.md

corregir el entregable

explicar exactamente qué se corrigió


Solo entonces continuar.

---

# 15. No crear placeholders vacíos

No crear archivos de documentación sin contenido real.

Ejemplos:


DISCOVERY_MAP.md
DEUDA_TECNICA.md
PRD


Deben crearse **solo cuando exista información real para documentar**.

Las estructuras vacías generan confusión en sesiones futuras.
