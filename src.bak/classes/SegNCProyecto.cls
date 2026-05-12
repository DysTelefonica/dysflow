VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "SegNCProyecto"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
Option Compare Database
Option Explicit


Public IDNoConformidad As String
Public CodigoNoConformidad As String
Public Descripcion As String
Public Nemotecnico As String
Public Estado As String 'de la tarea 'título del estado
Public NombreCalidad As String 'usuariored
Public Tecnico As String  'nombre
Public IDExpediente As String
Public RequiereControlEficacia As String
Public ResultadoControlEficacia As String
Public FECHACIERRE As String

Private m_ObjNC As NCProyecto
Private m_objColCampos As Collection
Public Error As String
Private m_Error As String



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
        .Add "IDNoConformidad"
        .Add "CodigoNoConformidad"
        .Add "DESCRIPCION"
        .Add "Nemotecnico"
        .Add "Estado"
        .Add "NombreCalidad"
        .Add "Tecnico"
        .Add "IDExpediente"
        .Add "RequiereControlEficacia"
        .Add "ResultadoControlEficacia"
        .Add "FECHACIERRE"
        
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
    If m_NombrePropiedad = "IDNoConformidad" Then
        getPropiedad = Me.IDNoConformidad
        Exit Function
    End If
    If m_NombrePropiedad = "CodigoNoConformidad" Then
        getPropiedad = Me.CodigoNoConformidad
        Exit Function
    End If
    If m_NombrePropiedad = "DESCRIPCION" Then
        getPropiedad = Me.Descripcion
        Exit Function
    End If
     If m_NombrePropiedad = "Nemotecnico" Then
        getPropiedad = Me.Nemotecnico
        Exit Function
    End If
    If m_NombrePropiedad = "Estado" Then
        getPropiedad = Me.Estado
        Exit Function
    End If
   
    If m_NombrePropiedad = "NombreCalidad" Then
        getPropiedad = Me.NombreCalidad
        Exit Function
    End If
    
    If m_NombrePropiedad = "Tecnico" Then
        getPropiedad = Me.Tecnico
        Exit Function
    End If
    If m_NombrePropiedad = "IDExpediente" Then
        getPropiedad = Me.IDExpediente
        Exit Function
    End If
    If m_NombrePropiedad = "RequiereControlEficacia" Then
        getPropiedad = Me.RequiereControlEficacia
        Exit Function
    End If
    
    If m_NombrePropiedad = "ResultadoControlEficacia" Then
        getPropiedad = Me.ResultadoControlEficacia
        Exit Function
    End If
    If m_NombrePropiedad = "FECHACIERRE" Then
        getPropiedad = Me.FECHACIERRE
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
    If m_NombrePropiedad = "IDNoConformidad" Then
        Me.IDNoConformidad = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "CodigoNoConformidad" Then
        Me.CodigoNoConformidad = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "DESCRIPCION" Then
        Me.Descripcion = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "Nemotecnico" Then
        Me.Nemotecnico = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "Estado" Then
        Me.Estado = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "NombreCalidad" Then
        Me.NombreCalidad = m_ValorPropiedad
        Exit Function
    End If
    
    If m_NombrePropiedad = "Tecnico" Then
        Me.Tecnico = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "IDExpediente" Then
        Me.IDExpediente = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "RequiereControlEficacia" Then
        Me.RequiereControlEficacia = m_ValorPropiedad
        Exit Function
    End If
    
    If m_NombrePropiedad = "ResultadoControlEficacia" Then
        Me.ResultadoControlEficacia = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "FECHACIERRE" Then
        Me.FECHACIERRE = m_ValorPropiedad
        Exit Function
    End If
    
    p_Error = "Propiedad no reconocida en SegNCProyecto.SetPropiedad"
    Err.Raise 1000
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método SegNCProyecto.SetPropiedad ha devuelto el error:" & vbNewLine & Err.Description
    End If
End Function


