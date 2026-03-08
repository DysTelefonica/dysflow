VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "ReplanificacionesAuditoria"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
Option Compare Database
Option Explicit

Public IDReplanificacion As String
Public IDNoConformidad As String
Public IDAccionRealizada As String
Public FechaReprogramacion As String
Public FechaPrevistaAlInicio As String
Public FechaPrevistaReplanificada As String
Public Observaciones As String


Private m_sIDReplanificacionCalculada As String
Private m_ObjNC As NCAuditoria
Private m_ObjAR As ARAuditoria
Private m_ObjAC As ACAuditoria
Private m_sURLAnexo As String
Private m_eEsMitigacionCalculada As EnumSino


Private m_objColCampos As Collection
Public Error As String
Private m_Error As String


Public Property Get IDReplanificacionCalculada() As String
    
    On Error GoTo errores

    Me.Error = ""
    m_Error = ""
    m_sIDReplanificacionCalculada = constructor.getID("TbReplanificacionesAuditoria", "IDReplanificacion", getdb(), m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    IDReplanificacionCalculada = m_sIDReplanificacionCalculada
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método ReplanificacionesAuditoria.IDReplanificacionCalculada ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property

Public Property Get nc() As NCAuditoria
    
    On Error GoTo errores

    Me.Error = ""
    m_Error = ""
    If Not m_ObjNC Is Nothing Then
        Set nc = m_ObjNC
        Exit Property
    End If
    If Not Me.AC Is Nothing Then
        Set m_ObjNC = Me.AC.nc
    End If
    
    Set nc = m_ObjNC
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método ReplanificacionesAuditoria.NC ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property
Public Property Get AR() As ARAuditoria
    
    On Error GoTo errores

    Me.Error = ""
    m_Error = ""
    If Not m_ObjAR Is Nothing Then
        Set AR = m_ObjAR
        Exit Property
    End If
    If Me.IDAccionRealizada = "" Then
        Exit Property
    End If
    Set m_ObjAR = constructor.getARAuditoria(p_IDAR:=Me.IDAccionRealizada, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set AR = m_ObjAR
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método ReplanificacionesAuditoria.AR ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property

Public Property Get AC() As ACAuditoria
    
    On Error GoTo errores

    Me.Error = ""
    m_Error = ""
    If Not m_ObjAC Is Nothing Then
        Set AC = m_ObjAC
        Exit Property
    End If
    If Me.AR Is Nothing Then
        Exit Property
    End If
    
    Set m_ObjAC = Me.AR.AC
    
    Set AC = m_ObjAC
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método ReplanificacionesAuditoria.AC ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
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
        .Add "IDReplanificacion"
        .Add "IDNoConformidad"
        .Add "IDAccionRealizada"
        .Add "FechaReprogramacion"
        .Add "FechaPrevistaAlInicio"
        .Add "FechaPrevistaReplanificada"
        .Add "Observaciones"
    End With
    Set ColCampos = m_objColCampos
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método ReplanificacionesAuditoria.ColCampos ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property


Public Function getPropiedad(m_NombrePropiedad As Variant, Optional ByRef p_Error As String) As Variant

    On Error GoTo errores

    Me.Error = ""
    If m_NombrePropiedad = "IDReplanificacion" Then
        getPropiedad = Me.IDReplanificacion
        Exit Function
    End If
    
    If m_NombrePropiedad = "IDNoConformidad" Then
        getPropiedad = Me.IDNoConformidad
        Exit Function
    End If
    If m_NombrePropiedad = "IDAccionRealizada" Then
        getPropiedad = Me.IDAccionRealizada
        Exit Function
    End If
    If m_NombrePropiedad = "FechaReprogramacion" Then
        getPropiedad = Me.FechaReprogramacion
        Exit Function
    End If
    If m_NombrePropiedad = "FechaPrevistaAlInicio" Then
        getPropiedad = Me.FechaPrevistaAlInicio
        Exit Function
    End If
    If m_NombrePropiedad = "FechaPrevistaReplanificada" Then
        getPropiedad = Me.FechaPrevistaReplanificada
        Exit Function
    End If
    If m_NombrePropiedad = "Observaciones" Then
        getPropiedad = Me.Observaciones
        Exit Function
    End If
    p_Error = "Propiedad no reconocida en ReplanificacionesAuditoria.getPropiedad"
    Err.Raise 1000
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método ReplanificacionesAuditoria.getPropiedad ha devuelto el error:" & vbNewLine & Err.Description
    End If
End Function


Public Function SetPropiedad(m_NombrePropiedad As Variant, m_ValorPropiedad As Variant, Optional ByRef p_Error As String) As String
    On Error GoTo errores

    Me.Error = ""
    p_Error = ""
    If m_NombrePropiedad = "IDReplanificacion" Then
        Me.IDReplanificacion = m_ValorPropiedad
        Exit Function
    End If
    
    If m_NombrePropiedad = "IDNoConformidad" Then
        Me.IDNoConformidad = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "IDAccionRealizada" Then
        Me.IDAccionRealizada = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "FechaReprogramacion" Then
        Me.FechaReprogramacion = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "FechaPrevistaAlInicio" Then
        Me.FechaPrevistaAlInicio = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "FechaPrevistaReplanificada" Then
        Me.FechaPrevistaReplanificada = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "Observaciones" Then
        Me.Observaciones = m_ValorPropiedad
        Exit Function
    End If
    p_Error = "Propiedad no reconocida en ReplanificacionesAuditoria.SetPropiedad"
    Err.Raise 1000
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método ReplanificacionesAuditoria.SetPropiedad ha devuelto el error:" & vbNewLine & Err.Description
    End If
End Function



