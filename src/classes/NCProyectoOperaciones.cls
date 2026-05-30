VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "NCProyectoOperaciones"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
Option Compare Database
Option Explicit

Public nc As ncProyecto
Private m_Error As String
Public Error As String


Public Function MotivoAltaDatosUnicosNoOK( _
                                        Optional ByRef p_ObjNCAlInicio As ncProyecto, _
                                        Optional ByRef p_Error As String, _
                                        Optional ByVal p_MenosCef As EnumSino = EnumSino.No _
                                        ) As String
    Dim m_NC As ncProyecto
    Dim blnComprobar As Boolean
    On Error GoTo errores
    If Me.nc Is Nothing Then
        p_Error = "No se ha establecido la NC"
        Err.Raise 1000
    End If
    With Me.nc
        If .ExpedienteObj Is Nothing Then
            MotivoAltaDatosUnicosNoOK = "No se conoce el expediente"
            Exit Function
        End If
        If .Descripcion = "" Then
            MotivoAltaDatosUnicosNoOK = "No se conoce la descipción"
            Exit Function
        End If
        If .DetectadoPor = "" Then
            MotivoAltaDatosUnicosNoOK = "No se conoce DetectadoPor"
            Exit Function
        End If
        If Not IsDate(.FechaApertura) Then
            MotivoAltaDatosUnicosNoOK = "No se conoce la fecha de apertura"
            Exit Function
        End If
        If .VinculadoANC = EnumSino.Sí Then
            
            
                
            
            If p_ObjNCAlInicio Is Nothing Then
                blnComprobar = True
            Else
                If .FechaApertura <> p_ObjNCAlInicio.FechaApertura Then
                    blnComprobar = True
                End If
            End If
            If blnComprobar = True Then
                
            
                If .NCProyectoAsociada Is Nothing Then
                    Set m_NC = constructor.getNCProyecto(p_IDNC:=.IDNCAsociada, p_Error:=p_Error)
                    If p_Error <> "" Then
                        Err.Raise 1000
                    End If
                Else
                    Set m_NC = .NCProyectoAsociada
                End If
                If CDate(.FechaApertura) < CDate(m_NC.FechaApertura) Then
                    MotivoAltaDatosUnicosNoOK = "La fecha de apertura es anterior a la de la que está vinculada"
                    Exit Function
                End If
            End If
            Exit Function
        End If
        
        If .IDNCAsociada <> "" Then
            If .NCProyectoAsociada Is Nothing Then
                Set m_NC = constructor.getNCProyecto(p_IDNC:=.IDNCAsociada, p_Error:=p_Error)
                If p_Error <> "" Then
                    Err.Raise 1000
                End If
            Else
                Set m_NC = .NCProyectoAsociada
            End If
            If CDate(.FechaApertura) < CDate(m_NC.FechaApertura) Then
                MotivoAltaDatosUnicosNoOK = "La fecha de apertura es anterior a la de la que está vinculada"
                Exit Function
            End If
        End If
        
        If .CausaYAnalisRaiz = "" Then
            MotivoAltaDatosUnicosNoOK = "No se conoce la CausaYAnalisRaiz"
            Exit Function
        End If
        If .IDTipo = "" Then
            MotivoAltaDatosUnicosNoOK = "No se conoce la tipología"
            Exit Function
        End If
        
        
        If .EntidadResponsable = "" Then
            MotivoAltaDatosUnicosNoOK = "No se conoce la Entidad Responsable"
            Exit Function
        End If
        
        If .RequiereControlEficacia <> "Sí" And .RequiereControlEficacia <> "No" Then
            MotivoAltaDatosUnicosNoOK = "Se ha de indicar si requiere control de eficacia"
            Exit Function
        End If
        If p_MenosCef <> EnumSino.Sí Then
            If .RequiereControlEficacia = "Sí" Then
                If Not IsDate(.FechaPrevistaControlEficacia) Then
                    MotivoAltaDatosUnicosNoOK = "Si requiere el control de eficacia se ha de indicar la fecha prevista del mismo"
                    Exit Function
                End If
                If .ControlEficacia = "" Then
                    MotivoAltaDatosUnicosNoOK = "Si requiere el control de eficacia se ha de indicar el mismo"
                    Exit Function
                End If

            End If
        End If
        
        
        
        
        
    End With
    
    Exit Function
     
errores:
     If Err.Number <> 1000 Then
         p_Error = "El método NCProyectoOperaciones.MotivoAltaDatosUnicosNoOK ha devuelto el error: " & Err.Description
     End If
                                
End Function
Private Function MotivoEdicionDatosUnicosNoOK( _
                                                Optional ByRef p_Error As String _
                                                ) As String
    Dim m_NC As ncProyecto
    Dim blnComprobar As Boolean
    On Error GoTo errores
    If Me.nc Is Nothing Then
        p_Error = "No se ha establecido la NC"
        Err.Raise 1000
    End If
    With Me.nc
        If .ExpedienteObj Is Nothing Then
            MotivoEdicionDatosUnicosNoOK = "No se conoce el expediente"
            Exit Function
        End If
        If .Descripcion = "" Then
            MotivoEdicionDatosUnicosNoOK = "No se conoce la descipción"
            Exit Function
        End If
        If .DetectadoPor = "" Then
            MotivoEdicionDatosUnicosNoOK = "No se conoce DetectadoPor"
            Exit Function
        End If
        
        If Not IsDate(.FechaApertura) Then
            MotivoEdicionDatosUnicosNoOK = "No se conoce la fecha de apertura"
            Exit Function
        Else
            If IsDate(.FPREVCIERRE) Then
                If CDate(.FPREVCIERRE) < CDate(.FechaApertura) Then
                    MotivoEdicionDatosUnicosNoOK = "La fecha de apertura no puede ser mayor a la fecha prevista de cierre"
                    Exit Function
                End If
            End If
        End If
        If .IDNCAsociada <> "" Then
            If .NCProyectoAsociada Is Nothing Then
                Set m_NC = constructor.getNCProyecto(p_IDNC:=.IDNCAsociada, p_Error:=p_Error)
                If p_Error <> "" Then
                    Err.Raise 1000
                End If
            Else
                Set m_NC = .NCProyectoAsociada
            End If
            If CDate(.FechaApertura) < CDate(m_NC.FechaApertura) Then
                MotivoEdicionDatosUnicosNoOK = "La fecha de apertura es anterior a la de la que está vinculada"
                Exit Function
            End If
            
        End If
        
        
        
    End With
    
    Exit Function
     
errores:
     If Err.Number <> 1000 Then
         p_Error = "El método NCProyectoOperaciones.MotivoEdicionDatosUnicosNoOK ha devuelto el error: " & Err.Description
     End If
                                
End Function
Public Function MotivoDatosUnicosNoOK( _
                                        Optional ByRef p_ObjNCAlInicio As ncProyecto, _
                                        Optional ByRef p_Error As String, _
                                        Optional ByVal p_MenosCef As EnumSino = EnumSino.No _
                                        ) As String
    Dim m_NC As ncProyecto
    Dim blnComprobar As Boolean
    On Error GoTo errores
    If Me.nc Is Nothing Then
        p_Error = "No se ha establecido la NC"
        Err.Raise 1000
    End If
    With Me.nc
        If .ExpedienteObj Is Nothing Then
            MotivoDatosUnicosNoOK = "No se conoce el expediente"
            Exit Function
        End If
        If .RESPONSABLECALIDAD = "" Then
            MotivoDatosUnicosNoOK = "Falta el responsable de Calidad"
            Exit Function
        End If
        If .Descripcion = "" Then
            MotivoDatosUnicosNoOK = "No se conoce la descipción"
            Exit Function
        End If
        If .DetectadoPor = "" Then
            MotivoDatosUnicosNoOK = "No se conoce DetectadoPor"
            Exit Function
        End If
        If Not IsDate(.FechaApertura) Then
            MotivoDatosUnicosNoOK = "No se conoce la fecha de apertura"
            Exit Function
        End If
        If IsDate(.FPREVCIERRE) Then
            If CDate(.FPREVCIERRE) < CDate(.FechaApertura) Then
                MotivoDatosUnicosNoOK = "La fecha de apertura no puede ser mayor a la fecha prevista de cierre"
                Exit Function
            End If
        End If
        If .VinculadoANC = EnumSino.Sí Then
            If .CodConcesionAsociada = "" And .NCProyectoAsociada Is Nothing Then
                MotivoDatosUnicosNoOK = "Aparece como vinculado y el código no corresponde a una entidad existente"
                Exit Function
            End If
            
                
            
            If p_ObjNCAlInicio Is Nothing Then
                blnComprobar = True
            Else
                If .FechaApertura <> p_ObjNCAlInicio.FechaApertura Then
                    blnComprobar = True
                End If
            End If
            If blnComprobar = True Then
                
            
                If .NCProyectoAsociada Is Nothing Then
                    Set m_NC = constructor.getNCProyecto(p_IDNC:=.IDNCAsociada, p_Error:=p_Error)
                    If p_Error <> "" Then
                        Err.Raise 1000
                    End If
                Else
                    Set m_NC = .NCProyectoAsociada
                End If
                If CDate(.FechaApertura) < CDate(m_NC.FechaApertura) Then
                    MotivoDatosUnicosNoOK = "La fecha de apertura es anterior a la de la que está vinculada"
                    Exit Function
                End If
            End If
            Exit Function
        End If
        If .CausaYAnalisRaiz = "" Then
            MotivoDatosUnicosNoOK = "No se conoce la CausaYAnalisRaiz"
            Exit Function
        End If
        If .IDTipo = "" Then
            MotivoDatosUnicosNoOK = "No se conoce la tipología"
            Exit Function
        End If
        
        
        If .EntidadResponsable = "" Then
            MotivoDatosUnicosNoOK = "No se conoce la Entidad Responsable"
            Exit Function
        End If
        
        If .RequiereControlEficacia <> "Sí" And .RequiereControlEficacia <> "No" Then
            MotivoDatosUnicosNoOK = "Se ha de indicar si requiere control de eficacia"
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
        If Not IsDate(.FechaApertura) Then
            MotivoDatosUnicosNoOK = "No se conoce la fecha de apertura"
            Exit Function
        Else
            If IsDate(.FPREVCIERRE) Then
                If CDate(.FPREVCIERRE) < CDate(.FechaApertura) Then
                    MotivoDatosUnicosNoOK = "La fecha de apertura no puede ser mayor a la fecha prevista de cierre"
                    Exit Function
                End If
            End If
        End If
       
        
    End With
    
    Exit Function
     
errores:
     If Err.Number <> 1000 Then
         p_Error = "El método NCProyectoOperaciones.MotivoDatosUnicosNoOK ha devuelto el error: " & Err.Description
     End If
                                
End Function
Public Function RegistrarDatosUnicos( _
                                    Optional ByRef p_ObjNCAlInicio As ncProyecto, _
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
    Me.nc.Descripcion = Replace(Me.nc.Descripcion, "'", "")
    Me.nc.Descripcion = Replace(Me.nc.Descripcion, ";", ":")
    If p_ObjNCAlInicio Is Nothing Then
        m_SQL = "TbNoConformidades"
        Me.nc.IDNoConformidad = Me.nc.IDNoConformidadCalculado
        p_Error = Me.nc.Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        Me.nc.CodigoNoConformidad = Me.nc.CodigoNoConformidadCalculado
        p_Error = Me.nc.Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
    Else
        m_SQL = "SELECT * FROM TbNoConformidades " & _
            "WHERE IDNoConformidad=" & Me.nc.IDNoConformidad & ";"
    End If
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
            rcdDatos.Fields("IDNoConformidad") = Me.nc.IDNoConformidad
            rcdDatos.Fields("CodigoNoConformidad") = Me.nc.CodigoNoConformidad
            Me.nc.EsNoConformidad = True
            rcdDatos.Fields("EsNoConformidad") = Me.nc.EsNoConformidad
            rcdDatos.Fields("IDExpediente") = Me.nc.IDExpediente
            Me.nc.Juridica = Me.nc.ExpedienteObj.CadenaJuridicas
            Me.nc.JuridicaExp = Me.nc.Juridica
            If Me.nc.Juridica <> "" Then
                rcdDatos.Fields("Juridica") = Me.nc.Juridica
            End If
            If Me.nc.JuridicaExp <> "" Then
                rcdDatos.Fields("JuridicaExp") = Me.nc.JuridicaExp
            End If
            Me.nc.CodExp = Me.nc.ExpedienteObj.CodExp
            Me.nc.Expediente = Me.nc.CodExp
            If Me.nc.CodExp <> "" Then
                rcdDatos.Fields("CodExp") = Me.nc.CodExp
                rcdDatos.Fields("EXPEDIENTE") = Me.nc.Expediente
            End If
            Me.nc.Nemotecnico = Me.nc.ExpedienteObj.Nemotecnico
            If Me.nc.Nemotecnico <> "" Then
                rcdDatos.Fields("Nemotecnico") = Me.nc.Nemotecnico
            End If
            rcdDatos.Fields("RESPONSABLECALIDAD") = Me.nc.RESPONSABLECALIDAD
        
            rcdDatos.Fields("Descripcion") = Me.nc.Descripcion
            rcdDatos.Fields("CausaYAnalisRaiz") = Me.nc.CausaYAnalisRaiz
            rcdDatos.Fields("CAUSA") = Me.nc.CausaYAnalisRaiz
           
            If Me.nc.VEHICULO <> "" Then
                rcdDatos.Fields("VEHICULO") = Me.nc.VEHICULO
            End If
            If Me.nc.CodConcesionAsociada <> "" Then
                rcdDatos.Fields("CodConcesionAsociada") = Me.nc.CodConcesionAsociada
            End If
           
            
            
            
            rcdDatos.Fields("RequiereACR") = True
            rcdDatos.Fields("IDTipo") = Me.nc.IDTipo
            rcdDatos.Fields("ENTIDADRESPONSABLE") = Me.nc.EntidadResponsable
            rcdDatos.Fields("DetectadoPor") = Me.nc.DetectadoPor
            If Me.nc.ResponsableTelefonica <> "" Then
                rcdDatos.Fields("RESPONSABLETELEFONICA") = Me.nc.ResponsableTelefonica
            End If
            rcdDatos.Fields("RequiereControlEficacia") = Me.nc.RequiereControlEficacia
            If Me.nc.MotivoNoRequiereControlEficacia <> "" Then
                rcdDatos.Fields("MotivoNoRequiereControlEficacia") = Me.nc.MotivoNoRequiereControlEficacia
            End If
            
            
            rcdDatos.Fields("FECHAAPERTURA") = Me.nc.FechaApertura
'            If IsDate(Me.NC.FPREVCIERRE) Then
'                rcdDatos.Fields("FPREVCIERRE") = Me.NC.FPREVCIERRE
'            End If
            
            m_EstadoAlFinal = Me.nc.EstadoCalculadoTexto
        rcdDatos.Update
        Me.nc.EstadoGrabar m_EstadoAlFinal, p_Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        ' EstadoGrabar regenera cache de listado/detalle; no invalidar detalle justo despues del alta.
        RegistrarLogProyecto "Alta de NC", , Me.nc, , p_Error
        
        
       
            
        
    Else
        rcdDatos.Edit
            rcdDatos.Fields("IDExpediente") = Me.nc.IDExpediente
            Me.nc.Juridica = Me.nc.ExpedienteObj.CadenaJuridicas
            Me.nc.JuridicaExp = Me.nc.Juridica
            If Me.nc.Juridica <> "" Then
                rcdDatos.Fields("Juridica") = Me.nc.Juridica
            Else
                rcdDatos.Fields("Juridica") = Null
            End If
            If Me.nc.JuridicaExp <> "" Then
                rcdDatos.Fields("JuridicaExp") = Me.nc.JuridicaExp
            Else
                rcdDatos.Fields("JuridicaExp") = Null
            End If
            Me.nc.CodExp = Me.nc.ExpedienteObj.CodExp
            Me.nc.Expediente = Me.nc.CodExp
            If Me.nc.CodExp <> "" Then
                rcdDatos.Fields("CodExp") = Me.nc.CodExp
                rcdDatos.Fields("EXPEDIENTE") = Me.nc.Expediente
            Else
                rcdDatos.Fields("CodExp") = Null
                rcdDatos.Fields("EXPEDIENTE") = Null
            End If
            Me.nc.Nemotecnico = Me.nc.ExpedienteObj.Nemotecnico
            If Me.nc.Nemotecnico <> "" Then
                rcdDatos.Fields("Nemotecnico") = Me.nc.Nemotecnico
            Else
                rcdDatos.Fields("Nemotecnico") = Null
            End If
            rcdDatos.Fields("RESPONSABLECALIDAD") = Me.nc.RESPONSABLECALIDAD
        
            
            rcdDatos.Fields("Descripcion") = Me.nc.Descripcion
            rcdDatos.Fields("CausaYAnalisRaiz") = Me.nc.CausaYAnalisRaiz
            rcdDatos.Fields("CAUSA") = Me.nc.CausaYAnalisRaiz
            
            
            If Me.nc.VEHICULO <> "" Then
                rcdDatos.Fields("VEHICULO") = Me.nc.VEHICULO
            Else
                rcdDatos.Fields("VEHICULO") = Null
            End If
            rcdDatos.Fields("RequiereACR") = True
            If Me.nc.CodConcesionAsociada <> "" Then
                rcdDatos.Fields("CodConcesionAsociada") = Me.nc.CodConcesionAsociada
            Else
                rcdDatos.Fields("CodConcesionAsociada") = Null
            End If
           
            
            rcdDatos.Fields("IDTipo") = Me.nc.IDTipo
            rcdDatos.Fields("ENTIDADRESPONSABLE") = Me.nc.EntidadResponsable
            rcdDatos.Fields("DetectadoPor") = Me.nc.DetectadoPor
            If Me.nc.ResponsableTelefonica <> "" Then
                rcdDatos.Fields("RESPONSABLETELEFONICA") = Me.nc.ResponsableTelefonica
            Else
                rcdDatos.Fields("RESPONSABLETELEFONICA") = Null
            End If
            
            
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
            rcdDatos.Fields("FECHAAPERTURA") = Me.nc.FechaApertura
           ' rcdDatos.Fields("FPREVCIERRE") = Me.NC.FPREVCIERRE
            m_EstadoAlFinal = Me.nc.EstadoCalculadoTexto

        rcdDatos.Update
        Me.nc.Estado = m_EstadoAlInicio
        Me.nc.EstadoGrabar m_EstadoAlFinal, p_Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        
        
        
        RegistrarLogProyecto "Edición de NC/Obs", , Me.nc, p_ObjNCAlInicio, p_Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        
    End If
    With Me.nc
        ' INTEGRACIÓN CON RIESGOS:
        If Not .Riesgos Is Nothing Then
            If .Riesgos.count > 0 Then
                Dim rsServ As New RiesgoServicio
                Dim colRiesgos As New Collection
                Dim vKey As Variant
                
                ' Convertimos el diccionario a colección para el servicio existente
                For Each vKey In .Riesgos.Keys
                    colRiesgos.Add .Riesgos(vKey)
                Next vKey
                
                ' Persistimos usando el nuevo ID de la NC
                rsServ.ActualizarRiesgosNC .IDNoConformidad, colRiesgos, p_Error
                rsServ.SincronizarCampoTextoNC .IDNoConformidad, p_Error
            End If
        End If
    End With
    If Me.nc.RequiereControlEficacia = "Sí" Then
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
        p_Error = "El método NCProyectoOperaciones.RegistrarDatosUnicos ha devuelto el error: " & Err.Description
    End If
End Function
Public Function RegistrarAltaDatosUnicosConVinculoNC( _
                                                    Optional ByRef p_Error As String, _
                                                    Optional ByVal p_MenosCef As EnumSino = EnumSino.No _
                                                    ) As String

    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_MotivoAltaDatosUnicosNoOK As String
    Dim m_EstadoAlFinal As String
   
    
    
    On Error GoTo errores
    
    Me.Error = ""
    p_Error = ""
    If Me.nc.IDNoConformidad <> "" Then
        p_Error = "Solo se puede vincular a otra NC de proyecto en el alta"
        Err.Raise 1000
    End If
    m_MotivoAltaDatosUnicosNoOK = MotivoAltaDatosUnicosNoOK(, p_Error, p_MenosCef)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    p_Error = m_MotivoAltaDatosUnicosNoOK
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    
    
    Me.nc.IDNoConformidad = Me.nc.IDNoConformidadCalculado
    p_Error = Me.nc.Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    Me.nc.CodigoNoConformidad = Me.nc.CodigoNoConformidadCalculado
    p_Error = Me.nc.Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    m_SQL = "TbNoConformidades"
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    
    rcdDatos.AddNew
        rcdDatos.Fields("IDNoConformidad") = Me.nc.IDNoConformidad
        rcdDatos.Fields("CodigoNoConformidad") = Me.nc.CodigoNoConformidad
        Me.nc.EsNoConformidad = True
        rcdDatos.Fields("EsNoConformidad") = Me.nc.EsNoConformidad
        rcdDatos.Fields("IDExpediente") = Me.nc.IDExpediente
        Me.nc.Juridica = Me.nc.ExpedienteObj.CadenaJuridicas
        Me.nc.JuridicaExp = Me.nc.Juridica
        If Me.nc.Juridica <> "" Then
            rcdDatos.Fields("Juridica") = Me.nc.Juridica
        End If
        If Me.nc.JuridicaExp <> "" Then
            rcdDatos.Fields("JuridicaExp") = Me.nc.JuridicaExp
        End If
        Me.nc.CodExp = Me.nc.ExpedienteObj.CodExp
        Me.nc.Expediente = Me.nc.CodExp
        If Me.nc.CodExp <> "" Then
            rcdDatos.Fields("CodExp") = Me.nc.CodExp
            rcdDatos.Fields("EXPEDIENTE") = Me.nc.Expediente
        End If
        Me.nc.Nemotecnico = Me.nc.ExpedienteObj.Nemotecnico
        If Me.nc.Nemotecnico <> "" Then
            rcdDatos.Fields("Nemotecnico") = Me.nc.Nemotecnico
        End If
        If Not Me.nc.ExpedienteObj.RESPONSABLECALIDAD Is Nothing Then
            Me.nc.RESPONSABLECALIDAD = Me.nc.ExpedienteObj.RESPONSABLECALIDAD.Nombre
            
            If Me.nc.RESPONSABLECALIDAD <> "" Then
                rcdDatos.Fields("RESPONSABLECALIDAD") = Me.nc.RESPONSABLECALIDAD
            
            End If
            
        End If
        rcdDatos.Fields("Descripcion") = Me.nc.Descripcion
        rcdDatos.Fields("RequiereACR") = True
        rcdDatos.Fields("DetectadoPor") = Me.nc.DetectadoPor
        If Me.nc.ResponsableTelefonica <> "" Then
            rcdDatos.Fields("RESPONSABLETELEFONICA") = Me.nc.ResponsableTelefonica
        End If
        rcdDatos.Fields("FECHAAPERTURA") = Me.nc.FechaApertura
        If Me.nc.IDNCAsociada <> "" Then
            rcdDatos.Fields("IDNCAsociada") = Me.nc.IDNCAsociada
        End If
        
        If Me.nc.CodConcesionAsociada <> "" Then
            rcdDatos.Fields("CodConcesionAsociada") = Me.nc.CodConcesionAsociada
        End If
        If Me.nc.FPREVCIERRE <> "" Then
            rcdDatos.Fields("FPREVCIERRE") = Me.nc.FPREVCIERRE
        End If
        If Me.nc.FECHACIERRE <> "" Then
            rcdDatos.Fields("FECHACIERRE") = Me.nc.FECHACIERRE
        End If
        If Me.nc.NCProyectoAsociada Is Nothing Then
            m_EstadoAlFinal = Me.nc.EstadoCalculadoTexto
        Else
            m_EstadoAlFinal = Me.nc.NCProyectoAsociada.EstadoCalculadoTexto
        End If
        
    rcdDatos.Update
    Me.nc.EstadoGrabar m_EstadoAlFinal, p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    SincronizarNCProyectoVinculada Me.nc, p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    
    RegistrarLogProyecto "Alta de NC de Proyecto Vinculada a " & Me.nc.NCProyectoAsociada.CodigoNoConformidad, , Me.nc, , p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
        
     
    rcdDatos.Close
    Set rcdDatos = Nothing
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método NCProyectoOperaciones.RegistrarAltaDatosUnicosConVinculoNC ha devuelto el error: " & Err.Description
    End If
End Function

Public Function RegistrarCambiosDatosUnicosConVinculoNC( _
                                                        ByRef p_ObjNCAlInicio As ncProyecto, _
                                                        Optional ByRef p_Error As String _
                                                        ) As String
                                            
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_MotivoNoOK As String
   
    
    
    On Error GoTo errores
    
    Me.Error = ""
    p_Error = ""
    If p_ObjNCAlInicio Is Nothing Then
        p_Error = "Es una edición"
        Err.Raise 1000
    End If
    
    m_MotivoNoOK = MotivoEdicionDatosUnicosNoOK(p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    p_Error = m_MotivoNoOK
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    
    
   
    m_SQL = "SELECT * " & _
                "FROM TbNoConformidades " & _
                "WHERE IDNoConformidad=" & Me.nc.IDNoConformidad & ";"
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    
    rcdDatos.Edit
        
        rcdDatos.Fields("IDExpediente") = Me.nc.IDExpediente
        Me.nc.Juridica = Me.nc.ExpedienteObj.CadenaJuridicas
        Me.nc.JuridicaExp = Me.nc.Juridica
        If Me.nc.Juridica <> "" Then
            rcdDatos.Fields("Juridica") = Me.nc.Juridica
        Else
            rcdDatos.Fields("Juridica") = Null
        End If
        If Me.nc.JuridicaExp <> "" Then
            rcdDatos.Fields("JuridicaExp") = Me.nc.JuridicaExp
        Else
            rcdDatos.Fields("JuridicaExp") = Null
        End If
        Me.nc.CodExp = Me.nc.ExpedienteObj.CodExp
        Me.nc.Expediente = Me.nc.CodExp
        If Me.nc.CodExp <> "" Then
            rcdDatos.Fields("CodExp") = Me.nc.CodExp
            rcdDatos.Fields("EXPEDIENTE") = Me.nc.Expediente
        Else
            rcdDatos.Fields("CodExp") = Null
            rcdDatos.Fields("EXPEDIENTE") = Null
        End If
        Me.nc.Nemotecnico = Me.nc.ExpedienteObj.Nemotecnico
        If Me.nc.Nemotecnico <> "" Then
            rcdDatos.Fields("Nemotecnico") = Me.nc.Nemotecnico
        Else
            rcdDatos.Fields("Nemotecnico") = Null
        End If
        If Not Me.nc.ExpedienteObj.RESPONSABLECALIDAD Is Nothing Then
            Me.nc.RESPONSABLECALIDAD = Me.nc.ExpedienteObj.RESPONSABLECALIDAD.Nombre
            
            If Me.nc.RESPONSABLECALIDAD <> "" Then
                rcdDatos.Fields("RESPONSABLECALIDAD") = Me.nc.RESPONSABLECALIDAD
            Else
                rcdDatos.Fields("RESPONSABLECALIDAD") = Null
            End If
            
        Else
            rcdDatos.Fields("RESPONSABLECALIDAD") = Null
            
        End If
        rcdDatos.Fields("Descripcion") = Me.nc.Descripcion
        
        rcdDatos.Fields("DetectadoPor") = Me.nc.DetectadoPor
        If Me.nc.ResponsableTelefonica <> "" Then
            rcdDatos.Fields("RESPONSABLETELEFONICA") = Me.nc.ResponsableTelefonica
        Else
            rcdDatos.Fields("RESPONSABLETELEFONICA") = Null
        End If
       
        If Me.nc.CodConcesionAsociada <> "" Then
            rcdDatos.Fields("CodConcesionAsociada") = Me.nc.CodConcesionAsociada
        Else
            rcdDatos.Fields("CodConcesionAsociada") = Null
        End If
        rcdDatos.Fields("FechaApertura") = Me.nc.FechaApertura
        
    rcdDatos.Update
    
    
    RegistrarLogProyecto "Edición de NC de Proyecto Vinculada a " & Me.nc.NCProyectoAsociada.CodigoNoConformidad, , Me.nc, , p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
        
     
    rcdDatos.Close
    Set rcdDatos = Nothing
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método NCProyectoOperaciones.RegistrarCambiosDatosUnicosConVinculoNC ha devuelto el error: " & Err.Description
    End If
End Function

Public Function Eliminar( _
                            Optional ByVal p_SinDejarRastro As EnumSino = EnumSino.No, _
                            Optional ByRef p_Error As String _
                            ) As String
    
    Dim m_SQL As String
    Dim rcdDatos As DAO.Recordset
    Dim m_Documentos As Scripting.Dictionary
    Dim m_Documento As DocumentoProyecto
    Dim m_IDDOC As Variant
    Dim m_ACProyecto As ACProyecto
    Dim m_ACs As Scripting.Dictionary
    Dim m_IDAC As Variant
    Dim m_ARs As Scripting.Dictionary
    Dim m_IDAR As Variant
    Dim m_ARProyecto As ARProyecto
    Dim m_ACOp As ACProyectoOperaciones
    Dim m_DocOp As DocumentoProyectoOperaciones
    On Error GoTo errores
    
    With Me.nc
        If .IDNoConformidad = "" Then
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
                    "FROM TbNoConformidades " & _
                    "WHERE IDNoConformidad=" & .IDNoConformidad & ";"
            Set rcdDatos = getdb().OpenRecordset(m_SQL)
            If Not rcdDatos Is Nothing Then
                rcdDatos.Edit
                    rcdDatos.Fields("Borrado") = .Borrado
                    rcdDatos.Fields("MotivoBorrado") = .MotivoBorrado
                rcdDatos.Update
            End If
            rcdDatos.Close
            Set rcdDatos = Nothing
            
            ActualizarDatosNCProyecto Me.nc, p_Error
            If p_Error <> "" Then
                Err.Raise 1000
            End If
            ' --- INTEGRACIÓN CACHÉ ---
            CacheNCProyecto.InvalidarCache Me.nc.IDNoConformidad, "NC marcada como borrada", p_Error
            ' -------------------------
            Exit Function
        End If
        Set m_Documentos = .Documentos
        p_Error = .Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        If Not m_Documentos Is Nothing Then
            Set m_DocOp = New DocumentoProyectoOperaciones
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
        Set m_ACs = .ACs
        p_Error = .Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        If Not m_ACs Is Nothing Then
            Set m_DocOp = New DocumentoProyectoOperaciones
            For Each m_IDAC In m_ACs
                
                Set m_ACProyecto = m_ACs(m_IDAC)
                If Not m_ACProyecto.ARs Is Nothing Then
                    For Each m_IDAR In m_ACProyecto.ARs
                        Set m_ARProyecto = m_ACProyecto.ARs(m_IDAR)
                        If Not m_ARProyecto.Documentos Is Nothing Then
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
                        Set m_ARProyecto = Nothing
                    Next
                
                   
                End If
                
                
                Set m_ACProyecto = Nothing
            Next
        End If
    End With
    m_SQL = "DELETE * " & _
            "FROM TbNoConformidades " & _
            "WHERE IDNoConformidad=" & Me.nc.IDNoConformidad & ";"
    getdb().Execute m_SQL
    ' --- INTEGRACIÓN CACHÉ ---
    CacheNCProyecto.InvalidarCache Me.nc.IDNoConformidad, "Eliminación física de NC", p_Error
    ' -------------------------
    Set Me.nc.ARsSinFinalizar = Nothing
    Set m_ObjLogProyectoActivo = New LogNCProyecto
    With m_ObjLogProyectoActivo
       .idNC = Me.nc.IDNoConformidad
        .Linea = "Eliminación de NoConformidad; " & Me.nc.CodigoNoConformidad & vbNewLine & _
                    "IDNoConformidad: " & Me.nc.IDNoConformidad & _
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
    
    Set m_ObjLogProyectoActivo = Nothing
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método NCProyectoOperaciones.Eliminar ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
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
                "FROM TbNoConformidades " & _
                "WHERE IDNoConformidad=" & .IDNoConformidad & ";"
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
        ' --- INTEGRACIÓN CACHÉ ---
        CacheNCProyecto.InvalidarCache Me.nc.IDNoConformidad, "NC habilitada", p_Error
        ' -------------------------
    End With
    Set m_ObjLogProyectoActivo = New LogNCProyecto
    With m_ObjLogProyectoActivo
       .idNC = Me.nc.IDNoConformidad
        .Linea = "Habilitación de NoConformidad; " & Me.nc.CodigoNoConformidad & vbNewLine & _
                    "IDNoConformidad: " & Me.nc.IDNoConformidad
        .Titulo = "Habilitación de No Conformidad"
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
        p_Error = "El método NCProyectoOperaciones.Habilitar ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
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
        If .IDNoConformidad = "" Then
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
        .RequiereControlEficacia = "Sí"
        If .ConformeControlEficacia = "Sí" Then
            If .TodasLasArsFinalizadas <> EnumSino.Sí Then
                p_Error = "No está permitido cerrar el control de eficacia conforme si no tiene todas las tareas cerradas previamente"
                Err.Raise 1000
            End If
        End If
        m_SQL = "SELECT * " & _
                "FROM TbNoConformidades " & _
                "WHERE IDNoConformidad=" & .IDNoConformidad & ";"
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
        SincronizarEstadoCacheListado "Registro de Control de Eficacia", p_Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        RegistrarLogProyecto "Registrar Control de Eficacia", , Me.nc, , p_Error
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
        p_Error = "El método NCProyectoOperaciones.RegistrarControlEficacia ha devuelto el error: " & Err.Description
    End If
End Function
Public Function EliminarControlEficacia( _
                                        Optional ByRef p_Error As String _
                                        ) As String
                                        
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_EstadoAlInicio As String
    Dim m_EstadoAlFinal As String
    
    
    On Error GoTo errores
    
    Me.Error = ""
    p_Error = ""
    With Me.nc
        m_EstadoAlInicio = .Estado
        If .IDNoConformidad = "" Then
            p_Error = "No parece estar registrada la No Conformidad"
            Err.Raise 1000
        End If
        .RequiereControlEficacia = "No"
        .FechaPrevistaControlEficacia = ""
        .ControlEficacia = ""
        .FechaControlEficacia = ""
        .ResultadoControlEficacia = ""
        .ConformeControlEficacia = ""
        
        m_SQL = "SELECT * " & _
                "FROM TbNoConformidades " & _
                "WHERE IDNoConformidad=" & .IDNoConformidad & ";"
        Set rcdDatos = getdb().OpenRecordset(m_SQL)
        If rcdDatos.EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            p_Error = "No parece estar registrda la NC"
            Err.Raise 1000
        End If
        rcdDatos.Edit
            rcdDatos.Fields("RequiereControlEficacia") = .RequiereControlEficacia
            rcdDatos.Fields("FechaPrevistaControlEficacia") = Null
            rcdDatos.Fields("ControlEficacia") = Null
            rcdDatos.Fields("FechaControlEficacia") = Null
            rcdDatos.Fields("ResultadoControlEficacia") = Null
            rcdDatos.Fields("ConformeControlEficacia") = Null
        rcdDatos.Update
        rcdDatos.Close
        Set rcdDatos = Nothing
        SincronizarEstadoCacheListado "Eliminación de Control de Eficacia", p_Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        m_EstadoAlFinal = .Estado
        RegistrarLogProyecto "Registrar Eliminar Control de Eficacia", , Me.nc, , p_Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        
    End With
    If m_EstadoAlInicio <> m_EstadoAlFinal Then
        PintarIndicadores p_Reiniciando:=EnumSino.Sí, p_Error:=p_Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
    End If
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método NCProyectoOperaciones.EliminarControlEficacia ha devuelto el error: " & Err.Description
    End If
End Function
Public Function RegistrarResultadoControlEficacia( _
                                                Optional ByRef p_Error As String _
                                                ) As String
                                        
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    
    'para poder registrar este resultado ha de haber acciones con tareas y todas ellas finalizadas
    
    On Error GoTo errores
    
    Me.Error = ""
    p_Error = ""
    With Me.nc
        If .IDNoConformidad = "" Then
            p_Error = "No parece estar registrada la No Conformidad"
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
        If Me.nc.ConformeControlEficacia = "Sí" Then
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
                "FROM TbNoConformidades " & _
                "WHERE IDNoConformidad=" & .IDNoConformidad & ";"
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
            
        rcdDatos.Update
        rcdDatos.Close
        Set rcdDatos = Nothing
        SincronizarEstadoCacheListado "Resultado de Control de Eficacia", p_Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        RegistrarLogProyecto "Registrar Resultado de Control de Eficacia", , Me.nc, , p_Error
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
        p_Error = "El método NCProyectoOperaciones.RegistrarResultadoControlEficacia ha devuelto el error: " & Err.Description
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
                "FROM TbNoConformidades " & _
                "WHERE IDNoConformidad=" & .IDNoConformidad & ";"
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
            
        rcdDatos.Update
        rcdDatos.Close
        Set rcdDatos = Nothing
        SincronizarEstadoCacheListado "Eliminación de resultado de Control de Eficacia", p_Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        RegistrarLogProyecto "Registrar Eliminación de Resultado de Control de Eficacia", , Me.nc, , p_Error
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
        p_Error = "El método NCProyectoOperaciones.EliminarResultadoControlEficacia ha devuelto el error: " & Err.Description
    End If
End Function

Private Sub SincronizarEstadoCacheListado( _
                                        ByVal p_Motivo As String, _
                                        Optional ByRef p_Error As String _
                                        )
    Dim estadoFinal As String
    Dim estadoPersistido As String
    Dim cacheError As String

    On Error GoTo errores

    p_Error = ""
    estadoPersistido = Me.nc.Estado
    estadoFinal = Me.nc.EstadoCalculadoTexto
    Me.nc.Estado = estadoPersistido

    If Nz(estadoPersistido, "") <> Nz(estadoFinal, "") Then
        Me.nc.EstadoGrabar estadoFinal, p_Error
        If p_Error <> "" Then Err.Raise 1000
        Exit Sub
    End If

    If Not CacheNCProyecto.RegenerarRegistro(CStr(Me.nc.IDNoConformidad), cacheError) Then
        p_Error = "No se pudo regenerar caché de listado tras " & p_Motivo & ": " & cacheError
        Err.Raise 1000
    End If
    Exit Sub

errores:
    If Err.Number <> 1000 Then
        p_Error = "El método NCProyectoOperaciones.SincronizarEstadoCacheListado ha devuelto el error: " & Err.Description
    End If
End Sub
Public Function RegistrarNota( _
                                Optional ByRef p_Error As String _
                                ) As String
                                        
    Dim m_SQL As String
    
    
    
    On Error GoTo errores
    
    Me.Error = ""
    p_Error = ""
    With Me.nc
        If .IDNoConformidad = "" Then
            p_Error = "No parece estar registrada la No Conformidad"
            Err.Raise 1000
        End If
        If .Notas = "" Then
            p_Error = "No hay dato de la nota"
            Err.Raise 1000
        End If
            m_SQL = "UPDATE TbNoConformidades SET Notas = '" & .Notas & "' " & _
                    "WHERE IDNoConformidad=" & .IDNoConformidad & ";"
        
        getdb().Execute m_SQL
            
        RegistrarLogProyecto "Registrar Notas", , Me.nc, , p_Error
        
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        
    End With
   
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método NCProyectoOperaciones.RegistrarNota ha devuelto el error: " & Err.Description
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
        If .IDNoConformidad = "" Then
            p_Error = "No parece estar registrada la No Conformidad"
            Err.Raise 1000
        End If
        .Notas = ""
        m_SQL = "UPDATE TbNoConformidades SET " & _
                "Notas=Null " & _
                "WHERE IDNoConformidad=" & .IDNoConformidad & ";"
        getdb().Execute m_SQL
         RegistrarLogProyecto "Registrar Eliminar Notas", , Me.nc, , p_Error
    End With
   
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método NCProyectoOperaciones.EliminarNota ha devuelto el error: " & Err.Description
    End If
End Function
Public Function BorrarTodoLoNecesarioEnVinculados( _
                                                    Optional ByRef p_Error As String _
                                                    ) As String
    Dim m_Campo As Variant
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    
    
    
    On Error GoTo errores
    
    Me.Error = ""
    p_Error = ""
    
    m_SQL = "SELECT * " & _
            "FROM TbNoConformidades " & _
            "WHERE IDNoConformidad=" & Me.nc.IDNoConformidad & ";"
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        If Not .EOF Then
            .Edit
                For Each m_Campo In Me.nc.ColCamposVarianEnVinculacionNC
                    Me.nc.SetPropiedad m_Campo, ""
                    .Fields(m_Campo).value = Null
                Next
            .Update
        End If
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método NCProyectoOperaciones.BorrarTodoLoNecesarioEnVinculados ha devuelto el error: " & Err.Description
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
        If .IDNoConformidad = "" Then
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
        m_SQL = "UPDATE TbNoConformidades SET MotivoBorrado = '" & .MotivoBorrado & "' " & _
                    "WHERE IDNoConformidad=" & .IDNoConformidad & ";"
        getdb().Execute m_SQL
        RegistrarLogProyecto "Registrar Motivo Borrado", , Me.nc
        
    End With
   
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método NCProyectoOperaciones.ModificarMotivoBorrado ha devuelto el error: " & Err.Description
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
        p_Error = "El método NCProyectoOperaciones.ActualizarDatosCalculados ha devuelto el error: " & Err.Description
    End If
End Function

Public Sub ActualizarRiesgosNC(p_IDNC As Long, p_ColIDs As Collection, ByRef p_Error As String)
    Dim db As DAO.Database
    Dim vIDRiesgo As Variant
    Dim nuevoID As Long
    
    On Error GoTo errores
    Set db = getdb()
    
    ' 1. Persistencia (Repositorio)
    db.Execute "DELETE FROM TbRiesgosNC WHERE IDNoConformidad = " & p_IDNC, dbFailOnError
    
    For Each vIDRiesgo In p_ColIDs
        nuevoID = constructor.getID("TbRiesgosNC", "ID", db)
        db.Execute "INSERT INTO TbRiesgosNC (ID, IDNoConformidad, IDRiesgo) " & _
                   "VALUES (" & nuevoID & ", " & p_IDNC & ", " & vIDRiesgo & ")", dbFailOnError
    Next vIDRiesgo
    
    ' 2. Efectos secundarios: Logging
    RegistrarLogProyecto "Riesgos actualizados", "Relación de riesgos modificada desde formulario de selección.", , , p_Error
    
    Exit Sub
errores:
    p_Error = "Error en NCProyectoOperaciones.ActualizarRiesgosNC: " & Err.Description
    Err.Raise 1000, , p_Error
End Sub



