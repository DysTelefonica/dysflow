VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "ExpedienteSuministradorServicio"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
Option Compare Database
Option Explicit

' ==============================================================================
' SERVICIO: Gestión de Suministradores (Lógica "El Árbol Manda")
' ==============================================================================

Public Function AgregarSuministrador( _
                                    p_ExpedienteObj As Expediente, _
                                    p_IDSuministrador As String, _
                                    p_TipoNodo As String, _
                                    p_IDRelacionPadre As Variant, _
                                    Optional ByRef p_Error As String) As Boolean

    Dim ws As DAO.Workspace, db As DAO.Database
    Dim m_ExpSum As ExpedienteSuministrador
    Dim m_ExpOp As ExpedienteOperaciones
    
    On Error GoTo errores
    
    ' 1. Validaciones básicas
    If p_ExpedienteObj Is Nothing Then Err.Raise 1000, , "Contexto de expediente nulo."
    If p_IDSuministrador = "" Then Err.Raise 1000, , "Falta el ID del suministrador."
    
    ' REGLA: Comprobar si ya existe la empresa BAJO EL MISMO PADRE en este expediente
    ' (Usamos la función del Repositorio que añadimos antes)
    If ExpedienteSuministradorRepositorio.ExisteSuministradorBajoPadre(p_ExpedienteObj.IDExpediente, p_IDSuministrador, p_IDRelacionPadre) Then
        p_Error = "Esta empresa ya está vinculada directamente a este nivel."
        Err.Raise 1000
    End If
    
    ' Regla estructural: En Participación Telefónica solo empresas propias
    If p_TipoNodo = "ROOT_SUB" Then
        If Not EsEmpresaDelConsorcio(p_IDSuministrador) Then
            p_Error = "En esta rama solo se admiten empresas del Consorcio (TDE, TSOL, etc.)."
            Err.Raise 1000
        End If
    End If

    ' 2. Crear objeto de relación
    Set m_ExpSum = New ExpedienteSuministrador
    With m_ExpSum
        .IDExpediente = p_ExpedienteObj.IDExpediente
        .IDSuministrador = p_IDSuministrador
        .IDExpedienteSuministrador = .IDExpedienteSuministradorCalculado
        
        Select Case p_TipoNodo
            Case "ROOT_CONTR": .ContratistaPrincipal = "Sí": .SubContratista = "No": .Descripcon = "Adjudicatario"
            Case "ROOT_SUB":   .ContratistaPrincipal = "No": .SubContratista = "Sí": .Descripcon = "Participación Telefónica"
            Case "CHILD":      .ContratistaPrincipal = "No": .SubContratista = "Sí": .Descripcon = "Subcontratista"
        End Select
    End With

    ' 3. Persistencia Transaccional
    Set ws = DBEngine.Workspaces(0)
    Set db = getdb()
    ws.BeginTrans
    
    ' Insertar la relación
    ExpedienteSuministradorRepositorio.InsertarRelacion m_ExpSum, p_IDRelacionPadre, db
    
    ' Sincronizar cabecera y caché
    RecalcularFlagContratistaPrincipal p_ExpedienteObj.IDExpediente, db
    Set m_ExpOp = New ExpedienteOperaciones
    Set m_ExpOp.Expediente = p_ExpedienteObj
    m_ExpOp.RegistrarExpEntidades p_Error, db
    If p_Error <> "" Then Err.Raise 1000
    
    ws.CommitTrans
    
    RegistrarUltimoCambio p_Expediente:=p_ExpedienteObj
    AgregarSuministrador = True
    Exit Function

errores:
    If Not ws Is Nothing Then On Error Resume Next: ws.Rollback
    p_Error = "Error en AgregarSuministrador: " & Err.Description
    AgregarSuministrador = False
End Function

Public Function MoverRelacion( _
    p_ExpedienteObj As Expediente, _
    p_IDRelacionMover As String, _
    p_TipoNodoDestino As String, _
    p_IDRelacionPadreDestino As Variant, _
    Optional ByRef p_Error As String) As Boolean

    Dim ws As DAO.Workspace, db As DAO.Database
    Dim m_ExpOp As ExpedienteOperaciones
    Dim sEsContr As String, sEsSub As String
    Dim sIDSum As String
    
    On Error GoTo errores
    
    If p_IDRelacionMover = "" Then Err.Raise 1000
    If CStr(p_IDRelacionMover) = CStr(Nz(p_IDRelacionPadreDestino, "")) Then Err.Raise 1000
    
    ' Validaciones de Negocio
    sIDSum = ObtenerIDSuministradorDeRelacion(p_IDRelacionMover)
    If p_TipoNodoDestino = "ROOT_SUB" And Not EsEmpresaDelConsorcio(sIDSum) Then
        p_Error = "Solo empresas del consorcio pueden ir a 'Participación Telefónica'."
        Err.Raise 1000
    End If

    Select Case p_TipoNodoDestino
        Case "ROOT_CONTR": sEsContr = "Sí": sEsSub = "No": p_IDRelacionPadreDestino = Null
        Case "ROOT_SUB": sEsContr = "No": sEsSub = "Sí": p_IDRelacionPadreDestino = Null
        Case "CHILD": sEsContr = "No": sEsSub = "Sí"
    End Select

    Set ws = DBEngine.Workspaces(0)
    Set db = getdb()
    ws.BeginTrans
    
    ' A) Mover
    ExpedienteSuministradorRepositorio.ActualizarPadreRelacion p_IDRelacionMover, p_IDRelacionPadreDestino, sEsContr, sEsSub, db
    
    ' B) Recalcular Cabecera
    RecalcularFlagContratistaPrincipal p_ExpedienteObj.IDExpediente, db
    
    ' C) Caché
    Set m_ExpOp = New ExpedienteOperaciones
    Set m_ExpOp.Expediente = p_ExpedienteObj
    m_ExpOp.RegistrarExpEntidades p_Error, db, EnumAmbitoActualizacion.Suministradores
    If p_Error <> "" Then Err.Raise 1000
    
    ws.CommitTrans
    
    RegistrarUltimoCambio p_Expediente:=p_ExpedienteObj
    MoverRelacion = True
    
    Set db = Nothing: Set ws = Nothing
    Exit Function

errores:
    If Err.Number <> 1000 Then p_Error = "Error Mover: " & Err.Description
    If Not ws Is Nothing Then
        On Error Resume Next
        ws.Rollback
    End If
    
    MoverRelacion = False
End Function

Public Function MoverConsorcioCompleto( _
    p_ExpedienteObj As Expediente, _
    p_DestinoRoot As String, _
    Optional ByRef p_Error As String) As Boolean
    
    ' Mueve TODAS las empresas propias de una raíz a la otra en bloque
    Dim ws As DAO.Workspace, db As DAO.Database
    Dim rs As DAO.Recordset
    Dim m_ExpOp As ExpedienteOperaciones
    Dim sEsContr As String, sEsSub As String
    Dim bOrigenEsPrincipal As Boolean
    
    ' Colección para guardar los IDs en memoria y cerrar el RS antes de la transacción
    Dim colIDsParaMover As New Collection
    Dim vIDRelacion As Variant
    
    On Error GoTo errores
    
    ' 1. Configurar Roles Destino
    If p_DestinoRoot = "ROOT_CONTR" Then
        sEsContr = "Sí": sEsSub = "No"
        bOrigenEsPrincipal = False ' Movemos DESDE Sub HACIA Principal
    Else
        sEsContr = "No": sEsSub = "Sí"
        bOrigenEsPrincipal = True ' Movemos DESDE Principal HACIA Sub
    End If
    
    ' 2. LECTURA (Fuera de transacción)
    ' Obtener los IDs de relación a mover
    Set rs = ExpedienteSuministradorRepositorio.GetRelacionesPropiasEnRaiz(p_ExpedienteObj.IDExpediente, bOrigenEsPrincipal)
    
    If rs.EOF Then
        p_Error = "No se encontraron empresas del consorcio para mover."
        rs.Close: Exit Function
    End If
    
    ' 3. CARGA EN MEMORIA Y CIERRE (Vital para evitar bloqueos)
    Do While Not rs.EOF
        colIDsParaMover.Add CStr(rs!IDExpedienteSuministrador)
        rs.MoveNext
    Loop
    rs.Close ' <--- CERRAMOS EL RECORDSET AQUÍ, ANTES DE LA TRANSACCIÓN
    Set rs = Nothing
    
    ' 4. TRANSACCIÓN (Solo Escritura)
    Set ws = DBEngine.Workspaces(0)
    Set db = getdb()
    ws.BeginTrans
    
    ' Recorrer la colección en memoria y actualizar
    For Each vIDRelacion In colIDsParaMover
        ExpedienteSuministradorRepositorio.ActualizarPadreRelacion _
            CStr(vIDRelacion), Null, sEsContr, sEsSub, db
    Next
    
    ' Recalcular Cabecera
    RecalcularFlagContratistaPrincipal p_ExpedienteObj.IDExpediente, db
    
    ' Actualizar Caché
    Set m_ExpOp = New ExpedienteOperaciones
    Set m_ExpOp.Expediente = p_ExpedienteObj
    m_ExpOp.RegistrarExpEntidades p_Error, db, EnumAmbitoActualizacion.Suministradores
    
    ws.CommitTrans
    
    RegistrarUltimoCambio p_Expediente:=p_ExpedienteObj
    MoverConsorcioCompleto = True
    
    Set db = Nothing: Set ws = Nothing
    Exit Function

errores:
    If Err.Number <> 1000 Then p_Error = "Error Mover Consorcio: " & Err.Description
    If Not ws Is Nothing Then
        On Error Resume Next
        ws.Rollback
    End If
    ' Asegurar cierre de rs si falló antes de llegar al cierre normal
    If Not rs Is Nothing Then
        On Error Resume Next
        rs.Close
    End If
    
    
    MoverConsorcioCompleto = False
End Function
Public Function EliminarRelacion( _
    p_ExpedienteObj As Expediente, _
    p_IDRelacion As String, _
    Optional ByRef p_Error As String) As Boolean
    
    Dim ws As DAO.Workspace, db As DAO.Database
    Dim m_ExpOp As ExpedienteOperaciones
    
    On Error GoTo errores
    
    If ExpedienteSuministradorRepositorio.ContarHijos(p_IDRelacion) > 0 Then
        p_Error = "Tiene dependencias."
        Err.Raise 1000
    End If
    
    Set ws = DBEngine.Workspaces(0)
    Set db = getdb()
    ws.BeginTrans
    
    ExpedienteSuministradorRepositorio.EliminarRelacion p_IDRelacion, db
    
    ' Importante: Al borrar, podría cambiar el estado de la cabecera (si borramos la última propia)
    RecalcularFlagContratistaPrincipal p_ExpedienteObj.IDExpediente, db
    
    Set m_ExpOp = New ExpedienteOperaciones
    Set m_ExpOp.Expediente = p_ExpedienteObj
    m_ExpOp.RegistrarExpEntidades p_Error, db, p_Ambito:=EnumAmbitoActualizacion.Suministradores
    
    
    ws.CommitTrans
    RegistrarUltimoCambio p_Expediente:=p_ExpedienteObj
    
    EliminarRelacion = True
    Set db = Nothing: Set ws = Nothing
    Exit Function

errores:
    If Err.Number <> 1000 Then p_Error = "Error Eliminar: " & Err.Description
    If Not ws Is Nothing Then ws.Rollback
    
    EliminarRelacion = False
End Function

' --- LÓGICA CENTRAL DE CABECERA ---
Private Sub RecalcularFlagContratistaPrincipal(p_IDExp As String, p_Db As DAO.Database)
    ' Verifica si hay AL MENOS UNA empresa PROPIA en el nodo ROOT_CONTR
    Dim m_SQL As String
    Dim rs As DAO.Recordset
    Dim sNuevoValor As String
    
    m_SQL = "SELECT Count(*) as Total " & _
            "FROM TbExpedientesSuministradores ES " & _
            "INNER JOIN TbSuministradores S ON ES.IDSuministrador = S.IDSuministrador " & _
            "WHERE ES.IDExpediente=" & p_IDExp & " " & _
            "AND ES.IdPadre Is Null " & _
            "AND ES.ContratistaPrincipal='Sí' " & _
            "AND S.ConsorcioPropio='Sí';"
            
    Set rs = p_Db.OpenRecordset(m_SQL, dbOpenSnapshot)
    If Not rs.EOF Then
        If rs!total > 0 Then sNuevoValor = "Sí" Else sNuevoValor = "No"
    Else
        sNuevoValor = "No"
    End If
    rs.Close
    
    ' Actualizar cabecera
    ExpedienteSuministradorRepositorio.ActualizarFlagCabecera p_IDExp, sNuevoValor, p_Db
End Sub

' --- PASARELAS ---
Public Sub PersistirArbolDesdeMemoria(p_IDReal As String, p_Col As Scripting.Dictionary, p_Db As DAO.Database)
    ' Mismo código que antes, PERO al final llamar a RecalcularFlagContratistaPrincipal
    ' ... (Código inserción loop) ...
    ' RecalcularFlagContratistaPrincipal p_IDReal, p_db
End Sub

Public Function TieneHijos(p_ID As String) As Boolean
    TieneHijos = (ExpedienteSuministradorRepositorio.ContarHijos(p_ID) > 0)
End Function

Public Function EsEmpresaPropia(p_IDSuministrador As String) As Boolean
    EsEmpresaPropia = EsEmpresaDelConsorcio(p_IDSuministrador)
End Function

' --- HELPERS ---
Private Function EsEmpresaDelConsorcio(p_IDSum As String) As Boolean
    Dim oSum As Suministrador
    On Error Resume Next
    Set oSum = constructor.getSuministrador(p_IDSuministrador:=p_IDSum)
    If Not oSum Is Nothing Then
        EsEmpresaDelConsorcio = (oSum.ConsorcioPropio = "Sí")
    Else
        EsEmpresaDelConsorcio = False
    End If
End Function

Private Function ObtenerIDSuministradorDeRelacion(p_IDRelacion As String) As String
    Dim rs As DAO.Recordset
    Dim m_SQL As String
    m_SQL = "SELECT IDSuministrador FROM TbExpedientesSuministradores WHERE IDExpedienteSuministrador=" & p_IDRelacion & ";"
    Set rs = getdb().OpenRecordset(m_SQL, dbOpenSnapshot)
    If Not rs.EOF Then ObtenerIDSuministradorDeRelacion = Nz(rs!IDSuministrador, "")
    rs.Close
End Function

' Añadir en ExpedienteSuministradorServicio.cls

Public Function YaSomosAdjudicatarios(p_IDExpediente As String) As Boolean
    ' Delega la consulta al repositorio para ver si hay empresas propias en el nodo principal
    YaSomosAdjudicatarios = ExpedienteSuministradorRepositorio.HayNuestrasEmpresasComoPrincipal(p_IDExpediente)
End Function
' Añadir al final de ExpedienteSuministradorServicio.cls

Public Function ContarPropiasEnRaiz(p_IDExpediente As String, p_EsPrincipal As Boolean) As Long
    Dim rs As DAO.Recordset
    ' Reutilizamos la función del repositorio que ya filtra por ConsorcioPropio='Sí'
    Set rs = ExpedienteSuministradorRepositorio.GetRelacionesPropiasEnRaiz(p_IDExpediente, p_EsPrincipal)
    
    If rs.EOF Then
        ContarPropiasEnRaiz = 0
    Else
        rs.MoveLast ' Forzar recuento total
        ContarPropiasEnRaiz = rs.RecordCount
    End If
    
    rs.Close
    Set rs = Nothing
End Function

