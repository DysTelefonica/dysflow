Attribute VB_Name = "MenuContextual"
Option Compare Database
Option Explicit

' ESTA ES LA FUNCIÓN CLAVE QUE LLAMARÁ EL MENÚ
' Recibe el nombre de la función pública que tienes en el formulario
Public Function EjecutarAccionMenu(NombreMetodo As String)
    Dim objObjetivo As Object
    
    On Error GoTo errores
    
    ' 1. INTENTO 1 (El más robusto para Subformularios):
    ' Obtenemos el formulario que contiene el control que tiene el foco.
    ' Si hiciste clic derecho en la lista, el ActiveControl es la lista,
    ' y su Parent es 'Form_FormExpedienteSuministradores'.
    On Error Resume Next
    Set objObjetivo = Screen.ActiveControl.Parent
    On Error GoTo errores
    
    ' 2. INTENTO 2 (Fallback):
    ' Si falló lo anterior (raro), usamos el formulario activo global.
    If objObjetivo Is Nothing Then
        Set objObjetivo = Screen.ActiveForm
    End If
    
    ' 3. Ejecutamos la función pública en el objeto correcto
    '    Ahora sí encontrará 'Public_VerDetalleLista' dentro del subformulario.
    CallByName objObjetivo, NombreMetodo, VbMethod
    
    Exit Function

errores:
    MsgBox "Error al ejecutar acción del menú (" & NombreMetodo & "): " & Err.Description, vbCritical
End Function
