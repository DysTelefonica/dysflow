VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "DocumentoProyectoOperaciones"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
Option Compare Database
Option Explicit

Public Documento As DocumentoProyecto

Public Function Eliminar( _
                            Optional ByRef p_Error As String _
                            ) As String
    
    Dim m_SQL As String
    Dim m_URL As String
    
    On Error GoTo errores
    With Me.Documento
        m_URL = .URLAnexo
        p_Error = .Error
        If p_Error <> "" Then
            Err.Raise 100
        End If
        If fso.FileExists(m_URL) Then
            If FicheroAbierto(m_URL) Then
                p_Error = "El anexo parece estar abierto"
                Err.Raise 1000
            End If
        End If
        If Not .AR Is Nothing Then
        
        
            If .AR.FechaFinReal <> "" Then
                If .AR.Documentos.count = 1 Then
                    p_Error = "Sólo tiene un documento y está cerrada. Se necesita al menos una evidencia"
                    Err.Raise 1000
                End If
            End If
        
        End If
        m_SQL = "DELETE * " & _
                "FROM TbNCDocumentos " & _
                "WHERE IDDocumento=" & .IDDocumento & ";"
        getdb().Execute m_SQL
        If fso.FileExists(m_URL) Then
            fso.DeleteFile m_URL, True
        End If
        If .IDNoConformidad <> "" Then
            RegistrarLogProyecto "Eliminación de Documento; " & .Documento & " de NC:" & .nc.CodigoNoConformidad, , , , p_Error
            If p_Error <> "" Then
                Err.Raise 1000
            End If
        ElseIf .IDAccionRealizada <> "" Then
            RegistrarLogProyecto "Eliminación de Documento; " & .Documento & " AR:" & .AR.AccionRealizada, , , , p_Error
            If p_Error <> "" Then
                Err.Raise 1000
            End If
        End If
        
    End With
    
    
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método DocumentoProyectoOperaciones.Eliminar ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
    End If
    
    
End Function
Private Function DocumentoRepetido( _
                                    p_NombreDocumento As String, _
                                    Optional p_IDNoConformidad As String, _
                                    Optional p_IDAccionRealizada As String, _
                                    Optional p_Error As String _
                                    ) As EnumSino
        
    Dim m_SQL As String
    Dim rcdDatos As dao.Recordset
   
    
    On Error GoTo errores
    If p_NombreDocumento = "" Then
        p_Error = "Falta Documento"
        Err.Raise 1000
    End If
    If p_IDNoConformidad = "" And p_IDAccionRealizada = "" Then
        p_Error = "Falta el p_IDNoConformidad o p_IDAccionRealizada"
        Err.Raise 1000
    End If
    If p_IDNoConformidad <> "" Then
        m_SQL = "SELECT * " & _
                "FROM TbNCDocumentos " & _
                "WHERE IDNoConformidad=" & p_IDNoConformidad & " AND Documento='" & p_NombreDocumento & "';"
    Else
        m_SQL = "SELECT * " & _
                "FROM TbNCDocumentos " & _
                "WHERE IDAccionRealizada=" & p_IDAccionRealizada & " AND Documento='" & p_NombreDocumento & "';"
    End If
    
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            DocumentoRepetido = EnumSino.No
        Else
            DocumentoRepetido = EnumSino.Sí
        End If
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    
    
   
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método DocumentoProyectoOperaciones.DocumentoRepetido ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
    End If
   
    
End Function
Public Function MotivoNoOK( _
                            p_URLArchivoLocal As String, _
                            Optional ByRef p_Error As String _
                            ) As String
    
    Dim m_DocumentoRepetido As EnumSino
    Dim m_URLAnexoFinal As String
    Dim m_ComprobarDocumentoRepetido As Boolean
    On Error GoTo errores
    
   
         
    With Me.Documento
        If .IDNoConformidad = "" And .IDAccionRealizada = "" Then
            MotivoNoOK = "Ha de ser un anexo de NC o de AR de proyecto"
            Exit Function
        End If
        
        
        If .Documento = "" Then
            MotivoNoOK = "No se conoce el documento"
            Exit Function
        End If
        If Not fso.FileExists(p_URLArchivoLocal) Then
            MotivoNoOK = "No es alcanzable el documento en estos momentos"
            Exit Function
        End If
        
        
        m_DocumentoRepetido = DocumentoRepetido(.Documento, .IDNoConformidad, .IDAccionRealizada, p_Error)
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        If m_DocumentoRepetido = EnumSino.Sí Then
            If .IDNoConformidad <> "" Then
                MotivoNoOK = "Ya existe un documento para la misma No Conformidad de proyecto"
            Else
                MotivoNoOK = "Ya existe un documento para la misma Tarea de una No Conformidad de proyecto"
            End If
            
            Exit Function
        End If
        m_URLAnexoFinal = .getURLAnexoFinal(p_URLArchivoLocal, p_Error)
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        If fso.FileExists(m_URLAnexoFinal) Then
            If FicheroAbierto(m_URLAnexoFinal) Then
                MotivoNoOK = "Hay un archivo en el servidor con el mismo nombre y parece que está abierto"
                Exit Function
            End If
        End If
        
    End With
    
    Exit Function
     
errores:
     If Err.Number <> 1000 Then
         p_Error = "El método DocumentoProyectoOperaciones.MotivoNoOK ha devuelto el error: " & Err.Description
     End If
                                
End Function

Public Function Registrar( _
                            p_URLArchivoLocal As String, _
                            Optional ByRef p_Error As String _
                            ) As String
    
    Dim rcdDatos As dao.Recordset
    Dim m_SQL As String
    Dim m_MotivoNoOK As String
    Dim m_URLFinal As String
    
    On Error GoTo errores
    
   
    
    With Me.Documento
        m_MotivoNoOK = MotivoNoOK(p_URLArchivoLocal, p_Error)
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        p_Error = m_MotivoNoOK
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        m_URLFinal = .getURLAnexoFinal(p_URLArchivoLocal, p_Error)
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        .NombreAnexo = fso.GetFileName(m_URLFinal)
        m_SQL = "TbNCDocumentos"
        .IDDocumento = .IDDocumentoCalculado
        .IDNoConformidadResultante = .IDNoConformidadResultanteCalculado
        p_Error = .Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        Set rcdDatos = getdb().OpenRecordset(m_SQL)
        rcdDatos.AddNew
         rcdDatos.Fields("IDDocumento") = .IDDocumento
        If .IDNoConformidad <> "" Then
            rcdDatos.Fields("IDNoConformidad") = .IDNoConformidad
        End If
        If .IDAccionRealizada <> "" Then
            rcdDatos.Fields("IDAccionRealizada") = .IDAccionRealizada
        End If
        If .IDNoConformidadResultante <> "" Then
            rcdDatos.Fields("IDNoConformidadResultante") = .IDNoConformidadResultante
        End If
         
         rcdDatos.Fields("Documento") = .Documento
         rcdDatos.Fields("NombreAnexo") = .NombreAnexo
             
         rcdDatos.Update
         If .IDNoConformidad <> "" Then
            RegistrarLogProyecto "Alta de Documento de NC de Proyecto", , , , p_Error
         Else
            RegistrarLogProyecto "Alta de Documento de AR de Proyecto", , , , p_Error
         End If
         
         If p_Error <> "" Then
             Err.Raise 1000
         End If
    
        rcdDatos.Close
        Set rcdDatos = Nothing
        fso.CopyFile p_URLArchivoLocal, .URLAnexo, True
    End With
    
    
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método DocumentoProyectoOperaciones.Registrar ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
    End If
    
    
End Function

Public Function CambiarNombre( _
                                p_NombreDocumento As String, _
                                Optional ByRef p_Error As String _
                                ) As String
    Dim m_DocumentoRepetido As EnumSino
    Dim m_SQL As String
    
    On Error GoTo errores
    
    With Me.Documento
        If .IDDocumento = "" Then
            p_Error = "No se conoce el IDDOcumento"
            Err.Raise 1000
        End If
        If p_NombreDocumento = "" Then
            p_Error = "No se conoce el Nombre del Documento"
            Err.Raise 1000
        End If
        
        m_DocumentoRepetido = DocumentoRepetido(p_NombreDocumento, .IDNoConformidad, .IDAccionRealizada, p_Error)
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        If m_DocumentoRepetido = EnumSino.Sí Then
            If .IDNoConformidad <> "" Then
                p_Error = "Ya existe un documento para la misma No Conformidad de proyecto"
            Else
                p_Error = "Ya existe un documento para la misma Tarea de una No Conformidad de proyecto"
            End If
            
            Err.Raise 1000
        End If
        m_SQL = "UPDATE TbNCDocumentos SET Documento = '" & p_NombreDocumento & "' " & _
                "WHERE IDDocumento=" & .IDDocumento & ";"
        getdb().Execute m_SQL
    End With
    
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método DocumentoProyectoOperaciones.CambiarNombre ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
    End If
    
    
End Function

