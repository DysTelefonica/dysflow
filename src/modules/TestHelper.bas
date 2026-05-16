Attribute VB_Name = "TestHelper"
Option Compare Database
Option Explicit

Public Function NewLogs() As Collection
    Set NewLogs = New Collection
End Function

Public Sub AddLog(ByRef p_Logs As Collection, ByVal p_Message As String)
    If p_Logs Is Nothing Then Set p_Logs = New Collection
    p_Logs.Add p_Message
End Sub

Public Function AssertTrue(ByVal p_Condition As Boolean, ByVal p_Message As String, ByRef p_Logs As Collection, Optional ByRef p_Error As String = "") As Boolean
    If p_Condition Then
        AddLog p_Logs, "ASSERT OK: " & p_Message
        AssertTrue = True
    Else
        p_Error = p_Message
        AddLog p_Logs, "ASSERT FAIL: " & p_Message
        AssertTrue = False
    End If
End Function

Public Function TestPass(ByRef p_Logs As Collection, Optional ByVal p_Value As Variant) As String
    Dim m_Payload As Object
    Set m_Payload = CreateObject("Scripting.Dictionary")
    m_Payload("ok") = True
    m_Payload("error") = ""
    m_Payload("logs") = CollectionToArray(p_Logs)
    If IsMissing(p_Value) Then
        m_Payload("value") = Null
    Else
        m_Payload("value") = p_Value
    End If
    TestPass = JsonConverter.ConvertToJson(m_Payload)
End Function

Public Function BuildJsonOk(ByRef p_Logs As Collection, Optional ByVal p_Value As Variant) As String
    BuildJsonOk = TestPass(p_Logs, p_Value)
End Function

Public Function TestFail(ByVal p_Error As String, ByRef p_Logs As Collection) As String
    Dim m_Payload As Object
    Set m_Payload = CreateObject("Scripting.Dictionary")
    m_Payload("ok") = False
    m_Payload("error") = p_Error
    m_Payload("logs") = CollectionToArray(p_Logs)
    m_Payload("value") = Null
    TestFail = JsonConverter.ConvertToJson(m_Payload)
End Function

Public Function BuildJsonFail(ByVal p_Error As String, ByRef p_Logs As Collection) As String
    BuildJsonFail = TestFail(p_Error, p_Logs)
End Function

Public Function SqlText(ByVal p_Value As String) As String
    SqlText = "'" & Replace(p_Value, "'", "''") & "'"
End Function

Private Function CollectionToArray(ByRef p_Items As Collection) As Variant
    Dim m_Result() As String
    Dim i As Long

    If p_Items Is Nothing Then
        CollectionToArray = Array()
        Exit Function
    End If

    ReDim m_Result(0 To p_Items.count - 1)
    For i = 1 To p_Items.count
        m_Result(i - 1) = CStr(p_Items(i))
    Next i
    CollectionToArray = m_Result
End Function
