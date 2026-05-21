Attribute VB_Name = "Test_JsonConverter"
Option Compare Database
Option Explicit

' =============================================================================
' Test_JsonConverter — canonical helper migration slice
' Tests for TextoParsedoParaJSON / TextoParsedoParaTxt
' =============================================================================

Public Function Test_JsonConverter_TextoParsedoParaJSON_escapes_newlines() As String
    Dim logs(0 To 4) As String
    logs(0) = "Arrange input with newline"

    Dim txt As String
    txt = "line1" & vbNewLine & "line2"

    Dim result As String
    Dim p_Error As String
    p_Error = ""
    result = TextoParsedoParaJSON(txt, p_Error)
    logs(1) = "Act TextoParsedoParaJSON"

    If p_Error <> "" Then
        logs(2) = "Fail unexpected error"
        Test_JsonConverter_TextoParsedoParaJSON_escapes_newlines = BuildJsonFail("unexpected error: " & p_Error, logs)
        Exit Function
    End If

    Dim hasRawNewline As Boolean
    hasRawNewline = (InStr(result, vbNewLine) > 0 Or InStr(result, Chr(10)) > 0 Or InStr(result, Chr(13)) > 0)

    If hasRawNewline Then
        logs(2) = "Assert failed: raw newline detected"
        Test_JsonConverter_TextoParsedoParaJSON_escapes_newlines = BuildJsonFail("raw newline found in result: " & result, logs)
    Else
        logs(2) = "Assert escaped newline"
        Test_JsonConverter_TextoParsedoParaJSON_escapes_newlines = BuildJsonOk(result, logs)
    End If
End Function

Public Function Test_JsonConverter_TextoParsedoParaJSON_plain_text() As String
    Dim logs(0 To 4) As String
    logs(0) = "Arrange plain text"

    Dim txt As String
    txt = "hola mundo"

    Dim result As String
    Dim p_Error As String
    p_Error = ""
    result = TextoParsedoParaJSON(txt, p_Error)
    logs(1) = "Act TextoParsedoParaJSON"

    If p_Error <> "" Then
        logs(2) = "Fail unexpected error"
        Test_JsonConverter_TextoParsedoParaJSON_plain_text = BuildJsonFail("unexpected error: " & p_Error, logs)
        Exit Function
    End If

    If result = txt Then
        logs(2) = "Assert output equals input"
        Test_JsonConverter_TextoParsedoParaJSON_plain_text = BuildJsonOk(result, logs)
    Else
        logs(2) = "Assert failed: mismatch"
        Test_JsonConverter_TextoParsedoParaJSON_plain_text = BuildJsonFail("expected '" & txt & "' got '" & result & "'", logs)
    End If
End Function

Public Function Test_JsonConverter_TextoParsedoParaJSON_escapes_backslash() As String
    Dim logs(0 To 4) As String
    logs(0) = "Arrange path with backslashes"

    Dim txt As String
    txt = "path\to\file"

    Dim result As String
    Dim p_Error As String
    p_Error = ""
    result = TextoParsedoParaJSON(txt, p_Error)
    logs(1) = "Act TextoParsedoParaJSON"

    If p_Error <> "" Then
        logs(2) = "Fail unexpected error"
        Test_JsonConverter_TextoParsedoParaJSON_escapes_backslash = BuildJsonFail("unexpected error: " & p_Error, logs)
        Exit Function
    End If

    Dim hasBackslash As Boolean
    hasBackslash = (InStr(result, "\") > 0)

    If hasBackslash Then
        logs(2) = "Assert failed: backslash remained"
        Test_JsonConverter_TextoParsedoParaJSON_escapes_backslash = BuildJsonFail("backslash not escaped in result: " & result, logs)
    Else
        logs(2) = "Assert slash normalization"
        Test_JsonConverter_TextoParsedoParaJSON_escapes_backslash = BuildJsonOk(result, logs)
    End If
End Function

Public Function Test_JsonConverter_TextoParsedoParaTxt_restores_newline() As String
    Dim logs(0 To 5) As String
    logs(0) = "Arrange text roundtrip"

    Dim txt As String
    txt = "line1" & vbNewLine & "line2"

    Dim p_Error As String
    p_Error = ""

    Dim jsonResult As String
    jsonResult = TextoParsedoParaJSON(txt, p_Error)
    logs(1) = "Act to JSON"

    If p_Error <> "" Then
        logs(2) = "Fail JSON conversion error"
        Test_JsonConverter_TextoParsedoParaTxt_restores_newline = BuildJsonFail("unexpected error in JSON: " & p_Error, logs)
        Exit Function
    End If

    Dim txtResult As String
    txtResult = TextoParsedoParaTxt(jsonResult, p_Error)
    logs(2) = "Act to TXT"

    If p_Error <> "" Then
        logs(3) = "Fail TXT conversion error"
        Test_JsonConverter_TextoParsedoParaTxt_restores_newline = BuildJsonFail("unexpected error in TXT: " & p_Error, logs)
        Exit Function
    End If

    If txtResult = txt Then
        logs(3) = "Assert roundtrip equals original"
        Test_JsonConverter_TextoParsedoParaTxt_restores_newline = BuildJsonOk(txtResult, logs)
    Else
        logs(3) = "Assert failed: roundtrip mismatch"
        Test_JsonConverter_TextoParsedoParaTxt_restores_newline = BuildJsonFail("expected '" & txt & "' got '" & txtResult & "'", logs)
    End If
End Function
