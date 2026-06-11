Attribute VB_Name = "NCProyectoGestionListadoHelper"
Option Compare Database
Option Explicit

' SDD cache-form-filter-coverage W4b.
' UI-free helper for Form_FormNCProyectoGestion listing behavior.
' Owns cache selection, fallback logging, source selection, and predicates.

Private Const LOG_TABLE As String = "TbLogCache"
Private Const LOG_OPERATION_FALLBACK As String = "FormCacheFallback"

Public Function GetNCsProyectoGestionFiltrados( _
    Optional ByVal p_Codigo As String = "", _
    Optional ByVal p_IDExpediente As Long = 0, _
    Optional ByVal p_Juridica As String = "", _
    Optional ByVal p_IDTipo As Long = 0, _
    Optional ByVal p_EstadoValor As String = "", _
    Optional ByVal p_EstadoEnum As Long = 0, _
    Optional ByVal p_Descripcion As String = "", _
    Optional ByVal p_Notas As String = "", _
    Optional ByVal p_RequiereControlEficacia As String = "", _
    Optional ByVal p_ControlEficaciaRelleno As String = "", _
    Optional ByVal p_RegistrosCerrados As String = "", _
    Optional ByVal p_ResponsableTelefonica As String = "", _
    Optional ByVal p_ResponsableCalidad As String = "", _
    Optional ByVal p_Google As String = "", _
    Optional ByRef p_Error As String _
    ) As Collection

    Dim useCache As Boolean
    Dim cacheErr As String
    Dim cacheCol As Collection
    Dim fallbackReason As String

    On Error GoTo errores

    p_Error = ""
    useCache = IsCacheEnabled()

    If useCache Then
        Set cacheCol = GetListadoFiltradoSQL( _
                            p_Codigo:=p_Codigo, _
                            p_IDExpediente:=p_IDExpediente, _
                            p_IDTipo:=p_IDTipo, _
                            p_Estado:=ResolveEstadoFiltro(p_EstadoValor, p_EstadoEnum), _
                            p_Descripcion:=p_Descripcion, _
                            p_Notas:=p_Notas, _
                            p_RequiereCE:=p_RequiereControlEficacia, _
                            p_ControlEficacia:=p_ControlEficaciaRelleno, _
                            p_RegistrosCerrados:=p_RegistrosCerrados, _
                            p_ResponsableTelefonica:=p_ResponsableTelefonica, _
                            p_ResponsableCalidad:=p_ResponsableCalidad, _
                            p_Google:=p_Google, _
                            p_Juridica:=p_Juridica, _
                            p_Error:=cacheErr)
        If cacheErr = "" Then
            If Not cacheCol Is Nothing Then
                If cacheCol.count > 0 Then
                    Set GetNCsProyectoGestionFiltrados = cacheCol
                    Exit Function
                End If
            End If
        End If
        If cacheErr <> "" Then
            fallbackReason = "Cache error: " & cacheErr
        Else
            fallbackReason = "Cache vacía o no inicializada"
        End If
    Else
        fallbackReason = "Cache deshabilitada"
    End If

    LogFallback fallbackReason
    Set GetNCsProyectoGestionFiltrados = GetNCsProyectoGestionFallback( _
                                            p_Codigo:=p_Codigo, _
                                            p_IDExpediente:=p_IDExpediente, _
                                            p_Juridica:=p_Juridica, _
                                            p_IDTipo:=p_IDTipo, _
                                            p_EstadoValor:=p_EstadoValor, _
                                            p_EstadoEnum:=p_EstadoEnum, _
                                            p_Descripcion:=p_Descripcion, _
                                            p_Notas:=p_Notas, _
                                            p_RequiereControlEficacia:=p_RequiereControlEficacia, _
                                            p_ControlEficaciaRelleno:=p_ControlEficaciaRelleno, _
                                            p_RegistrosCerrados:=p_RegistrosCerrados, _
                                            p_ResponsableTelefonica:=p_ResponsableTelefonica, _
                                            p_ResponsableCalidad:=p_ResponsableCalidad, _
                                            p_Google:=p_Google, _
                                            p_Error:=p_Error)
    Exit Function

errores:
    If Err.Number <> 1000 Then
        p_Error = "El método GetNCsProyectoGestionFiltrados ha devuelto el error: " & Err.Description
    End If
End Function

Public Function BuildNCProyectoGestionListRow(ByVal p_Item As Object, Optional ByRef p_Error As String) As String
    Dim itemExpediente As String
    Dim itemFechaCierre As Variant
    Dim itemIDNoConformidad As String
    Dim itemCodigo As String
    Dim itemDescripcion As String
    Dim itemEstado As String
    Dim itemFechaApertura As Variant

    On Error GoTo errores

    p_Error = ""
    If p_Item Is Nothing Then Exit Function

    itemIDNoConformidad = CStr(CallByName(p_Item, "IDNoConformidad", VbGet))
    itemCodigo = CStr(CallByName(p_Item, "CodigoNoConformidad", VbGet))
    itemDescripcion = CStr(CallByName(p_Item, "Descripcion", VbGet))
    itemEstado = CStr(CallByName(p_Item, "Estado", VbGet))
    itemFechaApertura = CallByName(p_Item, "FechaApertura", VbGet)
    itemExpediente = ReadStringPropertyWithFallback(p_Item, "Expediente", "ExpedienteCalculadoTexto")
    itemFechaCierre = ReadVariantPropertyWithFallback(p_Item, "FechaCierre", "FECHACIERRE")

    BuildNCProyectoGestionListRow = itemIDNoConformidad & ";" & itemCodigo & ";" & _
                                    Replace(itemDescripcion, ";", ":") & ";" & _
                                    Replace(itemExpediente, ";", ":") & ";" & _
                                    itemEstado & ";" & itemFechaApertura & ";" & itemFechaCierre
    Exit Function

errores:
    If Err.Number <> 1000 Then
        p_Error = "El método BuildNCProyectoGestionListRow ha devuelto el error: " & Err.Description
    End If
End Function

Public Function ResolveNCProyectoGestionSelection( _
    ByVal p_Current As NCProyecto, _
    ByVal p_SelectedID As String, _
    Optional ByRef p_Error As String _
    ) As NCProyecto

    On Error GoTo errores

    p_Error = ""
    If p_SelectedID = "" Then Exit Function

    If Not p_Current Is Nothing Then
        If CStr(p_Current.IDNoConformidad) = CStr(p_SelectedID) Then
            Set ResolveNCProyectoGestionSelection = p_Current
            Exit Function
        End If
    End If

    Set ResolveNCProyectoGestionSelection = constructor.getNCProyecto( _
                                            p_IDNC:=p_SelectedID, _
                                            p_Error:=p_Error)
    If p_Error <> "" Then Err.Raise 1000
    Exit Function

errores:
    If Err.Number <> 1000 Then
        p_Error = "El método ResolveNCProyectoGestionSelection ha devuelto el error: " & Err.Description
    End If
End Function

Public Function BuildNCProyectoGestionReportCollection( _
    ByVal p_ListedItems As Collection, _
    Optional ByRef p_Error As String _
    ) As Scripting.Dictionary

    Dim item As Object
    Dim nc As NCProyecto
    Dim itemID As String
    Dim loggedDetailFallback As Boolean
    Dim result As Scripting.Dictionary

    On Error GoTo errores

    p_Error = ""
    If p_ListedItems Is Nothing Then Exit Function
    If p_ListedItems.count = 0 Then
        p_Error = "No hay elementos en la lista una vez tratados"
        Exit Function
    End If

    Set result = New Scripting.Dictionary
    result.CompareMode = TextCompare

    For Each item In p_ListedItems
        itemID = GetNCProyectoGestionItemID(item)
        If itemID <> "" Then
            If TypeOf item Is NCProyecto Then
                Set nc = item
            Else
                If Not loggedDetailFallback Then
                    LogFallback "Report-prep detail hydration from cache-backed project listing"
                    loggedDetailFallback = True
                End If
                Set nc = constructor.getNCProyecto(p_IDNC:=itemID, p_Error:=p_Error)
                If p_Error <> "" Then Err.Raise 1000
            End If

            If Not nc Is Nothing Then
                If Not result.Exists(CStr(nc.IDNoConformidad)) Then
                    result.Add CStr(nc.IDNoConformidad), nc
                End If
            End If
            Set nc = Nothing
        End If
    Next item

    If result.count > 0 Then Set BuildNCProyectoGestionReportCollection = result
    Exit Function

errores:
    If Err.Number <> 1000 Then
        p_Error = "El método BuildNCProyectoGestionReportCollection ha devuelto el error: " & Err.Description
    End If
End Function

Private Function GetNCsProyectoGestionFallback( _
    Optional ByVal p_Codigo As String = "", _
    Optional ByVal p_IDExpediente As Long = 0, _
    Optional ByVal p_Juridica As String = "", _
    Optional ByVal p_IDTipo As Long = 0, _
    Optional ByVal p_EstadoValor As String = "", _
    Optional ByVal p_EstadoEnum As Long = 0, _
    Optional ByVal p_Descripcion As String = "", _
    Optional ByVal p_Notas As String = "", _
    Optional ByVal p_RequiereControlEficacia As String = "", _
    Optional ByVal p_ControlEficaciaRelleno As String = "", _
    Optional ByVal p_RegistrosCerrados As String = "", _
    Optional ByVal p_ResponsableTelefonica As String = "", _
    Optional ByVal p_ResponsableCalidad As String = "", _
    Optional ByVal p_Google As String = "", _
    Optional ByRef p_Error As String _
    ) As Collection

    Dim sourceCol As Scripting.Dictionary
    Dim resultCol As Collection
    Dim id As Variant
    Dim nc As NCProyecto

    On Error GoTo errores

    p_Error = ""
    Set sourceCol = GetFallbackSource( _
                        p_EstadoValor:=p_EstadoValor, _
                        p_EstadoEnum:=p_EstadoEnum, _
                        p_Google:=p_Google, _
                        p_Error:=p_Error)
    If p_Error <> "" Then Err.Raise 1000
    If sourceCol Is Nothing Then Exit Function

    Set resultCol = New Collection
    For Each id In sourceCol
        Set nc = sourceCol(id)
        If ShouldIncludeFallbackNC( _
                p_NC:=nc, _
                p_Codigo:=p_Codigo, _
                p_IDExpediente:=p_IDExpediente, _
                p_Juridica:=p_Juridica, _
                p_IDTipo:=p_IDTipo, _
                p_EstadoValor:=p_EstadoValor, _
                p_EstadoEnum:=p_EstadoEnum, _
                p_Descripcion:=p_Descripcion, _
                p_Notas:=p_Notas, _
                p_RequiereControlEficacia:=p_RequiereControlEficacia, _
                p_ControlEficaciaRelleno:=p_ControlEficaciaRelleno, _
                p_RegistrosCerrados:=p_RegistrosCerrados, _
                p_ResponsableTelefonica:=p_ResponsableTelefonica, _
                p_ResponsableCalidad:=p_ResponsableCalidad) Then
            resultCol.Add nc, CStr(nc.IDNoConformidad)
        End If
        Set nc = Nothing
    Next id

    If resultCol.count > 0 Then Set GetNCsProyectoGestionFallback = resultCol
    Exit Function

errores:
    If Err.Number <> 1000 Then
        p_Error = "El método GetNCsProyectoGestionFallback ha devuelto el error: " & Err.Description
    End If
End Function

Private Function GetFallbackSource( _
    ByVal p_EstadoValor As String, _
    ByVal p_EstadoEnum As Long, _
    ByVal p_Google As String, _
    Optional ByRef p_Error As String _
    ) As Scripting.Dictionary

    On Error GoTo errores

    p_Error = ""
    If p_EstadoValor = "Abiertas" Then
        Set GetFallbackSource = constructor.getNCsProyectoAbiertas(p_Error:=p_Error)
    ElseIf p_EstadoEnum = 0 And p_EstadoValor <> "" Then
        Set GetFallbackSource = constructor.getNCsProyectoAbiertas(p_Error:=p_Error)
    ElseIf p_Google <> "" Then
        Set GetFallbackSource = getNCsProyectoPorPalabraClave(p_PC:=p_Google, p_Error:=p_Error)
    Else
        Set GetFallbackSource = constructor.getNCsProyectosTotales(p_Error:=p_Error)
    End If
    Exit Function

errores:
    If Err.Number <> 1000 Then
        p_Error = "El método GetFallbackSource ha devuelto el error: " & Err.Description
    End If
End Function

Private Function ShouldIncludeFallbackNC( _
    ByVal p_NC As NCProyecto, _
    ByVal p_Codigo As String, _
    ByVal p_IDExpediente As Long, _
    ByVal p_Juridica As String, _
    ByVal p_IDTipo As Long, _
    ByVal p_EstadoValor As String, _
    ByVal p_EstadoEnum As Long, _
    ByVal p_Descripcion As String, _
    ByVal p_Notas As String, _
    ByVal p_RequiereControlEficacia As String, _
    ByVal p_ControlEficaciaRelleno As String, _
    ByVal p_RegistrosCerrados As String, _
    ByVal p_ResponsableTelefonica As String, _
    ByVal p_ResponsableCalidad As String _
    ) As Boolean

    On Error GoTo errores

    If p_NC Is Nothing Then Exit Function
    If Not HasAnyFilter( _
            p_Codigo:=p_Codigo, _
            p_IDExpediente:=p_IDExpediente, _
            p_Juridica:=p_Juridica, _
            p_IDTipo:=p_IDTipo, _
            p_EstadoValor:=p_EstadoValor, _
            p_Descripcion:=p_Descripcion, _
            p_Notas:=p_Notas, _
            p_RequiereControlEficacia:=p_RequiereControlEficacia, _
            p_ControlEficaciaRelleno:=p_ControlEficaciaRelleno, _
            p_RegistrosCerrados:=p_RegistrosCerrados, _
            p_ResponsableTelefonica:=p_ResponsableTelefonica, _
            p_ResponsableCalidad:=p_ResponsableCalidad) Then
        ShouldIncludeFallbackNC = True
        Exit Function
    End If

    With p_NC
        If p_Codigo <> "" Then
            If .CodigoNoConformidad <> p_Codigo Then Exit Function
        End If
        If p_IDExpediente > 0 Then
            If CLng(Val(Nz(.IDExpediente, "0"))) <> p_IDExpediente Then Exit Function
        End If
        If p_Juridica <> "" Then
            If InStr(1, .JuridicaExp, p_Juridica, vbTextCompare) = 0 Then Exit Function
        End If
        If p_IDTipo > 0 Then
            If CLng(Val(Nz(.IDTipo, "0"))) <> p_IDTipo Then Exit Function
        End If
        If p_Descripcion <> "" Then
            If InStr(1, .Descripcion, p_Descripcion, vbTextCompare) = 0 Then Exit Function
        End If
        If p_Notas <> "" Then
            If InStr(1, .Notas, p_Notas, vbTextCompare) = 0 Then Exit Function
        End If
        If p_RequiereControlEficacia <> "" Then
            If .RequiereControlEficacia <> p_RequiereControlEficacia Then Exit Function
        End If
        If p_ControlEficaciaRelleno = "Sí" Then
            If .ControlEficacia = "" Then Exit Function
        ElseIf p_ControlEficaciaRelleno = "No" Then
            If .ControlEficacia <> "" Then Exit Function
        End If
        If p_RegistrosCerrados = "Sí" Then
            If Not IsDate(.FECHACIERRE) Then Exit Function
        ElseIf p_RegistrosCerrados = "No" Then
            If IsDate(.FECHACIERRE) Then Exit Function
        End If
        If p_ResponsableTelefonica <> "" Then
            If .ResponsableTelefonicaObj Is Nothing Then Exit Function
            If .ResponsableTelefonicaObj.Nombre <> p_ResponsableTelefonica Then Exit Function
        End If
        If p_ResponsableCalidad <> "" Then
            If .RESPONSABLECALIDAD <> p_ResponsableCalidad Then Exit Function
        End If
        If p_EstadoValor <> "" And p_EstadoValor <> "Abiertas" Then
            If .Estado <> ResolveEstadoFiltro(p_EstadoValor, p_EstadoEnum) Then Exit Function
        End If
    End With

    ShouldIncludeFallbackNC = True
    Exit Function

errores:
    ShouldIncludeFallbackNC = False
End Function

Private Function HasAnyFilter( _
    ByVal p_Codigo As String, _
    ByVal p_IDExpediente As Long, _
    ByVal p_Juridica As String, _
    ByVal p_IDTipo As Long, _
    ByVal p_EstadoValor As String, _
    ByVal p_Descripcion As String, _
    ByVal p_Notas As String, _
    ByVal p_RequiereControlEficacia As String, _
    ByVal p_ControlEficaciaRelleno As String, _
    ByVal p_RegistrosCerrados As String, _
    ByVal p_ResponsableTelefonica As String, _
    ByVal p_ResponsableCalidad As String _
    ) As Boolean

    HasAnyFilter = (p_Codigo <> "" Or p_IDExpediente > 0 Or p_Juridica <> "" Or _
                    p_IDTipo > 0 Or p_EstadoValor <> "" Or p_Descripcion <> "" Or _
                    p_Notas <> "" Or p_RequiereControlEficacia <> "" Or _
                    p_ControlEficaciaRelleno <> "" Or p_RegistrosCerrados <> "" Or _
                    p_ResponsableTelefonica <> "" Or p_ResponsableCalidad <> "")
End Function

Private Function ResolveEstadoFiltro(ByVal p_EstadoValor As String, ByVal p_EstadoEnum As Long) As String
    On Error GoTo fallback

    If p_EstadoValor = "" Or p_EstadoValor = "Abiertas" Then Exit Function
    If Not m_ObjEntorno Is Nothing Then
        If p_EstadoEnum > 0 Then
            ResolveEstadoFiltro = m_ObjEntorno.ColEstadosNC(CStr(p_EstadoEnum))
            Exit Function
        End If
    End If

fallback:
    ResolveEstadoFiltro = p_EstadoValor
End Function

Private Sub LogFallback(ByVal p_Detalle As String)
    Dim usuarioLog As String
    Dim SQL As String

    On Error Resume Next

    usuarioLog = SafeFallbackUser()
    SQL = "INSERT INTO " & LOG_TABLE & " " & _
          "(IDNoConformidad, TipoOperacion, Detalles, Usuario, Exito, DuracionMs, FechaOperacion) VALUES (" & _
          "0, " & SqlLiteral(LOG_OPERATION_FALLBACK) & ", " & SqlLiteral(p_Detalle) & ", " & _
          SqlLiteral(usuarioLog) & ", True, 0, Now());"
    getdb().Execute SQL, dbFailOnError
End Sub

' Orquestador de refresh de caches para el form de gestión de proyecto.
' Llama RebuildNCProyectoListadoCache(0); True=éxito, False=p_Error poblado.
' Espejo de RefreshNCAuditoriaGestionCaches.
' SDD: form-fncproyecto-cache-invalidation R2.
Public Sub RefreshNCProyectoGestionCaches(Optional ByRef p_Error As String)
    On Error GoTo errores
    p_Error = ""

    If Not TableExists(NOMBRE_TABLA_LISTADO) Then
        LogFallback "Cache refresh skipped: TbCacheListadoNC not available"
        Exit Sub
    End If

    If Not RebuildNCProyectoListadoCache(0, p_Error) Then
        Err.Raise 1000
    End If
    Exit Sub

errores:
    If Err.Number <> 1000 Then
        p_Error = "El método RefreshNCProyectoGestionCaches ha devuelto el error: " & Err.Description
    End If
End Sub

' Espejo de TableExists en NCAuditoriaGestionListadoHelper.bas:357.
' Verifica la existencia de la tabla contra el backend activo (getdb()).
' Necesario para que RefreshNCProyectoGestionCaches pueda consultar TbCacheListadoNC
' sin asumir que el schema readiness ya corrió en este turno.
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

Private Function SqlLiteral(ByVal p_Value As String) As String
    SqlLiteral = "'" & Replace(p_Value, "'", "''") & "'"
End Function

Private Function ReadStringPropertyWithFallback(ByVal p_Item As Object, ByVal p_Primary As String, ByVal p_Fallback As String) As String
    On Error Resume Next
    ReadStringPropertyWithFallback = CStr(CallByName(p_Item, p_Primary, VbGet))
    If Err.Number <> 0 Then
        Err.Clear
        ReadStringPropertyWithFallback = CStr(CallByName(p_Item, p_Fallback, VbGet))
    End If
    If Err.Number <> 0 Then
        Err.Clear
        ReadStringPropertyWithFallback = ""
    End If
End Function

Private Function ReadVariantPropertyWithFallback(ByVal p_Item As Object, ByVal p_Primary As String, ByVal p_Fallback As String) As Variant
    On Error Resume Next
    ReadVariantPropertyWithFallback = CallByName(p_Item, p_Primary, VbGet)
    If Err.Number <> 0 Then
        Err.Clear
        ReadVariantPropertyWithFallback = CallByName(p_Item, p_Fallback, VbGet)
    End If
    If Err.Number <> 0 Then
        Err.Clear
        ReadVariantPropertyWithFallback = ""
    End If
End Function

Private Function GetNCProyectoGestionItemID(ByVal p_Item As Object) As String
    On Error Resume Next

    If p_Item Is Nothing Then Exit Function
    GetNCProyectoGestionItemID = CStr(CallByName(p_Item, "IDNoConformidad", VbGet))
    If Err.Number <> 0 Then
        Err.Clear
        GetNCProyectoGestionItemID = ""
    End If
End Function
