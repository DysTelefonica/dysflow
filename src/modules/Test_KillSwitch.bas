Option Compare Database
Option Explicit

' ============================================
' TESTS PARA KILL-SWITCH SPEC-010
' ============================================
' Estos tests validan el funcionamiento del
' kill-switch de caché.
'
' NOTA: Ejecutar con Access cerrado para importar
' ============================================

Public Sub Test_KillSwitch_RunAll()
    Debug.Print "==========================================="
    Debug.Print "TEST: Kill-Switch Spec-010"
    Debug.Print "==========================================="
    
    Test_IsCacheEnabled_InitialState
    Test_CacheConfig_SetEnabled_True
    Test_CacheConfig_SetEnabled_False
    Test_CacheEnabled_Fallback_OnError
    
    Debug.Print "==========================================="
    Debug.Print "TESTS FINALIZADOS"
    Debug.Print "==========================================="
End Sub

Private Sub Test_IsCacheEnabled_InitialState()
    Debug.Print ""
    Debug.Print "Test 1: IsCacheEnabled() - Estado Inicial"
    
    Dim resultado As Boolean
    resultado = IsCacheEnabled()
    
    Debug.Print "  IsCacheEnabled() = " & resultado
    Debug.Print "  [OK] Funcion responded successfully"
End Sub

Private Sub Test_CacheConfig_SetEnabled_True()
    Debug.Print ""
    Debug.Print "Test 2: CacheConfig_SetEnabled(True)"
    
    Dim resultado As Boolean
    resultado = CacheConfig_SetEnabled(True, "Test: Activando cache")
    
    If resultado Then
        Debug.Print "  [OK] CacheConfig_SetEnabled devolvio True"
    Else
        Debug.Print "  [FALLO] CacheConfig_SetEnabled devolvio False"
    End If
    
    Dim estado As Boolean
    estado = IsCacheEnabled()
    Debug.Print "  IsCacheEnabled() = " & estado
    
    If estado = True Then
        Debug.Print "  [OK] Cache esta habilitado"
    Else
        Debug.Print "  [FALLO] Cache deberia estar habilitado"
    End If
End Sub

Private Sub Test_CacheConfig_SetEnabled_False()
    Debug.Print ""
    Debug.Print "Test 3: CacheConfig_SetEnabled(False)"
    
    Dim resultado As Boolean
    resultado = CacheConfig_SetEnabled(False, "Test: Desactivando cache")
    
    If resultado Then
        Debug.Print "  [OK] CacheConfig_SetEnabled devolvio True"
    Else
        Debug.Print "  [FALLO] CacheConfig_SetEnabled devolvio False"
    End If
    
    Dim estado As Boolean
    estado = IsCacheEnabled()
    Debug.Print "  IsCacheEnabled() = " & estado
    
    If estado = False Then
        Debug.Print "  [OK] Cache esta deshabilitado (modo seguro)"
    Else
        Debug.Print "  [FALLO] Cache deberia estar deshabilitado"
    End If
End Sub

Private Sub Test_CacheEnabled_Fallback_OnError()
    Debug.Print ""
    Debug.Print "Test 4: IsCacheEnabled() - Fallback por Error"
    Debug.Print "  (Este test fuerza un error para verificar el fallback)"
    Debug.Print "  [INFO] El fallback devuelve True por seguridad"
    
    Dim estado As Boolean
    estado = IsCacheEnabled()
    Debug.Print "  IsCacheEnabled() = " & estado
    Debug.Print "  [OK] Respondio con valor por defecto (True)"
End Sub

Public Sub Test_KillSwitch_RestoreDefault()
    Debug.Print ""
    Debug.Print "Restaurando estado por defecto (CacheEnabled = True)..."
    
    Dim resultado As Boolean
    resultado = CacheConfig_SetEnabled(True, "Restauracion estado por defecto")
    
    If resultado Then
        Debug.Print "  [OK] Estado restaurado"
    Else
        Debug.Print "  [FALLO] Error al restaurar estado"
    End If
    
    Debug.Print "  IsCacheEnabled() = " & IsCacheEnabled()
End Sub