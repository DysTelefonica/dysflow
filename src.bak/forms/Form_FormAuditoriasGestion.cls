Option Compare Database
Option Explicit

Private WithEvents m_FormAnexos As Form_FormAuditoriaDocumentos

Private m_AuditoriaSeleccionada As Auditoria
Private m_AuditoriaOp As AuditoriaOperaciones

Private WithEvents m_Form As Form_FormAuditoria
Private m_Error As String



Private Sub Año_KeyDown(KeyCode As Integer, Shift As Integer)
     On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    If KeyCode = vbKeyReturn Or KeyCode = 9 Then
        Me.ComandoLimpiarAño.SetFocus
        
        Filtrar m_Error
        If m_Error <> "" Then
            Err.Raise 1000
        End If
        
        ' Si deseas evitar que Access realice la acción predeterminada de Enter,
        ' puedes utilizar la siguiente línea:
        KeyCode = 0
    End If
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al Año_KeyDown se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub

Private Sub cmdSalir_Click()
    On Error Resume Next
    DoCmd.Close acForm, Me.Name, acSaveNo
End Sub



Private Sub ComandoAltaNCAuditoria_Click()
    
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    
    m_Error = ""
    If EsTecnico = EnumSino.Sí Then
        m_Error = "No tiene autorización para esa acción"
        Err.Raise 1000
    End If
    If m_AuditoriaSeleccionada Is Nothing Then
        Set m_AuditoriaSeleccionada = constructor.getAuditoria(p_ID:=Nz(Me.ListaFiltrados.Column(0), ""), p_Error:=m_Error)
        If m_Error <> "" Then
            Err.Raise 1000
        End If
        If m_AuditoriaSeleccionada Is Nothing Then
            m_Error = "Seleccione un elemento de la lista"
            Err.Raise 1000
        End If
    End If
    
    Set m_ObjAuditoriaActiva = m_AuditoriaSeleccionada
   
    
    If FormularioAbierto("FormNCAuditoria") Then
        DoCmd.Close acForm, "FormNCAuditoria", acSaveNo
    End If
    Set m_ObjNCAuditoriaActiva = New NCAuditoria
    m_ObjNCAuditoriaActiva.IDAuditoria = m_ObjAuditoriaActiva.IDAuditoria
    DoCmd.OpenForm "FormNCAuditoria"
    
  
     VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
   Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoAltaNCAuditoria_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub

Private Sub ComandoAnexos_Click()
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    
    m_Error = ""
    If m_AuditoriaSeleccionada Is Nothing Then
        Set m_AuditoriaSeleccionada = constructor.getAuditoria(p_ID:=Nz(Me.ListaFiltrados.Column(0), ""), p_Error:=m_Error)
        If m_Error <> "" Then
            Err.Raise 1000
        End If
        If m_AuditoriaSeleccionada Is Nothing Then
            m_Error = "Seleccione un elemento de la lista"
            Err.Raise 1000
        End If
    End If
    Set m_ObjAuditoriaActiva = m_AuditoriaSeleccionada
    If FormularioAbierto("FormAuditoriaDocumentos") Then
        DoCmd.Close acForm, "FormAuditoriaDocumentos", acSaveNo
    End If
    DoCmd.OpenForm "FormAuditoriaDocumentos"
    If FormularioAbierto("FormAuditoriaDocumentos") Then
        Set m_FormAnexos = Forms("FormAuditoriaDocumentos")
    End If
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoAnexos_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub


Private Sub ComandoEditar_Click()
     On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    
    m_Error = ""
    If EsTecnico = EnumSino.Sí Then
        m_Error = "No tiene autorización para esa acción"
        Err.Raise 1000
    End If
    If m_AuditoriaSeleccionada Is Nothing Then
        Set m_AuditoriaSeleccionada = constructor.getAuditoria(p_ID:=Nz(Me.ListaFiltrados.Column(0), ""), p_Error:=m_Error)
        If m_Error <> "" Then
            Err.Raise 1000
        End If
        If m_AuditoriaSeleccionada Is Nothing Then
            m_Error = "Seleccione un elemento de la lista"
            Err.Raise 1000
        End If
    End If
    Set m_ObjAuditoriaActiva = m_AuditoriaSeleccionada
    If FormularioAbierto("FormAuditoria") Then
        DoCmd.Close acForm, "FormAuditoria", acSaveNo
    End If
    DoCmd.OpenForm "FormAuditoria"
    If FormularioAbierto("FormAuditoria") Then
        Set m_Form = Forms("FormAuditoria")
    End If
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoEditar_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub

Private Sub ComandoEliminar_Click()
    
    
    
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    
    m_Error = ""
    If EsTecnico = EnumSino.Sí Then
        m_Error = "No tiene autorización para esa acción"
        Err.Raise 1000
    End If
    If m_AuditoriaSeleccionada Is Nothing Then
        Set m_AuditoriaSeleccionada = constructor.getAuditoria(p_ID:=Nz(Me.ListaFiltrados.Column(0), ""), p_Error:=m_Error)
        If m_Error <> "" Then
            Err.Raise 1000
        End If
        If m_AuditoriaSeleccionada Is Nothing Then
            m_Error = "Seleccione un elemento de la lista"
            Err.Raise 1000
        End If
    End If
    
    
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    pregunta = MsgBox("¿Desea eliminar definitivamente del sistema la auditoría seleccionada?", _
                    vbExclamation + vbYesNo + vbDefaultButton2, "Eliminación/Deseliminacion")
    If pregunta <> vbYes Then
        
        Exit Sub
    End If
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    Set m_AuditoriaOp = New AuditoriaOperaciones
    With m_AuditoriaOp
        Set .Auditoria = m_AuditoriaSeleccionada
        .Eliminar m_Error
        If m_Error <> "" Then
            Err.Raise 100
        End If
    End With
    Set m_AuditoriaOp = Nothing
    
    If FormularioAbierto("FormNCAuditoriaGestion") Then
        Set m_ObjEntorno.ColAuditorias = Nothing
        EstablecerComboAuditoriasNombres Forms("FormNCAuditoriaGestion").Controls("Auditoria"), m_Error
        If m_Error <> "" Then
            Err.Raise 1000
        End If
       

    End If
    Filtrar m_Error
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
        m_Error = "Al ComandoEliminar_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub



Public Function Filtrar(Optional ByRef p_Error As String) As String
    
    Dim m_Col As Scripting.Dictionary
    Dim m_Audtoria As Auditoria
    Dim m_ID As Variant
    Dim lst As ListBox
   
    
    On Error GoTo errores
    Set m_AuditoriaSeleccionada = Nothing
    Set m_ObjAuditoriaActiva = Nothing
    
    
    Me.ComandoEditar.Enabled = False
    Me.ComandoAnexos.Enabled = False
    Me.ComandoEliminar.Enabled = False
    Me.ComandoVerNC.Enabled = False
    Me.ImagenAnexo.Visible = False
    Me.ComandoAltaNCAuditoria.Enabled = False
    Set lst = Me.ListaFiltrados
    lst.RowSource = "ID;Nombre;FInicial;FFinal"
    
    
    
    Set m_Col = m_ObjEntorno.ColAuditorias
    p_Error = m_ObjEntorno.Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    
    
    If m_Col Is Nothing Then
        Exit Function
    End If
    '"ID;Tipo;FInicial;FFinal"
    For Each m_ID In m_Col
        Set m_Audtoria = m_Col(m_ID)
        With m_Audtoria
            If Nz(Me.Año, "") <> "" Then
                If CStr(Year(.FechaInicio)) <> Trim(Me.Año) Then
                    GoTo siguiente
                End If
            End If
            If Nz(Me.Tipo, "") <> "" Then
                If .Tipo <> Me.Tipo Then
                    GoTo siguiente
                End If
            End If
            
            lst.AddItem .IDAuditoria & ";" & .NombreAuditoria & ";" & .FechaInicio & ";" & .FechaFin

        End With
siguiente:
        Set m_Audtoria = Nothing
    Next
    
    If lst.ListCount = 1 Then
        Exit Function
    End If
    lst.Selected(1) = True
    ListaFiltrados_Click

    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método Filtrar ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
    End If
   
End Function



Private Sub ComandoLimpiarAño_Click()
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    
    m_Error = ""
    Me.Año = Null
    Filtrar m_Error
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
        m_Error = "Al ComandoLimpiarAño_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub

Private Sub ComandoLimpiarTipo_Click()
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    
    m_Error = ""
    Me.Tipo = Null
    Filtrar m_Error
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
        m_Error = "Al ComandoLimpiarTipo_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub

Private Sub ComandoVerNC_Click()
    Dim m_Form As Form
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    
    m_Error = ""
    If m_AuditoriaSeleccionada Is Nothing Then
        Set m_AuditoriaSeleccionada = constructor.getAuditoria(p_ID:=Nz(Me.ListaFiltrados.Column(0), ""), p_Error:=m_Error)
        If m_Error <> "" Then
            Err.Raise 1000
        End If
        If m_AuditoriaSeleccionada Is Nothing Then
            m_Error = "Seleccione un elemento de la lista"
            Err.Raise 1000
        End If
    End If
    
    If FormularioAbierto("FormNCAuditoriaGestion") Then
        DoCmd.Close acForm, "FormNCAuditoriaGestion", acSaveNo
    End If
    DoCmd.OpenForm "FormNCAuditoriaGestion"
    Set m_Form = Forms("FormNCAuditoriaGestion")
    m_Form.Controls("Estado") = Null
    m_Form.Controls("Auditoria") = m_AuditoriaSeleccionada.IDAuditoria
    Form_FormNCAuditoriaGestion.ActualizarLista
    With m_Form
        
    End With
    
     VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
   Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoVerNC_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
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
    Ajustar Me
    Filtrar m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Me.Caption = Me.lblTitulo1.Caption
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

Private Sub ImagenAnexo_Click()
    Dim m_Documento As DocumentoAuditoria
    Dim m_ID As Variant
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    
    If m_AuditoriaSeleccionada Is Nothing Then
        Set m_AuditoriaSeleccionada = constructor.getAuditoria(p_ID:=Nz(Me.ListaFiltrados.Column(0), ""), p_Error:=m_Error)
        If m_Error <> "" Then
            Err.Raise 1000
        End If
        If m_AuditoriaSeleccionada Is Nothing Then
            m_Error = "Seleccione un elemento de la lista"
            Err.Raise 1000
        End If
    End If
    
    If m_AuditoriaSeleccionada.Documentos Is Nothing Then
        m_Error = "No parece tener anexos registrados"
        Err.Raise 1000
    End If
    If m_AuditoriaSeleccionada.Documentos.count = 1 Then
        For Each m_ID In m_AuditoriaSeleccionada.Documentos
            Set m_Documento = m_AuditoriaSeleccionada.Documentos(m_ID)
            AbrirEnLocal m_Documento.URLAnexo, m_Error
            If m_Error <> "" Then
                Err.Raise 1000
            End If
            Set m_Documento = Nothing
            Exit For
        Next
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

Private Sub ListaFiltrados_Click()
    
    
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    
    m_Error = ""
   
    Me.ComandoEditar.Enabled = False
    Me.ComandoAnexos.Enabled = False
    Me.ComandoEliminar.Enabled = False
    Me.ComandoVerNC.Enabled = False
    Me.ImagenAnexo.Visible = False
    Me.ComandoAltaNCAuditoria.Enabled = False
    If Nz(Me.ListaFiltrados.Column(0), "") = "" Then
        Set m_AuditoriaSeleccionada = Nothing
        VBA.DoEvents
        DoCmd.Hourglass False
        VBA.DoEvents
        Exit Sub
    End If
    If m_AuditoriaSeleccionada Is Nothing Then
        Set m_AuditoriaSeleccionada = constructor.getAuditoria(p_ID:=Me.ListaFiltrados.Column(0), p_Error:=m_Error)
        If m_Error <> "" Then
            Err.Raise 1000
        End If
    Else
        If m_AuditoriaSeleccionada.IDAuditoria <> Me.ListaFiltrados.Column(0) Then
            Set m_AuditoriaSeleccionada = constructor.getAuditoria(p_ID:=Me.ListaFiltrados.Column(0), p_Error:=m_Error)
            If m_Error <> "" Then
                Err.Raise 1000
            End If
        End If
    End If
    If m_AuditoriaSeleccionada Is Nothing Then
        VBA.DoEvents
        DoCmd.Hourglass False
        VBA.DoEvents
        Exit Sub
    End If
    If Not m_AuditoriaSeleccionada.Documentos Is Nothing Then
        Me.ImagenAnexo.Visible = True
    End If
    Me.ComandoEditar.Enabled = True
    Me.ComandoAnexos.Enabled = True
    Me.ComandoEliminar.Enabled = True
    Me.ComandoVerNC.Enabled = True
    Me.ComandoAltaNCAuditoria.Enabled = True
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al ListaFiltrados_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub

Private Sub ListaFiltrados_DblClick(Cancel As Integer)
    On Error Resume Next
    Application.Echo False
    If Me.ComandoEditar.Enabled = True Then
        ComandoEditar_Click
    End If
    Application.Echo True
End Sub



Private Sub m_Form_Alta()
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    
    Filtrar m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    If FormularioAbierto("FormNCAuditoriaGestion") Then
        Set m_ObjEntorno.ColAuditorias = Nothing
        EstablecerComboAuditoriasNombres Forms("FormNCAuditoriaGestion").Controls("Auditoria"), m_Error
        If m_Error <> "" Then
            Err.Raise 1000
        End If
       

    End If
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al m_Form_Alta se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub

Private Sub m_Form_Editada()
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    
    Filtrar m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    If FormularioAbierto("FormNCAuditoriaGestion") Then
        Set m_ObjEntorno.ColAuditorias = Nothing
        EstablecerComboAuditoriasNombres Forms("FormNCAuditoriaGestion").Controls("Auditoria"), m_Error
        If m_Error <> "" Then
            Err.Raise 1000
        End If
       

    End If
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al m_Form_Editada se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
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
    Set m_AuditoriaSeleccionada = Nothing
    ListaFiltrados_Click
    
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

Private Sub m_FormAnexos_Eliminado()
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    Set m_AuditoriaSeleccionada = Nothing
    ListaFiltrados_Click
    
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al m_FormAnexos_Eliminado se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub

Private Sub Tipo_AfterUpdate()
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    
    Filtrar m_Error
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
        m_Error = "Al Tipo_AfterUpdate se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub