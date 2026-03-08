Attribute VB_Name = "TestCacheNC"

Option Compare Database
Option Explicit

' ============================================
' MÓDULO DE TEST PARA VALIDAR LA CACHÉ DE NCs
' ============================================

Public Sub RunAllTests()
    Dim idNC As String
    Dim p_Error As String
    
    ' 1. Obtener una NC válida de la BD para testear
    idNC = GetValidIDNC()
    
    If idNC = "" Then
        Debug.Print "TEST FAILED: No se encontró ninguna NC en la BD para probar."
        Exit Sub
    End If
    
    Debug.Print "============================================"
    Debug.Print "INICIANDO TESTS DE CACHÉ PARA NC: " & idNC
    Debug.Print "============================================"
    
    ' Test 1: Generación de Caché
    TestGenerarCache idNC
    
    ' Test 2: Lectura desde Caché
    TestLecturaCache idNC
    
    ' Test 3: Invalidación y Regeneración
    TestInvalidacionCache idNC
    
    ' Test 4: Integración con constructor.getNCProyecto
    TestIntegracionConstructor idNC
    
    Debug.Print "============================================"
    Debug.Print "TESTS FINALIZADOS"
    Debug.Print "============================================"
End Sub

Private Sub TestGenerarCache(p_IDNC As String)
    Dim p_Error As String
    Dim resultado As Boolean
    
    Debug.Print "Test 1: Generando caché completo..."
    resultado = CacheNCProyecto.GenerarCacheCompleto(p_IDNC, p_Error)
    
    If resultado And p_Error = "" Then
        Debug.Print "  [OK] Caché generado correctamente."
    Else
        Debug.Print "  [FALLO] Error al generar caché: " & p_Error
        ' Intentar continuar para ver si hay otros errores
    End If
End Sub

Private Sub TestLecturaCache(p_IDNC As String)
    Dim p_Error As String
    Dim nc As NCProyecto
    
    Debug.Print "Test 2: Leyendo desde caché..."
    Set nc = CacheNCProyecto.ObtenerNCDesdeCache(p_IDNC, p_Error)
    
    If Not nc Is Nothing And p_Error = "" Then
        Debug.Print "  [OK] NC cargada desde caché."
        Debug.Print "  [INFO] Código NC: " & nc.CodigoNoConformidad
        Debug.Print "  [INFO] Conteo ACs: " & nc.ACs.count
        
        ' Verificar ARs dentro de ACs
        Dim idAC As Variant
        Dim countARs As Long
        countARs = 0
        For Each idAC In nc.ACs.Keys
            countARs = countARs + nc.ACs(idAC).ARs.count
        Next idAC
        Debug.Print "  [INFO] Conteo total ARs en ACs: " & countARs
        
        Debug.Print "  [INFO] Conteo Replanificaciones: " & nc.Replanificaciones.count
        Debug.Print "  [INFO] Conteo Riesgos: " & nc.Riesgos.count
    Else
        Debug.Print "  [FALLO] Error al leer desde caché: " & p_Error
    End If
End Sub

Private Sub TestInvalidacionCache(p_IDNC As String)
    Dim p_Error As String
    Dim resultado As Boolean
    
    Debug.Print "Test 3: Invalidando y regenerando..."
    resultado = CacheNCProyecto.InvalidarCache(p_IDNC, "Test de invalidación", p_Error)
    
    If resultado Then
        Debug.Print "  [OK] Caché marcado como inválido."
        
        ' Probar ObtenerNCConCache (debería regenerar automáticamente)
        Dim nc As NCProyecto
        Set nc = CacheNCProyecto.ObtenerNCConCache(p_IDNC, False, p_Error)
        
        If Not nc Is Nothing Then
            Debug.Print "  [OK] Caché regenerado automáticamente tras invalidación."
        Else
            Debug.Print "  [FALLO] Error al regenerar tras invalidación: " & p_Error
        End If
    Else
        Debug.Print "  [FALLO] Error al invalidar: " & p_Error
    End If
End Sub

Private Sub TestIntegracionConstructor(p_IDNC As String)
    Dim p_Error As String
    Dim nc As NCProyecto
    
    Debug.Print "Test 4: Probando integración en constructor.getNCProyecto..."
    ' Esto asume que la Fase 1 está implementada en constructor.bas
    Set nc = constructor.getNCProyecto(p_IDNC, p_Error)
    
    If Not nc Is Nothing And p_Error = "" Then
        Debug.Print "  [OK] Integración exitosa."
    Else
        Debug.Print "  [FALLO] Error en integración: " & p_Error
    End If
End Sub

Private Function GetValidIDNC() As String
    Dim rcd As dao.Recordset
    Dim sql As String
    
    ' Buscamos una NC que tenga ACs y ARs para un test más completo
    sql = "SELECT TOP 1 TbNoConformidades.IDNoConformidad " & _
          "FROM (TbNoConformidades INNER JOIN TbNCAccionCorrectivas ON TbNoConformidades.IDNoConformidad = TbNCAccionCorrectivas.IDNoConformidad) " & _
          "INNER JOIN TbNCAccionesRealizadas ON TbNCAccionCorrectivas.IdAccionCorrectiva = TbNCAccionesRealizadas.IdAccionCorrectiva " & _
          "WHERE TbNoConformidades.Borrado = False;"
          
    On Error Resume Next
    Set rcd = getdb().OpenRecordset(sql)
    
    If rcd Is Nothing Or rcd.EOF Then
        ' Si no hay con todo, cualquier NC
        sql = "SELECT TOP 1 IDNoConformidad FROM TbNoConformidades WHERE Borrado = False;"
        Set rcd = getdb().OpenRecordset(sql)
    End If
    
    If Not rcd.EOF Then
        GetValidIDNC = CStr(rcd!IDNoConformidad)
    Else
        GetValidIDNC = ""
    End If
    
    rcd.Close
    Set rcd = Nothing
End Function


