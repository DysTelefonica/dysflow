Option Compare Database
Option Explicit

Private m_TipologiaSeleccionada As TipologiaNCProyectos
Private WithEvents m_Form As Form_FormTipologiaNCProyecto

Private m_CodigoAscendente As EnumSino
Private m_TipologiaAscendente As EnumSino
Public Event AltaTipologia(m_Tipologia As TipologiaNCProyectos)
Public Event EdicionTipologia(m_Tipologia As TipologiaNCProyectos)
Public Event TipologiaEliminada()
Private m_Error As String

Private Sub cmdSalir_Click()
    On Error Resume Next
    DoCmd.Close acForm, Me.Name, acSaveNo
End Sub

Private Sub ComandoAlta_Click()
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    
    If EsTecnico = EnumSino.Sí Then
        m_Error = "No tiene autorización para esa acción"
        Err.Raise 1000
    End If
    If FormularioAbierto("FormTipologiaNCProyecto") Then
        DoCmd.Close acForm, "FormTipologiaNCProyecto", acSaveNo
    End If
    Set m_ObjTipologiaProyectoActiva = Nothing
    DoCmd.OpenForm "FormTipologiaNCProyecto"
    If FormularioAbierto("FormTipologiaNCProyecto") Then
        Set m_Form = Forms("FormTipologiaNCProyecto")
    End If
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoAlta_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
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
    If m_TipologiaSeleccionada Is Nothing Then
        Set m_TipologiaSeleccionada = constructor.getTipologiaNCProyecto(p_IDTipo:=Nz(Me.Lista.Column(0), ""), p_Error:=m_Error)
        If m_Error <> "" Then
            Err.Raise 1000
        End If
        If m_TipologiaSeleccionada Is Nothing Then
            m_Error = "Seleccione un elemento de la lista"
            Err.Raise 1000
        End If
    End If
    Set m_ObjTipologiaProyectoActiva = m_TipologiaSeleccionada
    
    If FormularioAbierto("FormTipologiaNCProyecto") Then
        DoCmd.Close acForm, "FormTipologiaNCProyecto", acSaveNo
    End If
    DoCmd.OpenForm "FormTipologiaNCProyecto"
    If FormularioAbierto("FormTipologiaNCProyecto") Then
        Set m_Form = Forms("FormTipologiaNCProyecto")
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
    If m_TipologiaSeleccionada Is Nothing Then
        Set m_TipologiaSeleccionada = constructor.getTipologiaNCProyecto(p_IDTipo:=Nz(Me.Lista.Column(0), ""), p_Error:=m_Error)
        If m_Error <> "" Then
            Err.Raise 1000
        End If
        If m_TipologiaSeleccionada Is Nothing Then
            m_Error = "Seleccione un elemento de la lista"
            Err.Raise 1000
        End If
    End If
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    pregunta = MsgBox("¿Desea realmente eliminar el tipo seleccionado?", vbExclamation + vbYesNo + vbDefaultButton2, "Eliminar Tipo")
    If pregunta <> vbYes Then
        Exit Sub
    End If
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_TipologiaSeleccionada.Eliminar m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    RaiseEvent TipologiaEliminada
    RellenarLista m_Error
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


Private Sub Form_Open(Cancel As Integer)
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    Ajustar Me
    If EsTecnico = EnumSino.Sí Then
        Me.ComandoAlta.Enabled = False
    Else
        Me.ComandoAlta.Enabled = True
    End If
    
    RellenarLista m_Error
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
        m_Error = "Al Form_Open se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If

    DoCmd.Close acForm, Me, acSaveNo
End Sub



Private Sub Lista_Click()
        
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    
    
    Me.ComandoEditar.Enabled = False
    Me.ComandoEliminar.Enabled = False
    If EsTecnico = EnumSino.Sí Then
        Me.ComandoAlta.Enabled = False
    Else
        Me.ComandoAlta.Enabled = True
    End If
    
    
    If Nz(Me.Lista.Column(0), "") = "" Then
        Set m_TipologiaSeleccionada = Nothing
        VBA.DoEvents
        DoCmd.Hourglass False
        VBA.DoEvents
        Exit Sub
    End If
    If m_TipologiaSeleccionada Is Nothing Then
        Set m_TipologiaSeleccionada = constructor.getTipologiaNCProyecto(p_IDTipo:=Nz(Me.Lista.Column(0), ""), p_Error:=m_Error)
        If m_Error <> "" Then
            Err.Raise 1000
        End If
    Else
        If Me.Lista.Column(0) <> m_TipologiaSeleccionada.IDTipo Then
            Set m_TipologiaSeleccionada = constructor.getTipologiaNCProyecto(p_IDTipo:=Nz(Me.Lista.Column(0), ""), p_Error:=m_Error)
            If m_Error <> "" Then
                Err.Raise 1000
            End If
        End If
    End If
    If m_TipologiaSeleccionada Is Nothing Then
        VBA.DoEvents
        DoCmd.Hourglass True
        VBA.DoEvents
        Exit Sub
    End If
    Me.ComandoEditar.Enabled = True
    If EsTecnico = EnumSino.Sí Then
        Me.ComandoEliminar.Enabled = False
    Else
        Me.ComandoEliminar.Enabled = True
    End If
    
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al Lista_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If

End Sub


Private Sub m_Form_AltaTipo(m_Tipo As TipologiaNCProyectos)
    
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    
    RellenarLista m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    RaiseEvent AltaTipologia(m_ObjTipologiaProyectoActiva)
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al m_Form_AltaTipo se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub

Private Sub Lista_DblClick(Cancel As Integer)
    On Error Resume Next
    Application.Echo False
    If Me.ComandoEditar.Enabled = True Then
        ComandoEditar_Click
    End If
    Application.Echo True
End Sub

Private Function RellenarLista( _
                                    Optional ByRef p_Error As String _
                                    ) As String
    
    Dim m_Tipologia As TipologiaNCProyectos
    Dim m_ID As Variant
    Dim m_Col As Scripting.Dictionary
    Dim lst As ListBox
    
    
    On Error GoTo errores
    
    Set lst = Me.Lista
    lst.RowSource = ""
    Set m_Col = constructor.getTipologiasNCProyecto(p_Error:=p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    
    If m_Col Is Nothing Then
       Exit Function
    End If
    
    
    For Each m_ID In m_Col
        Set m_Tipologia = m_Col(m_ID)
        With m_Tipologia
            lst.AddItem .IDTipo & ";" & Replace(.Tipologia, ";", ":")
        End With
        
        Set m_Tipologia = Nothing
    Next
    
    lst.Selected(1) = True
    Lista_Click
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método RellenarLista ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function



Private Sub m_Form_EdicionTipo(m_Tipo As TipologiaNCProyectos)
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    
    RellenarLista m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    RaiseEvent EdicionTipologia(m_ObjTipologiaProyectoActiva)
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al m_Form_EdicionTipo se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub