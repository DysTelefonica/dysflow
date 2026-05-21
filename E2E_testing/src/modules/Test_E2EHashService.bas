Attribute VB_Name = "Test_E2EHashService"
Option Compare Database
Option Explicit

Public Function Test_E2EHashService_HashIgnoresRootMeta(Optional ByRef p_Error As String) As String
    Dim jsonA As String
    Dim jsonB As String
    Dim hashA As String
    Dim hashB As String
    p_Error = ""

    jsonA = "{""meta"":{""generatedAt"":""2026-05-18T10:00:00.000Z"",""batchid"":""B-001""},""data"":[{""nemotecnico"":""EXP-1"",""titulo"":""Titulo A"",""importecontratacion"":1000}]}"
    jsonB = "{""meta"":{""generatedAt"":""2030-01-01T00:00:00.000Z"",""batchid"":""B-999""},""data"":[{""nemotecnico"":""EXP-1"",""titulo"":""Titulo A"",""importecontratacion"":1000}]}"

    hashA = GetCanonicalPayloadHashForJson(jsonA, p_Error)
    If p_Error <> "" Then
        Test_E2EHashService_HashIgnoresRootMeta = JsonOK(False, p_Error)
        Exit Function
    End If

    hashB = GetCanonicalPayloadHashForJson(jsonB, p_Error)
    If p_Error <> "" Then
        Test_E2EHashService_HashIgnoresRootMeta = JsonOK(False, p_Error)
        Exit Function
    End If

    Test_E2EHashService_HashIgnoresRootMeta = JsonOK(hashA = hashB, "root meta excluded from canonical hash")
End Function

Public Function Test_E2EHashService_HashChangesWhenSignificantFieldChanges(Optional ByRef p_Error As String) As String
    Dim jsonA As String
    Dim jsonB As String
    Dim hashA As String
    Dim hashB As String
    p_Error = ""

    jsonA = "{""data"":[{""nemotecnico"":""EXP-1"",""titulo"":""Titulo A"",""importecontratacion"":1000}]}"
    jsonB = "{""data"":[{""nemotecnico"":""EXP-1"",""titulo"":""Titulo B"",""importecontratacion"":1000}]}"

    hashA = GetCanonicalPayloadHashForJson(jsonA, p_Error)
    If p_Error <> "" Then
        Test_E2EHashService_HashChangesWhenSignificantFieldChanges = JsonOK(False, p_Error)
        Exit Function
    End If

    hashB = GetCanonicalPayloadHashForJson(jsonB, p_Error)
    If p_Error <> "" Then
        Test_E2EHashService_HashChangesWhenSignificantFieldChanges = JsonOK(False, p_Error)
        Exit Function
    End If

    Test_E2EHashService_HashChangesWhenSignificantFieldChanges = JsonOK(hashA <> hashB, "changing significant payload field changes hash")
End Function

Public Function Test_E2EHashService_HashIgnoresTechnicalFields(Optional ByRef p_Error As String) As String
    Dim jsonA As String
    Dim jsonB As String
    Dim hashA As String
    Dim hashB As String
    p_Error = ""

    jsonA = "{""data"":[{""idexpediente"":10,""OrdinalE2E"":1,""nemotecnico"":""EXP-1"",""titulo"":""Titulo A""}]}"
    jsonB = "{""data"":[{""idexpediente"":999,""OrdinalE2E"":777,""nemotecnico"":""EXP-1"",""titulo"":""Titulo A""}]}"

    hashA = GetCanonicalPayloadHashForJson(jsonA, p_Error)
    If p_Error <> "" Then
        Test_E2EHashService_HashIgnoresTechnicalFields = JsonOK(False, p_Error)
        Exit Function
    End If

    hashB = GetCanonicalPayloadHashForJson(jsonB, p_Error)
    If p_Error <> "" Then
        Test_E2EHashService_HashIgnoresTechnicalFields = JsonOK(False, p_Error)
        Exit Function
    End If

    Test_E2EHashService_HashIgnoresTechnicalFields = JsonOK(hashA = hashB, "technical fields excluded from canonical hash")
End Function

Public Function Test_E2EHashService_ClassifyChangedHashAsPending(Optional ByRef p_Error As String) As String
    Dim state As String
    p_Error = ""
    state = ClassifyE2EExportState("ABC123", "FFF000")

    If state <> "ChangedSinceLastExport" Then
        Test_E2EHashService_ClassifyChangedHashAsPending = JsonOK(False, "expected ChangedSinceLastExport")
        Exit Function
    End If

    Test_E2EHashService_ClassifyChangedHashAsPending = JsonOK(IsE2EExportPending(state, p_Error) And p_Error = "", "hash change is pending")
End Function

Private Function JsonOK(ByVal p_Ok As Boolean, ByVal p_Value As String) As String
    JsonOK = "{""ok"":" & IIf(p_Ok, "true", "false") & ",""value"":""" & EscapeJsonString(p_Value) & """,""error"":null,""logs"":[] }"
End Function

Private Function EscapeJsonString(ByVal p_Text As String) As String
    Dim result As String
    result = p_Text
    result = Replace(result, "\", "\\")
    result = Replace(result, """", "\""")
    result = Replace(result, vbNewLine, "\n")
    result = Replace(result, Chr$(13), "\r")
    result = Replace(result, Chr$(10), "\n")
    EscapeJsonString = result
End Function
