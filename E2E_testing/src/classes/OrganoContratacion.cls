VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "OrganoContratacion"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
Option Compare Database
Option Explicit


Public IDOrganoContratacion As String
Public OrganoContratacion As String
Public DESCRIPCION As String

Private m_sIDOrganoContratacionCalculado As String
Private m_objColCampos As Collection
Public Error As String
Private m_Error As String

Public Property Get IDOrganoContratacionCalculado() As String
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    m_sIDOrganoContratacionCalculado = DameID("TbOrganosContratacion", "IDOrganoContratacion", getdb(), m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    IDOrganoContratacionCalculado = m_sIDOrganoContratacionCalculado
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método OrganoContratacion.IDOrganoContratacionCalculado ha devuelto el error: " & vbNewLine & Err.Description
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
        .Add "IDOrganoContratacion"
        .Add "OrganoContratacion"
        .Add "Descripcion"
    End With
    Set ColCampos = m_objColCampos
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método OrganoContratacion.ColCampos ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property


Public Function getPropiedad(m_NombrePropiedad As Variant, Optional ByRef p_Error As String) As Variant

    On Error GoTo errores

    Me.Error = ""
    If m_NombrePropiedad = "IDOrganoContratacion" Then
        getPropiedad = Me.IDOrganoContratacion
        Exit Function
    End If
    If m_NombrePropiedad = "OrganoContratacion" Then
        getPropiedad = Me.OrganoContratacion
        Exit Function
    End If
    If m_NombrePropiedad = "Descripcion" Then
        getPropiedad = Me.DESCRIPCION
        Exit Function
    End If
    p_Error = "Propiedad no reconocida en OrganoContratacion.getPropiedad"
    Err.Raise 1000
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método OrganoContratacion.getPropiedad ha devuelto el error:" & vbNewLine & Err.Description
    End If
End Function


Public Function SetPropiedad(m_NombrePropiedad As Variant, m_ValorPropiedad As Variant, Optional ByRef p_Error As String) As String
    On Error GoTo errores

    Me.Error = ""
    p_Error = ""
    If m_NombrePropiedad = "IDOrganoContratacion" Then
        Me.IDOrganoContratacion = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "OrganoContratacion" Then
        Me.OrganoContratacion = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "Descripcion" Then
        Me.DESCRIPCION = m_ValorPropiedad
        Exit Function
    End If
    p_Error = "Propiedad no reconocida en OrganoContratacion.SetPropiedad"
    Err.Raise 1000
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método OrganoContratacion.SetPropiedad ha devuelto el error:" & vbNewLine & Err.Description
    End If
End Function

