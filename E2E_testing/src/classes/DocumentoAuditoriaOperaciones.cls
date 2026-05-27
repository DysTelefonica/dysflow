VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "DocumentoAuditoriaOperaciones"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
Option Compare Database
Option Explicit


Public Documento As DocumentoAuditoria
Private m_Error
Public Error As String

Public Function Registrar( _
                            p_URLArchivoLocal As String, _
                            Optional ByRef p_Error As String _
                            ) As String
                                        
     Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_MotivoNoOK As String
    Dim m_URLFinal As String
   
    On Error GoTo errores
    
    Me.Error = ""
    p_Error = ""
   
    With Documento
        m_MotivoNoOK = MotivoNoOK(p_URLArchivoLocal, p_Error)
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        p_Error = m_MotivoNoOK
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        m_URLFinal = .getURLAnexoFinal(p_URLArchivoLocal, EnumSino.Sí, p_Error)
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        If fso.FileExists(m_URLFinal) Then
            If FicheroAbierto(m_URLFinal) Then
                p_Error = "Ya hay un archivo con el mismo nombre y parece estar abierto"
                Err.Raise 1000
            End If
        End If
        .NombreAnexo = fso.GetFileName(m_URLFinal)
        
    End With
   
    m_SQL = "TbDocumentosAuditorias"
    
    With Me.Documento
        
        .IDDocumento = .IDDocumentoCalculado
        .NombreAnexo = fso.GetFileName(m_URLFinal)
        
    End With
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        .AddNew
            .Fields("IDDocumento") = Me.Documento.IDDocumento
            If Me.Documento.IDAuditoria <> "" Then
                .Fields("IDAuditoria") = Me.Documento.IDAuditoria
            End If
            
            If Me.Documento.IDAccionRealizada <> "" Then
                .Fields("IDAccionRealizada") = Me.Documento.IDAccionRealizada
            End If
            If Me.Documento.IDNoConformidad <> "" Then
                .Fields("IDNoConformidad") = Me.Documento.IDNoConformidad
            End If
            If Me.Documento.IDAuditoriaResultante <> "" Then
                .Fields("IDAuditoriaResultante") = Me.Documento.IDAuditoriaResultante
            End If
            .Fields("Documento") = Me.Documento.Documento
            .Fields("NombreAnexo") = Me.Documento.NombreAnexo
            
        .Update
    
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    
    
    fso.CopyFile p_URLArchivoLocal, m_URLFinal, True
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método DocumentoAuditoriaOperaciones.Registrar ha devuelto el error: " & Err.Description
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
        If .IDNoConformidad = "" And .IDAccionRealizada = "" And Me.Documento.IDAuditoria = "" Then
            MotivoNoOK = "Ha de ser un anexo de NC o de AR de Auditoria"
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
        
        
        m_DocumentoRepetido = DocumentoRepetido(.Documento, Me.Documento.IDAuditoria, .IDNoConformidad, .IDAccionRealizada, p_Error)
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        If m_DocumentoRepetido = EnumSino.Sí Then
            If .IDNoConformidad <> "" Then
                MotivoNoOK = "Ya existe un documento para la misma No Conformidad de Auditoria"
            Else
                MotivoNoOK = "Ya existe un documento para la misma Tarea de una No Conformidad de Auditoria"
            End If
            
            Exit Function
        End If
       
        
    End With
    
    Exit Function
     
errores:
     If Err.Number <> 1000 Then
         p_Error = "El método DocumentoAuditoriaOperaciones.MotivoNoOK ha devuelto el error: " & Err.Description
     End If
                                
End Function
Public Function Eliminar( _
                            Optional ByRef p_Error As String _
                                ) As String
                                        
    
    Dim m_SQL As String
    Dim m_URLAnexo As String
    Dim m_URLDirAuditoria As String
    
    On Error GoTo errores
    
    Me.Error = ""
    p_Error = ""
    If Me.Documento Is Nothing Then
        p_Error = "No se ha definido el anexo a eliminar"
        Err.Raise 1000
    End If
    
    With Me.Documento
        
        m_URLAnexo = .URLAnexo
        p_Error = .Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        If fso.FileExists(m_URLAnexo) Then
            If FicheroAbierto(m_URLAnexo) Then
                p_Error = "El fichero está abierto"
                Err.Raise 1000
            End If
        End If
        m_SQL = "DELETE * FROM TbDocumentosAuditorias " & _
                "WHERE IDDocumento=" & .IDDocumento & ";"
        getdb().Execute m_SQL
    
    End With
    If fso.FileExists(m_URLAnexo) Then
        fso.DeleteFile m_URLAnexo, True
    End If
'    m_URLDirAuditoria = Me.DocumentoAuditoria.URLDirectorioAnexo
'    If fso.FolderExists(m_URLDirAuditoria) Then
'         If fso.GetFolder(m_URLDirAuditoria).SubFolders.Count = 0 And fso.GetFolder(m_URLDirAuditoria).Files.Count = 0 Then
'            fso.DeleteFolder m_URLDirAuditoria, True
'        End If
'    End If
   
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método DocumentoAuditoriaOperaciones.Eliminar ha devuelto el error: " & Err.Description
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
        m_DocumentoRepetido = DocumentoRepetido(p_NombreDocumento, .IDAuditoriaResultanteCalculado, p_Error)
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        If m_DocumentoRepetido = EnumSino.Sí Then
            p_Error = "No se puede repetir el nombre de un documento para ningún elemento de esta auditoría"
            Err.Raise 1000
        End If
        
        m_SQL = "UPDATE TbDocumentosAuditorias SET Documento = '" & p_NombreDocumento & "' " & _
                "WHERE IDDocumento=" & .IDDocumento & ";"
        getdb().Execute m_SQL
    End With
    
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método DocumentoAuditoriaOperaciones.CambiarNombre ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
    End If
    
    
End Function

Private Function DocumentoRepetido( _
                                    p_NombreDocumento As String, _
                                    Optional p_IDAuditoria As String, _
                                    Optional p_IDNoConformidad As String, _
                                    Optional p_IDAccionRealizada As String, _
                                    Optional ByRef p_Error As String _
                                    ) As EnumSino
        
    Dim m_SQL As String
    Dim rcdDatos As DAO.Recordset
   
    
    On Error GoTo errores
    If p_NombreDocumento = "" Then
        p_Error = "Falta Documento"
        Err.Raise 1000
    End If
    If p_IDAuditoria = "" And p_IDNoConformidad = "" And p_IDAccionRealizada = "" Then
        p_Error = "Falta el p_IDAuditoria o p_IDNoConformidad o p_IDAccionRealizada"
        Err.Raise 1000
    End If
    
    If p_IDAuditoria <> "" Then
        m_SQL = "SELECT * " & _
                "FROM TbDocumentosAuditorias " & _
                "WHERE IDAuditoria=" & p_IDAuditoria & " AND Documento='" & p_NombreDocumento & "';"
    Else
        If p_IDNoConformidad <> "" Then
            m_SQL = "SELECT * " & _
                    "FROM TbDocumentosAuditorias " & _
                    "WHERE IDNoConformidad=" & p_IDNoConformidad & " AND Documento='" & p_NombreDocumento & "';"
        Else
            m_SQL = "SELECT * " & _
                    "FROM TbDocumentosAuditorias " & _
                    "WHERE IDAccionRealizada=" & p_IDAccionRealizada & " AND Documento='" & p_NombreDocumento & "';"
        End If
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
        p_Error = "El método DocumentoAuditoriaOperaciones.DocumentoRepetido ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
    End If
   
    
End Function

