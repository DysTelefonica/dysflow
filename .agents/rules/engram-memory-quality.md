# Regla: Calidad de memoria Engram

Cada `mem_save` que ejecutes es una inversión.
Si no es recuperable con `mem_search`, es ruido que degrada las búsquedas futuras.

---

## Antes de ejecutar cualquier mem_save, responde estas 3 preguntas

1. **¿Con qué términos buscaría esto la próxima sesión?**
   → Esos términos DEBEN aparecer en `title` o `content`.

2. **¿Qué no está en los PRDs ni en el código que una IA necesitaría saber?**
   → Solo eso merece guardarse. Lo que ya está en los PRDs, no.

3. **¿Es suficientemente concreto para ser accionable?**
   → "Se documentó TbEventos" NO. "IDEvento es Text(50) generado externamente, no autonumérico" SÍ.

---

## Formato obligatorio

```
title: "[Verbo concreto] [qué exactamente] — [módulo/tabla/archivo]"
type: architecture | bugfix | pattern | lesson-learned

content (formato What/Why/Where/Learned):
  What:    qué se descubrió o hizo, con nombres exactos
  Why:     por qué importa o qué riesgo evita
  Where:   archivo, tabla o método concreto (ruta relativa)
  Learned: qué debe saber la próxima sesión que NO está en los PRDs
```

**Ejemplos de títulos correctos:**
- `"FK inferida: TbActividades.IDEvento → TbEventos.IDEvento — confirmada en SQL Form_frmGestion"`
- `"Patrón: formularios instancian clase negocio en Form_Open y la destruyen en Form_Close"`
- `"Bug corregido: filtro fechas ignoraba FechaFin nula — frmGestion.cmdBuscar_Click"`
- `"PRD-03 generado: TbEventos — IDEvento es Text(50) generado externamente, no autonumérico"`

---

## Lo que hace un mem_save recuperable

- Nombres exactos de tablas, campos, clases, métodos, formularios
- FKs con formato: `TbOrigen.Campo → TbDestino.Campo`
- Firmas de métodos: `NombreClase.Metodo(ByVal x As Tipo) → Tipo`
- Valores enumerados reales: `ESTADO = 1 | 2 | 3` (no texto genérico)
- Reglas de negocio con condición + comportamiento exacto
- Números de error: `Err.Raise 1042`, no "lanza un error"
- Rutas relativas de archivos: `src/clases/Evento.cls`, no "está en src"

---

## Lo que convierte un mem_save en ruido (prohibido)

- Títulos genéricos: "PRD generado", "módulo documentado", "bug corregido"
- Contenido que duplica literalmente lo que ya está en el PRD
- Confirmaciones vacías: "el código funciona correctamente"
- Resúmenes sin datos concretos: "gestiona eventos y actividades"
- Más de un concepto distinto en un solo `mem_save`
  → Si tienes dos hallazgos diferentes, haz dos `mem_save` separados

---

## Cuándo guardar sin esperar al final del PRD

No esperes a terminar el PRD. Guarda en el momento cuando:
- Encuentras una FK inferida del código SQL
- Detectas una regla de negocio no obvia
- Ves un patrón que se repite en varios módulos
- Encuentras deuda técnica con riesgo real
- Confirmas el rol arquitectónico de una clase (repositorio / servicio / DTO)

Un hallazgo guardado a tiempo sobrevive a compactaciones.
Un hallazgo guardado al final del PRD, puede no sobrevivir.

---

## Test rápido antes de guardar

Imagina que eres una nueva sesión y ejecutas:
```
mem_search "[término clave de este save]"
```

¿Aparecería este mem_save? ¿Sería el resultado más útil?

- Si la respuesta es **SÍ** → guardar.
- Si la respuesta es **NO** → reescribe `title` y `content` antes de guardar.