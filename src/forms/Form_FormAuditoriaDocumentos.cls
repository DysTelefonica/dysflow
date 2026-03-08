VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "Form_FormAuditoriaDocumentos"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = True
Attribute VB_PredeclaredId = True
Attribute VB_Exposed = False
Option Compare Database
Option Explicit

' =========================================================================
' FORMULARIO: GESTIÓN DE ANEXOS (AUDITORÍA)
' Versión Refactorizada: Separación Examinar/Aceptar + Edición en línea
' =========================================================================

' --- VARIABLES DE ESTADO ---
Private m_DocumentoSeleccionado As DocumentoAuditoria
Private m_ParaAlta As EnumSino              ' SÍ = Modo memoria (antes de guardar la entidad padre)
Private m_RutaArchivoSeleccionado As String ' Ruta temporal tras pulsar Examinar
Private m_Error As String

' --- EVENTOS ---
Public Event Alta()
Public Event CambioNombre()
Public Event Eliminado()

' -------------------------------------------------------------------------
' INICIALIZACIÓN Y SALIDA
' -------------------------------------------------------------------------

Private Sub Form_Load()
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    
    ' Inicialización de variables
    m_Error = ""
    m_RutaArchivoSeleccionado = ""
    
    ' Ajuste visual (si existe el helper global)
    ' Ajustar Me
    
    ' Validar contexto
    If m_ObjAuditoriaActiva Is Nothing Then
        m_Error = "El formulario se ha abierto sin el contexto de Auditoría (Variable global vacía)."
        Err.Raise 1000
    End If
    
    ' Determinar modo (Alta nueva vs Edición existente)
    If m_ObjAuditoriaActiva.IDAuditoria = "" Then
        m_ParaAlta = EnumSino.Sí
    Else
        m_ParaAlta = EnumSino.No
    End If
    
    EstablecerDatos m_Error
    If m_Error <> "" Then Err.Raise 1000
    
    DoCmd.Hourglass False
    Exit Sub
    
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        MsgBox "Error en Form_Load: " & Err.Description, vbCritical
    Else
        MsgBox m_Error, vbExclamation
    End If
End Sub

Private Sub cmdSalir_Click()
    On Error Resume Next
    DoCmd.Close acForm, Me.Name, acSaveNo
End Sub

' -------------------------------------------------------------------------
' LÓGICA DE DATOS Y LISTADO
' -------------------------------------------------------------------------

Public Function EstablecerDatos(Optional ByRef p_Error As String) As String
    On Error GoTo errores
    
    ' Configuración inicial de controles
    Me.Documento.Enabled = True
    Me.btnExaminar.Enabled = True
    Me.btnAceptar.Enabled = True
    
    ' Estado inicial: controles de edición ocultos
    Me.ComandoCambiarNombre.Visible = False
    Me.ComandoEliminar.Enabled = False
    Me.ImagenAnexo.Visible = False
    
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
    Dim m_Documento As DocumentoAuditoria
    
    On Error GoTo errores
    
    Set lst = Me.ListaDocumentos
    lst.RowSource = "IDDocumento;Documento;Archivo"
    
    ' Limpiar controles de detalle
    Me.Documento = Null
    Me.URLDocumento = Null
    m_RutaArchivoSeleccionado = "" ' Limpiar ruta pendiente
    
    ' Asegurar que botones de edición estén ocultos al recargar
    Me.ComandoCambiarNombre.Visible = False
    Me.ComandoEliminar.Enabled = False
    Me.ImagenAnexo.Visible = False
    
    ' --- MODO ALTA (Diccionario en memoria) ---
    If m_ParaAlta = EnumSino.Sí Then
        If Not m_ObjColDocumentosAuditoriaParaAlta Is Nothing Then
            For Each m_ID In m_ObjColDocumentosAuditoriaParaAlta
                ' Formato: ID=0; Nombre; NombreArchivo
                lst.AddItem "0;" & m_ID & ";" & fso.GetFileName(m_ObjColDocumentosAuditoriaParaAlta(m_ID))
            Next
        End If
        Exit Function
    End If
    
    ' --- MODO EXISTENTE (Base de Datos) ---
    Set m_Col = m_ObjAuditoriaActiva.Documentos
    p_Error = m_ObjAuditoriaActiva.Error
    If p_Error <> "" Then Err.Raise 1000
    
    If Not m_Col Is Nothing Then
        For Each m_ID In m_Col
            Set m_Documento = m_Col(m_ID)
            lst.AddItem m_Documento.IDDocumento & ";" & Replace(m_Documento.Documento, ";", ":") & ";" & m_Documento.NombreAnexo
            Set m_Documento = Nothing
        Next
    End If
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "EstablecerLista Error: " & Err.Description
    End If
End Function

Private Sub LimpiarControlesEntrada()
    Me.Documento = Null
    Me.URLDocumento = Null
    m_RutaArchivoSeleccionado = ""
    
    ' Deseleccionar lista y refrescar estado de botones
    Me.ListaDocumentos.Value = Null
    Call ListaDocumentos_Click
End Sub

' -------------------------------------------------------------------------
' BOTÓN 1: EXAMINAR (Selección de archivo)
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
    
    ' 2. Selección de archivo
    m_URLLocal = Seleccionar(True, "Seleccione el documento")
    If m_URLLocal = "" Then Exit Sub ' Cancelado por usuario
    
    If Not fso.FileExists(m_URLLocal) Then
        m_Error = "El archivo seleccionado no es accesible o no existe."
        Err.Raise 1000
    End If
    
    ' 3. Guardar ruta temporalmente
    m_RutaArchivoSeleccionado = m_URLLocal
    
    ' 4. Feedback Visual
    Me.URLDocumento = "..\" & fso.GetFileName(m_URLLocal)
    
    ' 5. UX: Autocompletar nombre si está vacío
    If Nz(Me.Documento, "") = "" Then
        Me.Documento = fso.GetBaseName(m_URLLocal)
    End If
    
    ' 6. UX: Desmarcar lista para indicar "Nuevo Anexo"
    ' Esto es crítico para que el botón Aceptar sepa que es una inserción y no una edición fallida
    Me.ListaDocumentos.Value = Null
    Call ListaDocumentos_Click ' Fuerza la ocultación de botones de edición
    
    Exit Sub
    
errores:
    If Err.Number <> 1000 Then
        MsgBox "Error en btnExaminar: " & Err.Description, vbCritical
    Else
        MsgBox m_Error, vbExclamation
    End If
End Sub

' -------------------------------------------------------------------------
' BOTÓN 2: ACEPTAR (Persistencia)
' -------------------------------------------------------------------------

Private Sub btnAceptar_Click()
    Dim m_DocumentoNombre As String
    Dim m_DocumentoObj As DocumentoAuditoria
    Dim m_DocOp As DocumentoAuditoriaOperaciones
    Dim m_URL As Variant
    Dim m_NombreAnexo As String
    
    On Error GoTo errores
    DoCmd.Hourglass True
    m_Error = ""

    ' 1. Validaciones Previas
    If EsTecnico = EnumSino.Sí Then
        m_Error = "No tiene autorización para esa acción"
        Err.Raise 1000
    End If

    m_DocumentoNombre = Nz(Me.Documento, "")
    
    If m_DocumentoNombre = "" Then
        m_Error = "Debe asignar un título al documento antes de aceptar."
        Err.Raise 1000
    End If
    
    ' Verificamos que se haya pulsado Examinar previamente
    If m_RutaArchivoSeleccionado = "" Or Not fso.FileExists(m_RutaArchivoSeleccionado) Then
        m_Error = "Debe seleccionar un archivo válido pulsando 'Examinar' antes de aceptar."
        Err.Raise 1000
    End If

    ' 2. RAMA ALTA (Diccionario temporal)
    If m_ParaAlta = EnumSino.Sí Then
        m_NombreAnexo = fso.GetFileName(m_RutaArchivoSeleccionado)
        
        If m_ObjColDocumentosAuditoriaParaAlta Is Nothing Then
            Set m_ObjColDocumentosAuditoriaParaAlta = New Scripting.Dictionary
            m_ObjColDocumentosAuditoriaParaAlta.CompareMode = TextCompare
        End If
        
        ' Validar unicidad (Nombre)
        If m_ObjColDocumentosAuditoriaParaAlta.Exists(m_DocumentoNombre) Then
            m_Error = "Ya existe un documento con el nombre '" & m_DocumentoNombre & "' en la lista."
            Err.Raise 1000
        End If
        
        ' Validar unicidad (Archivo)
        For Each m_URL In m_ObjColDocumentosAuditoriaParaAlta
            If m_ObjColDocumentosAuditoriaParaAlta(m_URL) = m_RutaArchivoSeleccionado Then
                m_Error = "Este archivo ya ha sido añadido a la lista."
                Err.Raise 1000
            End If
        Next
        
        ' Guardar en memoria
        m_ObjColDocumentosAuditoriaParaAlta.Add m_DocumentoNombre, m_RutaArchivoSeleccionado
        
        EstablecerLista
        LimpiarControlesEntrada
        DoCmd.Hourglass False
        Exit Sub
    End If

    ' 3. RAMA EXISTENTE (Persistencia BD)
    Set m_DocumentoObj = New DocumentoAuditoria
    With m_DocumentoObj
        .IDAuditoria = m_ObjAuditoriaActiva.IDAuditoria
        .Documento = m_DocumentoNombre
        
        Set m_DocOp = New DocumentoAuditoriaOperaciones
        Set m_DocOp.Documento = m_DocumentoObj
        
        ' Registrar físicamente
        m_DocOp.Registrar m_RutaArchivoSeleccionado, m_Error
        
        If m_Error <> "" Then Err.Raise 1000
        
        RaiseEvent Alta
    End With
    
    ' Limpiar caché y refrescar
    Set m_ObjAuditoriaActiva.Documentos = Nothing
    EstablecerLista m_Error
    LimpiarControlesEntrada
    
    If m_Error <> "" Then Err.Raise 1000

    DoCmd.Hourglass False
    Exit Sub

errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Error en btnAceptar: " & Err.Description
        CorreoAlAdministrador m_Error
        MsgBox m_Error, vbCritical
    Else
        MsgBox m_Error, vbExclamation
    End If
End Sub

' -------------------------------------------------------------------------
' EDICIÓN: CAMBIAR NOMBRE
' -------------------------------------------------------------------------

Private Sub ComandoCambiarNombre_Click()
    Dim m_NombreNuevo As String
    Dim m_NombreViejo As String
    Dim m_URL As String
    Dim m_DocOp As DocumentoAuditoriaOperaciones
    
    ' Variables para validación BD
    Dim m_ColDocs As Scripting.Dictionary
    Dim m_vID As Variant
    Dim m_DocIterado As DocumentoAuditoria
    
    On Error GoTo errores
    m_Error = ""
    
    If EsTecnico = EnumSino.Sí Then
        m_Error = "No tiene autorización para esa acción"
        Err.Raise 1000
    End If
    
    ' Tomamos el nombre del TextBox (edición en línea)
    m_NombreNuevo = Nz(Me.Documento, "")
    If m_NombreNuevo = "" Then
        m_Error = "El nombre no puede estar vacío."
        Err.Raise 1000
    End If
    
    ' --- MODO ALTA ---
    If m_ParaAlta = EnumSino.Sí Then
        m_NombreViejo = Nz(Me.ListaDocumentos.Column(1), "")
        
        If m_NombreViejo = "" Then Exit Sub
        If m_NombreNuevo = m_NombreViejo Then Exit Sub ' Sin cambios
        
        ' Validar duplicado
        If m_ObjColDocumentosAuditoriaParaAlta.Exists(m_NombreNuevo) Then
            m_Error = "Ya existe otro documento con el nombre '" & m_NombreNuevo & "'."
            Err.Raise 1000
        End If
        
        ' Intercambiar clave en diccionario
        m_URL = m_ObjColDocumentosAuditoriaParaAlta(m_NombreViejo)
        m_ObjColDocumentosAuditoriaParaAlta.Remove m_NombreViejo
        m_ObjColDocumentosAuditoriaParaAlta.Add m_NombreNuevo, m_URL
        
        EstablecerLista
        LimpiarControlesEntrada
        Exit Sub
    End If
    
    ' --- MODO EXISTENTE ---
    If m_DocumentoSeleccionado Is Nothing Then
        m_Error = "No hay documento seleccionado."
        Err.Raise 1000
    End If
    
    If m_NombreNuevo = m_DocumentoSeleccionado.Documento Then Exit Sub
    
    ' Validar duplicados iterando la colección
    Set m_ColDocs = m_ObjAuditoriaActiva.Documentos
    If Not m_ColDocs Is Nothing Then
        For Each m_vID In m_ColDocs
            Set m_DocIterado = m_ColDocs(m_vID)
            ' Coincidencia de nombre Y distinto ID
            If (StrComp(m_DocIterado.Documento, m_NombreNuevo, vbTextCompare) = 0) And _
               (m_DocIterado.IDDocumento <> m_DocumentoSeleccionado.IDDocumento) Then
                m_Error = "Ya existe un documento con el nombre '" & m_NombreNuevo & "'."
                Err.Raise 1000
            End If
        Next
    End If
    
    ' Persistir
    Set m_DocOp = New DocumentoAuditoriaOperaciones
    Set m_DocOp.Documento = m_DocumentoSeleccionado
    m_DocOp.CambiarNombre m_NombreNuevo, m_Error
    
    If m_Error <> "" Then Err.Raise 1000
    
    Set m_ObjAuditoriaActiva.Documentos = Nothing
    RaiseEvent CambioNombre
    EstablecerLista
    LimpiarControlesEntrada
    
    Exit Sub
    
errores:
    If Err.Number <> 1000 Then
        MsgBox "Error en CambiarNombre: " & Err.Description, vbCritical
    Else
        MsgBox m_Error, vbExclamation
    End If
End Sub

' -------------------------------------------------------------------------
' EDICIÓN: ELIMINAR
' -------------------------------------------------------------------------

Private Sub ComandoEliminar_Click()
    Dim m_NombreDocumento As String
    Dim m_DocOp As DocumentoAuditoriaOperaciones
    
    On Error GoTo errores
    m_Error = ""
    
    If EsTecnico = EnumSino.Sí Then
        m_Error = "No tiene autorización para esa acción"
        Err.Raise 1000
    End If
    
    ' --- MODO ALTA ---
    If m_ParaAlta = EnumSino.Sí Then
        m_NombreDocumento = Nz(Me.ListaDocumentos.Column(1), "")
        If m_NombreDocumento = "" Then Exit Sub
        
        If m_ObjColDocumentosAuditoriaParaAlta.Exists(m_NombreDocumento) Then
            m_ObjColDocumentosAuditoriaParaAlta.Remove m_NombreDocumento
            If m_ObjColDocumentosAuditoriaParaAlta.count = 0 Then
                Set m_ObjColDocumentosAuditoriaParaAlta = Nothing
            End If
            EstablecerLista
            LimpiarControlesEntrada
        End If
        Exit Sub
    End If
    
    ' --- MODO EXISTENTE ---
    If m_DocumentoSeleccionado Is Nothing Then
        ' Recuperación defensiva
        If Nz(Me.ListaDocumentos.Column(0), "") <> "" Then
             Set m_DocumentoSeleccionado = constructor.getDocumentoAuditoria(p_IDDocumento:=Me.ListaDocumentos.Column(0), p_Error:=m_Error)
        Else
             Exit Sub
        End If
    End If
    
    If MsgBox("¿Desea borrar el documento seleccionado?", vbExclamation + vbYesNo + vbDefaultButton2, "Eliminar documento") <> vbYes Then
        Exit Sub
    End If
    
    VBA.DoEvents
    DoCmd.Hourglass True
    
    Set m_DocOp = New DocumentoAuditoriaOperaciones
    Set m_DocOp.Documento = m_DocumentoSeleccionado
    m_DocOp.Eliminar m_Error
    
    If m_Error <> "" Then Err.Raise 1000
    
    RaiseEvent Eliminado
    Set m_ObjAuditoriaActiva.Documentos = Nothing
    EstablecerLista
    LimpiarControlesEntrada
    
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
' INTERACCIÓN CON LISTA E IMÁGENES
' -------------------------------------------------------------------------

Private Sub ListaDocumentos_Click()
    On Error GoTo errores
    m_Error = ""
    
    ' 1. Si no hay selección, ocultar edición y salir
    If IsNull(Me.ListaDocumentos.Value) Then
        Me.ComandoCambiarNombre.Visible = False
        Me.ComandoEliminar.Enabled = False
        Me.ImagenAnexo.Visible = False
        Me.Documento = Null
        Set m_DocumentoSeleccionado = Nothing
        Exit Sub
    End If

    ' 2. Copiar Nombre a TextBox para editar
    Me.Documento = Me.ListaDocumentos.Column(1)
    
    ' 3. Limpiar ruta temporal (ya no estamos "Examinando" un nuevo archivo)
    m_RutaArchivoSeleccionado = ""
    Me.URLDocumento = ""
    
    ' 4. Habilitar botones de edición
    Me.ComandoCambiarNombre.Visible = True
    Me.ComandoEliminar.Enabled = True
    Me.ImagenAnexo.Visible = True

    ' 5. Cargar objeto (solo si ya está guardado en BD)
    If m_ParaAlta = EnumSino.No Then
        Set m_DocumentoSeleccionado = constructor.getDocumentoAuditoria(p_IDDocumento:=Me.ListaDocumentos.Column(0), p_Error:=m_Error)
        If m_Error <> "" Then Err.Raise 1000
    End If
    
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        MsgBox "Error en ListaDocumentos_Click: " & Err.Description, vbCritical
    Else
        MsgBox m_Error, vbExclamation
    End If
End Sub

Private Sub ImagenAnexo_Click()
    Dim m_URL As String
    Dim m_NombreAnexo As String
    
    On Error GoTo errores
    DoCmd.Hourglass True
    
    ' Visualizar desde Memoria (Alta)
    If m_ParaAlta = EnumSino.Sí Then
        m_NombreAnexo = Nz(Me.ListaDocumentos.Column(1), "")
        If m_NombreAnexo = "" Or Not m_ObjColDocumentosAuditoriaParaAlta.Exists(m_NombreAnexo) Then
            Err.Raise 1000, , "Seleccione un documento válido de la lista."
        End If
        
        m_URL = m_ObjColDocumentosAuditoriaParaAlta(m_NombreAnexo)
        If Not fso.FileExists(m_URL) Then
            Err.Raise 1000, , "El archivo temporal no se encuentra: " & m_URL
        End If
        
        DoCmd.Hourglass False
        Ejecutar Me.hWnd, "open", m_URL, "", "", 1
        Exit Sub
    End If
    
    ' Visualizar desde BD (Existente)
    If m_DocumentoSeleccionado Is Nothing Then
        Call ListaDocumentos_Click ' Reintentar selección
        If m_DocumentoSeleccionado Is Nothing Then Exit Sub
    End If
    
    AbrirEnLocal m_DocumentoSeleccionado.URLAnexo, m_Error
    If m_Error <> "" Then Err.Raise 1000
    
    DoCmd.Hourglass False
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        MsgBox "Error abriendo imagen: " & Err.Description, vbCritical
    Else
        MsgBox Err.Description, vbExclamation
    End If
End Sub

Private Sub ListaDocumentos_DblClick(Cancel As Integer)
    On Error Resume Next
    If Me.ImagenAnexo.Visible = True Then ImagenAnexo_Click
End Sub



