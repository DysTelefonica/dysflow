Option Compare Database
Option Explicit


Private m_DocumentoSeleccionado As DocumentoAuditoria
Public Event Alta()
Public Event CambioNombre()
Public Event Eliminado()
Private m_FechaFinPropuesta As String
Private m_Error As String

Private Sub cmdSalir_Click()
     On Error Resume Next
    DoCmd.Close acForm, Me.Name, acSaveNo
    
End Sub

Private Sub ComandoAnexar_Click()
    
    
    Dim m_URLLocal As String
    Dim m_Documento As String
    Dim m_DocumentoObj As DocumentoAuditoria
    Dim m_DocOp As DocumentoAuditoriaOperaciones
    On Error GoTo errores
    
    m_Error = ""
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    If EsTecnico = EnumSino.Sí Then
        m_Error = "No tiene autorización para esa acción"
        Err.Raise 1000
    End If
    m_Documento = Nz(Me.Documento, "")
    If m_Documento = "" Then
        m_Error = "Ha de poner un título al documento"
        Err.Raise 1000
    End If
    m_URLLocal = Seleccionar(True, "Seleccione el documento")
    If Not fso.FileExists(m_URLLocal) Then
        m_URLLocal = ""
        VBA.DoEvents
        DoCmd.Hourglass False
        VBA.DoEvents
        Exit Sub
    End If
    Me.URLDocumento = "..\" & fso.GetFileName(m_URLLocal)
    
    Set m_DocumentoObj = New DocumentoAuditoria
    With m_DocumentoObj
        .IDAccionRealizada = m_ObjARAuditoriaActiva.IDAccionRealizada
        .Documento = Me.Documento
        Set m_DocOp = New DocumentoAuditoriaOperaciones
        Set m_DocOp.Documento = m_DocumentoObj
        m_DocOp.Registrar m_URLLocal, m_Error
        If m_Error <> "" Then
            Err.Raise 1000
        End If
        RaiseEvent Alta
    End With
    Me.Documento = Null
    Me.URLDocumento = Null
    Set m_ObjARAuditoriaActiva.Documentos = Nothing
    EstablecerLista m_Error
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
        m_Error = "Al ComandoAnexar_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub

Private Sub ComandoCambiarNombre_Click()
    Dim m_Nombre As String
    
    Dim m_DocOp As DocumentoAuditoriaOperaciones
    On Error GoTo errores
    m_Error = ""
    If EsTecnico = EnumSino.Sí Then
        m_Error = "No tiene autorización para esa acción"
        Err.Raise 1000
    End If
    If m_DocumentoSeleccionado Is Nothing Then
        Set m_DocumentoSeleccionado = constructor.getDocumentoAuditoria(p_IDDocumento:=Nz(Me.ListaDocumentos.Column(0), ""), p_Error:=m_Error)
        If m_Error <> "" Then
            Err.Raise 1000
        End If
        If m_DocumentoSeleccionado Is Nothing Then
            m_Error = "Seleccione un documento"
            Err.Raise 1000
        End If
    End If
    
    m_Nombre = Nz(InputBox("Introduzca el nuevo nombre del documento", "Nuevo nombre", m_DocumentoSeleccionado.Documento), "")
    If m_Nombre = "" Then
        Exit Sub
    End If
    If m_Nombre = m_DocumentoSeleccionado.Documento Then
        Exit Sub
    End If
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    
    Set m_DocOp = New DocumentoAuditoriaOperaciones
    Set m_DocOp.Documento = m_DocumentoSeleccionado
    m_DocOp.CambiarNombre m_Nombre, m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set m_ObjARAuditoriaActiva.Documentos = Nothing
    RaiseEvent CambioNombre
    
    
    EstablecerLista m_Error
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
        m_Error = "Al ComandoCambiarNombre_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub

Private Sub ComandoEliminar_Click()
    
    Dim m_NombreDocumento As String
    Dim m_DocumentoSeleccionado As DocumentoAuditoria
    Dim m_DocOp As DocumentoAuditoriaOperaciones
    
    
    On Error GoTo errores
    
    
    m_Error = ""
    If EsTecnico = EnumSino.Sí Then
        m_Error = "No tiene autorización para esa acción"
        Err.Raise 1000
    End If
    If m_DocumentoSeleccionado Is Nothing Then
        Set m_DocumentoSeleccionado = constructor.getDocumentoAuditoria(p_IDDocumento:=Nz(Me.ListaDocumentos.Column(0), ""), p_Error:=m_Error)
        If m_Error <> "" Then
            Err.Raise 1000
        End If
        If m_DocumentoSeleccionado Is Nothing Then
            m_Error = "Seleccione un documento"
            Err.Raise 1000
        End If
    End If
    pregunta = MsgBox("¿Desea borrar el documento Seleccionado?", _
                vbExclamation + vbYesNo + vbDefaultButton2, "Eliminar documento")
    If pregunta <> vbYes Then
        Exit Sub
    End If
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    Set m_DocOp = New DocumentoAuditoriaOperaciones
    With m_DocOp
        Set .Documento = m_DocumentoSeleccionado
        .Eliminar m_Error
        If m_Error <> "" Then
            Err.Raise 1000
        End If
    End With
    
    Set m_ObjARAuditoriaActiva.Documentos = Nothing
    RaiseEvent Eliminado
    EstablecerLista m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    If FormularioAbierto("FormNCAuditoria") Then
        If Forms("FormNCAuditoria").Controls("FrmDetalle").SourceObject = "FormNCAuditoriaAcciones" Then
            Set Form_FormNCAuditoriaAcciones.m_ARSeleccionada = Nothing
            Form_FormNCAuditoriaAcciones.ListaAC_Click
           
        End If
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

Private Sub Form_Close()
    On Error GoTo errores
    
    If Not IsDate(m_FechaFinPropuesta) Then
        Exit Sub
    End If
    If m_ObjARAuditoriaActiva Is Nothing Then
        Exit Sub
    End If
    If Not FormularioAbierto("FormNCAuditoriaAR") Then
        Exit Sub
    End If
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    Set m_ObjARAuditoriaActiva.Documentos = Nothing
    If m_ObjARAuditoriaActiva.Documentos Is Nothing Then
        DoCmd.Hourglass False
        Exit Sub
    End If
    m_ObjARAuditoriaActiva.FechaFinReal = m_FechaFinPropuesta
    Form_FormNCAuditoriaAR.ComandoRegistrar_Click
    Exit Sub
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al Form_Close se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
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
    m_FechaFinPropuesta = Nz(Me.OpenArgs(), "")
    If m_ObjARAuditoriaActiva Is Nothing Then
        m_Error = "El formulario se ha abierto con parámetros insuficientes"
        Err.Raise 1000
    End If
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

Public Function EstablecerDatos(Optional ByRef p_Error As String) As String
    
    

    On Error GoTo errores
    
    
    Me.ImagenAnexo.Visible = False
    EstablecerLista p_Error
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

Public Function EstablecerLista( _
                                    Optional ByRef p_Error As String _
                                    ) As String
   
    
    
    Dim m_Col As Scripting.Dictionary
    Dim lst As ListBox
    Dim m_ID As Variant
    Dim m_NombreAnexo As String
    Dim m_Documento As DocumentoAuditoria
    Dim m_URL As Variant
    
    On Error GoTo errores
    
    Set lst = Me.ListaDocumentos
    lst.RowSource = "IDDocumento;Documento;Archivo"
    Me.ImagenAnexo.Visible = False
    Me.ComandoCambiarNombre.Enabled = False
    Me.ComandoEliminar.Enabled = False
    Me.ComandoAnexar.Enabled = True
    Set m_Col = m_ObjARAuditoriaActiva.Documentos
    p_Error = m_ObjARAuditoriaActiva.Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    
    If m_Col Is Nothing Then
       Exit Function
    End If
    
    For Each m_ID In m_Col
        Set m_Documento = m_Col(m_ID)
        m_NombreAnexo = fso.GetFileName(m_Documento.URLAnexo)
        lst.AddItem m_Documento.IDDocumento & ";" & Replace(m_Documento.Documento, ";", ":") & ";" & m_NombreAnexo
        Set m_Documento = Nothing
    Next
    If lst.ListCount = 1 Then
        Exit Function
    End If
    
    lst.Selected(1) = True
    ListaDocumentos_Click
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método EstablecerLista ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function

Private Sub ImagenAnexo_Click()
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    
    If m_DocumentoSeleccionado Is Nothing Then
        Set m_DocumentoSeleccionado = constructor.getDocumentoAuditoria(p_IDDocumento:=Nz(Me.ListaDocumentos.Column(0), ""), p_Error:=m_Error)
        If m_Error <> "" Then
            Err.Raise 1000
        End If
        If m_DocumentoSeleccionado Is Nothing Then
            m_Error = "Seleccione un documento"
            Err.Raise 1000
        End If
    End If
    AbrirEnLocal m_DocumentoSeleccionado.URLAnexo, m_Error
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
        m_Error = "Al ImagenAnexo_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub

Private Sub ListaDocumentos_Click()
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    Me.ImagenAnexo.Visible = False
    Me.ComandoCambiarNombre.Enabled = False
    Me.ComandoEliminar.Enabled = False
    
    
    If Nz(Me.ListaDocumentos.Column(0), "") = "" Then
        Set m_DocumentoSeleccionado = Nothing
        VBA.DoEvents
        DoCmd.Hourglass False
        VBA.DoEvents
        Exit Sub
    End If
    If m_DocumentoSeleccionado Is Nothing Then
        Set m_DocumentoSeleccionado = constructor.getDocumentoAuditoria(p_IDDocumento:=Me.ListaDocumentos.Column(0), p_Error:=m_Error)
        If m_Error <> "" Then
            Err.Raise 1000
        End If
    Else
        If m_DocumentoSeleccionado.IDDocumento <> Me.ListaDocumentos.Column(0) Then
            Set m_DocumentoSeleccionado = constructor.getDocumentoAuditoria(p_IDDocumento:=Me.ListaDocumentos.Column(0), p_Error:=m_Error)
            If m_Error <> "" Then
                Err.Raise 1000
            End If
        End If
    End If
    Me.ComandoEliminar.Enabled = True
    Me.ComandoCambiarNombre.Enabled = True
    Me.ImagenAnexo.Visible = True
    
   
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al ListaDocumentos_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub

Private Sub ListaDocumentos_DblClick(Cancel As Integer)
    On Error Resume Next
    Application.Echo False
    
    If Me.ImagenAnexo.Visible = True Then
        ImagenAnexo_Click
    End If
    Application.Echo True
End Sub