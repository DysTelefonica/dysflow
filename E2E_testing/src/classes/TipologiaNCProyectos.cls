VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "TipologiaNCProyectos"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
Option Compare Database
Option Explicit

Public IDTipo As String
Public Tipologia As String

Private m_sIDTipoCalculado As String
Private m_objColCampos As Collection
Public Error As String
Private m_Error As String

Public Property Get IDTipoCalculado() As String

    On Error GoTo errores
    Me.Error = ""
    m_Error = ""
    m_sIDTipoCalculado = constructor.getID("TbTiposNCProyectos", "IDTipo", getdb(), m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    IDTipoCalculado = m_sIDTipoCalculado
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método TipologiaNCProyectos.IDTipoCalculado ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error

End Property



Private Function MotivoNoOK( _
                                Optional ByRef p_TipologiaAlInicio As TipologiaNCProyectos, _
                                Optional ByRef p_Error As String _
                                ) As String
    
    Dim m_Tipo As TipologiaNCProyectos
    
    On Error GoTo errores
    p_Error = ""
    With Me
        
        If .Tipologia = "" Then
            MotivoNoOK = "No se conoce Tipologia"
            Exit Function
        End If
        If p_TipologiaAlInicio Is Nothing Then
            Set m_Tipo = constructor.getTipologiaNCProyecto(p_Tipologia:=.Tipologia, p_Error:=p_Error)
            If p_Error <> "" Then
                Err.Raise 1000
            End If
            
            If Not m_Tipo Is Nothing Then
                MotivoNoOK = "La tipología está repetida"
                Exit Function
            End If
            
        Else
            If p_TipologiaAlInicio.Tipologia <> .Tipologia Then
               Set m_Tipo = constructor.getTipologiaNCProyecto(p_Tipologia:=.Tipologia, p_Error:=p_Error)
                If p_Error <> "" Then
                    Err.Raise 1000
                End If
                
                If Not m_Tipo Is Nothing Then
                    MotivoNoOK = "La tipología está repetida"
                    Exit Function
                End If
            End If
            
        End If
        
        
        
        
    End With
    
    Exit Function
     
errores:
     If Err.Number <> 1000 Then
         p_Error = "El método TipologiaNCProyectos.MotivoNoOK ha devuelto el error: " & Err.Description
     End If
                                
End Function
Private Function MotivoNoOKEliminar( _
                                    Optional ByRef p_Error As String _
                                    ) As String
    
    Dim m_Col As Scripting.Dictionary
    
    
    On Error GoTo errores
    
   
    Set m_Col = constructor.getNCsPorTipoNCProyecto(p_IDTipo:=Me.IDTipo, p_Error:=p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If Not m_Col Is Nothing Then
        MotivoNoOKEliminar = "El código ha formado parte de " & m_Col.count & " NC's"
        Exit Function
    End If
    
    Exit Function
     
errores:
     If Err.Number <> 1000 Then
         p_Error = "El método TipologiaNCProyectos.MotivoNoOKEliminar ha devuelto el error: " & Err.Description
     End If
                                
End Function
Public Function Registrar( _
                            Optional ByRef p_TipologiaAlInicio As TipologiaNCProyectos, _
                             Optional ByRef p_Error As String _
                            ) As String
                                        
                            
                           
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_MotivoNoOK As String
    
    
    On Error GoTo errores
    
    Me.Error = ""
    p_Error = ""
    
    m_MotivoNoOK = MotivoNoOK(p_TipologiaAlInicio, p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    p_Error = m_MotivoNoOK
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If p_TipologiaAlInicio Is Nothing Then
        m_SQL = "TbTiposNCProyectos"
        Me.IDTipo = Me.IDTipoCalculado
    Else
        m_SQL = "SELECT * FROM TbTiposNCProyectos " & _
            "WHERE IDTipo=" & p_TipologiaAlInicio.IDTipo & ";"
    End If
    
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        If Not p_TipologiaAlInicio Is Nothing Then
            If .EOF Then
                p_Error = "No se ha encontrado el registro"
                Err.Raise 1000
            End If
        End If
        If p_TipologiaAlInicio Is Nothing Then
            .AddNew
                .Fields("IDTipo") = Me.IDTipo
                .Fields("Tipologia") = Me.Tipologia
            .Update
            RegistrarLogProyecto "Alta de Tipo: " & Me.Tipologia, , , , p_Error
            If p_Error <> "" Then
                Err.Raise 1000
            End If
        Else
            .Edit
               
                .Fields("Tipologia") = Me.Tipologia
            .Update
            RegistrarLogProyecto "Edición de Tipo: " & Me.Tipologia, , , , p_Error
            If p_Error <> "" Then
                Err.Raise 1000
            End If
        End If
        
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    
    
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método TipologiaNCProyectos.Registrar ha devuelto el error: " & Err.Description
    End If
End Function
Public Function Eliminar( _
                            Optional ByRef p_Error As String _
                            ) As String
    
    Dim m_SQL As String
    Dim m_MotivoNoOKEliminar As String
    
    
    On Error GoTo errores
    If Me.IDTipo = "" Then
        p_Error = "No está registrada el código del tipo"
        Err.Raise 1000
    End If
    m_MotivoNoOKEliminar = MotivoNoOKEliminar(p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    p_Error = m_MotivoNoOKEliminar
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    
    
    
    m_SQL = "DELETE * " & _
            "FROM TbTiposNCProyectos " & _
            "WHERE IDTipo=" & Me.IDTipo & ";"
    getdb().Execute m_SQL
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método TipologiaNCProyectos.Eliminar ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
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
        .Add "IDTipo"
        .Add "Tipologia"
    End With
    Set ColCampos = m_objColCampos
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método TipologiaNCProyectos.ColCampos ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property




Public Function getPropiedad(m_NombrePropiedad As Variant, Optional ByRef p_Error As String) As Variant

    On Error GoTo errores

    Me.Error = ""
    If m_NombrePropiedad = "IDTipo" Then
        getPropiedad = Me.IDTipo
        Exit Function
    End If
    If m_NombrePropiedad = "Tipologia" Then
        getPropiedad = Me.Tipologia
        Exit Function
    End If
    p_Error = "Propiedad no reconocida en TipologiaNCProyectos.getPropiedad"
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método TipologiaNCProyectos.getPropiedad ha devuelto el error:" & vbNewLine & Err.Description
    End If
End Function


Public Function SetPropiedad(m_NombrePropiedad As Variant, m_ValorPropiedad As Variant, Optional ByRef p_Error As String) As String
    On Error GoTo errores

    Me.Error = ""
    p_Error = ""
    If m_NombrePropiedad = "IDTipo" Then
        Me.IDTipo = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "Tipologia" Then
        Me.Tipologia = m_ValorPropiedad
        Exit Function
    End If
    p_Error = "Propiedad no reconocida en TipologiaNCProyectos.SetPropiedad"
    Err.Raise 1000
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método TipologiaNCProyectos.SetPropiedad ha devuelto el error:" & vbNewLine & Err.Description
    End If
End Function




