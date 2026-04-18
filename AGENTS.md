# No Conformidades (consolidación develop) — Reglas locales del proyecto

Este archivo define **solo reglas locales del repo de código**.

---

## access-vba-sync — Skill obligatorio para TODO desarrollo VBA

> **Al empezar cualquier proyecto Access/VBA, registrar este skill y sus reglas. Todo cambio de código VBA requiere import al binario antes de compilar.**

### quick reference

```powershell
# Ubicación del skill (global, fuera del repo)
SKILL := C:\Users\adm.DEFENSA\.config\opencode\skills\access-vba-sync\cli.js

# Formatos
node cli.js import <Módulos...>      # importar a Access (recomendado)
node cli.js import-form <Forms...>   # formularios → LoadFromText (✅)
node cli.js import-code <Forms...>   # formularios → Remove+Add (❌ evitar)
node cli.js export <Módulo>          # exportar de Access (snapshot)
node cli.js export-all               # ⚠️ MACHACA src/, solo repo vacío
node cli.js start                    # ⚠️ MACHACA src/, solo repo vacío
node cli.js sandbox                  # crear sandbox local de backends
node cli.js watch                    # auto-import al guardar archivo

# Flags
--access <archivo.accdb>   # default: autodetecta en CWD
--password <pwd>           # contraseña del frontend
```

### workflow completo

```
1. INICIAR (repo vacío, primera vez)
   node cli.js start --access NoConformidades.accdb --password dpddpd
   → Exporta TODOS los módulos a src/

2. EDITAR código en src/
   - Módulo .bas / .cls  → editar el archivo
   - Formulario           → editar SOLO el .cls (nunca el CodeBehind del .form.txt)

3. IMPORTAR a Access después de cada cambio
   # Un módulo:
   node cli.js import NCProyectoWrapper --access NoConformidades.accdb --password dpddpd

   # Múltiples módulos a la vez:
   node cli.js import Utilidades NCProyectoWrapper OtroModulo --access NoConformidades.accdb --password dpddpd

   # Un formulario:
   node cli.js import-form Form_FormNCProyecto --access NoConformidades.accdb --password dpddpd

   # Varios formularios:
   node cli.js import-form Form_FormNCProyecto Form_FormBusqueda --access NoConformidades.accdb --password dpddpd

4. COMPILAR en Access
   Abrir Access → VBE → Debug → Compile
   → Si hay errores, corregir en src/ y re-importar solo ese módulo
```

### ejemplos reales de import por lista de módulos cambiados

**Escenario**: Editaste 3 archivos y querés subirlos a Access.

```powershell
# Opción A: múltiples módulos en una línea
node cli.js import Utilidades NCProyectoWrapper OtroModulo --access NoConformidades.accdb --password dpddpd

# Opción B: formularios + módulos mezclados
node cli.js import-form Form_FormNCProyecto --access NoConformidades.accdb --password dpddpd
node cli.js import Utilidades --access NoConformidades.accdb --password dpddpd
```

### ⚠️ start y export-all — DESTRUCTIVOS, no usar si src/ tiene cambios

```
start         → Exporta TODOS los módulos a src/  ← SOBRESCRIBE TODO
export-all    → Exporta TODOS los módulos a src/  ← SOBRESCRIBE TODO
```

**CUÁNDO SÍ:**
- Repo vacío, primera vez que se configura el proyecto
- Auditar qué hay en Access (en carpeta TEMPORAL, fuera del proyecto)

**CUÁNDO NO (PÉRDIDA GARANTIZADA):**
- Ya editaron código en `src/` → ejecutar `start` lo PISAAAA

```powershell
# MAL (si ya hay cambios en src/):
node cli.js start --access NoConformidades.accdb --password dpddpd
# → Se pierden TODOS los cambios editados en src/

# BIEN (repo vacío):
node cli.js start --access NoConformidades.accdb --password dpddpd
# → Crea src/ desde cero

# BIEN (auditar Access vs src/, en carpeta temporal):
node cli.js export-all --access NoConformidades.accdb --password dpddpd --destination_root C:\tmp\audit_nc
```

### regla de formularios: código en .cls, UI en .form.txt

| Tipo de cambio | Archivo a editar | Comando |
|----------------|-------------------|---------|
| Código VBA del formulario | `src/forms/Form_X.cls` | `import-form Form_X` |
| UI / controles / layout | `src/forms/Form_X.form.txt` | `import-form Form_X` |

El handler de `import-form` sincroniza automáticamente el contenido del `.cls` en la sección `CodeBehind` del `.form.txt` ANTES de invocar `LoadFromText`. **No editar la sección CodeBehind del .form.txt a mano nunca.**

### regla de VB_Attributes en formularios

Al importar un formulario a Access, el bloque `CodeBehind` en `.form.txt` **exige** los 4 atributos VBA justo después, antes de `Option Compare Database`:

```
CodeBehind
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = True
Attribute VB_PredeclaredId = True
Attribute VB_Exposed = False
Option Compare Database
```

Si falta alguno, Access rejecciona el import con: `Error en la línea N. Esperado: Fin de archivo. Encontrado: CodeBehind.`

**El handler ya los inyecta automáticamente** si el `.cls` no los tiene. No hace falta agregarlos a mano.

### estructura de archivos

```
src/
├── modules/                    # .bas ( StdModule )
│   └── NCProyectoWrapper.bas
├── classes/                    # .cls ( ClassModule )
│   └── CUsuario.cls
└── forms/                      # .form.txt + .cls (Form)
    ├── Form_FormNCProyecto.form.txt  # UI + código (LoadFromText)
    └── Form_FormNCProyecto.cls      # Solo código (el que editás)
```

### sandbox (backends vinculados → locales)

Cuando el frontend tiene tablas vinculadas a backends remotos/de red y necesitás trabajar en local:

```powershell
node cli.js sandbox --access NoConformidades.accdb --password dpddpd
# → Copia backends al directorio del frontend
# → Revincula las tablas a los backends locales
# → Listo para probar sin tocar el original
```

### después de importar — checklist

1. ✅ Los módulos aparecen como actualizados en la salida del CLI
2. ✅ `Abre Access → VBE → Debug → Compile` → Sin errores
3. ✅ Si hay errores → Corregir en `src/`, re-importar SOLO el módulo fallido
4. ✅ Compilación OK → El cambio está cerrado

---

## Reglas locales obligatorias

1. **Documentación y OpenSpec fuera del repo de código**
   - La documentación funcional/técnica y los artefactos OpenSpec **no viven en este repo**.
   - Ubicación canonical: `C:\00repos\documentacion\OPENSPEC\00_No_Conformidades`
   - No recrear aquí estructura `docs/specs/*` como fuente de verdad.

2. **Importación obligatoria al finalizar implementación**
   - Importar módulos con `access-vba-sync` (CLI).
   - No import manual fuera del skill.

3. **Regla de formularios (repositorio)**
   - Si cambia código de formulario, actualizar en paralelo:
     - `src/forms/<Form>.cls`
     - `src/forms/<Form>.form.txt`

4. **Alineación documental al cierre**
   - Si una tarea impacta documentación, alinear el contenido en:
     - `C:\00repos\documentacion\OPENSPEC\00_No_Conformidades`
   - Este repo de código no es la fuente de verdad documental.

5. **Regla de continuaciones de línea en VBA (límite de import)**
   - VBA impone un límite de aproximadamente **20-25 continuaciones de línea** (`& _`) encadenadas en una misma sentencia.
   - Si se excede, `VBAManager.ps1` (via `Import-VbaModule`) falla con: `Demasiadas continuaciones de línea`.
   - **Evitar**: constantes `String` multilínea con muchas `& vbCrLf & _`.
   - **Solución**: usar una función `GetCSS_XYZ()` que construya el string con concatenación simple (`&`) sin continuaciones, o partir en múltiples constantes privadas más pequeñas.

---

## Contexto técnico mínimo

- Stack: Microsoft Access + VBA + DAO
- Arquitectura: Formulario → ViewModel → Servicio → Repositorio
- Frontend: `NoConformidades.accdb`
- Backend: `NoConformidades_Datos.accdb`