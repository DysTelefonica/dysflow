Attribute VB_Name = "Test_E2EManagementService"
Option Compare Database
Option Explicit

Public Function Test_E2EManagement_StatusFilterPendingClause(Optional ByRef p_Error As String) As String
    Dim clause As String
    p_Error = ""

    clause = GetE2EIntegratedStatusWhereClause("pending", p_Error)
    If p_Error <> "" Then
        Test_E2EManagement_StatusFilterPendingClause = JsonOK(False, p_Error)
        Exit Function
    End If

    Test_E2EManagement_StatusFilterPendingClause = JsonOK(InStr(1, clause, "HashUltimaExportacion", vbTextCompare) > 0, "pending status clause generated")
End Function

Public Function Test_E2EManagement_PickerLeftExcludesRight(Optional ByRef p_Error As String) As String
    Dim leftCsv As String
    p_Error = ""

    leftCsv = BuildPickerAvailableCsv("1001,1002,1003", "1002", p_Error)
    If p_Error <> "" Then
        Test_E2EManagement_PickerLeftExcludesRight = JsonOK(False, p_Error)
        Exit Function
    End If

    Test_E2EManagement_PickerLeftExcludesRight = JsonOK(leftCsv = "1001,1003", "right selection is excluded from left")
End Function

Public Function Test_E2EManagement_RemoveRightRehydratesWhenMatches(Optional ByRef p_Error As String) As String
    Dim leftCsv As String
    p_Error = ""

    leftCsv = RehydrateFromRightRemoval(1002, True, "1001,1003", p_Error)
    If p_Error <> "" Then
        Test_E2EManagement_RemoveRightRehydratesWhenMatches = JsonOK(False, p_Error)
        Exit Function
    End If

    Test_E2EManagement_RemoveRightRehydratesWhenMatches = JsonOK(leftCsv = "1001,1003,1002", "removed item reappears on left when filter still matches")
End Function

Public Function Test_E2EManagement_RemoveRightDoesNotRehydrateWhenNoMatch(Optional ByRef p_Error As String) As String
    Dim leftCsv As String
    p_Error = ""

    leftCsv = RehydrateFromRightRemoval(1002, False, "1001,1003", p_Error)
    If p_Error <> "" Then
        Test_E2EManagement_RemoveRightDoesNotRehydrateWhenNoMatch = JsonOK(False, p_Error)
        Exit Function
    End If

    Test_E2EManagement_RemoveRightDoesNotRehydrateWhenNoMatch = JsonOK(leftCsv = "1001,1003", "removed item stays hidden when filter no longer matches")
End Function

Public Function Test_E2EManagement_TempSelectionSessionIsolation(Optional ByRef p_Error As String) As String
    Dim ok As Boolean
    Dim countA As Long
    Dim countB As Long
    Dim errLocal As String
    Dim logs(0 To 4) As String

    p_Error = ""
    errLocal = ""

    logs(0) = "Arrange: setup sandbox fixtures for session isolation"
    ok = SetupE2EBatchSchemaSandbox(errLocal)
    If Not ok Or errLocal <> "" Then
        p_Error = errLocal
        Test_E2EManagement_TempSelectionSessionIsolation = BuildJsonFail("sandbox setup failed: " & errLocal, logs)
        Exit Function
    End If

    ok = SetupE2ESelectionFixture("qa.user", "S-A", "910001,910002", errLocal)
    If Not ok Or errLocal <> "" Then
        p_Error = errLocal
        Test_E2EManagement_TempSelectionSessionIsolation = BuildJsonFail("setup S-A failed: " & errLocal, logs)
        Exit Function
    End If

    ok = SetupE2ESelectionFixture("qa.user", "S-B", "920001", errLocal)
    If Not ok Or errLocal <> "" Then
        p_Error = errLocal
        Test_E2EManagement_TempSelectionSessionIsolation = BuildJsonFail("setup S-B failed: " & errLocal, logs)
        Exit Function
    End If

    countA = CountSelectionTempRows("qa.user", "S-A", errLocal)
    If errLocal <> "" Then
        p_Error = errLocal
        Test_E2EManagement_TempSelectionSessionIsolation = BuildJsonFail(errLocal, logs)
        Exit Function
    End If

    countB = CountSelectionTempRows("qa.user", "S-B", errLocal)
    If errLocal <> "" Then
        p_Error = errLocal
        Test_E2EManagement_TempSelectionSessionIsolation = BuildJsonFail(errLocal, logs)
        Exit Function
    End If

    logs(1) = "Act: counted rows for S-A=" & CStr(countA) & " and S-B=" & CStr(countB)
    logs(2) = "Teardown: cleaning sandbox fixtures"
    If Not TeardownE2EBatchSchemaSandbox(errLocal) Then
        p_Error = errLocal
        Test_E2EManagement_TempSelectionSessionIsolation = BuildJsonFail("teardown failed: " & errLocal, logs)
        Exit Function
    End If

    logs(3) = "Assert: rows isolated by UsuarioConectado + SessionId"
    Test_E2EManagement_TempSelectionSessionIsolation = JsonOK((countA = 2 And countB = 1), "temp rows are isolated by UsuarioConectado + SessionId")
End Function

Public Function Test_E2EManagement_DestinationIsolatedByUsuarioRed(Optional ByRef p_Error As String) As String
    Dim errLocal As String
    Dim rutaA As String
    Dim rutaB As String
    Dim readA As String
    Dim readB As String
    Dim statusA As String
    Dim statusB As String
    Dim canRunA As Boolean
    Dim canRunB As Boolean

    p_Error = ""
    errLocal = ""

    If Not SetupE2EBatchSchemaSandbox(errLocal) Then
        p_Error = errLocal
        Test_E2EManagement_DestinationIsolatedByUsuarioRed = JsonOK(False, "sandbox setup failed: " & errLocal)
        Exit Function
    End If

    rutaA = BuildWritableTempPath("qa_user_a")
    rutaB = BuildWritableTempPath("qa_user_b")

    If Not SetE2EJsonDestination("qa.user.a", rutaA, errLocal) Or errLocal <> "" Then
        p_Error = errLocal
        Test_E2EManagement_DestinationIsolatedByUsuarioRed = JsonOK(False, "cannot persist destination for user A: " & errLocal)
        Exit Function
    End If

    errLocal = ""
    If Not SetE2EJsonDestination("qa.user.b", rutaB, errLocal) Or errLocal <> "" Then
        p_Error = errLocal
        Test_E2EManagement_DestinationIsolatedByUsuarioRed = JsonOK(False, "cannot persist destination for user B: " & errLocal)
        Exit Function
    End If

    errLocal = ""
    readA = GetE2EJsonDestination("qa.user.a", errLocal)
    If errLocal <> "" Then
        p_Error = errLocal
        Test_E2EManagement_DestinationIsolatedByUsuarioRed = JsonOK(False, "cannot read destination for user A: " & errLocal)
        Exit Function
    End If

    errLocal = ""
    readB = GetE2EJsonDestination("qa.user.b", errLocal)
    If errLocal <> "" Then
        p_Error = errLocal
        Test_E2EManagement_DestinationIsolatedByUsuarioRed = JsonOK(False, "cannot read destination for user B: " & errLocal)
        Exit Function
    End If

    errLocal = ""
    statusA = GetE2EJsonDestinationStatus("qa.user.a", errLocal)
    If errLocal <> "" Then
        p_Error = errLocal
        Test_E2EManagement_DestinationIsolatedByUsuarioRed = JsonOK(False, "status for user A failed: " & errLocal)
        Exit Function
    End If

    errLocal = ""
    statusB = GetE2EJsonDestinationStatus("qa.user.b", errLocal)
    If errLocal <> "" Then
        p_Error = errLocal
        Test_E2EManagement_DestinationIsolatedByUsuarioRed = JsonOK(False, "status for user B failed: " & errLocal)
        Exit Function
    End If

    errLocal = ""
    canRunA = CanRunManualE2EJsonGeneration("qa.user.a", errLocal)
    If errLocal <> "" Then
        p_Error = errLocal
        Test_E2EManagement_DestinationIsolatedByUsuarioRed = JsonOK(False, "preflight for user A failed: " & errLocal)
        Exit Function
    End If

    errLocal = ""
    canRunB = CanRunManualE2EJsonGeneration("qa.user.b", errLocal)
    If errLocal <> "" Then
        p_Error = errLocal
        Test_E2EManagement_DestinationIsolatedByUsuarioRed = JsonOK(False, "preflight for user B failed: " & errLocal)
        Exit Function
    End If

    If Not TeardownE2EBatchSchemaSandbox(errLocal) Then
        p_Error = errLocal
        Test_E2EManagement_DestinationIsolatedByUsuarioRed = JsonOK(False, "sandbox teardown failed: " & errLocal)
        Exit Function
    End If

    Test_E2EManagement_DestinationIsolatedByUsuarioRed = JsonOK( _
        (readA = rutaA) And (readB = rutaB) And (statusA = "ok") And (statusB = "ok") And canRunA And canRunB, _
        "destination config is isolated and valid per UsuarioRed")
End Function

Public Function Test_E2EManagement_DestinationMissingOrInvalidStatus(Optional ByRef p_Error As String) As String
    Dim errLocal As String
    Dim missingStatus As String
    Dim invalidStatus As String
    Dim canRunMissing As Boolean
    Dim canRunInvalid As Boolean
    Dim invalidPath As String

    p_Error = ""
    errLocal = ""

    If Not SetupE2EBatchSchemaSandbox(errLocal) Then
        p_Error = errLocal
        Test_E2EManagement_DestinationMissingOrInvalidStatus = JsonOK(False, "sandbox setup failed: " & errLocal)
        Exit Function
    End If

    missingStatus = GetE2EJsonDestinationStatus("qa.user.missing", errLocal)
    If errLocal <> "" Then
        p_Error = errLocal
        Test_E2EManagement_DestinationMissingOrInvalidStatus = JsonOK(False, "missing status check failed: " & errLocal)
        Exit Function
    End If

    errLocal = ""
    canRunMissing = CanRunManualE2EJsonGeneration("qa.user.missing", errLocal)
    If errLocal <> "" Then
        p_Error = errLocal
        Test_E2EManagement_DestinationMissingOrInvalidStatus = JsonOK(False, "missing preflight check failed: " & errLocal)
        Exit Function
    End If

    invalidPath = BuildInvalidTempPath("qa_user_invalid")
    errLocal = ""
    If Not SetE2EJsonDestination("qa.user.invalid", invalidPath, errLocal) Or errLocal <> "" Then
        p_Error = errLocal
        Test_E2EManagement_DestinationMissingOrInvalidStatus = JsonOK(False, "cannot persist invalid path for status test: " & errLocal)
        Exit Function
    End If

    errLocal = ""
    invalidStatus = GetE2EJsonDestinationStatus("qa.user.invalid", errLocal)
    If errLocal <> "" Then
        p_Error = errLocal
        Test_E2EManagement_DestinationMissingOrInvalidStatus = JsonOK(False, "invalid status check failed: " & errLocal)
        Exit Function
    End If

    errLocal = ""
    canRunInvalid = CanRunManualE2EJsonGeneration("qa.user.invalid", errLocal)
    If errLocal <> "" Then
        p_Error = errLocal
        Test_E2EManagement_DestinationMissingOrInvalidStatus = JsonOK(False, "invalid preflight check failed: " & errLocal)
        Exit Function
    End If

    If Not TeardownE2EBatchSchemaSandbox(errLocal) Then
        p_Error = errLocal
        Test_E2EManagement_DestinationMissingOrInvalidStatus = JsonOK(False, "sandbox teardown failed: " & errLocal)
        Exit Function
    End If

    Test_E2EManagement_DestinationMissingOrInvalidStatus = JsonOK( _
        (missingStatus = "missing") And (invalidStatus = "invalid") And (Not canRunMissing) And (Not canRunInvalid), _
        "destination status reports missing/invalid and blocks generation")
End Function

Private Function JsonOK(ByVal p_Ok As Boolean, ByVal p_Value As String) As String
    Dim logs(0 To 0) As String
    logs(0) = p_Value
    If p_Ok Then
        JsonOK = BuildJsonOk(p_Value, logs)
    Else
        JsonOK = BuildJsonFail(p_Value, logs)
    End If
End Function

Private Function BuildWritableTempPath(ByVal p_Token As String) As String
    Dim basePath As String
    basePath = Environ$("TEMP")
    If Right$(basePath, 1) <> "\" Then basePath = basePath & "\"
    BuildWritableTempPath = basePath & "expedientes_e2e_destination_" & p_Token
    If Not fso.FolderExists(BuildWritableTempPath) Then fso.CreateFolder BuildWritableTempPath
End Function

Private Function BuildInvalidTempPath(ByVal p_Token As String) As String
    Dim basePath As String
    basePath = Environ$("TEMP")
    If Right$(basePath, 1) <> "\" Then basePath = basePath & "\"
    BuildInvalidTempPath = basePath & "expedientes_e2e_destination_invalid_" & p_Token & "_" & Format$(Now, "yyyymmddhhnnss")
End Function

