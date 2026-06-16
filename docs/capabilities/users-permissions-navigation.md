# Capacidad: usuarios, permisos y navegación

## §0 Identidad
- **ID de capacidad**: `CAP-USERS-PERMS-NAV`
- **Tier**: critical
- **Estado**: active / inventario documental inicial
- **Source**: reverse-engineered
- **Responsable / autoridad de producto**: Pendiente de confirmación — administración de aplicación
- **Última verificación**: 2026-06-15 mediante inspección estática; no se ejecutó Dysflow/Access
- **Confianza global**: mixta — reglas básicas visibles en código; matriz completa pendiente

## §1 Intención de negocio
- **Propósito**: Controlar qué usuarios acceden a menús, altas, configuración, vistas de proyecto/auditoría e indicadores, y ofrecer navegación entre dominios.
- **Usuarios / perfiles**: Administradores, calidad, técnicos, secretaría/economía si procede, usuarios sin acceso y revisores UAT.
- **Problema que resuelve**: Evita que acciones sensibles se ejecuten por perfiles no autorizados y hace reproducible el recorrido de la aplicación.
- **Valor de negocio / por qué existe**: La aplicación contiene flujos críticos; navegación y permisos deben ser explícitos para evitar regresiones de seguridad.
- **No-objetivos**: No sustituye a una matriz de IAM corporativa ni define autenticación fuera de Access.
- **Origen de la intención**: Código exportado; reglas de producto pendientes.
- **Referencia de tracker de origen**: Issue #67; tests de rutas/backend y cache readiness como evidencia adyacente.

## §2 Contrato de comportamiento

### Escenarios (Dado / Cuando / Entonces)
- **DADO** que el usuario abre el menú principal **CUANDO** elige Parte de Proyectos o Auditorías **ENTONCES** se abre el menú de dominio correspondiente.
- **DADO** que un usuario técnico intenta crear NC Proyecto, Auditoría o NC Auditoría **CUANDO** ejecuta la acción de alta **ENTONCES** la acción se bloquea con “No tiene autorización para esa acción”.
- **DADO** que un usuario abre el menú en modo pruebas **CUANDO** es administrador **ENTONCES** la cinta puede mostrarse; si no, se oculta.
- **DADO** que un técnico abre gestión de NC Proyecto **CUANDO** se precarga el listado **ENTONCES** se filtra por `ResponsableTelefonica = m_ObjUsuarioConectado.Nombre`.
- **DADO** que un usuario no técnico abre gestión de NC Auditoría **CUANDO** se precarga el listado **ENTONCES** se filtra por `RESPONSABLEIMPLANTACION = m_ObjUsuarioConectado.Nombre`.

> **Precondición transversal**: cualquier prueba runtime de BR-UPN-* requiere backend y caché en estado seguro. Ver `configuration-backends-runtime` (BR-CFG-5 `AssertSafeBackendForCatalogBootstrap` y BR-CFG-6 auditoría de routing/kill-switch/indicadores) antes de ejecutar suites contra `TbUsuariosAplicaciones` o `m_ObjUsuarioConectado`. Sin esa precondición, las pruebas de permisos pueden ejecutarse contra un backend inseguro.

### Reglas de negocio
| ID regla | Enunciado (pretendido) | Autoridad | ¿Aplicada en código? | Prueba | Confianza |
|---|---|---|---|---|---|
| BR-UPN-1 | El menú principal enruta a Proyecto y Auditorías mediante formularios dedicados. | Código exportado | Sí — `Form_Form0BDOpciones.cls:15` (`DoCmd.OpenForm "Form0BDOpcionesParteProyectos"`) y `Form_Form0BDOpciones.cls:71` (`DoCmd.OpenForm "Form0BDOpcionesAuditorias"`) | FALTA → crear mediante `access-vba-tdd` como contrato de navegación/cableado (sin UI) | Verified-static |
| BR-UPN-2 | Usuario técnico no puede ejecutar altas sensibles de Proyecto/Auditoría. | Código exportado | Sí — checks `EsTecnico = EnumSino.Sí` en `Form_Form0BDOpcionesParteProyectos.cls:46,104,142` y `Form_Form0BDOpcionesAuditorias.cls:50,168,265`; también `Form_Form0BDTecnicos.cls:124` | FALTA → crear mediante `access-vba-tdd` con fixtures de `TbUsuariosAplicaciones` + inyección de `m_ObjUsuarioConectado` y asserts sobre mensaje de autorización | Verified-static |
| BR-UPN-3 | Solo administrador ve Ribbon en modo pruebas; en uso normal se oculta. | Código exportado | Sí — `EsAdministrador = EnumSino.Sí` combinado con `PermisoPruebas` en `Form_Form0BDOpciones.cls:115,132`; `PermisoPruebas` declarado en `src/classes/Usuario.cls:36` | FALTA → crear mediante `access-vba-tdd` con coste vía stub de `m_ObjUsuarioConectado` y asserts sobre visibilidad de Ribbon | Verified-static |
| BR-UPN-4 | La gestión de Proyecto precarga NC abiertas y filtra al técnico por su nombre. | Código exportado | Sí — `Form_Form0BDOpcionesParteProyectos.cls:142-143` filtra `Forms("FormNCProyectoGestion").ResponsableTelefonica = m_ObjUsuarioConectado.Nombre` | FALTA → crear mediante `access-vba-tdd` con fixtures de NC y asserts sobre `ResponsableTelefonica` precargado | Verified-static |
| BR-UPN-5 | La gestión de Auditoría precarga NC abiertas y filtra responsable de implantación para no técnicos. | Código exportado | Sí — `Form_Form0BDOpcionesAuditorias.cls:140-141` filtra `Forms("FormNCAuditoriaGestion").RESPONSABLEIMPLANTACION = m_ObjUsuarioConectado.Nombre` | FALTA → crear mediante `access-vba-tdd` con fixtures de NC de auditoría y asserts sobre el filtro | Verified-static |
| BR-UPN-6 | Roles calculados de usuario: 7 flags `EsUsuario*` (`Administrador`, `Calidad`, `Economia`, `Secretaria`, `Tecnico`, `SinAcceso`, `CalidadAvisos`) en `UsuarioAplicacionPermisos` + `PermisoPruebas` en `Usuario` (8 flags/permisos calculados totales). | Código exportado | Sí — `src/classes/UsuarioAplicacionPermisos.cls:15-21` (7 flags `EsUsuario*`) y `src/classes/Usuario.cls:36` (`PermisoPruebas`) | FALTA → crear mediante `access-vba-tdd` con fixtures de permisos por rol, asserts sobre cada `*Calculado` y `PermisoPruebas` | Verified-static |
| BR-UPN-7 | La matriz completa de permisos por acción sensible (cerrar/eliminar/rehabilitar/documento/acción/informe/configuración) está aprobada por producto. | Producto pendiente | Desconocido | FALTA → crear mediante `access-vba-tdd` tras confirmar matriz; misma matriz referenciada por `cross-cutting-support` BR-XCUT-6 | Intended |

> **Estado de cobertura runtime**: a la fecha de esta revisión (2026-06-15) **no existe ningún manifest de pruebas** (`tests/tests.vba*.json`) que cubra permisos, roles calculados, navegación de menús ni bloqueo por rol. Cualquier afirmación `Verified-runtime` para BR-UPN-1..6 está **fuera de alcance** hasta que se creen las pruebas con `access-vba-tdd` (schema-first, fixtures deterministas de `TbUsuariosAplicaciones`, inyección controlada de `m_ObjUsuarioConectado`, asserts sobre mensajes de formulario y estados de control). Ver también `cross-cutting-support` §2 BR-XCUT-6 y §5 sobre la ausencia de manifest dedicado.

### Validaciones
- Usuario técnico bloqueado en altas sensibles.
- Usuario sin permiso de administración no debe acceder a configuración sensible.
- La navegación de menús debe cerrar/abrir formularios de dominio de forma predecible.
- Cualquier regla de permisos no leída en código queda como obligación abierta.

### Transiciones de estado
- `Menú principal` --(`Parte Proyecto`)--> `Menú Proyecto`.
- `Menú principal` --(`Auditorías`)--> `Menú Auditorías`.
- `Técnico` --(`Alta NC/Alta auditoría`)--> `Acción bloqueada`.
- `Administrador en pruebas` --(`Abrir menú`)--> `Ribbon visible`.

### Casos límite y de error
- `m_ObjUsuarioConectado` ausente rompería filtros/captions; necesita pruebas de arranque o guardas.
- El comportamiento de “usuario sin acceso” existe como rol, pero no se ha inventariado dónde bloquea navegación.

### Señales de aceptación / presencia
- Menús abren los formularios correctos y aplican filtros iniciales.
- Las acciones sensibles tienen pruebas de rol positivo y negativo.
- La matriz de permisos queda documentada con `Verified-runtime` solo tras pruebas.

## §3 Mapa de implementación
- **Puntos de entrada de UI**: `Form_Form0BDOpciones`, `Form_Form0BDOpcionesParteProyectos`, `Form_Form0BDOpcionesAuditorias`, `Form_Form0BDTecnicos`.
- **Puntos de entrada de código**: `Usuario`, `UsuarioAplicacionPermisos`, helpers/globales `EsTecnico`, `EsAdministrador`, `m_ObjUsuarioConectado`, `Entorno.TituloUsuarioConectado`.
- **Datos afectados**: `TbUsuariosAplicaciones`, permisos de aplicación, tablas exactas de permisos pendientes de esquema.
- **Salidas**: formularios abiertos/cerrados, filtros iniciales, mensajes de autorización, Ribbon visible/oculta.
- **Dependencias e integraciones**: todas las capacidades de dominio.
- **Sincronización fuente↔binario**: no comprobada; tarea solo documental.
- **Valoración de diseño**: navegación y permisos están acoplados a formularios/globales. Para web deben convertirse en rutas, guards y permisos de dominio explícitos.

## §4 Receta de reconstrucción
1. Confirmar matriz de permisos por acción y rol.
2. Inspeccionar esquema de usuarios/permisos antes de fixtures.
3. Crear pruebas de rol calculado y de bloqueo/autorización por comando sensible.
4. Crear pruebas de navegación de menús como contrato de formulario/costura, sin automatización UI innecesaria.
5. Registrar cada nueva regla en esta página y en la matriz de huecos.

## §5 Evidencia y trazabilidad
- **Tests**: **no se localizó manifest dedicado a navegación/permisos/roles**. Búsqueda en `tests/tests.vba*.json` (todos los manifests) no devuelve ninguna coincidencia para `permisos`, `EsTecnico`, `EsAdministrador`, `PermisoPruebas`, `UsuarioAplicacionPermisos`, `TbUsuariosAplicaciones`, `ResponsableTelefonica` ni `RESPONSABLEIMPLANTACION`. La única evidencia adyacente está en pruebas de backend/configuración (`tests.vba.e2e.json`, `tests.vba.cache-readiness.json`) y en manifests de formularios helper. Cualquier promoción a `Verified-runtime` para BR-UPN-1..6 está bloqueada hasta que se creen las pruebas mediante `access-vba-tdd` con schema-first, fixtures deterministas de `TbUsuariosAplicaciones`, inyección controlada de `m_ObjUsuarioConectado` y asserts sobre mensajes/estados de formulario.
- **Precondición para ejecutar pruebas de permisos**: ver `configuration-backends-runtime` BR-CFG-5 (`AssertSafeBackendForCatalogBootstrap`) y BR-CFG-6 (auditoría de routing/kill-switch/indicadores) — sin esa base, las pruebas de BR-UPN-* pueden ejecutarse contra un backend inseguro.

| Elemento | Ref. tracker | Versión de staging (UAT) | Estado UAT | Release de producción | Fecha en producción | Nota |
|---|---|---|---|---|---|---|
| Navegación Proyecto/Auditoría | Issue #67 | Pendiente | pending | Pendiente | Pendiente | Falta prueba de contrato. Cableado visible en `src/forms/Form_Form0BDOpciones.cls:15,71`. |
| Bloqueo a técnico en altas | Pendiente | Pendiente | pending | Pendiente | Pendiente | Visible en código; falta prueba. Requiere `m_ObjUsuarioConectado` inyectable. |
| Roles calculados (7 + `PermisoPruebas`) | Pendiente | Pendiente | pending | Pendiente | Pendiente | Visible en `UsuarioAplicacionPermisos.cls:15-21` y `Usuario.cls:36`; falta prueba. |
| Matriz completa de permisos | Pendiente | Pendiente | pending | Pendiente | Pendiente | Falta confirmación de producto. Cross-link: `cross-cutting-support` BR-XCUT-6. |

| Síntoma | Causa probable | Comprobación (Dysflow) | Ancla del documento |
|---|---|---|---|
| Técnico puede crear NC | Regresión de guard de permisos | Crear prueba de bloqueo de alta con fixtures de `TbUsuariosAplicaciones` | BR-UPN-2 |
| Menú abre dominio incorrecto | Cableado de navegación roto | Crear prueba de navegación/costura (sin UI) | BR-UPN-1 |
| Usuario ve datos de otro responsable | Filtro inicial por rol roto | Crear prueba de precarga por rol con NC de fixture | BR-UPN-4..5 |
| Ribbon visible para no-admin | Regresión de `PermisoPruebas` | Crear prueba de visibilidad con stub de usuario | BR-UPN-3 |
| Rol calculado devuelve valor incorrecto | Regresión de `*Calculado` o `PermisoPruebas` | Crear prueba de `UsuarioAplicacionPermisos` con permisos forzados | BR-UPN-6 |

## §6 Notas de migración web

### §6.1 Conservar (comportamiento de negocio que debe sobrevivir)
- El menú principal enruta a Proyecto y Auditorías mediante formularios dedicados (BR-UPN-1): la web debe traducir cada opción de menú a una ruta explícita (`/proyectos`, `/auditorias`), con guard de rol y guard de dominio.
- El usuario técnico no puede ejecutar altas sensibles de Proyecto/Auditoría (BR-UPN-2): la API REST de alta debe devolver `403` con mensaje explícito ("No tiene autorización para esa acción") cuando el usuario tiene `EsTecnico = Sí`. El mensaje debe ser el mismo que ya muestra `Form_Form0BDOpcionesParteProyectos.cls:46,104,142`.
- Solo administrador ve Ribbon en modo pruebas; en uso normal se oculta (BR-UPN-3): la web debe mantener la regla "modo pruebas ⇒ admin visible" y "modo normal ⇒ oculto para no-admin", con `PermisoPruebas` como flag de autorización.
- La gestión de Proyecto precarga NC abiertas y filtra al técnico por su nombre (BR-UPN-4): el endpoint de gestión de Proyecto debe aplicar el filtro `ResponsableTelefonica = usuario.Nombre` por defecto, sin permitir que el técnico vea NC de otro responsable.
- La gestión de Auditoría precarga NC abiertas y filtra responsable de implantación para no técnicos (BR-UPN-5): el endpoint de gestión de Auditoría debe aplicar el filtro `RESPONSABLEIMPLANTACION = usuario.Nombre` por defecto para no técnicos.
- Los 7 flags `EsUsuario*` (`Administrador`, `Calidad`, `Economia`, `Secretaria`, `Tecnico`, `SinAcceso`, `CalidadAvisos`) en `UsuarioAplicacionPermisos` + `PermisoPruebas` en `Usuario` (BR-UPN-6): la web debe seguir exponiendo los mismos 8 flags/permisos calculados, como atributos del claim/token del usuario.
- La matriz completa de permisos por acción sensible (cerrar/eliminar/rehabilitar/documento/acción/informe/configuración) está aprobada por producto (BR-UPN-7): la web debe poder consumir esa matriz desde un único servicio de autorización, no como checks dispersos.

### §6.2 Transformar (mecanismo legacy que se reformula)
- Sustituir `Form_Form0BDOpciones`, `Form_Form0BDOpcionesParteProyectos`, `Form_Form0BDOpcionesAuditorias`, `Form_Form0BDTecnicos` por un menú web declarativo con rutas, guards y permisos; no replicar la cinta (Ribbon) Access.
- Convertir `Usuario` y `UsuarioAplicacionPermisos` en un servicio de identidad + autorización: el primero resuelve la identidad desde un token, el segundo aplica la matriz de permisos.
- Reemplazar el patrón de inyección de `m_ObjUsuarioConectado` por middleware de autenticación/autorización en la capa de aplicación, no por una variable global mutada al inicio.
- Mover los 7 flags `EsUsuario*` y `PermisoPruebas` a claims del JWT/token del usuario, no como propiedades de un objeto VBA.
- Sustituir la cinta (Ribbon) como control de seguridad por un menú declarativo con guard de rol en el servidor; la cinta no debe decidir permisos, solo reflejar la decisión del servidor.
- Reemplazar la convención de `Forms("FormNCProyectoGestion").ResponsableTelefonica = m_ObjUsuarioConectado.Nombre` por un parámetro de filtro explícito en la URL o body de request, con guard en el servidor.

### §6.3 NO copiar (deuda legacy de Access que no debe portarse)
- No portar `TempVars` ni globals como mecanismo de inyección de usuario: la web debe usar autenticación por token/sesión, no variables globales.
- No usar la cinta (Ribbon) ni la visibilidad de menús como control de seguridad real: la web debe aplicar permisos en el servidor y devolver `403` cuando corresponda.
- No duplicar la lógica de "qué es un técnico" en cada `.cls` de formulario: la web debe tener un único servicio de autorización.
- No migrar la combinación `EsTecnico` + `EsAdministrador` como dos checks booleanos independientes: la web debe tratarlos como roles dentro de una matriz declarativa.
- No portar la dependencia de `Forms(...)` como mecanismo de comunicación entre formularios: la API REST debe recibir parámetros explícitos en la URL o body.

### §6.4 Preguntas abiertas al product owner
- ¿La matriz de permisos (BR-UPN-7) es la misma para Proyecto y Auditoría o se diferencia por dominio? Confirmar alcance.
- ¿Los 7 flags `EsUsuario*` se mantienen como están en la web o se renombran a roles más explícitos? (BR-UPN-6) Confirmar convención.
- ¿El flag `SinAcceso` bloquea toda la app o solo rutas sensibles? (BR-UPN-6) Hoy se infiere del nombre; la web debe tener un contrato explícito.
- ¿La cinta (Ribbon) sobrevive a la migración como artefacto de UI o se elimina? (BR-UPN-3) Si sobrevive, ¿quién la diseña?
- ¿Los filtros de precarga por `ResponsableTelefonica` y `RESPONSABLEIMPLANTACION` (BR-UPN-4, BR-UPN-5) son obligatorios o el usuario puede quitarlos? ¿La respuesta del backend debe filtrar siempre por defecto?
- ¿La auditoría de decisiones de autorización (denegado/permitido + motivo) tiene un SLA de retención? Confirmar antes de definir el servicio.

## §7 Registro de confianza
| Hecho | Confianza | Evidencia | Fecha |
|---|---|---|---|
| BR-UPN-1 — El menú principal enruta a Proyecto y Auditorías mediante formularios dedicados. | Verified-static | `Form_Form0BDOpciones.cls:15` (`DoCmd.OpenForm "Form0BDOpcionesParteProyectos"`) y `Form_Form0BDOpciones.cls:71` (`DoCmd.OpenForm "Form0BDOpcionesAuditorias"`); FALTA → crear mediante `access-vba-tdd` como contrato de navegación/cableado (sin UI) | 2026-06-15 |
| BR-UPN-2 — Usuario técnico no puede ejecutar altas sensibles de Proyecto/Auditoría. | Verified-static | `EsTecnico = EnumSino.Sí` en `Form_Form0BDOpcionesParteProyectos.cls:46,104,142` y `Form_Form0BDOpcionesAuditorias.cls:50,168,265`; también `Form_Form0BDTecnicos.cls:124`; FALTA → crear mediante `access-vba-tdd` con fixtures de `TbUsuariosAplicaciones` + inyección de `m_ObjUsuarioConectado` y asserts sobre mensaje de autorización | 2026-06-15 |
| BR-UPN-3 — Solo administrador ve Ribbon en modo pruebas; en uso normal se oculta. | Verified-static | `EsAdministrador = EnumSino.Sí` combinado con `PermisoPruebas` en `Form_Form0BDOpciones.cls:115,132`; `PermisoPruebas` declarado en `src/classes/Usuario.cls:36`; FALTA → crear mediante `access-vba-tdd` con coste vía stub de `m_ObjUsuarioConectado` y asserts sobre visibilidad de Ribbon | 2026-06-15 |
| BR-UPN-4 — La gestión de Proyecto precarga NC abiertas y filtra al técnico por su nombre. | Verified-static | `Form_Form0BDOpcionesParteProyectos.cls:142-143` filtra `Forms("FormNCProyectoGestion").ResponsableTelefonica = m_ObjUsuarioConectado.Nombre`; FALTA → crear mediante `access-vba-tdd` con fixtures de NC y asserts sobre `ResponsableTelefonica` precargado | 2026-06-15 |
| BR-UPN-5 — La gestión de Auditoría precarga NC abiertas y filtra responsable de implantación para no técnicos. | Verified-static | `Form_Form0BDOpcionesAuditorias.cls:140-141` filtra `Forms("FormNCAuditoriaGestion").RESPONSABLEIMPLANTACION = m_ObjUsuarioConectado.Nombre`; FALTA → crear mediante `access-vba-tdd` con fixtures de NC de auditoría y asserts sobre el filtro | 2026-06-15 |
| BR-UPN-6 — Roles calculados de usuario: 7 flags `EsUsuario*` (`Administrador`, `Calidad`, `Economia`, `Secretaria`, `Tecnico`, `SinAcceso`, `CalidadAvisos`) en `UsuarioAplicacionPermisos` + `PermisoPruebas` en `Usuario` (8 flags/permisos calculados totales). | Verified-static | `src/classes/UsuarioAplicacionPermisos.cls:15-21` (7 flags `EsUsuario*`) y `src/classes/Usuario.cls:36` (`PermisoPruebas`); FALTA → crear mediante `access-vba-tdd` con fixtures de permisos por rol, asserts sobre cada `*Calculado` y `PermisoPruebas` | 2026-06-15 |
| BR-UPN-7 — La matriz completa de permisos por acción sensible (cerrar/eliminar/rehabilitar/documento/acción/informe/configuración) está aprobada por producto. | Intended | FALTA → crear mediante `access-vba-tdd` tras confirmar matriz; misma matriz referenciada por `cross-cutting-support` BR-XCUT-6 | 2026-06-15 |
| Los menús de Proyecto y Auditorías existen y enrutan formularios de dominio. | Verified-static | `src/forms/Form_Form0BDOpciones.cls:15,71` (`DoCmd.OpenForm "Form0BDOpcionesParteProyectos"` / `DoCmd.OpenForm "Form0BDOpcionesAuditorias"`) | 2026-06-15 |
| Los técnicos están bloqueados en varias altas sensibles. | Verified-static | `EsTecnico = EnumSino.Sí` en `Form_Form0BDOpcionesParteProyectos.cls:46,104,142`, `Form_Form0BDOpcionesAuditorias.cls:50,168,265` y `Form_Form0BDTecnicos.cls:124` | 2026-06-15 |
| El Ribbon en modo pruebas se reserva al administrador. | Verified-static | `EsAdministrador = EnumSino.Sí` + `PermisoPruebas` en `Form_Form0BDOpciones.cls:115,132`; `PermisoPruebas` declarado en `src/classes/Usuario.cls:36` | 2026-06-15 |
| La gestión de Proyecto filtra al técnico por su nombre. | Verified-static | `Form_Form0BDOpcionesParteProyectos.cls:143` (`Forms("FormNCProyectoGestion").ResponsableTelefonica = m_ObjUsuarioConectado.Nombre`) | 2026-06-15 |
| La gestión de Auditoría filtra al responsable de implantación. | Verified-static | `Form_Form0BDOpcionesAuditorias.cls:141` (`Forms("FormNCAuditoriaGestion").RESPONSABLEIMPLANTACION = m_ObjUsuarioConectado.Nombre`) | 2026-06-15 |
| Existen 7 flags `EsUsuario*` en `UsuarioAplicacionPermisos` + `PermisoPruebas` en `Usuario` (8 permisos/flags calculados totales). | Verified-static | `src/classes/UsuarioAplicacionPermisos.cls:15-21` y `src/classes/Usuario.cls:36` | 2026-06-15 |
| La matriz completa de permisos está aprobada y probada. | Intended | No hay manifest dedicado; ningún test cubre permisos/roles/navegación. Cross-link: `cross-cutting-support` BR-XCUT-6 | 2026-06-15 |
| Existe cobertura runtime de navegación/permisos/roles. | Intended | No existe manifest; la promoción a `Verified-runtime` para BR-UPN-1..6 está bloqueada hasta que se creen pruebas con `access-vba-tdd` | 2026-06-15 |

**⚠️ Divergencias (intención SDD ≠ realidad del código)**
- Sin divergencia confirmada. Hueco confirmado: hay reglas de autorización embebidas en formularios, pero no existe una matriz de producto trazada (BR-UPN-7) ni manifest de pruebas que cubra BR-UPN-1..6. La misma matriz es la que `cross-cutting-support` declara como intención en BR-XCUT-6.
