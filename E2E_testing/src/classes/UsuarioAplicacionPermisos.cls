VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "UsuarioAplicacionPermisos"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
Option Compare Database
Option Explicit

Public CorreoUsuario As String
Public IDAplicacion As String
Public EsUsuarioAdministrador As String
Public EsUsuarioCalidad As String
Public EsUsuarioEconomia As String
Public EsUsuarioSecretaria As String
Public EsUsuarioTecnico As String
Public EsUsuarioSinAcceso As String
Public EsUsuarioCalidadAvisos As String

Private m_ObjUsuario As USUARIO


Private m_eEsUsuarioAdministradorCalculado As EnumSiNo
Private m_eEsUsuarioCalidadCalculado As EnumSiNo
Private m_eEsUsuarioEconomiaCalculado As EnumSiNo
Private m_eEsUsuarioSecretariaCalculado As EnumSiNo
Private m_eEsUsuarioTecnicoCalculado As EnumSiNo
Private m_eEsUsuarioSinAccesoCalculado As EnumSiNo
Private m_eEsUsuarioCalidadAvisosCalculado As EnumSiNo

Private m_objColCampos As Collection
Public Error As String
Private m_Error As String


Public Property Get USUARIO() As USUARIO

    On Error GoTo errores
    Me.Error = ""
    m_Error = ""
    If Not m_ObjUsuario Is Nothing Then
        Set USUARIO = m_ObjUsuario
        Exit Property
    End If
    If Me.CorreoUsuario = "" Then
        Exit Property
    End If
    Set m_ObjUsuario = constructor.getUsuario(, , , Me.CorreoUsuario, m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set USUARIO = m_ObjUsuario
     Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método UsuarioAplicacionPermisos.Usuario ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error

End Property


Public Property Get EsUsuarioAdministradorCalculado() As EnumSiNo

    On Error GoTo errores
    Me.Error = ""
    m_Error = ""
    If Me.EsUsuarioAdministrador = "Sí" Then
        m_eEsUsuarioAdministradorCalculado = EnumSiNo.Sí
    ElseIf Me.EsUsuarioAdministrador = "No" Then
        m_eEsUsuarioAdministradorCalculado = EnumSiNo.No
    End If
    
    EsUsuarioAdministradorCalculado = m_eEsUsuarioAdministradorCalculado
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método UsuarioAplicacionPermisos.EsUsuarioAdministradorCalculado ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error

End Property



Public Property Get EsUsuarioCalidadCalculado() As EnumSiNo

    On Error GoTo errores
    Me.Error = ""
    m_Error = ""
    If Me.EsUsuarioCalidad = "Sí" Then
        m_eEsUsuarioCalidadCalculado = EnumSiNo.Sí
    ElseIf Me.EsUsuarioCalidad = "No" Then
        m_eEsUsuarioCalidadCalculado = EnumSiNo.No
    End If
    
    EsUsuarioCalidadCalculado = m_eEsUsuarioCalidadCalculado
     Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método UsuarioAplicacionPermisos.EsUsuarioCalidadCalculado ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error

End Property



Public Property Get EsUsuarioEconomiaCalculado() As EnumSiNo

    On Error GoTo errores
    Me.Error = ""
    m_Error = ""
    If Me.EsUsuarioEconomia = "Sí" Then
        m_eEsUsuarioEconomiaCalculado = EnumSiNo.Sí
    ElseIf Me.EsUsuarioEconomia = "No" Then
        m_eEsUsuarioEconomiaCalculado = EnumSiNo.No
    End If
    
    EsUsuarioEconomiaCalculado = m_eEsUsuarioEconomiaCalculado
     Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método UsuarioAplicacionPermisos.EsUsuarioEconomiaCalculado ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error

End Property



Public Property Get EsUsuarioSecretariaCalculado() As EnumSiNo

    On Error GoTo errores
    Me.Error = ""
    m_Error = ""
    If Me.EsUsuarioSecretaria = "Sí" Then
        m_eEsUsuarioSecretariaCalculado = EnumSiNo.Sí
    ElseIf Me.EsUsuarioSecretaria = "No" Then
        m_eEsUsuarioSecretariaCalculado = EnumSiNo.No
    End If
    
    EsUsuarioSecretariaCalculado = m_eEsUsuarioSecretariaCalculado
     Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método UsuarioAplicacionPermisos.EsUsuarioSecretariaCalculado ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error

End Property



Public Property Get EsUsuarioTecnicoCalculado() As EnumSiNo

    On Error GoTo errores
    Me.Error = ""
    m_Error = ""
    If Me.EsUsuarioTecnico = "Sí" Then
        m_eEsUsuarioTecnicoCalculado = EnumSiNo.Sí
    ElseIf Me.EsUsuarioTecnico = "No" Then
        m_eEsUsuarioTecnicoCalculado = EnumSiNo.No
    End If
    
    EsUsuarioTecnicoCalculado = m_eEsUsuarioTecnicoCalculado
     Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método UsuarioAplicacionPermisos.EsUsuarioTecnicoCalculado ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error

End Property



Public Property Get EsUsuarioSinAccesoCalculado() As EnumSiNo

    On Error GoTo errores
    Me.Error = ""
    m_Error = ""
    If Me.EsUsuarioSinAcceso = "Sí" Then
        m_eEsUsuarioSinAccesoCalculado = EnumSiNo.Sí
    ElseIf Me.EsUsuarioSinAcceso = "No" Then
        m_eEsUsuarioSinAccesoCalculado = EnumSiNo.No
    End If
    
    EsUsuarioSinAccesoCalculado = m_eEsUsuarioSinAccesoCalculado
     Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método UsuarioAplicacionPermisos.EsUsuarioSinAccesoCalculado ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error

End Property



Public Property Get EsUsuarioCalidadAvisosCalculado() As EnumSiNo

    On Error GoTo errores
    Me.Error = ""
    m_Error = ""
    If Me.EsUsuarioCalidadAvisos = "Sí" Then
        m_eEsUsuarioCalidadAvisosCalculado = EnumSiNo.Sí
    ElseIf Me.EsUsuarioCalidadAvisos = "No" Then
        m_eEsUsuarioCalidadAvisosCalculado = EnumSiNo.No
    End If
    
    EsUsuarioCalidadAvisosCalculado = m_eEsUsuarioCalidadAvisosCalculado
     Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método UsUsuarioAplicacionPermisosuario.EsUsuarioCalidadAvisosCalculado ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error

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
        .Add "IDAplicacion"
        .Add "EsUsuarioAdministrador"
        .Add "EsUsuarioCalidad"
        .Add "EsUsuarioEconomia"
        .Add "EsUsuarioSecretaria"
        .Add "EsUsuarioTecnico"
        .Add "EsUsuarioSinAcceso"
        .Add "EsUsuarioCalidadAvisos"
    End With
    Set ColCampos = m_objColCampos
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método UsuarioAplicacionPermisos.ColCampos ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property

Public Function getPropiedad(m_NombrePropiedad As Variant, Optional ByRef p_Error As String) As Variant

    On Error GoTo errores

    Me.Error = ""
    m_Error = ""
    If m_NombrePropiedad = "CorreoUsuario" Then
        getPropiedad = Me.CorreoUsuario
        Exit Function
    End If
    If m_NombrePropiedad = "IDAplicacion" Then
        getPropiedad = Me.IDAplicacion
        Exit Function
    End If
    If m_NombrePropiedad = "EsUsuarioAdministrador" Then
        getPropiedad = Me.EsUsuarioAdministrador
        Exit Function
    End If
    If m_NombrePropiedad = "EsUsuarioCalidad" Then
        getPropiedad = Me.EsUsuarioCalidad
        Exit Function
    End If
    If m_NombrePropiedad = "EsUsuarioEconomia" Then
        getPropiedad = Me.EsUsuarioEconomia
        Exit Function
    End If
    If m_NombrePropiedad = "EsUsuarioSecretaria" Then
        getPropiedad = Me.EsUsuarioSecretaria
        Exit Function
    End If
    If m_NombrePropiedad = "EsUsuarioTecnico" Then
        getPropiedad = Me.EsUsuarioTecnico
        Exit Function
    End If
    If m_NombrePropiedad = "EsUsuarioSinAcceso" Then
        getPropiedad = Me.EsUsuarioSinAcceso
        Exit Function
    End If
    If m_NombrePropiedad = "EsUsuarioCalidadAvisos" Then
        getPropiedad = Me.EsUsuarioCalidadAvisos
        Exit Function
    End If
    p_Error = "Propiedad no reconocida en UsuariosAplicacionesPermiso.getPropiedad"
    Err.Raise 1000
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método UsuariosAplicacionesPermiso.getPropiedad ha devuelto el error:" & vbNewLine & Err.Description
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
    If m_NombrePropiedad = "IDAplicacion" Then
        Me.IDAplicacion = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "EsUsuarioAdministrador" Then
        Me.EsUsuarioAdministrador = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "EsUsuarioCalidad" Then
        Me.EsUsuarioCalidad = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "EsUsuarioEconomia" Then
        Me.EsUsuarioEconomia = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "EsUsuarioSecretaria" Then
        Me.EsUsuarioSecretaria = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "EsUsuarioTecnico" Then
        Me.EsUsuarioTecnico = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "EsUsuarioSinAcceso" Then
        Me.EsUsuarioSinAcceso = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "EsUsuarioCalidadAvisos" Then
        Me.EsUsuarioCalidadAvisos = m_ValorPropiedad
        Exit Function
    End If
    p_Error = "Propiedad no reconocida en UsuariosAplicacionesPermiso.SetPropiedad"
    Err.Raise 1000
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método UsuariosAplicacionesPermiso.SetPropiedad ha devuelto el error:" & vbNewLine & Err.Description
    End If
End Function












