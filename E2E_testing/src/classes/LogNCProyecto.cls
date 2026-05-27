VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "LogNCProyecto"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
Option Compare Database
Option Explicit

Public IDLog As String
Public idNC As String
Public idAC As String
Public idAR As String
Public usuario As String
Public FECHA As String
Public Titulo As String
Public Linea As String


Public col As Collection

Private m_ObjNC As ncProyecto
Private m_ObjAC As ACProyecto
Private m_ObjAR As ARProyecto
Private m_ObjUsuarioObj As usuario
Private m_sIDLogCalculado As String
Private m_sLineaResultante As String
Public Error As String
Private m_Error As String
Private m_objColCampos As Collection


Public Property Get nc() As ncProyecto
    On Error GoTo errores
    Me.Error = ""
    m_Error = ""
    If Not m_ObjNC Is Nothing Then
        Set nc = m_ObjNC
        Exit Property
    End If
    If Me.idNC = "" Then
        Exit Property
    End If
    Set m_ObjNC = constructor.getNCProyecto(p_IDNC:=Me.idNC, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set nc = m_ObjNC
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método LogNC.NC ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Get AC() As ACProyecto
    On Error GoTo errores
    Me.Error = ""
    m_Error = ""
    
    If Not m_ObjAC Is Nothing Then
        Set AC = m_ObjAC
        Exit Property
    End If
    If Me.idAC = "" Then
        Exit Property
    End If
    Set m_ObjAC = constructor.getACProyecto(p_IDAC:=Me.idAC, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set AC = m_ObjAC
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método LogAC.AC ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Get AR() As ARProyecto
    On Error GoTo errores
    Me.Error = ""
    m_Error = ""
    If Not m_ObjAR Is Nothing Then
        Set AR = m_ObjAR
        Exit Property
    End If
    
    If Me.idAR = "" Then
        Exit Property
    End If
    Set m_ObjAR = constructor.getARProyecto(p_IDAR:=Me.idAR, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set AR = m_ObjAR
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método LogAR.AR ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Get UsuarioObj() As usuario
    On Error GoTo errores
    Me.Error = ""
    m_Error = ""
    If Not m_ObjUsuarioObj Is Nothing Then
        Set UsuarioObj = m_ObjUsuarioObj
        Exit Property
    End If
    If Me.usuario = "" Then
        Exit Property
    End If
    Set m_ObjUsuarioObj = constructor.getUsuario(, Me.usuario, , , m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set UsuarioObj = m_ObjUsuarioObj
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método LogNC.UsuarioObj ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Get IDLogCalculado() As String

    On Error GoTo errores
    Me.Error = ""
    m_Error = ""
    m_sIDLogCalculado = constructor.getID("TbLog", "IDLog", getdb(), m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    IDLogCalculado = m_sIDLogCalculado
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método LogNC.IDLogCalculado ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Get LineaResultante() As String
    
    Dim m_Linea As String
    Dim m_LineaCol As String
    Dim m_ID As Variant
    
    
    On Error GoTo errores
    Me.Error = ""
    m_Error = ""
    m_Linea = Me.Linea
    If Me.col Is Nothing Then
        m_sLineaResultante = m_Linea
        LineaResultante = m_sLineaResultante
        Exit Property
    End If
    For Each m_ID In Me.col
        m_LineaCol = m_LineaCol & vbNewLine & m_ID
    Next
    If m_Linea <> "" Then
        m_sLineaResultante = m_Linea & vbNewLine & m_LineaCol
    Else
         m_sLineaResultante = m_LineaCol
    End If
   
    LineaResultante = m_sLineaResultante
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método LogNC.LineaResultante ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Function Alta( _
                        Optional ByRef p_Error As String _
                        ) As String
    
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_lineaResultante As String
    
    On Error GoTo errores
    
    If Me.Titulo = "" Then
        p_Error = "Se ha de indicar el título"
        Err.Raise 1000
    End If
    
    
    Me.FECHA = Now()
    Me.IDLog = Me.IDLogCalculado
   
    p_Error = Me.Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    m_lineaResultante = Me.LineaResultante
    p_Error = Me.Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    m_SQL = "SELECT * " & _
            "FROM TbLog " & _
            "WHERE IDLog=" & Me.IDLog & ";"
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        If Not .EOF Then
            p_Error = "El método DameID no ha devuelto un valor con formato válido"
            Err.Raise 1000
        End If
        .AddNew
            .Fields("IDLog") = Me.IDLog
            .Fields("Titulo") = Me.Titulo
            If m_lineaResultante <> "" Then
                .Fields("Linea") = m_lineaResultante
            End If
            
            .Fields("Fecha") = Me.FECHA
            .Fields("Usuario") = Me.usuario
            If IsNumeric(Me.idNC) Then
                .Fields("IDNC") = Me.idNC
            End If
            If IsNumeric(Me.idAC) Then
                .Fields("IDAC") = Me.idAC
            End If
            If IsNumeric(Me.idAR) Then
                .Fields("IDAR") = Me.idAR
            End If
        .Update
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método logNC.Alta ha producido el error nº: " & Err.Number & _
        vbNewLine & "Detalle: " & Err.Description
    End If
    
End Function

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
        .Add "IDLog"
        .Add "IDNC"
        .Add "IDAC"
        .Add "IDAR"
        .Add "Usuario"
        .Add "Fecha"
        .Add "Titulo"
        .Add "Linea"
    End With
    Set ColCampos = m_objColCampos
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Log.ColCampos ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property

Public Function getPropiedad(m_NombrePropiedad As Variant, Optional ByRef p_Error As String) As Variant
    
    On Error GoTo errores
    
    Me.Error = ""
    p_Error = ""
    If m_NombrePropiedad = "IDLog" Then
        getPropiedad = Me.IDLog
        Exit Function
    End If
     If m_NombrePropiedad = "IDNC" Then
        getPropiedad = Me.idNC
        Exit Function
    End If
    If m_NombrePropiedad = "IDAC" Then
        getPropiedad = Me.idAC
        Exit Function
    End If
    If m_NombrePropiedad = "IDAR" Then
        getPropiedad = Me.idAR
        Exit Function
    End If
    If m_NombrePropiedad = "Usuario" Then
        getPropiedad = Me.usuario
        Exit Function
    End If
    
    If m_NombrePropiedad = "FECHA" Then
        getPropiedad = Me.FECHA
        Exit Function
    End If
    If m_NombrePropiedad = "Titulo" Then
        getPropiedad = Me.Titulo
        Exit Function
    End If
    If m_NombrePropiedad = "Linea" Then
        getPropiedad = Me.Linea
        Exit Function
    End If
    
    p_Error = "Propiedad no reconocida en NC.getPropiedad"
    Err.Raise 1000
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El metodo LogNC.getPropiedad ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function



Public Function SetPropiedad(m_NombrePropiedad As Variant, m_ValorPropiedad As Variant, Optional ByRef p_Error As String) As String
    
    On Error GoTo errores
    
    Me.Error = ""
    p_Error = ""
    
    If m_NombrePropiedad = "IDLog" Then
        Me.IDLog = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "IDNC" Then
        Me.idNC = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "IDAC" Then
        Me.idAC = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "IDAR" Then
        Me.idAR = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "Usuario" Then
        Me.usuario = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "FECHA" Then
        Me.FECHA = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "Titulo" Then
        Me.Titulo = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "Linea" Then
        Me.Linea = m_ValorPropiedad
        Exit Function
    End If
    p_Error = "Propiedad no reconocida en NC.SetPropiedad"
    Err.Raise 1000
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El metodo NC.SetPropiedad ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function








