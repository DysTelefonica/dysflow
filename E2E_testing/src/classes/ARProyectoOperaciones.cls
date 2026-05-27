VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "ARProyectoOperaciones"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
Option Compare Database
Option Explicit

Public AR As ARProyecto


Private Function MotivoNoOK( _
                                Optional ByRef p_ObjARAlInicio As ARProyecto, _
                                Optional p_Observaciones As String, _
                                Optional ByRef p_Error As String _
                                ) As String
    
    Dim m_AccionRepetida As EnumSino
    Dim blnComprobar As Boolean
    On Error GoTo errores
    
    If Me.AR Is Nothing Then
        p_Error = "No se ha establecido la Acción Realizada"
        Err.Raise 1000
    End If
    With Me.AR
        
        
        
        If .IdAccionCorrectiva = "" Then
            MotivoNoOK = "No se conoce la Acción Correctiva"
            Exit Function
        End If
        If .AccionRealizada = "" Then
            MotivoNoOK = "No se conoce la Acción Realizada"
            Exit Function
        End If
        If IsDate(.FechaFinReal) Then
            If Not IsDate(.FechaFinPrevista) Then
                MotivoNoOK = "Tiene fecha de fin real y no fecha fin prevista"
                Exit Function
            End If
        End If
        If IsDate(.FechaFinPrevista) Then
            If Not IsDate(.FechaInicio) Then
                MotivoNoOK = "Tiene fecha de fin prevista y no fecha de inicio"
                Exit Function
            End If
        End If
        If IsDate(.FechaInicio) Then
            If Not IsDate(.FechaFinPrevista) Then
                MotivoNoOK = "Tiene fecha de fin de inicio y no fecha de fin prevista"
                Exit Function
            End If
        End If
        
       
        BuenaFecha p_Error
        If p_Error <> "" Then
            MotivoNoOK = p_Error
            Exit Function
        End If
        
        If Not p_ObjARAlInicio Is Nothing Then
            If IsDate(.FechaFinReal) And Not IsDate(p_ObjARAlInicio.FechaFinReal) Then
                If .Documentos Is Nothing Then
                    MotivoNoOK = "Para cerrar una acción hay que adjuntar una evidencia"
                    Exit Function
                End If
            End If
            If p_ObjARAlInicio.AccionRealizada <> .AccionRealizada Then
                blnComprobar = True
            End If
            
        Else
            If IsDate(.FechaFinReal) Then
                If .Documentos Is Nothing Then
                    MotivoNoOK = "Para cerrar una acción hay que adjuntar una evidencia"
                    Exit Function
                End If
            End If
            blnComprobar = True
        End If
        If blnComprobar = True Then
            m_AccionRepetida = AccionRepetida(.AccionRealizada, p_Error)
            If p_Error <> "" Then
                Err.Raise 100
            End If
            If m_AccionRepetida = EnumSino.Sí Then
                MotivoNoOK = "Existe otra acción realizada con el mismo nombre para la misma Acción Correctiva"
                Exit Function
            End If
        End If
        
        
    End With
    
    Exit Function
     
errores:
     If Err.Number <> 1000 Then
         p_Error = "El método ARProyectoOperaciones.MotivoNoOK ha devuelto el error: " & Err.Description
     End If
                                
End Function


Public Function Registrar( _
                            Optional ByRef p_ObjARAlInicio As ARProyecto, _
                            Optional p_Observaciones As String, _
                            Optional ByRef p_Error As String _
                            ) As String
                                        
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_MotivoNoOK As String
    Dim m_RepOP As ReplanificacionesProyectoOperaciones
    Dim m_Rep As ReplanificacionesProyecto
    Dim m_FPrevCierreNC As String
    Dim m_ACProyecto As ACProyecto
    Dim m_NC As ncProyecto
    Dim m_EstadoACAlInicio As String
    Dim m_EstadoACAlFinal As String
    Dim m_EstadoNCAlInicio As EnumEstadoNC
    Dim m_EstadoNCAlFinal As EnumEstadoNC
    Dim blnReplanificado As Boolean
    On Error GoTo errores
    p_Error = ""
    If Me.AR.AC.nc.NCProyectoAsociada Is Nothing Then
    
        m_MotivoNoOK = MotivoNoOK(p_ObjARAlInicio, p_Observaciones, p_Error)
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        p_Error = m_MotivoNoOK
        If p_Error <> "" Then
            Err.Raise 1000
        End If
         m_EstadoACAlInicio = Me.AR.AC.Estado
         m_EstadoNCAlInicio = Me.AR.AC.nc.EstadoCalculado
    End If
    Me.AR.AccionRealizada = Replace(Me.AR.AccionRealizada, "'", "")
    Me.AR.AccionRealizada = Replace(Me.AR.AccionRealizada, ";", ":")
    With Me.AR
        If .Responsable = "" Then
            .Responsable = .AC.Responsable
        End If
        If p_ObjARAlInicio Is Nothing Then
            m_SQL = "TbNCAccionesRealizadas"
            .IDAccionRealizada = .IDAccionRealizadaCalculada
            p_Error = .Error
            If p_Error <> "" Then
                Err.Raise 1000
            End If
            If .NAccion = "" Then
                .NAccion = .AC.NAccionARCalculado
                p_Error = .AC.Error
                If p_Error <> "" Then
                    Err.Raise 1000
                End If
            End If
        Else
            m_SQL = "SELECT * FROM TbNCAccionesRealizadas " & _
                "WHERE IDAccionRealizada=" & .IDAccionRealizada & ";"
        End If
        Set rcdDatos = getdb().OpenRecordset(m_SQL)
        
        If Not p_ObjARAlInicio Is Nothing Then
            If rcdDatos.EOF Then
                p_Error = "No se ha encontrado el registro"
                Err.Raise 1000
            End If
        End If
        If p_ObjARAlInicio Is Nothing Then
            rcdDatos.AddNew
                rcdDatos.Fields("IDAccionRealizada") = .IDAccionRealizada
                rcdDatos.Fields("IDAccionCorrectiva") = .IdAccionCorrectiva
                rcdDatos.Fields("NAccion") = .NAccion
                .FechaAccionRealizada = Now()
                rcdDatos.Fields("FechaAccionRealizada") = .FechaAccionRealizada
                rcdDatos.Fields("AccionRealizada") = .AccionRealizada
                If IsDate(.FechaInicio) Then
                    rcdDatos.Fields("FechaInicio") = .FechaInicio
                Else
                    rcdDatos.Fields("FechaInicio") = Null
                End If
                If IsDate(.FechaFinPrevista) Then
                    rcdDatos.Fields("FechaFinPrevista") = .FechaFinPrevista
                Else
                    rcdDatos.Fields("FechaFinPrevista") = Null
                End If
                If IsDate(.FechaFinReal) Then
                    rcdDatos.Fields("FechaAccionRealizada") = .FechaFinReal
                    rcdDatos.Fields("FechaFinReal") = .FechaFinReal
                    rcdDatos.Fields("FechaAccionRealizada") = .FechaAccionRealizada
                Else
                    rcdDatos.Fields("FechaFinReal") = Null
                End If
                If .Notas <> "" Then
                    rcdDatos.Fields("Notas") = .Notas
                End If
                If .Responsable <> "" Then
                    rcdDatos.Fields("Responsable") = .Responsable
                End If
                If .FechaAccionRealizada <> "" Then
                    rcdDatos.Fields("FechaAccionRealizada") = .FechaAccionRealizada
                End If
                If .Estado <> "" Then
                    rcdDatos.Fields("Estado") = .Estado
                Else
                    .Estado = .EstadoCalculadoTexto
                    rcdDatos.Fields("Estado") = .Estado
                End If
                
                
            rcdDatos.Update
            If .AC.nc.NCProyectoAsociada Is Nothing Then
                RegistrarLogProyecto "Alta de Acción Realizada", , Me.AR, , p_Error
            Else
                RegistrarLogProyecto "Alta de Acción Realizada de una NC Vinculada", , Me.AR, , p_Error
            End If
            
            
            If p_Error <> "" Then
                Err.Raise 1000
            End If
        Else
            rcdDatos.Edit
                rcdDatos.Fields("AccionRealizada") = .AccionRealizada
                If IsDate(.FechaInicio) Then
                    rcdDatos.Fields("FechaInicio") = .FechaInicio
                Else
                    rcdDatos.Fields("FechaInicio") = Null
                End If
                If IsDate(.FechaFinPrevista) Then
                    rcdDatos.Fields("FechaFinPrevista") = .FechaFinPrevista
                Else
                    rcdDatos.Fields("FechaFinPrevista") = Null
                End If
                If IsDate(.FechaFinReal) Then
                    rcdDatos.Fields("FechaAccionRealizada") = .FechaFinReal
                    rcdDatos.Fields("FechaFinReal") = .FechaFinReal
                    
                Else
                    rcdDatos.Fields("FechaFinReal") = Null
                    rcdDatos.Fields("FechaAccionRealizada") = Null
                End If
                If .Notas <> "" Then
                    rcdDatos.Fields("Notas") = .Notas
                Else
                    rcdDatos.Fields("Notas") = Null
                End If
                If .Responsable <> "" Then
                    rcdDatos.Fields("Responsable") = .Responsable
                Else
                    rcdDatos.Fields("Responsable") = Null
                End If
                .Estado = .EstadoCalculadoTexto
                rcdDatos.Fields("Estado") = .Estado
                
            rcdDatos.Update
           
            RegistrarLogProyecto "Edición de Acción Realizada", , Me.AR, p_ObjARAlInicio, p_Error
            If p_Error <> "" Then
                Err.Raise 1000
            End If
            If .FechaFinPrevista <> "" And p_ObjARAlInicio.FechaFinPrevista <> "" Then
                If .FechaFinPrevista <> p_ObjARAlInicio.FechaFinPrevista Then
                    Set m_Rep = New ReplanificacionesProyecto
                    With m_Rep
                        .IDNoConformidad = Me.AR.AC.IDNoConformidad
                        .IDAccionRealizada = Me.AR.IDAccionRealizada
                        .FechaPrevistaAlInicio = p_ObjARAlInicio.FechaFinPrevista
                        .FechaPrevistaReplanificada = Me.AR.FechaFinPrevista
                        .Observaciones = p_Observaciones
                    End With
                    Set m_RepOP = New ReplanificacionesProyectoOperaciones
                    With m_RepOP
                        Set .ReplanificacionesProyecto = m_Rep
                        .Registrar p_Error
                        If p_Error <> "" Then
                            Err.Raise 1000
                        End If
                        blnReplanificado = True
                    End With
                     
                End If
            End If
            
        End If
        
        
        rcdDatos.Close
        
        Set rcdDatos = Nothing
        ' --- INTEGRACIÓN CACHÉ ---
        CacheNCProyecto.InvalidarCache .AC.IDNoConformidad, "Cambio en Acción Realizada", p_Error
        ' -------------------------
        If Me.AR.AC.nc.NCProyectoAsociada Is Nothing Then
            ActualizarDatosACProyecto Me.AR.AC, p_Error
            If p_Error <> "" Then
                Err.Raise 1000
            End If
            m_EstadoACAlFinal = Me.AR.AC.EstadoCalculadoTexto
            
            ActualizarDatosNCProyecto Me.AR.AC.nc, p_Error
            If p_Error <> "" Then
                Err.Raise 1000
            End If
            
            If m_EstadoACAlInicio <> m_EstadoACAlFinal Or blnReplanificado = True Then
                PintarIndicadores p_Reiniciando:=EnumSino.Sí, p_Error:=p_Error
                If p_Error <> "" Then
                    Err.Raise 1000
                End If
            Else
                If p_ObjARAlInicio Is Nothing Then
                    m_EstadoNCAlFinal = Me.AR.AC.nc.EstadoCalculado
                    If m_EstadoNCAlInicio <> m_EstadoNCAlFinal Then
                        PintarIndicadores p_Reiniciando:=EnumSino.Sí, p_Error:=p_Error
                        If p_Error <> "" Then
                            Err.Raise 1000
                        End If
                    End If
                End If
                
                
            End If
        End If
        
    End With
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método ARProyectoOperaciones.Registrar ha devuelto el error: " & Err.Description
    End If
End Function

Public Function Eliminar(Optional ByRef p_Error As String) As String
    
    
    Dim m_SQL As String
    
    On Error GoTo errores
    With Me.AR
        m_SQL = "DELETE * " & _
                "FROM TbNCAccionesRealizadas " & _
                "WHERE IDAccionRealizada=" & .IDAccionRealizada & ";"
        getdb().Execute m_SQL
        ' --- INTEGRACIÓN CACHÉ ---
        CacheNCProyecto.InvalidarCache .AC.IDNoConformidad, "Eliminación de Acción Realizada", p_Error
        ' -------------------------
        Set .AC.ARs = Nothing
        ActualizarDatosACProyecto .AC, p_Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        ActualizarDatosNCProyecto .AC.nc, p_Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
    End With
    PintarIndicadores p_Reiniciando:=EnumSino.Sí, p_Error:=p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método ARProyectoOperaciones.Eliminar ha devuelto el error " & Err.Number & vbNewLine & "Detalle: " & Err.Description
    End If
End Function

Private Function BuenaFecha( _
                            Optional ByRef p_Error As String _
                            ) As String
    
    
    On Error GoTo errores
    With Me.AR
'        If CDate(.FechaFinPrevista) < CDate(.AC.FechaAccionCorrectiva) Then
'            p_Error = "La fecha prevista es anterior a la fecha de la acción correctiva" & vbNewLine & .AC.FechaAccionCorrectiva
'            Err.Raise 1000
'        End If
        If IsDate(.FechaInicio) Then
            If IsDate(.FechaFinReal) Then
                If CDate(.FechaFinReal) < CDate(.FechaInicio) Then
                    p_Error = "La fecha Final real es anterior a la inicial"
                    Err.Raise 1000
                End If
            End If
'            If CDate(.FechaInicio) < CDate(.AC.FechaAccionCorrectiva) Then
'                p_Error = "La fecha de inicio es anterior a la fecha de la acción correctiva" & vbNewLine & .AC.FechaAccionCorrectiva
'                Err.Raise 1000
'            End If
        Else
            If IsDate(.FechaFinReal) Then
                p_Error = "No se puede rellenar la fecha final sin haber indicado la fecha inicial"
                Err.Raise 1000
            End If
        End If
        
    End With
    
    
   
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método ARProyectoOperaciones.BuenaFecha ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
    End If
   
    
End Function
Private Function AccionRepetida( _
                                p_AR As String, _
                                Optional ByRef p_Error As String _
                                ) As EnumSino
        
    Dim m_ID As Variant
    Dim m_ARProyecto As ARProyecto
    
    On Error GoTo errores
    If p_AR = "" Then
        p_Error = "No se ha introducido una Acción"
        Err.Raise 1000
    End If
    With Me.AR
        If .AC.ARs Is Nothing Then
            AccionRepetida = EnumSino.No
            Exit Function
        End If
        For Each m_ID In .AC.ARs
            Set m_ARProyecto = .AC.ARs(m_ID)
            If m_ARProyecto.AccionRealizada = p_AR Then
                AccionRepetida = EnumSino.Sí
                Exit Function
            End If
            Set m_ARProyecto = Nothing
        Next
    End With
    
    AccionRepetida = EnumSino.No
   
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método ARProyectoOperaciones.AccionRepetida ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
    End If
   
    
End Function

Public Function ActualizarDatosCalculados( _
                                            Optional ByRef p_Error As String _
                                            ) As String
    
    
    
    On Error GoTo errores
    
    With Me.AR
        .EstadoGrabar , p_Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        
    End With
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método ARProyectoOperaciones.ActualizarDatosCalculados ha devuelto el error: " & Err.Description
    End If
End Function



Public Function Replanificar( _
                            ByVal p_Fecha As String, _
                            ByVal p_Observaciones As String, _
                            Optional ByRef p_Error As String _
                            ) As String
                                        
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_RepOP As ReplanificacionesProyectoOperaciones
    Dim m_Rep As ReplanificacionesProyecto
    Dim m_FechaPrevAlInicio As String
    On Error GoTo errores
   
    
    With Me.AR
        m_FechaPrevAlInicio = .FechaFinPrevista
        m_SQL = "SELECT * FROM TbNCAccionesRealizadas " & _
                "WHERE IDAccionRealizada=" & .IDAccionRealizada & ";"
        Set rcdDatos = getdb().OpenRecordset(m_SQL)
        rcdDatos.Edit
            .FechaFinPrevista = p_Fecha
            rcdDatos.Fields("FechaFinPrevista") = .FechaFinPrevista
           
        rcdDatos.Update
        rcdDatos.Close
        Set rcdDatos = Nothing
        RegistrarLogProyecto "Replanificación de Acción Realizada"
        
        Set m_Rep = New ReplanificacionesProyecto
        With m_Rep
            .IDNoConformidad = Me.AR.AC.IDNoConformidad
            .IDAccionRealizada = Me.AR.IDAccionRealizada
            .FechaPrevistaAlInicio = m_FechaPrevAlInicio
            .FechaPrevistaReplanificada = Me.AR.FechaFinPrevista
            .Observaciones = p_Observaciones
        End With
        Set m_RepOP = New ReplanificacionesProyectoOperaciones
        With m_RepOP
            Set .ReplanificacionesProyecto = m_Rep
            .Registrar p_Error
            If p_Error <> "" Then
                Err.Raise 1000
            End If
        End With
        
    End With
    m_ObjNCProyectoActiva.EstadoGrabar
    PintarIndicadores p_Reiniciando:=EnumSino.Sí, p_Error:=p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método ARProyectoOperaciones.Replanificar ha devuelto el error: " & Err.Description
    End If
End Function






