VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "Form_FormIndicadores"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = True
Attribute VB_PredeclaredId = True
Attribute VB_Exposed = False
Option Compare Database
Option Explicit

Private m_Servicio As IndicadorServicio
Private m_dInicio As Date
Private m_dFin As Date
Private m_Error As String

Private Sub btnSalir_Click()
    DoCmd.Close acForm, Me.Name, acSaveNo
End Sub

Private Sub cmdAyuda_Click()
    Dim m_URLServ As String
    Dim m_URLLocal As String
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    
    m_Error = ""
    m_URLServ = m_ObjEntorno.URLAyudaIndicadores
    If Not fso.FileExists(m_URLServ) Then
        m_Error = "No se encuentra la ayuda en el servidor"
        Err.Raise 1000
    End If
    m_URLLocal = m_ObjEntorno.URLDirectorioLocal & fso.GetFileName(m_URLServ)
    fso.CopyFile m_URLServ, m_URLLocal, True
    
    If Not fso.FileExists(m_URLLocal) Then
        m_Error = "No se encuentra la ayuda en el servidor"
        Err.Raise 1000
    End If
    Ejecutar Me.hWnd, "open", m_URLLocal, "", "", 1
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoAyuda_Click se ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
    End If
    
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub Form_Load()
    Set m_Servicio = New IndicadorServicio
    Ajustar Me
    Me.lblTitulo.Caption = "INDICADORES"
    Me.Caption = Me.lblTitulo.Caption
    ' Valores por defecto
    Me.txtAnio = Year(Date)
    If Month(Date) <= 6 Then
        Me.cmbSemestre = "S1"
    Else
        Me.cmbSemestre = "S2"
    End If
    
    ' Inicializar etiquetas vacías
    LimpiarResultados
End Sub

Private Sub LimpiarResultados()
    Me.lblResAbiertas.Caption = "-"
    Me.lblResReplan.Caption = "-"
    Me.lblResStock.Caption = "-"
    Me.lblResRiesgo.Caption = "-"
End Sub

Private Sub btnCalcular_Click()
    Dim sIDs As String: sIDs = "" ' Todos los proyectos
    
    On Error GoTo errores
    DoCmd.Hourglass True
    
    sIDs = Nz(Me.cmbSemestre, "S1")
    ' Calcular fechas
    m_Servicio.CalcularFechasPeriodo sIDs, Nz(Me.txtAnio, Year(Date)), m_dInicio, m_dFin
    
    ' Calcular e imprimir valores en las etiquetas grandes
    Me.lblResAbiertas.Caption = m_Servicio.TotalAbiertasPeriodo(m_dInicio, m_dFin, sIDs)
    Me.lblResReplan.Caption = m_Servicio.TotalReplanificadas(m_dInicio, m_dFin, sIDs)
    Me.lblResStock.Caption = m_Servicio.TotalStockActivo(m_dInicio, m_dFin, sIDs)
    Me.lblResRiesgo.Caption = m_Servicio.TotalConRiesgo(m_dInicio, m_dFin, sIDs)
    
    DoCmd.Hourglass False
    Exit Sub

errores:
    DoCmd.Hourglass False
    MsgBox "Error al calcular: " & Err.Description, vbCritical
End Sub

' --- BOTONES DE EXPORTACIÓN DIRECTA ---

Private Sub ExportarDirecto(sTipo As String)
    Dim sIDs As String: sIDs = ""
    Dim sRuta As String
    Dim sError As String
    Dim colResultado As Scripting.Dictionary
    
    On Error GoTo errores
    DoCmd.Hourglass True
    
    sIDs = Nz(Me.cmbSemestre, "S1")
    ' Asegurar fechas actualizadas
    m_Servicio.CalcularFechasPeriodo sIDs, Nz(Me.txtAnio, Year(Date)), m_dInicio, m_dFin
    
    ' 1. Obtener datos
    Set colResultado = m_Servicio.ObtenerDetalleIndicador(sTipo, m_dInicio, m_dFin, sIDs, sError)
    
    If sError <> "" Then Err.Raise 1000, , sError
    If colResultado Is Nothing Then Err.Raise 1000, , "No hay datos."
    If colResultado.count = 0 Then Err.Raise 1000, , "No hay datos."
    
    ' 2. Generar Excel (PASANDO EL TIPO DE INFORME)
    ' sTipo vendrá como "ABIERTAS", "REPLAN", "STOCK" o "RIESGO"
    ' La función global usará esto para decidir si muestra la columna de replanificaciones
    sRuta = GestionNCProyectosAExcel(colResultado, sError, sTipo)
    
    DoCmd.Hourglass False
    
    If sError <> "" Then
        MsgBox "Error generando Excel: " & sError, vbCritical
    Else
        If MsgBox("Informe generado. ¿Abrir?", vbQuestion + vbYesNo) = vbYes Then
            Ejecutar Me.hWnd, "open", sRuta, "", "", 1
        End If
    End If
    Exit Sub

errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then MsgBox Err.Description, vbInformation
End Sub

Private Sub btnExcelAbiertas_Click()
    ExportarDirecto "ABIERTAS"
End Sub

Private Sub btnExcelReplan_Click()
    ExportarDirecto "REPLAN"
End Sub

Private Sub btnExcelStock_Click()
    ExportarDirecto "STOCK"
End Sub

Private Sub btnExcelRiesgo_Click()
    ExportarDirecto "RIESGO"
End Sub

