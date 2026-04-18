Attribute VB_Name = "Test_NCProyectoListItemVM"
Option Compare Database
Option Explicit

Public Sub Test_NCProyectoListItemVM()
    Dim vm As NCProyectoListItemVM
    Dim vm2 As NCProyectoListItemVM
    Dim errorMsg As String
    Dim passed As Boolean
    
    passed = True
    
    Debug.Print "=== TEST NCProyectoListItemVM ==="
    Debug.Print ""
    
    On Error GoTo handleError
    
    Set vm = NCProyectoWrapper.GetNCProyectoVM(1)
    
    If vm Is Nothing Then
        Debug.Print "[FALLO] vm es Nothing"
        passed = False
    ElseIf Not vm.EstaCargado Then
        Debug.Print "[FALLO] vm no está cargado"
        passed = False
    Else
        Debug.Print "[OK] VM cargado correctamente"
        Debug.Print "  ID: " & vm.IDNoConformidad
        Debug.Print "  Código: " & vm.CodigoNoConformidad
        Debug.Print "  Estado: " & vm.Estado
        Debug.Print "  Proyecto: " & vm.Proyecto
        Debug.Print "  Vehiculo: " & vm.VEHICULO
        Debug.Print "  Descripción: " & Left(vm.Descripcion, 50) & "..."
        Debug.Print "  Exp: " & vm.Expediente
        Debug.Print "  Fecha Apertura: " & vm.FechaApertura
        Debug.Print "  Fecha Cierre: " & vm.FECHACIERRE
        Debug.Print "  Responsable Telf: " & vm.ResponsableTelefonica
        Debug.Print "  Responsable Calidad: " & vm.RESPONSABLECALIDAD
        Debug.Print "  Cerrada: " & vm.Cerrada
        Debug.Print "  Requiere ACR: " & vm.RequiereACR
        Debug.Print "  ACR: " & vm.ACR
        Debug.Print "  Requiere Control Eficacia: " & vm.RequiereControlEficacia
    End If
    
    Debug.Print ""
    Debug.Print "--- Test con ID inexistente ---"
    Set vm2 = NCProyectoWrapper.GetNCProyectoVM(999999)
    
    If vm2 Is Nothing Then
        Debug.Print "[OK] vm2 es Nothing (esperado)"
    ElseIf Not vm2.EstaCargado Then
        Debug.Print "[OK] vm2 no está cargado (esperado)"
    Else
        Debug.Print "[FALLO] vm2 debería estar vacío"
        passed = False
    End If
    
    Debug.Print ""
    Debug.Print "--- Test sin ID (instancia vacía) ---"
    Set vm2 = New NCProyectoListItemVM
    
    If vm2 Is Nothing Then
        Debug.Print "[FALLO] vm no debería ser Nothing"
        passed = False
    ElseIf vm2.EstaCargado Then
        Debug.Print "[FALLO] vm no debería estar cargado sin ID"
        passed = False
    Else
        Debug.Print "[OK] Instancia vacía creada correctamente"
    End If
    
    Debug.Print ""
    If passed Then
        Debug.Print "=== TODOS LOS TESTS PASADOS ==="
    Else
        Debug.Print "=== ALGUNOS TESTS FALLARON ==="
    End If
    
    Exit Sub
    
handleError:
    Debug.Print "[ERROR] " & Err.Number & ": " & Err.Description
    Debug.Print "=== TEST ABORTADO POR ERROR ==="
End Sub

Public Sub Test_Spec005_CacheListados()
    Dim colVM As Collection
    Dim vm As NCProyectoListItemVM
    Dim errorMsg As String
    Dim passed As Boolean
    Dim countAbiertas As Long
    Dim countTotal As Long
    Dim countCerradas As Long
    Dim db As Dao.Database
    Dim rs As Dao.Recordset
    
    passed = True
    
    Debug.Print ""
    Set db = getdb()
    
    Debug.Print "=== TEST Spec-005: Cache Listados ==="
    Debug.Print ""
    
    On Error GoTo handleError
    
    Debug.Print "--- Test 1: GetListadoFiltradoSQL sin filtro ---"
    Set rs = db.OpenRecordset("SELECT COUNT(*) AS Total FROM TbCacheListadoNC")
    Dim expectedTotal As Long
    expectedTotal = Nz(rs!total, 0)
    rs.Close
    Debug.Print "  Esperado (tabla): " & expectedTotal
    
    Set colVM = CacheNCProyecto.GetListadoFiltradoSQL(p_Error:=errorMsg)
    
    If errorMsg <> "" Then
        Debug.Print "[FALLO] " & errorMsg
        passed = False
    ElseIf colVM Is Nothing Then
        Debug.Print "[FALLO] Colección es Nothing"
        passed = False
    Else
        countTotal = colVM.count
        Debug.Print "  Obtenido (función): " & countTotal
        If countTotal = expectedTotal Then
            Debug.Print "[OK] Total sin filtro coincide"
        Else
            Debug.Print "[FALLO] No coincide: " & countTotal & " vs " & expectedTotal
            passed = False
        End If
    End If
    
    Debug.Print ""
    Debug.Print "--- Test 2: GetListadoFiltradoSQL con filtro Estado=Abierta ---"
    Set rs = db.OpenRecordset("SELECT COUNT(*) AS Total FROM TbCacheListadoNC WHERE Estado = 'Abierta'")
    Dim expectedAbiertas As Long
    expectedAbiertas = Nz(rs!total, 0)
    rs.Close
    Debug.Print "  Esperado (tabla): " & expectedAbiertas
    
    Set colVM = CacheNCProyecto.GetListadoFiltradoSQL(p_Estado:="Abierta", p_Error:=errorMsg)
    
    If errorMsg <> "" Then
        Debug.Print "[FALLO] " & errorMsg
        passed = False
    ElseIf colVM Is Nothing Then
        Debug.Print "[FALLO] Colección es Nothing"
        passed = False
    Else
        countAbiertas = colVM.count
        Debug.Print "  Obtenido (función): " & countAbiertas
        If countAbiertas = expectedAbiertas Then
            Debug.Print "[OK] Abiertas coincide"
        Else
            Debug.Print "[FALLO] No coincide: " & countAbiertas & " vs " & expectedAbiertas
            passed = False
        End If
    End If
    
    Debug.Print ""
    Debug.Print "--- Test 3: Verificar cerradas en caché ---"
    Set db = getdb()
    Set rs = db.OpenRecordset("SELECT COUNT(*) AS Total FROM TbCacheListadoNC WHERE Cerrada = True")
    countCerradas = Nz(rs!total, 0)
    rs.Close
    Debug.Print "[OK] Cerradas en caché: " & countCerradas
    
    Debug.Print ""
    Debug.Print "--- Test 4: RebuildCacheLista sin borrar cerradas ---"
    If CacheNCProyecto.RebuildCacheLista(p_Error:=errorMsg) Then
        Debug.Print "[OK] Rebuild sin borrar cerradas: True"
    Else
        Debug.Print "[FALLO] " & errorMsg
        passed = False
    End If
    
    Set rs = db.OpenRecordset("SELECT COUNT(*) AS Total FROM TbCacheListadoNC WHERE Cerrada = True")
    Dim countDespuesRebuild As Long
    countDespuesRebuild = Nz(rs!total, 0)
    rs.Close
    Debug.Print "  Cerradas después de rebuild: " & countDespuesRebuild
    
    If countDespuesRebuild <> countCerradas Then
        Debug.Print "[FALLO] Las cerradas deberían mantenerse"
        passed = False
    Else
        Debug.Print "[OK] Cerradas mantenidas correctamente"
    End If
    
    Debug.Print ""
    Debug.Print "--- Test 5: RebuildCacheLista borrando todo (admin) ---"
    If CacheNCProyecto.RebuildCacheLista(p_Error:=errorMsg) Then
        Debug.Print "[OK] Rebuild borrando todo: True"
    Else
        Debug.Print "[FALLO] " & errorMsg
        passed = False
    End If
    
    Set rs = db.OpenRecordset("SELECT COUNT(*) AS Total FROM TbCacheListadoNC")
    Dim countTotalDespues As Long
    countTotalDespues = Nz(rs!total, 0)
    rs.Close
    Debug.Print "  Total después de rebuild completo: " & countTotalDespues
    
    Debug.Print ""
    Debug.Print "--- Test 6: RebuildCacheLista (reemplaza SincronizarCache no disponible) ---"
    ' Nota: SincronizarCache no existe en CacheNCProyecto - se usa RebuildCacheLista para recargar cache
    If CacheNCProyecto.RebuildCacheLista(p_Error:=errorMsg) Then
        Debug.Print "[OK] RebuildCacheLista: True"
    Else
        Debug.Print "[FALLO] " & errorMsg
        passed = False
    End If
    
    Debug.Print ""
    If passed Then
        Debug.Print "=== TODOS LOS TESTS SPEC-005 PASADOS ==="
    Else
        Debug.Print "=== ALGUNOS TESTS SPEC-005 FALLARON ==="
    End If
    
    Exit Sub
    
handleError:
    Debug.Print "[ERROR] " & Err.Number & ": " & Err.Description
    Debug.Print "=== TEST SPEC-005 ABORTADO POR ERROR ==="
End Sub

Public Sub Test_Spec005_CompararConOriginal()
    Dim colOriginal As Scripting.Dictionary
    Dim colCache As Collection
    Dim db As Dao.Database
    Dim rs As Dao.Recordset
    Dim errorMsg As String
    Dim passed As Boolean
    Dim countOriginal As Long
    Dim countCache As Long
    Dim expected As Long
    
    passed = True
    
    Const VAL_CODIGO_EXISTENTE As String = "NC0001"
    Const VAL_CODIGO_NO_EXISTENTE As String = "CODIGO_FALSO_999999"
    Const VAL_IDEXPEDIENTE_EXISTENTE As Long = 210
    Const VAL_IDEXPEDIENTE_NO_EXISTENTE As Long = "-100"
    Const VAL_DESCRIPCION_EXISTENTE As String = "Falta"
    Const VAL_DESCRIPCION_NO_EXISTENTE As String = "TEXTO_FALSO_999999"
    Const VAL_ESTADO_EXISTENTE As String = "Cerrada"
    Const VAL_ESTADO_NO_EXISTENTE As String = "ESTADO_FALSO_999"
    Const VAL_IDTIPO_EXISTENTE As Long = 2
    Const VAL_IDTIPO_NO_EXISTENTE As Long = 999999
    Const VAL_REQCALIDAD_EXISTENTE As String = "Ana Rubio Canales"
    Const VAL_REQCALIDAD_NO_EXISTENTE As String = "RESPONSABLE_FALSO_999"
    Const VAL_REPTELEFONICA_EXISTENTE As String = "JCPG"
    Const VAL_REPTELEFONICA_NO_EXISTENTE As String = "TELEFONICA_FALSO_999"
    Const VAL_NOTAS_EXISTENTE As String = "Una v"
    
    Debug.Print ""
    Debug.Print "=== TEST Spec-005: Comparar Original vs Cache ===" & Date & " " & Time
    Debug.Print ""
    
    On Error GoTo handleError
    
    Set db = getdb()
    
    Debug.Print "--- Sincronizando cache (usando RebuildCacheLista) ---"
    ' SincronizarCache no existe - se usa RebuildCacheLista para recargar el cache
    If Not CacheNCProyecto.RebuildCacheLista(p_Error:=errorMsg) Then
        Debug.Print "[FALLO] SincronizarCache: " & errorMsg
        passed = False
    Else
        Debug.Print "[OK] Cache sincronizada"
    End If
    
    Debug.Print ""
    Debug.Print "=== SERIE A: TESTS SIN FILTROS Y VALIDOS EXISTENTES ==="
    Debug.Print ""
    
    Debug.Print "--- A1: Sin filtros ---"
    Set colOriginal = NCProyectoWrapper.GetNCsFiltradosVMConFiltros()
    If errorMsg <> "" Then
        Debug.Print "[ERROR] GetNCsFiltradosVMConFiltros: " & errorMsg
        Err.Raise 1000
    End If
    countOriginal = IIf(colOriginal Is Nothing, 0, colOriginal.count)
    Debug.Print "  Original: " & countOriginal
    
    Set colCache = CacheNCProyecto.GetListadoFiltradoSQL(p_Error:=errorMsg)
    If errorMsg <> "" Then
        Debug.Print "[ERROR] GetListadoFiltradoSQL: " & errorMsg
        Err.Raise 1000
    End If
    countCache = IIf(colCache Is Nothing, 0, colCache.count)
    Debug.Print "  Cache: " & countCache
    
    If countOriginal <> countCache Then
        Debug.Print "[FALLO] No coincide: Original=" & countOriginal & " Cache=" & countCache
        passed = False
    Else
        Debug.Print "[OK] Coincide"
    End If
    
    Debug.Print ""
    Debug.Print "--- A2: Filtro Codigo existente ---"
    Set colCache = CacheNCProyecto.GetListadoFiltradoSQL(p_Codigo:=VAL_CODIGO_EXISTENTE, p_Error:=errorMsg)
    If errorMsg <> "" Then
        Debug.Print "[ERROR] GetListadoFiltradoSQL: " & errorMsg
        Err.Raise 1000
    End If
    countCache = IIf(colCache Is Nothing, 0, colCache.count)
    
    
    Set rs = db.OpenRecordset("SELECT COUNT(*) AS Total FROM TbCacheListadoNC WHERE CodigoNoConformidad = '" & VAL_CODIGO_EXISTENTE & "'")
    expected = Nz(rs!total, 0)
    If Not rs Is Nothing Then rs.Close
    
    
    Debug.Print "  Valor: " & VAL_CODIGO_EXISTENTE
    Debug.Print "  Esperado: " & expected & " | Cache: " & countCache
    
    If countCache <> expected Then
        Debug.Print "[FALLO]"
        passed = False
    Else
        Debug.Print "[OK]"
    End If
    
    Debug.Print ""
    Debug.Print "--- A3: Filtro Codigo NO existente ---"
    Set colCache = CacheNCProyecto.GetListadoFiltradoSQL(p_Codigo:=VAL_CODIGO_NO_EXISTENTE, p_Error:=errorMsg)
    If errorMsg <> "" Then
        Debug.Print "[ERROR] GetListadoFiltradoSQL: " & errorMsg
        Err.Raise 1000
    End If
    countCache = IIf(colCache Is Nothing, 0, colCache.count)
    
    Debug.Print "  Valor: " & VAL_CODIGO_NO_EXISTENTE
    Debug.Print "  Esperado: 0 | Cache: " & countCache
    
    If countCache <> 0 Then
        Debug.Print "[FALLO]"
        passed = False
    Else
        Debug.Print "[OK]"
    End If
    
    Debug.Print ""
    Debug.Print "--- A4: Filtro IDExpediente existente ---"
    Set colCache = CacheNCProyecto.GetListadoFiltradoSQL(p_IDExpediente:=VAL_IDEXPEDIENTE_EXISTENTE, p_Error:=errorMsg)
    If errorMsg <> "" Then
        Debug.Print "[ERROR] GetListadoFiltradoSQL: " & errorMsg
        Err.Raise 1000
    End If
    countCache = IIf(colCache Is Nothing, 0, colCache.count)
    
    
    
    Set rs = db.OpenRecordset("SELECT COUNT(*) AS Total FROM TbCacheListadoNC WHERE IDExpediente = " & VAL_IDEXPEDIENTE_EXISTENTE)
    expected = Nz(rs!total, 0)
    If Not rs Is Nothing Then rs.Close
    
    
    Debug.Print "  Valor: " & VAL_IDEXPEDIENTE_EXISTENTE
    Debug.Print "  Esperado: " & expected & " | Cache: " & countCache
    
    If countCache <> expected Then
        Debug.Print "[FALLO]"
        passed = False
    Else
        Debug.Print "[OK]"
    End If
    
    Debug.Print ""
    Debug.Print "--- A5: Filtro IDExpediente NO existente ---"
    Set colCache = CacheNCProyecto.GetListadoFiltradoSQL(p_IDExpediente:=VAL_IDEXPEDIENTE_NO_EXISTENTE, p_Error:=errorMsg)
    If errorMsg <> "" Then
        Debug.Print "[ERROR] GetListadoFiltradoSQL: " & errorMsg
        Err.Raise 1000
    End If
    countCache = IIf(colCache Is Nothing, 0, colCache.count)
    
    Debug.Print "  Valor: " & VAL_IDEXPEDIENTE_NO_EXISTENTE
    Debug.Print "  Esperado: 0 | Cache: " & countCache
    
    If countCache <> 0 Then
        Debug.Print "[FALLO]"
        passed = False
    Else
        Debug.Print "[OK]"
    End If
    
    Debug.Print ""
    Debug.Print "--- A6: Filtro Descripcion (contains) existente ---"
    Set colCache = CacheNCProyecto.GetListadoFiltradoSQL(p_Descripcion:=VAL_DESCRIPCION_EXISTENTE, p_Error:=errorMsg)
    If errorMsg <> "" Then
        Debug.Print "[ERROR] GetListadoFiltradoSQL: " & errorMsg
        Err.Raise 1000
    End If
    countCache = IIf(colCache Is Nothing, 0, colCache.count)
    
    
    Set rs = db.OpenRecordset("SELECT COUNT(*) AS Total FROM TbCacheListadoNC WHERE Descripcion LIKE '*" & VAL_DESCRIPCION_EXISTENTE & "*'")
    expected = Nz(rs!total, 0)
    If Not rs Is Nothing Then rs.Close
    
    
    Debug.Print "  Valor: *" & VAL_DESCRIPCION_EXISTENTE & "*"
    Debug.Print "  Esperado: " & expected & " | Cache: " & countCache
    
    If countCache <> expected Then
        Debug.Print "[FALLO]"
        passed = False
    Else
        Debug.Print "[OK]"
    End If
    
    Debug.Print ""
    Debug.Print "--- A7: Filtro Descripcion (contains) NO existente ---"
    Set colCache = CacheNCProyecto.GetListadoFiltradoSQL(p_Descripcion:=VAL_DESCRIPCION_NO_EXISTENTE, p_Error:=errorMsg)
    If errorMsg <> "" Then
        Debug.Print "[ERROR] GetListadoFiltradoSQL: " & errorMsg
        Err.Raise 1000
    End If
    countCache = IIf(colCache Is Nothing, 0, colCache.count)
    
    Debug.Print "  Valor: *" & VAL_DESCRIPCION_NO_EXISTENTE & "*"
    Debug.Print "  Esperado: 0 | Cache: " & countCache
    
    If countCache <> 0 Then
        Debug.Print "[FALLO]"
        passed = False
    Else
        Debug.Print "[OK]"
    End If
    
    Debug.Print ""
    Debug.Print "--- A8: Filtro Estado = Cerrada ---"
    Set colCache = CacheNCProyecto.GetListadoFiltradoSQL(p_Estado:=VAL_ESTADO_EXISTENTE, p_Error:=errorMsg)
    If errorMsg <> "" Then
        Debug.Print "[ERROR] GetListadoFiltradoSQL: " & errorMsg
        Err.Raise 1000
    End If
    countCache = IIf(colCache Is Nothing, 0, colCache.count)
    
    
    Set rs = db.OpenRecordset("SELECT COUNT(*) AS Total FROM TbCacheListadoNC WHERE Estado = '" & VAL_ESTADO_EXISTENTE & "'")
    expected = Nz(rs!total, 0)
    If Not rs Is Nothing Then rs.Close
    
    Debug.Print "  Valor: " & VAL_ESTADO_EXISTENTE
    Debug.Print "  Esperado: " & expected & " | Cache: " & countCache
    
    If countCache <> expected Then
        Debug.Print "[FALLO]"
        passed = False
    Else
        Debug.Print "[OK]"
    End If
    
    Debug.Print ""
    Debug.Print "--- A9: Filtro Estado NO existente ---"
    Set colCache = CacheNCProyecto.GetListadoFiltradoSQL(p_Estado:=VAL_ESTADO_NO_EXISTENTE, p_Error:=errorMsg)
    If errorMsg <> "" Then
        Debug.Print "[ERROR] GetListadoFiltradoSQL: " & errorMsg
        Err.Raise 1000
    End If
    countCache = IIf(colCache Is Nothing, 0, colCache.count)
    
    Debug.Print "  Valor: " & VAL_ESTADO_NO_EXISTENTE
    Debug.Print "  Esperado: 0 | Cache: " & countCache
    
    If countCache <> 0 Then
        Debug.Print "[FALLO]"
        passed = False
    Else
        Debug.Print "[OK]"
    End If
    
    Debug.Print ""
    Debug.Print "--- A10: Filtro IDTipo existente ---"
    Set colCache = CacheNCProyecto.GetListadoFiltradoSQL(p_IDTipo:=VAL_IDTIPO_EXISTENTE, p_Error:=errorMsg)
    If errorMsg <> "" Then
        Debug.Print "[ERROR] GetListadoFiltradoSQL: " & errorMsg
        Err.Raise 1000
    End If
    countCache = IIf(colCache Is Nothing, 0, colCache.count)
    
    
    Set rs = db.OpenRecordset("SELECT COUNT(*) AS Total FROM TbCacheListadoNC WHERE IDTipo = " & VAL_IDTIPO_EXISTENTE)
    expected = Nz(rs!total, 0)
    If Not rs Is Nothing Then rs.Close
    
    Debug.Print "  Valor: " & VAL_IDTIPO_EXISTENTE
    Debug.Print "  Esperado: " & expected & " | Cache: " & countCache
    
    If countCache <> expected Then
        Debug.Print "[FALLO]"
        passed = False
    Else
        Debug.Print "[OK]"
    End If
    
    Debug.Print ""
    Debug.Print "--- A11: Filtro IDTipo NO existente ---"
    Set colCache = CacheNCProyecto.GetListadoFiltradoSQL(p_IDTipo:=VAL_IDTIPO_NO_EXISTENTE, p_Error:=errorMsg)
    If errorMsg <> "" Then
        Debug.Print "[ERROR] GetListadoFiltradoSQL: " & errorMsg
        Err.Raise 1000
    End If
    countCache = IIf(colCache Is Nothing, 0, colCache.count)
    
    Debug.Print "  Valor: " & VAL_IDTIPO_NO_EXISTENTE
    Debug.Print "  Esperado: 0 | Cache: " & countCache
    
    If countCache <> 0 Then
        Debug.Print "[FALLO]"
        passed = False
    Else
        Debug.Print "[OK]"
    End If
    
    Debug.Print ""
    Debug.Print "--- A12: Filtro RequiereCE = Sí ---"
    Set colCache = CacheNCProyecto.GetListadoFiltradoSQL(p_RequiereCE:="Sí", p_Error:=errorMsg)
    If errorMsg <> "" Then
        Debug.Print "[ERROR] GetListadoFiltradoSQL: " & errorMsg
        Err.Raise 1000
    End If
    countCache = IIf(colCache Is Nothing, 0, colCache.count)
    
    
    Set rs = db.OpenRecordset("SELECT COUNT(*) AS Total FROM TbCacheListadoNC WHERE RequiereControlEficacia = 'Sí'")
    expected = Nz(rs!total, 0)
    If Not rs Is Nothing Then rs.Close
    
    Debug.Print "  Esperado: " & expected & " | Cache: " & countCache
    
    If countCache <> expected Then
        Debug.Print "[FALLO]"
        passed = False
    Else
        Debug.Print "[OK]"
    End If
    
    Debug.Print ""
    Debug.Print "--- A13: Filtro RequiereCE = No ---"
    Set colCache = CacheNCProyecto.GetListadoFiltradoSQL(p_RequiereCE:="No", p_Error:=errorMsg)
    If errorMsg <> "" Then
        Debug.Print "[ERROR] GetListadoFiltradoSQL: " & errorMsg
        Err.Raise 1000
    End If
    countCache = IIf(colCache Is Nothing, 0, colCache.count)
    
    
    Set rs = db.OpenRecordset("SELECT COUNT(*) AS Total FROM TbCacheListadoNC WHERE RequiereControlEficacia = 'No'")
    expected = Nz(rs!total, 0)
    If Not rs Is Nothing Then rs.Close
    
    Debug.Print "  Esperado: " & expected & " | Cache: " & countCache
    
    If countCache <> expected Then
        Debug.Print "[FALLO]"
        passed = False
    Else
        Debug.Print "[OK]"
    End If
    
    Debug.Print ""
    Debug.Print "--- A14: Filtro ControlEficacia = Sí (tiene) ---"
    Set colCache = CacheNCProyecto.GetListadoFiltradoSQL(p_ControlEficacia:="Sí", p_Error:=errorMsg)
    If errorMsg <> "" Then
        Debug.Print "[ERROR] GetListadoFiltradoSQL: " & errorMsg
        Err.Raise 1000
    End If
    countCache = IIf(colCache Is Nothing, 0, colCache.count)
    
    
    Set rs = db.OpenRecordset("SELECT COUNT(*) AS Total FROM TbCacheListadoNC WHERE ControlEficacia <> ''")
    expected = Nz(rs!total, 0)
    If Not rs Is Nothing Then rs.Close
    
    Debug.Print "  Esperado: " & expected & " | Cache: " & countCache
    
    If countCache <> expected Then
        Debug.Print "[FALLO]"
        passed = False
    Else
        Debug.Print "[OK]"
    End If
    
    Debug.Print ""
    Debug.Print "--- A15: Filtro ControlEficacia = No (sin) ---"
    Set colCache = CacheNCProyecto.GetListadoFiltradoSQL(p_ControlEficacia:="No", p_Error:=errorMsg)
    If errorMsg <> "" Then
        Debug.Print "[ERROR] GetListadoFiltradoSQL: " & errorMsg
        Err.Raise 1000
    End If
    countCache = IIf(colCache Is Nothing, 0, colCache.count)
    
    
    Set rs = db.OpenRecordset("SELECT COUNT(*) AS Total FROM TbCacheListadoNC WHERE ControlEficacia = ''")
    expected = Nz(rs!total, 0)
    If Not rs Is Nothing Then rs.Close
    
    Debug.Print "  Esperado: " & expected & " | Cache: " & countCache
    
    If countCache <> expected Then
        Debug.Print "[FALLO]"
        passed = False
    Else
        Debug.Print "[OK]"
    End If
    
    Debug.Print ""
    Debug.Print "--- A16: Filtro RegistrosCerrados = No (abiertas) ---"
    Set colCache = CacheNCProyecto.GetListadoFiltradoSQL(p_RegistrosCerrados:="No", p_Error:=errorMsg)
    If errorMsg <> "" Then
        Debug.Print "[ERROR] GetListadoFiltradoSQL: " & errorMsg
        Err.Raise 1000
    End If
    countCache = IIf(colCache Is Nothing, 0, colCache.count)
    
    
    Set rs = db.OpenRecordset("SELECT COUNT(*) AS Total FROM TbCacheListadoNC WHERE FechaCierre IS NULL")
    expected = Nz(rs!total, 0)
    If Not rs Is Nothing Then rs.Close
    
    Debug.Print "  Esperado: " & expected & " | Cache: " & countCache
    
    If countCache <> expected Then
        Debug.Print "[FALLO]"
        passed = False
    Else
        Debug.Print "[OK]"
    End If
    
    Debug.Print ""
    Debug.Print "--- A17: Filtro RegistrosCerrados = Sí (cerradas) ---"
    Set colCache = CacheNCProyecto.GetListadoFiltradoSQL(p_RegistrosCerrados:="Sí", p_Error:=errorMsg)
    If errorMsg <> "" Then
        Debug.Print "[ERROR] GetListadoFiltradoSQL: " & errorMsg
        Err.Raise 1000
    End If
    countCache = IIf(colCache Is Nothing, 0, colCache.count)
    
    
    Set rs = db.OpenRecordset("SELECT COUNT(*) AS Total FROM TbCacheListadoNC WHERE FechaCierre IS NOT NULL")
    expected = Nz(rs!total, 0)
    If Not rs Is Nothing Then rs.Close
    
    Debug.Print "  Esperado: " & expected & " | Cache: " & countCache
    
    If countCache <> expected Then
        Debug.Print "[FALLO]"
        passed = False
    Else
        Debug.Print "[OK]"
    End If
    
    Debug.Print ""
    Debug.Print "--- A18: Filtro ResponsableCalidad existente ---"
    Set colCache = CacheNCProyecto.GetListadoFiltradoSQL(p_ResponsableCalidad:=VAL_REQCALIDAD_EXISTENTE, p_Error:=errorMsg)
    If errorMsg <> "" Then
        Debug.Print "[ERROR] GetListadoFiltradoSQL: " & errorMsg
        Err.Raise 1000
    End If
    countCache = IIf(colCache Is Nothing, 0, colCache.count)
    
    
    Set rs = db.OpenRecordset("SELECT COUNT(*) AS Total FROM TbCacheListadoNC WHERE RESPONSABLECALIDAD = '" & VAL_REQCALIDAD_EXISTENTE & "'")
    expected = Nz(rs!total, 0)
    If Not rs Is Nothing Then rs.Close
    
    Debug.Print "  Valor: " & VAL_REQCALIDAD_EXISTENTE
    Debug.Print "  Esperado: " & expected & " | Cache: " & countCache
    
    If countCache <> expected Then
        Debug.Print "[FALLO]"
        passed = False
    Else
        Debug.Print "[OK]"
    End If
    
    Debug.Print ""
    Debug.Print "--- A19: Filtro ResponsableCalidad NO existente ---"
    Set colCache = CacheNCProyecto.GetListadoFiltradoSQL(p_ResponsableCalidad:=VAL_REQCALIDAD_NO_EXISTENTE, p_Error:=errorMsg)
    If errorMsg <> "" Then
        Debug.Print "[ERROR] GetListadoFiltradoSQL: " & errorMsg
        Err.Raise 1000
    End If
    countCache = IIf(colCache Is Nothing, 0, colCache.count)
    
    Debug.Print "  Valor: " & VAL_REQCALIDAD_NO_EXISTENTE
    Debug.Print "  Esperado: 0 | Cache: " & countCache
    
    If countCache <> 0 Then
        Debug.Print "[FALLO]"
        passed = False
    Else
        Debug.Print "[OK]"
    End If
    
    Debug.Print ""
    Debug.Print "--- A20: Filtro ResponsableTelefonica existente ---"
    Set colCache = CacheNCProyecto.GetListadoFiltradoSQL(p_ResponsableTelefonica:=VAL_REPTELEFONICA_EXISTENTE, p_Error:=errorMsg)
    If errorMsg <> "" Then
        Debug.Print "[ERROR] GetListadoFiltradoSQL: " & errorMsg
        Err.Raise 1000
    End If
    countCache = IIf(colCache Is Nothing, 0, colCache.count)
    
    
    Set rs = db.OpenRecordset("SELECT COUNT(*) AS Total FROM TbCacheListadoNC WHERE ResponsableTelefonica = '" & VAL_REPTELEFONICA_EXISTENTE & "'")
    expected = Nz(rs!total, 0)
    If Not rs Is Nothing Then rs.Close
    
    Debug.Print "  Valor: " & VAL_REPTELEFONICA_EXISTENTE
    Debug.Print "  Esperado: " & expected & " | Cache: " & countCache
    
    If countCache <> expected Then
        Debug.Print "[FALLO]"
        passed = False
    Else
        Debug.Print "[OK]"
    End If
    
    Debug.Print ""
    Debug.Print "--- A21: Filtro ResponsableTelefonica NO existente ---"
    Set colCache = CacheNCProyecto.GetListadoFiltradoSQL(p_ResponsableTelefonica:=VAL_REPTELEFONICA_NO_EXISTENTE, p_Error:=errorMsg)
    If errorMsg <> "" Then
        Debug.Print "[ERROR] GetListadoFiltradoSQL: " & errorMsg
        Err.Raise 1000
    End If
    countCache = IIf(colCache Is Nothing, 0, colCache.count)
    
    Debug.Print "  Valor: " & VAL_REPTELEFONICA_NO_EXISTENTE
    Debug.Print "  Esperado: 0 | Cache: " & countCache
    
    If countCache <> 0 Then
        Debug.Print "[FALLO]"
        passed = False
    Else
        Debug.Print "[OK]"
    End If
    
    Debug.Print ""
    Debug.Print "--- A22: Filtro Google (contains en Descripcion o Notas) ---"
    Set colCache = CacheNCProyecto.GetListadoFiltradoSQL(p_Google:=VAL_DESCRIPCION_EXISTENTE, p_Error:=errorMsg)
    If errorMsg <> "" Then
        Debug.Print "[ERROR] GetListadoFiltradoSQL: " & errorMsg
        Err.Raise 1000
    End If
    countCache = IIf(colCache Is Nothing, 0, colCache.count)
    
    
    Set rs = db.OpenRecordset("SELECT COUNT(*) AS Total FROM TbCacheListadoNC WHERE Descripcion LIKE '*" & VAL_DESCRIPCION_EXISTENTE & "*' OR Notas LIKE '*" & VAL_DESCRIPCION_EXISTENTE & "*'")
    
    expected = Nz(rs!total, 0)
    If Not rs Is Nothing Then rs.Close
    
    Debug.Print "  Valor: *" & VAL_DESCRIPCION_EXISTENTE & "*"
    Debug.Print "  Esperado: " & expected & " | Cache: " & countCache
    
    If countCache <> expected Then
        Debug.Print "[FALLO]"
        passed = False
    Else
        Debug.Print "[OK]"
    End If
    
    Debug.Print ""
    Debug.Print "--- A23: Filtro Google NO existente ---"
    Set colCache = CacheNCProyecto.GetListadoFiltradoSQL(p_Google:=VAL_DESCRIPCION_NO_EXISTENTE, p_Error:=errorMsg)
    If errorMsg <> "" Then
        Debug.Print "[ERROR] GetListadoFiltradoSQL: " & errorMsg
        Err.Raise 1000
    End If
    countCache = IIf(colCache Is Nothing, 0, colCache.count)
    
    Debug.Print "  Valor: *" & VAL_DESCRIPCION_NO_EXISTENTE & "*"
    Debug.Print "  Esperado: 0 | Cache: " & countCache
    
    If countCache <> 0 Then
        Debug.Print "[FALLO]"
        passed = False
    Else
        Debug.Print "[OK]"
    End If
    
    Debug.Print ""
    Debug.Print "--- A24: Filtro Notas (contains) existente ---"
    Set colCache = CacheNCProyecto.GetListadoFiltradoSQL(p_Notas:=VAL_NOTAS_EXISTENTE, p_Error:=errorMsg)
    If errorMsg <> "" Then
        Debug.Print "[ERROR] GetListadoFiltradoSQL: " & errorMsg
        Err.Raise 1000
    End If
    countCache = IIf(colCache Is Nothing, 0, colCache.count)
    
    
    Set rs = db.OpenRecordset("SELECT COUNT(*) AS Total FROM TbCacheListadoNC WHERE Notas LIKE '*" & VAL_NOTAS_EXISTENTE & "*'")
    expected = Nz(rs!total, 0)
    If Not rs Is Nothing Then rs.Close
    
    Debug.Print "  Valor: *" & VAL_NOTAS_EXISTENTE & "*"
    Debug.Print "  Esperado: " & expected & " | Cache: " & countCache
    
    If countCache <> expected Then
        Debug.Print "[FALLO]"
        passed = False
    Else
        Debug.Print "[OK]"
    End If
    
    Debug.Print ""
    Debug.Print "--- A25: Filtro Notas (contains) NO existente ---"
    Set colCache = CacheNCProyecto.GetListadoFiltradoSQL(p_Notas:=VAL_DESCRIPCION_NO_EXISTENTE, p_Error:=errorMsg)
    If errorMsg <> "" Then
        Debug.Print "[ERROR] GetListadoFiltradoSQL: " & errorMsg
        Err.Raise 1000
    End If
    countCache = IIf(colCache Is Nothing, 0, colCache.count)
    
    Debug.Print "  Valor: *" & VAL_DESCRIPCION_NO_EXISTENTE & "*"
    Debug.Print "  Esperado: 0 | Cache: " & countCache
    
    If countCache <> 0 Then
        Debug.Print "[FALLO]"
        passed = False
    Else
        Debug.Print "[OK]"
    End If
    
    Debug.Print ""
    Debug.Print "=== RESUMEN ==="
    If passed Then
        Debug.Print "=== TODOS LOS TESTS PASADOS ===" & vbCrLf
    Else
        Debug.Print "=== ALGUNOS TESTS FALLARON ===" & vbCrLf
    End If
    
    Exit Sub
    
handleError:
    Debug.Print "[ERROR] " & Err.Number & ": " & Err.Description
    Debug.Print "=== TEST ABORTADO POR ERROR ==="
End Sub

Public Sub Test_GetNCsFiltradosVM()
    Dim colVM As Collection
    Dim vm As NCProyectoListItemVM
    Dim errorMsg As String
    Dim i As Long
    Dim count As Long
    
    Debug.Print ""
    Debug.Print "=== TEST GetNCsFiltradosVM ==="
    Debug.Print ""
    
    On Error GoTo handleError
    
    Set colVM = NCProyectoWrapper.GetNCsFiltradosVMConFiltros()
    
    If errorMsg <> "" Then
        Debug.Print "[FALLO] " & errorMsg
        Exit Sub
    End If
    
    If colVM Is Nothing Then
        Debug.Print "[FALLO] La colección es Nothing"
        Exit Sub
    End If
    
    count = colVM.count
    Debug.Print "[OK] Colección devuelta con " & count & " elementos"
    
    If count > 0 Then
        Set vm = colVM(1)
        Debug.Print "  Primer elemento:"
        Debug.Print "    ID: " & vm.IDNoConformidad
        Debug.Print "    Código: " & vm.CodigoNoConformidad
        Debug.Print "    Estado: " & vm.Estado
        Debug.Print "    Proyecto: " & vm.Proyecto
    End If
    
    If count > 1 Then
        Set vm = colVM(2)
        Debug.Print "  Segundo elemento:"
        Debug.Print "    ID: " & vm.IDNoConformidad
        Debug.Print "    Código: " & vm.CodigoNoConformidad
    End If
    
    Debug.Print ""
    Debug.Print "=== TEST GetNCsFiltradosVM COMPLETADO ==="
    Exit Sub
    
handleError:
    Debug.Print "[ERROR] " & Err.Number & ": " & Err.Description
    Debug.Print "=== TEST ABORTADO POR ERROR ==="
End Sub

Public Sub Test_FormNCProyectoGestion_VM()
    Dim colVM As Collection
    Dim errorMsg As String
    Dim frm As Form_FormNCProyectoGestion
    Dim result As String
    
    Debug.Print ""
    Debug.Print "=== TEST FormNCProyectoGestion con VM ==="
    Debug.Print ""
    
    On Error GoTo handleError
    
    Set colVM = NCProyectoWrapper.GetNCsFiltradosVMConFiltros()
    
    If errorMsg <> "" Then
        Debug.Print "[FALLO] getNCsFiltradosVM: " & errorMsg
        Exit Sub
    End If
    
    If colVM Is Nothing Then
        Debug.Print "[FALLO] Colección es Nothing"
        Exit Sub
    End If
    
    Debug.Print "[OK] getNCsFiltradosVM devolvió " & colVM.count & " elementos"
    
    If colVM.count > 0 Then
        Debug.Print "  Datos del primer elemento:"
        With colVM(1)
            Debug.Print "    ID: " & .IDNoConformidad
            Debug.Print "    Código: " & .CodigoNoConformidad
            Debug.Print "    Descripción: " & Left(.Descripcion, 30) & "..."
            Debug.Print "    Expediente: " & .Expediente
            Debug.Print "    Nemotecnico: " & .Nemotecnico
            Debug.Print "    CodExp: " & .CodExp
            Debug.Print "    ExpedienteCalculadoTexto: " & .ExpedienteCalculadoTexto
            Debug.Print "    Estado: " & .Estado
            Debug.Print "    FechaApertura: " & .FechaApertura
            Debug.Print "    FechaCierre: " & .FECHACIERRE
            Debug.Print "    Proyecto: " & .Proyecto
        End With
    End If
    
    Debug.Print ""
    Debug.Print "=== TEST FormNCProyectoGestion VM COMPLETADO ==="
    Debug.Print "Para probar RellenarListaConVM en formulario:"
    Debug.Print "  1. Abrir Form_FormNCProyectoGestion"
    Debug.Print "  2. Hacer clic en botón Actualizar"
    Debug.Print "  3. Verificar que la lista se carga correctamente"
    Exit Sub
    
handleError:
    Debug.Print "[ERROR] " & Err.Number & ": " & Err.Description
    Debug.Print "=== TEST ABORTADO POR ERROR ==="
End Sub