VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "NCaUDITORIAOperaciones"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
Option Compare Database
Option Explicit

Public nc As NCAuditoria
Private m_Error As String
Public Error As String


Public Function MotivoDatosUnicosNoOK( _
                                        Optional ByRef p_ObjNCAlInicio As NCAuditoria, _
                                        Optional ByRef p_Error As String, _
                                        Optional ByVal p_MenosCef As EnumSino = EnumSino.No _
                                        ) As String
    
    On Error GoTo errores
    If Me.nc Is Nothing Then
        p_Error = "No se ha establecido la NC"
        Err.Raise 1000
    End If
    With Me.nc
        If .Auditoria Is Nothing Then
            MotivoDatosUnicosNoOK = "No se conoce la auditoría"
            Exit Function
        End If
        If .Tipo = "" Then
            MotivoDatosUnicosNoOK = "No se conoce el tipo"
            Exit Function
        End If
        
        If .Descripcion = "" Then
            MotivoDatosUnicosNoOK = "No se conoce la descipción"
            Exit Function
        End If
        If .CAUSARAIZ = "" Then
            MotivoDatosUnicosNoOK = "No se conoce la causa Raíz"
            Exit Function
        End If
        If Not IsDate(.FechaApertura) Then
            MotivoDatosUnicosNoOK = "No se conoce la fecha de apertura"
            Exit Function
        End If
        If .PuntoNorma = "" Then
            MotivoDatosUnicosNoOK = "No se conoce el punto de la norma"
            Exit Function
        End If
        If .RESPONSABLEIMPLANTACION = "" Then
            MotivoDatosUnicosNoOK = "No se conoce el responsable de la implantación"
            Exit Function
        End If
        If .RequiereAccionCorrectiva <> "Sí" And .RequiereAccionCorrectiva <> "No" Then
            MotivoDatosUnicosNoOK = "Se ha de indicar si requiere o no acciones correctivas."
            Exit Function
        End If
        
        If .RequiereControlEficacia <> "Sí" And .RequiereControlEficacia <> "No" Then
            MotivoDatosUnicosNoOK = "Se ha de indicar si requiere control de eficacia"
            Exit Function
        End If
        
        If .RequiereAccionCorrectiva = "No" Then
            If .MotivoNoAccionCorrectiva = "" Then
                MotivoDatosUnicosNoOK = "Si no requiere acciones correctivas se ha de indicar un motivo"
                Exit Function
            End If
        End If
        If .RequiereControlEficacia = "Sí" And .RequiereAccionCorrectiva = "No" Then
            MotivoDatosUnicosNoOK = "Si no se requieren acciones correctivas no se puede indicar que requiere control de eficacia"
            Exit Function
            
        End If
        If p_MenosCef <> EnumSino.Sí Then
            If .RequiereControlEficacia = "Sí" Then
                If Not IsDate(.FechaPrevistaControlEficacia) Then
                    MotivoDatosUnicosNoOK = "Si requiere el control de eficacia se ha de indicar la fecha prevista del mismo"
                    Exit Function
                End If
                If .ControlEficacia = "" Then
                    MotivoDatosUnicosNoOK = "Si requiere el control de eficacia se ha de indicar el mismo"
                    Exit Function
                End If

            End If
        End If
        If IsDate(.FPREVCIERRE) Then
            If CDate(.FPREVCIERRE) < CDate(.FechaApertura) Then
                MotivoDatosUnicosNoOK = "La fecha de apertura no puede ser superior a la prevista de cierre"
                Exit Function
            End If
        End If
    End With
    
    Exit Function
     
errores:
     If Err.Number <> 1000 Then
         p_Error = "El método NCAuditoriaOperaciones.MotivoDatosUnicosNoOK ha devuelto el error: " & Err.Description
     End If
                                
End Function

Public Function RegistrarDatosUnicos( _
                                    Optional ByRef p_ObjNCAlInicio As NCAuditoria, _
                                    Optional ByRef p_Error As String, _
                                    Optional ByVal p_MenosCef As EnumSino = EnumSino.No _
                                    ) As String
                                        
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_MotivoDatosUnicosNoOK As String
    Dim m_EstadoAlInicio As String
    Dim m_EstadoAlFinal As String
    
    
    On Error GoTo errores
    
    Me.Error = ""
    p_Error = ""
    m_MotivoDatosUnicosNoOK = MotivoDatosUnicosNoOK(p_ObjNCAlInicio, p_Error, p_MenosCef)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    p_Error = m_MotivoDatosUnicosNoOK
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    
    If p_ObjNCAlInicio Is Nothing Then
        m_SQL = "TbNoConformidadesAuditoria"
        Me.nc.id = Me.nc.IDCalculado
        p_Error = Me.nc.Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        Me.nc.Numero = Me.nc.Auditoria.NumeroNCCalculado(Me.nc.Tipo, p_Error)
       
    Else
        m_SQL = "SELECT * FROM TbNoConformidadesAuditoria " & _
            "WHERE ID=" & Me.nc.id & ";"
    End If
    Me.nc.Descripcion = Replace(Me.nc.Descripcion, "'", "")
    Me.nc.Descripcion = Replace(Me.nc.Descripcion, ";", ":")
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    If Not p_ObjNCAlInicio Is Nothing Then
        If rcdDatos.EOF Then
            p_Error = "No se ha encontrado el registro"
            Err.Raise 1000
        End If
        m_EstadoAlInicio = p_ObjNCAlInicio.Estado
    End If
    If p_ObjNCAlInicio Is Nothing Then
        rcdDatos.AddNew
            rcdDatos.Fields("ID") = Me.nc.id
            rcdDatos.Fields("Numero") = Me.nc.Numero
            rcdDatos.Fields("IDAuditoria") = Me.nc.IDAuditoria
            rcdDatos.Fields("Tipo") = Me.nc.Tipo
            rcdDatos.Fields("RequiereAccionCorrectiva") = Me.nc.RequiereAccionCorrectiva
            If Me.nc.MotivoNoAccionCorrectiva <> "" Then
                rcdDatos.Fields("MotivoNoAccionCorrectiva") = Me.nc.MotivoNoAccionCorrectiva
            End If
            rcdDatos.Fields("Descripcion") = Me.nc.Descripcion
            rcdDatos.Fields("CAUSARAIZ") = Me.nc.CAUSARAIZ
            rcdDatos.Fields("PuntoNorma") = Me.nc.PuntoNorma
            rcdDatos.Fields("RESPONSABLEIMPLANTACION") = Me.nc.RESPONSABLEIMPLANTACION
            rcdDatos.Fields("RequiereControlEficacia") = Me.nc.RequiereControlEficacia
            If Me.nc.MotivoNoRequiereControlEficacia <> "" Then
                rcdDatos.Fields("MotivoNoRequiereControlEficacia") = Me.nc.MotivoNoRequiereControlEficacia
            End If
            
            
            rcdDatos.Fields("FECHAAPERTURA") = Me.nc.FechaApertura
            If Me.nc.RequiereAccionCorrectiva = "No" Then
                Me.nc.FPREVCIERRE = Me.nc.FechaApertura
                Me.nc.FECHACIERRE = Me.nc.FechaApertura
                rcdDatos.Fields("FPREVCIERRE") = Me.nc.FPREVCIERRE
                rcdDatos.Fields("FECHACIERRE") = Me.nc.FECHACIERRE
                Me.nc.Cerrada = "Sí"
                rcdDatos.Fields("Cerrada") = Me.nc.Cerrada
            End If
            Me.nc.Estado = Me.nc.EstadoCalculadoTexto
            m_EstadoAlFinal = Me.nc.Estado
            rcdDatos.Fields("Estado") = Me.nc.Estado
        rcdDatos.Update
        RegistrarLogAuditoria "Alta de NC", , Me.nc, , p_Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        
       
            
        
    Else
        rcdDatos.Edit
           
            rcdDatos.Fields("Tipo") = Me.nc.Tipo
            rcdDatos.Fields("RequiereAccionCorrectiva") = Me.nc.RequiereAccionCorrectiva
            If Me.nc.MotivoNoAccionCorrectiva <> "" Then
                rcdDatos.Fields("MotivoNoAccionCorrectiva") = Me.nc.MotivoNoAccionCorrectiva
            End If
            rcdDatos.Fields("Descripcion") = Me.nc.Descripcion
            rcdDatos.Fields("CAUSARAIZ") = Me.nc.CAUSARAIZ
            rcdDatos.Fields("PuntoNorma") = Me.nc.PuntoNorma
            rcdDatos.Fields("RESPONSABLEIMPLANTACION") = Me.nc.RESPONSABLEIMPLANTACION
            rcdDatos.Fields("RequiereControlEficacia") = Me.nc.RequiereControlEficacia
            rcdDatos.Fields("FECHAAPERTURA") = Me.nc.FechaApertura
            
            
            If Me.nc.RequiereAccionCorrectiva = "No" Then
                Me.nc.FPREVCIERRE = Me.nc.FechaApertura
                Me.nc.FECHACIERRE = Me.nc.FechaApertura
                rcdDatos.Fields("FPREVCIERRE") = Me.nc.FPREVCIERRE
                rcdDatos.Fields("FECHACIERRE") = Me.nc.FECHACIERRE
                Me.nc.Cerrada = "Sí"
                rcdDatos.Fields("Cerrada") = Me.nc.Cerrada
            End If
            Me.nc.Estado = Me.nc.EstadoCalculadoTexto
            rcdDatos.Fields("Estado") = Me.nc.Estado
            m_EstadoAlFinal = Me.nc.Estado
            rcdDatos.Fields("RequiereControlEficacia") = Me.nc.RequiereControlEficacia
            If Me.nc.RequiereControlEficacia <> "Sí" Then
                Me.nc.FechaPrevistaControlEficacia = ""
                Me.nc.ControlEficacia = ""
                Me.nc.FechaControlEficacia = ""
                Me.nc.ResultadoControlEficacia = ""
                Me.nc.ConformeControlEficacia = ""
                rcdDatos.Fields("FechaPrevistaControlEficacia") = Null
                rcdDatos.Fields("ControlEficacia") = Null
                rcdDatos.Fields("FechaControlEficacia") = Null
                rcdDatos.Fields("ResultadoControlEficacia") = Null
                rcdDatos.Fields("ConformeControlEficacia") = Null
            Else
                ' Si RequiereControlEficacia cambia de "No" a "Sí" y existe motivo previo, warn y clear
                If Not p_ObjNCAlInicio Is Nothing Then
                    If p_ObjNCAlInicio.RequiereControlEficacia = "No" And Me.nc.RequiereControlEficacia = "Sí" Then
                        If Me.nc.MotivoNoRequiereControlEficacia <> "" Then
                            MsgBox "El campo 'Motivo de control de eficacia no requerido' se ha limpiado porque ahora sí requiere control de eficacia.", vbExclamation, "Cambio de RequiereControlEficacia"
                            Me.nc.MotivoNoRequiereControlEficacia = ""
                            rcdDatos.Fields("MotivoNoRequiereControlEficacia") = Null
                        End If
                    End If
                End If
            End If
        rcdDatos.Update
        RegistrarLogAuditoria "Edición de NC de Auditoría", , Me.nc, p_ObjNCAlInicio, p_Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
    End If
    Dim flag As String
    If Me.nc.PuntoNorma <> "" Then
    
        flag = PuntoNormaAuditoriaRegistrar(Me.nc.PuntoNorma)
        If flag = "1" Then
            Set m_ObjEntorno.ColPuntosNormaNCAuditorias = Nothing
            
        End If
    End If
    If Me.nc.RequiereControlEficacia = "Sí" And p_MenosCef <> EnumSino.Sí Then
        RegistrarControlEficacia p_Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
    End If
    If m_EstadoAlInicio <> m_EstadoAlFinal And Not p_ObjNCAlInicio Is Nothing Then
        PintarIndicadores p_Reiniciando:=EnumSino.Sí, p_Error:=p_Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
    End If
    rcdDatos.Close
    Set rcdDatos = Nothing
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método NCAuditoriaOperaciones.RegistrarDatosUnicos ha devuelto el error: " & Err.Description
    End If
End Function

Public Function Eliminar( _
                            Optional ByVal p_SinDejarRastro As EnumSino = EnumSino.No, _
                            Optional ByRef p_Error As String _
                            ) As String
    
    Dim m_SQL As String
    Dim rcdDatos As DAO.Recordset
    Dim m_Documentos As Scripting.Dictionary
    Dim m_Documento As DocumentoAuditoria
    Dim m_IDDOC As Variant
    Dim m_AC As ACAuditoria
    Dim m_ACs As Scripting.Dictionary
    Dim m_IDAC As Variant
    Dim m_ARs As Scripting.Dictionary
    Dim m_IDAR As Variant
    Dim m_AR As ARAuditoria
    
    Dim m_DocOp As DocumentoAuditoriaOperaciones
    On Error GoTo errores
    
    With Me.nc
        If .id = "" Then
            p_Error = "La No conformidad no está registrada"
            Err.Raise 1000
        End If
        If .MotivoBorrado = "" Then
            p_Error = "Falta el motivo del borrado"
            Err.Raise 1000
        End If
        If p_SinDejarRastro <> EnumSino.Sí Then
            .Borrado = True
            m_SQL = "SELECT * " & _
                    "FROM TbNoConformidadesAuditoria " & _
                    "WHERE ID=" & .id & ";"
            Set rcdDatos = getdb().OpenRecordset(m_SQL)
            If Not rcdDatos Is Nothing Then
                rcdDatos.Edit
                    rcdDatos.Fields("Borrado") = .Borrado
                    rcdDatos.Fields("MotivoBorrado") = .MotivoBorrado
                rcdDatos.Update
            End If
            rcdDatos.Close
            Set rcdDatos = Nothing
            
            ActualizarDatosNCAuditoria Me.nc, p_Error
            If p_Error <> "" Then
                Err.Raise 1000
            End If
            Exit Function
        End If
        Set m_Documentos = .Documentos
        p_Error = .Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        If Not m_Documentos Is Nothing Then
            Set m_DocOp = New DocumentoAuditoriaOperaciones
            For Each m_IDDOC In m_Documentos
                Set m_Documento = m_Documentos(m_IDDOC)
                With m_DocOp
                    Set .Documento = m_Documento
                    .Eliminar p_Error
                    If p_Error <> "" Then
                        Err.Raise 1000
                    End If
                End With
                
                Set m_Documento = Nothing
            Next
        End If
        If .RequiereAccionCorrectiva = "Sí" Then
            Set m_ACs = .ACs
            p_Error = .Error
            If p_Error <> "" Then
                Err.Raise 1000
            End If
            If Not m_ACs Is Nothing Then
                Set m_DocOp = New DocumentoAuditoriaOperaciones
                For Each m_IDAC In m_ACs
                    
                    Set m_AC = m_ACs(m_IDAC)
                    If Not m_AC.ARs Is Nothing Then
                        For Each m_IDAR In m_AC.ARs
                            Set m_AR = m_AC.ARs(m_IDAR)
                            If Not m_AR.Documentos Is Nothing Then
                                For Each m_IDDOC In m_Documentos
                                    Set m_Documento = m_Documentos(m_IDDOC)
                                    With m_DocOp
                                        Set .Documento = m_Documento
                                        .Eliminar p_Error
                                        If p_Error <> "" Then
                                            Err.Raise 1000
                                        End If
                                    End With
                                    
                                    Set m_Documento = Nothing
                                Next
                            End If
                            Set m_AR = Nothing
                        Next
                    
                       
                    End If
                    
                    
                    Set m_AC = Nothing
                Next
            End If
        End If
    End With
    m_SQL = "DELETE * " & _
            "FROM TbNoConformidadesAuditoria " & _
            "WHERE ID=" & Me.nc.id & ";"
    getdb().Execute m_SQL
    Set Me.nc.ARsSinFinalizar = Nothing
    Set m_ObjLogAuditoriaActivo = New LogNCAuditoria
    With m_ObjLogAuditoriaActivo
       .idNC = Me.nc.id
        .Linea = "Eliminación de NoConformidad; " & Me.nc & vbNewLine & _
                    "ID: " & Me.nc.id & _
                    "Motivo: " & Me.nc.MotivoBorrado
        .Titulo = "Eliminar de No Conformidad"
        .usuario = m_ObjUsuarioConectado.UsuarioRed
        .Alta p_Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
    End With
    PintarIndicadores p_Reiniciando:=EnumSino.Sí, p_Error:=p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    
    Set m_ObjLogAuditoriaActivo = Nothing
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método NCAuditoriaOperaciones.Eliminar ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
    End If
    
End Function

Public Function Habilitar( _
                            Optional ByRef p_Error As String _
                            ) As String
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    
    On Error GoTo errores
   
   
    With Me.nc
        .MotivoBorrado = ""
        .Borrado = False
        m_SQL = "SELECT * " & _
                "FROM TbNoConformidadesAuditoria " & _
                "WHERE ID=" & .id & ";"
        Set rcdDatos = getdb().OpenRecordset(m_SQL)
        If Not rcdDatos Is Nothing Then
            rcdDatos.Edit
                rcdDatos.Fields("Borrado") = .Borrado
                rcdDatos.Fields("MotivoBorrado") = Null
            rcdDatos.Update
        End If
        rcdDatos.Close
        Set rcdDatos = Nothing

        
        ActualizarDatosNCProyecto Me.nc, p_Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
    End With
    Set m_ObjLogProyectoActivo = New LogNCProyecto
    With m_ObjLogProyectoActivo
       .idNC = Me.nc.id
        .Linea = "Habilitación de NoConformidad; " & Me.nc.Auditoria & " " & Me.nc.Numero & vbNewLine & _
                    "ID: " & Me.nc.id
        .Titulo = "Habilitación de No Conformidad de Auditoría"
        .usuario = m_ObjUsuarioConectado.UsuarioRed
        .Alta p_Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
    End With
    PintarIndicadores p_Reiniciando:=EnumSino.Sí, p_Error:=p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    Set m_ObjLogProyectoActivo = Nothing
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método NCAuditoriaOperaciones.Habilitar ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
    End If
    
End Function

Public Function RegistrarControlEficacia( _
                                        Optional ByRef p_Error As String _
                                        ) As String
                                        
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    
    
    
    On Error GoTo errores
    
    Me.Error = ""
    p_Error = ""
    With Me.nc
        If .id = "" Then
            p_Error = "No parece estar registrada la No Conformidad"
            Err.Raise 1000
        End If
        If .FechaPrevistaControlEficacia = "" Then
            p_Error = "Se ha de indicar la fecha prevista para el control de eficacia"
            Err.Raise 1000
        End If
        If .ControlEficacia = "" Then
            p_Error = "Se ha de indicar el control de eficacia que se va a llevar a cabo"
            Err.Raise 1000
        End If
        If .ConformeControlEficacia = "Sí" Then
            If .TodasLasArsFinalizadas <> EnumSino.Sí Then
                p_Error = "Para cerrar un control de eficacia con resultado Conforme ha de cerrar todas las tareas"
                Err.Raise 1000
            End If
        End If
        .RequiereControlEficacia = "Sí"
        If .ConformeControlEficacia = "Sí" Then
            If m_ObjNCAuditoriaActiva.RequiereControlEficaciaCalculado = EnumSino.Sí Then
                If .TodasLasArsFinalizadas <> EnumSino.Sí Then
                    p_Error = "No está permitido cerrar el control de eficacia conforme si no tiene todas las tareas cerradas previamente"
                    Err.Raise 1000
                End If
            End If
            
        End If
        m_SQL = "SELECT * " & _
                "FROM TbNoConformidadesAuditoria " & _
                "WHERE ID=" & .id & ";"
        Set rcdDatos = getdb().OpenRecordset(m_SQL)
        If rcdDatos.EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            p_Error = "No parece estar registrda la NC"
            Err.Raise 1000
        End If
        rcdDatos.Edit
            rcdDatos.Fields("RequiereControlEficacia") = .RequiereControlEficacia
            rcdDatos.Fields("FechaPrevistaControlEficacia") = .FechaPrevistaControlEficacia
            rcdDatos.Fields("ControlEficacia") = .ControlEficacia
        rcdDatos.Update
        rcdDatos.Close
        Set rcdDatos = Nothing
        RegistrarLogAuditoria "Registrar Control de Eficacia", , Me.nc, , p_Error
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
        p_Error = "El método NCAuditoriaOperaciones.RegistrarControlEficacia ha devuelto el error: " & Err.Description
    End If
End Function

Public Function RegistrarResultadoControlEficacia( _
                                                Optional ByRef p_Error As String _
                                                ) As String
                                        
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    
    
    
    On Error GoTo errores
    
    Me.Error = ""
    p_Error = ""
    With Me.nc
        If .id = "" Then
            p_Error = "No parece estar registrada la No Conformidad"
            Err.Raise 1000
        End If
        If .RequiereACRCalculado = EnumSino.No Then
            p_Error = "No requiere acciones correctivas, por lo que no se puede registrar el control de eficacia"
            Err.Raise 1000
        End If
        If .RequiereControlEficacia <> "Sí" And .RequiereControlEficacia <> "No" Then
            p_Error = "Se ha de indicar si requiero o no Control de Eficacia"
            Err.Raise 1000
        End If
        If .RequiereControlEficacia = "No" Then
            p_Error = "La NC de proyecto tiene marcado que no requiere control de eficacia"
            Err.Raise 1000
        End If
        If .FechaPrevistaControlEficacia = "" Then
            p_Error = "Se ha de indicar la fecha prevista para el control de eficacia"
            Err.Raise 1000
        End If
        If .ControlEficacia = "" Then
            p_Error = "Se ha de indicar el control de eficacia que se va a llevar a cabo"
            Err.Raise 1000
        End If
        
        If Not IsDate(.FechaControlEficacia) Then
            p_Error = "Se ha de indicar la fecha del resultado del control de eficacia"
            Err.Raise 1000
        End If
        If .ResultadoControlEficacia = "" Then
            p_Error = "Se ha de indicar el resultado del control de eficacia"
            Err.Raise 1000
        End If
        If .ConformeControlEficacia <> "Sí" And .ConformeControlEficacia <> "No" Then
            p_Error = "Se ha de indicar si ha sido conforme o no"
            Err.Raise 1000
        End If
        If Me.nc.ConformeControlEficacia = "Sí" And Me.nc.RequiereAccionCorrectiva = "Sí" Then
            If Me.nc.ACs Is Nothing Then
                p_Error = "No está permitido cerrar el control de eficacia conforme si no tiene todas las tareas cerradas previamente"
                Err.Raise 1000
            End If
            If Me.nc.AlgunaACSinAR = EnumSino.Sí Then
                p_Error = "No está permitido cerrar el control de eficacia conforme si no tiene todas las tareas cerradas previamente"
                Err.Raise 1000
            End If
            If Me.nc.TodasLasArsFinalizadas <> EnumSino.Sí Then
                p_Error = "No está permitido cerrar el control de eficacia conforme si no tiene todas las tareas cerradas previamente"
                Err.Raise 1000
            End If
        End If
        m_SQL = "SELECT * " & _
                "FROM TbNoConformidadesAuditoria " & _
                "WHERE ID=" & .id & ";"
        Set rcdDatos = getdb().OpenRecordset(m_SQL)
        If rcdDatos.EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            p_Error = "No parece estar registrda la NC"
            Err.Raise 1000
        End If
        rcdDatos.Edit
            rcdDatos.Fields("FechaControlEficacia") = .FechaControlEficacia
            rcdDatos.Fields("ResultadoControlEficacia") = .ResultadoControlEficacia
            rcdDatos.Fields("ConformeControlEficacia") = .ConformeControlEficacia
            .Estado = .EstadoCalculadoTexto
            rcdDatos.Fields("Estado") = .Estado
        rcdDatos.Update
        rcdDatos.Close
        Set rcdDatos = Nothing
        RegistrarLogAuditoria "Registrar Resultado de Control de Eficacia", , Me.nc, , p_Error
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
        p_Error = "El método NCAuditoriaOperaciones.RegistrarResultadoControlEficacia ha devuelto el error: " & Err.Description
    End If
End Function
Public Function EliminarResultadoControlEficacia( _
                                                Optional ByRef p_Error As String _
                                                ) As String
                                        
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    
    
    
    On Error GoTo errores
    
    Me.Error = ""
    p_Error = ""
    With Me.nc
        .FechaControlEficacia = ""
        .ResultadoControlEficacia = ""
        .ConformeControlEficacia = ""
        
        m_SQL = "SELECT * " & _
                "FROM TbNoConformidadesAuditoria " & _
                "WHERE ID=" & .id & ";"
        Set rcdDatos = getdb().OpenRecordset(m_SQL)
        If rcdDatos.EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            p_Error = "No parece estar registrda la NC"
            Err.Raise 1000
        End If
        rcdDatos.Edit
            rcdDatos.Fields("FechaControlEficacia") = Null
            rcdDatos.Fields("ResultadoControlEficacia") = Null
            rcdDatos.Fields("ConformeControlEficacia") = Null
            .Estado = .EstadoCalculadoTexto
            rcdDatos.Fields("Estado") = .Estado
            
        rcdDatos.Update
        rcdDatos.Close
        Set rcdDatos = Nothing
        RegistrarLogAuditoria "Registrar Eliminación de Resultado de Control de Eficacia", , Me.nc, , p_Error
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
        p_Error = "El método NCAuditoriaOperaciones.EliminarResultadoControlEficacia ha devuelto el error: " & Err.Description
    End If
End Function
Public Function RegistrarNota( _
                                Optional ByRef p_Error As String _
                                ) As String
                                        
    Dim m_SQL As String
    
    
    
    On Error GoTo errores
    
    Me.Error = ""
    p_Error = ""
    With Me.nc
        If .id = "" Then
            p_Error = "No parece estar registrada la No Conformidad"
            Err.Raise 1000
        End If
        If .Notas = "" Then
            p_Error = "No hay dato de la nota"
            Err.Raise 1000
        End If
            m_SQL = "UPDATE TbNoConformidadesAuditoria SET Notas = '" & .Notas & "' " & _
                    "WHERE ID=" & .id & ";"
        
        getdb().Execute m_SQL
            
        RegistrarLogAuditoria "Registrar Notas", , Me.nc, , p_Error
        
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        
    End With
   
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método NCAuditoriaOperaciones.RegistrarNota ha devuelto el error: " & Err.Description
    End If
End Function


Public Function EliminarNota( _
                                        Optional ByRef p_Error As String _
                                        ) As String
                                                
    Dim m_SQL As String
    
    
    
    On Error GoTo errores
    
    Me.Error = ""
    p_Error = ""
    With Me.nc
        If .id = "" Then
            p_Error = "No parece estar registrada la No Conformidad"
            Err.Raise 1000
        End If
        .Notas = ""
        m_SQL = "UPDATE TbNoConformidadesAuditoria SET " & _
                "Notas=Null " & _
                "WHERE ID=" & .id & ";"
        getdb().Execute m_SQL
         RegistrarLogAuditoria "Registrar Eliminar Notas", , Me.nc, , p_Error
    End With
   
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método NCAuditoriaOperaciones.EliminarNota ha devuelto el error: " & Err.Description
    End If
End Function

Public Function ModificarMotivoBorrado( _
                                        Optional ByRef p_Error As String _
                                        ) As String
                                        
    Dim m_SQL As String
    
    
    
    On Error GoTo errores
    
    Me.Error = ""
    p_Error = ""
    With Me.nc
        If .id = "" Then
            p_Error = "No parece estar registrada la No Conformidad"
            Err.Raise 1000
        End If
        If .MotivoBorrado = "" Then
            p_Error = "Se ha de indicar el motivo"
            Err.Raise 1000
        End If
        If .Borrado = False Then
            p_Error = "No aparece como borrado"
            Err.Raise 1000
        End If
        m_SQL = "UPDATE TbNoConformidadesAuditoria SET MotivoBorrado = '" & .MotivoBorrado & "' " & _
                    "WHERE ID=" & .id & ";"
        getdb().Execute m_SQL
        RegistrarLogAuditoria "Registrar Motivo Borrado", , Me.nc
        
    End With
   
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método NCAuditoriaOperaciones.ModificarMotivoBorrado ha devuelto el error: " & Err.Description
    End If
End Function

Public Function ActualizarDatosCalculados( _
                                            Optional ByRef p_Error As String _
                                            ) As String
    
   
    
    On Error GoTo errores
    
    With Me.nc
        .FPREVCIERREGrabar , p_Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        .FECHACIERREGrabar , p_Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        .CIERREGrabar , p_Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        .EstadoGrabar , p_Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
    End With
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método NCAuditoriaOperaciones.ActualizarDatosCalculados ha devuelto el error: " & Err.Description
    End If
End Function





