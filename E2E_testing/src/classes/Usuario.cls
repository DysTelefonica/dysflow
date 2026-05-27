VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "Usuario"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
Option Compare Database
Option Explicit

Public CorreoUsuario As String
Public Password As String
Public UsuarioRed As String
Public Nombre As String
Public Matricula As String
Public FechaAlta As String
Public Activado As Boolean
Public FechaProximoCambioContrasenia As String
Public FechaUltimaConexion As String
Public TieneQueCambiarLaPass As Boolean
Public Telefono As String
Public Movil As String
Public Observaciones As String
Public UsuarioImborrable As Boolean
Public EsAdministrador As String
Public PermisosAsignados As Boolean
Public FechaBaja As String
Public PasswordNuncaCaduca As Boolean
Public MantenerLanzaderaAbierta As Boolean
Public PassIncialPlana As String
Public UsuarioSSID As String
Public id As String
Public JefeDelUsuario As String
Public PermisoPruebas As String
Public ParaTareasProgramadas As Boolean
Public FechaBloqueo As String



Private m_eEsAdministradorCalculado As EnumSino
Private m_eEsUsuarioAdministradorCalculado As EnumSino
Private m_eEsUsuarioCalidadCalculado As EnumSino
Private m_eEsUsuarioEconomiaCalculado As EnumSino
Private m_eEsUsuarioSecretariaCalculado As EnumSino
Private m_eEsUsuarioTecnicoCalculado As EnumSino
Private m_eEsUsuarioSinAccesoCalculado As EnumSino
Private m_eEsUsuarioCalidadAvisosCalculado As EnumSino

Private m_objColAplicacionesPermisos As Scripting.Dictionary
Private m_objPermisos As UsuarioAplicacionPermisos

Public Error As String
Private m_Error As String
Private m_objColCampos As Collection


Public Property Get EsAdministradorCalculado() As EnumSino

    On Error GoTo errores
    Me.Error = ""
    
    
    If Me.EsAdministrador = "Sí" Then
        m_eEsAdministradorCalculado = EnumSino.Sí
        EsAdministradorCalculado = m_eEsAdministradorCalculado
        Exit Property
    End If
    If Me.Permisos Is Nothing Then
        m_eEsAdministradorCalculado = EnumSino.No
        EsAdministradorCalculado = m_eEsAdministradorCalculado
        Exit Property
    End If
    m_eEsAdministradorCalculado = Me.Permisos.EsUsuarioAdministradorCalculado
    Me.Error = Me.Permisos.Error
    If Me.Error <> "" Then
        Err.Raise 1000
    End If
    EsAdministradorCalculado = m_eEsAdministradorCalculado
    Exit Property
errores:
    If Err.Number <> 1000 Then
        Me.Error = "El método Usuario.EsAdministradorCalculado ha devuelto el error: " & vbNewLine & Err.Description
    End If
    

End Property

Public Property Get EsUsuarioTecnicoCalculado() As EnumSino

    On Error GoTo errores
    Me.Error = ""
    
    
    If Me.Permisos Is Nothing Then
        m_eEsUsuarioTecnicoCalculado = EnumSino.No
        EsUsuarioTecnicoCalculado = m_eEsUsuarioTecnicoCalculado
        Exit Property
    End If
    m_eEsUsuarioTecnicoCalculado = Me.Permisos.EsUsuarioTecnicoCalculado
    Me.Error = Me.Permisos.Error
    If Me.Error <> "" Then
        Err.Raise 1000
    End If
    EsUsuarioTecnicoCalculado = m_eEsUsuarioTecnicoCalculado
    Exit Property
errores:
    If Err.Number <> 1000 Then
        Me.Error = "El método Usuario.EsUsuarioTecnicoCalculado ha devuelto el error: " & vbNewLine & Err.Description
    End If
    

End Property

Public Property Get EsUsuarioCalidadCalculado() As EnumSino

    On Error GoTo errores
    Me.Error = ""
    
    
    If Me.Permisos Is Nothing Then
        m_eEsUsuarioCalidadCalculado = EnumSino.No
        EsUsuarioCalidadCalculado = m_eEsUsuarioCalidadCalculado
        Exit Property
    End If
    m_eEsUsuarioCalidadCalculado = Me.Permisos.EsUsuarioCalidadCalculado
    Me.Error = Me.Permisos.Error
    If Me.Error <> "" Then
        Err.Raise 1000
    End If
    EsUsuarioCalidadCalculado = m_eEsUsuarioCalidadCalculado
    Exit Property
errores:
    If Err.Number <> 1000 Then
        Me.Error = "El método Usuario.EsUsuarioCalidadCalculado ha devuelto el error: " & vbNewLine & Err.Description
    End If
    

End Property

Public Property Get EsUsuarioEconomiaCalculado() As EnumSino

    On Error GoTo errores
    Me.Error = ""
    
    
    If Me.Permisos Is Nothing Then
        m_eEsUsuarioEconomiaCalculado = EnumSino.No
        EsUsuarioEconomiaCalculado = m_eEsUsuarioEconomiaCalculado
        Exit Property
    End If
    m_eEsUsuarioEconomiaCalculado = Me.Permisos.EsUsuarioEconomiaCalculado
    Me.Error = Me.Permisos.Error
    If Me.Error <> "" Then
        Err.Raise 1000
    End If
    EsUsuarioEconomiaCalculado = m_eEsUsuarioEconomiaCalculado
    Exit Property
errores:
    If Err.Number <> 1000 Then
        Me.Error = "El método Usuario.EsUsuarioEconomiaCalculado ha devuelto el error: " & vbNewLine & Err.Description
    End If
    

End Property

Public Property Get EsUsuarioSecretariaCalculado() As EnumSino

    On Error GoTo errores
    Me.Error = ""
    
    
    If Me.Permisos Is Nothing Then
        m_eEsUsuarioSecretariaCalculado = EnumSino.No
        EsUsuarioSecretariaCalculado = m_eEsUsuarioSecretariaCalculado
        Exit Property
    End If
    m_eEsUsuarioSecretariaCalculado = Me.Permisos.EsUsuarioSecretariaCalculado
    Me.Error = Me.Permisos.Error
    If Me.Error <> "" Then
        Err.Raise 1000
    End If
    EsUsuarioSecretariaCalculado = m_eEsUsuarioSecretariaCalculado
    Exit Property
errores:
    If Err.Number <> 1000 Then
        Me.Error = "El método Usuario.EsUsuarioSecretariaCalculado ha devuelto el error: " & vbNewLine & Err.Description
    End If
    

End Property

Public Property Get EsUsuarioCalidadAvisosCalculado() As EnumSino

    On Error GoTo errores
    Me.Error = ""
    
    
    If Me.Permisos Is Nothing Then
        m_eEsUsuarioCalidadAvisosCalculado = EnumSino.No
        EsUsuarioCalidadAvisosCalculado = m_eEsUsuarioCalidadAvisosCalculado
        Exit Property
    End If
    m_eEsUsuarioCalidadAvisosCalculado = Me.Permisos.EsUsuarioCalidadAvisosCalculado
    Me.Error = Me.Permisos.Error
    If Me.Error <> "" Then
        Err.Raise 1000
    End If
    EsUsuarioCalidadAvisosCalculado = m_eEsUsuarioCalidadAvisosCalculado
    Exit Property
errores:
    If Err.Number <> 1000 Then
        Me.Error = "El método Usuario.EsUsuarioCalidadAvisosCalculado ha devuelto el error: " & vbNewLine & Err.Description
    End If
    

End Property

Public Property Get ColAplicacionesPermisos() As Scripting.Dictionary

    On Error GoTo errores
    Me.Error = ""
    If Not m_objColAplicacionesPermisos Is Nothing Then
        Set ColAplicacionesPermisos = m_objColAplicacionesPermisos
        Exit Property
    End If
    If Me.CorreoUsuario = "" Then
        Exit Property
    End If
    Set m_objColAplicacionesPermisos = constructor.getAplicacionesPermisos(Me.CorreoUsuario, Me.Error)
    
    Set ColAplicacionesPermisos = m_objColAplicacionesPermisos
    Exit Property
errores:
    If Err.Number <> 1000 Then
        Me.Error = "El método Usuario.colAplicacionesPermisos ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Property


Public Property Get Permisos() As UsuarioAplicacionPermisos

    On Error GoTo errores
    Me.Error = ""
    If Not m_objPermisos Is Nothing Then
        Set Permisos = m_objPermisos
        Exit Property
    End If
    If Me.ColAplicacionesPermisos Is Nothing Then
        If Me.Error <> "" Then
            Exit Property
        End If
        Exit Property
    End If
    If Me.ColAplicacionesPermisos.Exists(CStr(IDAplicacion)) Then
        Set m_objPermisos = Me.ColAplicacionesPermisos(CStr(IDAplicacion))
    End If
    
    
    
    Set Permisos = m_objPermisos
    Exit Property
errores:
    If Err.Number <> 1000 Then
        Me.Error = "El método Usuario.Permisos ha devuelto el error: " & vbNewLine & Err.Description
    End If

End Property



Public Property Get ColCampos() As Collection

    On Error GoTo errores

    Me.Error = ""
    m_Error = ""
    If Not m_objColCampos Is Nothing Then
        Set ColCampos = m_objColCampos
        Exit Property
    End If
    Set m_objColCampos = New Collection
    With m_objColCampos
        .Add "CorreoUsuario"
        .Add "Password"
        .Add "UsuarioRed"
        .Add "Nombre"
        .Add "Matricula"
        .Add "FechaAlta"
        .Add "Activado"
        .Add "FechaProximoCambioContrasenia"
        .Add "FechaUltimaConexion"
        .Add "TieneQueCambiarLaContrasenia"
        .Add "Telefono"
        .Add "Movil"
        .Add "Observaciones"
        .Add "UsuarioImborrable"
        .Add "EsAdministrador"
        .Add "PermisosAsignados"
        .Add "FechaBaja"
        .Add "PasswordNuncaCaduca"
        .Add "MantenerLanzaderaAbierta"
        .Add "PassIncialPlana"
        .Add "UsuarioSSID"
        .Add "Id"
        .Add "JefeDelUsuario"
        .Add "PermisoPruebas"
        .Add "ParaTareasProgramadas"
        .Add "FechaBloqueo"
    End With
    Set ColCampos = m_objColCampos
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método UsuariosAplicacion.ColCampos ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property


Public Function getPropiedad(m_NombrePropiedad As Variant, Optional ByRef p_Error As String) As Variant
    
    On Error GoTo errores
    
    Me.Error = ""
    p_Error = ""
    
    If m_NombrePropiedad = "CorreoUsuario" Then
        getPropiedad = Me.CorreoUsuario
        Exit Function
    End If
    If m_NombrePropiedad = "Password" Then
        getPropiedad = Me.Password
        Exit Function
    End If
    If m_NombrePropiedad = "UsuarioRed" Then
        getPropiedad = Me.UsuarioRed
        Exit Function
    End If
    If m_NombrePropiedad = "Nombre" Then
        getPropiedad = Me.Nombre
        Exit Function
    End If
    If m_NombrePropiedad = "Matricula" Then
        getPropiedad = Me.Matricula
        Exit Function
    End If
    If m_NombrePropiedad = "FechaAlta" Then
        getPropiedad = Me.FechaAlta
        Exit Function
    End If
    If m_NombrePropiedad = "Activado" Then
        getPropiedad = Me.Activado
        Exit Function
    End If
    If m_NombrePropiedad = "FechaProximoCambioContrasenia" Then
        getPropiedad = Me.FechaProximoCambioContrasenia
        Exit Function
    End If
    If m_NombrePropiedad = "Telefono" Then
        getPropiedad = Me.Telefono
        Exit Function
    End If
    If m_NombrePropiedad = "Movil" Then
        getPropiedad = Me.Movil
        Exit Function
    End If
    If m_NombrePropiedad = "Observaciones" Then
        getPropiedad = Me.Observaciones
        Exit Function
    End If
    If m_NombrePropiedad = "UsuarioImborrable" Then
        getPropiedad = Me.UsuarioImborrable
        Exit Function
    End If
    If m_NombrePropiedad = "EsAdministrador" Then
        getPropiedad = Me.EsAdministrador
        Exit Function
    End If
    If m_NombrePropiedad = "PermisosAsignados" Then
        getPropiedad = Me.PermisosAsignados
        Exit Function
    End If
    If m_NombrePropiedad = "FechaBaja" Then
        getPropiedad = Me.FechaBaja
        Exit Function
    End If
    If m_NombrePropiedad = "PasswordNuncaCaduca" Then
        getPropiedad = Me.PasswordNuncaCaduca
        Exit Function
    End If
    If m_NombrePropiedad = "MantenerLanzaderaAbierta" Then
        getPropiedad = Me.MantenerLanzaderaAbierta
        Exit Function
    End If
    If m_NombrePropiedad = "PassIncialPlana" Then
        getPropiedad = Me.PassIncialPlana
        Exit Function
    End If
    If m_NombrePropiedad = "UsuarioSSID" Then
        getPropiedad = Me.UsuarioSSID
        Exit Function
    End If
    If m_NombrePropiedad = "Id" Then
        getPropiedad = Me.id
        Exit Function
    End If
    If m_NombrePropiedad = "JefeDelUsuario" Then
        getPropiedad = Me.JefeDelUsuario
        Exit Function
    End If
    If m_NombrePropiedad = "PermisoPruebas" Then
        getPropiedad = Me.PermisoPruebas
        Exit Function
    End If
    If m_NombrePropiedad = "ParaTareasProgramadas" Then
        getPropiedad = Me.ParaTareasProgramadas
        Exit Function
    End If
    If m_NombrePropiedad = "FechaBloqueo" Then
        getPropiedad = Me.FechaBloqueo
        Exit Function
    End If
    If m_NombrePropiedad = "TieneQueCambiarLaContrasenia" Then
        getPropiedad = Me.TieneQueCambiarLaPass
        Exit Function
    End If
    If m_NombrePropiedad = "FechaUltimaConexion" Then
        getPropiedad = Me.FechaUltimaConexion
        Exit Function
    End If
    p_Error = "Propiedad no reconocida en Usuario.getPropiedad"
    Err.Raise 1000
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El metodo Usuario.getPropiedad ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function



Public Function SetPropiedad(m_NombrePropiedad As Variant, m_ValorPropiedad As Variant, Optional ByRef p_Error As String) As String
    
    On Error GoTo errores
    
    Me.Error = ""
    p_Error = ""
    
    If m_NombrePropiedad = "CorreoUsuario" Then
        Me.CorreoUsuario = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "Password" Then
        Me.Password = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "UsuarioRed" Then
        Me.UsuarioRed = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "Nombre" Then
        Me.Nombre = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "Matricula" Then
        Me.Matricula = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "FechaAlta" Then
        Me.FechaAlta = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "Activado" Then
        Me.Activado = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "FechaProximoCambioContrasenia" Then
        Me.FechaProximoCambioContrasenia = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "Telefono" Then
        Me.Telefono = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "Movil" Then
        Me.Movil = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "Observaciones" Then
        Me.Observaciones = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "UsuarioImborrable" Then
        Me.UsuarioImborrable = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "EsAdministrador" Then
        Me.EsAdministrador = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "PermisosAsignados" Then
        Me.PermisosAsignados = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "FechaBaja" Then
        Me.FechaBaja = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "PasswordNuncaCaduca" Then
        Me.PasswordNuncaCaduca = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "MantenerLanzaderaAbierta" Then
        Me.MantenerLanzaderaAbierta = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "PassIncialPlana" Then
        Me.PassIncialPlana = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "UsuarioSSID" Then
        Me.UsuarioSSID = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "Id" Then
        Me.id = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "JefeDelUsuario" Then
        Me.JefeDelUsuario = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "PermisoPruebas" Then
        Me.PermisoPruebas = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "ParaTareasProgramadas" Then
        Me.ParaTareasProgramadas = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "FechaBloqueo" Then
        Me.FechaBloqueo = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "TieneQueCambiarLaContrasenia" Then
        Me.TieneQueCambiarLaPass = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "FechaUltimaConexion" Then
        Me.FechaUltimaConexion = m_ValorPropiedad
        Exit Function
    End If
    p_Error = "Propiedad no reconocida en Usuario.SetPropiedad"
    Err.Raise 1000
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El metodo Usuario.SetPropiedad ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function

