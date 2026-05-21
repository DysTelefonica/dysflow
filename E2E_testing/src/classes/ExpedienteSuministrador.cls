VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "ExpedienteSuministrador"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
Option Compare Database
Option Explicit

Public IDExpedienteSuministrador As String
Public IDExpediente As String
Public IDSuministrador As String
Public Descripcon As String
Public ContratistaPrincipal As String
Public SubContratista As String

' === NUEVAS PROPIEDADES PARA EL ÁRBOL Y TRANSACCIONES ===
Public IdPadre As Variant       ' Variant para soportar Null
Public Tag As String            ' Uso interno para mapeo de IDs temporales

Private m_sIDExpedienteSuministradorCalculado As String
Private m_ObjSuministrador As Suministrador
Private m_objColCampos As Collection
Public Error As String
Private m_Error As String

Public Property Get Suministrador() As Suministrador
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If Not m_ObjSuministrador Is Nothing Then
        Set Suministrador = m_ObjSuministrador
        Exit Property
    End If
    ' Si no tenemos ID, no podemos buscar
    If Me.IDSuministrador = "" Then Exit Property
    
    Set m_ObjSuministrador = constructor.getSuministrador(p_IDSuministrador:=Me.IDSuministrador, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    
    Set Suministrador = m_ObjSuministrador
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método ExpedienteSuministrador.Suministrador ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Get IDExpedienteSuministradorCalculado() As String
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    m_sIDExpedienteSuministradorCalculado = DameID("TbExpedientesSuministradores", "IDExpedienteSuministrador", getdb(), m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    IDExpedienteSuministradorCalculado = m_sIDExpedienteSuministradorCalculado
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método ExpedienteSuministrador.IDExpedienteSuministradorCalculado ha devuelto el error: " & vbNewLine & Err.Description
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
        .Add "IDExpedienteSuministrador"
        .Add "IDExpediente"
        .Add "IDSuministrador"
        .Add "Descripcon"
        .Add "ContratistaPrincipal"
        .Add "SubContratista"
        .Add "IdPadre" ' <--- AÑADIDO
    End With
    Set ColCampos = m_objColCampos
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método ExpedienteSuministrador.ColCampos ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property


Public Function getPropiedad(m_NombrePropiedad As Variant, Optional ByRef p_Error As String) As Variant

    On Error GoTo errores

    Me.Error = ""
    If m_NombrePropiedad = "IDExpedienteSuministrador" Then
        getPropiedad = Me.IDExpedienteSuministrador
        Exit Function
    End If
    If m_NombrePropiedad = "IDExpediente" Then
        getPropiedad = Me.IDExpediente
        Exit Function
    End If
    If m_NombrePropiedad = "IDSuministrador" Then
        getPropiedad = Me.IDSuministrador
        Exit Function
    End If
    If m_NombrePropiedad = "Descripcon" Then
        getPropiedad = Me.Descripcon
        Exit Function
    End If
    If m_NombrePropiedad = "ContratistaPrincipal" Then
        getPropiedad = Me.ContratistaPrincipal
        Exit Function
    End If
    If m_NombrePropiedad = "SubContratista" Then
        getPropiedad = Me.SubContratista
        Exit Function
    End If
    ' --- AÑADIDO ---
    If m_NombrePropiedad = "IdPadre" Then
        getPropiedad = Me.IdPadre
        Exit Function
    End If
    ' ---------------
    p_Error = "Propiedad no reconocida en ExpedienteSuministrador.getPropiedad"
    Err.Raise 1000
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método ExpedienteSuministrador.getPropiedad ha devuelto el error:" & vbNewLine & Err.Description
    End If
End Function


Public Function SetPropiedad(m_NombrePropiedad As Variant, m_ValorPropiedad As Variant, Optional ByRef p_Error As String) As String
    On Error GoTo errores

    Me.Error = ""
    p_Error = ""
    If m_NombrePropiedad = "IDExpedienteSuministrador" Then
        Me.IDExpedienteSuministrador = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "IDExpediente" Then
        Me.IDExpediente = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "IDSuministrador" Then
        Me.IDSuministrador = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "Descripcon" Then
        Me.Descripcon = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "ContratistaPrincipal" Then
        Me.ContratistaPrincipal = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "SubContratista" Then
        Me.SubContratista = m_ValorPropiedad
        Exit Function
    End If
    ' --- AÑADIDO ---
    If m_NombrePropiedad = "IdPadre" Then
        Me.IdPadre = m_ValorPropiedad
        Exit Function
    End If
    ' ---------------
    
    p_Error = "Propiedad no reconocida en ExpedienteSuministrador.SetPropiedad"
    Err.Raise 1000
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método ExpedienteSuministrador.SetPropiedad ha devuelto el error:" & vbNewLine & Err.Description
    End If
End Function
