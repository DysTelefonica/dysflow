# {NOMBRE_PROYECTO} — Project Context

> Este archivo es leído por la skill `prd-writer` antes de generar cualquier PRD.
> Contiene todo el vocabulario específico del proyecto para que la skill pueda
> operar sin rutas ni convenciones hardcodeadas.

---

## 1. Rutas del proyecto

| Recurso | Ruta |
| :--- | :--- |
| Código fuente — formularios | `src/formularios/` |
| Código fuente — clases | `src/clases/` |
| Código fuente — módulos | `src/modulos/` |
| PRDs | `docs/PRD/` |
| DISCOVERY_MAP | `docs/DISCOVERY_MAP.md` |
| DEUDA_TECNICA | `docs/DEUDA_TECNICA.md` |
| Diario de sesiones | `docs/Diario_Sesiones.md` |
| Plantilla PRD | `.trae/skills/prd-writer/references/prd_template.md` |
| Modelo de datos | `references/Estructura_Datos.md` |
| Specs activas | `docs/specs/active/` |
| Specs completadas | `docs/specs/completed/` |

---

## 2. Stack tecnológico

| Elemento | Valor |
| :--- | :--- |
| Lenguaje | VBA |
| Base de datos principal | {nombre}.accdb |
| Bases de datos adicionales | {nombre_backend}.accdb, {nombre_externa}.accdb |
| Motor de datos | DAO |
| Entorno | Microsoft Access {versión} |

---

## 3. Tabla de tipos de base de datos

Usar esta tabla para traducir códigos numéricos a tipos legibles en los PRDs.
**Nunca documentar el código numérico crudo en una tabla de campos.**

| Código | Tipo Access | Notas |
| :--- | :--- | :--- |
| 1 | Boolean (Sí/No) | — |
| 3 | Integer | 2 bytes, rango -32768 a 32767 |
| 4 | Long Integer | 4 bytes, usado para PKs autonuméricas |
| 6 | Single | Coma flotante simple precisión |
| 7 | Double | Coma flotante doble precisión — campos monetarios en este proyecto |
| 8 | Date/Time | Fecha y hora combinadas |
| 10 | Text(N) | Longitud máxima = valor del campo Longitud en Estructura_Datos.md |
| 12 | Memo | Texto largo sin límite práctico |

---

## 4. Convenciones de nomenclatura

### Tablas de base de datos

| Tipo | Patrón | Ejemplo |
| :--- | :--- | :--- |
| Tabla principal | `Tb` + PascalCase | `TbEventos` |
| Tabla auxiliar / staging | `TbAux` + PascalCase | `TbAuxEventos` |
| IDs de entidad | `ID` + NombreEntidad singular | `IDEvento`, `IDActividad` |

### Código VBA

| Elemento | Patrón | Ejemplo |
| :--- | :--- | :--- |
| Clases | PascalCase | `Usuario`, `Evento` |
| Módulos | PascalCase + `.bas` | `Constructor.bas` |
| Formularios (archivo código) | `Form_` + nombre + `.cls` | `Form_FormEventoGestion.cls` |
| Formularios (archivo controles) | nombre + `.frm.txt` | `FormEventoGestion.frm.txt` |
| Funciones públicas | PascalCase | `ObtenerEvento` |
| Variables locales | camelCase | `idEventoActual` |
| Constantes | UPPER_SNAKE_CASE | `MAX_REINTENTOS` |

### Controles de formulario

| Prefijo | Tipo de control |
| :--- | :--- |
| `btn` | CommandButton |
| `txt` | TextBox |
| `cmb` | ComboBox |
| `lst` | ListBox |
| `lbl` | Label |
| `frm` | SubForm |

---

## 5. Arquitectura del proyecto

### Capas

| Capa | Ubicación | Responsabilidad |
| :--- | :--- | :--- |
| UI | `src/formularios/` | Formularios Access, eventos de usuario |
| Negocio | `src/clases/` | Lógica de negocio, validaciones, cálculos |
| Datos | `src/modulos/` | Acceso a BD via DAO, SQL, repositorios |

### Patrón general
```
Formulario (Form_X.cls)
  → instancia clase de negocio en Form_Open
  → destruye clase en Form_Close
  → llama métodos de negocio en eventos de controles
    → clase de negocio llama módulos DAO
      → módulos DAO ejecutan SQL contra BD
```

### Variables globales

| Variable | Tipo | Descripción |
| :--- | :--- | :--- |
| `{nombre}` | `{Clase}` | {descripción} |

---

## 6. Gestión de errores

| Elemento | Convención |
| :--- | :--- |
| Errores de negocio | `Err.Raise 1000+` |
| Mensajes al usuario | `MsgBox` con código `MSG-XX` |
| Logging | `Debug.Print` (sin sistema estructurado) |
| Parámetro de error en firmas | `Optional ByRef p_Error As String` |

---

## 7. Valores enumerados globales

Valores que se repiten en varias tablas y módulos del proyecto:

| Nombre | Valores posibles |
| :--- | :--- |
| {NombreEnum} | `"VALOR1"` \| `"VALOR2"` \| `"VALOR3"` |

---

## 8. Integraciones externas

| Sistema | Cómo se integra | Variable / Punto de entrada |
| :--- | :--- | :--- |
| {nombre sistema} | {descripción} | {variable o método} |

---

## 9. Notas de contexto para PRDs

Información que el generador de PRDs debe tener en cuenta para este proyecto específico:

- {nota relevante 1}
- {nota relevante 2}