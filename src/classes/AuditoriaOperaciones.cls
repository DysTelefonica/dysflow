VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "AuditoriaOperaciones"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
Option Compare Database
Option Explicit

Public Auditoria As Auditoria
Private m_Error As String
Public Error As String


Private Function MotivoNoOK( _
                                Optional ByRef p_Error As String _
                                ) As String
    
    On Error GoTo errores
        
    With Me.Auditoria
        If Not IsDate(.FechaInicio) Then
            MotivoNoOK = "Falta fecha inicial"
            Exit Function
        End If
        If Not IsDate(.FechaFin) Then
            MotivoNoOK = "Falta fecha Final"
            Exit Function
        End If
        If CDate(.FechaFin) < CDate(.FechaInicio) Then
            MotivoNoOK = "La fecha inicial ha de ser anterior a la final"
            Exit Function
        End If
        If .Tipo <> "Interna" And .Tipo <> "Externa" Then
            MotivoNoOK = "El tipo ha de ser interna o externa"
            Exit Function
        End If
        
    End With
    
    Exit Function
     
errores:
     If Err.Number <> 1000 Then
         p_Error = "El método AuditoriaOperaciones.MotivoNoOK ha devuelto el error: " & Err.Description
     End If
                                
End Function
Public Function Registrar( _
                                Optional ByRef p_AuditoriaAlInicio As Auditoria, _
                                Optional ByRef p_Error As String _
                                ) As String
                                        
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_MotivoNoOK As String
    
    
    On Error GoTo errores
    
    Me.Error = ""
    p_Error = ""
    
    m_MotivoNoOK = MotivoNoOK(p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    p_Error = m_MotivoNoOK
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    With Me.Auditoria
        If p_AuditoriaAlInicio Is Nothing Then
            m_SQL = "TbAuditorias"
            .IDAuditoria = .IDAuditoriaCalculada
            
            
            
        Else
           m_SQL = "SELECT * FROM TbAuditorias " & _
                "WHERE IDAuditoria=" & .IDAuditoria & ";"
        End If
    End With
    
    
    
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        
        If p_AuditoriaAlInicio Is Nothing Then
            .AddNew
                .Fields("IDAuditoria") = Me.Auditoria.IDAuditoria
                .Fields("TIPO") = Me.Auditoria.Tipo
                .Fields("FechaInicio") = Me.Auditoria.FechaInicio
                .Fields("FechaFin") = Me.Auditoria.FechaFin
            .Update
            
        Else
            .Edit
                .Fields("TIPO") = Me.Auditoria.Tipo
                .Fields("FechaInicio") = Me.Auditoria.FechaInicio
                .Fields("FechaFin") = Me.Auditoria.FechaFin
                
            .Update
        End If
        
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Set m_ObjEntorno.ColAuditorias = Nothing
    Set m_ObjEntorno.ColAuditoriasNombres = Nothing
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método AuditoriaOperaciones.Registrar ha devuelto el error: " & Err.Description
    End If
End Function
Public Function Eliminar( _
                            Optional ByRef p_Error As String _
                                ) As String
                                        
    Dim m_Documentos As Scripting.Dictionary
    Dim m_ID As Variant
    Dim m_DocumentoAuditoria As DocumentoAuditoria
    Dim m_SQL As String
    Dim m_DocumentoAuditoriaOperaciones As DocumentoAuditoriaOperaciones
    
    
    On Error GoTo errores
    
    Me.Error = ""
    p_Error = ""
    
    With Me.Auditoria
        If Not .NCs Is Nothing Then
            p_Error = "Al menos hay una no conformidad de auditoría asociada"
            Err.Raise 1000
        End If
        Set m_Documentos = .Documentos
        p_Error = .Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        If Not m_Documentos Is Nothing Then
            For Each m_ID In m_Documentos
                Set m_DocumentoAuditoria = m_Documentos(m_ID)
                If fso.FileExists(m_DocumentoAuditoria.URLAnexo) Then
                    If FicheroAbierto(m_DocumentoAuditoria.URLAnexo) Then
                        p_Error = "Parece estar abierto el archivo" & vbNewLine & m_DocumentoAuditoria.URLAnexo
                        Err.Raise 1000
                    End If
                End If
                Set m_DocumentoAuditoria = Nothing
            Next
        End If
        Set m_DocumentoAuditoriaOperaciones = New DocumentoAuditoriaOperaciones
        
        If Not m_Documentos Is Nothing Then
            For Each m_ID In m_Documentos
                Set m_DocumentoAuditoria = m_Documentos(m_ID)
                 Set m_DocumentoAuditoriaOperaciones.Documento = m_DocumentoAuditoria
                m_DocumentoAuditoriaOperaciones.Eliminar p_Error
                If p_Error <> "" Then
                    Err.Raise 1000
                End If
                Set m_DocumentoAuditoria = Nothing
            Next
        End If
        m_SQL = "DELETE * FROM TbAuditorias " & _
                "WHERE IDAuditoria=" & .IDAuditoria & ";"
        getdb().Execute m_SQL
    
    End With
    Set m_ObjEntorno.ColAuditorias = Nothing
    Set m_ObjEntorno.ColAuditoriasNombres = Nothing
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método AuditoriaOperaciones.Eliminar ha devuelto el error: " & Err.Description
    End If
End Function

Public Function AnexoMultiple( _
                                Optional ByRef p_Anexos As Scripting.Dictionary, _
                                Optional ByRef p_Error As String _
                                ) As String
                                        
    Dim m_Documento As DocumentoAuditoria
    Dim m_DocumentoOp As DocumentoAuditoriaOperaciones
    Dim m_NombreDoc As Variant
    Dim URLLocal As String
    
    On Error GoTo errores
    
    Me.Error = ""
    p_Error = ""
    If p_Anexos Is Nothing Then
        Exit Function
    End If
    Set m_DocumentoOp = New DocumentoAuditoriaOperaciones
    For Each m_NombreDoc In p_Anexos
        URLLocal = p_Anexos(m_NombreDoc)
        Set m_Documento = New DocumentoAuditoria
        With m_Documento
            .IDAuditoria = Me.Auditoria.IDAuditoria
            .Documento = CStr(m_NombreDoc)
            Set m_DocumentoOp.Documento = m_Documento
            m_DocumentoOp.Registrar URLLocal, p_Error
            If p_Error <> "" Then
                Err.Raise 1000
            End If
        End With
    Next
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método AuditoriaOperaciones.AnexoMultiple ha devuelto el error: " & Err.Description
    End If
End Function

