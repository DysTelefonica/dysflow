Attribute VB_Name = "IndicadorRepositorio"

Option Compare Database
Option Explicit

' =============================================================================
' CONSULTAS SQL LIMPIAS (Solo fechas, sin filtrar por expedientes)
' =============================================================================

' 1. NC Abiertas en el periodo
Public Function SQL_NC_AbiertasEnPeriodo(dInicio As Date, dFin As Date) As String
    Dim sql As String
    sql = "SELECT * FROM TbNoConformidades " & _
          "WHERE Borrado = False " & _
          "AND (FECHAAPERTURA >= #" & Format(dInicio, "mm/dd/yyyy") & "# AND FECHAAPERTURA <= #" & Format(dFin, "mm/dd/yyyy") & "#);"
    SQL_NC_AbiertasEnPeriodo = sql
End Function

' 2. NC Replanificadas en el periodo
' Join con TbReplanificacionesProyecto
Public Function SQL_NC_ReplanificadasEnPeriodo(dInicio As Date, dFin As Date) As String
    Dim sql As String
    sql = "SELECT DISTINCT T.* " & _
          "FROM TbNoConformidades AS T " & _
          "INNER JOIN TbReplanificacionesProyecto AS R ON T.IDNoConformidad = R.IDNoConformidad " & _
          "WHERE T.Borrado = False " & _
          "AND (R.FechaReprogramacion >= #" & Format(dInicio, "mm/dd/yyyy") & "# AND R.FechaReprogramacion <= #" & Format(dFin, "mm/dd/yyyy") & "#);"
    SQL_NC_ReplanificadasEnPeriodo = sql
End Function

' 3. Stock Activo
' Abiertas antes del inicio Y (no cerradas O cerradas dentro/después del periodo)
Public Function SQL_NC_StockActivo(dInicio As Date, dFin As Date) As String
    Dim sql As String
    sql = "SELECT * FROM TbNoConformidades " & _
          "WHERE Borrado = False " & _
          "AND FECHAAPERTURA < #" & Format(dInicio, "mm/dd/yyyy") & "# " & _
          "AND (FECHACIERRE IS NULL OR FECHACIERRE >= #" & Format(dInicio, "mm/dd/yyyy") & "#);"
    SQL_NC_StockActivo = sql
End Function

' 4. NC Con Riesgo
' Criterio: La fecha de la ÚLTIMA asociación (Max FechaRegistro) cae en el periodo.
Public Function SQL_NC_ConRiesgo(dInicio As Date, dFin As Date) As String
    Dim sql As String
    
    ' CORRECCIÓN: Usamos 'FechaRegistro' que es el campo real en la tabla TbRiesgosNC
    ' en lugar de 'FechaDecision'.
    
    sql = "SELECT * FROM TbNoConformidades " & _
          "WHERE Borrado = False " & _
          "AND IDNoConformidad IN (" & _
                "SELECT IDNC " & _
                "FROM TbRiesgosNC " & _
                "GROUP BY IDNC " & _
                "HAVING Max(FechaDecison) >= #" & Format(dInicio, "mm/dd/yyyy") & "# " & _
                "AND Max(FechaDecison) <= #" & Format(dFin, "mm/dd/yyyy") & "#" & _
          ");"
          
    SQL_NC_ConRiesgo = sql
End Function

' =============================================================================
' HELPER: OBTENER OBJETOS (Para Excel y Listados)
' =============================================================================
Public Function GetColeccionPorIndicador(sTipo As String, dIni As Date, dFin As Date, ByRef p_Error As String) As Scripting.Dictionary
    Dim rcd As DAO.Recordset
    Dim sSQL As String
    Dim m_Col As Scripting.Dictionary
    Dim m_NC As NCProyecto
    
    On Error GoTo errores
    
    ' 1. Seleccionar la SQL limpia
    Select Case sTipo
        Case "ABIERTAS": sSQL = SQL_NC_AbiertasEnPeriodo(dIni, dFin)
        Case "REPLAN":   sSQL = SQL_NC_ReplanificadasEnPeriodo(dIni, dFin)
        Case "STOCK":    sSQL = SQL_NC_StockActivo(dIni, dFin)
        Case "RIESGO":   sSQL = SQL_NC_ConRiesgo(dIni, dFin)
    End Select
    
    ' 2. Ejecutar contra el backend
    Set rcd = getdb().OpenRecordset(sSQL)
    
    Set m_Col = New Scripting.Dictionary
    m_Col.CompareMode = TextCompare
    
    ' 3. Hidratar objetos
    Do While Not rcd.EOF
        Set m_NC = New NCProyecto
        
        With m_NC
            .IDNoConformidad = rcd!IDNoConformidad
            .CodigoNoConformidad = Nz(rcd!CodigoNoConformidad, "")
            .Descripcion = Nz(rcd!Descripcion, "")
            .Estado = Nz(rcd!Estado, "")
            .FechaApertura = Nz(rcd!FechaApertura, "")
            .FECHACIERRE = Nz(rcd!FECHACIERRE, "")
            .FPREVCIERRE = Nz(rcd!FPREVCIERRE, "")
            .RESPONSABLECALIDAD = Nz(rcd!RESPONSABLECALIDAD, "")
            .ResponsableTelefonica = Nz(rcd!ResponsableTelefonica, "")
            .IDTipo = Nz(rcd!IDTipo, "")
            ' Estos campos existen en TbNoConformidades según tu esquema
            .CodExp = Nz(rcd!CodExp, "")
            .Nemotecnico = Nz(rcd!Nemotecnico, "")
        End With
        
        If Not m_Col.Exists(CStr(m_NC.IDNoConformidad)) Then
            m_Col.Add CStr(m_NC.IDNoConformidad), m_NC
        End If
        
        rcd.MoveNext
    Loop
    
    rcd.Close
    Set rcd = Nothing
    Set GetColeccionPorIndicador = m_Col
    Exit Function

errores:
    p_Error = "Error en IndicadorRepositorio.GetColeccionPorIndicador: " & Err.Description
    Set GetColeccionPorIndicador = Nothing
End Function

