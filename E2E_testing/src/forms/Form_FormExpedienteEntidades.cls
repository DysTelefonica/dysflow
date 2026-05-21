Option Compare Database
Option Explicit
Private WithEvents m_FormPECAL As Form_FormPECALESGestion
Private WithEvents m_FormLugar As Form_FormLugarEjecucionGestion

Private WithEvents m_FormComercial As Form_FormComercialesGestion
Private WithEvents m_FormCPV As Form_FormCPVsGestion
Private WithEvents m_FormRAC As Form_FormRACSGestion
Private WithEvents m_FormUsuarios As Form_FormUsuariosGestion

Private m_Error As String

Private Sub ComandoElegirUsuario_Click()
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    If FormularioAbierto("FormUsuariosGestion") Then
        DoCmd.Close acForm, "FormUsuariosGestion"
    End If
    Set m_ObjComercialActivo = Nothing
    DoCmd.OpenForm "FormUsuariosGestion", OpenArgs:="PARA SELECCIONAR"
    If FormularioAbierto("FormUsuariosGestion") Then
        Set m_FormUsuarios = Forms("FormUsuariosGestion")
    End If
    
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoElegirUsuario_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
    End If
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub


Private Sub ComandoAltaAnualidad_Click()
    Dim m_EstadoRegistro As String
    Dim m_ExpOp As ExpedienteOperaciones
    Dim m_Anualidad As ExpedienteAnualidad
    
    Dim m_Año As String
    Dim m_BIIVA As String
    Dim m_BIIPSI As String
    Dim m_BIIGIC As String
    Dim m_BIEXENTA As String
    On Error GoTo errores

    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    MostrarPopupProgreso "Procesando...", "Guardando..."
    m_Error = ""
    m_Año = Nz(Me.AÑO, "")
    m_BIIVA = Nz(Me.BIIVA, "")
    m_BIIGIC = Nz(Me.BIIGIC, "")
    m_BIIPSI = Nz(Me.BIIPSI, "")
    m_BIEXENTA = Nz(Me.BIEXENTA, "")
    
    If Not IsNumeric(m_Año) Then
        m_Error = "Se ha de incluir el año"
        Err.Raise 1000
    End If
    If Not IsNumeric(m_BIIVA) And Not IsNumeric(m_BIIGIC) And Not IsNumeric(m_BIIPSI) And Not IsNumeric(m_BIEXENTA) Then
        m_Error = "Se ha de incluir alguno de los cuatro importes"
        Err.Raise 1000
    End If
    Set m_Anualidad = New ExpedienteAnualidad
    With m_Anualidad
        .AÑO = Me.AÑO
        .BIIVA = m_BIIVA
        .BIIGIC = m_BIIGIC
        .BIIPSI = m_BIIPSI
        .BIEXENTA = m_BIEXENTA
    End With
   
    Set m_ExpOp = New ExpedienteOperaciones
    With m_ExpOp
        Set .Expediente = m_ObjExpedienteDTOActivo.Expediente
        m_EstadoRegistro = .RegistrarAnualidad(p_Anualidad:=m_Anualidad, p_Error:=m_Error)
        If m_Error <> "" Then
            Err.Raise 1000
        End If
    End With
    If m_EstadoRegistro = "1" Then
        
        Set m_ObjExpedienteDTOActivo.ColAnualidades = m_ObjExpedienteDTOActivo.Expediente.Anualidades
        RellenarListaAnualidades
    End If
        
    
    Me.ListaAnualidad.Selected(Me.ListaAnualidad.ListCount - 1) = True
    Me.AÑO = Me.AÑO + 1
    Me.BIIVA = Null
    Me.BIIPSI = Null
    Me.BIIGIC = Null
    Me.BIEXENTA = Null
    VBA.DoEvents
    CerrarPopupProgreso
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoAltaAnualidad_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
    End If
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub AltaComercial(p_IDComercial As String)
    
    Dim m_EstadoRegistro As String
    Dim m_ExpOp As ExpedienteOperaciones
    Dim m_Comercial As Comercial
    
    
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    MostrarPopupProgreso "Procesando...", "Guardando..."
    m_Error = ""
    
    If p_IDComercial = "" Then
         VBA.DoEvents
        DoCmd.Hourglass False
        VBA.DoEvents
        Exit Sub
    End If
    Set m_Comercial = constructor.getComercial(p_IDComercial:=p_IDComercial, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    If m_Comercial Is Nothing Then
        m_Error = "No aparece ese comercial en el repositorio"
        Err.Raise 1000
    End If
    
   
    Set m_ExpOp = New ExpedienteOperaciones
    With m_ExpOp
        Set .Expediente = m_ObjExpedienteDTOActivo.Expediente
        m_EstadoRegistro = .RegistrarComercial(p_IDComercial:=m_Comercial.IDComercial, p_Error:=m_Error)
        If m_Error <> "" Then
            Err.Raise 1000
        End If
    End With
    If m_EstadoRegistro = "1" Then
        
        Set m_ObjExpedienteDTOActivo.ColComerciales = m_ObjExpedienteDTOActivo.Expediente.Comerciales
        RellenarListaComerciales
    End If
        
    
    Me.ListaComerciales.Selected(Me.ListaComerciales.ListCount - 1) = True
   
    VBA.DoEvents
    CerrarPopupProgreso
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
     If Err.Number <> 1000 Then
        m_Error = "Al ComandoAltaComercial_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
    End If
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub AltaCPV(p_IDCPV As String)
    Dim m_EstadoRegistro As String
    Dim m_ExpOp As ExpedienteOperaciones
    
    Dim m_CPV As CPV
   
    
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    MostrarPopupProgreso "Procesando...", "Guardando..."
    m_Error = ""
    
    If p_IDCPV = "" Then
         VBA.DoEvents
        DoCmd.Hourglass False
        VBA.DoEvents
        Exit Sub
    End If
    Set m_CPV = constructor.getCPV(p_IDCPV:=p_IDCPV, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    If m_CPV Is Nothing Then
        m_Error = "Se ha elegido un CPV no registrado previamente"
        Err.Raise 1000
    End If
    
    Set m_ExpOp = New ExpedienteOperaciones
    With m_ExpOp
        Set .Expediente = m_ObjExpedienteDTOActivo.Expediente
        m_EstadoRegistro = .RegistrarCPV(p_IDCPV:=m_CPV.IDCPV, p_Error:=m_Error)
        If m_Error <> "" Then
            Err.Raise 1000
        End If
    End With
    If m_EstadoRegistro = "1" Then
        
        Set m_ObjExpedienteDTOActivo.ColCPVs = m_ObjExpedienteDTOActivo.Expediente.CPVs
        RellenarListaCPVs
    End If
        
    
    Me.ListaCPVs.Selected(Me.ListaCPVs.ListCount - 1) = True
    
    VBA.DoEvents
    CerrarPopupProgreso
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al AltaCPV se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
    End If
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub




Private Sub AltaLugarEjecucion(p_IDLugarEjecucion As String)
    Dim m_EstadoRegistro As String
    Dim m_ExpOp As ExpedienteOperaciones
    Dim m_Lugar As LugarEjecucion
    
    
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    MostrarPopupProgreso "Procesando...", "Guardando..."
    m_Error = ""
    
    If p_IDLugarEjecucion = "" Then
         VBA.DoEvents
        DoCmd.Hourglass False
        VBA.DoEvents
        Exit Sub
    End If
    Set m_Lugar = constructor.getLugarEjecucion(p_IDLugarEjecucion:=p_IDLugarEjecucion, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    If m_Lugar Is Nothing Then
        m_Error = "Se ha elegido un Lugar de Ejecución que parece no estar registrado previamente"
        Err.Raise 1000
    End If
    
    Set m_ExpOp = New ExpedienteOperaciones
    With m_ExpOp
        Set .Expediente = m_ObjExpedienteDTOActivo.Expediente
        m_EstadoRegistro = .RegistrarLugarEjecucion(p_IDLugar:=m_Lugar.IDLugarEjecucion, p_Error:=m_Error)
        If m_Error <> "" Then
            Err.Raise 1000
        End If
    End With
    If m_EstadoRegistro = "1" Then
        
        Set m_ObjExpedienteDTOActivo.ColLugaresEjecucion = m_ObjExpedienteDTOActivo.Expediente.LugaresEjecucion
        RellenarListaLugares
    End If
    
    
    Me.ListaLugaresEjecucion.Selected(Me.ListaLugaresEjecucion.ListCount - 1) = True
    
    VBA.DoEvents
    CerrarPopupProgreso
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al AltaLugarEjecucion se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
    End If
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub
Private Sub AltaPECAL(p_IDPEcal As String)
    Dim m_EstadoRegistro As String
    Dim m_ExpOp As ExpedienteOperaciones
    Dim m_Pecal As PECAL
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    MostrarPopupProgreso "Procesando...", "Guardando..."
    m_Error = ""
    
    If p_IDPEcal = "" Then
         VBA.DoEvents
        DoCmd.Hourglass False
        VBA.DoEvents
        Exit Sub
    End If
    Set m_Pecal = constructor.getPecal(p_IDPEcal:=p_IDPEcal, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    If m_Pecal Is Nothing Then
        m_Error = "Se ha elegido una PECAL que parece no estar registrada previamente"
        Err.Raise 1000
    End If
   
       
    Set m_ExpOp = New ExpedienteOperaciones
     With m_ExpOp
         Set .Expediente = m_ObjExpedienteDTOActivo.Expediente
         m_EstadoRegistro = .RegistrarPECAL(p_IDPEcal:=m_Pecal.IDPECAL, p_Error:=m_Error)
         If m_Error <> "" Then
             Err.Raise 1000
         End If
     End With
     If m_EstadoRegistro = "1" Then
         
         Set m_ObjExpedienteDTOActivo.ColPECALES = m_ObjExpedienteDTOActivo.Expediente.PECALES
         RellenarListaPECAL
     End If
        
       
    
    
    Me.ListaPECALES.Selected(Me.ListaPECALES.ListCount - 1) = True
    
    VBA.DoEvents
    CerrarPopupProgreso
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al AltaPECAL se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
    End If
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
    
End Sub

Private Sub AltaRAC(p_IDRac As String)
    Dim m_EstadoRegistro As String
    Dim m_ExpOp As ExpedienteOperaciones
    Dim m_RAC As RAC
    
    
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    MostrarPopupProgreso "Procesando...", "Guardando..."
    m_Error = ""
    
    If p_IDRac = "" Then
         VBA.DoEvents
        DoCmd.Hourglass False
        VBA.DoEvents
        Exit Sub
    End If
    Set m_RAC = constructor.getRAC(p_IDRac:=p_IDRac, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    If m_RAC Is Nothing Then
        m_Error = "Se ha elegido un RAC que parece no estar registrado previamente"
        Err.Raise 1000
    End If
    
    Set m_ExpOp = New ExpedienteOperaciones
    With m_ExpOp
        Set .Expediente = m_ObjExpedienteDTOActivo.Expediente
        m_EstadoRegistro = .RegistrarRAC(p_IDRac:=m_RAC.IDRAC, p_Error:=m_Error)
        If m_Error <> "" Then
            Err.Raise 1000
        End If
    End With
    If m_EstadoRegistro = "1" Then
        
        Set m_ObjExpedienteDTOActivo.ColRACs = m_ObjExpedienteDTOActivo.Expediente.RACs
        RellenarListaRACs
    End If
    
    Me.ListaRACs.Selected(Me.ListaRACs.ListCount - 1) = True
    
    VBA.DoEvents
    CerrarPopupProgreso
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al AltaRAC se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
    End If
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub ComandoAltaReponsable_Click()
    
    Dim m_EstadoRegistro As String
    Dim m_ExpOp As ExpedienteOperaciones
    Dim m_Responsable As ExpedienteResponsable
    Dim m_Usuario As USUARIO
    Dim m_IDUsuario As String
    Dim m_EsJefeProyecto As String
    Dim m_CorreoSiempre As String
    
    Dim m_Valor As String
    
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    If Nz(Me.Responsable, "") = "" Then
        m_Error = "Ha de seleccionar un responsable"
        Err.Raise 1000
    End If
    Set m_Usuario = getUsuario(p_Nombre:=Me.Responsable, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    If m_Usuario Is Nothing Then
        m_Error = "Se ha de indicar el usuario"
        Err.Raise 1000
    End If
    
    m_EsJefeProyecto = Nz(Me.EsJefeProyecto, "")
    m_CorreoSiempre = Nz(Me.CorreoSiempre, "")
    If m_EsJefeProyecto = "" Then
        m_Error = "Se ha de indicar si es o no Jefe de Proyecto"
        Err.Raise 1000
    End If
    If m_CorreoSiempre = "" Then
        m_Error = "Se ha de indicar si va a recibir todas las comunicaciones por correo electrónico"
        Err.Raise 1000
    End If
   
    Set m_Responsable = New ExpedienteResponsable
    With m_Responsable
        .IdUsuario = m_Usuario.ID
        .EsJefeProyecto = m_EsJefeProyecto
        .CorreoSiempre = m_CorreoSiempre
    End With
    
        
    Set m_ExpOp = New ExpedienteOperaciones
    With m_ExpOp
        Set .Expediente = m_ObjExpedienteDTOActivo.Expediente
        m_EstadoRegistro = .RegistraResponsable(p_Responsable:=m_Responsable, p_Error:=m_Error)
        If m_Error <> "" Then
            Err.Raise 1000
        End If
    End With
    If m_EstadoRegistro = "1" Then
        
        Set m_ObjExpedienteDTOActivo.ColResponsables = m_ObjExpedienteDTOActivo.Expediente.Responsables
        RellenarListaResponsables
    End If
        
    
    Me.ListaResponsables.Selected(Me.ListaResponsables.ListCount - 1) = True
    Me.Responsable = Null
    Me.EsJefeProyecto = Null
    Me.CorreoSiempre = Null
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoAltaReponsable_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
    End If
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub ComandoCambiarEnvios_Click()
    Dim m_LineaActual As String
    Dim m_LineaFinal As String
    Dim m_EnvioActual As String
    Dim m_EnvioFinal As String
    Dim m_ColActual As Scripting.Dictionary
    Dim m_ColFinal As Scripting.Dictionary
    Dim m_ID As Variant
    Dim m_Responsable As ExpedienteResponsable
    Dim m_ExpOp As ExpedienteOperaciones
    On Error GoTo errores
    m_Error = ""
    DoCmd.Hourglass True
    Me.AllowEdits = False
    If Nz(Me.ListaResponsables, "") = "" Then
        m_Error = "Seleccione un elemento de la lista"
        Err.Raise 1000
    End If
    m_LineaActual = Me.ListaResponsables.Column(0) & ";" & _
                    Me.ListaResponsables.Column(1) & ";" & _
                    Me.ListaResponsables.Column(2) & ";" & _
                    Me.ListaResponsables.Column(3)
    m_EnvioActual = Me.ListaResponsables.Column(3)
    If m_EnvioActual <> "Sí" And m_EnvioActual <> "No" Then
        m_Error = "El valor del JP actual no corresponde con lo indicado"
        Err.Raise 1000
    End If
    If m_EnvioActual = "Sí" Then
        m_EnvioFinal = "No"
    Else
        m_EnvioFinal = "Sí"
    End If
    m_LineaFinal = Me.ListaResponsables.Column(0) & ";" & _
                    Me.ListaResponsables.Column(1) & ";" & _
                    Me.ListaResponsables.Column(3) & ";" & _
                    m_EnvioFinal
    
    
    Set m_ExpOp = New ExpedienteOperaciones
    With m_ExpOp
        Set .Expediente = m_ObjExpedienteDTOActivo.Expediente
        .EditarEnvioCorreoResponsable Me.ListaResponsables.Column(0), m_EnvioFinal, p_Error:=m_Error
        If m_Error <> "" Then
            Err.Raise 1000
        End If
    End With
    
    CambiarLineaListaResponsables m_LineaActual, m_LineaFinal, m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Me.AllowEdits = True
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoCambiarEnvios_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
    End If
    Me.AllowEdits = True
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub ComandoCambiarJP_Click()
    Dim m_LineaActual As String
    Dim m_LineaFinal As String
    Dim m_JPActual As String
    Dim m_JPFinal As String
    Dim m_ColActual As Scripting.Dictionary
    Dim m_ColFinal As Scripting.Dictionary
    Dim m_ID As Variant
    Dim m_Responsable As ExpedienteResponsable
    Dim m_ExpOp As ExpedienteOperaciones
    On Error GoTo errores
    m_Error = ""
    DoCmd.Hourglass True
    Me.AllowEdits = False
    If Nz(Me.ListaResponsables, "") = "" Then
        m_Error = "Seleccione un elemento de la lista"
        Err.Raise 1000
    End If
    m_LineaActual = Me.ListaResponsables.Column(0) & ";" & _
                    Me.ListaResponsables.Column(1) & ";" & _
                    Me.ListaResponsables.Column(2) & ";" & _
                    Me.ListaResponsables.Column(3)
    m_JPActual = Me.ListaResponsables.Column(2)
    If m_JPActual <> "Sí" And m_JPActual <> "No" Then
        m_Error = "El valor del JP actual no corresponde con lo indicado"
        Err.Raise 1000
    End If
    If m_JPActual = "Sí" Then
        m_JPFinal = "No"
    Else
        m_JPFinal = "Sí"
    End If
    m_LineaFinal = Me.ListaResponsables.Column(0) & ";" & _
                    Me.ListaResponsables.Column(1) & ";" & _
                    m_JPFinal & ";" & _
                    Me.ListaResponsables.Column(3)
    
    Set m_ExpOp = New ExpedienteOperaciones
    With m_ExpOp
        Set .Expediente = m_ObjExpedienteDTOActivo.Expediente
        .EditarJPResponsable Me.ListaResponsables.Column(0), m_JPFinal, p_Error:=m_Error
        If m_Error <> "" Then
            Err.Raise 1000
        End If
    End With
   
    CambiarLineaListaResponsables m_LineaActual, m_LineaFinal, m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Me.AllowEdits = True
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoCambiarJP_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
    End If
    Me.AllowEdits = True
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub ComandoCopiarCPV_Click()
    Dim m_Lugar As String
    On Error GoTo errores
    m_Error = ""
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    Me.AllowEdits = False
    m_Lugar = Nz(Me.ListaCPVs.Column(1), "")
    If m_Lugar <> "" Then
        Me.AllowEdits = True
        VBA.DoEvents
        DoCmd.Hourglass False
        VBA.DoEvents
        CopiarAlPortapapeles m_Lugar
        pregunta = MsgBox("CPV copiado al portapapeles", vbInformation, "Copia del CPV")
        Exit Sub
    End If
    
    Me.AllowEdits = True
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoCopiarCPV_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
    End If
    Me.AllowEdits = True
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub ComandoCopiarLugar_Click()
    Dim m_Lugar As String
    On Error GoTo errores
    m_Error = ""
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    Me.AllowEdits = False
    m_Lugar = Nz(Me.ListaLugaresEjecucion.Column(1), "")
    If m_Lugar <> "" Then
        Me.AllowEdits = True
        VBA.DoEvents
        DoCmd.Hourglass False
        VBA.DoEvents
        CopiarAlPortapapeles m_Lugar
        pregunta = MsgBox("Lugar copiado al portapapeles", vbInformation, "Copia del lugar")
        Exit Sub
    End If
    
    Me.AllowEdits = True
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoCopiarLugar_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
    End If
    Me.AllowEdits = True
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub ComandoEliminarAnualidad_Click()
    Dim m_ExpOp As ExpedienteOperaciones
    Dim m_Anualidad As ExpedienteAnualidad
    Dim m_Año As String
    Dim i As Long
    
    On Error GoTo errores

    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    m_Año = Nz(Me.ListaAnualidad.Column(0), "")
    If m_Año = "" Then
         VBA.DoEvents
        DoCmd.Hourglass False
        VBA.DoEvents
        Exit Sub
    End If
    If EsAdministrador <> EnumSiNo.Sí Then
        m_Error = "Operacion no autorizada"
        Err.Raise 1000
    End If
    
    Set m_ExpOp = New ExpedienteOperaciones
    With m_ExpOp
        Set .Expediente = m_ObjExpedienteDTOActivo.Expediente
        .EliminarAnualidad p_Año:=m_Año, p_Error:=m_Error
        If m_Error <> "" Then
            Err.Raise 1000
        End If
    End With
    
    Set m_ObjExpedienteDTOActivo.ColAnualidades = m_ObjExpedienteDTOActivo.Expediente.Anualidades
    RellenarListaAnualidades
        
   
    
    
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoEliminarAnualidad_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
    End If
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub ComandoEliminarComercial_Click()
    Dim m_ExpOp As ExpedienteOperaciones
    Dim m_Comercial As Comercial
    Dim m_IDComercial As String
    Dim i As Long
    
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    m_IDComercial = Nz(Me.ListaComerciales.Column(0), "")
    If m_IDComercial = "" Then
         VBA.DoEvents
        DoCmd.Hourglass False
        VBA.DoEvents
        Exit Sub
    End If
    Set m_Comercial = constructor.getComercial(p_IDComercial:=m_IDComercial, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    If m_Comercial Is Nothing Then
        m_Error = "Seleccione un comercial de la lista"
        Err.Raise 1000
    End If
   
    Set m_ExpOp = New ExpedienteOperaciones
    With m_ExpOp
        Set .Expediente = m_ObjExpedienteDTOActivo.Expediente
        .EliminarComercial p_IDComercial:=m_Comercial.IDComercial, p_Error:=m_Error
        If m_Error <> "" Then
            Err.Raise 1000
        End If
    End With
    
    Set m_ObjExpedienteDTOActivo.ColComerciales = m_ObjExpedienteDTOActivo.Expediente.Comerciales
    RellenarListaComerciales
        
   
    
    If Me.ListaComerciales.ListCount > 0 Then
        Me.ListaComerciales.Selected(Me.ListaComerciales.ListCount - 1) = True
    End If
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoEliminarComercial_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
    End If
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub ComandoEliminarCPV_Click()
    Dim m_ExpOp As ExpedienteOperaciones
    Dim m_CPV As CPV
    Dim m_IDCPV As String
    Dim i As Long
    
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    m_IDCPV = Nz(Me.ListaCPVs.Column(0), "")
    If m_IDCPV = "" Then
         VBA.DoEvents
        DoCmd.Hourglass False
        VBA.DoEvents
        Exit Sub
    End If
    Set m_CPV = constructor.getCPV(p_IDCPV:=m_IDCPV, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    If m_CPV Is Nothing Then
        m_Error = "Seleccione un CPV de la lista"
        Err.Raise 1000
    End If

    Set m_ExpOp = New ExpedienteOperaciones
    With m_ExpOp
        Set .Expediente = m_ObjExpedienteDTOActivo.Expediente
        .EliminarCPV p_IDCPV:=m_CPV.IDCPV, p_Error:=m_Error
        If m_Error <> "" Then
            Err.Raise 1000
        End If
    End With
    
    Set m_ObjExpedienteDTOActivo.ColCPVs = m_ObjExpedienteDTOActivo.Expediente.CPVs
    RellenarListaCPVs
        
    
    
    If Me.ListaCPVs.ListCount > 0 Then
        Me.ListaCPVs.Selected(Me.ListaCPVs.ListCount - 1) = True
    End If
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoEliminarCPV_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
    End If
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub




Private Sub ComandoEliminarLugarEjecucion_Click()
    Dim m_ExpOp As ExpedienteOperaciones
    Dim m_Lugar As LugarEjecucion
    Dim m_IDLugarEjecucion As String
    Dim i As Long
    
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    m_IDLugarEjecucion = Nz(Me.ListaLugaresEjecucion.Column(0), "")
    If m_IDLugarEjecucion = "" Then
         VBA.DoEvents
        DoCmd.Hourglass False
        VBA.DoEvents
        Exit Sub
    End If
    Set m_Lugar = constructor.getLugarEjecucion(p_IDLugarEjecucion:=m_IDLugarEjecucion, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    If m_Lugar Is Nothing Then
        m_Error = "Seleccione un Lugar de Ejecución de la lista"
        Err.Raise 1000
    End If
    
    Set m_ExpOp = New ExpedienteOperaciones
    With m_ExpOp
        Set .Expediente = m_ObjExpedienteDTOActivo.Expediente
        .EliminarLugarEjecucion p_IDLugar:=m_Lugar.IDLugarEjecucion, p_Error:=m_Error
        If m_Error <> "" Then
            Err.Raise 1000
        End If
    End With
    
    Set m_ObjExpedienteDTOActivo.ColLugaresEjecucion = m_ObjExpedienteDTOActivo.Expediente.LugaresEjecucion
    RellenarListaLugares
        
    
    
    If Me.ListaLugaresEjecucion.ListCount > 0 Then
        Me.ListaLugaresEjecucion.Selected(Me.ListaLugaresEjecucion.ListCount - 1) = True
    End If
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoEliminarLugarEjecucion_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
    End If
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub ComandoEliminarPECAL_Click()
    Dim m_ExpOp As ExpedienteOperaciones
    Dim m_Pecal As PECAL
    Dim m_IDPecal As String
    Dim i As Long
    
    
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    m_IDPecal = Nz(Me.ListaPECALES.Column(0), "")
    If m_IDPecal = "" Then
         VBA.DoEvents
        DoCmd.Hourglass False
        VBA.DoEvents
        Exit Sub
    End If
    Set m_Pecal = constructor.getPecal(p_IDPEcal:=m_IDPecal, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    If m_Pecal Is Nothing Then
        m_Error = "Seleccione una PECAL de la lista"
        Err.Raise 1000
    End If
    
    Set m_ExpOp = New ExpedienteOperaciones
    With m_ExpOp
        Set .Expediente = m_ObjExpedienteDTOActivo.Expediente
         .EliminarPECAL p_IDPEcal:=m_Pecal.IDPECAL, p_Error:=m_Error
        If m_Error <> "" Then
            Err.Raise 1000
        End If
    End With
    
    Set m_ObjExpedienteDTOActivo.ColPECALES = m_ObjExpedienteDTOActivo.Expediente.PECALES
    RellenarListaPECAL
    
    
    
    If Me.ListaPECALES.ListCount > 0 Then
        Me.ListaPECALES.Selected(Me.ListaPECALES.ListCount - 1) = True
    End If
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoEliminarPECAL_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
    End If
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub ComandoEliminarRACs_Click()
    Dim m_ExpOp As ExpedienteOperaciones
    Dim m_RAC As RAC
    Dim m_IDRac As String
    Dim i As Long
    
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    m_IDRac = Nz(Me.ListaRACs.Column(0), "")
    If m_IDRac = "" Then
         VBA.DoEvents
        DoCmd.Hourglass False
        VBA.DoEvents
        Exit Sub
    End If
    Set m_RAC = constructor.getRAC(p_IDRac:=m_IDRac, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    If m_RAC Is Nothing Then
        m_Error = "Seleccione un RAC de la lista"
        Err.Raise 1000
    End If
   
    Set m_ExpOp = New ExpedienteOperaciones
    With m_ExpOp
        Set .Expediente = m_ObjExpedienteDTOActivo.Expediente
        .EliminarRAC p_IDRac:=m_RAC.IDRAC, p_Error:=m_Error
        If m_Error <> "" Then
            Err.Raise 1000
        End If
    End With
    
    Set m_ObjExpedienteDTOActivo.ColRACs = m_ObjExpedienteDTOActivo.Expediente.RACs
    RellenarListaRACs
        
    
    
    If Me.ListaRACs.ListCount > 0 Then
        Me.ListaRACs.Selected(Me.ListaRACs.ListCount - 1) = True
    End If
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoEliminarRACs_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
    End If
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub ComandoEliminarReponsable_Click()
    Dim m_ExpOp As ExpedienteOperaciones
    Dim m_Usuario As USUARIO
    Dim m_IDUsuario As String
    Dim i As Long
    
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    m_IDUsuario = Nz(Me.ListaResponsables.Column(0), "")
    If m_IDUsuario = "" Then
         VBA.DoEvents
        DoCmd.Hourglass False
        VBA.DoEvents
        Exit Sub
    End If
    Set m_Usuario = constructor.getUsuario(p_ID:=m_IDUsuario, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    If m_Usuario Is Nothing Then
        m_Error = "Seleccione un Responsable de la lista"
        Err.Raise 1000
    End If
    
    Set m_ExpOp = New ExpedienteOperaciones
    With m_ExpOp
        Set .Expediente = m_ObjExpedienteDTOActivo.Expediente
        .EliminarResponsable p_IDUsuario:=m_Usuario.ID, p_Error:=m_Error
        If m_Error <> "" Then
            Err.Raise 1000
        End If
    End With
    
    Set m_ObjExpedienteDTOActivo.ColResponsables = m_ObjExpedienteDTOActivo.Expediente.Responsables
    RellenarListaResponsables
        
  
    
    If Me.ListaResponsables.ListCount > 0 Then
        Me.ListaResponsables.Selected(Me.ListaResponsables.ListCount - 1) = True
    End If
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoEliminarReponsable_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
    End If
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub


Private Sub ComandoElegirPECAL_Click()
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    If FormularioAbierto("FormPECALESGestion") Then
        DoCmd.Close acForm, "FormPECALESGestion"
    End If
    Set m_ObjPECALActiva = Nothing
    DoCmd.OpenForm "FormPECALESGestion", OpenArgs:="PARA SELECCIONAR"
    If FormularioAbierto("FormPECALESGestion") Then
        Set m_FormPECAL = Forms("FormPECALESGestion")
    End If
    
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoElegirPECAL_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
    End If
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub ComandoElegirRAC_Click()
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    If FormularioAbierto("FormRACSGestion") Then
        DoCmd.Close acForm, "FormRACSGestion"
    End If
    Set m_ObjRACActivo = Nothing
    DoCmd.OpenForm "FormRACSGestion", OpenArgs:="PARA SELECCIONAR"
    If FormularioAbierto("FormRACSGestion") Then
        Set m_FormRAC = Forms("FormRACSGestion")
    End If
    
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoElegirRAC_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
    End If
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub ComandoElegirComercial_Click()
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    If FormularioAbierto("FormComercialesGestion") Then
        DoCmd.Close acForm, "FormComercialesGestion"
    End If
    Set m_ObjComercialActivo = Nothing
    DoCmd.OpenForm "FormComercialesGestion", OpenArgs:="PARA SELECCIONAR"
    If FormularioAbierto("FormComercialesGestion") Then
        Set m_FormComercial = Forms("FormComercialesGestion")
    End If
    
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoElegirComercial_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
    End If
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub ComandoElegirCPV_Click()
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    If FormularioAbierto("FormCPVsGestion") Then
        DoCmd.Close acForm, "FormCPVsGestion"
    End If
    Set m_ObjCPVActivo = Nothing
    DoCmd.OpenForm "FormCPVsGestion", OpenArgs:="PARA SELECCIONAR"
    If FormularioAbierto("FormCPVsGestion") Then
        Set m_FormCPV = Forms("FormCPVsGestion")
    End If
    
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoElegirCPV_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
    End If
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub ComandoElegirLugar_Click()
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    If FormularioAbierto("FormLugarEjecucionGestion") Then
        DoCmd.Close acForm, "FormLugarEjecucionGestion"
    End If
    Set m_ObjLugarEjecucionActiva = Nothing
    DoCmd.OpenForm "FormLugarEjecucionGestion", OpenArgs:="PARA SELECCIONAR"
    If FormularioAbierto("FormLugarEjecucionGestion") Then
        Set m_FormLugar = Forms("FormLugarEjecucionGestion")
    End If
    
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoElegirLugar_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
    End If
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub ComandoLimpiarAnualidad_Click()
    Me.AÑO = Null
    Me.BIIVA = Null
    Me.BIIPSI = Null
    Me.BIIGIC = Null
    Me.BIEXENTA = Null
End Sub

Private Sub ComandoLimpiarUsuario_Click()
    Me.Responsable = Null
    Me.EsJefeProyecto = Null
    Me.CorreoSiempre = Null
End Sub

Private Sub ListaResponsables_Click()
    If Nz(Me.ListaResponsables, "") = "" Then
        Me.ComandoCambiarJP.Enabled = False
        Me.ComandoCambiarEnvios.Enabled = False
    Else
        Me.ComandoCambiarJP.Enabled = True
        Me.ComandoCambiarEnvios.Enabled = True
    End If
End Sub

Private Sub m_FormComercial_Seleccionar(m_ComercialSeleccionado As Comercial)
     On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    
   
    If Not m_ComercialSeleccionado Is Nothing Then
       
       AltaComercial m_ComercialSeleccionado.IDComercial
    End If
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al m_FormComercial_Seleccionar se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
    End If
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub


Private Sub Form_Load()
    
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    Me.AllowEdits = False
    If AbiertoParaEditar = True Then
        If EsAdministrador = EnumSiNo.Sí Then
            Me.AllowEdits = True
        End If
    End If
    Me.Parent.Controls("ComandoRegistrar").Visible = False
    EstablecerDatos m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al Form_Load se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
    End If
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub


Public Function RellenarListaPECAL(Optional ByRef p_Error As String) As String
    Dim m_Col As Scripting.Dictionary
    Dim lst As ListBox
    Dim m_ID As Variant
    Dim m_Pecal As PECAL
    On Error GoTo errores
    Set m_ObjExpedienteDTOActivo.ColPECALES = getExpedientePECALES(m_ObjExpedienteDTOActivo.Expediente.IDExpediente, p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    
    Set m_Col = m_ObjExpedienteDTOActivo.ColPECALES
        Set lst = Me.ListaPECALES
        lst.RowSource = ""
        If Not m_Col Is Nothing Then
            For Each m_ID In m_Col
                Set m_Pecal = m_Col(m_ID)
                lst.AddItem m_Pecal.IDPECAL & ";" & m_Pecal.PECAL
                Set m_Pecal = Nothing
            Next
            lst.Selected(0) = True
        End If
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método RellenarListaPECAL ha producido el error n: " & Err.Number & _
        vbNewLine & "Detalle: " & Err.Description
    End If
End Function

Public Function RellenarListaLugares(Optional ByRef p_Error As String) As String
    Dim m_Col As Scripting.Dictionary
    Dim lst As ListBox
    Dim m_ID As Variant
    Dim m_Lugar As LugarEjecucion
    On Error GoTo errores
    Set m_ObjExpedienteDTOActivo.ColLugaresEjecucion = getExpedienteLugaresEjecucion(m_ObjExpedienteDTOActivo.Expediente.IDExpediente, p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    
    Set m_Col = m_ObjExpedienteDTOActivo.ColLugaresEjecucion
    Set lst = Me.ListaLugaresEjecucion
    lst.RowSource = ""
    If Not m_Col Is Nothing Then
        For Each m_ID In m_Col
            Set m_Lugar = m_Col(m_ID)
            lst.AddItem m_Lugar.IDLugarEjecucion & ";" & Replace(m_Lugar.LugarEjecucion, ";", ":")
            Set m_Lugar = Nothing
        Next
        lst.Selected(0) = True
    End If
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método RellenarListaLugares ha producido el error n: " & Err.Number & _
        vbNewLine & "Detalle: " & Err.Description
    End If
End Function


Public Function RellenarListaComerciales(Optional ByRef p_Error As String) As String
    Dim m_Col As Scripting.Dictionary
    Dim lst As ListBox
    Dim m_ID As Variant
    Dim m_Comercial As Comercial
    On Error GoTo errores
     Set m_ObjExpedienteDTOActivo.ColComerciales = getExpedienteComerciales(m_ObjExpedienteDTOActivo.Expediente.IDExpediente, p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    
    Set m_Col = m_ObjExpedienteDTOActivo.ColComerciales
    Set lst = Me.ListaComerciales
    lst.RowSource = ""
    If Not m_Col Is Nothing Then
        For Each m_ID In m_Col
            Set m_Comercial = m_Col(m_ID)
            lst.AddItem m_Comercial.IDComercial & ";" & m_Comercial.Comercial
            Set m_Comercial = Nothing
        Next
        lst.Selected(0) = True
    End If
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método RellenarListaComerciales ha producido el error n: " & Err.Number & _
        vbNewLine & "Detalle: " & Err.Description
    End If
End Function

Public Function RellenarListaCPVs(Optional ByRef p_Error As String) As String
    Dim m_Col As Scripting.Dictionary
    Dim lst As ListBox
    Dim m_ID As Variant
    Dim m_CPV As CPV
    On Error GoTo errores
    Set m_ObjExpedienteDTOActivo.ColCPVs = getExpedienteCPVS(m_ObjExpedienteDTOActivo.Expediente.IDExpediente, p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    
    Set m_Col = m_ObjExpedienteDTOActivo.ColCPVs
    Set lst = Me.ListaCPVs
    lst.RowSource = ""
    If Not m_Col Is Nothing Then
        For Each m_ID In m_Col
            Set m_CPV = m_Col(m_ID)
            lst.AddItem m_CPV.IDCPV & ";" & m_CPV.CPV
            Set m_CPV = Nothing
        Next
        lst.Selected(0) = True
    End If
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método RellenarListaCPVs ha producido el error n: " & Err.Number & _
        vbNewLine & "Detalle: " & Err.Description
    End If
End Function

Public Function RellenarListaRACs(Optional ByRef p_Error As String) As String
    Dim m_Col As Scripting.Dictionary
    Dim lst As ListBox
    Dim m_ID As Variant
    Dim m_RAC As RAC
    On Error GoTo errores
    Set m_ObjExpedienteDTOActivo.ColRACs = getExpedienteRACS(m_ObjExpedienteDTOActivo.Expediente.IDExpediente, p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    Set m_Col = m_ObjExpedienteDTOActivo.ColRACs
    Set lst = Me.ListaRACs
    lst.RowSource = ""
    If Not m_Col Is Nothing Then
        For Each m_ID In m_Col
            Set m_RAC = m_Col(m_ID)
            lst.AddItem m_RAC.IDRAC & ";" & m_RAC.RAC
            Set m_RAC = Nothing
        Next
        lst.Selected(0) = True
    End If
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método RellenarListaRACs ha producido el error n: " & Err.Number & _
        vbNewLine & "Detalle: " & Err.Description
    End If
End Function
Public Function RellenarListaResponsables(Optional ByRef p_Error As String) As String
    Dim m_Col As Scripting.Dictionary
    Dim lst As ListBox
    Dim m_ID As Variant
    Dim m_Responsable As ExpedienteResponsable
    On Error GoTo errores
    Set m_ObjExpedienteDTOActivo.ColResponsables = getExpedienteResponsables(m_ObjExpedienteDTOActivo.Expediente.IDExpediente, p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    Set m_Col = m_ObjExpedienteDTOActivo.ColResponsables
    Set lst = Me.ListaResponsables
    lst.RowSource = "ID;Nombre;JP;Aviso"
    If Not m_Col Is Nothing Then
        For Each m_ID In m_Col
            Set m_Responsable = m_Col(m_ID)
            lst.AddItem m_Responsable.IdUsuario & ";" & _
                        m_Responsable.USUARIO.Nombre & ";" & _
                        m_Responsable.EsJefeProyecto & ";" & _
                        m_Responsable.CorreoSiempre
            Set m_Responsable = Nothing
        Next
        lst.Selected(0) = True
    End If
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método RellenarListaResponsables ha producido el error n: " & Err.Number & _
        vbNewLine & "Detalle: " & Err.Description
    End If
End Function
Public Function RellenarListaAnualidades(Optional ByRef p_Error As String) As String
    Dim m_Col As Scripting.Dictionary
    Dim lst As ListBox
    Dim m_ID As Variant
    Dim m_ExpAnualidad As ExpedienteAnualidad
    On Error GoTo errores
    Set m_ObjExpedienteDTOActivo.ColAnualidades = getExpedienteAnualidades(m_ObjExpedienteDTOActivo.Expediente.IDExpediente, p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    Set m_Col = m_ObjExpedienteDTOActivo.ColAnualidades
    Set lst = Me.ListaAnualidad
    lst.RowSource = "Año;Presupuesto"
    If Not m_Col Is Nothing Then
        For Each m_ID In m_Col
            Set m_ExpAnualidad = m_Col(m_ID)
            lst.AddItem m_ExpAnualidad.AÑO & ";" & Format(m_ExpAnualidad.Presupuesto, "#,##0.00 €")
            Set m_ExpAnualidad = Nothing
        Next
        lst.Selected(0) = True
    End If
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método RellenarListaAnualidades ha producido el error n: " & Err.Number & _
        vbNewLine & "Detalle: " & Err.Description
    End If
End Function
Public Function RellenarListas(Optional ByRef p_Error As String) As String
    
    Dim m_Col As Scripting.Dictionary
    Dim lst As ListBox
    Dim m_ID As Variant
    
    On Error GoTo errores
    
    Me.ListaPECALES.RowSource = ""
    Me.ListaLugaresEjecucion.RowSource = ""
    Me.ListaComerciales.RowSource = ""
    Me.ListaCPVs.RowSource = ""
    Me.ListaRACs.RowSource = ""
    Me.ListaResponsables.RowSource = "ID;Nombre;JP;Aviso"
    Me.ListaAnualidad.RowSource = "Año;Presupuesto"
    
    
    'PECALES
        RellenarListaPECAL p_Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
    'CPVs
        RellenarListaCPVs p_Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
    'LUGARES EJECUCIÓN
        RellenarListaLugares p_Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
   
    'COMERCIALES
        RellenarListaComerciales p_Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
    
    'RACs
        RellenarListaRACs p_Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
    'Responsable
        RellenarListaResponsables p_Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
    'ANUALIDADES
        RellenarListaAnualidades p_Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método RellenarListas ha producido el error n: " & Err.Number & _
        vbNewLine & "Detalle: " & Err.Description
    End If
End Function


Public Function EstablecerDatos(Optional ByRef p_Error As String) As String
    Dim ctl As Control
    Dim m_expediente As Expediente
    
    On Error GoTo errores
    If m_ObjExpedienteDTOActivo.Expediente Is Nothing Then
        p_Error = "El formulario se ha abierto con parámetros insuficientes"
        Err.Raise 1000
    End If
    For Each ctl In Me.Controls
        If Nz(ctl.Tag, "") = "EJECUTIVO" Then
            If AbiertoParaEditar = True Then
                If EsAdministrador = EnumSiNo.Sí Then
                    ctl.Enabled = True
                Else
                    ctl.Enabled = False
                End If
            Else
                ctl.Enabled = False
            End If
        End If
    Next
    
    
    RellenarListas
    
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método EstablecerDatos ha producido el error n: " & Err.Number & _
        vbNewLine & "Detalle: " & Err.Description
    End If

End Function

Private Sub m_FormCPV_Seleccionar(m_CPVSeleccionado As CPV)
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    If Not m_CPVSeleccionado Is Nothing Then
        AltaCPV m_CPVSeleccionado.IDCPV
    End If
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al m_FormCPV_Alta se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
    End If
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub



Private Sub m_FormLugar_Seleccionar(m_LugarEjecucionSeleccionada As LugarEjecucion)
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    
    If Not m_LugarEjecucionSeleccionada Is Nothing Then
        AltaLugarEjecucion m_LugarEjecucionSeleccionada.IDLugarEjecucion
    End If
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al m_FormLugar_Seleccionar se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
    End If
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub m_FormPECAL_Seleccionar(m_PECALSeleccionada As PECAL)
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    
   
    If Not m_PECALSeleccionada Is Nothing Then
        AltaPECAL m_PECALSeleccionada.IDPECAL
       
    End If
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al m_FormPECAL_Seleccionar se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
    End If
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub m_FormRAC_Seleccionar(m_RACSeleccionado As RAC)
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    
    
    If Not m_RACSeleccionado Is Nothing Then
        AltaRAC m_RACSeleccionado.IDRAC
        
    End If
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al m_FormRAC_Seleccionar se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
    End If
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub m_FormUsuarios_Seleccionar(m_UsuarioSeleccionado As USUARIO)
     On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    
   
    If Not m_UsuarioSeleccionado Is Nothing Then
        Me.Responsable = m_UsuarioSeleccionado.Nombre
        
    End If
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al m_FormUsuarios_Seleccionar se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
    End If
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub


Public Function CambiarLineaListaResponsables( _
                                                p_LineaActual As String, _
                                                p_LineaFInal As String, _
                                                Optional ByRef p_Error As String _
                                                ) As String
    Dim m_rowsourceInicial As String
    Dim m_rowsourceFinal As String
    On Error GoTo errores
    
    m_rowsourceInicial = Me.ListaResponsables.RowSource
    
    If InStr(1, m_rowsourceInicial, p_LineaActual) <> 0 Then
        m_rowsourceFinal = Replace(m_rowsourceInicial, p_LineaActual, p_LineaFInal)
        Me.ListaResponsables.RowSource = m_rowsourceFinal
    End If
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método CambiarLineaListaResponsables ha producido el error nº: " & Err.Number & vbCrLf & "Detalle: " & Err.Description
    End If
End Function
