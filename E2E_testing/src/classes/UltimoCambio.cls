VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "UltimoCambio"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
Option Compare Database
Option Explicit

Public ID As String
Public IDExpediente As String
Public FechaCambio As String
Public IDUsuarioCambio As String

Private m_sIDCalculado As String
Private m_ObjExpediente As Expediente
Private m_ObjUsuario As USUARIO
Private m_sTexto As String
Private m_objColCampos As Collection
Public Error As String
Private m_Error As String

Public Property Get IDCalculado() As String
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    m_sIDCalculado = DameID("TbUltimoCambio", "ID", getdb(), m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    IDCalculado = m_sIDCalculado
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método UltimoCambio.IDCalculado ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property


Public Property Get texto() As String
    
    Dim m_Fecha As String
    Dim m_CodExpediente As String
    Dim m_Usuario As String
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If m_sTexto <> "" Then
        texto = m_sTexto
        Exit Property
    End If
    If Not IsDate(Me.FechaCambio) Then
        m_Fecha = "Desconocida"
    Else
        m_Fecha = Me.FechaCambio
    End If
    If Me.USUARIO Is Nothing Then
        m_Usuario = "Desconocido"
    Else
        m_Usuario = Me.USUARIO.Nombre
    End If
    If Me.Expediente Is Nothing Then
        m_CodExpediente = "Desconocido"
    Else
        m_CodExpediente = Me.Expediente.CodExp
    End If
    m_sTexto = "Última modificación por " & m_Usuario & " para el Exp " & m_CodExpediente & " el " & m_Fecha
    
    texto = m_sTexto
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método UltimoCambio.Texto ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property


Public Property Get Expediente() As Expediente
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If Not m_ObjExpediente Is Nothing Then
        Set Expediente = m_ObjExpediente
        Exit Property
    End If
    If Me.IDExpediente = "" Then
        Exit Property
    End If
    Set m_ObjExpediente = constructor.getExpediente(p_IDExpediente:=Me.IDExpediente, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    
    Set Expediente = m_ObjExpediente
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método UltimoCambio.Expediente ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Get USUARIO() As USUARIO
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If Not m_ObjUsuario Is Nothing Then
        Set USUARIO = m_ObjUsuario
        Exit Property
    End If
    If Me.IDUsuarioCambio = "" Then
        Exit Property
    End If
    Set m_ObjUsuario = constructor.getUsuario(p_ID:=Me.IDUsuarioCambio, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    
    Set USUARIO = m_ObjUsuario
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método UltimoCambio.Usuario ha devuelto el error: " & vbNewLine & Err.Description
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
        .Add "ID"
        .Add "IDExpediente"
        .Add "FechaCambio"
        .Add "IDUsuarioCambio"
    End With
    Set ColCampos = m_objColCampos
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método UltimoCambio.ColCampos ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property


Public Function getPropiedad(m_NombrePropiedad As Variant, Optional ByRef p_Error As String) As Variant

    On Error GoTo errores

    Me.Error = ""
    If m_NombrePropiedad = "ID" Then
        getPropiedad = Me.ID
        Exit Function
    End If
    If m_NombrePropiedad = "IDExpediente" Then
        getPropiedad = Me.IDExpediente
        Exit Function
    End If
    If m_NombrePropiedad = "FechaCambio" Then
        getPropiedad = Me.FechaCambio
        Exit Function
    End If
    If m_NombrePropiedad = "IDUsuarioCambio" Then
        getPropiedad = Me.IDUsuarioCambio
        Exit Function
    End If
    p_Error = "Propiedad no reconocida en UltimoCambio.getPropiedad"
    Err.Raise 1000
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método UltimoCambio.getPropiedad ha devuelto el error:" & vbNewLine & Err.Description
    End If
End Function


Public Function SetPropiedad(m_NombrePropiedad As Variant, m_ValorPropiedad As Variant, Optional ByRef p_Error As String) As String
    On Error GoTo errores

    Me.Error = ""
    p_Error = ""
    If m_NombrePropiedad = "ID" Then
        Me.ID = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "IDExpediente" Then
        Me.IDExpediente = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "FechaCambio" Then
        Me.FechaCambio = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "IDUsuarioCambio" Then
        Me.IDUsuarioCambio = m_ValorPropiedad
        Exit Function
    End If
    p_Error = "Propiedad no reconocida en UltimoCambio.SetPropiedad"
    Err.Raise 1000
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método UltimoCambio.SetPropiedad ha devuelto el error:" & vbNewLine & Err.Description
    End If
End Function
