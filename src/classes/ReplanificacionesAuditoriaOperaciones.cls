VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "ReplanificacionesAuditoriaOperaciones"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
Option Compare Database
Option Explicit

Public ReplanificacionesAuditoria As ReplanificacionesAuditoria


Public Function Eliminar( _
                            Optional ByRef p_Error As String _
                            ) As String
    
    Dim m_SQL As String
    Dim m_URL As String
    
    On Error GoTo errores
    With Me.ReplanificacionesAuditoria
        
        m_SQL = "DELETE * " & _
                "FROM TbReplanificacionesAuditoria " & _
                "WHERE IDReplanificacion=" & .IDReplanificacion & ";"
        getdb().Execute m_SQL
        RegistrarLogProyecto "Eliminación de Replanificación; " & .FechaPrevistaAlInicio & " de AR:", , , , p_Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        Set .nc.Replanificaciones = Nothing
    End With
    
    
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método ReplanificacionesAuditoriaOperaciones.Eliminar ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
    End If
    
    
End Function

Public Function MotivoNoOK( _
                                Optional ByRef p_Error As String _
                                ) As String
    
    Dim m_Repetida As EnumSino
    On Error GoTo errores
        
    With Me.ReplanificacionesAuditoria
        
        If .AR Is Nothing Then
            MotivoNoOK = "No se conoce la AR"
            Exit Function
        End If
        If .AC Is Nothing Then
            MotivoNoOK = "No se conoce la AC"
            Exit Function
        End If
        If .nc Is Nothing Then
            MotivoNoOK = "No se conoce la No Conformidad de Auditoría"
            Exit Function
        End If
       
        If .FechaPrevistaAlInicio = "" Then
            .FechaPrevistaAlInicio = .AR.FechaFinPrevista
            If .FechaPrevistaAlInicio = "" Then
                MotivoNoOK = "No tenía Fecha prevista al inicio"
                Exit Function
            End If
        End If
        If Not IsDate(.FechaPrevistaReplanificada) Then
            MotivoNoOK = "No se conoce la Fecha replanificada"
            Exit Function
        End If
        m_Repetida = Repetida(.FechaPrevistaAlInicio, p_Error)
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        If m_Repetida = EnumSino.Sí Then
            MotivoNoOK = "Hay registrada al menos una replanificación con la misma fecha inicial prevista"
            Exit Function
        End If
        If .Observaciones = "" Then
            MotivoNoOK = "Se ha de registrar el motivo de la reprogramación"
            Exit Function
        End If
    End With
    
    Exit Function
     
errores:
     If Err.Number <> 1000 Then
         p_Error = "El método ReplanificacionesAuditoriaOperaciones.MotivoNoOK ha devuelto el error: " & Err.Description
     End If
                                
End Function

Public Function Registrar( _
                            Optional ByRef p_Error As String _
                            ) As String
                                        
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_MotivoNoOK As String
    
    
    On Error GoTo errores
   
    m_MotivoNoOK = MotivoNoOK(p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    p_Error = m_MotivoNoOK
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    With Me.ReplanificacionesAuditoria
        .FechaReprogramacion = Date
        m_SQL = "TbReplanificacionesAuditoria"
        Set rcdDatos = getdb().OpenRecordset(m_SQL)
        rcdDatos.AddNew
            .IDReplanificacion = .IDReplanificacionCalculada
            rcdDatos.Fields("IDReplanificacion") = .IDReplanificacion
            .IDNoConformidad = .nc.id
            rcdDatos.Fields("IDNoConformidad") = .IDNoConformidad
            .IDAccionRealizada = .AR.IDAccionRealizada
            rcdDatos.Fields("IDAccionRealizada") = .IDAccionRealizada
            rcdDatos.Fields("FechaReprogramacion") = .FechaReprogramacion
            rcdDatos.Fields("FechaPrevistaAlInicio") = .FechaPrevistaAlInicio
            
            rcdDatos.Fields("FechaPrevistaReplanificada") = .FechaPrevistaReplanificada
            If .Observaciones <> "" Then
                rcdDatos.Fields("Observaciones") = .Observaciones
            End If
            
        rcdDatos.Update
        RegistrarLogAuditoria "Alta de Replanificación", , , , p_Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        
        rcdDatos.Close
        Set rcdDatos = Nothing
        Set .nc.Replanificaciones = Nothing
    End With
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método ReplanificacionesAuditoriaOperaciones.Registrar ha devuelto el error: " & Err.Description
    End If
End Function

Private Function Repetida( _
                                p_FechaFinPrevistaAlInicio As String, _
                                Optional ByRef p_Error As String _
                                ) As EnumSino
        
    Dim m_SQL As Variant
    Dim rcdDatos As DAO.Recordset
    
    
    On Error GoTo errores
    If p_FechaFinPrevistaAlInicio = "" Then
        p_Error = "Falta la fecha a evaluar"
        Err.Raise 1000
    End If
    m_SQL = "SELECT * " & _
            "FROM TbReplanificacionesAuditoria " & _
            "WHERE IDAccionRealizada=" & Me.ReplanificacionesAuditoria.IDAccionRealizada & " " & _
            "AND FechaPrevistaAlInicio=#" & Format(p_FechaFinPrevistaAlInicio, "mm/dd/yyyy") & "#;"
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            p_FechaFinPrevistaAlInicio = EnumSino.No
        Else
            p_FechaFinPrevistaAlInicio = EnumSino.Sí
        End If
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    
   
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método ReplanificacionesAuditoriaOperaciones.Repetida ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
    End If
   
    
End Function


