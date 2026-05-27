Attribute VB_Name = "InicializadorCache"
Option Compare Database
Option Explicit

' ============================================
' MÓDULO INICIALIZADOR DE CACHÉ
' ============================================
' Propósito: Inicializar y poblar caché para NCs
' Fecha creación: 12/01/2026
' ============================================

' ============================================
' FUNCIONES PÚBLICAS
' ============================================

' Genera caché para una NC específica (on-demand)
Public Function GenerarCacheParaNC( _
    p_IDNC As String, _
    Optional p_MostrarProgreso As Boolean = True, _
    Optional ByRef p_Error As String _
) As Boolean
    
    Dim inicio As Long
    Dim exito As Boolean
    
    On Error GoTo errores
    
    inicio = Timer
    p_Error = ""
    
    ' Validar parámetro
    If p_IDNC = "" Then
        p_Error = "Debe especificar IDNoConformidad"
        GenerarCacheParaNC = False
        Exit Function
    End If
    
    If p_MostrarProgreso Then
        DoCmd.Hourglass True
        Avance "Generando caché para NC " & p_IDNC & "..."
    End If
    
    ' Generar caché completo
    exito = CacheNCProyecto.GenerarCacheCompleto(p_IDNC, p_Error)
    
    If Not exito Then
        GoTo errores
    End If
    
    If p_MostrarProgreso Then
        DoCmd.Hourglass False
        Dim duracion As Long
        duracion = (Timer - inicio) * 1000
        MsgBox "Caché generado exitosamente para NC " & p_IDNC & vbNewLine & _
               "Duración: " & duracion & "ms", _
               vbInformation, "Caché Generado"
    End If
    
    GenerarCacheParaNC = True
    Exit Function
    
errores:
    If p_MostrarProgreso Then
        DoCmd.Hourglass False
    End If
    
    If p_Error = "" Then
        p_Error = "Error en GenerarCacheParaNC: " & Err.Description
    End If
    
    GenerarCacheParaNC = False
End Function

' Genera caché para todas las NCs existentes (poblado masivo)
Public Function GenerarCachesMasivo( _
    Optional p_LimpiarCachesAnteriores As Boolean = True, _
    Optional p_MostrarProgreso As Boolean = True, _
    Optional p_UmbralDiasSinUso As Integer = 30, _
    Optional ByRef p_Error As String _
) As Boolean
    
    Dim rcd As DAO.Recordset
    Dim sql As String
    Dim totalNCs As Long
    Dim ncActual As Long
    Dim ncID As String
    Dim inicio As Long
    Dim cachesGenerados As Long
    Dim cachesFallidos As Long
    Dim cachesLimpiados As Long
    Dim duracion As Long
    
    On Error GoTo errores
    
    inicio = Timer
    p_Error = ""
    
    If p_MostrarProgreso Then
        DoCmd.Hourglass True
        Avance "Preparando poblado masivo de caché..."
    End If
    
    ' Contar NCs totales
    sql = "SELECT COUNT(*) AS Total FROM TbNoConformidades WHERE Borrado=False;"
    Set rcd = getdb().OpenRecordset(sql)
    totalNCs = rcd!total
    rcd.Close
    
    If totalNCs = 0 Then
        p_Error = "No hay NCs en el sistema"
        GoTo errores
    End If
    
    ' Limpiar caches obsoletos si se solicita
    If p_LimpiarCachesAnteriores Then
        sql = "DELETE FROM TbCacheNCProyecto WHERE " & _
               "(FechaUltimoUso Is Null OR DATEDIFF('d', FechaUltimoUso, Now()) > " & p_UmbralDiasSinUso & ") " & _
               "AND IDNoConformidad IN (SELECT IDNoConformidad FROM TbNoConformidades WHERE Borrado=False);"
        getdb().Execute sql
        cachesLimpiados = getdb().RecordsAffected
    End If
    
    ' Obtener todas las NCs
    sql = "SELECT IDNoConformidad FROM TbNoConformidades " & _
           "WHERE Borrado=False ORDER BY IDNoConformidad;"
    Set rcd = getdb().OpenRecordset(sql)
    
    ncActual = 0
    
    If Not rcd.EOF Then
        rcd.MoveFirst
        Do While Not rcd.EOF
            ncID = rcd!IDNoConformidad
            ncActual = ncActual + 1
            
            If p_MostrarProgreso And ncActual Mod 10 = 0 Then
                Avance "Procesando NC " & ncActual & " de " & totalNCs & " (" & _
                       Format(ncActual / totalNCs, "0%") & ")..."
            End If
            
            ' Generar caché para esta NC
            If CacheNCProyecto.GenerarCacheCompleto(ncID, p_Error) Then
                cachesGenerados = cachesGenerados + 1
            Else
                ' No es fatal, continuar con siguiente NC
                cachesFallidos = cachesFallidos + 1
                If p_Error <> "" Then
                    Debug.Print "Error generando caché para NC " & ncID & ": " & p_Error
                    p_Error = ""
                End If
            End If
            
            rcd.MoveNext
        Loop
    End If
    
    rcd.Close
    Set rcd = Nothing
    
    duracion = (Timer - inicio) * 1000
    
    If p_MostrarProgreso Then
        DoCmd.Hourglass False
        
        Dim msg As String
        msg = "Poblado masivo de caché completado:" & vbNewLine & vbNewLine
        msg = msg & "NCs totales: " & totalNCs & vbNewLine
        msg = msg & "Caches generados: " & cachesGenerados & vbNewLine
        msg = msg & "Caches fallidos: " & cachesFallidos & vbNewLine
        msg = msg & "Caches limpiados: " & cachesLimpiados & vbNewLine
        msg = msg & vbNewLine & "Duración total: " & duracion & "ms" & vbNewLine
        msg = msg & "(Promedio: " & Format(duracion / totalNCs, "0.00") & "ms por NC)"
        
        MsgBox msg, vbInformation, "Caché Poblado Masivo"
    End If
    
    GenerarCachesMasivo = True
    Exit Function
    
errores:
    If p_MostrarProgreso Then
        DoCmd.Hourglass False
    End If
    
    If p_Error = "" Then
        p_Error = "Error en GenerarCachesMasivo: " & Err.Description
    End If
    
    GenerarCachesMasivo = False
End Function

' Invalida caches de una lista de IDs de NC
Public Function InvalidarCachesPorLista( _
    p_IDNCs As String, _
    Optional p_Separador As String = ",", _
    Optional p_Razon As String = "Invalidación masiva por lista", _
    Optional ByRef p_Error As String _
) As Boolean
    
    Dim ids() As String
    Dim i As Integer
    Dim count As Integer
    
    On Error GoTo errores
    
    p_Error = ""
    
    If p_IDNCs = "" Then
        InvalidarCachesPorLista = True
        Exit Function
    End If
    
    ' Parsear lista de IDs
    ids = Split(p_IDNCs, p_Separador)
    count = 0
    
    For i = LBound(ids) To UBound(ids)
        Dim id As String
        id = Trim(ids(i))
        
        If id <> "" And IsNumeric(id) Then
            If CacheNCProyecto.InvalidarCache(id, p_Razon, p_Error) Then
                count = count + 1
            Else
                Debug.Print "Error invalidando caché para NC " & id & ": " & p_Error
                p_Error = ""
            End If
        End If
    Next i
    
    InvalidarCachesPorLista = True
    Exit Function
    
errores:
    p_Error = "Error en InvalidarCachesPorLista: " & Err.Description
    InvalidarCachesPorLista = False
End Function

' Regenera caches de una lista de IDs de NC
Public Function RegenerarCachesPorLista( _
    p_IDNCs As String, _
    Optional p_Separador As String = ",", _
    Optional ByRef p_Error As String _
) As Boolean
    
    Dim ids() As String
    Dim i As Integer
    Dim count As Integer
    
    On Error GoTo errores
    
    p_Error = ""
    
    If p_IDNCs = "" Then
        RegenerarCachesPorLista = True
        Exit Function
    End If
    
    ' Parsear lista de IDs
    ids = Split(p_IDNCs, p_Separador)
    count = 0
    
    For i = LBound(ids) To UBound(ids)
        Dim id As String
        id = Trim(ids(i))
        
        If id <> "" And IsNumeric(id) Then
            If CacheNCProyecto.GenerarCacheCompleto(id, p_Error) Then
                count = count + 1
            Else
                Debug.Print "Error regenerando caché para NC " & id & ": " & p_Error
                p_Error = ""
            End If
        End If
    Next i
    
    RegenerarCachesPorLista = True
    Exit Function
    
errores:
    p_Error = "Error en RegenerarCachesPorLista: " & Err.Description
    RegenerarCachesPorLista = False
End Function

' Obtiene estadísticas del caché
Public Function ObtenerEstadisticasCache( _
                                            Optional ByRef p_Error As String _
                                        ) As String
    
    Dim rcd As DAO.Recordset
    Dim sql As String
    Dim resultado As String
    
    On Error GoTo errores
    
    p_Error = ""
    resultado = ""
    
    ' Usar vista de estadísticas
    sql = "SELECT * FROM vCacheNCProyectoEstadisticas;"
    
    Set rcd = getdb().OpenRecordset(sql)
    
    If Not rcd.EOF Then
        resultado = "ESTADÍSTICAS DEL CACHÉ" & vbNewLine & vbNewLine
        resultado = resultado & "Total caches: " & rcd!TotalCaches & vbNewLine
        resultado = resultado & "Caches válidos: " & rcd!CachesValidos & vbNewLine
        resultado = resultado & "Caches inválidos: " & rcd!CachesInvalidos & vbNewLine
        resultado = resultado & vbNewLine
        resultado = resultado & "Promedio de consultas por cache: " & rcd!PromedioHits & vbNewLine
        resultado = resultado & "Máximo de consultas a un cache: " & rcd!MaxHits & vbNewLine
        resultado = resultado & vbNewLine
        resultado = resultado & "Tamaño total en MB: " & rcd!TamanioTotalMB & vbNewLine
        resultado = resultado & "Promedio de tamaño por cache: " & rcd!PromedioTamanioKB & " KB" & vbNewLine
        resultado = resultado & vbNewLine & resultado & "Último uso de caché: "
        
        If Not IsNull(rcd!UltimoUso) Then
            resultado = resultado & rcd!UltimoUso
        Else
            resultado = resultado & "Nunca usado"
        End If
    Else
        resultado = "No hay datos de estadísticas de caché"
    End If
    
    rcd.Close
    Set rcd = Nothing
    
    ObtenerEstadisticasCache = resultado
    Exit Function
    
errores:
    p_Error = "Error en ObtenerEstadisticasCache: " & Err.Description
    ObtenerEstadisticasCache = ""
End Function

' Lista caches obsoletos
Public Function ListarCachesObsoletos( _
    Optional p_DiasSinUso As Integer = 30, _
    Optional ByRef p_Error As String _
) As String
    
    Dim rcd As DAO.Recordset
    Dim sql As String
    Dim resultado As String
    
    On Error GoTo errores
    
    p_Error = ""
    resultado = ""
    
    sql = "DELETE * FROM vCacheNCProyectoObsoletos WHERE DiasSinUso > " & p_DiasSinUso & ";"
    Set rcd = getdb().OpenRecordset(sql)
    
    If Not rcd.EOF Then
        resultado = "CACHÉS OBSOLETOS (más de " & p_DiasSinUso & " días sin uso):" & vbNewLine & vbNewLine
        resultado = resultado & "IDNC    | Caché   | Fecha Último Uso | Días | Hits"
        resultado = resultado & "----------|--------|------------------|------|-----"
        
        rcd.MoveFirst
        Do While Not rcd.EOF
            resultado = resultado & rcd!IDNoConformidad & " | " & _
                        rcd!IDCache & " | " & _
                        Format(Nz(rcd!FechaUltimoUso, ""), "dd/mm/yyyy hh:nn") & " | " & _
                        rcd!DiasSinUso & " | " & _
                        rcd!HitsConsultas
            rcd.MoveNext
        Loop
    Else
        resultado = "No hay caches obsoletos (sin usar por más de " & p_DiasSinUso & " días)"
    End If
    
    rcd.Close
    Set rcd = Nothing
    
    ListarCachesObsoletos = resultado
    Exit Function
    
errores:
    p_Error = "Error en ListarCachesObsoletos: " & Err.Description
    ListarCachesObsoletos = ""
End Function

' Limpiar caches obsoletos
Public Function LimpiarCachesObsoletos( _
    Optional p_DiasSinUso As Integer = 30, _
    Optional ByRef p_Eliminados As Long, _
    Optional ByRef p_Error As String _
) As Boolean
    
    On Error GoTo errores
    
    p_Error = ""
    p_Eliminados = 0
    
    ' Llamar procedimiento almacenado
    DoCmd.SetWarnings False
    getdb().Execute "EXECUTE spLimpiarCachesObsoletos " & p_DiasSinUso & ";", dbFailOnError
    p_Eliminados = getdb().RecordsAffected
    DoCmd.SetWarnings True
    
    LimpiarCachesObsoletos = True
    Exit Function
    
errores:
    DoCmd.SetWarnings True
    p_Error = "Error en LimpiarCachesObsoletos: " & Err.Description
    LimpiarCachesObsoletos = False
End Function

' Limpiar todos los caches
Public Function LimpiarTodosLosCaches( _
    Optional ByRef p_Eliminados As Long, _
    Optional ByRef p_Error As String _
) As Boolean
    
    On Error GoTo errores
    
    p_Error = ""
    p_Eliminados = 0
    
    ' Llamar procedimiento almacenado
    DoCmd.SetWarnings False
    getdb().Execute "EXECUTE spLimpiarTodosLosCaches;", dbFailOnError
    p_Eliminados = getdb().RecordsAffected
    DoCmd.SetWarnings True
    
    LimpiarTodosLosCaches = True
    Exit Function
    
errores:
    DoCmd.SetWarnings True
    p_Error = "Error en LimpiarTodosLosCaches: " & Err.Description
    LimpiarTodosLosCaches = False
End Function

' Verifica la integridad del caché
Public Function VerificarIntegridadCache( _
    p_MostrarDetalles As Boolean, _
    Optional ByRef p_ProblemasEncontrados As Integer, _
    Optional ByRef p_Error As String _
) As Boolean
    
    Dim rcdCache As DAO.Recordset
    Dim rcdNC As DAO.Recordset
    Dim sql As String
    Dim problemas As Integer
    Dim resultado As String
    
    On Error GoTo errores
    
    p_Error = ""
    problemas = 0
    
    If p_MostrarDetalles Then
        DoCmd.Hourglass True
    End If
    
    resultado = "VERIFICACIÓN DE INTEGRIDAD DE CACHÉ" & vbNewLine & vbNewLine
    
    ' 1. Verificar caches sin NC correspondiente
    sql = "SELECT c.IDCache, c.IDNoConformidad FROM TbCacheNCProyecto AS c " & _
           "LEFT JOIN TbNoConformidades AS n ON c.IDNoConformidad = n.IDNoConformidad " & _
           "WHERE n.IDNoConformidad Is Null;"
    
    Set rcdCache = getdb().OpenRecordset(sql)
    
    If Not rcdCache.EOF Then
        resultado = resultado & "1. CACHÉS SIN NC CORRESPONDIENTE: " & rcdCache.RecordCount & vbNewLine
        problemas = problemas + rcdCache.RecordCount
        
        If p_MostrarDetalles And rcdCache.RecordCount <= 20 Then
            rcdCache.MoveFirst
            Do While Not rcdCache.EOF
                resultado = resultado & "   - IDCache: " & rcdCache!IDCache & ", IDNC: " & rcdCache!IDNoConformidad & vbNewLine
                rcdCache.MoveNext
            Loop
        End If
    Else
        resultado = resultado & "1. CACHÉS SIN NC CORRESPONDIENTE: 0 (OK)" & vbNewLine
    End If
    
    rcdCache.Close
    Set rcdCache = Nothing
    
    ' 2. Verificar NCs sin caché válido
    sql = "SELECT n.IDNoConformidad, n.CodigoNoConformidad FROM TbNoConformidades AS n " & _
           "LEFT JOIN TbCacheNCProyecto AS c ON n.IDNoConformidad = c.IDNoConformidad " & _
           "WHERE n.Borrado=False AND (c.IDNoConformidad Is Null OR c.CacheValida = False);"
    
    Set rcdNC = getdb().OpenRecordset(sql)
    
    If Not rcdNC.EOF Then
        resultado = resultado & "2. NCs SIN CACHÉ VÁLIDO: " & rcdNC.RecordCount & vbNewLine
        problemas = problemas + rcdNC.RecordCount
        
        If p_MostrarDetalles And rcdNC.RecordCount <= 20 Then
            rcdNC.MoveFirst
            Do While Not rcdNC.EOF
                resultado = resultado & "   - NC: " & rcdNC!CodigoNoConformidad & " (ID: " & rcdNC!IDNoConformidad & ")" & vbNewLine
                rcdNC.MoveNext
            Loop
        End If
    Else
        resultado = resultado & "2. NCs SIN CACHÉ VÁLIDO: 0 (OK)" & vbNewLine
    End If
    
    rcdNC.Close
    Set rcdNC = Nothing
    
    ' 3. Verificar caches con JSON inválido
    sql = "SELECT IDNoConformidad FROM TbCacheNCProyecto " & _
           "WHERE (DatosNC Is Null OR DatosNC = '') " & _
           "OR (DatosACs Is Null OR DatosACs = '') " & _
           "OR (DatosARs Is Null OR DatosARs = '');"
    
    Set rcdCache = getdb().OpenRecordset(sql)
    
    If Not rcdCache.EOF Then
        resultado = resultado & "3. CACHÉS CON JSON VACÍO/INVÁLIDO: " & rcdCache.RecordCount & vbNewLine
        problemas = problemas + rcdCache.RecordCount
        
        If p_MostrarDetalles And rcdCache.RecordCount <= 20 Then
            rcdCache.MoveFirst
            Do While Not rcdCache.EOF
                resultado = resultado & "   - NC ID: " & rcdCache!IDNoConformidad & vbNewLine
                rcdCache.MoveNext
            Loop
        End If
    Else
        resultado = resultado & "3. CACHÉS CON JSON VACÍO/INVÁLIDO: 0 (OK)" & vbNewLine
    End If
    
    rcdCache.Close
    Set rcdCache = Nothing
    
    resultado = resultado & vbNewLine & "PROBLEMAS TOTALES: " & problemas
    
    If p_MostrarDetalles Then
        DoCmd.Hourglass False
        MsgBox resultado, vbInformation, "Verificación de Integridad de Caché"
    End If
    
    p_ProblemasEncontrados = problemas
    VerificarIntegridadCache = (problemas = 0)
    
    Exit Function
    
errores:
    If p_MostrarDetalles Then
        DoCmd.Hourglass False
    End If
    
    If p_Error = "" Then
        p_Error = "Error en VerificarIntegridadCache: " & Err.Description
    End If
    
    VerificarIntegridadCache = False
End Function

' Repara problemas de integridad encontrados
Public Function RepararProblemasIntegridad( _
    Optional p_EliminarHuerfanos As Boolean = True, _
    Optional p_RegenerarInvalidos As Boolean = False, _
    Optional ByRef p_Eliminados As Long, _
    Optional ByRef p_Regenerados As Long, _
    Optional ByRef p_Error As String _
) As Boolean
    
    Dim sql As String
    Dim rcd As DAO.Recordset
    Dim rcdNC As DAO.Recordset
    
    On Error GoTo errores
    
    p_Error = ""
    p_Eliminados = 0
    p_Regenerados = 0
    
    If p_EliminarHuerfanos Then
        ' Eliminar caches sin NC correspondiente
        sql = "DELETE FROM TbCacheNCProyecto " & _
               "WHERE IDNoConformidad IN (" & _
               "SELECT c.IDNoConformidad FROM TbCacheNCProyecto AS c " & _
               "LEFT JOIN TbNoConformidades AS n ON c.IDNoConformidad = n.IDNoConformidad " & _
               "WHERE n.IDNoConformidad Is Null);"
        
        getdb().Execute sql
        p_Eliminados = p_Eliminados + getdb().RecordsAffected
    End If
    
    If p_RegenerarInvalidos Then
        ' Regenerar caches de NCs que tienen caché inválido
        sql = "SELECT n.IDNoConformidad FROM TbNoConformidades AS n " & _
               "INNER JOIN TbCacheNCProyecto AS c ON n.IDNoConformidad = c.IDNoConformidad " & _
               "WHERE n.Borrado=False AND c.CacheValida = False;"
        
        Set rcd = getdb().OpenRecordset(sql)
        
        If Not rcd.EOF Then
            rcd.MoveFirst
            Do While Not rcd.EOF
                If CacheNCProyecto.GenerarCacheCompleto(rcd!IDNoConformidad, p_Error) Then
                    p_Regenerados = p_Regenerados + 1
                Else
                    Debug.Print "Error regenerando caché para NC " & rcd!IDNoConformidad & ": " & p_Error
                    p_Error = ""
                End If
                rcd.MoveNext
            Loop
        End If
        
        rcd.Close
        Set rcd = Nothing
    End If
    
    RepararProblemasIntegridad = True
    Exit Function
    
errores:
    p_Error = "Error en RepararProblemasIntegridad: " & Err.Description
    RepararProblemasIntegridad = False
End Function

' ============================================
' MÉTODOS DE MANTENIMIENTO (Vía Inmediato)
' ============================================

' --------------------------------------------------------------------------------
' Muestra la ayuda de los comandos disponibles
' --------------------------------------------------------------------------------
Public Sub AyudaCache()
    Debug.Print "=== COMANDOS DISPONIBLES (InicializadorCache / Mantenimiento) ==="
    Debug.Print "InvalidarCachesObsoletos([dias=30]) - Invalida caches no usados recientemente"
    Debug.Print "EliminarCachesInvalidos([dias=60])  - Borra físicamente caches inválidos antiguos"
    Debug.Print "MostrarEstadisticasUso()            - Muestra hits, tamaños y tops de uso"
    Debug.Print "DiagnosticarIntegridad()            - Busca huérfanos, JSONs vacíos y problemas"
    Debug.Print "LimpiarLogsAntiguos([dias=90])      - Limpia la tabla de logs (errores 30 días)"
    Debug.Print "MostrarRendimiento()                - Resumen de rendimiento y distribución"
    Debug.Print "-------------------------------------------------"
    Debug.Print "RegenerarCachesInvalidos()          - Regenera solo los caches marcados como inválidos"
    Debug.Print "PoblarCacheMasivo([soloFaltantes])  - Genera caché para todas las NCs (True por defecto)"
    Debug.Print "================================================="
End Sub

' --------------------------------------------------------------------------------
' 1. LIMPIEZA DE CACHÉS OBSOLETOS (Renombrado para evitar conflicto)
' --------------------------------------------------------------------------------
Public Sub InvalidarCachesObsoletos(Optional p_DiasSinUso As Integer = 30)
    Dim sql As String
    Dim db As DAO.Database
    Dim rcd As DAO.Recordset
    Dim afectados As Long
    
    On Error GoTo errores
    Set db = getdb()
    
    ' Verificar cuántos se marcarán
    sql = "SELECT COUNT(*) AS Cantidad FROM TbCacheNCProyecto " & _
          "WHERE CacheValida = True " & _
          "AND (FechaUltimoUso Is Null OR DATEDIFF('d', Nz(FechaUltimoUso, FechaCache), Now()) > " & p_DiasSinUso & ");"
    
    Set rcd = db.OpenRecordset(sql)
    If Not rcd.EOF Then
        afectados = rcd!Cantidad
    End If
    rcd.Close
    
    If afectados > 0 Then
        ' Ejecutar actualización
        sql = "UPDATE TbCacheNCProyecto " & _
              "SET CacheValida = False " & _
              "WHERE CacheValida = True " & _
              "AND (FechaUltimoUso Is Null OR DATEDIFF('d', Nz(FechaUltimoUso, FechaCache), Now()) > " & p_DiasSinUso & ");"
        db.Execute sql, dbFailOnError
        Debug.Print ">> Se han invalidado " & afectados & " registros de caché no usados en los últimos " & p_DiasSinUso & " días."
    Else
        Debug.Print ">> No hay cachés obsoletos para invalidar (Criterio: > " & p_DiasSinUso & " días sin uso)."
    End If
    
    Exit Sub
errores:
    Debug.Print "ERROR en InvalidarCachesObsoletos: " & Err.Description
End Sub

' --------------------------------------------------------------------------------
' 2. ELIMINACIÓN DE CACHÉS MARCADOS INVÁLIDOS
' --------------------------------------------------------------------------------
Public Sub EliminarCachesInvalidos(Optional p_DiasInvalidos As Integer = 60)
    Dim sql As String
    Dim db As DAO.Database
    Dim registrosAntes As Long
    Dim registrosDespues As Long
    
    On Error GoTo errores
    Set db = getdb()
    
    ' Contar antes
    registrosAntes = DCount("*", "TbCacheNCProyecto")
    
    ' Eliminar
    sql = "DELETE FROM TbCacheNCProyecto " & _
          "WHERE CacheValida = False " & _
          "AND DATEDIFF('d', Nz(FechaUltimoUso, FechaCache), Now()) > " & p_DiasInvalidos & ";"
    
    db.Execute sql, dbFailOnError
    
    ' Contar después
    registrosDespues = DCount("*", "TbCacheNCProyecto")
    
    Debug.Print ">> Se han eliminado " & (registrosAntes - registrosDespues) & " registros de caché inválidos por más de " & p_DiasInvalidos & " días."
    
    Exit Sub
errores:
    Debug.Print "ERROR en EliminarCachesInvalidos: " & Err.Description
End Sub

' --------------------------------------------------------------------------------
' 3. ESTADÍSTICAS DE USO DEL CACHÉ
' --------------------------------------------------------------------------------
Public Sub MostrarEstadisticasUso()
    Dim sql As String
    Dim db As DAO.Database
    Dim rcd As DAO.Recordset
    
    On Error GoTo errores
    Set db = getdb()
    
    Debug.Print vbNewLine & "=== ESTADÍSTICAS GENERALES ==="
    sql = "SELECT COUNT(*) AS Total, SUM(HitsConsultas) AS Hits, " & _
          "COUNT(IIF(HitsConsultas > 0, 1, Null)) AS Usados, " & _
          "SUM(TamanioBytes) / 1024 / 1024 AS MB " & _
          "FROM TbCacheNCProyecto;"
    
    Set rcd = db.OpenRecordset(sql)
    If Not rcd.EOF Then
        Debug.Print "Total Cachés: " & Nz(rcd!total, 0)
        Debug.Print "Total Hits:   " & Nz(rcd!Hits, 0)
        Debug.Print "Cachés Usados:" & Nz(rcd!Usados, 0)
        Debug.Print "Tamaño Total: " & Format(Nz(rcd!MB, 0), "0.00") & " MB"
    End If
    rcd.Close
    
    Debug.Print vbNewLine & "=== TOP 10 MÁS CONSULTADOS ==="
    Debug.Print Format("ID NC", "@@@@@@") & " | " & Format("Hits", "@@@@@@") & " | " & Format("Último Uso", "@@@@@@@@@@@@@@@@@@@") & " | " & "Tamaño KB"
    Debug.Print String(50, "-")
    
    sql = "SELECT TOP 10 IDNoConformidad, HitsConsultas, FechaUltimoUso, TamanioBytes " & _
          "FROM TbCacheNCProyecto WHERE CacheValida = True ORDER BY HitsConsultas DESC;"
    Set rcd = db.OpenRecordset(sql)
    Do While Not rcd.EOF
        Debug.Print Format(rcd!IDNoConformidad, "@@@@@@") & " | " & _
                    Format(rcd!HitsConsultas, "@@@@@@") & " | " & _
                    Format(Nz(rcd!FechaUltimoUso, ""), "dd/mm/yyyy hh:mm:ss") & " | " & _
                    Format(rcd!tamanioBytes / 1024, "0.00")
        rcd.MoveNext
    Loop
    rcd.Close
    
    Debug.Print vbNewLine & "=== TOP 10 MÁS GRANDES ==="
    Debug.Print Format("ID NC", "@@@@@@") & " | " & Format("KB", "@@@@@@@@") & " | " & "Versión"
    Debug.Print String(40, "-")
    
    sql = "SELECT TOP 10 IDNoConformidad, TamanioBytes, Version " & _
          "FROM TbCacheNCProyecto WHERE CacheValida = True ORDER BY TamanioBytes DESC;"
    Set rcd = db.OpenRecordset(sql)
    Do While Not rcd.EOF
        Debug.Print Format(rcd!IDNoConformidad, "@@@@@@") & " | " & _
                    Format(rcd!tamanioBytes / 1024, "0.00") & " | " & _
                    rcd!Version
        rcd.MoveNext
    Loop
    rcd.Close
    
    Exit Sub
errores:
    Debug.Print "ERROR en MostrarEstadisticasUso: " & Err.Description
End Sub

' --------------------------------------------------------------------------------
' 4. DIAGNÓSTICO DE PROBLEMAS DE INTEGRIDAD
' --------------------------------------------------------------------------------
Public Sub DiagnosticarIntegridad()
    Dim sql As String
    Dim db As DAO.Database
    Dim rcd As DAO.Recordset
    Dim problemas As Long
    
    On Error GoTo errores
    Set db = getdb()
    problemas = 0
    
    Debug.Print vbNewLine & "=== DIAGNÓSTICO DE INTEGRIDAD ==="
    
    ' 1. Huérfanos
    sql = "SELECT c.IDCache, c.IDNoConformidad FROM TbCacheNCProyecto AS c " & _
          "LEFT JOIN TbNoConformidades AS n ON c.IDNoConformidad = n.IDNoConformidad " & _
          "WHERE n.IDNoConformidad Is Null;"
    Set rcd = db.OpenRecordset(sql)
    If Not rcd.EOF Then
        Debug.Print "[!] Se encontraron cachés huérfanos (sin NC en tabla principal):"
        Do While Not rcd.EOF
            Debug.Print "    - Cache ID: " & rcd!IDCache & " (NC: " & rcd!IDNoConformidad & ")"
            problemas = problemas + 1
            rcd.MoveNext
        Loop
    Else
        Debug.Print "[OK] No hay cachés huérfanos."
    End If
    rcd.Close
    
    ' 2. JSON Vacíos
    sql = "SELECT IDNoConformidad FROM TbCacheNCProyecto " & _
          "WHERE CacheValida = True AND (Len(DatosNC) = 0 OR Len(DatosACs) = 0 OR Len(DatosARs) = 0);"
    Set rcd = db.OpenRecordset(sql)
    If Not rcd.EOF Then
        Debug.Print "[!] Se encontraron cachés con JSONs vacíos:"
        Do While Not rcd.EOF
            Debug.Print "    - NC ID: " & rcd!IDNoConformidad
            problemas = problemas + 1
            rcd.MoveNext
        Loop
    Else
        Debug.Print "[OK] No hay cachés con datos vacíos."
    End If
    rcd.Close
    
    ' 3. Posibles incompletos (ACs sin ARs, solo informativo)
    sql = "SELECT n.IDNoConformidad, c.HitsConsultas FROM TbNoConformidades AS n " & _
          "INNER JOIN TbCacheNCProyecto AS c ON n.IDNoConformidad = c.IDNoConformidad " & _
          "WHERE n.Borrado = False AND c.CacheValida = True " & _
          "AND Len(c.DatosACs) > 5 AND Len(c.DatosARs) < 5;" ' < 5 asume "[]" o empty
    Set rcd = db.OpenRecordset(sql)
    If Not rcd.EOF Then
        Debug.Print "[i] INFO: NCs con ACs pero sin ARs en caché (verificar si es correcto):"
        Do While Not rcd.EOF
            Debug.Print "    - NC ID: " & rcd!IDNoConformidad & " (Hits: " & rcd!HitsConsultas & ")"
            rcd.MoveNext
        Loop
    End If
    rcd.Close
    
    If problemas = 0 Then
        Debug.Print ">> Diagnóstico finalizado sin errores críticos."
    Else
        Debug.Print ">> Diagnóstico finalizado con " & problemas & " problemas detectados."
    End If
    
    Exit Sub
errores:
    Debug.Print "ERROR en DiagnosticarIntegridad: " & Err.Description
End Sub

' --------------------------------------------------------------------------------
' 5. POBLADO Y REGENERACIÓN DE CACHÉ
' --------------------------------------------------------------------------------

' Regenera caches marcados como inválidos
Public Sub RegenerarCachesInvalidos()
    Dim sql As String
    Dim db As DAO.Database
    Dim rcd As DAO.Recordset
    Dim total As Long
    Dim procesados As Long
    Dim exitosos As Long
    Dim errorMsg As String
    
    On Error GoTo errores
    Set db = getdb()
    
    sql = "SELECT IDNoConformidad FROM TbCacheNCProyecto WHERE CacheValida = False;"
    Set rcd = db.OpenRecordset(sql)
    
    If rcd.EOF Then
        Debug.Print ">> No hay cachés marcados como inválidos para regenerar."
        rcd.Close
        Exit Sub
    End If
    
    rcd.MoveLast
    total = rcd.RecordCount
    rcd.MoveFirst
    
    Debug.Print "=== INICIANDO REGENERACIÓN DE " & total & " CACHÉS INVÁLIDOS ==="
    
    Do While Not rcd.EOF
        procesados = procesados + 1
        
        If CacheNCProyecto.GenerarCacheCompleto(CStr(rcd!IDNoConformidad), errorMsg) Then
            exitosos = exitosos + 1
            If procesados Mod 10 = 0 Then Debug.Print "   ... Procesados " & procesados & "/" & total
        Else
            Debug.Print "   [!] Error en NC " & rcd!IDNoConformidad & ": " & errorMsg
        End If
        
        rcd.MoveNext
        DoEvents ' Mantener UI responsiva
    Loop
    
    Debug.Print "=== FIN REGENERACIÓN. Éxitos: " & exitosos & "/" & total & " ==="
    rcd.Close
    Exit Sub

errores:
    Debug.Print "ERROR en RegenerarCachesInvalidos: " & Err.Description
End Sub

' Puebla la caché desde cero para todas las NCs activas
Public Sub PoblarCacheMasivo(Optional p_SoloFaltantes As Boolean = True)
    Dim sql As String
    Dim db As DAO.Database
    Dim rcd As DAO.Recordset
    Dim total As Long
    Dim procesados As Long
    Dim exitosos As Long
    Dim errorMsg As String
    Dim condicion As String
    
    On Error GoTo errores
    Set db = getdb()
    
    condicion = "WHERE Borrado = False"
    If p_SoloFaltantes Then
        condicion = condicion & " AND IDNoConformidad NOT IN (SELECT IDNoConformidad FROM TbCacheNCProyecto WHERE CacheValida = True)"
    End If
    
    sql = "SELECT IDNoConformidad FROM TbNoConformidades " & condicion & " ORDER BY IDNoConformidad DESC;"
    Set rcd = db.OpenRecordset(sql)
    
    If rcd.EOF Then
        Debug.Print ">> No se encontraron NCs que cumplan el criterio para poblar caché."
        rcd.Close
        Exit Sub
    End If
    
    rcd.MoveLast
    total = rcd.RecordCount
    rcd.MoveFirst
    
    Debug.Print "=== INICIANDO POBLADO MASIVO (" & IIf(p_SoloFaltantes, "SOLO FALTANTES", "TODAS") & ") - Total: " & total & " ==="
    
    Do While Not rcd.EOF
        procesados = procesados + 1
        
        If CacheNCProyecto.GenerarCacheCompleto(CStr(rcd!IDNoConformidad), errorMsg) Then
            exitosos = exitosos + 1
        Else
            Debug.Print "   [!] Error en NC " & rcd!IDNoConformidad & ": " & errorMsg
        End If
        
        If procesados Mod 25 = 0 Then Debug.Print "   ... Procesados " & procesados & "/" & total & " (" & Format(procesados / total, "0%") & ")"
        
        rcd.MoveNext
        DoEvents
    Loop
    
    Debug.Print "=== FIN POBLADO MASIVO. Éxitos: " & exitosos & "/" & total & " ==="
    rcd.Close
    Exit Sub

errores:
    Debug.Print "ERROR en PoblarCacheMasivo: " & Err.Description
End Sub

' --------------------------------------------------------------------------------
' 6. LIMPIEZA DE LOGS ANTIGUOS
' --------------------------------------------------------------------------------
Public Sub LimpiarLogsAntiguos(Optional p_DiasLogs As Integer = 90, Optional p_DiasErrores As Integer = 30)
    Dim db As DAO.Database
    Dim registrosAntes As Long
    Dim registrosDespues As Long
    
    On Error GoTo errores
    Set db = getdb()
    
    registrosAntes = DCount("*", "TbLogCache")
    
    ' Limpiar logs generales antiguos
    db.Execute "DELETE FROM TbLogCache WHERE FechaOperacion < DateAdd('d', -" & p_DiasLogs & ", Now());", dbFailOnError
    
    ' Limpiar errores antiguos (más agresivo)
    db.Execute "DELETE FROM TbLogCache WHERE TipoOperacion = 'Error' AND FechaOperacion < DateAdd('d', -" & p_DiasErrores & ", Now());", dbFailOnError
    
    registrosDespues = DCount("*", "TbLogCache")
    
    Debug.Print ">> Limpieza de logs completada. Registros eliminados: " & (registrosAntes - registrosDespues)
    
    Exit Sub
errores:
    Debug.Print "ERROR en LimpiarLogsAntiguos: " & Err.Description
End Sub

' --------------------------------------------------------------------------------
' 7. ESTADÍSTICAS DE RENDIMIENTO
' --------------------------------------------------------------------------------
Public Sub MostrarRendimiento()
    Dim sql As String
    Dim db As DAO.Database
    Dim rcd As DAO.Recordset
    
    On Error GoTo errores
    Set db = getdb()
    
    Debug.Print vbNewLine & "=== RENDIMIENTO DEL CACHÉ ==="
    
    sql = "SELECT COUNT(*) AS Caches, AVG(HitsConsultas) AS PromHits, " & _
          "SUM(HitsConsultas) AS TotalEvitadas " & _
          "FROM TbCacheNCProyecto WHERE CacheValida = True;"
    
    Set rcd = db.OpenRecordset(sql)
    If Not rcd.EOF Then
        Debug.Print "Cachés Activos:      " & Nz(rcd!Caches, 0)
        Debug.Print "Promedio Hits:       " & Format(Nz(rcd!PromHits, 0), "0.00")
        Debug.Print "Consultas Evitadas:  " & Nz(rcd!TotalEvitadas, 0)
    End If
    rcd.Close
    
    Debug.Print vbNewLine & "=== DISTRIBUCIÓN DE TAMAÑO ==="
    Debug.Print Format("Rango", "@@@@@@@@@@@@@@@") & " | " & Format("Cant.", "@@@@@") & " | " & "Prom. Hits"
    Debug.Print String(40, "-")
    
    sql = "SELECT " & _
          "SWITCH(TamanioBytes < 1024, '< 1 KB', " & _
          "TamanioBytes < 10240, '1-10 KB', " & _
          "TamanioBytes < 102400, '10-100 KB', " & _
          "TamanioBytes < 1048576, '100KB-1MB', " & _
          "True, '> 1 MB') AS Rango, " & _
          "COUNT(*) as Cantidad, AVG(HitsConsultas) as Hits " & _
          "FROM TbCacheNCProyecto WHERE CacheValida = True " & _
          "GROUP BY SWITCH(TamanioBytes < 1024, '< 1 KB', " & _
          "TamanioBytes < 10240, '1-10 KB', " & _
          "TamanioBytes < 102400, '10-100 KB', " & _
          "TamanioBytes < 1048576, '100KB-1MB', " & _
          "True, '> 1 MB');"
          
    Set rcd = db.OpenRecordset(sql)
    Do While Not rcd.EOF
        Debug.Print Format(rcd!Rango, "@@@@@@@@@@@@@@@") & " | " & _
                    Format(rcd!Cantidad, "@@@@@") & " | " & _
                    Format(rcd!Hits, "0.0")
        rcd.MoveNext
    Loop
    rcd.Close
    
    Exit Sub
errores:
    Debug.Print "ERROR en MostrarRendimiento: " & Err.Description
End Sub




