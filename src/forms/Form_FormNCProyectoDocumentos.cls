VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "Form_FormNCProyectoDocumentos"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = True
Attribute VB_PredeclaredId = True
Attribute VB_Exposed = False
Option Compare Database
Option Explicit

' =========================================================================
' FORMULARIO: GESTIÓN DE ANEXOS (PROYECTO)
' Versión: Sin InputBox + Patrón Examinar/Aceptar
' =========================================================================

' --- VARIABLES DE ESTADO ---
Private m_DocumentoSeleccionado As DocumentoProyecto
Private m_NC As NCProyecto
Private m_RutaArchivoSeleccionado As String ' Ruta temporal del archivo a subir
Private m_Error As String

' --- EVENTOS ---
Public Event Alta()
Public Event CambioNombre()
Public Event Eliminado()

' -------------------------------------------------------------------------
' INICIALIZACIÓN Y LIMPIEZA
' -------------------------------------------------------------------------

Private Sub Form_Load()
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    m_Error = ""
    m_RutaArchivoSeleccionado = ""
    
    ' 1. Validar Contexto
    If m_ObjNCProyectoActiva Is Nothing Then
        m_Error = "El formulario se ha abierto con parámetros insuficientes."
        Err.Raise 1000
    End If
    
    ' 2. Determinar sobre qué NC trabajamos (La activa o su asociada)
    If m_ObjNCProyectoActiva.NCProyectoAsociada Is Nothing Then
        Set m_NC = m_ObjNCProyectoActiva
    Else
        Set m_NC = m_ObjNCProyectoActiva.NCProyectoAsociada
    End If
    
    ' 3. Cargar interfaz
    EstablecerDatos m_Error
    If m_Error <> "" Then Err.Raise 1000
    
    VBA.DoEvents
    DoCmd.Hourglass False
    Exit Sub

errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Form_Load Error: " & Err.Description
        CorreoAlAdministrador m_Error
        MsgBox m_Error, vbCritical
    Else
        MsgBox m_Error, vbExclamation
    End If
End Sub

Private Sub LimpiarControlesEntrada()
    ' Resetea el formulario para un estado "limpio"
    Me.Documento = Null
    Me.URLDocumento = Null
    m_RutaArchivoSeleccionado = ""
    
    ' Quitar selección de la lista para evitar confusión entre "Editar" y "Nuevo"
    Me.ListaDocumentos.Value = Null
    Call ListaDocumentos_Click
End Sub

' -------------------------------------------------------------------------
' LÓGICA DE DATOS Y LISTADO
' -------------------------------------------------------------------------

Public Function EstablecerDatos(Optional ByRef p_Error As String) As String
    On Error GoTo errores
    
    ' Configuración visual inicial
    Me.ImagenAnexo.Visible = False
    Me.AllowEdits = True
    
    ' Lógica de Permisos (Heredada del original)
    Dim bPuedeEditar As Boolean
    If m_ObjNCProyectoActiva.NCProyectoAsociada Is Nothing Then
        bPuedeEditar = (EsTecnico <> EnumSino.Sí)
    Else
        bPuedeEditar = False
    End If
    
    ' Aplicar permisos a los controles de entrada
    Me.Documento.Enabled = bPuedeEditar
    Me.btnExaminar.Enabled = bPuedeEditar
    Me.btnAceptar.Enabled = bPuedeEditar
    
    EstablecerLista p_Error
    If p_Error <> "" Then Err.Raise 1000

    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "EstablecerDatos Error: " & Err.Description
    End If
End Function

Public Function EstablecerLista(Optional ByRef p_Error As String) As String
    Dim m_Col As Scripting.Dictionary
    Dim lst As ListBox
    Dim m_ID As Variant
    Dim m_NombreAnexo As String
    Dim m_Documento As DocumentoProyecto
    
    On Error GoTo errores
    
    Set lst = Me.ListaDocumentos
    lst.RowSource = "IDDocumento;Documento;Archivo"
    
    ' Resetear botones de edición
    Me.ImagenAnexo.Visible = False
    Me.ComandoCambiarNombre.Enabled = False
    Me.ComandoEliminar.Enabled = False
    
    ' Lógica adicional de permisos para botones (Heredada)
    Dim bPermitido As Boolean
    If m_ObjNCProyectoActiva.NCProyectoAsociada Is Nothing Then
        If Form_FormNCProyecto.m_PermitidoEditar = EnumSino.No Then
            bPermitido = False
        Else
            bPermitido = True
        End If
    Else
        bPermitido = False
    End If
    
    Me.btnExaminar.Enabled = bPermitido
    Me.btnAceptar.Enabled = bPermitido
    
    ' Refrescar colección
    Set m_NC.DocumentosCompletos = Nothing
    Set m_Col = m_NC.DocumentosCompletos
    
    p_Error = m_NC.Error
    If p_Error <> "" Then Err.Raise 1000
    
    If m_Col Is Nothing Then Exit Function
    
    ' Rellenar Lista
    For Each m_ID In m_Col
        Set m_Documento = m_Col(m_ID)
        m_NombreAnexo = fso.GetFileName(m_Documento.URLAnexo)
        lst.AddItem m_Documento.IDDocumento & ";" & Replace(m_Documento.Documento, ";", ":") & ";" & m_NombreAnexo
        Set m_Documento = Nothing
    Next
    
    ' NOTA: Se ha eliminado la selección automática del primer elemento
    ' para permitir el flujo limpio de "Nuevo Anexo".
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "EstablecerLista Error: " & Err.Description
    End If
End Function

' -------------------------------------------------------------------------
' BOTÓN 1: EXAMINAR (Selección de Archivo)
' -------------------------------------------------------------------------

Private Sub btnExaminar_Click()
    Dim m_URLLocal As String
    
    On Error GoTo errores
    m_Error = ""
    
    ' 1. Gatekeeping
    If EsTecnico = EnumSino.Sí Then
        m_Error = "No tiene autorización para esa acción"
        Err.Raise 1000
    End If
    
    ' 2. Seleccionar Archivo
    m_URLLocal = Seleccionar(True, "Seleccione el documento")
    
    If m_URLLocal = "" Then Exit Sub ' Cancelado
    
    If Not fso.FileExists(m_URLLocal) Then
        m_Error = "El archivo seleccionado no existe o no es accesible."
        Err.Raise 1000
    End If
    
    ' 3. Guardar estado temporal (Memoria)
    m_RutaArchivoSeleccionado = m_URLLocal
    
    ' 4. Feedback Visual
    Me.URLDocumento = "..\" & fso.GetFileName(m_URLLocal)
    
    ' 5. UX: Rellenar título si está vacío
    If Nz(Me.Documento, "") = "" Then
        Me.Documento = fso.GetBaseName(m_URLLocal)
    End If
    
    ' 6. Indicar modo "Alta" (Quitar selección de lista)
    Me.ListaDocumentos.Value = Null
    Call ListaDocumentos_Click
    
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        MsgBox "Error btnExaminar: " & Err.Description, vbCritical
    Else
        MsgBox m_Error, vbExclamation
    End If
End Sub

' -------------------------------------------------------------------------
' BOTÓN 2: ACEPTAR (Guardar Nuevo)
' -------------------------------------------------------------------------

Private Sub btnAceptar_Click()
    Dim m_DocumentoObj As DocumentoProyecto
    Dim m_DocOp As DocumentoProyectoOperaciones
    Dim m_Titulo As String
    
    On Error GoTo errores
    DoCmd.Hourglass True
    m_Error = ""
    
    ' 1. Validaciones
    If EsTecnico = EnumSino.Sí Then
        m_Error = "No tiene autorización para esa acción"
        Err.Raise 1000
    End If
    
    m_Titulo = Nz(Me.Documento, "")
    If m_Titulo = "" Then
        m_Error = "Debe poner un título al documento."
        Err.Raise 1000
    End If
    
    If m_RutaArchivoSeleccionado = "" Or Not fso.FileExists(m_RutaArchivoSeleccionado) Then
        m_Error = "Debe seleccionar un archivo pulsando 'Examinar' antes de Aceptar."
        Err.Raise 1000
    End If
    
    ' 2. Persistencia
    Set m_DocumentoObj = New DocumentoProyecto
    With m_DocumentoObj
        .IDNoConformidad = m_NC.IDNoConformidad
        .Documento = m_Titulo
        
        Set m_DocOp = New DocumentoProyectoOperaciones
        Set m_DocOp.Documento = m_DocumentoObj
        
        m_DocOp.Registrar m_RutaArchivoSeleccionado, m_Error
        If m_Error <> "" Then Err.Raise 1000
        
        RaiseEvent Alta
    End With
    
    ' 3. Limpieza
    Set m_NC.Documentos = Nothing
    Set m_NC.DocumentosCompletos = Nothing
    
    LimpiarControlesEntrada
    EstablecerLista m_Error
    If m_Error <> "" Then Err.Raise 1000
    
    DoCmd.Hourglass False
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Error btnAceptar: " & Err.Description
        CorreoAlAdministrador m_Error
        MsgBox m_Error, vbCritical
    Else
        MsgBox m_Error, vbExclamation
    End If
End Sub

' -------------------------------------------------------------------------
' SELECCIÓN EN LISTA (Carga para Edición)
' -------------------------------------------------------------------------

Private Sub ListaDocumentos_Click()
    On Error GoTo errores
    m_Error = ""
    
    ' 1. Si no hay selección, modo "Limpio"
    If IsNull(Me.ListaDocumentos.Value) Then
        Me.ImagenAnexo.Visible = False
        Me.ComandoCambiarNombre.Enabled = False
        Me.ComandoEliminar.Enabled = False
        Set m_DocumentoSeleccionado = Nothing
        ' NOTA: No borramos Me.Documento aquí si m_RutaArchivoSeleccionado tiene datos
        ' para no borrar lo que el usuario esté escribiendo para un alta nueva.
        If m_RutaArchivoSeleccionado = "" Then Me.Documento = Null
        Exit Sub
    End If
    
    ' 2. Cargar Datos para Edición (SIN INPUTBOX)
    Me.Documento = Me.ListaDocumentos.Column(1) ' Copia el nombre al TextBox
    m_RutaArchivoSeleccionado = ""               ' Limpia cualquier anexo pendiente
    Me.URLDocumento = ""
    
    ' 3. Habilitar Controles
    Me.ImagenAnexo.Visible = True
    
    ' Lógica permisos botones
    If m_ObjNCProyectoActiva.NCProyectoAsociada Is Nothing Then
        If Form_FormNCProyecto.m_PermitidoEditar = EnumSino.Sí Then
            Me.ComandoEliminar.Enabled = True
            Me.ComandoCambiarNombre.Enabled = True
        End If
    End If
    
    ' 4. Instanciar Objeto
    Set m_DocumentoSeleccionado = constructor.getDocumentoProyecto(p_IDDocumento:=Me.ListaDocumentos.Column(0), p_Error:=m_Error)
    If m_Error <> "" Then Err.Raise 1000

    Exit Sub
errores:
    If Err.Number <> 1000 Then
        MsgBox "Error ListaDocumentos: " & Err.Description, vbCritical
    Else
        MsgBox m_Error, vbExclamation
    End If
End Sub

' -------------------------------------------------------------------------
' EDICIÓN: CAMBIAR NOMBRE (Validación Estricta)
' -------------------------------------------------------------------------

Private Sub ComandoCambiarNombre_Click()
    Dim m_NombreNuevo As String
    Dim m_DocOp As DocumentoProyectoOperaciones
    
    ' Variables para validación
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
        Call ListaDocumentos_Click
        If m_DocumentoSeleccionado Is Nothing Then
            m_Error = "Debe seleccionar un documento de la lista."
            Err.Raise 1000
        End If
    End If
    
    ' 3. Obtener el nombre desde el TextBox
    m_NombreNuevo = Nz(Me.Documento, "")
    
    If m_NombreNuevo = "" Then
        m_Error = "El nombre del documento no puede estar vacío."
        Me.Documento.SetFocus
        Err.Raise 1000
    End If
    
    ' 4. VALIDACIÓN A: El nombre es el mismo (Identidad)
    ' Si el usuario no ha cambiado nada, le avisamos explícitamente como pediste.
    If StrComp(m_NombreNuevo, m_DocumentoSeleccionado.Documento, vbTextCompare) = 0 Then
        m_Error = "El nombre indicado es el mismo que ya tiene el documento."
        Err.Raise 1000
    End If
    
    ' 5. VALIDACIÓN B: El nombre ya existe en la lista (Duplicidad)
    ' Iteramos la colección completa de la NC
    Set m_ColDocs = m_NC.DocumentosCompletos
    
    If Not m_ColDocs Is Nothing Then
        For Each m_vID In m_ColDocs
            Set m_DocIterado = m_ColDocs(m_vID)
            
            ' Si encontramos otro documento con el mismo nombre...
            If StrComp(m_DocIterado.Documento, m_NombreNuevo, vbTextCompare) = 0 Then
                ' ...y aseguramos que no es el mismo ID (aunque el paso 4 ya filtra esto, es doble seguridad)
                If m_DocIterado.IDDocumento <> m_DocumentoSeleccionado.IDDocumento Then
                    m_Error = "Ya existe otro documento con el nombre '" & m_NombreNuevo & "' en esta lista."
                    Err.Raise 1000
                End If
            End If
        Next
    End If
    
    ' 6. Persistencia (Solo llega aquí si pasa las validaciones)
    DoCmd.Hourglass True
    
    Set m_DocOp = New DocumentoProyectoOperaciones
    Set m_DocOp.Documento = m_DocumentoSeleccionado
    
    m_DocOp.CambiarNombre m_NombreNuevo, m_Error
    
    If m_Error <> "" Then Err.Raise 1000
    
    ' 7. Refresco
    Set m_NC.Documentos = Nothing
    Set m_NC.DocumentosCompletos = Nothing
    
    RaiseEvent CambioNombre
    
    EstablecerLista m_Error
    LimpiarControlesEntrada
    
    If m_Error <> "" Then Err.Raise 1000
    
    DoCmd.Hourglass False
    Exit Sub
    
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Error en ComandoCambiarNombre: " & Err.Description
        CorreoAlAdministrador m_Error
        MsgBox m_Error, vbCritical
    Else
        ' Aquí se mostrará "El nombre indicado es el mismo..." o "Ya existe otro documento..."
        MsgBox m_Error, vbExclamation
    End If
End Sub

' -------------------------------------------------------------------------
' ELIMINAR
' -------------------------------------------------------------------------

Private Sub ComandoEliminar_Click()
    Dim m_DocOp As DocumentoProyectoOperaciones
    
    On Error GoTo errores
    m_Error = ""
    
    If EsTecnico = EnumSino.Sí Then
        m_Error = "No tiene autorización para esa acción"
        Err.Raise 1000
    End If
    
    If Form_FormNCProyecto.m_PermitidoEditar = EnumSino.No Then
        m_Error = "Operación no autorizada"
        Err.Raise 1000
    End If
    
    If m_DocumentoSeleccionado Is Nothing Then
        Call ListaDocumentos_Click
        If m_DocumentoSeleccionado Is Nothing Then
            m_Error = "Seleccione un documento"
            Err.Raise 1000
        End If
    End If
    
    If MsgBox("¿Desea borrar el documento seleccionado?", vbExclamation + vbYesNo + vbDefaultButton2, "Eliminar documento") <> vbYes Then
        Exit Sub
    End If
    
    DoCmd.Hourglass True
    
    Set m_DocOp = New DocumentoProyectoOperaciones
    Set m_DocOp.Documento = m_DocumentoSeleccionado
    m_DocOp.Eliminar m_Error
    If m_Error <> "" Then Err.Raise 1000
    
    ' Recargar objeto padre
    Set m_ObjNCProyectoActiva = constructor.getNCProyecto(p_IDNC:=m_ObjNCProyectoActiva.IDNoConformidad, p_Error:=m_Error)
    If m_Error <> "" Then Err.Raise 1000
    
    ' Reasignar puntero m_NC
    If m_ObjNCProyectoActiva.NCProyectoAsociada Is Nothing Then
        Set m_NC = m_ObjNCProyectoActiva
    Else
        Set m_NC = m_ObjNCProyectoActiva.NCProyectoAsociada
    End If
    
    RaiseEvent Eliminado
    
    LimpiarControlesEntrada
    EstablecerLista m_Error
    If m_Error <> "" Then Err.Raise 1000
    
    DoCmd.Hourglass False
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Error Eliminar: " & Err.Description
        CorreoAlAdministrador m_Error
        MsgBox m_Error, vbCritical
    Else
        MsgBox m_Error, vbExclamation
    End If
End Sub

' -------------------------------------------------------------------------
' VISUALIZACIÓN DE IMAGEN
' -------------------------------------------------------------------------

Private Sub ImagenAnexo_Click()
    On Error GoTo errores
    DoCmd.Hourglass True
    m_Error = ""
    
    If m_DocumentoSeleccionado Is Nothing Then
        Call ListaDocumentos_Click
        If m_DocumentoSeleccionado Is Nothing Then
            m_Error = "Seleccione un documento"
            Err.Raise 1000
        End If
    End If
    
    AbrirEnLocal m_DocumentoSeleccionado.URLAnexo, m_Error
    If m_Error <> "" Then Err.Raise 1000
    
    DoCmd.Hourglass False
    Exit Sub
errores:
    DoCmd.Hourglass False
    MsgBox "Error abriendo anexo: " & Err.Description, vbCritical
End Sub

Private Sub ListaDocumentos_DblClick(Cancel As Integer)
    On Error Resume Next
    If Me.ImagenAnexo.Visible = True Then ImagenAnexo_Click
End Sub
