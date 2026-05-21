Attribute VB_Name = "E2EHashService"
Option Compare Database
Option Explicit

' Significant payload hash rules for E2E pending detection.
' Included fields are the canonical payload under root `data`.
' Excluded technical/non-significant keys (removed before hashing):
' - idexpediente
' - idexpedientepadre
' - ordinale2e / OrdinalE2E
' - hashactual
' - hashultimaexportacion
' - idexportacion
' - batchid
' Root `meta` is always excluded.

Public Function GetCanonicalPayloadHashForJson(ByVal p_Json As String, Optional ByRef p_Error As String) As String
    On Error GoTo ErrorHandler

    Dim parsed As Object
    Dim payload As Object
    Dim normalizedPayload As Object
    Dim canonical As String

    p_Error = ""
    Set parsed = JsonConverter.ParseJson(p_Json)
    Set payload = ResolvePayloadForHash(parsed)
    Set normalizedPayload = CloneObjectForHash(payload)

    canonical = JsonConverter.ConvertToJson(normalizedPayload)
    GetCanonicalPayloadHashForJson = Fnv1a32Hex(canonical)
    Exit Function

ErrorHandler:
    p_Error = "GetCanonicalPayloadHashForJson: " & Err.Description
    GetCanonicalPayloadHashForJson = ""
End Function

Public Function GetCanonicalPayloadHashForExpediente(ByVal p_IDExpediente As Long, Optional ByRef p_Error As String) As String
    On Error GoTo ErrorHandler

    Dim jsonCanonico As String

    p_Error = ""
    jsonCanonico = GenerarJsonE2ECanonicoPorLista(CStr(p_IDExpediente), p_Error)
    If p_Error <> "" Then
        GetCanonicalPayloadHashForExpediente = ""
        Exit Function
    End If

    GetCanonicalPayloadHashForExpediente = GetCanonicalPayloadHashForJson(jsonCanonico, p_Error)
    Exit Function

ErrorHandler:
    p_Error = "GetCanonicalPayloadHashForExpediente: " & Err.Description
    GetCanonicalPayloadHashForExpediente = ""
End Function

Public Function ClassifyE2EExportState( _
    ByVal p_HashActual As String, _
    ByVal p_HashUltimaExportacion As Variant, _
    Optional ByVal p_NeverExported As Boolean = False, _
    Optional ByRef p_Error As String) As String

    On Error GoTo ErrorHandler

    Dim hashActual As String
    Dim hashUltima As String

    p_Error = ""
    hashActual = Trim$(Nz(p_HashActual, ""))
    hashUltima = NormalizeNullableText(p_HashUltimaExportacion)

    If p_NeverExported Or hashUltima = "" Then
        ClassifyE2EExportState = "NeverExported"
        Exit Function
    End If

    If StrComp(hashActual, hashUltima, vbBinaryCompare) = 0 Then
        ClassifyE2EExportState = "Exported"
    Else
        ClassifyE2EExportState = "ChangedSinceLastExport"
    End If
    Exit Function

ErrorHandler:
    p_Error = "ClassifyE2EExportState: " & Err.Description
    ClassifyE2EExportState = "Pending"
End Function

Public Function IsE2EExportPending(ByVal p_State As String, Optional ByRef p_Error As String) As Boolean
    On Error GoTo ErrorHandler

    p_Error = ""
    Select Case LCase$(Trim$(p_State))
        Case "pending", "neverexported", "changedsincelastexport"
            IsE2EExportPending = True
        Case Else
            IsE2EExportPending = False
    End Select
    Exit Function

ErrorHandler:
    p_Error = "IsE2EExportPending: " & Err.Description
    IsE2EExportPending = False
End Function

Private Function ResolvePayloadForHash(ByVal p_Parsed As Object) As Object
    If IsObject(p_Parsed) Then
        If TypeName(p_Parsed) = "Dictionary" Then
            If p_Parsed.exists("data") Then
                Set ResolvePayloadForHash = p_Parsed("data")
                Exit Function
            End If
        End If
    End If
    Set ResolvePayloadForHash = p_Parsed
End Function

Private Function CloneObjectForHash(ByVal p_Value As Object) As Object
    Dim i As Long
    Dim key As Variant
    Dim clonedDict As Object
    Dim clonedCollection As Collection

    Select Case TypeName(p_Value)
        Case "Dictionary"
            Set clonedDict = CreateObject("Scripting.Dictionary")
            For Each key In p_Value.keys
                If Not IsExcludedHashKey(CStr(key)) Then
                    If IsObject(p_Value(key)) Then
                        clonedDict.Add CStr(key), CloneObjectForHash(p_Value(key))
                    Else
                        clonedDict.Add CStr(key), p_Value(key)
                    End If
                End If
            Next key
            Set CloneObjectForHash = clonedDict
        Case "Collection"
            Set clonedCollection = New Collection
            For i = 1 To p_Value.Count
                If IsObject(p_Value(i)) Then
                    clonedCollection.Add CloneObjectForHash(p_Value(i))
                Else
                    clonedCollection.Add p_Value(i)
                End If
            Next i
            Set CloneObjectForHash = clonedCollection
        Case Else
            Set CloneObjectForHash = p_Value
    End Select
End Function

Private Function IsExcludedHashKey(ByVal p_Key As String) As Boolean
    Select Case LCase$(p_Key)
        Case "meta", "idexpediente", "idexpedientepadre", "ordinale2e", _
             "hashactual", "hashultimaexportacion", "idexportacion", "batchid"
            IsExcludedHashKey = True
    End Select
End Function

Private Function NormalizeNullableText(ByVal p_Value As Variant) As String
    If IsNull(p_Value) Then Exit Function
    NormalizeNullableText = Trim$(CStr(p_Value))
End Function

Private Function Fnv1a32Hex(ByVal p_Text As String) As String
    ' Stable non-cryptographic hash for change detection.
    ' Decimal modular form avoids unsigned 32-bit overflow pitfalls in VBA/Access.
    Const HASH_MOD As Double = 1000000007#
    Const HASH_MULTIPLIER As Double = 16777619#

    Dim bytes() As Byte
    Dim hashVal As Double
    Dim product As Double
    Dim i As Long

    bytes = Utf8Bytes(p_Text)
    hashVal = 216613626#

    For i = LBound(bytes) To UBound(bytes)
        product = (hashVal + CDbl(bytes(i))) * HASH_MULTIPLIER
        hashVal = product - HASH_MOD * Fix(product / HASH_MOD)
        If hashVal < 0 Then hashVal = hashVal + HASH_MOD
    Next i

    Fnv1a32Hex = Right$("0000000000" & CStr(CLng(hashVal)), 10)
End Function

Private Function Utf8Bytes(ByVal p_Text As String) As Byte()
    Dim stream As Object
    Set stream = CreateObject("ADODB.Stream")
    stream.Type = 2
    stream.Charset = "utf-8"
    stream.Open
    stream.WriteText p_Text
    stream.Position = 0
    stream.Type = 1
    stream.Position = 3 ' skip BOM
    Utf8Bytes = stream.Read
    stream.Close
End Function

