Option Compare Database
Option Explicit

Public Sub Test_NCProyectoDetailVM()
    Dim vm As NCProyectoDetailVM
    Dim vm2 As NCProyectoDetailVM
    Dim errorMsg As String
    Dim passed As Boolean
    Dim i As Integer
    Dim item As Variant
    
    passed = True
    
    Debug.Print "=== TEST NCProyectoDetailVM ==="
    Debug.Print ""
    
    On Error GoTo handleError
    
    Set vm = getNCProyectoDetailVM(p_IDNC:=405, p_Error:=errorMsg)
    
    If errorMsg <> "" Then
        Debug.Print "[ERROR CARGA] " & errorMsg
    End If
    
    If vm Is Nothing Then
        Debug.Print "[FALLO] vm es Nothing"
        passed = False
    ElseIf Not vm.EstaCargado Then
        Debug.Print "[FALLO] vm no está cargado"
        passed = False
    Else
        Debug.Print "[OK] VM cargado correctamente"
        Debug.Print "  === PESTAÑA GENERAL ==="
        Debug.Print "  ID: " & vm.IDNoConformidad
        Debug.Print "  Código: " & vm.CodigoNoConformidad
        Debug.Print "  Estado: " & vm.Estado
        Debug.Print "  Descripcion: " & Left(vm.Descripcion, 50) & "..."
        Debug.Print "  Causa: " & Left(vm.Causa, 50) & "..."
        Debug.Print "  Proyecto: " & vm.Proyecto
        Debug.Print "  Vehiculo: " & vm.VEHICULO
        Debug.Print "  Expediente: " & vm.Expediente
        Debug.Print "  Fecha Apertura: " & vm.FechaApertura
        Debug.Print "  Fecha Cierre: " & vm.FECHACIERRE
        Debug.Print "  Fecha Prev Cierre: " & vm.FechaPrevCierre
        Debug.Print "  Juridica: " & vm.Juridica
        Debug.Print "  Tipo: " & vm.Tipo
        Debug.Print "  Cerrada: " & vm.Cerrada
        Debug.Print "  Requiere ACR: " & vm.RequiereACR
        Debug.Print "  ACR: " & vm.ACR
        Debug.Print "  Requiere Control Eficacia: " & vm.RequiereControlEficacia
        Debug.Print "  Control Eficacia: " & vm.ControlEficacia
        Debug.Print "  Fecha Control Eficacia: " & vm.FechaControlEficacia
        Debug.Print "  Tipologia: " & vm.Tipologia
        Debug.Print "  CodExp: " & vm.CodExp
        Debug.Print "  Nemotecnico: " & vm.Nemotecnico
        Debug.Print "  Codigo Riesgo: " & vm.CodigoRiesgo
        Debug.Print "  Detectado Por: " & vm.DetectadoPor
        Debug.Print "  Responsable Ejecucion: " & vm.ResponsableEjecucion
        
        Debug.Print ""
        Debug.Print "  === PESTAÑA ACCIONES (ARs) ==="
        If vm.colARs.count > 0 Then
            For i = 1 To vm.colARs.count
                item = vm.colARs(i)
                Debug.Print "  AR #" & i & ": " & item(1) & " - " & item(2)
            Next i
        Else
            Debug.Print "  (sin ARs)"
        End If
        
        Debug.Print ""
        Debug.Print "  === PESTAÑA ACCIONES (ACs) ==="
        If vm.ColACs.count > 0 Then
            For i = 1 To vm.ColACs.count
                item = vm.ColACs(i)
                Debug.Print "  AC #" & i & ": " & item(1) & " - " & item(2)
            Next i
        Else
            Debug.Print "  (sin ACs)"
        End If
        
        Debug.Print ""
        Debug.Print "  === PESTAÑA DOCUMENTOS ==="
        If vm.ColDocumentos.count > 0 Then
            For i = 1 To vm.ColDocumentos.count
                item = vm.ColDocumentos(i)
                Debug.Print "  Doc #" & i & ": " & item(1) & " (" & item(2) & ")"
            Next i
        Else
            Debug.Print "  (sin documentos)"
        End If
        
        Debug.Print ""
        Debug.Print "  === PESTAÑA REPLANIFICACIONES ==="
        If vm.ColReplanificaciones.count > 0 Then
            For i = 1 To vm.ColReplanificaciones.count
                item = vm.ColReplanificaciones(i)
                Debug.Print "  Replanif #" & i & ": " & item(1)
            Next i
        Else
            Debug.Print "  (sin replanificaciones)"
        End If
    End If
    
    Debug.Print ""
    Debug.Print "--- Test con ID inexistente ---"
    Set vm2 = getNCProyectoDetailVM(p_IDNC:=999999, p_Error:=errorMsg)
    
    If vm2 Is Nothing Then
        Debug.Print "[OK] vm2 es Nothing (esperado)"
    ElseIf Not vm2.EstaCargado Then
        Debug.Print "[OK] vm2 no está cargado (esperado)"
    Else
        Debug.Print "[FALLO] vm2 debería estar vacío"
        passed = False
    End If
    
    Debug.Print ""
    Debug.Print "--- Test sin ID (instancia vacía) ---"
    Set vm2 = getNCProyectoDetailVM(p_Error:=errorMsg)
    
    If vm2 Is Nothing Then
        Debug.Print "[FALLO] vm no debería ser Nothing"
        passed = False
    ElseIf vm2.EstaCargado Then
        Debug.Print "[FALLO] vm no debería estar cargado sin ID"
        passed = False
    Else
        Debug.Print "[OK] Instancia vacía creada correctamente"
    End If
    
    Debug.Print ""
    If passed Then
        Debug.Print "=== TODOS LOS TESTS PASADOS ==="
    Else
        Debug.Print "=== ALGUNOS TESTS FALLARON ==="
    End If
    
    Exit Sub
    
handleError:
    Debug.Print "[ERROR] " & Err.Number & ": " & Err.Description
    Debug.Print "=== TEST ABORTADO POR ERROR ==="
End Sub