VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "IndicadorServicio"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False

Option Compare Database
Option Explicit

' =============================================================================================
' SERVICIO DE INDICADORES DE CALIDAD
' Calcula fechas, conteos y orquesta la obtención de detalles desde el repositorio.
' =============================================================================================

Private m_Error As String

' ---------------------------------------------------------------------------------------------
' 1. LÓGICA DE FECHAS
' ---------------------------------------------------------------------------------------------

' Calcula las fechas de inicio y fin basándose en el semestre (S1/S2) y el año.
Public Sub CalcularFechasPeriodo(p_Semestre As String, p_Anio As Integer, ByRef dInicio As Date, ByRef dFin As Date)
    On Error GoTo errores
    
    If p_Semestre = "S1" Then
        dInicio = DateSerial(p_Anio, 1, 1)
        dFin = DateSerial(p_Anio, 6, 30)
    Else
        ' Asumimos S2 por defecto si no es S1
        dInicio = DateSerial(p_Anio, 7, 1)
        dFin = DateSerial(p_Anio, 12, 31)
    End If
    Exit Sub

errores:
    ' En caso de error de fechas (ej: año inválido), devolvemos el año actual completo por seguridad
    dInicio = DateSerial(Year(Date), 1, 1)
    dFin = DateSerial(Year(Date), 12, 31)
End Sub

' Función auxiliar privada para ejecutar el COUNT sobre una SQL
Private Function ContarRegistros(sSQL As String) As Long
    Dim rcd As dao.Recordset
    Dim sqlCount As String
    Dim sSqlLimpia As String
    
    On Error GoTo errores
    
    ' 1. Limpiamos el punto y coma final de la consulta original,
    '    porque si lo dejamos dentro del paréntesis da error de sintaxis.
    sSqlLimpia = Replace(sSQL, ";", "")
    
    ' 2. Envolvemos la SQL.
    '    IMPORTANTE: Access exige un ALIAS (AS T) para las subconsultas en el FROM.
    sqlCount = "SELECT Count(*) AS Total FROM (" & sSqlLimpia & ") AS T"
    
    Set rcd = getdb().OpenRecordset(sqlCount)
    If Not rcd.EOF Then
        ContarRegistros = Nz(rcd!total, 0)
    Else
        ContarRegistros = 0
    End If
    
    rcd.Close
    Set rcd = Nothing
    Exit Function

errores:
    ' En caso de error, devolvemos -1 para que sea evidente en la interfaz
    ContarRegistros = -1
    Debug.Print "Error en ContarRegistros: " & Err.Description
    Debug.Print "SQL Fallida: " & sqlCount
End Function

' -- Indicador 1: NC Abiertas en el periodo --
Public Function TotalAbiertasPeriodo(dIni As Date, dFin As Date, Optional sIdsIgnored As String = "") As Long
    Dim sSQL As String
    sSQL = IndicadorRepositorio.SQL_NC_AbiertasEnPeriodo(dIni, dFin)
    TotalAbiertasPeriodo = ContarRegistros(sSQL)
End Function

' -- Indicador 2: Replanificadas en el periodo --
Public Function TotalReplanificadas(dIni As Date, dFin As Date, Optional sIdsIgnored As String = "") As Long
    Dim sSQL As String
    sSQL = IndicadorRepositorio.SQL_NC_ReplanificadasEnPeriodo(dIni, dFin)
    TotalReplanificadas = ContarRegistros(sSQL)
End Function

' -- Indicador 3: Stock Activo --
Public Function TotalStockActivo(dIni As Date, dFin As Date, Optional sIdsIgnored As String = "") As Long
    Dim sSQL As String
    sSQL = IndicadorRepositorio.SQL_NC_StockActivo(dIni, dFin)
    TotalStockActivo = ContarRegistros(sSQL)
End Function

' -- Indicador 4: Con Riesgo Asociado --
Public Function TotalConRiesgo(dIni As Date, dFin As Date, Optional sIdsIgnored As String = "") As Long
    Dim sSQL As String
    sSQL = IndicadorRepositorio.SQL_NC_ConRiesgo(dIni, dFin)
    TotalConRiesgo = ContarRegistros(sSQL)
End Function

' ---------------------------------------------------------------------------------------------
' 3. OBTENCIÓN DE DETALLE (Para listado y Excel)
' ---------------------------------------------------------------------------------------------

' Obtiene el diccionario de objetos NCProyecto para exportar
Public Function ObtenerDetalleIndicador(sTipo As String, dIni As Date, dFin As Date, Optional sIdsIgnored As String = "", Optional ByRef p_Error As String) As Scripting.Dictionary
    On Error GoTo errores
    
    ' Delegamos en el repositorio la construcción de la colección de objetos
    Set ObtenerDetalleIndicador = IndicadorRepositorio.GetColeccionPorIndicador(sTipo, dIni, dFin, p_Error)
    
    Exit Function
errores:
    p_Error = "Error en Servicio ObtenerDetalle: " & Err.Description
    Set ObtenerDetalleIndicador = Nothing
End Function
