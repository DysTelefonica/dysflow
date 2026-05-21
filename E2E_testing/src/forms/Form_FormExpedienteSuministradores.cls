

Option Compare Database
Option Explicit
' ==============================================================================
' FORMULARIO: Gestion de Suministradores (Arbol)
' CARACTERISTICAS:
'   - Soporta Drag & Drop desde catalogo (derecha) y reordenacion interna.
'   - Modo Hibrido: Persistencia en BD (Edicion) o en Memoria DTO (Alta).
'   - Integracion con Servicio Transaccional.
' ==============================================================================

' --- Constantes de Logica del Arbol ---
Private Const K_ROOT_ORGANO As String = "ROOT_ORGANO"

' --- Constantes de Imagenes (Deben coincidir con los ficheros .ico en /Iconos) ---
Private Const IMG_KEY_CONTRATISTA As String = "ICON_ORGANO_CONTROL"
Private Const IMG_KEY_EMPRESA As String = "ICON_EMPRESA_NO_GRUPO"
Private Const IMG_KEY_EMPRESA_GRUPO As String = "ICON_EMPRESA_GRUPO"
Private Const IMG_KEY_EMPRESA_LISTA As String = "ICON_EMPRESA_LISTA"

' --- Constantes para Drag & Drop y Menus ---
Private Const PREFIX_SRC As String = "SRC_" ' Identifica origen desde lista derecha
Private Const TV_SELECTED_VAR As String = "SelectedIDSuministrador" ' TempVar para dialogos

' --- Estado ---
Private m_IDExpediente As String

Private m_Error As String
Private m_Servicio As ExpedienteSuministradorServicio

Private WithEvents m_FormAltaSuministrador As Form_FormSuministrador



' ==============================================================================
' 1. INICIALIZACION Y CIERRE
' ==============================================================================

Private Sub Form_Open(Cancel As Integer)
    Dim ctl As Control
    On Error GoTo errores
    m_Error = ""
    DoCmd.Hourglass True
    
    ' Validar Contexto DTO
    If m_ObjExpedienteDTOActivo Is Nothing Then
        m_Error = "No hay contexto de expediente activo."
        Err.Raise 1000
    End If
    Me.Parent.Controls("ComandoRegistrar").Visible = False
    ' Inicializar Estaado
    m_IDExpediente = m_ObjExpedienteDTOActivo.Expediente.IDExpediente
    
    Set m_Servicio = New ExpedienteSuministradorServicio
    
    ' Configurar Imagenes (UI)
    RellenarListaImagenes Me.ListaImagenes, m_Error
    If m_Error <> "" Then Err.Raise 1000
    Dim imgList As Object
    Set imgList = Me.ListaImagenes.Object
    On Error Resume Next
    imgList.ListImages.Remove IMG_KEY_CONTRATISTA
    imgList.ListImages.Remove IMG_KEY_EMPRESA
    imgList.ListImages.Remove IMG_KEY_EMPRESA_GRUPO
    imgList.ListImages.Remove IMG_KEY_EMPRESA_LISTA
    On Error GoTo errores
    imgList.ListImages.Add , IMG_KEY_CONTRATISTA, LoadPicture(m_ObjEntorno.URLIconoCadenaContratacionOrganoControl)
    imgList.ListImages.Add , IMG_KEY_EMPRESA, LoadPicture(m_ObjEntorno.URLIconoCadenaContratacionEmpresaNoGrupo)
    imgList.ListImages.Add , IMG_KEY_EMPRESA_GRUPO, LoadPicture(m_ObjEntorno.URLIconoCadenaContratacionEmpresaGrupo)
    imgList.ListImages.Add , IMG_KEY_EMPRESA_LISTA, LoadPicture(m_ObjEntorno.URLIconoEmpresaLista)
    
    ' Vincular ImageList
    Me.tvCadena.ImageList = Me.ListaImagenes.Object
    Me.lvFuente.SmallIcons = Me.ListaImagenes.Object
    
    ' Preparar Controles
    PrepararTreeView
    ConfigurarListView
    
    ' Carga Inicial
    RefrescarAArbol
    CargarListaFuente "", False
    
    ' Gestionar Permisos (En Alta siempre es editable la memoria)
   
    Me.AllowEdits = False
    If AbiertoParaEditar = True Then
        If EsAdministrador = EnumSiNo.Sí Then
            Me.AllowEdits = True
        End If
    End If
   For Each ctl In Me.Controls
        If Nz(ctl.Tag, "") = "EJECUTIVO" Then
            If AbiertoParaEditar = True Then
                If EsAdministrador = EnumSiNo.Sí Then
                    ctl.Enabled = True
                Else
                    ctl.Enabled = False
                End If
            Else
                ctl.Enabled = False
            End If
        End If
    Next
    DoCmd.Hourglass False
   
    ' Estaado inicial botones detalle
    GestionarBotones Nothing
    
    Exit Sub
errores:
    DoCmd.Hourglass False
    MsgBox "Error al abrir subformulario Suministradores: " & m_Error, vbCritical, "Error"
    Cancel = True
End Sub

Private Sub Form_Close()
    Set m_Servicio = Nothing
End Sub

' ==============================================================================
' 2. GESTI_N DEL CAT_LOGO (DERECHA - LISTVIEW)
' ==============================================================================

Private Sub ConfigurarListView()
    On Error Resume Next
    Dim anchoColumna As Long
    
    With Me.lvFuente
        .View = 3 ' lvwReport
        .HideSelection = False
        .OLEDragMode = 1 ' ccOLEDragAutomatic
        .ColumnHeaders.Clear
        ' Ajuste dinamico de ancho
        anchoColumna = .Width - 300
        If anchoColumna < 1000 Then anchoColumna = 2000
        .ColumnHeaders.Add , , "Empresa / Suministrador", anchoColumna
    End With
End Sub

Private Sub lvFuente_MouseUp(ByVal Button As Integer, ByVal Shift As Integer, ByVal x As Long, ByVal y As Long)
    If Button = 2 Then
        Dim hitItem As Object
        Set hitItem = Me.lvFuente.HitTest(x, y)
        If Not hitItem Is Nothing Then
            Set Me.lvFuente.SelectedItem = hitItem
            MostrarMenuContextual "LISTA", hitItem
        End If
    End If
End Sub


Private Sub tvCadena_MouseUp(ByVal Button As Integer, ByVal Shift As Integer, ByVal x As Long, ByVal y As Long)
    If Button = 2 Then
        Dim hitNode As Object
        Set hitNode = Me.tvCadena.HitTest(x, y)
        If Not hitNode Is Nothing Then
            Set Me.tvCadena.SelectedItem = hitNode
            GestionarBotones hitNode
            MostrarMenuContextual "ARBOL", hitNode
        End If
    End If
End Sub

Private Sub txtFiltro_Change()
    ' Filtro al escribir
    CargarListaFuente Me.txtFiltro.Text, Nz(Me.chkNuestras.value, False)
End Sub

Private Sub chkNuestras_Click()
    ' Filtro checkbox
    Dim sTexto As String
    If Me.ActiveControl.Name = "txtFiltro" Then sTexto = Me.txtFiltro.Text Else sTexto = Nz(Me.txtFiltro.value, "")
    CargarListaFuente sTexto, Nz(Me.chkNuestras.value, False)
End Sub

Private Sub CargarListaFuente(sTexto As String, bSoloPropias As Boolean)
    Dim dict As Scripting.Dictionary
    Dim sSum As Suministrador
    Dim k As Variant
    Dim li As Object
    Dim sKey As String
    
    On Error Resume Next
    Me.lvFuente.ListItems.Clear
    
    Set dict = constructor.getSuministradoresFiltrados(sTexto, bSoloPropias, m_Error)
    If dict Is Nothing Then Exit Sub
    
    For Each k In dict.keys
        Set sSum = dict(k)
        sKey = PREFIX_SRC & sSum.IDSuministrador
        
        Dim sNombreDisplay As String
        Dim sImgKey As String
        If sSum.Nemotecnico <> "" Then
            sNombreDisplay = sSum.Nemotecnico
        Else
            sNombreDisplay = sSum.Nombre
        End If
        sImgKey = IMG_KEY_EMPRESA_LISTA
        
        Set li = Me.lvFuente.ListItems.Add(, sKey, sNombreDisplay, , sImgKey)
        li.Tag = sSum.IDSuministrador ' ID Real
    Next
End Sub

' ==============================================================================
' 3. GESTI_N DEL ARBOL (IZQUIERDA - TREEVIEW) - LOGICA HIBRIDA
' ==============================================================================

Private Sub PrepararTreeView()
    On Error Resume Next
    With Me.tvCadena
        .Nodes.Clear
        .LineStyle = 1
        .Indentation = 300
        .HideSelection = False
        .LabelEdit = 1
        .OLEDragMode = 1
        .OLEDropMode = 1
    End With
End Sub

Private Sub RefrescarAArbol()
    Dim nodRaiz As Object
    
    ' Variables para datos
    Dim colDatos As Collection
    Dim itemDatos As Variant
    
    ' Variables para carga robusta
    Dim colPendientes As New Collection
    Dim colReintentos As Collection
    Dim bAgregado As Boolean
    Dim maxIntentos As Long
    
    ' Variables visuales
    Dim sKey As String, sParentKey As String, sText As String, sTag As String
    Dim sNombreEmpresa As String
    
    ' Variables para UTEs
    Dim colNombresAdj As New Collection

    ' Variables Organo
    Dim sNombreOrgano As String
    Dim vIDOrgano As Variant
    Dim oOrgano As OrganoContratacion
    
    On Error GoTo errores
    
    Me.tvCadena.Nodes.Clear
    Set colDatos = New Collection
    
    
    ' --- MODO BD ---
    Dim rs As DAO.Recordset
    Set rs = ExpedienteSuministradorRepositorio.getDatosArbol(m_IDExpediente)
    If Not rs.EOF Then
        rs.MoveFirst
        Do While Not rs.EOF
            colDatos.Add Array(CStr(rs!IDExpedienteSuministrador), CStr(Nz(rs!IdPadre, "")), CStr(Nz(rs!ContratistaPrincipal, "No")), CStr(rs!IDSuministrador))
            rs.MoveNext
        Loop
    End If
    rs.Close
    Set rs = Nothing
    
    
    ' =========================================================================
    ' 2. CREAR NODO RAIZ UNICO (ORGANO)
    ' =========================================================================
    vIDOrgano = m_ObjExpedienteDTOActivo.Expediente.IDOrganoContratacion
    If IsNull(vIDOrgano) Then vIDOrgano = 0
    
    sNombreOrgano = "DESCONOCIDO"
    On Error Resume Next
    Set oOrgano = m_ObjExpedienteDTOActivo.Expediente.OrganoContratacion
    If Err.Number = 0 Then
        If Not oOrgano Is Nothing Then
            If Nz(oOrgano.OrganoContratacion, "") <> "" Then sNombreOrgano = oOrgano.OrganoContratacion
        End If
    End If
    On Error GoTo errores
    
    Set nodRaiz = Me.tvCadena.Nodes.Add(, , K_ROOT_ORGANO, "Órgano de Contratación (" & sNombreOrgano & ")", IMG_KEY_CONTRATISTA)
    nodRaiz.Bold = True: nodRaiz.ForeColor = RGB(0, 51, 102)
    
    ' =========================================================================
    ' 3. PREPARAR DATOS UTE
    ' =========================================================================
    For Each itemDatos In colDatos
        If itemDatos(1) = "" Then
            sNombreEmpresa = ObtenerNombreEmpresa(CStr(itemDatos(3)))
            colNombresAdj.Add sNombreEmpresa
        End If
    Next
    
    ' =========================================================================
    ' 4. PINTADO DE NODOS
    ' =========================================================================
    Set colPendientes = colDatos
    maxIntentos = colPendientes.Count * 2
    
    Do While colPendientes.Count > 0 And maxIntentos > 0
        Set colReintentos = New Collection
        bAgregado = False
        
        For Each itemDatos In colPendientes
            sKey = "K" & itemDatos(0)
            
            ' Determinar Padre Visual
            If itemDatos(1) = "" Then
                sParentKey = K_ROOT_ORGANO
            Else
                sParentKey = "K" & itemDatos(1)
            End If
            
            On Error Resume Next
            Err.Clear
            Set nodRaiz = Me.tvCadena.Nodes.Add(sParentKey, 4, sKey, "")
            
            If Err.Number = 0 Then
                sNombreEmpresa = ObtenerNombreEmpresa(CStr(itemDatos(3)))
                sText = sNombreEmpresa
                
                If itemDatos(1) = "" Then
                    sText = sText & ObtenerTextoSocios(colNombresAdj, sNombreEmpresa)
                End If
                
                sTag = "RELID=" & itemDatos(0) & ";IDS=" & itemDatos(3)
                
                With nodRaiz
                    .Text = sText
                    .Tag = sTag
                    If m_Servicio.EsEmpresaPropia(CStr(itemDatos(3))) Then
                        .Image = IMG_KEY_EMPRESA_GRUPO
                        .Bold = True
                    Else
                        .Image = IMG_KEY_EMPRESA
                        .Bold = False
                    End If
                    .Expanded = True
                End With
                
                bAgregado = True
                On Error GoTo errores
            Else
                colReintentos.Add itemDatos
            End If
            On Error GoTo errores
        Next
        
        Set colPendientes = colReintentos
        maxIntentos = maxIntentos - 1
        If Not bAgregado And colPendientes.Count > 0 Then Exit Do
    Loop

Finalizar:
    On Error Resume Next
    Me.tvCadena.Nodes(K_ROOT_ORGANO).Expanded = True
    ActualizarEtiquetaSituacion
    Exit Sub
    
errores:
    MsgBox "Error RefrescarAArbol_Nuevo: " & Err.Description
End Sub

Private Function ObtenerTextoSocios(colTodos As Collection, sNombreActual As String) As String
    ' Genera: " (UTE con: EmpresaB, EmpresaC)" excluyendo a sNombreActual
    
    ' Si hay menos de 2 empresas, no es una UTE, devolvemos vacio
    If colTodos.Count < 2 Then Exit Function
    
    Dim vItem As Variant
    Dim sResultado As String
    
    For Each vItem In colTodos
        ' Anadimos a la lista solo si NO es la empresa actual
        If vItem <> sNombreActual Then
            sResultado = sResultado & vItem & ", "
        End If
    Next
    
    ' Limpieza final de coma y espacio
    If Len(sResultado) > 0 Then
        sResultado = Left(sResultado, Len(sResultado) - 2)
        ObtenerTextoSocios = " (UTE con: " & sResultado & ")"
    End If
End Function


' ==============================================================================
' 4. DRAG & DROP (LOGICA CORE)
' ==============================================================================

Private Sub lvFuente_OLEStartDrag(Data As Object, AllowedEffects As Long)
    If Not Me.AllowEdits Then AllowedEffects = 0: Exit Sub
    If Me.lvFuente.SelectedItem Is Nothing Then Exit Sub
    
    AllowedEffects = 1 ' Copy
    Data.setData Me.lvFuente.SelectedItem.key, 1
End Sub

Private Sub tvCadena_OLEStartDrag(Data As Object, AllowedEffects As Long)
    If Not Me.AllowEdits Then AllowedEffects = 0: Exit Sub
    If Me.tvCadena.SelectedItem Is Nothing Then Exit Sub
    
    ' No mover raices
    If Left(Me.tvCadena.SelectedItem.key, 4) = "ROOT" Then AllowedEffects = 0: Exit Sub
    
    AllowedEffects = 2 ' Move
    Data.setData Me.tvCadena.SelectedItem.key, 1
End Sub

Private Sub tvCadena_OLEDragOver(Data As Object, Effect As Long, Button As Integer, Shift As Integer, x As Single, y As Single, state As Integer)
    Dim targetNode As Object
    Set targetNode = Me.tvCadena.HitTest(x, y)
    
    If Not Me.AllowEdits Then Effect = 0: Exit Sub
    
    If targetNode Is Nothing Then
        ' Permitir soltar en vacio solo si es Alta Externa (Copy) para crear raices
        If Data.GetFormat(1) Then
             If Left(Data.GetData(1), 4) = PREFIX_SRC Then Effect = 1 Else Effect = 0
        End If
        Set Me.tvCadena.DropHighlight = Nothing
    Else
        Set Me.tvCadena.DropHighlight = targetNode
        Dim sData As String
        On Error Resume Next
        sData = Data.GetData(1)
        
        If Left(sData, 4) = PREFIX_SRC Then
            Effect = 1 ' Copy
        Else
            If targetNode.key = sData Then Effect = 0 Else Effect = 2 ' Move
        End If
    End If
End Sub

Private Sub tvCadena_OLEDragDrop(Data As Object, Effect As Long, Button As Integer, Shift As Integer, x As Single, y As Single)
    Dim sourceNode As Object
    Dim targetNode As Object
    Dim sData As String
    Dim sTipoNodoDestino As String
    Dim vRelIDPadreDestino As Variant
    Dim sKeyDestino As String
    Dim bEsAltaExterna As Boolean
    Dim sRelIDMover As String
    
    On Error GoTo errores
    m_Error = ""
    
    ' Limpiar el resaltado visual
    Set Me.tvCadena.DropHighlight = Nothing
    
    ' 1. OBTENER DATOS Y CONTEXTO
    If Data.GetFormat(1) Then sData = Data.GetData(1)
    Set targetNode = Me.tvCadena.HitTest(x, y)
    
    If Left(sData, 4) = PREFIX_SRC Then
        bEsAltaExterna = True
    Else
        bEsAltaExterna = False
        Set sourceNode = Me.tvCadena.SelectedItem
        If sourceNode Is Nothing Then Exit Sub
    End If
    
    ' ---------------------------------------------------------
    ' LOGICA DE DESTINO
    ' ---------------------------------------------------------
    
    ' CASO A: ALTA EXTERNA
    If bEsAltaExterna Then
        Dim sIDSuministrador As String
        sIDSuministrador = Mid(sData, 5)
        
        ' Si soltamos en vacio o en ROOT_ORGANO -> Nivel 1
        Dim esRaiz As Boolean
        esRaiz = False
        If Not targetNode Is Nothing Then
            If targetNode.key = K_ROOT_ORGANO Then esRaiz = True
        Else
            esRaiz = True ' Vacio se asume Raiz
        End If
        
        If esRaiz Then
            sTipoNodoDestino = "ROOT_CONTR"
            vRelIDPadreDestino = Null
            sKeyDestino = K_ROOT_ORGANO
        Else
            sKeyDestino = targetNode.key
            If Left(sKeyDestino, 1) = "K" Then
                vRelIDPadreDestino = ExtraerTag(targetNode.Tag, "RELID")
                sTipoNodoDestino = "CHILD"
            End If
        End If
        
        EjecutarAlta sIDSuministrador, sTipoNodoDestino, vRelIDPadreDestino, sKeyDestino
        
    ' CASO B: MOVER INTERNO
    Else
        If targetNode Is Nothing Then Exit Sub
        If targetNode.key = sourceNode.key Then Exit Sub
        
        sRelIDMover = ExtraerTag(sourceNode.Tag, "RELID")
        sKeyDestino = targetNode.key
        
        If sKeyDestino = K_ROOT_ORGANO Then
            sTipoNodoDestino = "ROOT_CONTR"
            vRelIDPadreDestino = Null
        Else
            vRelIDPadreDestino = ExtraerTag(targetNode.Tag, "RELID")
            sTipoNodoDestino = "CHILD"
            If Not targetNode.Parent Is Nothing Then
                If targetNode.Parent.key = sourceNode.key Then Exit Sub
            End If
        End If
        
        EjecutarMovimiento sRelIDMover, sTipoNodoDestino, vRelIDPadreDestino, sKeyDestino
    End If
    
    DoCmd.Hourglass False
    Exit Sub
errores:
    DoCmd.Hourglass False
    MsgBox "Error DragDrop Nuevo: " & Err.Description, vbCritical
    RefrescarAArbol
End Sub

' ==============================================================================
' 6. BOTONES MANUALES Y MENÚ CONTEXTUAL
' ==============================================================================

Private Sub Alta()
    Dim sTipoNodo As String, vParentRelID As Variant, sNodeKey As String
    Dim iRespuesta As Integer
    Dim sIDSuministradorElegido As String
    
    If Me.tvCadena.SelectedItem Is Nothing Then
        ' Nada seleccionado -> Alta en Raiz (Organo)
        sTipoNodo = "ROOT_CONTR": vParentRelID = Null: sNodeKey = K_ROOT_ORGANO
    Else
        sNodeKey = Me.tvCadena.SelectedItem.key
        If sNodeKey = K_ROOT_ORGANO Then
            ' Seleccionado Organo -> Alta en Raiz (Organo)
            sTipoNodo = "ROOT_CONTR": vParentRelID = Null
        Else
            vParentRelID = ExtraerTag(Me.tvCadena.SelectedItem.Tag, "RELID")
            sTipoNodo = "CHILD"
        End If
    End If
    
    If Not IsNull(TempVars(TV_SELECTED_VAR)) Then TempVars.Remove TV_SELECTED_VAR
    DoCmd.OpenForm "FormSuministradoresGestion", WindowMode:=acDialog
    sIDSuministradorElegido = Nz(TempVars(TV_SELECTED_VAR), "")
    TempVars.Remove TV_SELECTED_VAR
    If sIDSuministradorElegido = "" Then Exit Sub
    
    EjecutarAlta sIDSuministradorElegido, sTipoNodo, vParentRelID, sNodeKey
End Sub

Private Sub cmdEliminar_Click()
    If Not Me.AllowEdits Then Exit Sub
    If Me.tvCadena.SelectedItem Is Nothing Then Exit Sub
    If Left(Me.tvCadena.SelectedItem.key, 4) = "ROOT" Then
        MsgBox "No se puede eliminar la raíz.", vbExclamation, "Error"
        Exit Sub
    End If
    
    If MsgBox("¿Eliminar seleccionado?", vbYesNo + vbQuestion, "Eliminar Nodo") = vbYes Then
        Dim sRelID As String
        sRelID = ExtraerTag(Me.tvCadena.SelectedItem.Tag, "RELID")
        EjecutarEliminacion sRelID
    End If
End Sub

Private Sub cmdVerDetalle_Click()
    Dim sIDSuministrador As String
    If Me.tvCadena.SelectedItem Is Nothing Then Exit Sub
    If Left(Me.tvCadena.SelectedItem.key, 4) = "ROOT" Then Exit Sub
    
    sIDSuministrador = ExtraerTag(Me.tvCadena.SelectedItem.Tag, "IDS")
    If sIDSuministrador <> "" Then
        Set m_ObjSuministradorActivo = constructor.getSuministrador(p_IDSuministrador:=sIDSuministrador)
        DoCmd.OpenForm "FormSuministrador", WindowMode:=acDialog
    End If
End Sub


Private Sub tvCadena_NodeClick(ByVal Node As Object)
    GestionarBotones Node
End Sub

Private Sub GestionarBotones(ByVal Node As Object)
    Dim esRaiz As Boolean, haySel As Boolean
    haySel = Not (Node Is Nothing)
    If haySel Then esRaiz = (Left(Node.key, 4) = "ROOT")
    
    
    Me.cmdEliminar.Enabled = (haySel And Not esRaiz And Me.AllowEdits)
    Me.cmdVerDetalle.Enabled = (haySel And Not esRaiz)
End Sub

Private Sub MostrarMenuContextual(TIpo As String, ObjetoSeleccionado As Object)
    ' Este sub delega en MenuContextual.bas via EjecutarAccionMenu
    ' Copia la versión con Dispatcher que te di anteriormente
    Dim cBar As Object, btn As Object, sBarName As String
    On Error Resume Next
    sBarName = "CtxMenuExp"
    Application.CommandBars(sBarName).Delete
    On Error GoTo errores
    Set cBar = Application.CommandBars.Add(sBarName, 5, False, True)
    
    If TIpo = "ARBOL" Then
        Dim esRaiz As Boolean: esRaiz = (Left(ObjetoSeleccionado.key, 4) = "ROOT")
        If Not esRaiz Then
             Set btn = cBar.Controls.Add(1): btn.Caption = "Ver Detalle": btn.FaceId = 995: btn.OnAction = "=EjecutarAccionMenu('Public_VerDetalleArbol')"
        End If
        If Me.AllowEdits Then
             Set btn = cBar.Controls.Add(1): btn.Caption = "Añadir Aquí...": btn.FaceId = 21: btn.OnAction = "=EjecutarAccionMenu('Public_Alta')"
             If Not esRaiz Then
                 Set btn = cBar.Controls.Add(1): btn.Caption = "Eliminar": btn.FaceId = 478: btn.OnAction = "=EjecutarAccionMenu('Public_EliminarDelArbol')"
             End If
        End If
    ElseIf TIpo = "LISTA" Then
        Set btn = cBar.Controls.Add(1): btn.Caption = "Ver Ficha": btn.FaceId = 995: btn.OnAction = "=EjecutarAccionMenu('Public_VerDetalleLista')"
        If Me.AllowEdits Then
            Set btn = cBar.Controls.Add(1): btn.Caption = "Añadir al Expediente...": btn.FaceId = 265: btn.OnAction = "=EjecutarAccionMenu('Public_AnadirDesdeLista')"
        End If
    End If
    If cBar.Controls.Count > 0 Then cBar.ShowPopup
    cBar.Delete
    Exit Sub
errores:
    MsgBox Err.Description, vbCritical, "Error"
End Sub

' ==============================================================================
' 7. FUNCIONES PÚBLICAS (DISPATCHER)
' ==============================================================================

Public Function Public_Alta()
    Alta
End Function
Public Function Public_EliminarDelArbol()
    cmdEliminar_Click
End Function
Public Function Public_VerDetalleArbol()
    cmdVerDetalle_Click
End Function
Public Function Public_VerDetalleLista()
    ' Ver detalle desde lista
    Dim sKey As String, sID As String
    If Me.lvFuente.SelectedItem Is Nothing Then Exit Function
    sKey = Me.lvFuente.SelectedItem.key
    If Left(sKey, 4) = PREFIX_SRC Then
        sID = Mid(sKey, 5)
        Set m_ObjSuministradorActivo = constructor.getSuministrador(p_IDSuministrador:=sID)
        DoCmd.OpenForm "FormSuministrador", WindowMode:=acDialog
    End If
End Function
Public Function Public_AnadirComoAdjudicatario()
    If Me.lvFuente.SelectedItem Is Nothing Then Exit Function
    EjecutarAlta Mid(Me.lvFuente.SelectedItem.key, 5), "ROOT_CONTR", Null, K_ROOT_ORGANO
End Function
Public Function Public_AnadirDesdeLista()
    Dim sID As String
    If Me.lvFuente.SelectedItem Is Nothing Then Exit Function
    
    sID = Mid(Me.lvFuente.SelectedItem.key, 5)
    EjecutarAlta sID, "ROOT_CONTR", Null, K_ROOT_ORGANO
End Function

' ==============================================================================
' 8. HELPERS INTERNOS
' ==============================================================================

Private Function ObtenerNombreEmpresa(p_ID As String) As String
    Dim oSum As Suministrador
    Set oSum = constructor.getSuministrador(p_IDSuministrador:=p_ID)
    If Not oSum Is Nothing Then
        If oSum.Nemotecnico <> "" Then ObtenerNombreEmpresa = oSum.Nemotecnico Else ObtenerNombreEmpresa = oSum.Nombre
    Else
        ObtenerNombreEmpresa = "ID:" & p_ID
    End If
End Function

Private Function ExtraerTag(ByVal tagText As String, ByVal keyName As String) As String
    Dim parts() As String, i As Long, kv() As String
    ExtraerTag = ""
    parts = Split(tagText, ";")
    For i = LBound(parts) To UBound(parts)
        kv = Split(parts(i), "=")
        If UBound(kv) >= 1 Then
            If UCase(Trim(kv(0))) = UCase(Trim(keyName)) Then
                ExtraerTag = Trim(kv(1))
                Exit Function
            End If
        End If
    Next
End Function
Private Sub cmdNuevoSuministrador_Click()
    On Error GoTo errores
    
    ' 1. Reseteamos la variable global para indicar al formulario destino que es un ALTA NUEVA
    Set m_ObjSuministradorActivo = Nothing
    
    ' 2. Abrimos el formulario en modo normal (NO DIÁLOGO) para poder capturar eventos
    ' Si lo abres en modo acDialog, el código se detiene y no podemos setear la variable m_FormAltaSuministrador
    If FormularioAbierto("FormSuministrador") Then
        DoCmd.Close acForm, "FormSuministrador", acSaveNo
    End If
    
    DoCmd.OpenForm "FormSuministrador"
    
    ' 3. Vinculamos la instancia abierta a nuestra variable con eventos
    Set m_FormAltaSuministrador = Forms("FormSuministrador")
    
    Exit Sub
errores:
    MsgBox "Error al abrir alta de suministrador: " & Err.Description, vbCritical, "Error"
End Sub
Private Sub m_FormAltaSuministrador_Alta(p_ID As String)
    ' Este evento salta cuando el usuario guarda correctamente en FormSuministrador
    Dim oSum As Suministrador
    Dim sNombreFiltro As String
    
    On Error GoTo errores
    
    ' 1. Recuperamos los datos del suministrador recién creado usando el ID que nos devuelve el evento
    Set oSum = constructor.getSuministrador(p_IDSuministrador:=p_ID)
    
    If Not oSum Is Nothing Then
        ' Preferimos el Nombre para el filtro visual
        sNombreFiltro = oSum.Nombre
        
        ' 2. Actualizamos los controles de filtro según tus requisitos
        Me.chkNuestras.value = False      ' Desmarcar "Nuestras empresas"
        Me.txtFiltro.value = sNombreFiltro ' Poner el nombre en el cuadro de texto
        Me.txtFiltro.SetFocus             ' Foco al filtro (opcional, por usabilidad)
        
        ' 3. Refrescamos la lista de la derecha explícitamente
        ' (Asignar valor por código a un textbox no dispara el evento _Change, por eso llamamos a la funcion manual)
        CargarListaFuente sNombreFiltro, False
    End If
    
    ' 4. Limpiamos la referencia
    Set m_FormAltaSuministrador = Nothing
    
    Exit Sub
errores:
    MsgBox "Error al procesar el alta del suministrador: " & Err.Description, vbExclamation, "Error"
End Sub
Private Sub ActualizarEtiquetaSituacion()
    Dim bSomosPrincipal As Boolean
    
    On Error Resume Next
    

    ' --- MODO BD ---
    ' Delegamos en el servicio/repositorio que ya tiene esta consulta optimizada
    bSomosPrincipal = m_Servicio.YaSomosAdjudicatarios(m_IDExpediente)
   
    
   
    ' Sincronizar el objeto expediente en memoria para que otras partes de la app lo sepan
    If Not m_ObjExpedienteDTOActivo.Expediente Is Nothing Then
        m_ObjExpedienteDTOActivo.Expediente.ContratistaPrincipal = IIf(bSomosPrincipal, "Sí", "No")
    End If
End Sub




' ==============================================================================
' 5. LOGICA UNIFICADA DE PERSISTENCIA (BD vs MEMORIA)
' ==============================================================================

Private Sub EjecutarAlta(sIDS As String, sTipo As String, vPadre As Variant, sKeyDest As String)
    Dim exito As Boolean
    VBA.DoEvents
    DoCmd.Hourglass True
    
    
        ' Base de Datos
    exito = m_Servicio.AgregarSuministrador(m_ObjExpedienteDTOActivo.Expediente, sIDS, sTipo, vPadre, m_Error)
    
    
    If exito Then
        RefrescarAArbol
        On Error Resume Next
        If sKeyDest <> "" Then Me.tvCadena.Nodes(sKeyDest).Expanded = True
    Else
        MsgBox "Error Alta: " & m_Error, vbCritical, "Error"
    End If
    DoCmd.Hourglass False
End Sub

Private Sub EjecutarMovimiento(sRelID As String, sTipo As String, vPadre As Variant, sKeyDest As String)
    Dim exito As Boolean
    VBA.DoEvents
    DoCmd.Hourglass True
    
    
    ' Base de Datos
    exito = m_Servicio.MoverRelacion(m_ObjExpedienteDTOActivo.Expediente, sRelID, sTipo, vPadre, m_Error)
    
    
    If exito Then
        RefrescarAArbol
        On Error Resume Next
        Me.tvCadena.Nodes(sKeyDest).Expanded = True
    Else
        MsgBox "Error Mover: " & m_Error, vbCritical, "Error"
    End If
    DoCmd.Hourglass False
End Sub

Private Sub EjecutarEliminacion(sRelID As String)
    Dim exito As Boolean
    VBA.DoEvents
    DoCmd.Hourglass True
    
   
    If m_Servicio.TieneHijos(sRelID) Then
        m_Error = "Tiene dependencias."
        exito = False
    Else
        exito = m_Servicio.EliminarRelacion(m_ObjExpedienteDTOActivo.Expediente, sRelID, m_Error)
    End If
   
    
    If exito Then
        ' Eliminación visual rápida
        On Error Resume Next
        Me.tvCadena.Nodes.Remove Me.tvCadena.SelectedItem.key
        GestionarBotones Nothing
    Else
        MsgBox "Error Eliminar: " & m_Error, vbCritical, "Error"
    End If
    DoCmd.Hourglass False
End Sub

' --- FUNCIONES AUXILIARES PARA MEMORIA (DTO) ---

Private Function AgregarSuministradorMemoria(sIDS As String, sTipo As String, vPadre As Variant) As Boolean
    Dim newItem As ExpedienteSuministrador
    Dim sTempID As String
    
    On Error GoTo errMem
    ' Generar ID temporal único
    sTempID = "TMP_" & Format(Now, "hhmmss") & "_" & Int(Rnd * 10000)
    
    Set newItem = New ExpedienteSuministrador
    With newItem
        .IDExpedienteSuministrador = sTempID
        .IDSuministrador = sIDS
        .IdPadre = vPadre
        .Tag = sTempID ' Marca
        Select Case sTipo
            Case "ROOT_CONTR": .ContratistaPrincipal = "Sí": .SubContratista = "No": .Descripcon = "Contratista Ppal"
            Case "CHILD": .ContratistaPrincipal = "No": .SubContratista = "Sí": .Descripcon = "Subcontrata"
            Case Else: Err.Raise 1000
        End Select
    End With
    
    m_ObjExpedienteDTOActivo.ColArbolSuministradores.Add sTempID, newItem
    AgregarSuministradorMemoria = True
    Exit Function
errMem:
    m_Error = Err.Description
End Function

Private Function MoverRelacionMemoria(sRelID As String, sTipo As String, vPadre As Variant) As Boolean
    Dim item As ExpedienteSuministrador
    On Error GoTo errMem
    
    If m_ObjExpedienteDTOActivo.ColArbolSuministradores.exists(sRelID) Then
        Set item = m_ObjExpedienteDTOActivo.ColArbolSuministradores(sRelID)
        item.IdPadre = vPadre
        Select Case sTipo
            Case "ROOT_CONTR": item.ContratistaPrincipal = "Sí": item.SubContratista = "No"
            Case "CHILD": item.ContratistaPrincipal = "No": item.SubContratista = "Sí"
            Case Else: Err.Raise 1000
        End Select
        MoverRelacionMemoria = True
    Else
        m_Error = "Elemento no encontrado en memoria."
        MoverRelacionMemoria = False
    End If
    Exit Function
errMem:
    m_Error = Err.Description
    MoverRelacionMemoria = False
End Function

Private Function EliminarRelacionMemoria(sRelID As String) As Boolean
    ' Verificar hijos en memoria
    Dim k As Variant
    Dim TieneHijos As Boolean
    TieneHijos = False
    For Each k In m_ObjExpedienteDTOActivo.ColArbolSuministradores.keys
        If m_ObjExpedienteDTOActivo.ColArbolSuministradores(k).IdPadre = sRelID Then
            TieneHijos = True
            Exit For
        End If
    Next
    
    If TieneHijos Then
        EliminarRelacionMemoria = False
    Else
        If m_ObjExpedienteDTOActivo.ColArbolSuministradores.exists(sRelID) Then
            m_ObjExpedienteDTOActivo.ColArbolSuministradores.Remove sRelID
            EliminarRelacionMemoria = True
        End If
    End If
End Function

