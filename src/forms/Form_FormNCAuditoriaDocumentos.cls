VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "Form_FormNCAuditoriaDocumentos"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = True
Attribute VB_PredeclaredId = True
Attribute VB_Exposed = False
Option Compare Database
Option Explicit


Private m_DocumentoSeleccionado As DocumentoAuditoria
Private m_NC As NCAuditoria
Public Event Alta()
Public Event CambioNombre()
Public Event Eliminado()
Private m_Error As String


' -------------------------------------------------------------------------
' EDICIÓN: CAMBIAR NOMBRE (SIN INPUTBOX)
' -------------------------------------------------------------------------

Private Sub ComandoCambiarNombre_Click()
    Dim m_NombreNuevo As String
    Dim m_DocOp As DocumentoProyectoOperaciones
    
    ' Variables para validación de duplicados
    Dim m_ColDocs As Scripting.Dictionary
    Dim m_vID As Variant
    Dim m_DocIterado As DocumentoProyecto
    
    On Error GoTo errores
    m_Error = ""
    
    ' 1. Validaciones de Seguridad
    If EsTecnico = EnumSino.Sí Then
        m_Error = "No tiene autorización para esa acción"
        Err.Raise 1000
    End If
    
    ' 2. Validación de Selección
    If m_DocumentoSeleccionado Is Nothing Then
        Call ListaDocumentos_Click ' Intento de recuperación defensiva
        If m_DocumentoSeleccionado Is Nothing Then
            m_Error = "Debe seleccionar un documento de la lista para renombrarlo."
            Err.Raise 1000
        End If
    End If
    
    ' 3. Obtener el nombre desde el TextBox (Edición en línea)
    m_NombreNuevo = Nz(Me.Documento, "")
    
    ' Validar que no esté vacío
    If m_NombreNuevo = "" Then
        m_Error = "El nombre del documento no puede estar vacío."
        Me.Documento.SetFocus ' Devolver el foco para que escriba
        Err.Raise 1000
    End If
    
    ' 4. Optimización: Si el nombre es idéntico al que tenía, no hacemos nada
    If StrComp(m_NombreNuevo, m_DocumentoSeleccionado.Documento, vbTextCompare) = 0 Then
        Exit Sub
    End If
    
    ' 5. Lógica de Duplicados (Iterar colección excluyendo el propio ID)
    ' Usamos m_NC (asignado en Form_Load) para obtener la colección fresca
    Set m_ColDocs = m_NC.DocumentosCompletos
    
    If Not m_ColDocs Is Nothing Then
        For Each m_vID In m_ColDocs
            Set m_DocIterado = m_ColDocs(m_vID)
            
            ' Si el nombre coincide (ignorando mayúsculas/minúsculas)
            If StrComp(m_DocIterado.Documento, m_NombreNuevo, vbTextCompare) = 0 Then
                ' Y NO es el mismo documento que estamos editando
                If m_DocIterado.IDDocumento <> m_DocumentoSeleccionado.IDDocumento Then
                    m_Error = "Ya existe otro documento con el nombre '" & m_NombreNuevo & "' en esta No Conformidad."
                    Err.Raise 1000
                End If
            End If
        Next
    End If
    
    ' 6. Persistencia
    DoCmd.Hourglass True
    
    Set m_DocOp = New DocumentoProyectoOperaciones
    Set m_DocOp.Documento = m_DocumentoSeleccionado
    
    ' Llamada a la operación de cambio de nombre
    m_DocOp.CambiarNombre m_NombreNuevo, m_Error
    
    If m_Error <> "" Then Err.Raise 1000
    
    ' 7. Refresco de Cachés y UI
    Set m_ObjNCProyectoActiva.Documentos = Nothing
    Set m_ObjNCProyectoActiva.DocumentosCompletos = Nothing
    
    RaiseEvent CambioNombre
    
    EstablecerLista m_Error
    LimpiarControlesEntrada ' Limpia el textbox y quita la selección para evitar confusiones
    
    DoCmd.Hourglass False
    Exit Sub
    
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Error en ComandoCambiarNombre: " & Err.Description
        CorreoAlAdministrador m_Error
        MsgBox m_Error, vbCritical
    Else
        MsgBox m_Error, vbExclamation
    End If
End Sub
Private Sub LimpiarControlesEntrada()
    ' 1. Limpiar campos de texto (Título y Feedback visual de la ruta)
    Me.Documento = Null
    Me.URLDocumento = Null
    
    
    
    ' 3. Deseleccionar la lista para quitar el foco de cualquier documento existente
    Me.ListaDocumentos.Value = Null
    
    ' 4. Forzar la actualización de la interfaz
    ' Esto ocultará los botones "Eliminar" y "Cambiar Nombre" y
    ' pondrá m_DocumentoSeleccionado a Nothing.
    Call ListaDocumentos_Click
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
    pregunta = MsgBox("¿Desea borrar el documento seleccionado?", _
                vbExclamation + vbYesNo + vbDefaultButton2, "Eliminar documento")
    If pregunta <> vbYes Then
        Exit Sub
    End If
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    Set m_DocOp = New DocumentoAuditoriaOperaciones
    Set m_DocOp.Documento = m_DocumentoSeleccionado
    m_DocOp.Eliminar m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    RaiseEvent Eliminado
    Set m_ObjNCAuditoriaActiva.Documentos = Nothing
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
        m_Error = "Al ComandoEliminar_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
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
    
    If m_ObjNCAuditoriaActiva Is Nothing Then
        m_Error = "El formulario se ha abierto con parámetros insuficientes"
        Err.Raise 1000
    End If
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
    
    Me.Documento.Enabled = True
    Me.btnExaminar.Enabled = True
     Set m_NC = m_ObjNCAuditoriaActiva
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
    Me.btnExaminar.Enabled = True
    Set m_NC.DocumentosCompletos = Nothing
    Set m_Col = m_NC.DocumentosCompletos
    p_Error = m_NC.Error
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
        p_Error = "El método RellenarListaDocumentos ha devuelto el error: " & vbNewLine & Err.Description
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
    m_Error = ""
    
    ' Si no hay selección, limpiar y salir
    If IsNull(Me.ListaDocumentos.Value) Then
        Me.ComandoCambiarNombre.Enabled = False
        Me.ComandoEliminar.Enabled = False
        Me.ImagenAnexo.Visible = False
        Set m_DocumentoSeleccionado = Nothing
        Me.Documento = Null ' Limpiar caja de texto
        Exit Sub
    End If
    
    ' --- CARGAR DATOS PARA EDICIÓN ---
    Me.Documento = Me.ListaDocumentos.Column(1) ' <--- ESTO permite la edición en línea
    
    Me.URLDocumento = ""
    
    ' Habilitar controles
    Me.ImagenAnexo.Visible = True
    
    ' Validación de permisos de edición
    If m_ObjNCProyectoActiva.NCProyectoAsociada Is Nothing Then
        If Form_FormNCProyecto.m_PermitidoEditar = EnumSino.Sí Then
            Me.ComandoEliminar.Enabled = True
            Me.ComandoCambiarNombre.Enabled = True
        End If
    End If
    
    ' Instanciar objeto seleccionado
    Set m_DocumentoSeleccionado = constructor.getDocumentoProyecto(p_IDDocumento:=Me.ListaDocumentos.Column(0), p_Error:=m_Error)
    If m_Error <> "" Then Err.Raise 1000

    Exit Sub
errores:
    If Err.Number <> 1000 Then
        MsgBox "Error en ListaDocumentos_Click: " & Err.Description, vbCritical
    Else
        MsgBox m_Error, vbExclamation
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
