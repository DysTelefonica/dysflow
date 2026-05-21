Option Compare Database
Option Explicit
Public Event AltaExpediente(m_expediente As Expediente)

' Variables para formularios auxiliares
Private WithEvents m_FormClasificacion As Form_FormGradoClasificacion
Private WithEvents m_ForContratista As Form_FormSuministrador
Private WithEvents m_ForSubContratista As Form_FormSuministrador
Private WithEvents m_FormLugar As Form_FormLugarEjecucion

Private m_Error As String

' ==============================================================================
' INICIO Y CIERRE
' ==============================================================================

Private Sub Form_Load()
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    m_Error = ""
    Ajustar Me
    Me.AllowEdits = True
    
    ' Inicializar la colección del árbol si no existe (para Alta en memoria)
    If m_ObjExpedienteDTOActivo.ColArbolSuministradores Is Nothing Then
        Set m_ObjExpedienteDTOActivo.ColArbolSuministradores = New Scripting.Dictionary
        m_ObjExpedienteDTOActivo.ColArbolSuministradores.CompareMode = TextCompare
    End If
    
    EstablecerDatos m_Error
    If m_Error <> "" Then Err.Raise 1000
    
    VBA.DoEvents
    DoCmd.Hourglass False
    Exit Sub
errores:
    DoCmd.Hourglass False
    MsgBox "Error al cargar Alta HPS: " & Err.Description, vbCritical
    DoCmd.Close acForm, Me.Name, acSaveNo
End Sub

Private Sub cmdSalir_Click()
    DoCmd.Close acForm, Me.Name, acSaveNo
End Sub

' ==============================================================================
' GESTIÓN DE DATOS Y COMBOS
' ==============================================================================

Public Function EstablecerDatos(Optional ByRef p_Error As String) As String
    On Error GoTo errores
    
    If m_ObjExpedienteDTOActivo Is Nothing Then
        p_Error = "Contexto perdido (DTO Nothing)"
        Err.Raise 1000
    End If
    
    EstablecerCombos p_Error
    If p_Error <> "" Then Err.Raise 1000
    
    ' Rellenar las listas visuales leyendo de la colección unificada en memoria
    RellenarListaContratistas
    RellenarListaSubContratistas
    RellenarListaLugares
    
    Exit Function
errores:
    p_Error = Err.Description
End Function

Public Function EstablecerCombos(Optional ByRef p_Error As String) As String
    Dim cmb As ComboBox
    Dim m_ID As Variant
    Dim m_Col As Scripting.Dictionary
    
    On Error GoTo errores
    
    ' 1. Clasificaciones
    Set cmb = Me.IdGradoClasificacion
    cmb.RowSource = ""
    Set m_Col = m_ObjEntorno.GradosClasificaciones
    If Not m_Col Is Nothing Then
        Dim m_Clasif As GradoClasificacion
        For Each m_ID In m_Col
            Set m_Clasif = m_Col(m_ID)
            cmb.AddItem m_Clasif.IdGradoClasificacion & ";" & m_Clasif.GradoClasificacion
        Next
    End If
    
    ' 2. Suministradores (Para combos de selección)
    Set m_Col = m_ObjEntorno.Suministradores
    Me.Contratistas.RowSource = ""
    Me.SubContratistas.RowSource = ""
    
    If Not m_Col Is Nothing Then
        Dim m_Sum As Suministrador
        For Each m_ID In m_Col
            Set m_Sum = m_Col(m_ID)
            ' Llenamos ambos combos
            Me.Contratistas.AddItem m_Sum.IDSuministrador & ";" & m_Sum.Nombre
            Me.SubContratistas.AddItem m_Sum.IDSuministrador & ";" & m_Sum.Nombre
        Next
    End If
    
    ' 3. Lugares
    Me.ListaLugaresEjecucion.RowSource = ""
    Me.LugaresEjecucion.RowSource = ""
    Set m_Col = m_ObjEntorno.LugaresEjecucion
    If Not m_Col Is Nothing Then
        Dim m_Lugar As LugarEjecucion
        For Each m_ID In m_Col
            Set m_Lugar = m_Col(m_ID)
            Me.LugaresEjecucion.AddItem m_Lugar.IDLugarEjecucion & ";" & m_Lugar.LugarEjecucion
        Next
    End If
    
    Exit Function
errores:
    p_Error = Err.Description
End Function

' ==============================================================================
' RELLENO DE LISTAS VISUALES (ADAPTADOR DTO -> UI)
' ==============================================================================

Public Sub RellenarListaContratistas()
    ' Recorre el árbol unificado y muestra solo los ROOT_CONTR
    Dim k As Variant
    Dim item As ExpedienteSuministrador
    Dim oSum As Suministrador
    
    Me.ListaContratistas.RowSource = ""
    
    If m_ObjExpedienteDTOActivo.ColArbolSuministradores Is Nothing Then Exit Sub
    
    For Each k In m_ObjExpedienteDTOActivo.ColArbolSuministradores.keys
        Set item = m_ObjExpedienteDTOActivo.ColArbolSuministradores(k)
        
        ' Criterio: Es Contratista Principal
        If item.ContratistaPrincipal = "Sí" Then
            Set oSum = constructor.getSuministrador(p_IDSuministrador:=item.IDSuministrador)
            If Not oSum Is Nothing Then
                Me.ListaContratistas.AddItem item.IDSuministrador & ";" & oSum.Nombre
            End If
        End If
    Next
End Sub

Public Sub RellenarListaSubContratistas()
    ' Recorre el árbol unificado y muestra solo los ROOT_SUB
    Dim k As Variant
    Dim item As ExpedienteSuministrador
    Dim oSum As Suministrador
    
    Me.ListaSubContratistas.RowSource = ""
    
    If m_ObjExpedienteDTOActivo.ColArbolSuministradores Is Nothing Then Exit Sub
    
    For Each k In m_ObjExpedienteDTOActivo.ColArbolSuministradores.keys
        Set item = m_ObjExpedienteDTOActivo.ColArbolSuministradores(k)
        
        ' Criterio: Es Subcontratista Y NO tiene padre (Nivel 1 / Participación Telefónica)
        If item.SubContratista = "Sí" And (IsNull(item.IdPadre) Or item.IdPadre = "") Then
            Set oSum = constructor.getSuministrador(p_IDSuministrador:=item.IDSuministrador)
            If Not oSum Is Nothing Then
                Me.ListaSubContratistas.AddItem item.IDSuministrador & ";" & oSum.Nombre
            End If
        End If
    Next
End Sub

Public Sub RellenarListaLugares()
    ' Lugares sigue funcionando como colección simple en el DTO
    Dim k As Variant
    Dim item As LugarEjecucion
    
    Me.ListaLugaresEjecucion.RowSource = ""
    If m_ObjExpedienteDTOActivo.ColLugaresEjecucion Is Nothing Then Exit Sub
    
    For Each k In m_ObjExpedienteDTOActivo.ColLugaresEjecucion.keys
        Set item = m_ObjExpedienteDTOActivo.ColLugaresEjecucion(k)
        Me.ListaLugaresEjecucion.AddItem item.IDLugarEjecucion & ";" & item.LugarEjecucion
    Next
End Sub

' ==============================================================================
' BOTONES DE ACCIÓN - CONTRATISTAS (ROOT_CONTR)
' ==============================================================================

Private Sub ComandoAltaContratista_Click()
    Dim sIDSuministrador As String
    
    On Error GoTo errores
    sIDSuministrador = Nz(Me.Contratistas.Column(0), "")
    If sIDSuministrador = "" Then Exit Sub
    
    ' Añadir a la colección unificada en memoria como CONTRATISTA PRINCIPAL
    AgregarSuministradorMemoria sIDSuministrador, "ROOT_CONTR"
    
    RellenarListaContratistas
    Me.Contratistas = Null
    Exit Sub
errores:
    MsgBox "Error: " & Err.Description
End Sub

Private Sub ComandoEliminarContratista_Click()
    Dim sIDSuministrador As String
    
    On Error GoTo errores
    sIDSuministrador = Nz(Me.ListaContratistas.Column(0), "")
    If sIDSuministrador = "" Then Exit Sub
    
    ' Eliminar de la colección unificada buscando por ID y Rol
    EliminarSuministradorMemoria sIDSuministrador, "ROOT_CONTR"
    
    RellenarListaContratistas
    Exit Sub
errores:
    MsgBox "Error: " & Err.Description
End Sub

' ==============================================================================
' BOTONES DE ACCIÓN - SUBCONTRATISTAS (ROOT_SUB)
' ==============================================================================

Private Sub ComandoAltaSubContratista_Click()
    Dim sIDSuministrador As String
    
    On Error GoTo errores
    sIDSuministrador = Nz(Me.SubContratistas.Column(0), "")
    If sIDSuministrador = "" Then Exit Sub
    
    ' Añadir a la colección unificada como SUBCONTRATA DIRECTA (Participación)
    AgregarSuministradorMemoria sIDSuministrador, "ROOT_SUB"
    
    RellenarListaSubContratistas
    Me.SubContratistas = Null
    Exit Sub
errores:
    MsgBox "Error: " & Err.Description
End Sub

Private Sub ComandoEliminarSubContratista_Click()
    Dim sIDSuministrador As String
    
    On Error GoTo errores
    sIDSuministrador = Nz(Me.ListaSubContratistas.Column(0), "")
    If sIDSuministrador = "" Then Exit Sub
    
    EliminarSuministradorMemoria sIDSuministrador, "ROOT_SUB"
    
    RellenarListaSubContratistas
    Exit Sub
errores:
    MsgBox "Error: " & Err.Description
End Sub

' ==============================================================================
' LÓGICA DE MEMORIA (DTO) - Helpers
' ==============================================================================

Private Sub AgregarSuministradorMemoria(sIDSum As String, sTipo As String)
    Dim newItem As ExpedienteSuministrador
    Dim sTempID As String
    
    ' Evitar duplicados simples (opcional pero recomendado)
    Dim k As Variant, item As ExpedienteSuministrador
    For Each k In m_ObjExpedienteDTOActivo.ColArbolSuministradores.keys
        Set item = m_ObjExpedienteDTOActivo.ColArbolSuministradores(k)
        If item.IDSuministrador = sIDSum Then
            MsgBox "Esta empresa ya está en la lista.", vbExclamation
            Exit Sub
        End If
    Next
    
    ' Generar ID temporal único
    sTempID = "TMP_" & Format(Now, "hhmmss") & "_" & Int(Rnd * 10000)
    
    Set newItem = New ExpedienteSuministrador
    With newItem
        .IDExpedienteSuministrador = sTempID
        .IDSuministrador = sIDSum
        .IdPadre = Null ' En este formulario plano, siempre son raíces
        .Tag = sTempID  ' Para que el servicio de persistencia sepa mapearlo
        
        Select Case sTipo
            Case "ROOT_CONTR"
                .ContratistaPrincipal = "Sí"
                .SubContratista = "No"
                .Descripcon = "Contratista Principal"
            Case "ROOT_SUB"
                .ContratistaPrincipal = "No"
                .SubContratista = "Sí"
                .Descripcon = "Participación Telefónica (HPS)"
        End Select
    End With
    
    m_ObjExpedienteDTOActivo.ColArbolSuministradores.Add sTempID, newItem
End Sub

Private Sub EliminarSuministradorMemoria(sIDSum As String, sTipoBusqueda As String)
    Dim k As Variant
    Dim item As ExpedienteSuministrador
    Dim keyToDelete As String
    
    If m_ObjExpedienteDTOActivo.ColArbolSuministradores Is Nothing Then Exit Sub
    
    For Each k In m_ObjExpedienteDTOActivo.ColArbolSuministradores.keys
        Set item = m_ObjExpedienteDTOActivo.ColArbolSuministradores(k)
        
        If item.IDSuministrador = sIDSum Then
            ' Verificar si coincide el tipo para borrar el correcto (por seguridad)
            Dim bMatch As Boolean
            bMatch = False
            If sTipoBusqueda = "ROOT_CONTR" And item.ContratistaPrincipal = "Sí" Then bMatch = True
            If sTipoBusqueda = "ROOT_SUB" And item.SubContratista = "Sí" Then bMatch = True
            
            If bMatch Then
                keyToDelete = k
                Exit For
            End If
        End If
    Next
    
    If keyToDelete <> "" Then
        m_ObjExpedienteDTOActivo.ColArbolSuministradores.Remove keyToDelete
    End If
End Sub

' ==============================================================================
' GESTIÓN DE LUGARES (DTO existente, sin cambios)
' ==============================================================================

Private Sub ComandoAltaLugarEjecucion_Click()
    Dim sIDLugar As String
    Dim oLugar As LugarEjecucion
    
    sIDLugar = Nz(Me.LugaresEjecucion.Column(0), "")
    If sIDLugar = "" Then Exit Sub
    
    Set oLugar = constructor.getLugarEjecucion(p_IDLugarEjecucion:=sIDLugar)
    If oLugar Is Nothing Then Exit Sub
    
    If m_ObjExpedienteDTOActivo.ColLugaresEjecucion Is Nothing Then
        Set m_ObjExpedienteDTOActivo.ColLugaresEjecucion = New Scripting.Dictionary
    End If
    
    If Not m_ObjExpedienteDTOActivo.ColLugaresEjecucion.exists(sIDLugar) Then
        m_ObjExpedienteDTOActivo.ColLugaresEjecucion.Add sIDLugar, oLugar
        RellenarListaLugares
    End If
    Me.LugaresEjecucion = Null
End Sub

Private Sub ComandoEliminarLugarEjecucion_Click()
    Dim sIDLugar As String
    sIDLugar = Nz(Me.ListaLugaresEjecucion.Column(0), "")
    If sIDLugar = "" Then Exit Sub
    
    If Not m_ObjExpedienteDTOActivo.ColLugaresEjecucion Is Nothing Then
        If m_ObjExpedienteDTOActivo.ColLugaresEjecucion.exists(sIDLugar) Then
            m_ObjExpedienteDTOActivo.ColLugaresEjecucion.Remove sIDLugar
            RellenarListaLugares
        End If
    End If
End Sub

' ==============================================================================
' GUARDADO
' ==============================================================================

Private Sub ComandoRegistrar_Click()
    Dim m_ExpOp As ExpedienteOperaciones
    
    On Error GoTo errores
    m_Error = ""
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    MostrarPopupProgreso "Procesando...", "Guardando..."
    
    ' 1. Rellenar campos de texto del formulario al DTO
    SetDTOFromForm
    
    ' 2. Configurar flags específicos de HPS
    With m_ObjExpedienteDTOActivo.Expediente
        .Ambito = "HPS"
        .HPSAplica = "Sí"
        .POSTAGEDO = "Sí"
        .TIpo = "Expediente Sólo para HPS"
    End With

    ' 3. Llamada al Registrar Transaccional (Generic)
    ' Este método guardará la cabecera Y el árbol que hemos montado en ColArbolSuministradores
    Set m_ExpOp = New ExpedienteOperaciones
    m_ExpOp.Registrar m_ObjExpedienteDTOActivo, Nothing, m_Error
    
    If m_Error <> "" Then Err.Raise 1000
    
    ' 4. Finalizar
    RaiseEvent AltaExpediente(m_ObjExpedienteDTOActivo.Expediente)
    
    VBA.DoEvents
    CerrarPopupProgreso
    VBA.DoEvents
    DoCmd.Hourglass False
    DoCmd.Close acForm, Me.Name, acSaveNo
    Exit Sub
    
errores:
    VBA.DoEvents
    CerrarPopupProgreso
    VBA.DoEvents
    DoCmd.Hourglass False
    MsgBox "Error al registrar: " & m_Error, vbCritical
End Sub

Private Function SetDTOFromForm()
    With m_ObjExpedienteDTOActivo.Expediente
        .Titulo = Nz(Me.Titulo, "")
        .Nemotecnico = Nz(Me.Nemotecnico, "")
        .CodExp = Nz(Me.CodExp, "")
        .IdGradoClasificacion = Nz(Me.IdGradoClasificacion.Column(0), "")
        .Observaciones = Nz(Me.Observaciones, "")
    End With
End Function

' ==============================================================================
' EVENTOS UX / HELPERS
' ==============================================================================

Private Sub Contratistas_AfterUpdate()
    ComandoAltaContratista_Click
End Sub
Private Sub SubContratistas_AfterUpdate()
    ComandoAltaSubContratista_Click
End Sub
Private Sub LugaresEjecucion_AfterUpdate()
    ComandoAltaLugarEjecucion_Click
End Sub

' Retorno de formularios auxiliares de alta rápida
Private Sub m_ForContratista_Alta(p_ID As String)
    EstablecerCombos
    Me.Contratistas = p_ID
    ComandoAltaContratista_Click
End Sub
Private Sub m_ForSubContratista_Alta(p_ID As String)
    EstablecerCombos
    Me.SubContratistas = p_ID
    ComandoAltaSubContratista_Click
End Sub
Private Sub m_FormLugar_Alta()
    EstablecerCombos
End Sub