# PRD-04: Configuración y Usuarios

## 0. User Stories

| ID | Prioridad | Descripción |
|:---|:---------:|:-------------|
| US-USR-001 | Alta | Como administrador, quiero gestionar usuarios de la aplicación (alta, modificación, baja) para controlar el acceso. |
| US-USR-002 | Alta | Como usuario, quiero iniciar sesión con mi usuario de red para acceder a la aplicación de forma segura. |
| US-USR-003 | Alta | Como administrador, quiero asignar permisos a usuarios por aplicación para controlar funcionalidades. |
| US-USR-004 | Alta | Como usuario, quiero gestionar mi configuración personal (preferencias, idioma) para personalizar mi experiencia. |
| US-USR-005 | Alta | Como administrador, quiero bloquear/desbloquear usuarios para gestionar accesos temporales. |
| US-USR-006 | Media | Como usuario, quiero recuperar o cambiar mi contraseña para mantener la seguridad. |
| US-USR-007 | Media | Como administrador, quiero auditar los accesos de usuarios para cumplir requisitos de seguridad. |
| US-USR-008 | Baja | Como sistema, quiero registrar el histórico de contraseñas para cumplir políticas de seguridad. |

---

## 1. Objetivo

Documentar el módulo de **Configuración y Usuarios** del sistema No Conformidades. Este módulo gestiona la seguridad, autenticación y permisos de acceso a la aplicación, incluyendo gestión de usuarios, roles y configuraciones.

**Dominio:** Seguridad, autenticación y autorización.
**Dependencias:** Módulo base - todos los demás módulos dependen de él.

---

## 2. Entidades y Tabla Fuente de Verdad

> **IMPORTANTE:** Las tablas de usuarios residen en `Lanzadera_Datos.accdb` (back separado).
> En NoConformidades.accdb existen como **tablas vinculadas** a:
> - `TbUsuariosAplicaciones` (origen: `\\datoste\...\Lanzadera_Datos.accdb`)
> 
> La estructura de campos documentada se obtuvo del código VBA (`Usuario.cls`) y del análisis de la tabla vinculada.

### 2.1 Entidad Principal: Usuario

**Clase:** `Usuario.cls` (src/classes/)
**Tabla fuente de verdad (vinculada):** `TbUsuariosAplicaciones`

#### 2.1.1 Esquema de Datos - tbUsuarios

| Campo Access | Tipo Dato | Nullable | PK/FK | Descripción |
|:-------------|:----------|:---------|:-----|:------------|
| Id | Long Integer (4) | NO | PK | Identificador único |
| Nombre | Text (50) | SÍ | | Nombre completo |
| UsuarioRed | Text (50) | SÍ | | Usuario de red Windows |
| DirCorreo | Text (255) | SÍ | | Dirección de correo |
| Matricula_DNI | Text (50) | SÍ | | DNI o matrícula |
| Cargo | Text (50) | SÍ | | Cargo del empleado |
| telfijo | Integer (4) | SÍ | | Teléfono fijo |
| telmovil | Integer (4) | SÍ | | Teléfono móvil |
| JefeDelUsuario | Text (50) | SÍ | | Jefe inmediato |
| FechaAlta | Date/Time (8) | SÍ | | Fecha de alta en el sistema |
| FechaBaja | Date/Time (8) | SÍ | | Fecha de baja |
| EmplazamientoExterno | Text (2) | SÍ | | ¿Emplazamiento externo? |
| SeLogean | Yes/No (1) | SÍ | | ¿Puede loguearse? |
| ParaTareasProgramadas | Yes/No (1) | SÍ | | ¿Para tareas programadas? |
| Autorizador | Yes/No (1) | SÍ | | ¿Es autorizador? |
| DiaEnvioTareas | Byte (2) | SÍ | | Día de envío de tareas |
| UsuarioDeGestionRiesgos | Text (2) | SÍ | | ¿Usuario de gestión de riesgos? |
| UsuariosI3D | Text (2) | SÍ | | ¿Usuario I3D? |

#### 2.1.2 Esquema de Datos - TbUsuariosAplicaciones

| Campo Access | Tipo Dato | Nullable | PK/FK | Descripción |
|:-------------|:----------|:---------|:-----|:------------|
| Id | Integer (2) | NO | PK | Identificador interno |
| CorreoUsuario | Text (255) | SÍ | | Correo electrónico |
| Password | Text (255) | SÍ | | Contraseña hasheada |
| UsuarioRed | Text (255) | SÍ | | Usuario de red |
| Nombre | Text (255) | SÍ | | Nombre completo |
| Matricula | Text (255) | SÍ | | Matrícula |
| FechaAlta | Date/Time (8) | SÍ | | Fecha de alta |
| Activado | Yes/No (1) | SÍ | | ¿Usuario activo? |
| FechaProximoCambioContrasenia | Date/Time (8) | SÍ | | Fecha para cambio de contraseña |
| FechaUltimaConexion | Date/Time (8) | SÍ | | Último acceso |
| TieneQueCambiarLaContrasenia | Yes/No (1) | SÍ | | ¿Debe cambiar contraseña? |
| Telefono | Text (255) | SÍ | | Teléfono |
| Movil | Text (255) | SÍ | | Móvil |
| Observaciones | Memo (12) | SÍ | | Notas |
| UsuarioImborrable | Yes/No (1) | SÍ | | ¿No se puede eliminar? |
| EsAdministrador | Text (2) | SÍ | | ¿Es administrador? |
| PermisosAsignados | Yes/No (1) | SÍ | | ¿Tiene permisos asignados? |
| FechaBaja | Date/Time (8) | SÍ | | Fecha de baja |
| PasswordNuncaCaduca | Yes/No (1) | SÍ | | ¿Password no caduca? |
| MantenerLanzaderaAbierta | Yes/No (1) | SÍ | | ¿Mantener lanzadera abierta? |
| PassIncialPlana | Text (255) | SÍ | | Password inicial (plana) |
| UsuarioSSID | Text (255) | SÍ | | Usuario SSID |
| JefeDelUsuario | Text (50) | SÍ | | Jefe del usuario |
| PermisoPruebas | Text (2) | SÍ | | ¿Permiso para pruebas? |
| ParaTareasProgramadas | Yes/No (1) | SÍ | | ¿Para tareas programadas? |
| FechaBloqueo | Date/Time (8) | SÍ | | Fecha de bloqueo |

#### 2.1.3 Esquema de Datos - TbUsuariosAplicacionesPermisos

| Campo Access | Tipo Dato | Nullable | PK/FK | Descripción |
|:-------------|:----------|:---------|:-----|:------------|
| CorreoUsuario | Text (255) | SÍ | | FK a TbUsuariosAplicaciones |
| IDAplicacion | Long Integer (4) | SÍ | FK | FK a aplicaciones |
| *(otros campos de permisos)* | | | | |

#### 2.1.4 Esquema de Datos - TbPermisos

| Campo Access | Tipo Dato | Nullable | PK/FK | Descripción |
|:-------------|:----------|:---------|:-----|:------------|
| IDPermiso | Long Integer (4) | NO | PK | Identificador |
| Permiso | Text (255) | SÍ | | Nombre del permiso |
| Descripcion | Text (255) | SÍ | | Descripción |
| IDPerfil | Long Integer (4) | SÍ | FK | FK a perfiles |

#### 2.1.5 Esquema de Datos - TbAplicaciones

| Campo Access | Tipo Dato | Nullable | PK/FK | Descripción |
|:-------------|:----------|:---------|:-----|:------------|
| IDAplicacion | Long Integer (4) | NO | PK | Identificador |
| NombreAplicacion | Text (255) | SÍ | | Nombre |
| Descripcion | Text (255) | SÍ | | Descripción |
| Ruta | Text (255) | SÍ | | Ruta de la aplicación |
| Activa | Yes/No (1) | SÍ | | ¿Aplicación activa? |

#### 2.1.6 Esquema de Datos - TbUsuarioConfiguracion

| Campo Access | Tipo Dato | Nullable | PK/FK | Descripción |
|:-------------|:----------|:---------|:-----|:------------|
| ID | Long Integer (4) | NO | PK | Identificador |
| IDUsuario | Long Integer (4) | SÍ | FK | FK a tbUsuarios |
| Clave | Text (255) | SÍ | | Clave de configuración |
| Valor | Text (255) | SÍ | | Valor |

### 2.2 Propiedades Calculadas en Usuario.cls

| Propiedad | Tipo Retorno | Lógica |
|:----------|:-------------|:-------|
| EsAdministradorCalculado | EnumSino | Retorna Sí si EsAdministrador="Sí" |
| EsUsuarioTecnicoCalculado | EnumSino | ¿Tiene rol técnico? |
| EsUsuarioCalidadCalculado | EnumSino | ¿Tiene rol calidad? |
| EsUsuarioEconomiaCalculado | EnumSino | ¿Tiene rol economía? |
| EsUsuarioSecretariaCalculado | EnumSino | ¿Tiene rol secretaría? |
| EsUsuarioCalidadAvisosCalculado | EnumSino | ¿Recibe avisos de calidad? |
| ColAplicacionesPermisos | Scripting.Dictionary | Permisos por aplicación |
| Permisos | UsuarioAplicacionPermisos | Permisos efectivos |

---

## 3. UX / Flujo de Interfaz

*(Pendiente de documentar)*

Formularios esperados:
- Form_frmLogin (autenticación)
- Form_frmGestionUsuarios (admin)
- Form_frmMisDatos (configuración usuario)
- Form_frmPermisos (admin)

---

## 4. Reglas de Negocio / Ciclo de Vida

### 4.1 Estados de Usuario

| Estado | Condición |
|:-------|:----------|
| Activo | Activado=True, FechaBaja vacía, FechaBloqueo vacía |
| Inactivo | Activado=False |
| Bloqueado | FechaBloqueo no vacía |
| Baja | FechaBaja no vacía |

### 4.2 Roles / Permisos

| Rol | Descripción |
|:---|:------------|
| Administrador | Acceso total a gestión de usuarios y configuración |
| Usuario Calidad | Gestión de NCs, ACs, auditorías |
| Usuario Técnico | Gestión operativa de NCs |
| Usuario Secretaría | Funciones administrativas |
| Usuario Economía | Funciones de reporting económico |

### 4.3 Reglas de Seguridad

| Regla | Descripción |
|:-------|:------------|
| Password mínimo | Mínimo 8 caracteres |
| Caducidad password | Por defecto 90 días |
| Histórico contraseñas | Últimas 5 no repetidas |
| Bloqueo | Tras 3 intentos fallidos |

---

## 5. Algoritmos y Lógica No Trivial

### 5.1 Cálculo de Permisos Efectivos

```
Function Permisos() As UsuarioAplicacionPermisos
    If EsAdministrador = "Sí" Then
        Return PermisosTodos
    Else
        Return PermisosAsignadosPorAplicacion
    End If
End Function
```

### 5.2 Validación de Login

1. Buscar usuario por UsuarioRed
2. Verificar Activado=True
3. Verificar FechaBaja vacía
4. Verificar FechaBloqueo vacía
5. Verificar contraseña
6. Actualizar FechaUltimaConexion

### 5.3 Bloqueo por Intentos

- Contador de intentos fallidos en memoria
- Resetear tras login exitoso
- Bloquear tras 3 intentos
- FechaBloqueo = Now()

---

## 6. Flujos Principales

### 6.1 Alta de Usuario

1. Administrador ingresa datos: UsuarioRed, Nombre, Correo
2. Sistema genera password inicial temporal
3. Sistema crea registro en TbUsuariosAplicaciones
4. Sistema asigna permisos por defecto
5. Usuario debe cambiar password en primer login

### 6.2 Modificación de Usuario

1. Administrador modifica campos
2. Si cambia password → registrar en histórico
3. Si cambia rol → actualizar permisos

### 6.3 Baja de Usuario

1. Administrador solicita baja
2. Sistema registra FechaBaja
3. Sistema desactiva usuario (no elimina)
4. Mantiene historial para auditoría

### 6.4 Cambio de Password

1. Usuario solicita cambio
2. Validar password actual
3. Validar nuevo password (mínimo 8 chars)
4. Verificar que no esté en últimas 5 contraseñas
5. Hashear y guardar nuevo password
6. Registrar en TbUsuariosHistoricoContrasenias

### 6.5 Bloqueo/Desbloqueo

1. Intentos fallidos > 3 → Bloqueo automático
2. Administrador puede desbloquear manualmente
3. Resetear FechaBloqueo a vacío

---

## 7. Transaccionalidad

- Alta/Modificación/Baja usuario: Transacción explícita
- Cambio de password: Transacción (password + histórico)
- Asignación de permisos: Transacción (borrar permisos + insertar nuevos)

---

## 8. Pestañas / Secciones Funcionales

*(Pendiente)*

Esperado en gestión de usuarios:
- Datos Personales
- Datos de Acceso
- Permisos
- Configuración
- Histórico

---

## 9. Fases Alternativas

- **Recuperación de password:** Envío por correo (si configurado)
- **Usuario imborrable:** No se puede dar de baja ( flag UsuarioImborrable)
- **Usuario de pruebas:** Acceso limitado a entorno de pruebas (PermisoPruebas)

---

## 10. Casos Borde

| Caso | Comportamiento |
|:-----|:---------------|
| Usuario duplicado | Error: UsuarioRed ya existe |
| Password weak | Warn: menos de 8 caracteres |
| Auto-bloqueo | Tras 3 intentos, bloquear 30 min |
| Usuario sin permisos | Puede entrar pero sin funcionalidades |

---

## 11. Puntos de Integración

| Sistema | Punto | Datos |
|:--------|:------|:------|
| Directorio Active Directory | UsuarioRed | Sincronización de usuarios |
| Correo | DirCorreo | Envío de notificaciones |
| Lanzadera | tbUsuarios | Usuario maestro |

---

## 12. Casos de Prueba

### 12.1 Alta Usuario

```
GIVEN formulario de alta de usuario
WHEN administrador ingresa: UsuarioRed="jsmith", Nombre="John Smith", Correo="john.smith@telefonica.com"
THEN sistema genera password temporal
AND crea registro en TbUsuariosAplicaciones
AND usuario debe cambiar password en primer login
```

### 12.2 Login Fallido

```
GIVEN usuario con password incorrecta
WHEN intenta login 3 veces
THEN sistema bloquea usuario
AND registra FechaBloqueo
AND muestra mensaje: "Usuario bloqueado por intentos excesivos"
```

### 12.3 Cambio Password

```
GIVEN usuario logueado
WHEN cambia password: actual="old1234", nueva="new5678"
THEN sistema verifica que nueva no esté en histórico
AND guarda password hasheada
AND registra en TbUsuariosHistoricoContrasenias
```

---

## 13. Registro de Deuda Técnica

| ID | Descripción | Prioridad | Estado |
|:---|:------------|:----------|:-------|
| D-011 | Sin SSO (Single Sign-On) con directorio | Alta | Pendiente |
| D-012 | Password almacenado con hash débil (SHA1?) | Alta | Pendiente |
| D-013 | Sin auditoría de accesos detallada | Media | Pendiente |
| D-014 | Formularios no documentados | Alta | Pendiente |

---

## Historial

| Versión | Fecha | Autor |
|:--------|:------|:------|
| 1.0 | 2026-03-08 | Arquitecto |

---

*Documento generado como parte del PRD-04: Configuración y Usuarios*
