VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "ExpedientePECAL"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
Option Compare Database
Option Explicit


Public IDPECALExpediente As String
Public IDExpediente As String
Public IDPECAL As String

Private m_sIDPECALExpedienteCalculado As String
Private m_ObjPECAL As PECAL
Private m_objColCampos As Collection
Public Error As String
Private m_Error As String

Public Property Get PECAL() As PECAL
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If Not m_ObjPECAL Is Nothing Then
        Set PECAL = m_ObjPECAL
        Exit Property
    End If
    Set m_ObjPECAL = constructor.getPecal(p_IDPEcal:=Me.IDPECAL, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    
    Set PECAL = m_ObjPECAL
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método ExpedientePECAL.PECAL ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Get IDPECALExpedienteCalculado() As String
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    m_sIDPECALExpedienteCalculado = DameID("TbExpedientesPECAL", "IDPECALExpediente", getdb(), m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    IDPECALExpedienteCalculado = m_sIDPECALExpedienteCalculado
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método ExpedientePECAL.IDPECALExpedienteCalculado ha devuelto el error: " & vbNewLine & Err.Description
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
        .Add "IDPECALExpediente"
        .Add "IDExpediente"
        .Add "IDPECAL"
    End With
    Set ColCampos = m_objColCampos
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método ExpedientePECAL.ColCampos ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property


Public Function getPropiedad(m_NombrePropiedad As Variant, Optional ByRef p_Error As String) As Variant

    On Error GoTo errores

    Me.Error = ""
    If m_NombrePropiedad = "IDPECALExpediente" Then
        getPropiedad = Me.IDPECALExpediente
        Exit Function
    End If
    If m_NombrePropiedad = "IDExpediente" Then
        getPropiedad = Me.IDExpediente
        Exit Function
    End If
    If m_NombrePropiedad = "IDPECAL" Then
        getPropiedad = Me.IDPECAL
        Exit Function
    End If
    p_Error = "Propiedad no reconocida en ExpedientePECAL.getPropiedad"
    Err.Raise 1000
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método ExpedientePECAL.getPropiedad ha devuelto el error:" & vbNewLine & Err.Description
    End If
End Function


Public Function SetPropiedad(m_NombrePropiedad As Variant, m_ValorPropiedad As Variant, Optional ByRef p_Error As String) As String
    On Error GoTo errores

    Me.Error = ""
    p_Error = ""
    If m_NombrePropiedad = "IDPECALExpediente" Then
        Me.IDPECALExpediente = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "IDExpediente" Then
        Me.IDExpediente = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "IDPECAL" Then
        Me.IDPECAL = m_ValorPropiedad
        Exit Function
    End If
    p_Error = "Propiedad no reconocida en ExpedientePECAL.SetPropiedad"
    Err.Raise 1000
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método ExpedientePECAL.SetPropiedad ha devuelto el error:" & vbNewLine & Err.Description
    End If
End Function

