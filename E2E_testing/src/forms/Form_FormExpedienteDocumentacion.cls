Option Compare Database
Option Explicit
Private m_Error As String



Private Sub ComandoAltaAnexo_Click()
    
    Dim m_URLLocal As String
    Dim m_ExpAnexo As ExpedienteAnexo
    Dim m_ExpOp As ExpedienteOperaciones
    Dim m_EstadoRegistro As String
    On Error GoTo errores
    
    m_Error = ""
    m_URLLocal = Seleccionar(True, "Seleccione el archivo a anexar", m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    If Not fso.FileExists(m_URLLocal) Then
        VBA.DoEvents
        DoCmd.Hourglass False
        VBA.DoEvents
    
        Exit Sub
    End If
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    MostrarPopupProgreso "Procesando...", "Guardando..."
    
    Set m_ExpOp = New ExpedienteOperaciones
    With m_ExpOp
        Set .Expediente = m_ObjExpedienteDTOActivo.Expediente
        m_EstadoRegistro = .RegistrarAnexo(p_URLLocal:=m_URLLocal, p_Error:=m_Error)
        If m_Error <> "" Then
            Err.Raise 1000
        End If
    End With
    If m_EstadoRegistro = "1" Then
        
        Set m_ObjExpedienteDTOActivo.ColAnexos = m_ObjExpedienteDTOActivo.Expediente.Anexos
        RellenarListas
    End If
        
        
    
    If Me.ListaDocumentos.ListCount > 0 Then
        Me.ListaDocumentos.Selected(Me.ListaDocumentos.ListCount - 1) = True
    End If
    
    VBA.DoEvents
    CerrarPopupProgreso
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
     If Err.Number <> 1000 Then
        m_Error = "Al ComandoAltaAnexo_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
    End If
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub


Private Sub ComandoEliminar_Click()
    
    Dim m_ExpOp As ExpedienteOperaciones
    Dim m_NombreDocumento As String
    Dim i As Long
    On Error GoTo errores

    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    
    
    m_NombreDocumento = Nz(Me.ListaDocumentos.Column(0), "")
    If m_NombreDocumento = "" Then
         VBA.DoEvents
        DoCmd.Hourglass False
        VBA.DoEvents
        Exit Sub
    End If
    If EsAdministrador <> EnumSiNo.Sí Then
        m_Error = "Operacion no autorizada"
        Err.Raise 1000
    End If
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    pregunta = MsgBox("¿Desea realmente eliminar el anexo seleccionado?", vbExclamation + vbYesNo + vbDefaultButton2, "Eliminar Anexo")
    If pregunta <> vbYes Then
        Exit Sub
    End If
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    
    Set m_ExpOp = New ExpedienteOperaciones
    With m_ExpOp
        Set .Expediente = m_ObjExpedienteDTOActivo.Expediente
        .EliminarAnexo p_NombreDocumento:=m_NombreDocumento, p_Error:=m_Error
        If m_Error <> "" Then
            Err.Raise 1000
        End If
    End With
    
    Set m_ObjExpedienteDTOActivo.ColAnexos = m_ObjExpedienteDTOActivo.Expediente.Anexos
    RellenarListas
    
   
    
    
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoEliminar_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
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
    
    Me.Caption = m_TituloFormulario
    Me.AllowEdits = True
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

Private Sub ImagenAnexo_Click()
     On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    
    AbrirEnLocal Nz(Me.ListaDocumentos.Column(0), ""), m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al ImagenAnexo_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
    End If
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub ListaDocumentos_Click()
    
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    Me.ImagenAnexo.Visible = False
    
    If Nz(Me.ListaDocumentos.Column(0), "") = "" Then
        VBA.DoEvents
        DoCmd.Hourglass False
        VBA.DoEvents
        Exit Sub
    End If
    Me.ImagenAnexo.Visible = True
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al ListaDocumentos_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
    End If
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub


Public Function RellenarListas(Optional ByRef p_Error As String) As String
    
    Dim m_Col As Scripting.Dictionary
    Dim lst As ListBox
    Dim m_ID As Variant
    Dim m_Anexo As ExpedienteAnexo
    On Error GoTo errores
    
    'ANUALIDADES
        Dim m_URLDocumento As String
        Set m_Col = m_ObjExpedienteDTOActivo.ColAnexos
        Set lst = Me.ListaDocumentos
        lst.RowSource = ""
        If Not m_Col Is Nothing Then
            For Each m_ID In m_Col
                Set m_Anexo = m_Col(m_ID)
                If m_Anexo.IDExpediente = "" Then
                    m_URLDocumento = m_Anexo.NombreDocumento
                Else
                    m_URLDocumento = m_Anexo.URLDocumento
                End If
                lst.AddItem m_URLDocumento & ";" & fso.GetFileName(m_URLDocumento)
                Set m_Anexo = Nothing
            Next
            lst.Selected(0) = True
        End If
    Me.ImagenAnexo.Visible = False
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método RellenarListas ha producido el error n: " & Err.Number & _
        vbNewLine & "Detalle: " & Err.Description
    End If
End Function


Public Function EstablecerDatos(Optional ByRef p_Error As String) As String
    Dim ctl As Control
    

    On Error GoTo errores
    If m_ObjExpedienteDTOActivo.Expediente Is Nothing Then
        p_Error = "El formulario se ha abierto con parámetros insuficientes"
        Err.Raise 1000
    End If
    For Each ctl In Me.Controls
        If Nz(ctl.Tag, "") = "EJECUTIVO" Then
            If EsAdministrador = EnumSiNo.Sí Then
                ctl.Enabled = True
            Else
                ctl.Enabled = False
            End If
        End If
    Next
    Me.ImagenAnexo.Visible = False
    RellenarListas p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If


    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método EstablecerDatos ha producido el error n: " & Err.Number & _
        vbNewLine & "Detalle: " & Err.Description
    End If

End Function



Private Sub ListaDocumentos_DblClick(Cancel As Integer)
    On Error Resume Next
    Application.Echo False
    
    If Me.ImagenAnexo.Visible = True Then
        ImagenAnexo_Click
    End If
    Application.Echo True
End Sub
