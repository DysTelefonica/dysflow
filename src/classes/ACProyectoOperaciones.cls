VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "ACProyectoOperaciones"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
Option Compare Database
Option Explicit

Public AC As ACProyecto



Private Function AccionRepetida( _
                                p_AC As String, _
                                Optional p_Error As String _
                                ) As EnumSino
        
    Dim m_ID As Variant
    Dim m_ACProyecto As ACProyecto
    
    On Error GoTo errores
    If p_AC = "" Then
        p_Error = "No se ha introducido una Acción"
        Err.Raise 1000
    End If
    With Me.AC
        If .nc.ACs Is Nothing Then
            AccionRepetida = EnumSino.No
            Exit Function
        End If
        For Each m_ID In .nc.ACs
            Set m_ACProyecto = .nc.ACs(m_ID)
            If m_ACProyecto.AccionCorrectiva = p_AC Then
                AccionRepetida = EnumSino.Sí
                Exit Function
            End If
            Set m_ACProyecto = Nothing
        Next
    End With
    
    
    AccionRepetida = EnumSino.No
   
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método ACProyectoOperaciones.AccionRepetida ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
    End If
   
    
End Function
Public Function MotivoNoOK( _
                                Optional ByRef p_ObjACAlInicio As ACProyecto, _
                                Optional ByRef p_Error As String _
                                ) As String
    
    Dim m_AccionRepetida As EnumSino
    Dim blnComprobar As Boolean
    On Error GoTo errores
        
    With Me.AC
        If .IDNoConformidad = "" Then
            MotivoNoOK = "No se conoce la NC/Obs"
            Exit Function
        End If
        
        If .AccionCorrectiva = "" Then
            MotivoNoOK = "No se conoce la Acción Correctiva"
            Exit Function
        End If
        If Not p_ObjACAlInicio Is Nothing Then
            If p_ObjACAlInicio.AccionCorrectiva <> .AccionCorrectiva Then
                blnComprobar = True
                
            End If
        Else
            blnComprobar = True
        End If
        If .Responsable <> "" Then
            If .ResponsableObj Is Nothing Then
                MotivoNoOK = "Se ha introducido un responsable que no aparece en la lista de usuarios"
                Exit Function
            End If
        End If
        If blnComprobar = True Then
            m_AccionRepetida = AccionRepetida(.AccionCorrectiva, p_Error)
            If p_Error <> "" Then
                Err.Raise 100
            End If
            If m_AccionRepetida = EnumSino.Sí Then
                p_Error = "Existe otra acción correctiva con el mismo nombre para la misma NC/Obs"
                Err.Raise 1000
            End If
        End If
        
    End With
    
    Exit Function
     
errores:
     If Err.Number <> 1000 Then
         p_Error = "El método ACProyectoOperaciones.MotivoNoOK ha devuelto el error: " & Err.Description
     End If
                                
End Function

Public Function Registrar( _
                            Optional ByRef p_ObjACAlInicio As ACProyecto, _
                            Optional ByRef p_Error As String _
                            ) As String
                                        
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_MotivoNoOK As String
    Dim m_EstadoNCAlInicio As EnumEstadoNC
    
    
    On Error GoTo errores
    If Me.AC.nc.NCProyectoAsociada Is Nothing Then
        m_MotivoNoOK = MotivoNoOK(p_ObjACAlInicio, p_Error)
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        p_Error = m_MotivoNoOK
        If p_Error <> "" Then
            Err.Raise 1000
        End If
    End If
    Me.AC.AccionCorrectiva = Replace(Me.AC.AccionCorrectiva, "'", "")
    Me.AC.AccionCorrectiva = Replace(Me.AC.AccionCorrectiva, ";", ":")
    With Me.AC
        If p_ObjACAlInicio Is Nothing Then
            m_SQL = "TbNCAccionCorrectivas"
            .IdAccionCorrectiva = .IDAccionCorrectivaCalculada
            p_Error = .Error
            If p_Error <> "" Then
                Err.Raise 1000
            End If
            If .NAccion = "" Then
            
            
                .NAccion = .nc.NAccionCalculado
            
                p_Error = .nc.Error
                If p_Error <> "" Then
                    Err.Raise 1000
                End If
            End If
        Else
            m_SQL = "SELECT * FROM TbNCAccionCorrectivas " & _
                "WHERE IDAccionCorrectiva=" & .IdAccionCorrectiva & ";"
        End If
        Set rcdDatos = getdb().OpenRecordset(m_SQL)
    
        If Not p_ObjACAlInicio Is Nothing Then
            If rcdDatos.EOF Then
                p_Error = "No se ha encontrado el registro"
                Err.Raise 1000
            End If
            
        End If
        If p_ObjACAlInicio Is Nothing Then
            m_EstadoNCAlInicio = .nc.EstadoCalculado
            rcdDatos.AddNew
                rcdDatos.Fields("IDAccionCorrectiva") = .IdAccionCorrectiva
                
                .FechaAccionCorrectiva = Now()
                rcdDatos.Fields("FechaAccionCorrectiva") = .FechaAccionCorrectiva
                .NAccion = .nc.NAccionCalculado
                If IsNumeric(.NAccion) Then
                    rcdDatos.Fields("NAccion") = .NAccion
                End If
                
                rcdDatos.Fields("IDNoConformidad") = .IDNoConformidad
                rcdDatos.Fields("AccionCorrectiva") = .AccionCorrectiva
                If .Notas <> "" Then
                    rcdDatos.Fields("Notas") = .Notas
                End If
                If .Responsable <> "" Then
                    rcdDatos.Fields("Responsable") = .Responsable
                End If
                If .FechaAccionCorrectiva <> "" Then
                    rcdDatos.Fields("FechaAccionCorrectiva") = .FechaAccionCorrectiva
                End If
                If .FechaFinalUltima <> "" Then
                    rcdDatos.Fields("FechaFinalUltima") = .FechaFinalUltima
                End If
                If .FechaFinPrevistaUltima <> "" Then
                    rcdDatos.Fields("FechaFinPrevistaUltima") = .FechaFinPrevistaUltima
                End If
                If .FechaInicialMinima <> "" Then
                    rcdDatos.Fields("FechaInicialMinima") = .FechaInicialMinima
                End If
                If .Estado <> "" Then
                    rcdDatos.Fields("Estado") = .Estado
                End If
            rcdDatos.Update
            If .nc.NCProyectoAsociada Is Nothing Then
                RegistrarLogProyecto "Alta de Acción Correctiva", , Me.AC, , p_Error
            Else
                RegistrarLogProyecto "Alta de Acción Correctiva de NC Vinculada", , Me.AC, , p_Error
            End If
            If m_EstadoNCAlInicio = EnumEstadoNC.REGISTRADA Then
                PintarIndicadores p_Reiniciando:=EnumSino.Sí 'desaparecerá una tarea de NC Registrada y apararecerá otra de Acciones sin tareas
            End If
        Else
            rcdDatos.Edit
                rcdDatos.Fields("IDNoConformidad") = .IDNoConformidad
                rcdDatos.Fields("AccionCorrectiva") = .AccionCorrectiva
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
                If Not IsNumeric(.NAccion) Then
                    .NAccion = .nc.NAccionCalculado
                    
                End If
            rcdDatos.Update
            RegistrarLogProyecto "Edición de Acción Correctiva", , Me.AC, p_ObjACAlInicio, p_Error
            If p_Error <> "" Then
                Err.Raise 1000
            End If
        
        End If
        rcdDatos.Close
        Set rcdDatos = Nothing
         ' --- INTEGRACIÓN CACHÉ ---
        CacheNCProyecto.InvalidarCache .IDNoConformidad, "Cambio en Accion Correctiva", p_Error
        ' -------------------------
        If .nc.NCProyectoAsociada Is Nothing Then
            ActualizarDatosCalculados p_Error
            If p_Error <> "" Then
                Err.Raise 1000
            End If
            Set .nc.ACs = Nothing
        End If
        
        
    End With
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método ACProyectoOperaciones.Registrar ha devuelto el error: " & Err.Description
    End If
End Function
Public Function RegistrarNAccion( _
                                    Optional ByRef p_Error As String _
                                    ) As String
                                        
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_MotivoNoOK As String
    
    
    On Error GoTo errores
   
    With Me.AC
        If IsNumeric(.NAccion) Then
            Exit Function
        End If
        .NAccion = .nc.NAccionCalculado
        p_Error = .nc.Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        
        
        m_SQL = "SELECT * FROM TbNCAccionCorrectivas " & _
                "WHERE IDAccionCorrectiva=" & .IdAccionCorrectiva & ";"
        Set rcdDatos = getdb().OpenRecordset(m_SQL)
    
        
        rcdDatos.Edit
            rcdDatos.Fields("NAccion") = .NAccion
            'rcdDatos.Fields("AccionCorrectiva") = .AccionCorrectiva
            
            
        rcdDatos.Update
        rcdDatos.Close
        Set rcdDatos = Nothing
       
    End With
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método ACProyectoOperaciones.RegistrarNAccion ha devuelto el error: " & Err.Description
    End If
End Function

Public Function Eliminar(Optional ByRef p_Error As String) As String
    
    Dim m_ARProyecto As ARProyecto
    Dim m_ARs As Scripting.Dictionary
    Dim m_IDAR As Variant
    Dim m_SQL As String
    Dim m_AROp As ARProyectoOperaciones
    Dim m_EstadoNC As EnumEstadoNC
    On Error GoTo errores
    
    With Me.AC
        Set m_ARs = .ARs
        p_Error = .Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        If Not m_ARs Is Nothing Then
            Set m_AROp = New ARProyectoOperaciones
            For Each m_IDAR In m_ARs
                Set m_ARProyecto = m_ARs(m_IDAR)
                Set m_AROp.AR = m_ARProyecto
                m_AROp.Eliminar p_Error
                If p_Error <> "" Then
                    Err.Raise 1000
                End If
                Set m_ARProyecto = Nothing
            Next
        End If
        
        m_SQL = "DELETE * " & _
                "FROM TbNCAccionCorrectivas " & _
                "WHERE IDAccionCorrectiva=" & .IdAccionCorrectiva & ";"
        getdb().Execute m_SQL
         ' --- INTEGRACIÓN CACHÉ ---
        CacheNCProyecto.InvalidarCache .IDNoConformidad, "Eliminación de Acción Correctiva", p_Error
        ' -------------------------
        Set .nc.ACs = Nothing
        ActualizarDatosNCProyecto .nc, p_Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        m_EstadoNC = .nc.EstadoCalculado
        If m_EstadoNC = EnumEstadoNC.REGISTRADA Then
            PintarIndicadores p_Reiniciando:=EnumSino.Sí 'desaparecerá una tarea de NC Registrada y apararecerá otra de Acciones sin tareas
        End If
    End With
    
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método ACProyectoOperaciones.Eliminar ha devuelto el error " & Err.Number & vbNewLine & "Detalle: " & Err.Description
    End If
End Function



Public Function ActualizarDatosCalculados( _
                                            Optional ByRef p_Error As String _
                                            ) As String
    
        
    On Error GoTo errores
    
    With Me.AC
        .EstadoGrabar , p_Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        .FechaInicialMinimaGrabar , p_Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        .FechaFinPrevistaUltimaGrabar , p_Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        .FechaFinalUltimaGrabar , p_Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
    End With
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método ACProyectoOperaciones.ActualizarDatosCalculados ha devuelto el error: " & Err.Description
    End If
End Function




Public Function ReplanificarAcciones( _
                                    Optional p_Fecha As String, _
                                    Optional ByRef p_Error As String _
                                    ) As String
    
    Dim m_ARProyecto As ARProyecto
    Dim m_ARAlInicio As ARProyecto
    Dim m_ID As Variant
    Dim m_AROp As ARProyectoOperaciones
    On Error GoTo errores
    
    If Not IsDate(p_Fecha) Then
        p_Error = "No se ha indicado la fecha"
        Err.Raise 1000
    End If
    If CDate(p_Fecha) < CDate(Date) Then
        p_Error = "La fecha no puede ser anterior a la de hoy"
        Err.Raise 1000
    End If
    With Me.AC
        If .ARs Is Nothing Then
            Exit Function
        End If
        Set m_AROp = New ARProyectoOperaciones
        For Each m_ID In .ARs
            Set m_ARProyecto = .ARs(m_ID)
            Set m_ARAlInicio = .ARs(m_ID)
            If m_ARProyecto.EstadoCalculado <> EnumEstadoAR.PTEREPLANIFICAR Then
                GoTo siguiente
            End If
            m_ARProyecto.FechaFinPrevista = p_Fecha
            
            With m_AROp
                Set .AR = m_ARProyecto
                
                .Registrar m_ARAlInicio, p_Error
                If p_Error <> "" Then
                    Err.Raise 1000
                End If
            End With
siguiente:
            Set m_ARProyecto = Nothing
        Next
    End With
    ActualizarDatosACProyecto Me.AC, p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método ACProyectoOperaciones.ReplanificarAcciones ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
    End If
    
End Function
Public Function RegistrarResponsable( _
                                    Optional ByRef p_Error As String _
                                    ) As String
                                        
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    
    
    
    On Error GoTo errores
   
    With Me.AC
        If .nc.ResponsableTelefonica = "" Then
            Exit Function
        End If
        
        .Responsable = .nc.ResponsableTelefonica
        
        
        m_SQL = "SELECT * FROM TbNCAccionCorrectivas " & _
                "WHERE IDAccionCorrectiva=" & .IdAccionCorrectiva & ";"
        Set rcdDatos = getdb().OpenRecordset(m_SQL)
    
        
        rcdDatos.Edit
            rcdDatos.Fields("Responsable") = .Responsable
            
            
            
        rcdDatos.Update
        rcdDatos.Close
        Set rcdDatos = Nothing
       
    End With
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método ACProyectoOperaciones.RegistrarResponsable ha devuelto el error: " & Err.Description
    End If
End Function

