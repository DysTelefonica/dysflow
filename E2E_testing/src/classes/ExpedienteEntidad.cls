VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "ExpedienteEntidad"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
Option Compare Database
Option Explicit

Public IDExpediente As String
Public Clasificacion As String
Public OrganoContratacion As String
Public OficinaPrograma As String
Public Ejercito As String
Public responsableCalidad As String
Public responsableSeguridad As String
Public CadenaPecal As String
Public PECAL As String
Public CadenaContratistas As String
Public CadenaSubContratistas As String

Public CadenaComerciales As String
Public CadenaJPs As String
Public CadenaRACs As String
Public CadenaCorreoRACs As String
Public CadenaHitos As String
Public TipoParaLista As String
Public CadenaLugares As String

Private m_ObjExpediente As Expediente

Private m_objColCampos As Collection
Public Error As String
Private m_Error As String

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
        m_Error = "El método ExpedienteCPV.Expediente ha devuelto el error: " & vbNewLine & Err.Description
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
        .Add "IDExpediente"
        .Add "Clasificacion"
        .Add "OrganoContratacion"
        .Add "OficinaPrograma"
        .Add "Ejercito"
        .Add "ResponsableCalidad"
        .Add "ResponsableSeguridad"
        .Add "CadenaPecal"
        .Add "Pecal"
        .Add "CadenaContratistas"
        .Add "CadenaSubContratistas"
        .Add "CadenaJPs"
        .Add "CadenaRACs"
        .Add "CadenaCorreoRACs"
        .Add "CadenaHitos"
        .Add "TipoParaLista"
        .Add "CadenaLugares"
    End With
    Set ColCampos = m_objColCampos
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método ExpedienteEntidad.ColCampos ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property


Public Function getPropiedad(m_NombrePropiedad As Variant, Optional ByRef p_Error As String) As Variant

    On Error GoTo errores

    Me.Error = ""
    If m_NombrePropiedad = "IDExpediente" Then
        getPropiedad = Me.IDExpediente
        Exit Function
    End If
    If m_NombrePropiedad = "Clasificacion" Then
        getPropiedad = Me.Clasificacion
        Exit Function
    End If
    If m_NombrePropiedad = "OrganoContratacion" Then
        getPropiedad = Me.OrganoContratacion
        Exit Function
    End If
    If m_NombrePropiedad = "OficinaPrograma" Then
        getPropiedad = Me.OficinaPrograma
        Exit Function
    End If
    If m_NombrePropiedad = "Ejercito" Then
        getPropiedad = Me.Ejercito
        Exit Function
    End If
    
    If m_NombrePropiedad = "ResponsableCalidad" Then
        getPropiedad = Me.responsableCalidad
        Exit Function
    End If
    If m_NombrePropiedad = "ResponsableSeguridad" Then
        getPropiedad = Me.responsableSeguridad
        Exit Function
    End If
    If m_NombrePropiedad = "CadenaPecal" Then
        getPropiedad = Me.CadenaPecal
        Exit Function
    End If
    If m_NombrePropiedad = "Pecal" Then
        getPropiedad = Me.PECAL
        Exit Function
    End If
    If m_NombrePropiedad = "CadenaContratistas" Then
        getPropiedad = Me.CadenaContratistas
        Exit Function
    End If
    If m_NombrePropiedad = "CadenaSubContratistas" Then
        getPropiedad = Me.CadenaSubContratistas
        Exit Function
    End If
    
    If m_NombrePropiedad = "CadenaComerciales" Then
        getPropiedad = Me.CadenaComerciales
        Exit Function
    End If
    If m_NombrePropiedad = "CadenaJPs" Then
        getPropiedad = Me.CadenaJPs
        Exit Function
    End If
    If m_NombrePropiedad = "CadenaRACs" Then
        getPropiedad = Me.CadenaRACs
        Exit Function
    End If
    If m_NombrePropiedad = "CadenaCorreoRACs" Then
        getPropiedad = Me.CadenaCorreoRACs
        Exit Function
    End If
    If m_NombrePropiedad = "CadenaHitos" Then
        getPropiedad = Me.CadenaHitos
        Exit Function
    End If
    If m_NombrePropiedad = "TipoParaLista" Then
        getPropiedad = Me.TipoParaLista
        Exit Function
    End If
    If m_NombrePropiedad = "CadenaLugares" Then
        getPropiedad = Me.CadenaLugares
        Exit Function
    End If
    p_Error = "Propiedad no reconocida en ExpedienteEntidad.getPropiedad"
    Err.Raise 1000
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método ExpedienteEntidad.getPropiedad ha devuelto el error:" & vbNewLine & Err.Description
    End If
End Function


Public Function SetPropiedad(m_NombrePropiedad As Variant, m_ValorPropiedad As Variant, Optional ByRef p_Error As String) As String
    On Error GoTo errores

    Me.Error = ""
    p_Error = ""
    If m_NombrePropiedad = "IDExpediente" Then
        Me.IDExpediente = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "Clasificacion" Then
        Me.Clasificacion = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "OrganoContratacion" Then
        Me.OrganoContratacion = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "OficinaPrograma" Then
        Me.OficinaPrograma = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "Ejercito" Then
        Me.Ejercito = m_ValorPropiedad
        Exit Function
    End If
    
    If m_NombrePropiedad = "ResponsableCalidad" Then
        Me.responsableCalidad = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "ResponsableSeguridad" Then
        Me.responsableSeguridad = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "CadenaPecal" Then
        Me.CadenaPecal = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "Pecal" Then
        Me.PECAL = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "CadenaContratistas" Then
        Me.CadenaContratistas = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "CadenaSubContratistas" Then
        Me.CadenaSubContratistas = m_ValorPropiedad
        Exit Function
    End If
    
    If m_NombrePropiedad = "CadenaComerciales" Then
        Me.CadenaComerciales = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "CadenaJPs" Then
        Me.CadenaJPs = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "CadenaRACs" Then
        Me.CadenaRACs = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "CadenaCorreoRACs" Then
        Me.CadenaCorreoRACs = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "CadenaHitos" Then
        Me.CadenaHitos = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "TipoParaLista" Then
        Me.TipoParaLista = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "CadenaLugares" Then
        Me.CadenaLugares = m_ValorPropiedad
        Exit Function
    End If
    p_Error = "Propiedad no reconocida en ExpedienteEntidad.SetPropiedad"
    Err.Raise 1000
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método ExpedienteEntidad.SetPropiedad ha devuelto el error:" & vbNewLine & Err.Description
    End If
End Function

