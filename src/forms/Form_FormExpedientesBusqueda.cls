VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "Form_FormExpedientesBusqueda"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = True
Attribute VB_PredeclaredId = True
Attribute VB_Exposed = False
Option Compare Database
Option Explicit


Private m_ExpSeleccionado As Expediente

Private m_PalabraClaveUltima As String
Private m_IDResponsableCalidadUltimo As String
Public Event Seleccionado(m_Exp As Expediente)
Private m_Error As String


Private Sub ComandoActualizar_Click()
    
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    m_PalabraClaveUltima = ""
    m_IDResponsableCalidadUltimo = ""
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
        m_Error = "Al ComandoActualizar_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
    
End Sub

Private Sub ComandoElegir_Click()
    
   
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    
    If Nz(Me.ListaFiltrados.Column(0), "") = "" Then
        Set m_ExpSeleccionado = Nothing
        VBA.DoEvents
        DoCmd.Hourglass False
        VBA.DoEvents
        Exit Sub
    End If
    
    If m_ExpSeleccionado Is Nothing Then
        Set m_ExpSeleccionado = constructor.getExpediente(p_IDExpediente:=Nz(Me.ListaFiltrados.Column(0), ""), _
                                p_Error:=m_Error)
        If m_Error <> "" Then
            Err.Raise 1000
        End If
        
    Else
        If m_ExpSeleccionado.IDExpediente <> Me.ListaFiltrados.Column(0) Then
            Set m_ExpSeleccionado = constructor.getExpediente(p_IDExpediente:=Nz(Me.ListaFiltrados.Column(0), ""), _
                                p_Error:=m_Error)
            If m_Error <> "" Then
                Err.Raise 1000
            End If
        End If
    End If
    If m_ExpSeleccionado Is Nothing Then
        VBA.DoEvents
        DoCmd.Hourglass False
        VBA.DoEvents
        Exit Sub
    End If
    'ExpedienteSeleccionado m_ExpSeleccionado
    RaiseEvent Seleccionado(m_ExpSeleccionado)
    
    DoCmd.Close acForm, Me.Name, acSaveNo
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoElegir_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub

Private Sub ComandoLimpiarIDResponsableCalidad_Click()
     On Error Resume Next
    Me.IDResponsableCalidad = Null
    If m_IDResponsableCalidadUltimo <> "" Then
        Filtrar
    End If
    
End Sub


Private Sub ComandoLimpiarPalabraClave_Click()
    On Error Resume Next
    Me.PalabraClave = Null
    If m_PalabraClaveUltima <> "" Then
        Filtrar
    End If
    
End Sub


Private Sub ComandoSalir_Click()
    On Error Resume Next
    DoCmd.Close acForm, Me.Name, acSaveNo
End Sub




Private Sub IDResponsableCalidad_BeforeUpdate(Cancel As Integer)
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    If Nz(Me.IDResponsableCalidad.Column(0), "") = m_IDResponsableCalidadUltimo Then
        VBA.DoEvents
        DoCmd.Hourglass False
        VBA.DoEvents
        Exit Sub
    End If
    Filtrar m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    m_IDResponsableCalidadUltimo = Nz(Me.IDResponsableCalidad.Column(0), "")
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al IDResponsableCalidad_BeforeUpdate se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
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
    
    
    
    Me.Caption = Me.lblTitulo1.Caption
    Me.ListaFiltrados.RowSource = "IDExp;Cod_Exp;Nemotécnico;Título"
    EstablecerComboResponsablesCalidad cmb:=Me.IDResponsableCalidad, p_Error:=m_Error
    
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
    DoCmd.Close acForm, Me.Name, acSaveNo
End Sub
Public Function EstablecerComboResponsablesCalidad( _
                                                    cmb As ComboBox, _
                                                    Optional ByRef p_Error As String _
                                                    ) As String
    Dim m_Col As Scripting.Dictionary
    Dim m_Tecnico As usuario
    Dim m_ID As Variant
    
    
    On Error GoTo errores
    
    cmb.RowSource = ""
    Set m_Col = m_ObjEntorno.ColUsuariosCalidad
    p_Error = m_ObjEntorno.Error
    If p_Error <> "" Then
        Err.Raise 100
    End If
    If m_Col Is Nothing Then
        Exit Function
    End If
    For Each m_ID In m_Col
        Set m_Tecnico = m_Col(m_ID)
        cmb.AddItem m_Tecnico.id & ";" & m_Tecnico.Nombre
        
        Set m_Tecnico = Nothing
    Next
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método EstablecerComboResponsablesCalidad ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function


Public Function Filtrar( _
                        Optional ByRef p_Error As String _
                        ) As String

    Dim lst As ListBox
    Dim m_ID As Variant
    Dim m_Expediente As Expediente
    Dim m_Col As Scripting.Dictionary
    
    On Error GoTo errores
    
    p_Error = ""
    Me.Titulo = Null
    
    Set lst = Me.ListaFiltrados
    lst.RowSource = "IDExp;Cod_Exp;Nemotécnico;Título"
    
    
    Set m_Col = constructor.getExpedientesBusqueda( _
                                                    p_PC:=Nz(Me.PalabraClave, ""), _
                                                    p_IDRC:=Nz(Me.IDResponsableCalidad.Column(0), ""), _
                                                    p_Error:=p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If m_Col Is Nothing Then
        Exit Function
    End If
    For Each m_ID In m_Col
        Set m_Expediente = m_Col(m_ID)
        With m_Expediente
            lst.AddItem .IDExpediente & ";" & .CodExp & ";" & .Nemotecnico & ";" & _
                        Replace(.Titulo, ";", ":")
            Set m_Expediente = Nothing
        End With
    Next
    lst.Selected(1) = True
    ListaFiltrados_Click
    
    
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método Filtrar ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function

Private Sub ListaFiltrados_Click()
    
    
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    
    
    Me.ComandoElegir.Enabled = False
    Me.Titulo = Null
    
    If Nz(Me.ListaFiltrados.Column(0), "") = "" Then
        Set m_ExpSeleccionado = Nothing
        VBA.DoEvents
        DoCmd.Hourglass False
        VBA.DoEvents
        Exit Sub
    End If
    If m_ExpSeleccionado Is Nothing Then
        Set m_ExpSeleccionado = constructor.getExpediente(p_IDExpediente:=Nz(Me.ListaFiltrados.Column(0), ""), p_Error:=m_Error)
        If m_Error <> "" Then
            Err.Raise 1000
        End If
    Else
        If m_ExpSeleccionado.IDExpediente <> Me.ListaFiltrados.Column(0) Then
            Set m_ExpSeleccionado = constructor.getExpediente(p_IDExpediente:=Nz(Me.ListaFiltrados.Column(0), ""), p_Error:=m_Error)
            If m_Error <> "" Then
                Err.Raise 1000
            End If
        End If
    End If
    If m_ExpSeleccionado Is Nothing Then
        VBA.DoEvents
        DoCmd.Hourglass False
        VBA.DoEvents
        Exit Sub
    End If
    
    Me.Titulo = m_ExpSeleccionado.Titulo
    Me.ComandoElegir.Enabled = True
    
    
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



Private Sub PalabraClave_Exit(Cancel As Integer)
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    If Nz(Me.PalabraClave, "") = m_PalabraClaveUltima Then
        VBA.DoEvents
        DoCmd.Hourglass False
        VBA.DoEvents
        Exit Sub
    End If
    Filtrar m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    m_PalabraClaveUltima = Nz(Me.PalabraClave, "")
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al PalabraClave_Exit se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub



