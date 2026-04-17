# No Conformidades — Guía del proyecto

## Identidad
Proyecto Microsoft Access/VBA para la gestión de no conformidades en Telefónica.
El código generado se trabaja mediante exportación a `src/` y validación posterior en Access.

## Alcance del repositorio principal
Este repositorio main debe contener solo lo imprescindible para operar y evolucionar el proyecto:

- frontend y archivos operativos de Access
- configuración necesaria
- código exportado en `src/`

La documentación funcional, técnica y metodológica vive fuera del repo main, en:

`C:\00repos\documentacion\OPENSPEC\00_No_Conformidades`

## Memoria y skills
Las memorias de Engram se exportan y centralizan en:

`C:\00repos\documentacion\.engram`

Los skills usados en este entorno son los **globales**. No deben mantenerse copias locales de skills dentro de este repositorio.

## Reglas técnicas del proyecto
1. **Zero regresiones:** lo que funciona, debe seguir funcionando.
2. **Transaccionalidad estricta:** no modificar datos críticos sin control transaccional.
3. **Workflow inmutable:** los cambios de estado deben respetar la lógica de negocio existente.
4. **Doble edición en formularios:** si se modifica un `.cls` de formulario, revisar también su `.form.txt`.
5. **UI documentada:** si se toca `.form.txt`, detallar los cambios de controles.
6. **Sin ruido metodológico en main:** no añadir aquí specs, PRDs, templates o reglas de proceso.
7. **Regla de VB_Attributes en formularios (importación a Access):** al importar un formulario a Access, el bloque `CodeBehind` en `.form.txt` exige los 4 atributos VBA justo después, antes de `Option Compare Database`:

```
CodeBehind
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = True
Attribute VB_PredeclaredId = True
Attribute VB_Exposed = False
Option Compare Database
```

Si falta alguno, Access rejecciona el import con: `Error en la línea N. Esperado: Fin de archivo. Encontrado: CodeBehind.`

Verificación: ejecutar `temp_check_forms.ps1` del skill `access-query` antes de importar.
