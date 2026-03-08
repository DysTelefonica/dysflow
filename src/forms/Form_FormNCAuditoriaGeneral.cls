VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "Form_FormNCAuditoriaGeneral"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = True
Attribute VB_PredeclaredId = True
Attribute VB_Exposed = False
Option Compare Database
Option Explicit

Private m_Error As String


Public Sub ComandoActualizar_Click()
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    
    m_Error = ""
    Me.Estado = Null
   
    
    ActualizarDatosNCAuditoria m_ObjNCAuditoriaActiva, m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set Form_FormNCAuditoria.m_NCAlInicio = constructor.getNCAuditoria(p_IDNC:=m_ObjNCAuditoriaActiva.id, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set m_ObjEntorno.ColPuntosNormaNCAuditorias = Nothing
    If m_ObjNCAuditoriaActiva.id <> "" Then
        Me.Parent.Controls("lblTitulo").Caption = "EDICIÓN DE NO CONFORMIDAD DE AUDITORÍA " & m_ObjNCAuditoriaActiva.Auditoria.NombreAuditoria & " " & _
        Format(m_ObjNCAuditoriaActiva.Numero, "00")
        Me.Parent.Controls("ComandoInforme").Enabled = True
    End If
    EstablecerDatos
   
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoActualizar_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub


Private Sub ComandoControlEficaciaDatos_Click()
    On Error GoTo errores
    
    RellenarDatosObjeto m_Error
    If m_Error <> "" Then
        Err.Raise 100
    End If
    If m_ObjNCAuditoriaActiva.DatosGeneralesOK = EnumSino.No Then
        m_Error = "Antes de rellenar este apartado ha de tener todos los datos obligatorios principales rellenos"
        Err.Raise 1000
    End If
    If FormularioAbierto("FormNCAuditoriaControlEficaciaAlta") Then
        DoCmd.Close acForm, "FormNCAuditoriaControlEficaciaAlta", acSaveNo
    End If
    DoCmd.OpenForm "FormNCAuditoriaControlEficaciaAlta"
    
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoControlEficaciaDatos_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub

Public Sub ComandoGrabar_Click()
    
    
    Dim m_NCOp As NCaUDITORIAOperaciones
    Dim m_HaHabidoCambios As Boolean
    
    Dim m_EstadoAlInicio As String
    Dim m_Estado As String
    On Error GoTo errores
    
   
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    If EsTecnico = EnumSino.Sí Then
        m_Error = "No tiene autorización para esa acción"
        Err.Raise 1000
    End If
    m_HaHabidoCambios = HaHabidoCambios(m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    If Not m_HaHabidoCambios Then
        m_Error = "No hay cambios que guardar"
        Err.Raise 1000
    End If
    RellenarDatosObjeto m_Error
    If m_Error <> "" Then
        Err.Raise 100
    End If
    
    If Not Form_FormNCAuditoria.m_NCAlInicio Is Nothing Then
        If m_ObjNCAuditoriaActiva.RequiereControlEficacia = "No" Then
            If Form_FormNCAuditoria.m_NCAlInicio.ControlEficacia <> "" Then
                VBA.DoEvents
                DoCmd.Hourglass False
                VBA.DoEvents
                pregunta = MsgBox("Había un control de eficacia ya descrito" & vbNewLine & _
                                "¿Desea guardar y perder ese dato?", vbExclamation + vbYesNo + vbDefaultButton2, "Eliminar control de eficacia")
                                
                If pregunta <> vbYes Then
                    
                    Exit Sub
                End If
                VBA.DoEvents
                DoCmd.Hourglass True
                VBA.DoEvents
            End If
        End If
    End If
    
    Set m_NCOp = New NCaUDITORIAOperaciones
    With m_NCOp
        Set m_NCOp.nc = m_ObjNCAuditoriaActiva
        m_EstadoAlInicio = m_ObjNCAuditoriaActiva.Estado
        .RegistrarDatosUnicos Form_FormNCAuditoria.m_NCAlInicio, m_Error
        If m_Error <> "" Then
            Err.Raise 1000
        End If
        m_Estado = m_ObjNCAuditoriaActiva.Estado
        
    End With
    
    Set Form_FormNCAuditoria.m_NCAlInicio = constructor.getNCAuditoria(p_IDNC:=m_ObjNCAuditoriaActiva.id, p_Error:=m_Error)
    EstablecerColorPestañasNCAuditoria p_Error:=m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    
    ComandoActualizar_Click
    If FormularioAbierto("FormNCAuditoriaGestion") Then
        Form_FormNCAuditoriaGestion.ActualizarLista EnumSino.Sí
    End If
    EstablecerDatos m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
     pregunta = MsgBox("Registro correcto de " & m_ObjNCAuditoriaActiva.Tipo & " de Auditoria " & Format(m_ObjNCAuditoriaActiva.Numero, "00"), _
                 vbInformation, "Registro correcto")
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
     If m_EstadoAlInicio <> "" Then
         If m_EstadoAlInicio <> "Cerrada" Then
             If m_Estado = "Cerrada" Then
                 pregunta = MsgBox("El regisro pasa a estar cerrado ", vbInformation, "Cierre de registro")
             End If
         Else
             If m_EstadoAlInicio = "Cerrada" Then
                 If m_Estado <> "Cerrada" Then
                     pregunta = MsgBox("El registro ha dejado de estar cerrado ", vbInformation, "Reapertura de registro")
                 End If
             End If
         End If
     End If
    
    m_EstadoAlInicio = m_Estado
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoGrabar_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub




Private Sub Form_Load()
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    EstablecerDatos m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    
    
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al Form_Load se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub

Private Function EstablecerCombos( _
                                    Optional ByRef p_Error As String _
                                    ) As Scripting.Dictionary
   
    
    On Error GoTo errores
    
    
    EstablecerComboResponsablesImplantacion Me.RESPONSABLEIMPLANTACION, p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    EstablecerComboPuntosNormaNCAuditorias Me.PuntoNorma, p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método EstablecerCombos ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function

Public Function EstablecerDatos( _
                                    Optional ByRef p_Error As String _
                                    ) As String
   
    
    
    Dim m_fechaCierreCalculada As String
    Dim m_EstadoTitulo As String
    Dim m_FechaPrevCierre As String
    Dim m_CausaYAnalisRaiz As String
    Dim m_FechaPrevistaControlEficacia As String
    
    Dim m_FPREVCIERRE As String
    Dim m_FechaCierre As String
    Dim m_DatosGeneralesOK As EnumSino
    On Error GoTo errores
    EstablecerCombos
    If m_ObjNCAuditoriaActiva Is Nothing Then
        p_Error = "El formulario se ha abierto con parámetros insuficientes"
        Err.Raise 1000
        
    End If
    Me.Tipo.SetFocus
    If m_ObjNCAuditoriaActiva.id = "" Then
        Me.ComandoActualizar.Enabled = False
        Me.FechaApertura = Date
        Me.NombreAuditoria = m_ObjAuditoriaActiva.NombreAuditoria
        Me.Numero = m_ObjAuditoriaActiva.NumeroNCCalculado(m_ObjNCAuditoriaActiva.Tipo, p_Error)
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        Me.MotivoNoAccionCorrectiva.Tag = "DATO"
        RellenarBordeCamposObligatorios Me
        Exit Function
    End If
    
    If Form_FormNCAuditoria.m_NCAlInicio Is Nothing Then
        Set Form_FormNCAuditoria.m_NCAlInicio = constructor.getNCAuditoria(p_IDNC:=m_ObjNCAuditoriaActiva.id, p_Error:=p_Error)
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        If Form_FormNCAuditoria.m_NCAlInicio Is Nothing Then
            p_Error = "El formulario se ha abierto con parámetros insuficientes"
            Err.Raise 1000
        End If
    End If
    
    Me.Estado.ForeColor = Me.Numero.ForeColor
    Me.Estado.BorderWidth = Me.Numero.BorderWidth
    With Form_FormNCAuditoria.m_NCAlInicio
        If Not .Auditoria Is Nothing Then
            Me.NombreAuditoria = .Auditoria.NombreAuditoria
        End If
    
        .EstadoGrabar
        m_EstadoTitulo = .EstadoTitulo
        If m_EstadoTitulo <> "" Then
            Me.Estado = m_EstadoTitulo
        End If
        
        If .Numero <> "" Then
            Me.Numero = Format(.Numero, "00")
        End If
        If .Tipo <> "" Then
            Me.Tipo = .Tipo
        End If
        If .RequiereAccionCorrectiva <> "" Then
            Me.RequiereAccionCorrectiva = .RequiereAccionCorrectiva
        End If
        If Me.RequiereAccionCorrectiva = "No" Then
            Me.MotivoNoAccionCorrectiva.Tag = "DATO;OBLIGATORIO"
        Else
            Me.MotivoNoAccionCorrectiva.Tag = "DATO"
        End If
        If .MotivoNoAccionCorrectiva <> "" Then
            Me.MotivoNoAccionCorrectiva = .MotivoNoAccionCorrectiva
        End If
        If .Descripcion <> "" Then
            Me.Descripcion = .Descripcion
        End If
        If .CAUSARAIZ <> "" Then
            Me.CAUSARAIZ = .CAUSARAIZ
        End If
        If .PuntoNorma <> "" Then
            Me.PuntoNorma = .PuntoNorma
        End If
        If .RESPONSABLEIMPLANTACION <> "" Then
            Me.RESPONSABLEIMPLANTACION = .RESPONSABLEIMPLANTACION
        End If
        Me.ComandoControlEficaciaDatos.Enabled = False
        
        If .RequiereControlEficacia <> "" Then
            Me.RequiereControlEficacia = .RequiereControlEficacia
        End If
        
        If .FechaApertura <> "" Then
            Me.FechaApertura = .FechaApertura
        End If
        .FPREVCIERREGrabar
        If .FPREVCIERRE <> "" Then
            Me.FPREVCIERRE = .FPREVCIERRE
        End If
        .FECHACIERREGrabar
        If .FECHACIERRE <> "" Then
            Me.FECHACIERRE = .FECHACIERRE
        End If
        
        
        
    End With
    
   
    RellenarBordeCamposObligatorios Me
    Me.AllowEdits = True
    If FormularioAbierto("FormNCAuditoriaGestion") Then
        Form_FormNCAuditoriaGestion.ActualizarLineaListaConDatos Nz(Me.Estado, ""), Nz(Me.FechaApertura, ""), Nz(Me.FECHACIERRE, ""), p_Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
    End If
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método EstablecerDatos ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function

Private Sub Tipo_BeforeUpdate(Cancel As Integer)
    On Error Resume Next
   
    RellenarBordeCamposObligatorios Me
End Sub

Private Sub RequiereAccionCorrectiva_BeforeUpdate(Cancel As Integer)
    On Error Resume Next
   
    If Me.RequiereAccionCorrectiva = "Sí" Then
        Me.MotivoNoAccionCorrectiva.Enabled = False
        Me.MotivoNoAccionCorrectiva = Null
    Else
        
        Me.MotivoNoAccionCorrectiva.Enabled = True
    End If
    If Me.RequiereAccionCorrectiva = "No" Then
        Me.MotivoNoAccionCorrectiva.Tag = "DATO;OBLIGATORIO"
    Else
        Me.MotivoNoAccionCorrectiva.Tag = "DATO"
    End If
    If Me.RequiereAccionCorrectiva = "No" Then
        Me.RequiereControlEficacia = Null
        Me.ComandoControlEficaciaDatos.Enabled = False
    End If
    
    RellenarBordeCamposObligatorios Me
End Sub

Private Sub MotivoNoAccionCorrectiva_BeforeUpdate(Cancel As Integer)
    On Error Resume Next
   
    RellenarBordeCamposObligatorios Me
End Sub

Private Sub Descripcion_BeforeUpdate(Cancel As Integer)
    On Error Resume Next
    
    RellenarBordeCamposObligatorios Me
End Sub
Private Sub CAUSARAIZ_BeforeUpdate(Cancel As Integer)
    On Error Resume Next
    
   RellenarBordeCamposObligatorios Me
End Sub
Private Sub PuntoNorma_BeforeUpdate(Cancel As Integer)
    On Error Resume Next
    
    RellenarBordeCamposObligatorios Me
End Sub
Private Sub RESPONSABLEIMPLANTACION_BeforeUpdate(Cancel As Integer)
    On Error Resume Next
    
    RellenarBordeCamposObligatorios Me
End Sub
Private Sub RequiereControlEficacia_AfterUpdate()
    On Error Resume Next
    
    
    
    If Form_FormNCAuditoria.m_PermitidoEditar = EnumSino.Sí Then
        RellenarBordeCamposObligatorios Me
        If Nz(Me.RequiereControlEficacia, "") = "Sí" Then
            Me.ComandoControlEficaciaDatos.Enabled = True
        Else
            Me.ComandoControlEficaciaDatos.Enabled = False
        End If
    End If
End Sub



Public Function RellenarDatosObjeto(Optional ByRef p_Error As String) As String
    
    Dim ctl As Control
    Dim m_Valor As String
    Dim m_Motivo As String
    On Error GoTo errores
    
    For Each ctl In Me.Controls
        If InStr(1, Nz(ctl.Tag, ""), "DATO") <> 0 Then
            'Debug.Print ctl.Tag
            m_ObjNCAuditoriaActiva.SetPropiedad ctl.Name, Nz(ctl.Value, ""), p_Error
            If p_Error <> "" Then
                Err.Raise 1000
            End If
            
        End If
    Next
    m_ObjNCAuditoriaActiva.IDAuditoria = m_ObjAuditoriaActiva.IDAuditoria
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método RellenarDatosObjeto ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function

Public Function HaHabidoCambios(Optional ByRef p_Error As String) As Boolean

    On Error GoTo errores
    
    If Form_FormNCAuditoria.m_NCAlInicio Is Nothing Then
        HaHabidoCambios = True
        Exit Function
    End If
    
    
    With Me
        If Nz(.Tipo, "") <> Form_FormNCAuditoria.m_NCAlInicio.Tipo Then
            HaHabidoCambios = True
            Exit Function
        End If
        If Nz(.RequiereAccionCorrectiva, "") <> Form_FormNCAuditoria.m_NCAlInicio.RequiereAccionCorrectiva Then
            HaHabidoCambios = True
            Exit Function
        End If
        
        If Nz(.MotivoNoAccionCorrectiva, "") <> Form_FormNCAuditoria.m_NCAlInicio.MotivoNoAccionCorrectiva Then
            HaHabidoCambios = True
            Exit Function
        End If
        
       
        If Nz(.Descripcion, "") <> Form_FormNCAuditoria.m_NCAlInicio.Descripcion Then
            HaHabidoCambios = True
            Exit Function
        End If
        If Nz(.CAUSARAIZ, "") <> Form_FormNCAuditoria.m_NCAlInicio.CAUSARAIZ Then
            HaHabidoCambios = True
            Exit Function
        End If
        If Nz(.PuntoNorma, "") <> Form_FormNCAuditoria.m_NCAlInicio.PuntoNorma Then
            HaHabidoCambios = True
            Exit Function
        End If
        
        If Nz(.RESPONSABLEIMPLANTACION, "") <> Form_FormNCAuditoria.m_NCAlInicio.RESPONSABLEIMPLANTACION Then
            HaHabidoCambios = True
            Exit Function
        End If
        If Nz(.RequiereControlEficacia, "") <> Form_FormNCAuditoria.m_NCAlInicio.RequiereControlEficacia Then
            HaHabidoCambios = True
            Exit Function
        End If
        
        If Nz(.RequiereControlEficacia, "") <> Form_FormNCAuditoria.m_NCAlInicio.RequiereControlEficacia Then
            HaHabidoCambios = True
            Exit Function
        End If
        If Nz(.FechaApertura, "") <> Form_FormNCAuditoria.m_NCAlInicio.FechaApertura Then
            HaHabidoCambios = True
            Exit Function
        End If
       
        
    End With
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método HaHabidoCambios ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function
