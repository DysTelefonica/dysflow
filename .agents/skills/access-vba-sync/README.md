# VBA Access Sync

Skill de sincronización bidireccional para proyectos Microsoft Access/VBA.

## Descripción

Permite trabajar con el código VBA de Microsoft Access como archivos de texto plano en tu editor favorito, manteniendo sincronización automática entre el código fuente y la base de datos.

### Características Principales

- **Export desatendido**: Extrae todos los módulos VBA sin ejecutar formularios de inicio ni macros AutoExec
- **Estructura organizada**: Separa automáticamente en carpetas según el tipo de módulo
- **Sincronización automática**: Detecta cambios en archivos y los importa a Access en tiempo real
- **Generación de ERD**: Exporta la estructura de la base de datos backend a Markdown
- **Sesiones persistentes**: Mantiene estado entre ejecuciones

## Requisitos

- Windows 10/11
- Microsoft Access (versión 2016 o superior recomendada)
- PowerShell 5.1+
- Node.js 18+

## Instalación

```powershell
cd access-vba-sync
npm install
```

## Estructura de Archivos Exportados

```
src/
├── modules/          # Módulos .bas
│   └── MiModulo.bas
├── classes/          # Clases .cls
│   └── MiClase.cls
└── forms/            # Formularios (dos archivos por formulario)
    ├── MiFormulario.form.txt   # UI + código completo
    └── MiFormulario.cls        # Solo código VBA
```

## Uso

### Iniciar Sesión

```powershell
node cli.js start
```

Inicia la sesión, exporta todos los módulos VBA y genera el ERD del backend.

**Flags disponibles:**
- `--access "MiBD.accdb"` - Base de datos específica (opcional, autodetecta si hay una)
- `--destination_root src` - Carpeta de destino (default: `src`)

### Watching (Sincronización Automática)

```powershell
node cli.js watch
```

Monitorea cambios en `src/` e importa automáticamente a Access al guardar.

**Flags disponibles:**
- `--access "MiBD.accdb"`
- `--destination_root src`
- `--debounce_ms 800` - Milisegundos de espera antes de importar (default: 800)

### Import Manual

```powershell
node cli.js import Modulo1 Modulo2
```

Importa módulos específicos por nombre.

### Generar ERD

```powershell
node cli.js generate-erd
```

Genera documentacion de la estructura de la base de datos backend en `docs/ERD/` por defecto.

**Flags disponibles:**
- `--backend "MiBD_Datos.accdb"` - Backend a documentar (autodetecta `*_Datos.accdb`)
- `--erd_path "docs/ERD"` - Carpeta de salida (opcional, default: `docs/ERD`)

### Estado de Sesión

```powershell
node cli.js status
```

Muestra el estado actual de la sesión.

### Finalizar Sesión

```powershell
node cli.js end
```

Cierra la sesión y restaura cualquier configuración de Access modificada.

**Flags disponibles:**
- `--auto_export_on_end false` - Desactivar export final

## Configuración de Acceso

El skill maneja automáticamente:

- **StartupForm**: Deshabilita el formulario de inicio antes de abrir
- **AutoExec**: Renombra temporalmente macros AutoExec para evitar ejecución
- **AllowBypassKey**: Asegura acceso completo a la base de datos

Al cerrar, restaura automáticamente todos estos valores.

## Integración con Trae

Este skill está diseñado para funcionar como parte del framework VBA-SDD. Para desplegar en un nuevo proyecto:

```powershell
.\deploy.ps1
```

Esto copiará el skill, generará la estructura inicial y exportará el código VBA automáticamente.

## Resolución de Problemas

### Access se abre visiblemente
- Verifica que no hay procesos de Access zombis: `Get-Process MSACCESS | Stop-Process`
- El skill debería ejecutarse con `Visible = false`

### Error al exportar formulario
- Algunos formularios con código complejo pueden fallar por errores COM
- El export continuará con los siguientes módulos

### La BD tiene contraseña
- Pasa la contraseña con: `--password "micontraseña"`

## Licencia

Uso interno - Framework VBA-SDD
