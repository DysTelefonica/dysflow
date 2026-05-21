Attribute VB_Name = "TestJsonExporter"
Option Compare Database
Option Explicit

' ==========================================================================================
' Test para verificar la exportación de JSON
' ==========================================================================================
Public Sub TestExportarExpediente(IDExp As Long)
    Dim json As String
    Dim rutaFolder As String
    Dim rutaArchivo As String
    Dim fso As Object
    
    
    
    rutaFolder = m_ObjEntorno.URLDirectorioLocal
    rutaArchivo = rutaFolder & "Expediente_" & IDExp & ".json"
    
    ' 1. Asegurar que el directorio existe
    Set fso = CreateObject("Scripting.FileSystemObject")
    If Not fso.FolderExists(rutaFolder) Then
        On Error Resume Next
        ' Intentar crear la estructura de carpetas (nota: CreateFolder solo crea un nivel si el padre existe)
        ' Para seguridad en rutas profundas, es mejor asegurar cada nivel o usar una función recursiva.
        ' Aquí asumimos que AppData\Roaming existe y vamos creando hacia abajo si es necesario.
        
        ' Simplificación: Intentamos crear la carpeta final directamente.
        ' Si falla porque el padre no existe, habría que hacerlo recursivo.
        fso.CreateFolder rutaFolder
        
        ' Si falla CreateFolder, intentamos con shell para crear toda la ruta
        If Err.Number <> 0 Then
            Err.Clear
            CrearRutaCompleta rutaFolder
        End If
        On Error GoTo 0
    End If
    
    ' 2. Generar el JSON
    Debug.Print "Generando JSON para expediente " & IDExp & "..."
    json = ExpedienteJsonExporter.GenerarJsonExpediente(IDExp)
    
    ' 3. Guardar en archivo
    Debug.Print "Guardando en: " & rutaArchivo
    ExpedienteJsonExporter.GuardarJsonEnArchivo json, rutaArchivo
    
    Debug.Print "Proceso finalizado correctamente."
    MsgBox "JSON generado y guardado en:" & vbCrLf & rutaArchivo, vbInformation, "Exportación Completada"
End Sub

' ==========================================================================================
' Test para exportar expedientes específicos por SQL (1072 y 402)
' ==========================================================================================
Public Sub TestExportarExpedientes1072y402()
    Dim json As String
    Dim rutaFolder As String
    Dim rutaArchivo As String
    Dim fso As Object
    Dim sql As String
    
    ' Consulta SQL para seleccionar expedientes específicos
    sql = "SELECT * FROM TbExpedientes WHERE IDExpediente IN (1072, 402)"
    
    rutaFolder = "C:\Users\adm.DEFENSA\AppData\Roaming\Aplicaciones DYSN\EXPEDIENTES"
    rutaArchivo = rutaFolder & "\Expedientes_1072_402.json"
    
    ' 1. Asegurar que el directorio existe
    Set fso = CreateObject("Scripting.FileSystemObject")
    If Not fso.FolderExists(rutaFolder) Then
        On Error Resume Next
        fso.CreateFolder rutaFolder
        If Err.Number <> 0 Then
            Err.Clear
            CrearRutaCompleta rutaFolder
        End If
        On Error GoTo 0
    End If
    
    ' 2. Generar el JSON usando la consulta SQL
    Debug.Print "Generando JSON desde SQL: " & sql
    json = ExpedienteJsonExporter.GenerarJsonDesdeSQL(sql)
    
    ' 3. Guardar en archivo
    Debug.Print "Guardando en: " & rutaArchivo
    ExpedienteJsonExporter.GuardarJsonEnArchivo json, rutaArchivo
    
    Debug.Print "Proceso finalizado correctamente."
    MsgBox "JSON generado y guardado en:" & vbCrLf & rutaArchivo, vbInformation, "Exportación SQL Completada"
End Sub

Private Sub CrearRutaCompleta(ByVal ruta As String)
    Dim partes() As String
    Dim i As Integer
    Dim rutaParcial As String
    Dim fso As Object
    
    Set fso = CreateObject("Scripting.FileSystemObject")
    partes = Split(ruta, "\")
    
    ' Manejar caso de disco (ej: "C:")
    rutaParcial = partes(0)
    
    For i = 1 To UBound(partes)
        rutaParcial = rutaParcial & "\" & partes(i)
        If Not fso.FolderExists(rutaParcial) Then
            fso.CreateFolder rutaParcial
        End If
    Next i
End Sub

