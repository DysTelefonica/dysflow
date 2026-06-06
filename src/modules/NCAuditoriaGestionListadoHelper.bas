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
    Dim cacheRows As Collection

    On Error GoTo errores
    p_Error = ""

    If IsMissing(p_CacheEnabled) Then
        useCache = DefaultCacheEnabled()
    Else
        useCache = BoolValue(p_CacheEnabled)
    End If

    If useCache Then
        Set cacheRows = TryReadNCAuditoriaListadoCache( _
                            p_IDAuditoria:=p_IDAuditoria, _
                            p_Tipo:=p_Tipo, _
                            p_Descripcion:=p_Descripcion, _
                            p_ResponsableImplantacion:=p_ResponsableImplantacion, _
                            p_Estado:=p_Estado, _
                            p_PalabraClave:=p_PalabraClave, _
                            p_RequiereControlEficacia:=p_RequiereControlEficacia, _
                            p_ControlEficaciaRelleno:=p_ControlEficaciaRelleno, _
                            p_FallbackReason:=reason, _
                            p_Error:=p_Error)
        If p_Error <> "" Then
            reason = p_Error
            p_Error = ""
        End If
        If Not cacheRows Is Nothing Then
            If cacheRows.count > 0 Then
                Set GetNCAuditoriaGestionFiltradas = cacheRows
                Exit Function
            End If
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
    Dim auditoria As Auditoria
    Dim auditoriaTexto As String

    On Error GoTo errores
    p_Error = ""
    If p_Item Is Nothing Then Exit Function

    If TypeOf p_Item Is NCAuditoria Then
        Set nc = p_Item
        Set auditoria = nc.Auditoria
        p_Error = nc.Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        If Not auditoria Is Nothing Then
            auditoriaTexto = auditoria.NombreAuditoria
        Else
            auditoriaTexto = "Desconocida"
        End If
        nc.EstadoGrabar
        BuildNCAuditoriaGestionListRow = CStr(nc.id) & ";" & CleanListValue(auditoriaTexto) & ";" & _
                                          CStr(nc.Tipo) & ";" & Format(nc.Numero, "00") & ";" & _
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
    If Not TableExists(AUDIT_CACHE_TABLE) Then
        LogFallback "Audit cache refresh skipped: validated audit cache source is not available"
    End If
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

    Dim source As Scripting.Dictionary
    Dim col As Collection
    Dim seen As Scripting.Dictionary
    Dim nc As NCAuditoria
    Dim itemKey As Variant

    On Error GoTo errores
    p_Error = ""

    If p_PalabraClave <> "" Then
        Set source = getNCsAuditoriaPorPalabraClave(p_PC:=p_PalabraClave, p_Error:=p_Error)
    Else
        If p_Estado = "Abiertas" Then
            Set source = constructor.getNCsAuditoriaAbiertas(p_Error:=p_Error)
        Else
            Set source = constructor.getNCsAuditoriasTotales(p_Error:=p_Error)
        End If
    End If
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If source Is Nothing Then
        Exit Function
    End If

    Set col = New Collection
    Set seen = New Scripting.Dictionary
    seen.CompareMode = TextCompare

    For Each itemKey In source
        Set nc = source(itemKey)
        If MatchesAuditGestionFilters( _
                p_NC:=nc, _
                p_IDAuditoria:=p_IDAuditoria, _
                p_Tipo:=p_Tipo, _
                p_Descripcion:=p_Descripcion, _
                p_ResponsableImplantacion:=p_ResponsableImplantacion, _
                p_Estado:=p_Estado, _
                p_RequiereControlEficacia:=p_RequiereControlEficacia, _
                p_ControlEficaciaRelleno:=p_ControlEficaciaRelleno) Then
            If Not seen.Exists(CStr(nc.id)) Then
                col.Add nc
                seen.Add CStr(nc.id), True
            End If
        End If
        Set nc = Nothing
    Next itemKey

    If col.count > 0 Then
        Set LoadFallbackAuditRows = col
    End If
    Exit Function

errores:
    If Err.Number <> 1000 Then
        p_Error = "El método LoadFallbackAuditRows ha devuelto el error: " & Err.Description
    End If
End Function

Private Function MatchesAuditGestionFilters( _
    ByVal p_NC As NCAuditoria, _
    ByVal p_IDAuditoria As Long, _
    ByVal p_Tipo As String, _
    ByVal p_Descripcion As String, _
    ByVal p_ResponsableImplantacion As String, _
    ByVal p_Estado As String, _
    ByVal p_RequiereControlEficacia As String, _
    ByVal p_ControlEficaciaRelleno As String _
    ) As Boolean

    Dim estadoTexto As String

    On Error GoTo noMatch
    If p_NC Is Nothing Then Exit Function

    If p_IDAuditoria > 0 Then
        If p_NC.IDAuditoria <> p_IDAuditoria Then Exit Function
    End If
    If p_Tipo <> "" Then
        If p_NC.Tipo <> p_Tipo Then Exit Function
    End If
    If p_Descripcion <> "" Then
        If InStr(1, p_NC.Descripcion, p_Descripcion) = 0 Then Exit Function
    End If
    If p_ResponsableImplantacion <> "" Then
        If p_NC.RESPONSABLEIMPLANTACION <> p_ResponsableImplantacion Then Exit Function
    End If
    If p_Estado <> "" Then
        If p_Estado <> "Abiertas" Then
            estadoTexto = m_ObjEntorno.ColEstadosNCTitulo(CStr(p_NC.EstadoEnum))
            If estadoTexto <> p_Estado Then Exit Function
        End If
    End If
    If p_RequiereControlEficacia <> "" Then
        If p_NC.RequiereControlEficacia <> p_RequiereControlEficacia Then Exit Function
    End If
    If p_ControlEficaciaRelleno = "Sí" Then
        If p_NC.ControlEficacia = "" Then Exit Function
    ElseIf p_ControlEficaciaRelleno = "No" Then
        If p_NC.ControlEficacia <> "" Then Exit Function
    End If

    MatchesAuditGestionFilters = True
    Exit Function

noMatch:
    MatchesAuditGestionFilters = False
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
    If TypeName(p_Item) = "Dictionary" Then
        If p_Item.Exists(p_Property) Then
            ReadText = CStr(p_Item(p_Property))
        Else
            ReadText = ""
        End If
    Else
        ReadText = CStr(CallByName(p_Item, p_Property, VbGet))
        If Err.Number <> 0 Then
            Err.Clear
            ReadText = ""
        End If
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
