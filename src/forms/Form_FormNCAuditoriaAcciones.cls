VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "Form_FormNCAuditoriaAcciones"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = True
Attribute VB_PredeclaredId = True
Attribute VB_Exposed = False
Option Compare Database
Option Explicit


Dim m_NC As NCAuditoria

Public m_ACSeleccionada As ACAuditoria
Public m_ARSeleccionada As ARAuditoria

Private WithEvents m_FormAnexos As Form_FormARAuditoriaDocumentos
Attribute m_FormAnexos.VB_VarHelpID = -1
Private WithEvents m_FormAR As Form_FormNCAuditoriaAR
Attribute m_FormAR.VB_VarHelpID = -1
Private WithEvents m_FormAC As Form_FormNCAuditoriaAC
Attribute m_FormAC.VB_VarHelpID = -1
Private m_Error As String

Private Sub ComandoACAlta_Click()
    
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    If EsTecnico = EnumSino.Sí Then
        m_Error = "No tiene autorización para esa acción"
        Err.Raise 1000
    End If
    If m_ObjNCAuditoriaActiva.DatosGeneralesOK <> EnumSino.Sí Then
        m_Error = "Debe regularizar primero los datos que faltan en la ficha general"
        Err.Raise 1000
    End If
    
    If FormularioAbierto("FormNCAuditoriaAC") Then
        DoCmd.Close acForm, "FormNCAuditoriaAC", acSaveNo
    End If
    Set m_ObjACAuditoriaActiva = Nothing

    DoCmd.OpenForm "FormNCAuditoriaAC", OpenArgs:=m_ObjNCAuditoriaActiva.Estado
    If FormularioAbierto("FormNCAuditoriaAC") Then
        Set m_FormAC = Forms("FormNCAuditoriaAC")
    End If
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoACAlta_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub

Private Sub ComandoACBorrar_Click()
    Dim ACOP As ACAuditoriaOperaciones
    
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    
    m_Error = ""
    If EsTecnico = EnumSino.Sí Then
        m_Error = "No tiene autorización para esa acción"
        Err.Raise 1000
    End If
    If m_ACSeleccionada Is Nothing Then
        Set m_ACSeleccionada = constructor.getACAuditoria(p_IDAC:=Nz(Me.ListaAC.Column(0), ""), p_Error:=m_Error)
        If m_Error <> "" Then
            Err.Raise 1000
        End If
        If m_ACSeleccionada Is Nothing Then
            m_Error = "Seleccione un elemento de la lista superior"
            Err.Raise 1000
        End If
    End If
    If m_ACSeleccionada.ARs Is Nothing Then
        VBA.DoEvents
        DoCmd.Hourglass False
        VBA.DoEvents
        pregunta = MsgBox("¿Desea borrar la acción Correctiva seleccionada?", vbExclamation + vbYesNo + vbDefaultButton2, "Eliminar acción correctiva")
        If pregunta <> vbYes Then
            Exit Sub
        End If
        VBA.DoEvents
        DoCmd.Hourglass True
        VBA.DoEvents
    Else
        VBA.DoEvents
        DoCmd.Hourglass False
        VBA.DoEvents
        pregunta = MsgBox("¿Desea borrar la acción correctiva seleccionada junto con sus " & _
                    m_ACSeleccionada.ARs.count & " tareas asociadas?", _
                    vbExclamation + vbYesNo + vbDefaultButton2, "Eliminar acción correctiva")
        If pregunta <> vbYes Then
            Exit Sub
        End If
        VBA.DoEvents
        DoCmd.Hourglass True
        VBA.DoEvents
    End If
    Set ACOP = New ACAuditoriaOperaciones
    With ACOP
        Set .AC = m_ACSeleccionada
        
        .Eliminar m_Error
        If m_Error <> "" Then
            Err.Raise 1000
        End If
        Set m_ObjNCAuditoriaActiva.Replanificaciones = Nothing
        Set m_ObjNCAuditoriaActiva.ACs = Nothing
    End With
    
   
    
    EstablecerDatos m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    If FormularioAbierto("FormNCAuditoriaGestion") Then
        Form_FormNCAuditoriaGestion.ActualizarLineaLista
    End If
    VBA.DoEvents
        DoCmd.Hourglass False
        VBA.DoEvents
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoACBorrar_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub

Private Sub ComandoARDocumentos_Click()
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    
    m_Error = ""
    
    If m_ARSeleccionada Is Nothing Then
        Set m_ARSeleccionada = constructor.getARAuditoria(p_IDAR:=Nz(Me.ListaAR.Column(0), ""), p_Error:=m_Error)
        If m_Error <> "" Then
            Err.Raise 1000
        End If
        If m_ARSeleccionada Is Nothing Then
            m_Error = "Seleccione un elemento de la lista superior"
            Err.Raise 1000
        End If
    End If
    If FormularioAbierto("FormARAuditoriaDocumentos") Then
        DoCmd.Close acForm, "FormARAuditoriaDocumentos", acSaveNo
    End If
    Set m_ObjARAuditoriaActiva = m_ARSeleccionada
    DoCmd.OpenForm "FormARAuditoriaDocumentos"
    If FormularioAbierto("FormARAuditoriaDocumentos") Then
        Set m_FormAnexos = Forms("FormARAuditoriaDocumentos")
    End If
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoARDocumentos_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub

Private Sub ComandoACEdicion_Click()
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    
    m_Error = ""
    If m_ACSeleccionada Is Nothing Then
        Set m_ACSeleccionada = constructor.getACAuditoria(p_IDAC:=Nz(Me.ListaAC.Column(0), ""), p_Error:=m_Error)
        If m_Error <> "" Then
            Err.Raise 1000
        End If
        If m_ACSeleccionada Is Nothing Then
            m_Error = "Seleccione un elemento de la lista superior"
            Err.Raise 1000
        End If
    End If
    If FormularioAbierto("FormNCAuditoriaAC") Then
        DoCmd.Close acForm, "FormNCAuditoriaAC", acSaveNo
    End If
    Set m_ObjACAuditoriaActiva = m_ACSeleccionada
    DoCmd.OpenForm "FormNCAuditoriaAC"
    If FormularioAbierto("FormNCAuditoriaAC") Then
        Set m_FormAC = Forms("FormNCAuditoriaAC")
    End If
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoACEdicion_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub

Private Sub ComandoACHistorial_Click()
    Dim m_mensaje As String
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    If m_ACSeleccionada Is Nothing Then
        Set m_ACSeleccionada = constructor.getACAuditoria(p_IDAC:=Nz(Me.ListaAC.Column(0), ""), p_Error:=m_Error)
        If m_Error <> "" Then
            Err.Raise 1000
        End If
        If m_ACSeleccionada Is Nothing Then
            m_Error = "Seleccione un elemento de la lista superior"
            Err.Raise 1000
        End If
    End If
    m_mensaje = HTMHistorialAuditoria(m_ACSeleccionada, m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    HTMLENTXT p_HTML:=m_mensaje, p_Error:=m_Error
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
        m_Error = "Al ComandoACHistorial_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub

Private Sub ComandoActualizarACs_Click()
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    
    m_Error = ""
    ActualizarDatosACsAuditoria m_NC.ACs, m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set m_NC.ACs = Nothing
    EstablecerDatos
    If FormularioAbierto("FormNCAuditoriaGestion") Then
        Form_FormNCAuditoriaGestion.ActualizarLineaLista
    End If
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
    
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoActualizarACs_Click se ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
    End If
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub ComandoActualizarARs_Click()
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    
    m_Error = ""
    If m_ACSeleccionada Is Nothing Then
        Set m_ACSeleccionada = constructor.getACAuditoria(p_IDAC:=Nz(Me.ListaAC.Column(0), ""), p_Error:=m_Error)
        If m_Error <> "" Then
            Err.Raise 1000
        End If
        If m_ACSeleccionada Is Nothing Then
            m_Error = "Seleccione un elemento de la lista superior"
            Err.Raise 1000
        End If
    End If
    ActualizarDatosARsAuditoria m_ACSeleccionada.ARs, m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set m_ACSeleccionada.ARs = Nothing
    Set m_ACSeleccionada = Nothing
    If FormularioAbierto("FormNCAuditoriaGestion") Then
        Form_FormNCAuditoriaGestion.ActualizarLineaLista
    End If
    ListaAC_Click
    
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoActualizarARs_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub

Private Sub ComandoARAlta_Click()
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    
    m_Error = ""
    If EsTecnico = EnumSino.Sí Then
        m_Error = "No tiene autorización para esa acción"
        Err.Raise 1000
    End If
    If m_ACSeleccionada Is Nothing Then
        Set m_ACSeleccionada = constructor.getACAuditoria(p_IDAC:=Nz(Me.ListaAC.Column(0), ""), p_Error:=m_Error)
        If m_Error <> "" Then
            Err.Raise 1000
        End If
        If m_ACSeleccionada Is Nothing Then
            m_Error = "Seleccione un elemento de la lista superior"
            Err.Raise 1000
        End If
    End If
    If m_ObjNCAuditoriaActiva.DatosGeneralesOK <> EnumSino.Sí Then
         m_Error = "Debe regularizar primero los datos que faltan en la ficha general"
        Err.Raise 1000
    End If
    If FormularioAbierto("FormNCAuditoriaAR") Then
        DoCmd.Close acForm, "FormNCAuditoriaAR", acSaveNo
    End If
    Set m_ObjARAuditoriaActiva = Nothing
    Set m_ObjACAuditoriaActiva = m_ACSeleccionada
    DoCmd.OpenForm "FormNCAuditoriaAR", OpenArgs:=m_ObjNCAuditoriaActiva.Estado
    If FormularioAbierto("FormNCAuditoriaAR") Then
        Set m_FormAR = Forms("FormNCAuditoriaAR")
    End If
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoARAlta_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub



Private Sub ComandoARBorrar_Click()
    Dim m_AROp As ARAuditoriaOperaciones
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    
    m_Error = ""
    If EsTecnico = EnumSino.Sí Then
        m_Error = "No tiene autorización para esa acción"
        Err.Raise 1000
    End If
    If m_ARSeleccionada Is Nothing Then
        Set m_ARSeleccionada = constructor.getARAuditoria(p_IDAR:=Nz(Me.ListaAR.Column(0), ""), p_Error:=m_Error)
        If m_Error <> "" Then
            Err.Raise 1000
        End If
        If m_ARSeleccionada Is Nothing Then
            m_Error = "Seleccione un elemento de la lista superior"
            Err.Raise 1000
        End If
    End If
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    pregunta = MsgBox("¿Desea borrar la tarea seleccionada?", _
                vbExclamation + vbYesNo + vbDefaultButton2, "Eliminar tarea")
    If pregunta <> vbYes Then
        Exit Sub
    End If
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    Set m_AROp = New ARAuditoriaOperaciones
    With m_AROp
        Set .AR = m_ARSeleccionada
        .Eliminar m_Error
        If m_Error <> "" Then
            Err.Raise 1000
        End If
    End With
    Set m_ObjNCAuditoriaActiva.Replanificaciones = Nothing
    If Not m_ACSeleccionada Is Nothing Then
        Set m_ACSeleccionada.ARs = Nothing
        Set m_ACSeleccionada = constructor.getACAuditoria(p_IDAC:=Me.ListaAR.Column(0), p_Error:=m_Error)
        If m_Error <> "" Then
            Err.Raise 1000
            
        End If
        Set Form_FormNCAuditoria.m_NCAlInicio = constructor.getNCAuditoria(p_IDNC:=m_ObjNCAuditoriaActiva.id, p_Error:=m_Error)
        If m_Error <> "" Then
            Err.Raise 1000
        End If
        Set m_ObjNCAuditoriaActiva = constructor.getNCAuditoria(p_IDNC:=m_ObjNCAuditoriaActiva.id, p_Error:=m_Error)
        If m_Error <> "" Then
            Err.Raise 1000
        End If
        EstablecerColorPestañasNCAuditoria
        ListaAR_Click
    End If
    ComandoActualizarACs_Click
    If FormularioAbierto("FormNCAuditoriaGestion") Then
        Form_FormNCAuditoriaGestion.ActualizarLineaLista
    End If
    
    
   
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoARBorrar_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub

Private Sub ComandoAREdicion_Click()
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    
    m_Error = ""
    
    If m_ARSeleccionada Is Nothing Then
        Set m_ARSeleccionada = constructor.getARAuditoria(p_IDAR:=Nz(Me.ListaAR.Column(0), ""), p_Error:=m_Error)
        If m_Error <> "" Then
            Err.Raise 1000
        End If
        If m_ARSeleccionada Is Nothing Then
            m_Error = "Seleccione un elemento de la lista superior"
            Err.Raise 1000
        End If
    End If
    If m_ACSeleccionada Is Nothing Then
        Set m_ACSeleccionada = constructor.getACAuditoria(p_IDAC:=Nz(Me.ListaAC.Column(0), ""), p_Error:=m_Error)
        If m_Error <> "" Then
            Err.Raise 1000
        End If
        If m_ACSeleccionada Is Nothing Then
            m_Error = "Seleccione un elemento de la lista superior"
            Err.Raise 1000
        End If
    End If
    If FormularioAbierto("FormNCAuditoriaAR") Then
        DoCmd.Close acForm, "FormNCAuditoriaAR", acSaveNo
    End If
    Set m_ObjARAuditoriaActiva = m_ARSeleccionada
    Set m_ObjACAuditoriaActiva = m_ACSeleccionada
    DoCmd.OpenForm "FormNCAuditoriaAR", OpenArgs:=m_ObjNCAuditoriaActiva.Estado
    If FormularioAbierto("FormNCAuditoriaAR") Then
        Set m_FormAR = Forms("FormNCAuditoriaAR")
    End If
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoAREdicion_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub

Private Sub ComandoARHistorial_Click()
    Dim m_mensaje As String
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    If m_ARSeleccionada Is Nothing Then
        Set m_ARSeleccionada = constructor.getARAuditoria(p_IDAR:=Nz(Me.ListaAR.Column(0), ""), p_Error:=m_Error)
        If m_Error <> "" Then
            Err.Raise 1000
        End If
        If m_ARSeleccionada Is Nothing Then
            m_Error = "Seleccione un elemento de la lista superior"
            Err.Raise 1000
        End If
    End If
    m_mensaje = HTMHistorialAuditoria(m_ARSeleccionada, m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    HTMLENTXT p_HTML:=m_mensaje, p_Error:=m_Error
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
        m_Error = "Al ComandoARHistorial_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
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
Public Function EstablecerDatos( _
                                    Optional ByRef p_Error As String _
                                    ) As String
   
    
    
    
    Dim m_Col As Scripting.Dictionary
    
    On Error GoTo errores
    If m_ObjNCAuditoriaActiva Is Nothing Then
         m_Error = "El formulario se ha abierto con parámetros insuficentes"
        Err.Raise 1000
    End If
    EstablecerCombos p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    Me.AllowEdits = True
    Me.ComandoACAlta.Enabled = True
    Me.ComandoActualizarACs.Enabled = True
    Me.ComandoActualizarARs.Enabled = True
    Set m_NC = m_ObjNCAuditoriaActiva
    Me.ImagenNotaAC.Visible = False
    Me.ImagenNotaAR.Visible = False
    Me.OrdenAC = EnumOrden.PorNAccion
    Me.OrdenAR = EnumOrden.PorNAccion
    EstablecerListaAC p_Error:=p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    
    EstablecerListaAR p_Error:=p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método EstablecerDatos ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function
Private Function EstablecerListaAC( _
                                    Optional ByRef p_Error As String _
                                    ) As String
    
    Dim m_ACAuditoria As ACAuditoria
    Dim m_EnumOrden As EnumOrden
    Dim m_ID As Variant
    Dim m_Col As Scripting.Dictionary
    Dim lst As ListBox
    
    
    On Error GoTo errores
    Me.ComandoACAlta.Enabled = False
    Me.ComandoACEdicion.Enabled = False
    
    Me.ComandoACBorrar.Enabled = False
    Me.ComandoACHistorial.Enabled = False
    Me.ComandoARAlta.Enabled = False
    Me.ImagenNotaAC.Visible = False
    
    Set lst = Me.ListaAC
    lst.RowSource = "ID;Nº;Acción correctiva;Responsable;F.inicio;F.fin prev.;F.fin real"
    Me.ComandoACAlta.Enabled = True
    m_EnumOrden = Nz(Me.OrdenAC.Column(0), 0)
    
    Set m_Col = constructor.getACsAuditoria(p_IDNC:=m_ObjNCAuditoriaActiva.id, _
                            p_EnumOrden:=m_EnumOrden, p_Error:=p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If m_Col Is Nothing Then
       Exit Function
    End If
    
    For Each m_ID In m_Col
        Set m_ACAuditoria = m_Col(m_ID)
        With m_ACAuditoria
            
            lst.AddItem .IdAccionCorrectiva & ";" & .NAccion & ";" & Replace(.AccionCorrectiva, ";", ":") & ";" & .Responsable & ";" & .FechaInicialMinima & ";" & _
                        .FechaFinPrevistaUltima & ";" & .FechaFinalUltima
        End With
        
        Set m_ACAuditoria = Nothing
    Next
    If lst.ListCount = 1 Then
        Exit Function
    End If
    
    lst.Selected(1) = True
    
    ListaAC_Click
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método EstablecerListaAC ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function

Private Function EstablecerListaAR( _
                                    Optional ByRef p_Error As String _
                                    ) As String
    
    Dim m_ARAuditoria As ARAuditoria
    Dim m_ID As Variant
    Dim m_Col As Scripting.Dictionary
    Dim lst As ListBox
    
    Dim m_EnumOrden As EnumOrden
    On Error GoTo errores
    
    Me.ComandoAREdicion.Enabled = False
    Me.ComandoARBorrar.Enabled = False
    Me.ComandoARHistorial.Enabled = False
    Me.ComandoARDocumentos.Enabled = False
   
    Me.ImagenNotaAR.Visible = False
    Set lst = Me.ListaAR
    lst.RowSource = "ID;Nº;Tarea;Responsable;F.inicio;F.fin prev.;F.fin real"
    
    If m_ACSeleccionada Is Nothing Then
        Exit Function
    End If
    m_EnumOrden = Nz(Me.OrdenAR.Column(0), 0)
    
    Set m_Col = constructor.getARsDeACAuditoria(p_IDAC:=m_ACSeleccionada.IdAccionCorrectiva, _
                        p_EnumOrden:=m_EnumOrden, p_Error:=p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If m_Col Is Nothing Then
        Exit Function
    End If
    Me.ComandoARDocumentos.Enabled = True
    For Each m_ID In m_Col
        Set m_ARAuditoria = m_Col(m_ID)
        With m_ARAuditoria
            
            lst.AddItem .IDAccionRealizada & ";" & .NAccion & ";" & Replace(.AccionRealizada, ";", ":") & ";" & _
                        .Responsable & ";" & .FechaInicio & ";" & .FechaFinPrevista & ";" & .FechaFinReal
        End With
        
        Set m_ARAuditoria = Nothing
    Next
    If lst.ListCount = 1 Then
        Exit Function
    End If
    
    lst.Selected(1) = True
    ListaAR_Click
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método EstablecerListaAR ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function


Private Sub ImagenAnexo_Click()
    Dim m_Documento As DocumentoAuditoria
    Dim m_ID As Variant
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    
    If m_ARSeleccionada Is Nothing Then
        Set m_ARSeleccionada = constructor.getARAuditoria(p_IDAR:=Nz(Me.ListaAR.Column(0), ""), p_Error:=m_Error)
        If m_Error <> "" Then
            Err.Raise 1000
        End If
        If m_ARSeleccionada Is Nothing Then
            m_Error = "Seleccione un elemento de la lista superior"
            Err.Raise 1000
        End If
    End If
    
    If m_ARSeleccionada.Documentos Is Nothing Then
        m_Error = "No parece tener anexos registrados"
        Err.Raise 1000
    End If
    If m_ARSeleccionada.Documentos.count = 1 Then
        For Each m_ID In m_ARSeleccionada.Documentos
            Set m_Documento = m_ARSeleccionada.Documentos(m_ID)
            AbrirEnLocal m_Documento.URLAnexo, m_Error
            If m_Error <> "" Then
                Err.Raise 1000
            End If
            Set m_Documento = Nothing
            VBA.DoEvents
            DoCmd.Hourglass False
            VBA.DoEvents
            Exit Sub
        Next
    End If
    If Me.ComandoARDocumentos.Enabled = True Then
        ComandoARDocumentos_Click
    End If
    
    
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al ImagenAnexo_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub

Private Sub ImagenNotaAC_Click()
    On Error Resume Next
    If Me.ComandoACEdicion.Enabled = True Then
        ComandoACEdicion_Click
    End If
End Sub

Private Sub ImagenNotaAR_Click()
    On Error Resume Next
    If Me.ComandoAREdicion.Enabled = True Then
        ComandoAREdicion_Click
    End If
End Sub

Public Sub ListaAC_Click()
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
   
    Me.ComandoAREdicion.Enabled = False
    Me.ImagenNotaAC.Visible = False
    If Nz(Me.ListaAC.Column(0), "") = "" Then
        Set m_ACSeleccionada = Nothing
        EstablecerListaAR
        VBA.DoEvents
        DoCmd.Hourglass False
        VBA.DoEvents
        Exit Sub
    End If
    If m_ACSeleccionada Is Nothing Then
        Set m_ACSeleccionada = constructor.getACAuditoria(p_IDAC:=Nz(Me.ListaAC.Column(0), ""), p_Error:=m_Error)
        If m_Error <> "" Then
            Err.Raise 1000
        End If
    Else
        If m_ACSeleccionada.IdAccionCorrectiva <> Me.ListaAC.Column(0) Then
            Set m_ACSeleccionada = constructor.getACAuditoria(p_IDAC:=Nz(Me.ListaAC.Column(0), ""), p_Error:=m_Error)
            If m_Error <> "" Then
                Err.Raise 1000
            End If
        End If
    End If
    Me.ComandoARAlta.Enabled = True
    Me.ComandoACEdicion.Enabled = True
    Me.ComandoACHistorial.Enabled = True
    Me.ComandoACBorrar.Enabled = True
    Me.ComandoARAlta.Enabled = True
    If m_ACSeleccionada.Notas <> "" Then
        Me.ImagenNotaAC.Visible = True
    End If
    
    
    EstablecerListaAR
    
    
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al ListaAC_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub


Private Sub ListaAR_Click()
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    
    Me.ComandoAREdicion.Enabled = False
    Me.ComandoARBorrar.Enabled = False
    Me.ComandoARHistorial.Enabled = False
    Me.ImagenNotaAR.Visible = False
    If Nz(Me.ListaAR.Column(0), "") = "" Then
        Set m_ARSeleccionada = Nothing
        VBA.DoEvents
        DoCmd.Hourglass False
        VBA.DoEvents
        Exit Sub
    End If
    If Nz(Me.ListaAR.Column(0), "") = "" Then
        Set m_ARSeleccionada = Nothing
        Me.ImagenAnexo.Visible = False
        VBA.DoEvents
        DoCmd.Hourglass False
        VBA.DoEvents
        Exit Sub
    End If
    If m_ARSeleccionada Is Nothing Then
        Set m_ARSeleccionada = constructor.getARAuditoria(p_IDAR:=Nz(Me.ListaAR.Column(0), ""), p_Error:=m_Error)
        If m_Error <> "" Then
            Err.Raise 1000
        End If
    Else
        If m_ARSeleccionada.IDAccionRealizada <> Me.ListaAR.Column(0) Then
            Set m_ARSeleccionada = constructor.getARAuditoria(p_IDAR:=Nz(Me.ListaAR.Column(0), ""), p_Error:=m_Error)
            If m_Error <> "" Then
                Err.Raise 1000
            End If
        End If
    End If
    If m_ARSeleccionada.Notas <> "" Then
        Me.ImagenNotaAR.Visible = True
    End If
    Me.ComandoAREdicion.Enabled = True
    Me.ComandoARHistorial.Enabled = True
    
        
    Me.ComandoARBorrar.Enabled = True
    
    If m_ARSeleccionada.Documentos Is Nothing Then
        Me.ImagenAnexo.Visible = False
    Else
        Me.ImagenAnexo.Visible = True
    End If
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al ListaAC_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub



Private Sub m_FormAC_Alta(p_EstadoAlInicio As String)
    Dim m_Estado As String
    On Error GoTo errores

    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    Set m_ObjNCAuditoriaActiva.ACs = Nothing
    m_ObjNCAuditoriaActiva.EstadoGrabar
    m_Estado = m_ObjNCAuditoriaActiva.EstadoCalculadoTexto
    
    EstablecerListaAC

    EstablecerListaAR
    If p_EstadoAlInicio <> "" Then
        If p_EstadoAlInicio <> "Cerrada" Then
            If m_Estado = "Cerrada" Then
                pregunta = MsgBox("La NC de Auditoria pasa a estar cerrada ", vbInformation, "Cierre de NC")
            End If
        Else
            If p_EstadoAlInicio = "Cerrada" Then
                If m_Estado <> "Cerrada" Then
                    pregunta = MsgBox("La NC de Auditoria ha dejado de estar cerrada ", vbInformation, "Reapertura de NC")
                End If
            End If
        End If
    End If
    
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    m_Error = ""
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al m_FormAC_Alta se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub

Private Sub m_FormAC_Editado()
    
    Dim m_IDACSeleccionada As String
    Dim i As Long
    
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    m_IDACSeleccionada = m_ACSeleccionada.IdAccionCorrectiva
    Set m_ACSeleccionada = Nothing
    Set m_ObjNCAuditoriaActiva.ACs = Nothing
    EstablecerListaAC
    For i = 1 To Me.ListaAC.ListCount - 1
        If Me.ListaAC.Column(0, i) = m_IDACSeleccionada Then
            Me.ListaAC.Selected(i) = True
            ListaAC_Click
            Exit For
        End If
    Next
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
   
    
    
    
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al m_FormAC_Editado se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub

Private Sub m_FormAnexos_Alta()
     On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    Set m_ARSeleccionada.Documentos = Nothing
    Me.ImagenAnexo.Visible = True
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    m_Error = ""
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al m_FormAnexos_Alta se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub

Private Sub m_FormAR_Alta(p_EstadoAlInicio As String)
    Dim m_Estado As String
    
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    Set Form_FormNCAuditoria.m_NCAlInicio = constructor.getNCAuditoria(p_IDNC:=m_ObjNCAuditoriaActiva.id, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set m_ObjNCAuditoriaActiva = constructor.getNCAuditoria(p_IDNC:=m_ObjNCAuditoriaActiva.id, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    m_Estado = m_ObjNCAuditoriaActiva.Estado
    Set m_ACSeleccionada = constructor.getACAuditoria(p_IDAC:=m_ACSeleccionada.IdAccionCorrectiva, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    EstablecerListaAR
    EstablecerColorPestañasNCAuditoria
    If p_EstadoAlInicio <> "" Then
        If p_EstadoAlInicio <> "Cerrada" Then
            If m_Estado = "Cerrada" Then
                pregunta = MsgBox("La NC de Auditoria pasa a estar cerrada ", vbInformation, "Cierre de NC")
            End If
        Else
            If p_EstadoAlInicio = "Cerrada" Then
                If m_Estado <> "Cerrada" Then
                    pregunta = MsgBox("La NC de Auditoria ha dejado de estar cerrada ", vbInformation, "Reapertura de NC")
                End If
            End If
        End If
    End If
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    m_Error = ""
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al m_FormAR_Alta se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub

Private Sub m_FormAR_Editado(p_EstadoAlInicio As String)
    Dim m_Estado As String
    Dim m_IDACSeleccionada As String
    Dim i As Long
    
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    Set Form_FormNCAuditoria.m_NCAlInicio = constructor.getNCAuditoria(p_IDNC:=m_ObjNCAuditoriaActiva.id, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set m_ObjNCAuditoriaActiva = constructor.getNCAuditoria(p_IDNC:=m_ObjNCAuditoriaActiva.id, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    m_Estado = m_ObjNCAuditoriaActiva.Estado
    m_IDACSeleccionada = m_ACSeleccionada.IdAccionCorrectiva
    Set m_ACSeleccionada = Nothing
    Set m_ObjNCAuditoriaActiva.ACs = Nothing
    EstablecerListaAC
    For i = 1 To Me.ListaAC.ListCount - 1
        If Me.ListaAC.Column(0, i) = m_IDACSeleccionada Then
            Me.ListaAC.Selected(i) = True
            ListaAC_Click
            Exit For
        End If
    Next
    EstablecerColorPestañasNCAuditoria
    If p_EstadoAlInicio <> "" Then
        If p_EstadoAlInicio <> "Cerrada" Then
            If m_Estado = "Cerrada" Then
                pregunta = MsgBox("La NC de Auditoria pasa a estar cerrada ", vbInformation, "Cierre de NC")
            End If
        Else
            If p_EstadoAlInicio = "Cerrada" Then
                If m_Estado <> "Cerrada" Then
                    pregunta = MsgBox("La NC de Auditoria ha dejado de estar cerrada ", vbInformation, "Reapertura de NC")
                End If
            End If
        End If
    End If
    
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
   
    
    
    
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al m_FormAR_Editado se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub

Public Function ActualizarLineaListaAC( _
                                        Optional ByRef p_Error As String _
                                        ) As String
   
    Dim m_ACAuditoria As ACAuditoria
    Dim lst As ListBox
    Dim i As Long
    Dim m_SourceInicial As String
    Dim m_SourceFinal As String
    Dim m_LineaAlInicio As String
    Dim m_LineaAlFinal As String
    Dim j As Long
    
    
    On Error GoTo errores
    Set lst = Me.ListaAC
    If lst.ListCount = 1 Then
        Exit Function
    End If
    m_SourceInicial = lst.RowSource
    Set m_ACAuditoria = constructor.getACAuditoria(p_IDAC:=Nz(lst.Column(0), ""), p_Error:=p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If m_ACAuditoria Is Nothing Then
        Exit Function
    End If
    With m_ACAuditoria
        
        m_LineaAlFinal = .IdAccionCorrectiva & ";" & .NAccion & ";" & Replace(.AccionCorrectiva, ";", ":") & ";" & .Responsable & ";" & .FechaInicialMinima & ";" & _
                        .FechaFinPrevistaUltima & ";" & .FechaFinalUltima
    End With
    
    For i = 1 To lst.ListCount - 1
        If lst.Selected(i) = True Then
            For j = 0 To 5
                If m_LineaAlInicio = "" Then
                    m_LineaAlInicio = lst.Column(j, i)
                Else
                    m_LineaAlInicio = m_LineaAlInicio & ";" & lst.Column(j, i)
                End If
            Next
            Exit For
        End If
    Next
    m_SourceFinal = Replace(m_SourceInicial, m_LineaAlInicio, m_LineaAlFinal)
    lst.RowSource = m_SourceFinal
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método ActualizarLineaListaAC ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function

Public Function ActualizarLineaListaAR( _
                                        Optional ByRef p_Error As String _
                                        ) As String
   
    Dim m_ARAuditoria As ARAuditoria
    Dim lst As ListBox
    Dim i As Long
    Dim m_SourceInicial As String
    Dim m_SourceFinal As String
    Dim m_LineaAlInicio As String
    Dim m_LineaAlFinal As String
    Dim m_Responsable As String
    Dim j As Long
    
    On Error GoTo errores
    Set lst = Me.ListaAR
    If lst.ListCount = 1 Then
        Exit Function
    End If
    m_SourceInicial = lst.RowSource
    Set m_ARAuditoria = constructor.getARAuditoria(p_IDAR:=Nz(lst.Column(0), ""), p_Error:=p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If m_ARAuditoria Is Nothing Then
        Exit Function
    End If
    With m_ARAuditoria
        If .ResponsableObj Is Nothing Then
            m_Responsable = ""
        Else
            m_Responsable = .ResponsableObj.Nombre
        End If
        m_LineaAlFinal = .IDAccionRealizada & ";" & .NAccion & ";" & Replace(.AccionRealizada, ";", ":") & ";" & _
                        m_Responsable & ";" & .FechaInicio & ";" & .FechaFinPrevista & ";" & .FechaFinReal
    End With
    
    For i = 1 To lst.ListCount - 1
        If lst.Selected(i) = True Then
            For j = 0 To 5
                If m_LineaAlInicio = "" Then
                    m_LineaAlInicio = lst.Column(j, i)
                Else
                    m_LineaAlInicio = m_LineaAlInicio & ";" & lst.Column(j, i)
                End If
            Next
            Exit For
        End If
    Next
    m_SourceFinal = Replace(m_SourceInicial, m_LineaAlInicio, m_LineaAlFinal)
    lst.RowSource = m_SourceFinal
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método ActualizarLineaListaAR ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function

Private Function EstablecerCombos( _
                                    Optional ByRef p_Error As String _
                                    ) As Scripting.Dictionary
   
    
    On Error GoTo errores
    
    
    EstablecerComboOrdenarPor Me.OrdenAC, p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    EstablecerComboOrdenarPor Me.OrdenAR, p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método EstablecerCombos ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function

Private Sub OrdenAR_AfterUpdate()
    Dim m_IDARSeleccionada As String
    Dim i As Long
    
    
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    If Not m_ARSeleccionada Is Nothing Then
        m_IDARSeleccionada = m_ARSeleccionada.IDAccionRealizada
    End If
    Set m_ARSeleccionada = Nothing
    EstablecerListaAR
    If m_IDARSeleccionada <> "" Then
        For i = 1 To Me.ListaAR.ListCount - 1
            If Me.ListaAR.Column(0, i) = m_IDARSeleccionada Then
                Me.ListaAR.Selected(i) = True
                ListaAR_Click
                Exit For
            End If
        Next
    End If
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al OrdenAR_AfterUpdate se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub
Private Sub OrdenAC_AfterUpdate()
    Dim m_IDACSeleccionada As String
    Dim i As Long
    
    
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    If Not m_ACSeleccionada Is Nothing Then
        m_IDACSeleccionada = m_ACSeleccionada.IdAccionCorrectiva
    End If
    Set m_ACSeleccionada = Nothing
    EstablecerListaAC
    If m_IDACSeleccionada <> "" Then
        For i = 1 To Me.ListaAC.ListCount - 1
            If Me.ListaAC.Column(0, i) = m_IDACSeleccionada Then
                Me.ListaAC.Selected(i) = True
                ListaAC_Click
                Exit For
            End If
        Next
    End If
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al OrdenAC_AfterUpdate se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub
