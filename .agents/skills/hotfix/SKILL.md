---
name: hotfix
description: >
  Gestión de hotfixes y bugfixes en proyectos VBA/Access.
  Usar cuando el usuario reporte: "hay un bug", "error", "no funciona",
  "fix", "hotfix", "corregir", "arreglar", "problema con", "falla".
  NO usar para nuevas funcionalidades (usar sdd-protocol).
  NO usar para refactors que afecten múltiples módulos.
---

# HOTFIX — Gestión de Bugs y Correcciones

## Cuándo usar esta skill

Activa esta skill cuando el usuario reporte:
- Bugs o errores en funcionalidad existente
- Comportamiento inesperado
- Fixes urgentes
- Correcciones menores que no alteren contratos de interfaz

**No usar para:**
- Nuevas funcionalidades → usar `sdd-protocol`
- Refactors que afecten múltiples módulos → usar `sdd-protocol`

---

## Rutas del proyecto

Esta skill NO tiene rutas hardcodeadas. Leer `references/project_context.md`
para obtener las rutas reales de `src/`, `docs/PRD/` y `docs/DISCOVERY_MAP.md`.

---

## Flujo de trabajo

### Fase 1 — Análisis del bug

1. **Buscar en Engram antes de abrir ningún archivo:**
   ```
   mem_search "[síntoma del bug]"
   mem_search "[módulo o formulario afectado]"
   ```
   Si Engram devuelve causa raíz o contexto previo del mismo síntoma → usarlo directamente.
   Si no → continuar con el paso 2.

2. **Localizar el módulo afectado:**
   - Consultar `docs/DISCOVERY_MAP.md` para identificar el archivo físico.
   - Leer el PRD del módulo en `docs/PRD/` para entender el comportamiento esperado.
   - Si el módulo no tiene PRD → crear PRD con `prd-writer` antes de continuar.

3. **Leer el código fuente** solo si los pasos anteriores no resuelven el análisis:
   - Clases en `src/clases/` → lógica de negocio
   - Módulos en `src/modulos/` → acceso a datos
   - Formularios en `src/formularios/` → UI y eventos

4. **Determinar la causa raíz** con evidencia del código. No proponer soluciones sin causa raíz confirmada.

---

### Fase 2 — Propuesta de solución

5. Presentar al usuario:
   - Descripción del problema encontrado
   - Causa raíz identificada (con referencia al archivo y método exacto)
   - Solución propuesta
   - Archivos afectados

6. **Esperar validación del usuario** antes de implementar nada.

---

### Fase 3 — Implementación

7. Tras validación:
   - Modificar solo los archivos estrictamente necesarios
   - Mantener el estilo, convenciones y patrones del código circundante
   - Añadir gestión de errores si no existe (`Err.Raise` con código del proyecto)
   - Marcar el cambio con comentario: `' HOTFIX-YYYYMMDD: descripción breve`

8. No modificar transacciones existentes salvo que sea imprescindible para el fix.

---

### Fase 4 — Entrega y cierre

9. Listar los módulos modificados para que el usuario los copie manualmente:
   - Ruta relativa del archivo
   - Métodos o funciones cambiados
   - Resumen del cambio

10. **No pegar código directamente** — solo listar lo que debe copiarse.

11. Guardar en Engram aplicando `engram-memory-quality.md` antes del `mem_save`:
    ```
    mem_save
      title: "Bug corregido: [síntoma breve] — [módulo/método]"
      type: "bugfix"
      content:
        What: descripción exacta del bug y la corrección aplicada
        Why: causa raíz — por qué fallaba
        Where: archivo y método concreto (ruta relativa + línea aproximada)
        Learned: condición que lo provocaba, cómo evitarlo en el futuro
    ```

---

## Reglas de oro

- **Zero Regresiones:** un fix no debe romper funcionalidad existente.
- **Cambio mínimo:** solo lo necesario para resolver el bug, nada más.
- **Engram primero:** si el bug ya fue analizado antes, no re-analizar desde cero.
- **Validación humana antes de implementar:** nunca implementes sin aprobación.
- **Entrega manual:** el código lo copia el usuario — no ejecutar importaciones.
- **PRD primero:** si el módulo no tiene PRD, crearlo antes de tocar el código.

---

## Plantilla de respuesta

```
## 🔧 Análisis del Bug

**Reporte:** [resumen del problema reportado]

**Contexto Engram:** [si se encontró algo relevante / "sin contexto previo"]

**Ubicación:** [ruta/archivo] → [método o función exacta]

**Causa raíz:** [explicación técnica con referencia al código]

---

## ✅ Solución Propuesta

[descripción de la corrección]

**Archivos a modificar:**
- `[ruta/archivo1]` → `[NombreClase.Metodo]`
- `[ruta/archivo2]` → `[NombreModulo.Funcion]`

---

## 📋 Checklist Pre-Implementación

- [ ] Usuario validó la solución propuesta
- [ ] No se alteran contratos de interfaz
- [ ] Transacciones manejadas correctamente si aplica
- [ ] Gestión de errores presente o añadida

---
```