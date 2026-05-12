VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "SegTareasProyecto"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
Option Compare Database
Option Explicit

Public IDAccionRealizada As String
Public IdAccionCorrectiva As String
Public IDNoConformidad As String
Public Tarea As String '[NC0146 (NºAC 2)|Tramitar lo que sea
Public Tecnico As String  'nombre
Public Estado As String 'de la tarea 'título del estado
Public FechaInicio As String
Public FechaFinPrevista As String
Public FechaFinReal As String
Public TipoNC As String
Public RespCalidad As String
Public IDExpediente As String
Public NAccion As String

Private m_ObjAR As ARProyecto
Private m_ObjAC As ACProyecto
Private m_ObjNC As NCProyecto
Private m_objColCampos As Collection
Public Error As String
Private m_Error As String

Public Property Get AR() As ARProyecto
    
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
    Set m_ObjAR = constructor.getARProyecto(p_IDAR:=Me.IDAccionRealizada, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set AR = m_ObjAR
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método SegTareasProyecto.AR ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error

End Property


Public Property Get AC() As ACProyecto
    
    On Error GoTo errores

    Me.Error = ""
    m_Error = ""
    If Not m_ObjAC Is Nothing Then
        Set AC = m_ObjAC
        Exit Property
    End If
    If Me.IdAccionCorrectiva = "" Then
        Exit Property
    End If
    Set m_ObjAC = constructor.getACProyecto(p_IDAC:=Me.IdAccionCorrectiva, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set AC = m_ObjAC
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método SegTareasProyecto.AC ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error

End Property

Public Property Get nc() As NCProyecto
    
    On Error GoTo errores

    Me.Error = ""
    m_Error = ""
    If Not m_ObjNC Is Nothing Then
        Set nc = m_ObjNC
        Exit Property
    End If
    If Me.IDNoConformidad = "" Then
        Exit Property
    End If
    Set m_ObjNC = constructor.getNCProyecto(p_IDNC:=Me.IDNoConformidad, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set nc = m_ObjNC
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método SegTareasProyecto.NC ha devuelto el error:" & vbNewLine & Err.Description
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
        .Add "IDAccionRealizada"
        .Add "IdAccionCorrectiva"
        .Add "IDNoConformidad"
        .Add "Tarea"
        .Add "Tecnico"
        .Add "Estado"
        .Add "FechaInicio"
        .Add "FechaFinPrevista"
        .Add "FechaFinReal"
        .Add "TipoNC"
        .Add "RespCalidad"
        .Add "IDExpediente"
        .Add "NAccion"
    End With
    Set ColCampos = m_objColCampos
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método SegTareasProyecto.ColCampos ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property


Public Function getPropiedad(m_NombrePropiedad As Variant, Optional ByRef p_Error As String) As Variant

    On Error GoTo errores

    Me.Error = ""
    If m_NombrePropiedad = "IDAccionRealizada" Then
        getPropiedad = Me.IDAccionRealizada
        Exit Function
    End If
    If m_NombrePropiedad = "IdAccionCorrectiva" Then
        getPropiedad = Me.IdAccionCorrectiva
        Exit Function
    End If
    If m_NombrePropiedad = "IDNoConformidad" Then
        getPropiedad = Me.IDNoConformidad
        Exit Function
    End If
     If m_NombrePropiedad = "Tarea" Then
        getPropiedad = Me.Tarea
        Exit Function
    End If
    If m_NombrePropiedad = "Tecnico" Then
        getPropiedad = Me.Tecnico
        Exit Function
    End If
   
    If m_NombrePropiedad = "Estado" Then
        getPropiedad = Me.Estado
        Exit Function
    End If
    
    If m_NombrePropiedad = "FechaInicio" Then
        getPropiedad = Me.FechaInicio
        Exit Function
    End If
    If m_NombrePropiedad = "FechaFinPrevista" Then
        getPropiedad = Me.FechaFinPrevista
        Exit Function
    End If
    If m_NombrePropiedad = "FechaFinReal" Then
        getPropiedad = Me.FechaFinReal
        Exit Function
    End If
    
    If m_NombrePropiedad = "TipoNC" Then
        getPropiedad = Me.TipoNC
        Exit Function
    End If
    If m_NombrePropiedad = "RespCalidad" Then
        getPropiedad = Me.RespCalidad
        Exit Function
    End If
    If m_NombrePropiedad = "IDExpediente" Then
        getPropiedad = Me.IDExpediente
        Exit Function
    End If
    If m_NombrePropiedad = "NAccion" Then
        getPropiedad = Me.NAccion
        Exit Function
    End If
    p_Error = "Propiedad no reconocida en SegTareasProyecto.getPropiedad"
    Err.Raise 1000
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método SegTareasProyecto.getPropiedad ha devuelto el error:" & vbNewLine & Err.Description
    End If
End Function


Public Function SetPropiedad(m_NombrePropiedad As Variant, m_ValorPropiedad As Variant, Optional ByRef p_Error As String) As String
    On Error GoTo errores

    Me.Error = ""
    p_Error = ""
    If m_NombrePropiedad = "IDAccionRealizada" Then
        Me.IDAccionRealizada = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "IdAccionCorrectiva" Then
        Me.IdAccionCorrectiva = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "IDNoConformidad" Then
        Me.IDNoConformidad = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "Tarea" Then
        Me.Tarea = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "Tecnico" Then
        Me.Tecnico = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "Estado" Then
        Me.Estado = m_ValorPropiedad
        Exit Function
    End If
    
    If m_NombrePropiedad = "FechaInicio" Then
        Me.FechaInicio = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "FechaFinPrevista" Then
        Me.FechaFinPrevista = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "FechaFinReal" Then
        Me.FechaFinReal = m_ValorPropiedad
        Exit Function
    End If
    
    If m_NombrePropiedad = "TipoNC" Then
        Me.TipoNC = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "RespCalidad" Then
        Me.RespCalidad = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "IDExpediente" Then
        Me.IDExpediente = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "NAccion" Then
        Me.NAccion = m_ValorPropiedad
        Exit Function
    End If
    p_Error = "Propiedad no reconocida en SegTareasProyecto.SetPropiedad"
    Err.Raise 1000
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método SegTareasProyecto.SetPropiedad ha devuelto el error:" & vbNewLine & Err.Description
    End If
End Function

