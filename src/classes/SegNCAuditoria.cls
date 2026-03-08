VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "SegNCAuditoria"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
Option Compare Database
Option Explicit


Public id As String
Public IDAuditoria As String
Public Auditoria As String
Public Descripcion As String
Public Responsable As String 'usuariored
Public Estado As String 'de la tarea 'título del estado
Public FECHACIERRE As String
Public Numero As String
Private m_ObjNC As NCAuditoria
Private m_objColCampos As Collection
Public Error As String
Private m_Error As String



Public Property Get nc() As NCAuditoria
    
    On Error GoTo errores

    Me.Error = ""
    m_Error = ""
    If Not m_ObjNC Is Nothing Then
        Set nc = m_ObjNC
        Exit Property
    End If
    If Me.id = "" Then
        Exit Property
    End If
    Set m_ObjNC = constructor.getNCAuditoria(p_IDNC:=Me.id, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set nc = m_ObjNC
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método SegNCAuditoria.NC ha devuelto el error:" & vbNewLine & Err.Description
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
        .Add "ID"
        .Add "IDAuditoria"
        .Add "Auditoria"
        .Add "DESCRIPCION"
        .Add "Responsable"
        .Add "Estado"
        .Add "FECHACIERRE"
        .Add "Numero"
    End With
    Set ColCampos = m_objColCampos
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método SegNCAuditoria.ColCampos ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property


Public Function getPropiedad(m_NombrePropiedad As Variant, Optional ByRef p_Error As String) As Variant

    On Error GoTo errores

    Me.Error = ""
    If m_NombrePropiedad = "ID" Then
        getPropiedad = Me.id
        Exit Function
    End If
    
    If m_NombrePropiedad = "IDAuditoria" Then
        getPropiedad = Me.IDAuditoria
        Exit Function
    End If
    If m_NombrePropiedad = "Auditoria" Then
        getPropiedad = Me.Auditoria
        Exit Function
    End If
    If m_NombrePropiedad = "DESCRIPCION" Then
        getPropiedad = Me.Descripcion
        Exit Function
    End If
    If m_NombrePropiedad = "Responsable" Then
        getPropiedad = Me.Responsable
        Exit Function
    End If
    If m_NombrePropiedad = "Estado" Then
        getPropiedad = Me.Estado
        Exit Function
    End If
    
    If m_NombrePropiedad = "FECHACIERRE" Then
        getPropiedad = Me.FECHACIERRE
        Exit Function
    End If
    If m_NombrePropiedad = "Numero" Then
        getPropiedad = Me.Numero
        Exit Function
    End If
    p_Error = "Propiedad no reconocida en SegNCAuditoria.getPropiedad"
    Err.Raise 1000
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método SegNCAuditoria.getPropiedad ha devuelto el error:" & vbNewLine & Err.Description
    End If
End Function


Public Function SetPropiedad(m_NombrePropiedad As Variant, m_ValorPropiedad As Variant, Optional ByRef p_Error As String) As String
    On Error GoTo errores

    Me.Error = ""
    p_Error = ""
    If m_NombrePropiedad = "ID" Then
        Me.id = m_ValorPropiedad
        Exit Function
    End If
    
    If m_NombrePropiedad = "IDAuditoria" Then
        Me.IDAuditoria = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "Auditoria" Then
        Me.Auditoria = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "DESCRIPCION" Then
        Me.Descripcion = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "Responsable" Then
        Me.Responsable = m_ValorPropiedad
        Exit Function
    End If
    
    If m_NombrePropiedad = "Estado" Then
        Me.Estado = m_ValorPropiedad
        Exit Function
    End If
    
    If m_NombrePropiedad = "FECHACIERRE" Then
        Me.FECHACIERRE = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "Numero" Then
        Me.Numero = m_ValorPropiedad
        Exit Function
    End If
    p_Error = "Propiedad no reconocida en SegNCAuditoria.SetPropiedad"
    Err.Raise 1000
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método SegNCAuditoria.SetPropiedad ha devuelto el error:" & vbNewLine & Err.Description
    End If
End Function



