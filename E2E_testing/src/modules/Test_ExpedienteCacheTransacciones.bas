Attribute VB_Name = "Test_ExpedienteCacheTransacciones"
Option Compare Database
Option Explicit

Private Const CONTROLLED_CACHE_FAILURE As String = "TEST_ONLY_CACHE_REFRESH_FAILURE"
Private Const TEST_ID_BASE As Long = 994000000

Private Function JsonOK(ByVal p_Value As String) As String
    Dim logs(0 To 0) As String
    logs(0) = "ok=" & p_Value
    JsonOK = BuildJsonOk(p_Value, logs)
End Function

Private Function JsonFail(ByVal p_Error As String) As String
    Dim logs(0 To 0) As String
    logs(0) = "error=" & p_Error
    JsonFail = BuildJsonFail(p_Error, logs)
End Function

Public Function Test_CacheFailureSeam_InactiveByDefault() As String
    On Error GoTo EH

    Dim m_Op As ExpedienteEntidadOperaciones
    Set m_Op = New ExpedienteEntidadOperaciones

    If m_Op.TestOnlyIsCacheRefreshFailureForced() Then
        Test_CacheFailureSeam_InactiveByDefault = JsonFail("Cache refresh fault seam should be inactive by default")
        Exit Function
    End If

    Test_CacheFailureSeam_InactiveByDefault = JsonOK("inactive_by_default")
    Exit Function

EH:
    Test_CacheFailureSeam_InactiveByDefault = JsonFail(Err.Description)
End Function

Public Function Test_CacheFailureSeam_ActivatedProducesControlledFailure() As String
    On Error GoTo EH

    Dim m_Op As ExpedienteEntidadOperaciones
    Dim m_Error As String

    If Not EnsureSandboxBackend(m_Error) Then
        Test_CacheFailureSeam_ActivatedProducesControlledFailure = JsonFail("Sandbox guard: " & m_Error)
        Exit Function
    End If

    Set m_Op = New ExpedienteEntidadOperaciones
    m_Op.TestOnlyForceCacheRefreshFailure True
    m_Op.Registrar p_ForceCacheFailureForTest:=False, p_Error:=m_Error

    If m_Error <> CONTROLLED_CACHE_FAILURE Then
        Test_CacheFailureSeam_ActivatedProducesControlledFailure = JsonFail("Expected controlled failure '" & CONTROLLED_CACHE_FAILURE & "' but got '" & m_Error & "'")
        Exit Function
    End If

    Test_CacheFailureSeam_ActivatedProducesControlledFailure = JsonOK("controlled_failure")
    Exit Function

EH:
    Test_CacheFailureSeam_ActivatedProducesControlledFailure = JsonFail(Err.Description)
End Function

Public Function Test_CacheFailureSeam_ResetClearsFailure() As String
    On Error GoTo EH

    Dim m_Op As ExpedienteEntidadOperaciones
    Set m_Op = New ExpedienteEntidadOperaciones

    m_Op.TestOnlyForceCacheRefreshFailure True
    m_Op.TestOnlyResetCacheRefreshFailure

    If m_Op.TestOnlyIsCacheRefreshFailureForced() Then
        Test_CacheFailureSeam_ResetClearsFailure = JsonFail("Cache refresh fault seam should be inactive after reset")
        Exit Function
    End If

    Test_CacheFailureSeam_ResetClearsFailure = JsonOK("reset_cleared")
    Exit Function

EH:
    Test_CacheFailureSeam_ResetClearsFailure = JsonFail(Err.Description)
End Function

Public Function Test_ActualizarNCsContratistas_RolledBackWhenCallerRollsBack() As String
    On Error GoTo EH

    Dim m_WorkspaceName As String
    Dim m_BackendPath As String
    Dim m_Password As String
    Dim m_Connection As String
    Dim m_IDExp As String
    Dim m_OriginalJuridicaExp As String
    Dim m_UpdatedJuridicaExp As String
    Dim m_Error As String
    Dim m_OriginalReader As DAO.Database
    Dim m_WorkspaceTx As DAO.Workspace
    Dim m_DbTx As DAO.Database
    Dim m_Recordset As DAO.Recordset
    Dim m_TransactionStarted As Boolean
    Dim m_RollbackError As String
    Dim m_Count As Long
    Dim m_ExceptionDescription As String

    m_WorkspaceName = "wks_pr2_nc_cache_tx_" & CStr(Int(Timer * 1000))
    m_BackendPath = CurrentProject.Path & "\Expedientes_datos.accdb"
    m_Password = Environ$("ACCESS_VBA_PASSWORD")
    If Len(m_Password) > 0 Then
        m_Connection = ";pwd=" & m_Password
    Else
        m_Connection = ""
    End If

    m_IDExp = CStr(990000000 + CLng(Timer * 1000) + CLng(Rnd() * 100000))
    m_OriginalJuridicaExp = "ORIGINAL-PR2-ROLLBACK"

    Set m_WorkspaceTx = DBEngine.CreateWorkspace(m_WorkspaceName, "admin", "")
    Set m_DbTx = m_WorkspaceTx.OpenDatabase(m_BackendPath, False, False, m_Connection)
    Set m_OriginalReader = DBEngine.Workspaces(0).OpenDatabase(m_BackendPath, False, False, m_Connection)

    m_WorkspaceTx.BeginTrans
    m_TransactionStarted = True

    m_DbTx.Execute _
        "INSERT INTO TbNoConformidades (" & _
        "IDNoConformidad, Juridica, CodigoNoConformidad, EsNoConformidad, EXPEDIENTE, PROYECTO, VEHICULO, DESCRIPCION, CAUSA, " & _
        "ENTIDADRESPONSABLE, RESPONSABLETELEFONICA, FECHAAPERTURA, FECHACIERRE, FPREVCIERRE, TIPO, NOTAS, Borrado, RequiereACR, ACR, " & _
        "MotivoBorrado, RequiereControlEficacia, ControlEficacia, FechaControlEficacia, FechaPrevistaControlEficacia, ResultadoControlEficacia, " & _
        "ConformeControlEficacia, RESPONSABLECALIDAD, IDExpediente, CodExp, Nemotecnico, JuridicaExp, RESPONSABLECALIDADExp, CausaYAnalisRaiz, " & _
        "Tipologia, IDProyecto, CodigoRiesgo, DetectadoPor, ResponsableEjecucion, ESTADO, IDTipo, Cerrada, IDNCAsociada, CodigoNoConformidadAsociada, " & _
        "CodConcesionAsociada, MotivoNoRequiereControlEficacia) VALUES (" & _
        m_IDExp & ", 'TEST', 'TEST-PR2-" & m_IDExp & "', True, 'TEST-EXP', 'TEST-PROY', 'TEST-VEH', 'Fixture rollback PR2', 'Fixture causa', " & _
        "'TEST-ENT', 'TEST-RESP', #2026-01-01#, #2026-01-02#, #2026-01-03#, 'TEST', 'Fixture notas', False, False, 'Fixture ACR', " & _
        "'Fixture borrado', 'No', 'Fixture control', #2026-01-04#, #2026-01-05#, 'Fixture resultado', 'No', 'TEST-CALIDAD', " & _
        m_IDExp & ", 'TEST-CODEXP', 'TEST-NEMO', '" & m_OriginalJuridicaExp & "', 'TEST-CALIDAD-EXP', 'Fixture raiz', " & _
        "'TEST-TIPOLOGIA', 0, 'TEST-RIESGO', 'TEST-DETECTOR', 'TEST-EJECUTOR', 'Abierta', 0, 'No', 0, 'TEST-NC-ASOC', " & _
        "'TEST-CONCESION', 'Fixture motivo');", _
        dbFailOnError

    m_UpdatedJuridicaExp = "PR2-" & m_IDExp & "-" & Format$(Now(), "yyyymmddhhmmss")
    ActualizarNCsContratistas _
        p_IDExp:=m_IDExp, _
        p_Cadena:=m_UpdatedJuridicaExp, _
        p_Db:=m_DbTx, _
        p_Error:=m_Error
    If m_Error <> "" Then
        SafeRollback m_WorkspaceTx, m_TransactionStarted, m_RollbackError
        If m_RollbackError <> "" Then
            Test_ActualizarNCsContratistas_RolledBackWhenCallerRollsBack = JsonFail(m_RollbackError)
            GoTo Cleanup
        End If
        Test_ActualizarNCsContratistas_RolledBackWhenCallerRollsBack = JsonFail("Actualización falló: " & m_Error)
        GoTo Cleanup
    End If

    Set m_Recordset = m_DbTx.OpenRecordset( _
        "SELECT Nz(JuridicaExp, '') AS JuridicaExpValue" & _
        " FROM TbNoConformidades" & _
        " WHERE IDExpediente=" & m_IDExp & ";" _
    )
    If m_Recordset.EOF Then
        Test_ActualizarNCsContratistas_RolledBackWhenCallerRollsBack = JsonFail("No se encontró fixture transaccional antes del rollback")
        GoTo Cleanup
    End If
    If CStr(Nz(m_Recordset.Fields("JuridicaExpValue").value, "")) <> m_UpdatedJuridicaExp Then
        Test_ActualizarNCsContratistas_RolledBackWhenCallerRollsBack = JsonFail("ActualizarNCsContratistas no usó la conexión transaccional del caller")
        GoTo Cleanup
    End If
    m_Recordset.Close
    Set m_Recordset = Nothing

    SafeRollback m_WorkspaceTx, m_TransactionStarted, m_RollbackError
    If m_RollbackError <> "" Then
        Test_ActualizarNCsContratistas_RolledBackWhenCallerRollsBack = JsonFail(m_RollbackError)
        GoTo Cleanup
    End If

    Set m_Recordset = m_OriginalReader.OpenRecordset( _
        "SELECT COUNT(*) AS RowCount" & _
        " FROM TbNoConformidades" & _
        " WHERE IDExpediente=" & m_IDExp & ";" _
    )
    m_Count = CLng(Nz(m_Recordset.Fields("RowCount").value, 0))
    If m_Count <> 0 Then
        Test_ActualizarNCsContratistas_RolledBackWhenCallerRollsBack = JsonFail("Se detectó persistencia fuera de la transacción")
    Else
        Test_ActualizarNCsContratistas_RolledBackWhenCallerRollsBack = JsonOK("rollback_enforced_with_p_db")
    End If

Cleanup:
    On Error Resume Next
    SafeRollback m_WorkspaceTx, m_TransactionStarted, m_RollbackError
    If Not m_Recordset Is Nothing Then
        m_Recordset.Close
        Set m_Recordset = Nothing
    End If
    If Not m_DbTx Is Nothing Then
        m_DbTx.Close
        Set m_DbTx = Nothing
    End If
    If Not m_WorkspaceTx Is Nothing Then
        DBEngine.Workspaces.Delete m_WorkspaceTx.Name
        Set m_WorkspaceTx = Nothing
    End If
    If Not m_OriginalReader Is Nothing Then
        m_OriginalReader.Close
        Set m_OriginalReader = Nothing
    End If
    Exit Function

EH:
    m_ExceptionDescription = Err.Description
    On Error Resume Next
    SafeRollback m_WorkspaceTx, m_TransactionStarted, m_RollbackError
    If m_RollbackError <> "" Then
        Test_ActualizarNCsContratistas_RolledBackWhenCallerRollsBack = JsonFail(m_ExceptionDescription & " | " & m_RollbackError)
    Else
        Test_ActualizarNCsContratistas_RolledBackWhenCallerRollsBack = JsonFail(m_ExceptionDescription)
    End If
    Resume Cleanup
End Function

Public Function Test_ActualizarNCs_UsesCallerTransactionAndRollsBack() As String
    On Error GoTo EH

    Dim m_WorkspaceName As String
    Dim m_BackendPath As String
    Dim m_Password As String
    Dim m_Connection As String
    Dim m_IDExp As String
    Dim m_Error As String
    Dim m_OriginalReader As DAO.Database
    Dim m_WorkspaceTx As DAO.Workspace
    Dim m_DbTx As DAO.Database
    Dim m_Recordset As DAO.Recordset
    Dim m_TransactionStarted As Boolean
    Dim m_RollbackError As String
    Dim m_Count As Long
    Dim m_ExceptionDescription As String
    Dim m_ExpInicial As Expediente
    Dim m_ExpActual As Expediente
    Dim m_NuevoCodExp As String
    Dim m_NuevoNemo As String

    m_WorkspaceName = "wks_pr2_nc_tx_" & CStr(Int(Timer * 1000))
    m_BackendPath = CurrentProject.Path & "\Expedientes_datos.accdb"
    m_Password = Environ$("ACCESS_VBA_PASSWORD")
    If Len(m_Password) > 0 Then
        m_Connection = ";pwd=" & m_Password
    Else
        m_Connection = ""
    End If

    m_IDExp = CStr(991000000 + CLng(Timer * 1000) + CLng(Rnd() * 100000))
    m_NuevoCodExp = "COD-PR2-" & m_IDExp
    m_NuevoNemo = "NEMO-PR2-" & m_IDExp

    Set m_WorkspaceTx = DBEngine.CreateWorkspace(m_WorkspaceName, "admin", "")
    Set m_DbTx = m_WorkspaceTx.OpenDatabase(m_BackendPath, False, False, m_Connection)
    Set m_OriginalReader = DBEngine.Workspaces(0).OpenDatabase(m_BackendPath, False, False, m_Connection)

    m_WorkspaceTx.BeginTrans
    m_TransactionStarted = True

    m_DbTx.Execute "INSERT INTO TbExpedientes (IDExpediente, CodExp, Nemotecnico) VALUES (" & m_IDExp & ", 'COD-ORIG', 'NEMO-ORIG');", dbFailOnError
    m_DbTx.Execute _
        "INSERT INTO TbNoConformidades (" & _
        "IDNoConformidad, Juridica, CodigoNoConformidad, EsNoConformidad, EXPEDIENTE, PROYECTO, VEHICULO, DESCRIPCION, CAUSA, " & _
        "ENTIDADRESPONSABLE, RESPONSABLETELEFONICA, FECHAAPERTURA, FECHACIERRE, FPREVCIERRE, TIPO, NOTAS, Borrado, RequiereACR, ACR, " & _
        "MotivoBorrado, RequiereControlEficacia, ControlEficacia, FechaControlEficacia, FechaPrevistaControlEficacia, ResultadoControlEficacia, " & _
        "ConformeControlEficacia, RESPONSABLECALIDAD, IDExpediente, CodExp, Nemotecnico, JuridicaExp, RESPONSABLECALIDADExp, CausaYAnalisRaiz, " & _
        "Tipologia, IDProyecto, CodigoRiesgo, DetectadoPor, ResponsableEjecucion, ESTADO, IDTipo, Cerrada, IDNCAsociada, CodigoNoConformidadAsociada, " & _
        "CodConcesionAsociada, MotivoNoRequiereControlEficacia) VALUES (" & _
        m_IDExp & ", 'TEST', 'TEST-PR2-NC-" & m_IDExp & "', True, 'TEST-EXP', 'TEST-PROY', 'TEST-VEH', 'Fixture rollback PR2 NC', 'Fixture causa', " & _
        "'TEST-ENT', 'TEST-RESP', #2026-01-01#, #2026-01-02#, #2026-01-03#, 'TEST', 'Fixture notas', False, False, 'Fixture ACR', " & _
        "'Fixture borrado', 'No', 'Fixture control', #2026-01-04#, #2026-01-05#, 'Fixture resultado', 'No', 'TEST-CALIDAD', " & _
        m_IDExp & ", 'COD-ORIG', 'NEMO-ORIG', 'JURIDICA-ORIG', 'TEST-CALIDAD-EXP', 'Fixture raiz', " & _
        "'TEST-TIPOLOGIA', 0, 'TEST-RIESGO', 'TEST-DETECTOR', 'TEST-EJECUTOR', 'Abierta', 0, 'No', 0, 'TEST-NC-ASOC', " & _
        "'TEST-CONCESION', 'Fixture motivo');", _
        dbFailOnError

    Set m_ExpInicial = New Expediente
    Set m_ExpActual = New Expediente
    m_ExpInicial.IDExpediente = m_IDExp
    m_ExpInicial.CodExp = "COD-ORIG"
    m_ExpInicial.Nemotecnico = "NEMO-ORIG"

    m_ExpActual.IDExpediente = m_IDExp
    m_ExpActual.CodExp = m_NuevoCodExp
    m_ExpActual.Nemotecnico = m_NuevoNemo

    ActualizarNCs m_ExpActual, m_ExpInicial, m_DbTx, m_Error
    If m_Error <> "" Then
        SafeRollback m_WorkspaceTx, m_TransactionStarted, m_RollbackError
        If m_RollbackError <> "" Then
            Test_ActualizarNCs_UsesCallerTransactionAndRollsBack = JsonFail(m_RollbackError)
            GoTo Cleanup
        End If
        Test_ActualizarNCs_UsesCallerTransactionAndRollsBack = JsonFail("ActualizarNCs falló: " & m_Error)
        GoTo Cleanup
    End If

    Set m_Recordset = m_DbTx.OpenRecordset( _
        "SELECT Nz(CodExp, '') AS CodExpValue, Nz(Nemotecnico, '') AS NemoValue" & _
        " FROM TbNoConformidades" & _
        " WHERE IDExpediente=" & m_IDExp & ";" _
    )
    If m_Recordset.EOF Then
        Test_ActualizarNCs_UsesCallerTransactionAndRollsBack = JsonFail("No se encontró NC fixture dentro de la transacción")
        GoTo Cleanup
    End If
    If CStr(Nz(m_Recordset.Fields("CodExpValue").value, "")) <> m_NuevoCodExp Then
        Test_ActualizarNCs_UsesCallerTransactionAndRollsBack = JsonFail("ActualizarNCs no usó la conexión transaccional del caller para CodExp")
        GoTo Cleanup
    End If
    If CStr(Nz(m_Recordset.Fields("NemoValue").value, "")) <> m_NuevoNemo Then
        Test_ActualizarNCs_UsesCallerTransactionAndRollsBack = JsonFail("ActualizarNCs no usó la conexión transaccional del caller para Nemotecnico")
        GoTo Cleanup
    End If
    m_Recordset.Close
    Set m_Recordset = Nothing

    SafeRollback m_WorkspaceTx, m_TransactionStarted, m_RollbackError
    If m_RollbackError <> "" Then
        Test_ActualizarNCs_UsesCallerTransactionAndRollsBack = JsonFail(m_RollbackError)
        GoTo Cleanup
    End If

    Set m_Recordset = m_OriginalReader.OpenRecordset( _
        "SELECT COUNT(*) AS RowCount" & _
        " FROM TbNoConformidades" & _
        " WHERE IDExpediente=" & m_IDExp & " AND Nz(CodExp, '')='" & m_NuevoCodExp & "';" _
    )
    m_Count = CLng(Nz(m_Recordset.Fields("RowCount").value, 0))
    If m_Count <> 0 Then
        Test_ActualizarNCs_UsesCallerTransactionAndRollsBack = JsonFail("Se detectó persistencia de NC fuera de la transacción")
    Else
        Test_ActualizarNCs_UsesCallerTransactionAndRollsBack = JsonOK("rollback_enforced_for_actualizar_ncs")
    End If

Cleanup:
    On Error Resume Next
    SafeRollback m_WorkspaceTx, m_TransactionStarted, m_RollbackError
    If Not m_Recordset Is Nothing Then
        m_Recordset.Close
        Set m_Recordset = Nothing
    End If
    If Not m_DbTx Is Nothing Then
        m_DbTx.Close
        Set m_DbTx = Nothing
    End If
    If Not m_WorkspaceTx Is Nothing Then
        DBEngine.Workspaces.Delete m_WorkspaceTx.Name
        Set m_WorkspaceTx = Nothing
    End If
    If Not m_OriginalReader Is Nothing Then
        m_OriginalReader.Close
        Set m_OriginalReader = Nothing
    End If
    Exit Function

EH:
    m_ExceptionDescription = Err.Description
    On Error Resume Next
    SafeRollback m_WorkspaceTx, m_TransactionStarted, m_RollbackError
    If m_RollbackError <> "" Then
        Test_ActualizarNCs_UsesCallerTransactionAndRollsBack = JsonFail(m_ExceptionDescription & " | " & m_RollbackError)
    Else
        Test_ActualizarNCs_UsesCallerTransactionAndRollsBack = JsonFail(m_ExceptionDescription)
    End If
    Resume Cleanup
End Function

Public Function Test_EliminarLugarEjecucion_StandaloneCacheFailureRollsBack() As String
    On Error GoTo EH

    Dim m_Db As DAO.Database
    Dim m_Recordset As DAO.Recordset
    Dim m_Op As ExpedienteOperaciones
    Dim m_Exp As Expediente
    Dim m_Error As String
    Dim m_IDExp As String
    Dim m_IDLugar As String
    Dim m_RowCount As Long

    m_IDExp = CStr(TEST_ID_BASE + 31)
    m_IDLugar = "9001"

    If Not EnsureSandboxBackend(m_Error) Then
        Test_EliminarLugarEjecucion_StandaloneCacheFailureRollsBack = JsonFail(m_Error)
        Exit Function
    End If

    If Not SeedExpedienteLugarFixture(CLng(m_IDExp), CLng(m_IDLugar), m_Error) Then
        Test_EliminarLugarEjecucion_StandaloneCacheFailureRollsBack = JsonFail(m_Error)
        Exit Function
    End If

    Set m_Db = getdb(m_Error)
    If m_Db Is Nothing Then
        Test_EliminarLugarEjecucion_StandaloneCacheFailureRollsBack = JsonFail("No se pudo abrir sandbox: " & m_Error)
        GoTo Cleanup
    End If

    Set m_Op = New ExpedienteOperaciones
    Set m_Exp = New Expediente
    m_Exp.IDExpediente = m_IDExp
    Set m_Op.Expediente = m_Exp

    m_Op.EliminarLugarEjecucion p_IDLugar:=m_IDLugar, p_Error:=m_Error, p_ForceCacheFailureForTest:=True
    If m_Error <> CONTROLLED_CACHE_FAILURE Then
        Test_EliminarLugarEjecucion_StandaloneCacheFailureRollsBack = JsonFail("Expected controlled cache failure but got '" & m_Error & "'")
        GoTo Cleanup
    End If

    Set m_Recordset = m_Db.OpenRecordset( _
        "SELECT COUNT(*) AS RowCount" & _
        " FROM TbExpedientesLugaresEjecucion" & _
        " WHERE IDExpediente=" & m_IDExp & " AND IDLugarEjecucion=" & m_IDLugar & ";" _
    )
    m_RowCount = CLng(Nz(m_Recordset.Fields("RowCount").value, 0))
    If m_RowCount <> 1 Then
        Test_EliminarLugarEjecucion_StandaloneCacheFailureRollsBack = JsonFail("Source delete was persisted despite cache failure")
        GoTo Cleanup
    End If

    Test_EliminarLugarEjecucion_StandaloneCacheFailureRollsBack = JsonOK("rollback_enforced_for_eliminar_lugar_ejecucion")

Cleanup:
    On Error Resume Next
    If Not m_Recordset Is Nothing Then
        m_Recordset.Close
        Set m_Recordset = Nothing
    End If
    If Not m_Db Is Nothing Then
        Call TeardownExpedienteLugarFixture(CLng(m_IDExp), CLng(m_IDLugar), m_Error)
        m_Db.Close
        Set m_Db = Nothing
    End If
    Exit Function

EH:
    Test_EliminarLugarEjecucion_StandaloneCacheFailureRollsBack = JsonFail(Err.Description)
    Resume Cleanup
End Function

Public Function Test_EliminarRAC_StandaloneCacheFailureRollsBack() As String
    On Error GoTo EH

    Dim m_Db As DAO.Database
    Dim m_Recordset As DAO.Recordset
    Dim m_Op As ExpedienteOperaciones
    Dim m_Exp As Expediente
    Dim m_Error As String
    Dim m_IDExp As String
    Dim m_IDRac As String
    Dim m_RowCount As Long

    m_IDExp = CStr(TEST_ID_BASE + 41)
    m_IDRac = "9001"

    If Not EnsureSandboxBackend(m_Error) Then
        Test_EliminarRAC_StandaloneCacheFailureRollsBack = JsonFail(m_Error)
        Exit Function
    End If

    If Not SeedExpedienteRacFixture(CLng(m_IDExp), CLng(m_IDRac), m_Error) Then
        Test_EliminarRAC_StandaloneCacheFailureRollsBack = JsonFail(m_Error)
        Exit Function
    End If

    Set m_Db = getdb(m_Error)
    If m_Db Is Nothing Then
        Test_EliminarRAC_StandaloneCacheFailureRollsBack = JsonFail("No se pudo abrir sandbox: " & m_Error)
        GoTo Cleanup
    End If

    Set m_Op = New ExpedienteOperaciones
    Set m_Exp = New Expediente
    m_Exp.IDExpediente = m_IDExp
    Set m_Op.Expediente = m_Exp

    m_Op.EliminarRAC p_IDRac:=m_IDRac, p_Error:=m_Error, p_ForceCacheFailureForTest:=True
    If m_Error <> CONTROLLED_CACHE_FAILURE Then
        Test_EliminarRAC_StandaloneCacheFailureRollsBack = JsonFail("Expected controlled cache failure but got '" & m_Error & "'")
        GoTo Cleanup
    End If

    Set m_Recordset = m_Db.OpenRecordset( _
        "SELECT COUNT(*) AS RowCount" & _
        " FROM TbExpedientesRACS" & _
        " WHERE IDExpediente=" & m_IDExp & " AND IDRAC=" & m_IDRac & ";" _
    )
    m_RowCount = CLng(Nz(m_Recordset.Fields("RowCount").value, 0))
    If m_RowCount <> 1 Then
        Test_EliminarRAC_StandaloneCacheFailureRollsBack = JsonFail("Source delete was persisted despite cache failure")
        GoTo Cleanup
    End If

    Test_EliminarRAC_StandaloneCacheFailureRollsBack = JsonOK("rollback_enforced_for_eliminar_rac")

Cleanup:
    On Error Resume Next
    If Not m_Recordset Is Nothing Then
        m_Recordset.Close
        Set m_Recordset = Nothing
    End If
    If Not m_Db Is Nothing Then
        Call TeardownExpedienteRacFixture(CLng(m_IDExp), CLng(m_IDRac), m_Error)
        m_Db.Close
        Set m_Db = Nothing
    End If
    Exit Function

EH:
    Test_EliminarRAC_StandaloneCacheFailureRollsBack = JsonFail(Err.Description)
    Resume Cleanup
End Function

Public Function Test_CacheFixture_SeedIsIdempotent_ForLugar() As String
    On Error GoTo EH
    Dim m_Error As String
    Dim m_Db As DAO.Database
    Dim m_Rs As DAO.Recordset
    Dim m_Count As Long
    Dim m_IDExp As Long
    Dim m_IDLugar As Long

    m_IDExp = TEST_ID_BASE + 61
    m_IDLugar = 9001

    If Not EnsureSandboxBackend(m_Error) Then
        Test_CacheFixture_SeedIsIdempotent_ForLugar = JsonFail(m_Error)
        Exit Function
    End If

    If Not SeedExpedienteLugarFixture(m_IDExp, m_IDLugar, m_Error) Then
        Test_CacheFixture_SeedIsIdempotent_ForLugar = JsonFail(m_Error)
        Exit Function
    End If
    If Not SeedExpedienteLugarFixture(m_IDExp, m_IDLugar, m_Error) Then
        Test_CacheFixture_SeedIsIdempotent_ForLugar = JsonFail(m_Error)
        Exit Function
    End If

    Set m_Db = getdb(m_Error)
    Set m_Rs = m_Db.OpenRecordset("SELECT COUNT(*) AS RowCount FROM TbExpedientesLugaresEjecucion WHERE IDExpediente=" & m_IDExp & " AND IDLugarEjecucion=" & m_IDLugar & ";")
    m_Count = CLng(Nz(m_Rs!rowCount, 0))
    If m_Count <> 1 Then
        Test_CacheFixture_SeedIsIdempotent_ForLugar = JsonFail("Seed no idempotente para lugares")
    Else
        Test_CacheFixture_SeedIsIdempotent_ForLugar = JsonOK("seed_lugar_idempotent")
    End If

Cleanup:
    On Error Resume Next
    If Not m_Rs Is Nothing Then m_Rs.Close
    Set m_Rs = Nothing
    Call TeardownExpedienteLugarFixture(m_IDExp, m_IDLugar, m_Error)
    Exit Function
EH:
    Test_CacheFixture_SeedIsIdempotent_ForLugar = JsonFail(Err.Description)
    Resume Cleanup
End Function

Public Function Test_CacheFixture_TeardownIsIdempotent_ForRac() As String
    On Error GoTo EH
    Dim m_Error As String
    Dim m_IDExp As Long
    Dim m_IDRac As Long

    m_IDExp = TEST_ID_BASE + 71
    m_IDRac = 9001

    If Not EnsureSandboxBackend(m_Error) Then
        Test_CacheFixture_TeardownIsIdempotent_ForRac = JsonFail(m_Error)
        Exit Function
    End If

    If Not SeedExpedienteRacFixture(m_IDExp, m_IDRac, m_Error) Then
        Test_CacheFixture_TeardownIsIdempotent_ForRac = JsonFail(m_Error)
        Exit Function
    End If

    If Not TeardownExpedienteRacFixture(m_IDExp, m_IDRac, m_Error) Then
        Test_CacheFixture_TeardownIsIdempotent_ForRac = JsonFail(m_Error)
        Exit Function
    End If

    If Not TeardownExpedienteRacFixture(m_IDExp, m_IDRac, m_Error) Then
        Test_CacheFixture_TeardownIsIdempotent_ForRac = JsonFail(m_Error)
        Exit Function
    End If

    Test_CacheFixture_TeardownIsIdempotent_ForRac = JsonOK("teardown_rac_idempotent")
    Exit Function
EH:
    Test_CacheFixture_TeardownIsIdempotent_ForRac = JsonFail(Err.Description)
End Function

Private Sub SafeRollback( _
                    ByRef p_Workspace As DAO.Workspace, _
                    ByRef p_TransactionStarted As Boolean, _
                    Optional ByRef p_Error As String _
                    )
    On Error GoTo EH
    p_Error = ""

    If Not p_TransactionStarted Then Exit Sub
    If p_Workspace Is Nothing Then
        p_Error = "No se puede hacer rollback porque no existe workspace transaccional"
        p_TransactionStarted = False
        Exit Sub
    End If

    p_Workspace.Rollback
    p_TransactionStarted = False
    Exit Sub

EH:
    p_Error = "Rollback falló en test: " & Err.Description
    p_TransactionStarted = False
End Sub

