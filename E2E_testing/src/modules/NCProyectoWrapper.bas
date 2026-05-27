Attribute VB_Name = "NCProyectoWrapper"
Option Compare Database
Option Explicit

' ============================================
' WRAPPER DE OPERACIONES — PATRÓN FACADE
' ============================================
' Propósito: Punto único de entrada que decide
'   - Si CacheEnabled = True  ? usa ruta de caché
'   - Si CacheEnabled = False ? usa ruta directa a BD
'
' Este módulo NO modifica los CRUIDs existentes.
' Es una capa adicional transparente para el llamador.
'
' Fecha: 2026-03-23
' ============================================

' ============================================
' GET NC PROYECTO VM (Detail)
' ============================================

Public Function GetNCProyectoVM(ByVal p_IDNC As Long) As NCProyectoDetailVM
    On Error GoTo errorHandler
    
    If IsCacheEnabled() Then
        Set GetNCProyectoVM = GetNCProyectoVM_FromCache(p_IDNC)
    Else
        Set GetNCProyectoVM = GetNCProyectoVM_FromDB(p_IDNC)
    End If
    
    Exit Function
    
errorHandler:
    Debug.Print "NCProyectoWrapper.GetNCProyectoVM ERROR: " & Err.Description
    Set GetNCProyectoVM = Nothing
End Function

Private Function GetNCProyectoVM_FromCache(ByVal p_IDNC As Long) As NCProyectoDetailVM
    On Error GoTo errorHandler
    
    Dim vm As NCProyectoDetailVM
    Dim p_Error As String
    
    Set vm = New NCProyectoDetailVM
    If vm.CargarPorID(p_IDNC, p_Error) Then
        Set GetNCProyectoVM_FromCache = vm
    Else
        Set GetNCProyectoVM_FromCache = Nothing
    End If
    
    Exit Function
    
errorHandler:
    Debug.Print "NCProyectoWrapper.GetNCProyectoVM_FromCache ERROR: " & Err.Description
    Set GetNCProyectoVM_FromCache = Nothing
End Function

Private Function GetNCProyectoVM_FromDB(ByVal p_IDNC As Long) As NCProyectoDetailVM
    On Error GoTo errorHandler
    
    Dim vm As NCProyectoDetailVM
    Dim p_Error As String
    
    Set vm = New NCProyectoDetailVM
    If vm.CargarPorID(p_IDNC, p_Error) Then
        Set GetNCProyectoVM_FromDB = vm
    Else
        Set GetNCProyectoVM_FromDB = Nothing
    End If
    
    Exit Function
    
errorHandler:
    Debug.Print "NCProyectoWrapper.GetNCProyectoVM_FromDB ERROR: " & Err.Description
    Set GetNCProyectoVM_FromDB = Nothing
End Function

' ============================================
' GET NCS FILTRADOS VM (List)
' ============================================

Public Function GetNCsFiltradosVMConFiltros( _
                    Optional ByVal p_Codigo As String = "", _
                    Optional ByVal p_IDExpediente As Long = 0, _
                    Optional ByVal p_IDTipo As Long = 0, _
                    Optional ByVal p_Estado As String = "", _
                    Optional ByVal p_Descripcion As String = "", _
                    Optional ByVal p_Notas As String = "", _
                    Optional ByVal p_RequiereCE As String = "", _
                    Optional ByVal p_ControlEficacia As String = "", _
                    Optional ByVal p_ResponsableCalidad As String = "", _
                    Optional ByVal p_RegistrosCerrados As String = "", _
                    Optional ByVal p_ResponsableTelefonica As String = "", _
                    Optional ByVal p_Google As String = "" _
                ) As Collection
    On Error GoTo errorHandler
    
    If IsCacheEnabled() Then
        Set GetNCsFiltradosVMConFiltros = GetNCsFiltradosVMConFiltros_FromCache( _
            p_Codigo:=p_Codigo, _
            p_IDExpediente:=p_IDExpediente, _
            p_IDTipo:=p_IDTipo, _
            p_Estado:=p_Estado, _
            p_Descripcion:=p_Descripcion, _
            p_Notas:=p_Notas, _
            p_RequiereCE:=p_RequiereCE, _
            p_ControlEficacia:=p_ControlEficacia, _
            p_ResponsableCalidad:=p_ResponsableCalidad, _
            p_RegistrosCerrados:=p_RegistrosCerrados, _
            p_ResponsableTelefonica:=p_ResponsableTelefonica, _
            p_Google:=p_Google)
    Else
        Set GetNCsFiltradosVMConFiltros = GetNCsFiltradosVMConFiltros_FromDB( _
            p_Codigo:=p_Codigo, _
            p_IDExpediente:=p_IDExpediente, _
            p_IDTipo:=p_IDTipo, _
            p_Estado:=p_Estado, _
            p_Descripcion:=p_Descripcion, _
            p_Notas:=p_Notas, _
            p_RequiereCE:=p_RequiereCE, _
            p_ControlEficacia:=p_ControlEficacia, _
            p_ResponsableCalidad:=p_ResponsableCalidad, _
            p_RegistrosCerrados:=p_RegistrosCerrados, _
            p_ResponsableTelefonica:=p_ResponsableTelefonica, _
            p_Google:=p_Google)
    End If
    
    Exit Function
    
errorHandler:
    Debug.Print "NCProyectoWrapper.GetNCsFiltradosVMConFiltros ERROR: " & Err.Description
    Set GetNCsFiltradosVMConFiltros = Nothing
End Function

Private Function GetNCsFiltradosVMConFiltros_FromCache( _
                    Optional ByVal p_Codigo As String = "", _
                    Optional ByVal p_IDExpediente As Long = 0, _
                    Optional ByVal p_IDTipo As Long = 0, _
                    Optional ByVal p_Estado As String = "", _
                    Optional ByVal p_Descripcion As String = "", _
                    Optional ByVal p_Notas As String = "", _
                    Optional ByVal p_RequiereCE As String = "", _
                    Optional ByVal p_ControlEficacia As String = "", _
                    Optional ByVal p_ResponsableCalidad As String = "", _
                    Optional ByVal p_RegistrosCerrados As String = "", _
                    Optional ByVal p_ResponsableTelefonica As String = "", _
                    Optional ByVal p_Google As String = "" _
                ) As Collection
    On Error GoTo errorHandler
    
    Dim p_Error As String
    
    Set GetNCsFiltradosVMConFiltros_FromCache = CacheNCProyecto.GetListadoFiltradoSQL( _
        p_Codigo:=p_Codigo, _
        p_IDExpediente:=p_IDExpediente, _
        p_IDTipo:=p_IDTipo, _
        p_Estado:=p_Estado, _
        p_Descripcion:=p_Descripcion, _
        p_Notas:=p_Notas, _
        p_RequiereCE:=p_RequiereCE, _
        p_ControlEficacia:=p_ControlEficacia, _
        p_ResponsableCalidad:=p_ResponsableCalidad, _
        p_RegistrosCerrados:=p_RegistrosCerrados, _
        p_ResponsableTelefonica:=p_ResponsableTelefonica, _
        p_Google:=p_Google, _
        p_Error:=p_Error)
    
    Exit Function
    
errorHandler:
    Debug.Print "NCProyectoWrapper.GetNCsFiltradosVMConFiltros_FromCache ERROR: " & Err.Description
    Set GetNCsFiltradosVMConFiltros_FromCache = Nothing
End Function

Private Function GetNCsFiltradosVMConFiltros_FromDB( _
                    Optional ByVal p_Codigo As String = "", _
                    Optional ByVal p_IDExpediente As Long = 0, _
                    Optional ByVal p_IDTipo As Long = 0, _
                    Optional ByVal p_Estado As String = "", _
                    Optional ByVal p_Descripcion As String = "", _
                    Optional ByVal p_Notas As String = "", _
                    Optional ByVal p_RequiereCE As String = "", _
                    Optional ByVal p_ControlEficacia As String = "", _
                    Optional ByVal p_ResponsableCalidad As String = "", _
                    Optional ByVal p_RegistrosCerrados As String = "", _
                    Optional ByVal p_ResponsableTelefonica As String = "", _
                    Optional ByVal p_Google As String = "" _
                ) As Collection
    On Error GoTo errorHandler
    
    Dim db As DAO.Database
    Dim rs As DAO.Recordset
    Dim sql As String
    Dim col As Collection
    Dim vm As NCProyectoListItemVM
    Dim p_Error As String
    
    Set db = getdb()
    Set col = New Collection
    
    sql = "SELECT n.IDNoConformidad, n.CodigoNoConformidad, n.IDExpediente, n.Descripcion, " & _
          "n.Estado, n.FechaApertura, n.FECHACIERRE, n.Cerrada, " & _
          "e.Nemotecnico, e.CodExp " & _
          "FROM TbNoConformidades n " & _
          "LEFT JOIN TbExpedientes e ON n.IDExpediente = e.IDExpediente " & _
          "WHERE n.Borrado = 0"
    
    If p_Codigo <> "" Then
        sql = sql & " AND n.CodigoNoConformidad = '" & EscapeSQL(p_Codigo) & "'"
    End If
    
    If p_IDExpediente > 0 Then
        sql = sql & " AND n.IDExpediente = " & p_IDExpediente
    End If
    
    If p_IDTipo > 0 Then
        sql = sql & " AND n.IDTipo = " & p_IDTipo
    End If
    
    If p_Estado <> "" Then
        sql = sql & " AND n.Estado = '" & EscapeSQL(p_Estado) & "'"
    End If
    
    If p_Descripcion <> "" Then
        sql = sql & " AND n.Descripcion LIKE '*" & EscapeSQL(p_Descripcion) & "*'"
    End If
    
    If p_Notas <> "" Then
        sql = sql & " AND n.Notas LIKE '*" & EscapeSQL(p_Notas) & "*'"
    End If
    
    If p_RequiereCE <> "" Then
        sql = sql & " AND n.RequiereControlEficacia = '" & EscapeSQL(p_RequiereCE) & "'"
    End If
    
    If p_ControlEficacia = "Sí" Then
        sql = sql & " AND n.ControlEficacia <> ''"
    ElseIf p_ControlEficacia = "No" Then
        sql = sql & " AND n.ControlEficacia = ''"
    End If
    
    If p_ResponsableCalidad <> "" Then
        sql = sql & " AND n.ResponsableCalidad = '" & EscapeSQL(p_ResponsableCalidad) & "'"
    End If
    
    If p_RegistrosCerrados = "Sí" Then
        sql = sql & " AND n.FECHACIERRE IS NOT NULL"
    ElseIf p_RegistrosCerrados = "No" Then
        sql = sql & " AND n.FECHACIERRE IS NULL"
    End If
    
    If p_ResponsableTelefonica <> "" Then
        sql = sql & " AND n.ResponsableTelefonica = '" & EscapeSQL(p_ResponsableTelefonica) & "'"
    End If
    
    If p_Google <> "" Then
        sql = sql & " AND (n.Descripcion LIKE '*" & EscapeSQL(p_Google) & "*' OR n.Notas LIKE '*" & EscapeSQL(p_Google) & "*')"
    End If
    
    sql = sql & " ORDER BY n.FechaApertura DESC"
    
    Set rs = db.OpenRecordset(sql, dbOpenSnapshot)
    
    Do While Not rs.EOF
        Set vm = New NCProyectoListItemVM
        vm.IDNoConformidad = Nz(rs!IDNoConformidad, 0)
        vm.CodigoNoConformidad = Nz(rs!CodigoNoConformidad, "")
        vm.IDExpediente = Nz(rs!IDExpediente, 0)
        vm.Descripcion = Nz(rs!Descripcion, "")
        vm.Estado = Nz(rs!Estado, "")
        vm.FechaApertura = Nz(rs!FechaApertura, 0)
        vm.FECHACIERRE = Nz(rs!FECHACIERRE, 0)
        vm.Cerrada = Nz(rs!Cerrada, False)
        If Not IsNull(rs!Nemotecnico) Then vm.Nemotecnico = rs!Nemotecnico
        If Not IsNull(rs!CodExp) Then vm.CodExp = rs!CodExp
        col.Add vm
        rs.MoveNext
    Loop
    
    rs.Close
    Set rs = Nothing
    Set db = Nothing
    
    Set GetNCsFiltradosVMConFiltros_FromDB = col
    Exit Function
    
errorHandler:
    If Not rs Is Nothing Then rs.Close: Set rs = Nothing
    If Not db Is Nothing Then Set db = Nothing
    Debug.Print "NCProyectoWrapper.GetNCsFiltradosVMConFiltros_FromDB ERROR: " & Err.Description
    Set GetNCsFiltradosVMConFiltros_FromDB = Nothing
End Function

Private Function EscapeSQL(ByVal p_Text As String) As String
    EscapeSQL = Replace(p_Text, "'", "''")
End Function

' ============================================
' SAVE NC (Alta/Modificacion)
' ============================================
' Si CacheEnabled = ON:  usa transaccion + invalida/regenera cache
' Si CacheEnabled = OFF: usa transaccion simple sin cache
' ============================================

Public Function SaveNC( _
                ByRef p_NC As ncProyecto, _
                Optional ByRef p_Error As String _
            ) As Boolean
    On Error GoTo errorHandler
    
    Dim db As DAO.Database
    Dim blnResult As Boolean
    Dim m_Wrk As DAO.Workspace
    Dim m_HayTransaccion As Boolean
    Dim svcNC As New NCService
    Dim cacheCrud As New CacheNCCrud
    
    p_Error = ""
    SaveNC = False
    m_HayTransaccion = False
    
    Set m_Wrk = DBEngine.Workspaces(0)
    Set db = CurrentDb
    
    If p_NC Is Nothing Then
        p_Error = "NC no puede ser Nothing"
        Exit Function
    End If
    
    m_Wrk.BeginTrans
    m_HayTransaccion = True
    
    If p_NC.IDNoConformidad = 0 Or p_NC.IDNoConformidad = "" Then
        blnResult = svcNC.Alta(p_NC, db, p_Error)
    Else
        blnResult = svcNC.Modificar(p_NC, p_NC, db, p_Error) ' TODO (Spec-016): pasar p_NC_Original para diff de campos
    End If
    
    If Not blnResult Then
        m_Wrk.Rollback
        m_HayTransaccion = False
        SaveNC = False
        Exit Function
    End If
    
    If p_NC.IDNoConformidad = 0 Or p_NC.IDNoConformidad = "" Then
        blnResult = cacheCrud.NotificarAltaNC(CLng(p_NC.IDNoConformidad), p_Error)
    Else
        blnResult = cacheCrud.NotificarModificacionNC(CLng(p_NC.IDNoConformidad), Nothing, p_Error)
    End If
    
    If Not blnResult Then
        m_Wrk.Rollback
        m_HayTransaccion = False
        SaveNC = False
        Exit Function
    End If
    
    m_Wrk.CommitTrans
    m_HayTransaccion = False
    
    SaveNC = True
    Exit Function
    
errorHandler:
    If m_HayTransaccion Then
        On Error Resume Next
        m_Wrk.Rollback
        On Error GoTo 0
    End If
    If Not db Is Nothing Then Set db = Nothing
    p_Error = "NCProyectoWrapper.SaveNC: " & Err.Description
    SaveNC = False
End Function

' ============================================
' DELETE NC (Logico)
' ============================================
' Si CacheEnabled = ON:  transaccion + invalida cache
' Si CacheEnabled = OFF: transaccion simple sin cache
' ============================================

Public Function DeleteNC( _
                ByVal p_IDNC As Long, _
                Optional ByRef p_Error As String _
            ) As Boolean
    On Error GoTo errorHandler
    
    Dim db As DAO.Database
    Dim blnResult As Boolean
    Dim m_Wrk As DAO.Workspace
    Dim m_HayTransaccion As Boolean
    Dim svcNC As New NCService
    Dim cacheCrud As New CacheNCCrud
    
    p_Error = ""
    DeleteNC = False
    m_HayTransaccion = False
    
    Set m_Wrk = DBEngine.Workspaces(0)
    Set db = CurrentDb
    
    m_Wrk.BeginTrans
    m_HayTransaccion = True
    
    blnResult = svcNC.Eliminar(p_IDNC:=CStr(p_IDNC), p_Logico:=True, p_Db:=db, p_Error:=p_Error)
    
    If Not blnResult Then
        m_Wrk.Rollback
        m_HayTransaccion = False
        DeleteNC = False
        Exit Function
    End If
    
    blnResult = cacheCrud.NotificarEliminacionNC(p_IDNC, p_Error)
    
    If Not blnResult Then
        m_Wrk.Rollback
        m_HayTransaccion = False
        DeleteNC = False
        Exit Function
    End If
    
    m_Wrk.CommitTrans
    m_HayTransaccion = False
    
    DeleteNC = True
    Exit Function
    
errorHandler:
    If m_HayTransaccion Then
        On Error Resume Next
        m_Wrk.Rollback
        On Error GoTo 0
    End If
    If Not db Is Nothing Then Set db = Nothing
    p_Error = "NCProyectoWrapper.DeleteNC: " & Err.Description
    DeleteNC = False
End Function

' ============================================
' CACHE INVALIDATION (NOOP when disabled)
' ============================================

Public Function InvalidateNC( _
                ByVal p_IDNC As Long, _
                Optional ByRef p_Error As String _
            ) As Boolean
    On Error GoTo errorHandler
    
    p_Error = ""
    InvalidateNC = True
    
    If Not IsCacheEnabled() Then
        Exit Function
    End If
    
    InvalidateNC = CacheNCProyecto.InvalidarCache(CStr(p_IDNC), "Invalidacion manual", p_Error)
    
    Exit Function
    
errorHandler:
    p_Error = "NCProyectoWrapper.InvalidateNC: " & Err.Description
    InvalidateNC = False
End Function

Public Function InvalidateList( _
                Optional ByRef p_Error As String _
            ) As Boolean
    On Error GoTo errorHandler
    
    p_Error = ""
    InvalidateList = True
    
    If Not IsCacheEnabled() Then
        Exit Function
    End If
    
    InvalidateList = CacheNCProyecto.InvalidateList_Cache("Invalidacion manual", p_Error)
    
    Exit Function
    
errorHandler:
    p_Error = "NCProyectoWrapper.InvalidateList: " & Err.Description
    InvalidateList = False
End Function

' ============================================
' REBUILD CACHE (NOOP when disabled)
' ============================================

Public Function RebuildCache( _
                Optional ByRef p_Error As String _
            ) As Boolean
    On Error GoTo errorHandler
    
    p_Error = ""
    RebuildCache = True
    
    If Not IsCacheEnabled() Then
        Exit Function
    End If
    
    RebuildCache = CacheNCProyecto.RebuildCacheLista(p_Error:=p_Error)
    
    Exit Function
    
errorHandler:
    p_Error = "NCProyectoWrapper.RebuildCache: " & Err.Description
    RebuildCache = False
End Function

