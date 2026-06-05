Attribute VB_Name = "NCAuditoriaGestionListadoHelper"
Option Compare Database
Option Explicit

' SDD audit-gestion-cache-helper Slice 2.
' UI-free helper for Form_FormNCAuditoriaGestion listing contracts.

Private Const LOG_TABLE As String = "TbLogCache"
Private Const LOG_OPERATION_FALLBACK As String = "FormAuditCacheFallback"
Private Const AUDIT_CACHE_TABLE As String = "TbCacheListadoNCAuditoria"

Public Function GetNCAuditoriaGestionFiltradas( _
    Optional ByVal p_IDAuditoria As Long = 0, _
    Optional ByVal p_Tipo As String = "", _
    Optional ByVal p_Descripcion As String = "", _
    Optional ByVal p_ResponsableImplantacion As String = "", _
    Optional ByVal p_Estado As String = "", _
    Optional ByVal p_PalabraClave As String = "", _
    Optional ByVal p_RequiereControlEficacia As String = "", _
    Optional ByVal p_ControlEficaciaRelleno As String = "", _
    Optional ByVal p_CacheEnabled As Variant, _
    Optional ByRef p_Error As String _
    ) As Collection

    Dim useCache As Boolean
    Dim reason As String

    On Error GoTo errores
    p_Error = ""

    If IsMissing(p_CacheEnabled) Then
        useCache = DefaultCacheEnabled()
    Else
        useCache = BoolValue(p_CacheEnabled)
    End If

    If useCache Then
        If TableExists(AUDIT_CACHE_TABLE) Then
            reason = "Audit cache source exists but no validated reader is implemented in this slice"
        Else
            reason = "Audit cache source not available: " & AUDIT_CACHE_TABLE
        End If
    Else
        reason = "Audit cache disabled"
    End If

    LogFallback reason
    Set GetNCAuditoriaGestionFiltradas = LoadFallbackAuditRows( _
                                            p_IDAuditoria:=p_IDAuditoria, _
                                            p_Tipo:=p_Tipo, _
                                            p_Descripcion:=p_Descripcion, _
                                            p_ResponsableImplantacion:=p_ResponsableImplantacion, _
                                            p_Estado:=p_Estado, _
                                            p_PalabraClave:=p_PalabraClave, _
                                            p_RequiereControlEficacia:=p_RequiereControlEficacia, _
                                            p_ControlEficaciaRelleno:=p_ControlEficaciaRelleno, _
                                            p_Error:=p_Error)
    Exit Function

errores:
    If Err.Number <> 1000 Then
        p_Error = "El método GetNCAuditoriaGestionFiltradas ha devuelto el error: " & Err.Description
    End If
End Function

Public Function BuildNCAuditoriaGestionListRow(ByVal p_Item As Object, Optional ByRef p_Error As String) As String
    Dim nc As NCAuditoria

    On Error GoTo errores
    p_Error = ""
    If p_Item Is Nothing Then Exit Function

    If TypeOf p_Item Is NCAuditoria Then
        Set nc = p_Item
        BuildNCAuditoriaGestionListRow = CStr(nc.id) & ";" & CStr(nc.IDAuditoria) & ";" & _
                                          CStr(nc.Tipo) & ";" & CStr(nc.Numero) & ";" & _
                                          CleanListValue(CStr(nc.Descripcion)) & ";" & _
                                          CleanListValue(CStr(nc.RESPONSABLEIMPLANTACION)) & ";" & _
                                          CleanListValue(CStr(nc.Estado)) & ";" & _
                                          CStr(nc.FechaApertura) & ";" & CStr(nc.FECHACIERRE)
    Else
        BuildNCAuditoriaGestionListRow = ReadText(p_Item, "ID") & ";" & ReadText(p_Item, "IDAuditoria") & ";" & _
                                          ReadText(p_Item, "Tipo") & ";" & ReadText(p_Item, "Numero") & ";" & _
                                          CleanListValue(ReadText(p_Item, "Descripcion")) & ";" & _
                                          CleanListValue(ReadText(p_Item, "RESPONSABLEIMPLANTACION")) & ";" & _
                                          CleanListValue(ReadText(p_Item, "Estado")) & ";" & _
                                          ReadText(p_Item, "FechaApertura") & ";" & ReadText(p_Item, "FECHACIERRE")
    End If
    Exit Function

errores:
    If Err.Number <> 1000 Then
        p_Error = "El método BuildNCAuditoriaGestionListRow ha devuelto el error: " & Err.Description
    End If
End Function

Public Function ResolveNCAuditoriaGestionSelection( _
    ByVal p_Current As NCAuditoria, _
    ByVal p_SelectedID As String, _
    Optional ByRef p_Error As String _
    ) As NCAuditoria

    On Error GoTo errores
    p_Error = ""
    If p_SelectedID = "" Then Exit Function

    If Not p_Current Is Nothing Then
        If CStr(p_Current.id) = CStr(p_SelectedID) Then
            Set ResolveNCAuditoriaGestionSelection = p_Current
            Exit Function
        End If
    End If

    Set ResolveNCAuditoriaGestionSelection = constructor.getNCAuditoria(p_IDNC:=p_SelectedID, p_Error:=p_Error)
    If p_Error <> "" Then Err.Raise 1000
    Exit Function

errores:
    If Err.Number <> 1000 Then
        p_Error = "El método ResolveNCAuditoriaGestionSelection ha devuelto el error: " & Err.Description
    End If
End Function

Public Function BuildNCAuditoriaGestionReportCollection( _
    ByVal p_ListedItems As Collection, _
    Optional ByRef p_Error As String _
    ) As Scripting.Dictionary

    Dim item As Object
    Dim nc As NCAuditoria
    Dim itemID As String
    Dim logged As Boolean
    Dim result As Scripting.Dictionary

    On Error GoTo errores
    p_Error = ""
    If p_ListedItems Is Nothing Then Exit Function
    If p_ListedItems.count = 0 Then
        p_Error = "No hay elementos de auditoría para preparar el informe"
        Exit Function
    End If

    Set result = New Scripting.Dictionary
    result.CompareMode = TextCompare
    For Each item In p_ListedItems
        itemID = GetAuditGestionItemID(item)
        If itemID <> "" Then
            If TypeOf item Is NCAuditoria Then
                Set nc = item
            Else
                If Not logged Then
                    LogFallback "Report-prep full detail hydration from audit list source"
                    logged = True
                End If
                Set nc = constructor.getNCAuditoria(p_IDNC:=itemID, p_Error:=p_Error)
                If p_Error <> "" Then Err.Raise 1000
            End If
            If Not nc Is Nothing Then
                If Not result.Exists(CStr(nc.id)) Then result.Add CStr(nc.id), nc
            End If
            Set nc = Nothing
        End If
    Next item

    If result.count > 0 Then Set BuildNCAuditoriaGestionReportCollection = result
    Exit Function

errores:
    If Err.Number <> 1000 Then
        p_Error = "El método BuildNCAuditoriaGestionReportCollection ha devuelto el error: " & Err.Description
    End If
End Function

Public Sub RefreshNCAuditoriaGestionCaches(Optional ByRef p_Error As String)
    On Error GoTo errores
    p_Error = ""
    If Not TableExists(AUDIT_CACHE_TABLE) Then LogFallback "Audit cache refresh skipped: validated audit cache source is not available"
    Exit Sub

errores:
    If Err.Number <> 1000 Then
        p_Error = "El método RefreshNCAuditoriaGestionCaches ha devuelto el error: " & Err.Description
    End If
End Sub

Private Function LoadFallbackAuditRows( _
    ByVal p_IDAuditoria As Long, _
    ByVal p_Tipo As String, _
    ByVal p_Descripcion As String, _
    ByVal p_ResponsableImplantacion As String, _
    ByVal p_Estado As String, _
    ByVal p_PalabraClave As String, _
    ByVal p_RequiereControlEficacia As String, _
    ByVal p_ControlEficaciaRelleno As String, _
    Optional ByRef p_Error As String _
    ) As Collection

    Dim rs As DAO.Recordset
    Dim col As Collection
    Dim nc As NCAuditoria
    Dim SQL As String

    On Error GoTo errores
    p_Error = ""
    SQL = "SELECT ID FROM TbNoConformidadesAuditoria WHERE 1=1" & _
          AuditWhere(p_IDAuditoria, p_Tipo, p_Descripcion, p_ResponsableImplantacion, p_Estado, p_PalabraClave, p_RequiereControlEficacia, p_ControlEficaciaRelleno) & _
          " ORDER BY Tipo, Numero;"
    Set rs = getdb().OpenRecordset(SQL, dbOpenSnapshot)
    If rs.EOF Then GoTo Cleanup

    Set col = New Collection
    Do While Not rs.EOF
        Set nc = constructor.getNCAuditoria(p_IDNC:=CStr(rs!ID), p_Error:=p_Error)
        If p_Error <> "" Then Err.Raise 1000
        If Not nc Is Nothing Then col.Add nc, CStr(nc.id)
        Set nc = Nothing
        rs.MoveNext
    Loop

    If col.count > 0 Then Set LoadFallbackAuditRows = col
Cleanup:
    If Not rs Is Nothing Then
        rs.Close
    End If
    Set rs = Nothing
    Exit Function

errores:
    If Err.Number <> 1000 Then
        p_Error = "El método LoadFallbackAuditRows ha devuelto el error: " & Err.Description
    End If
    Resume Cleanup
End Function

Private Function AuditWhere( _
    ByVal p_IDAuditoria As Long, ByVal p_Tipo As String, ByVal p_Descripcion As String, _
    ByVal p_ResponsableImplantacion As String, ByVal p_Estado As String, ByVal p_PalabraClave As String, _
    ByVal p_RequiereControlEficacia As String, ByVal p_ControlEficaciaRelleno As String) As String

    If p_IDAuditoria > 0 Then AuditWhere = AuditWhere & " AND IDAuditoria=" & CStr(p_IDAuditoria)
    If p_Tipo <> "" Then AuditWhere = AuditWhere & " AND Tipo Like " & LikeText(p_Tipo)
    If p_Descripcion <> "" Then AuditWhere = AuditWhere & " AND DESCRIPCION Like " & LikeText(p_Descripcion)
    If p_ResponsableImplantacion <> "" Then AuditWhere = AuditWhere & " AND RESPONSABLEIMPLANTACION Like " & LikeText(p_ResponsableImplantacion)
    If p_Estado <> "" Then AuditWhere = AuditWhere & " AND ESTADO=" & SqlText(p_Estado)
    If p_RequiereControlEficacia <> "" Then AuditWhere = AuditWhere & " AND RequiereControlEficacia=" & SqlText(p_RequiereControlEficacia)
    If p_ControlEficaciaRelleno = "Sí" Then AuditWhere = AuditWhere & " AND Len(Nz(ControlEficacia,''))>0"
    If p_ControlEficaciaRelleno = "No" Then AuditWhere = AuditWhere & " AND Len(Nz(ControlEficacia,''))=0"
    If p_PalabraClave <> "" Then
        AuditWhere = AuditWhere & " AND (DESCRIPCION Like " & LikeText(p_PalabraClave) & _
                     " OR CAUSARAIZ Like " & LikeText(p_PalabraClave) & _
                     " OR CORRECCION Like " & LikeText(p_PalabraClave) & _
                     " OR Notas Like " & LikeText(p_PalabraClave) & ")"
    End If
End Function

Private Function DefaultCacheEnabled() As Boolean
    On Error GoTo fallback
    DefaultCacheEnabled = IsCacheEnabled()
    Exit Function
fallback:
    DefaultCacheEnabled = False
End Function

Private Function BoolValue(ByVal p_Value As Variant) As Boolean
    On Error GoTo fallback
    BoolValue = CBool(p_Value)
    Exit Function
fallback:
    BoolValue = False
End Function

Private Function TableExists(ByVal p_TableName As String) As Boolean
    Dim tdf As DAO.TableDef

    On Error GoTo errores
    For Each tdf In getdb().TableDefs
        If StrComp(tdf.Name, p_TableName, vbTextCompare) = 0 Then
            TableExists = True
            Exit Function
        End If
    Next tdf
    Exit Function
errores:
    TableExists = False
End Function

Private Sub LogFallback(ByVal p_Detalle As String)
    Dim usuarioLog As String
    Dim SQL As String

    On Error Resume Next
    usuarioLog = SafeFallbackUser()
    SQL = "INSERT INTO " & LOG_TABLE & " (IDNoConformidad, TipoOperacion, Detalles, Usuario, Exito, DuracionMs, FechaOperacion) VALUES (" & _
          "0, " & SqlText(LOG_OPERATION_FALLBACK) & ", " & SqlText(p_Detalle) & ", " & SqlText(usuarioLog) & ", True, 0, Now());"
    getdb().Execute SQL, dbFailOnError
End Sub

Private Function SafeFallbackUser() As String
    On Error Resume Next
    SafeFallbackUser = "Sistema"
    If Not m_ObjUsuarioConectado Is Nothing Then
        If Nz(m_ObjUsuarioConectado.UsuarioRed, "") <> "" Then
            SafeFallbackUser = m_ObjUsuarioConectado.UsuarioRed
        ElseIf Nz(m_ObjUsuarioConectado.Nombre, "") <> "" Then
            SafeFallbackUser = m_ObjUsuarioConectado.Nombre
        End If
    End If
    If SafeFallbackUser = "" Then SafeFallbackUser = "Sistema"
End Function

Private Function GetAuditGestionItemID(ByVal p_Item As Object) As String
    Dim nc As NCAuditoria

    On Error Resume Next
    If p_Item Is Nothing Then Exit Function
    If TypeOf p_Item Is NCAuditoria Then
        Set nc = p_Item
        GetAuditGestionItemID = CStr(nc.id)
    Else
        GetAuditGestionItemID = ReadText(p_Item, "ID")
    End If
End Function

Private Function ReadText(ByVal p_Item As Object, ByVal p_Property As String) As String
    On Error Resume Next
    ReadText = CStr(CallByName(p_Item, p_Property, VbGet))
    If Err.Number <> 0 Then
        Err.Clear
        ReadText = ""
    End If
End Function

Private Function SqlText(ByVal p_Value As String) As String
    SqlText = "'" & Replace(p_Value, "'", "''") & "'"
End Function

Private Function LikeText(ByVal p_Value As String) As String
    LikeText = SqlText("*" & Replace(p_Value, "*", "[*]") & "*")
End Function

Private Function CleanListValue(ByVal p_Value As String) As String
    CleanListValue = Replace(p_Value, ";", ":")
End Function
