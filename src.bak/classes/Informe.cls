VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "Informe"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
Option Compare Database
Option Explicit

Public Error As String
Private m_Error As String
Public Function GenerarWordNoConformidades( _
                                            p_EsDeProyecto As EnumSino, _
                                            Optional p_col As Scripting.Dictionary, _
                                            Optional p_NC As Object, _
                                            Optional p_Error As String _
                                            ) As String
    
    Dim m_ID As Variant
    Dim m_NC As Object
    Dim m_Col As Scripting.Dictionary
    Dim wordApp As Word.Application
    Dim wordDoc As Word.Document
    Dim rutaGuardado As String
    Dim rng As Object
    
    On Error GoTo errores
    If p_EsDeProyecto = Empty Then
        p_Error = "No se sabe si es o no de proyecto"
        Err.Raise 1000
    End If
    If p_col Is Nothing And p_NC Is Nothing Then
        Exit Function
    End If
    If p_col Is Nothing Then
        Set m_Col = New Scripting.Dictionary
        m_Col.CompareMode = TextCompare
        If p_EsDeProyecto = EnumSino.Sí Then
            m_Col.Add CStr(p_NC.IDNoConformidad), p_NC
        Else
            m_Col.Add CStr(p_NC.id), p_NC
        End If
        
    Else
        Set m_Col = p_col
    End If
    Avance "Obteniendo ruta del informe..."
    rutaGuardado = PrepararPlantilla(p_EsDeProyecto, p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    
    Avance "Abriendo Word..."
    ' Crear instancia de Word
    Set wordApp = CreateObject("Word.Application")
    wordApp.Visible = False
    
    ' Crear nuevo documento
    Set wordDoc = wordApp.Documents.Open(rutaGuardado)
    wordDoc.PageSetup.Orientation = 1
    ' Configurar el documento
    With wordDoc.PageSetup
        .TopMargin = wordApp.CentimetersToPoints(1)
        .BottomMargin = wordApp.CentimetersToPoints(1)
        .LeftMargin = wordApp.CentimetersToPoints(1)
        .RightMargin = wordApp.CentimetersToPoints(1)
    End With
  
    Dim contador As Integer
    contador = 0
    
    ' Procesar cada No Conformidad
   For Each m_ID In m_Col
        contador = contador + 1
        Set m_NC = m_Col(m_ID)
        ' Insertar separador visual entre No Conformidades (excepto la primera)
        If contador > 1 Then
            Set rng = wordDoc.Range
            rng.Collapse 0          ' 0 = wdCollapseEnd
            rng.InsertBreak 7
            
        End If
        
        ' Insertar datos de la No Conformidad actual
        InsertarNoConformidad p_EsDeProyecto, wordDoc, m_NC, p_Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        
        Set m_NC = Nothing
    Next
    
    
    Avance "Guardando el informe..."
    wordDoc.SaveAs rutaGuardado
    
    Avance "Cerrando el Entorno..."
    ' Limpiar
    wordDoc.Close False
    wordApp.Quit
    Set wordDoc = Nothing
    Set wordApp = Nothing
    
    
    GenerarWordNoConformidades = rutaGuardado
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método Informe.GenerarWordNoConformidades ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
    End If
    If Not wordDoc Is Nothing Then
        wordDoc.Close False
    End If
    If Not wordApp Is Nothing Then
        wordApp.Quit
    End If
    Set wordDoc = Nothing
    Set wordApp = Nothing
    
End Function
Public Function PrepararPlantilla( _
                                    p_EsDeProyecto As EnumSino, _
                                    Optional p_Error As String _
                                    ) As String
    
    Dim m_URLServidor As String
    Dim m_URLLocal As String
    Dim m_NombreFinal As String
    Dim rutaGuardado As String
    Dim rng As Object
    
    On Error GoTo errores
    If p_EsDeProyecto = Empty Then
        p_Error = "No se sabe si es o no de proyecto"
        Err.Raise 1000
    End If
    Avance "Obteniendo ruta del informe..."
    m_NombreFinal = fso.GetBaseName(fso.GetTempName) & ".docx"
    
    If p_EsDeProyecto = EnumSino.Sí Then
        m_URLServidor = m_ObjEntorno.URLPlantillaInformeNCProyecto
    Else
        m_URLServidor = m_ObjEntorno.URLPlantillaInformeNCAuditoria
        
    End If
    p_Error = m_ObjEntorno.Error
    If p_Error <> "" Then
        Err.Raise 100
    End If
    If m_URLServidor = "" Then
        p_Error = "NO se ha podido obtener la plantilla del informe"
        Err.Raise 1000
    End If
    m_URLLocal = m_ObjEntorno.URLDirectorioInformesLocal & m_NombreFinal
    fso.CopyFile m_URLServidor, m_URLLocal, True
    
    
    PrepararPlantilla = m_URLLocal
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método Informe.PrepararPlantilla ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
    End If
    
    
End Function
Private Function CrearEncabezado(wordDoc As Object, p_Nombre As String, Optional p_Error As String) As String
   
    
    
    On Error Resume Next
    Dim headerRange As Object
    Dim tblHeader As Object
    Dim logoPath As String
    Dim logoImage As Object
    
    ' Ruta del logo corporativo
    logoPath = "\\datoste\aplicaciones_dys\Aplicaciones PpD\EXPEDIENTES\recursos\iconos\LogoDefensaYSeguridadAzul_100.png"
    
    ' Configurar rango del encabezado
    Set headerRange = wordDoc.Sections(1).Headers(1).Range
    headerRange.Text = ""
    
    ' Crear tabla de 3 columnas
    Set tblHeader = wordDoc.Tables.Add(headerRange, 1, 3)
    
    With tblHeader
        ' Configuración básica de la tabla
        .Borders.Enable = False  ' Eliminar bordes visibles
        .AllowAutoFit = True
        
        ' Ocupar el 100% del ancho disponible
        .PreferredWidthType = 2
        .PreferredWidth = 100
        
        ' Distribución de columnas (15% - 60% - 25%)
        .Columns(1).PreferredWidthType = 2
        .Columns(1).PreferredWidth = 15  ' Columna izquierda vacía
        
        .Columns(2).PreferredWidthType = 2
        .Columns(2).PreferredWidth = 60  ' Columna central para texto
        
        .Columns(3).PreferredWidthType = 2
        .Columns(3).PreferredWidth = 25  ' Columna derecha para logo
        
        ' Configurar contenido de la celda central
        With .Cell(1, 2).Range
            .ParagraphFormat.Alignment = wdAlignParagraphCenter
            .Text = "INFORME DE NO CONFORMIDADES" & vbCrLf & _
                    "Proyecto: [" & p_Nombre & "]" & vbCrLf & _
                    "Fecha: " & Format(Date, "dd/mm/yyyy")
            .Font.Name = "Segoe UI"
            .Font.Size = 8
            .Font.Bold = True
        End With
        
        ' Insertar logo en columna derecha
        If Dir(logoPath) <> "" Then
            Set logoImage = .Cell(1, 3).Range.InlineShapes.AddPicture( _
                filename:=logoPath, _
                LinkToFile:=False, _
                SaveWithDocument:=True)
            
            ' Ajustar tamaño del logo (altura de 2.5 cm manteniendo proporción)
            With logoImage
                .LockAspectRatio = 1
                .Height = wordDoc.Application.CentimetersToPoints(2.5)
            End With
        Else
            .Cell(1, 3).Range.Text = "Logo no encontrado"
            .Cell(1, 3).Range.Font.Color = RGB(255, 0, 0)
        End If
    End With
    
    ' Añadir línea separadora bajo el encabezado
    headerRange.Collapse wdCollapseEnd
    headerRange.InsertParagraphAfter
    headerRange.InsertHorizontalLine
    
    On Error GoTo 0







     Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método Informe.CrearEncabezado ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
    End If
End Function




Private Function InsertarTablaTareas( _
                                    wordDoc As Object, _
                                    m_AC As Object, _
                                    rng As Object, _
                                    Optional p_Error As String _
                                    ) As Object
    Dim m_AR As Object
    Dim m_Col As Scripting.Dictionary
    Dim m_ID As Variant
    
    Dim tblTareas As Object
    Dim i As Integer
    On Error GoTo errores
   
    Avance "Obteniendo Tareas .... "
    
    rng.Collapse 0  ' Colapsar al final
    rng.InsertParagraphAfter
    rng.Collapse 0  ' Colapsar al final
    With wordDoc.Paragraphs(wordDoc.Paragraphs.count).Format
        .SpaceAfter = 0
        .SpaceBefore = 0
        .LineSpacingRule = 0
    End With
    rng.Collapse 0  ' Colapsar al final
    
    Set m_Col = m_AC.ARs
    If m_Col Is Nothing Then
            
        Exit Function
    End If
   
    ' Crear tabla de tareas
    Set tblTareas = wordDoc.Tables.Add(rng, m_Col.count + 1, 4)
    
    With tblTareas
        .Borders.Enable = True
        
        
        .Cell(1, 1).Range.Text = "Tarea"
        .Cell(1, 2).Range.Text = "Fecha Inicio"
        .Cell(1, 3).Range.Text = "F. Fin Prevista"
        .Cell(1, 4).Range.Text = "Fecha Fin Real"
        
        ' Formato de encabezados
        .Rows(1).Range.Font.Bold = True
        .Rows(1).Range.Font.Color = RGB(0, 102, 255)
        .Rows(1).Shading.BackgroundPatternColor = RGB(198, 217, 241)
        '.Rows(1).Range.ParagraphFormat.Alignment = 0
        Set m_Col = m_AC.ARs
        If Not m_AC.ARs Is Nothing Then
            ' Llenar datos
            i = 2
            For Each m_ID In m_Col
                Set m_AR = m_Col(m_ID)
                .Cell(i, 1).Range.Text = m_AR.AccionRealizada
                If IsDate(m_AR.FechaInicio) Then
                    .Cell(i, 2).Range.Text = Format(m_AR.FechaInicio, "dd/mm/yyyy")
                End If
                If IsDate(m_AR.FechaFinPrevista) Then
                    .Cell(i, 3).Range.Text = Format(m_AR.FechaFinPrevista, "dd/mm/yyyy")
                End If
                If IsDate(m_AR.FechaFinReal) Then
                    .Cell(i, 4).Range.Text = Format(m_AR.FechaFinReal, "dd/mm/yyyy")
                End If
                .Rows(i).Range.ParagraphFormat.Alignment = 0
                .Rows(i).Range.Font.Bold = False
                Set m_AR = Nothing
                i = i + 1
            Next
        End If
        .PreferredWidth = 100
        .PreferredWidthType = 2
        .Columns(1).PreferredWidthType = 2
        .Columns(2).PreferredWidthType = 2
        .Columns(3).PreferredWidthType = 2
        .Columns(4).PreferredWidthType = 2
        .Columns(1).PreferredWidth = 70
        .Columns(2).PreferredWidth = 10
        .Columns(3).PreferredWidth = 10
        .Columns(4).PreferredWidth = 10
        .Rows(1).HeadingFormat = True
    End With
    
    Set InsertarTablaTareas = tblTareas
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método Informe.InsertarTablaTareas ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
    End If
End Function
Private Function InsertarAccionesCorrectivas( _
                                                wordDoc As Object, _
                                                p_NC As Object, _
                                                rng As Object, _
                                                Optional p_Error As String _
                                                ) As String
    Dim m_Col As Scripting.Dictionary
    Dim m_ID As Variant
    Dim m_AC As Object
    Dim m_NParrafo As Long
    Dim tbl As Object
    Dim tblAcciones As Object
    Dim tblTareas As Object
    Set m_Col = p_NC.ACs
    On Error GoTo errores
    
    Avance "Obteniendo Acciones correctivas .... "
    ' Insertar título
    Set tbl = wordDoc.Tables.Add(rng, 1, 1)
    With tbl
        .Borders.Enable = True
        .AutoFitBehavior 2
        .Cell(1, 1).Range.Text = "Acciones Correctivas"
        .Rows(1).Range.Font.Bold = True
        .Rows(1).Range.Font.Name = "Segoe UI"
        .Rows(1).Range.Font.Size = 12
        .Rows(1).Range.Font.Color = RGB(255, 255, 255)
        .Rows(1).Shading.BackgroundPatternColor = RGB(0, 102, 255)
        .Rows(1).Height = 15
        .Rows(1).HeightRule = 1
    End With
    Set rng = tbl.Range
  
    If m_Col Is Nothing Then
        ' No hay acciones correctivas
        rng.Collapse 0  ' Colapsar al final
        'rng.InsertAfter "No hay acciones correctivas registradas para esta No Conformidad."
        rng.Collapse 0  ' Colapsar al final
        
        With rng.Paragraphs.Last.Range
            .Font.Italic = True
            .ParagraphFormat.SpaceAfter = 12
        End With
        
        
        Exit Function
    End If
    
    ' Crear tabla de acciones correctivas
    For Each m_ID In m_Col
        Set m_AC = m_Col(m_ID)
'        rng.Collapse 0  ' Colapsar al final
'        rng.InsertParagraphAfter
        rng.Collapse 0  ' Colapsar al final
        Set tblAcciones = wordDoc.Tables.Add(rng, 1, 2)
        ' Llenar datos
        
        With tblAcciones
            .Borders.Enable = False
            
            
            .Cell(1, 1).Range.Text = "Nº:" & m_AC.NAccion & "      " & m_AC.AccionCorrectiva
'            If IsDate(m_AC.FechaInicialMinima) Then
'                .Cell(1, 2).Range.Text = Format(m_AC.FechaInicialMinima, "dd/mm/yyyy")
'            End If
            
             ' Formato de encabezados
             .Rows(1).Range.Font.Bold = True
             .Rows(1).Range.Font.Size = 12
             .Rows(1).Range.Font.Name = "Segoe UI"
             .Rows(1).Range.Font.Color = RGB(0, 102, 255)
             
             .Cell(1, 1).Range.ParagraphFormat.Alignment = 0
             '.Cell(1, 2).Range.ParagraphFormat.Alignment = 0
             .PreferredWidth = 100
            .PreferredWidthType = 2
            .Columns(1).PreferredWidthType = 2
            '.Columns(2).PreferredWidthType = 2
            .Columns(1).PreferredWidth = 85
           ' .Columns(2).PreferredWidth = 15
        End With
        Set rng = tblAcciones.Range
        
        rng.Collapse 0  ' Colapsar al final
        'rng.InsertParagraphAfter
       ' rng.Collapse 0  ' Colapsar al final
        Set tblTareas = InsertarTablaTareas(wordDoc, m_AC, rng, p_Error)
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        If Not tblTareas Is Nothing Then
            Set rng = tblTareas.Range
        End If
        
        rng.Collapse 0
        rng.InsertParagraphAfter
        Set m_AC = Nothing
        
    Next
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método Informe.InsertarAccionesCorrectivas ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
    End If
End Function
Private Function getTb1DatosPrincipalesNCProyecto( _
                                                    wordDoc As Object, _
                                                    p_NC As Object, _
                                                    rng As Object, _
                                                    Optional p_Error As String _
                                                    ) As Object
    Dim tblDatos As Object
    On Error GoTo errores
    Dim i As Integer
    
    
    If p_NC.VEHICULO = "" Or p_NC.VEHICULO = "N/A" Then
        i = 6
    Else
        i = 7
    End If
    Set tblDatos = wordDoc.Tables.Add(rng, 2, i)
    
    With tblDatos
        .Borders.Enable = True
        i = 1
        .Cell(1, i).Range.Text = "NC"
        i = i + 1
        .Cell(1, i).Range.Text = "EXP"
        i = i + 1
        .Cell(1, i).Range.Text = "Jurídica"
        i = i + 1
        If p_NC.VEHICULO <> "" And p_NC.VEHICULO <> "N/A" Then
            .Cell(1, i).Range.Text = "Vehículo"
            i = i + 1
        End If
        .Cell(1, i).Range.Text = "F.Apertura"
        i = i + 1
        .Cell(1, i).Range.Text = "F.P.Cierre"
        i = i + 1
        .Cell(1, i).Range.Text = "F.Cierre"
        
        .Rows(1).Range.Font.Bold = True
        .Rows(1).Range.Font.Color = RGB(0, 102, 255)
        ' Fila 2
        i = 1
        
        .Cell(2, i).Range.Text = p_NC.CodigoNoConformidad
        i = i + 1
        If Not p_NC.ExpedienteObj Is Nothing Then
            .Cell(2, i).Range.Text = p_NC.ExpedienteObj.TextoExpediente
        Else
            .Cell(2, i).Range.Text = p_NC.Expediente
        End If
        i = i + 1
        If Not p_NC.ExpedienteObj Is Nothing Then
            .Cell(2, i).Range.Text = p_NC.ExpedienteObj.CadenaJuridicas
        Else
            .Cell(2, i).Range.Text = p_NC.Juridica
        End If
        i = i + 1
        If p_NC.VEHICULO <> "" And p_NC.VEHICULO <> "N/A" Then
            .Cell(2, i).Range.Text = p_NC.VEHICULO
            i = i + 1
        End If
        .Cell(2, i).Range.Text = p_NC.FechaApertura
        i = i + 1
        .Cell(2, i).Range.Text = p_NC.FPREVCIERRE
        i = i + 1
        .Cell(2, i).Range.Text = p_NC.FECHACIERRE
        
        '.Columns.AutoFit
       
        .Rows(1).Shading.BackgroundPatternColor = RGB(198, 217, 241)
        .Rows(1).Range.ParagraphFormat.Alignment = 0
        .Rows(2).Range.ParagraphFormat.Alignment = 0
        .Rows(2).Range.Font.Bold = False
        '.Borders.Enable = False
        .AutoFitBehavior 2
    End With
    
    Set getTb1DatosPrincipalesNCProyecto = tblDatos
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método Informe.getTablaDatosPrincipalesNC ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
    End If
End Function
Private Function getTb2DatosPrincipalesNCProyecto( _
                                                    wordDoc As Object, _
                                                    p_NC As Object, _
                                                    rng As Object, _
                                                    Optional p_Error As String _
                                                    ) As Object
    Dim tblDatos As Object
    On Error GoTo errores
   If p_NC.RequiereControlEficacia = "Sí" Then
        Set tblDatos = wordDoc.Tables.Add(rng, 4, 2)
    Else
        Set tblDatos = wordDoc.Tables.Add(rng, 5, 2)
    End If
    
    With tblDatos
        .Borders.Enable = True
        .PreferredWidth = 100
        .PreferredWidthType = 2
        .Columns(1).PreferredWidthType = 2
        .Columns(2).PreferredWidthType = 2
        .Columns(1).PreferredWidth = 15
        .Columns(2).PreferredWidth = 85
        With .Cell(1, 1).Range
            .Text = "Descripción"
            .Font.Bold = True
            .Font.Name = "Segoe UI"
            .Font.Color = RGB(0, 102, 255)
            .ParagraphFormat.Alignment = 0
        End With
        With .Cell(1, 2).Range
            .Text = p_NC.Descripcion
            .Font.Bold = False
            .Font.Name = "Segoe UI"
            .Font.Color = RGB(0, 0, 0)
            .ParagraphFormat.Alignment = 0
        End With
        With .Cell(2, 1).Range
            .Text = "Causa"
            .Font.Bold = True
            .Font.Name = "Segoe UI"
            .Font.Color = RGB(0, 102, 255)
            .ParagraphFormat.Alignment = 0
        End With
        With .Cell(2, 2).Range
            .Text = p_NC.CausaYAnalisRaiz
            .Font.Bold = False
            .Font.Name = "Segoe UI"
            .Font.Color = RGB(0, 0, 0)
            .ParagraphFormat.Alignment = 0
        End With
        With .Cell(3, 1).Range
            .Text = "Notas"
            .Font.Bold = True
            .Font.Name = "Segoe UI"
            .Font.Color = RGB(0, 102, 255)
            .ParagraphFormat.Alignment = 0
        End With
        With .Cell(3, 2).Range
            .Text = p_NC.Notas
            .Font.Bold = False
            .Font.Name = "Segoe UI"
            .Font.Color = RGB(0, 0, 0)
            .ParagraphFormat.Alignment = 0
        End With
        With .Cell(4, 1).Range
            .Text = "C.Eficacia"
            .Font.Bold = True
            .Font.Name = "Segoe UI"
            .Font.Color = RGB(0, 102, 255)
            .ParagraphFormat.Alignment = 0
        End With
        With .Cell(4, 2).Range
            .Text = p_NC.ControlEficacia
            .Font.Bold = False
            .Font.Name = "Segoe UI"
            .Font.Color = RGB(0, 0, 0)
            .ParagraphFormat.Alignment = 0
        End With
        .AutoFitBehavior 2
        If p_NC.RequiereControlEficacia = "No" Then
            With .Cell(5, 1).Range
                .Text = "Motivo C.Eficacia No Requerida"
                .Font.Bold = True
                .Font.Name = "Segoe UI"
                .Font.Color = RGB(0, 102, 255)
                .ParagraphFormat.Alignment = 0
            End With
            With .Cell(5, 2).Range
                .Text = p_NC.MotivoNoRequiereControlEficacia
                .Font.Bold = False
                .Font.Name = "Segoe UI"
                .Font.Color = RGB(0, 0, 0)
                .ParagraphFormat.Alignment = 0
            End With
        End If
    End With
    Set getTb2DatosPrincipalesNCProyecto = tblDatos
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método Informe.getTablaDatosPrincipalesNC ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
    End If
End Function
Private Function getTb1DatosPrincipalesNCAudoria( _
                                                    wordDoc As Object, _
                                                    p_NC As Object, _
                                                    rng As Object, _
                                                    Optional p_Error As String _
                                                    ) As Object
    Dim tblDatos As Object
    
    On Error GoTo errores
    Set tblDatos = wordDoc.Tables.Add(rng, 2, 7)
    
    With tblDatos
        .Borders.Enable = True
        
        .Cell(1, 1).Range.Text = "Auditoría"
        .Cell(1, 2).Range.Text = "Tipo"
        .Cell(1, 3).Range.Text = "Pto. Norma"
        .Cell(1, 4).Range.Text = "Req. AC"
        .Cell(1, 5).Range.Text = "F.Apertura"
        .Cell(1, 6).Range.Text = "F.P.Cierre"
        .Cell(1, 7).Range.Text = "F.Cierre"
        .Rows(1).Range.Font.Bold = True
        .Rows(1).Range.Font.Color = RGB(0, 102, 255)
        ' Fila 2
        .Cell(2, 1).Range.Text = p_NC.Auditoria.NombreAuditoria
        .Cell(2, 2).Range.Text = p_NC.Tipo
        .Cell(2, 3).Range.Text = p_NC.PuntoNorma
        .Cell(2, 4).Range.Text = p_NC.RequiereAccionCorrectiva
        .Cell(2, 5).Range.Text = p_NC.FechaApertura
        .Cell(2, 6).Range.Text = p_NC.FPREVCIERRE
        .Cell(2, 7).Range.Text = p_NC.FECHACIERRE
        
        
        '.Columns.AutoFit
       
        .Rows(1).Shading.BackgroundPatternColor = RGB(198, 217, 241)
        .Rows(1).Range.ParagraphFormat.Alignment = 0
        .Rows(2).Range.ParagraphFormat.Alignment = 0
        .Rows(2).Range.Font.Bold = False
        '.Borders.Enable = False
        .AutoFitBehavior 2
    End With
    
    Set getTb1DatosPrincipalesNCAudoria = tblDatos
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método Informe.getTb1DatosPrincipalesNCAudoria ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
    End If
End Function
Private Function getTb2DatosPrincipalesNCAudoria( _
                                                    wordDoc As Object, _
                                                    p_NC As Object, _
                                                    rng As Object, _
                                                    Optional p_Error As String _
                                                    ) As Object
    Dim tblDatos As Object
    
    On Error GoTo errores
    
    Dim numFilas As Integer
    numFilas = 5
    If p_NC.RequiereAccionCorrectiva = "No" Then numFilas = numFilas + 1
    If p_NC.RequiereControlEficacia = "No" Then numFilas = numFilas + 1
    Set tblDatos = wordDoc.Tables.Add(rng, numFilas, 2)
    
    Dim fila As Integer
    fila = 1
    With tblDatos
        .Borders.Enable = True
        .PreferredWidth = 100
        .PreferredWidthType = 2
        .Columns(1).PreferredWidthType = 2
        .Columns(2).PreferredWidthType = 2
        .Columns(1).PreferredWidth = 15
        .Columns(2).PreferredWidth = 85
        
        .Cell(fila, 1).Range.Text = "Descripción"
        .Cell(fila, 1).Range.Font.Bold = True
        .Cell(fila, 1).Range.Font.Name = "Segoe UI"
        .Cell(fila, 1).Range.Font.Color = RGB(0, 102, 255)
        .Cell(fila, 1).Range.ParagraphFormat.Alignment = 0
        .Cell(fila, 2).Range.Text = p_NC.Descripcion
        .Cell(fila, 2).Range.Font.Bold = False
        .Cell(fila, 2).Range.Font.Name = "Segoe UI"
        .Cell(fila, 2).Range.Font.Color = RGB(0, 0, 0)
        .Cell(fila, 2).Range.ParagraphFormat.Alignment = 0
        fila = fila + 1
        
        .Cell(fila, 1).Range.Text = "Causa"
        .Cell(fila, 1).Range.Font.Bold = True
        .Cell(fila, 1).Range.Font.Name = "Segoe UI"
        .Cell(fila, 1).Range.Font.Color = RGB(0, 102, 255)
        .Cell(fila, 1).Range.ParagraphFormat.Alignment = 0
        .Cell(fila, 2).Range.Text = p_NC.CAUSARAIZ
        .Cell(fila, 2).Range.Font.Bold = False
        .Cell(fila, 2).Range.Font.Name = "Segoe UI"
        .Cell(fila, 2).Range.Font.Color = RGB(0, 0, 0)
        .Cell(fila, 2).Range.ParagraphFormat.Alignment = 0
        fila = fila + 1
        
        .Cell(fila, 1).Range.Text = "Resp. Implant."
        .Cell(fila, 1).Range.Font.Bold = True
        .Cell(fila, 1).Range.Font.Name = "Segoe UI"
        .Cell(fila, 1).Range.Font.Color = RGB(0, 102, 255)
        .Cell(fila, 1).Range.ParagraphFormat.Alignment = 0
        .Cell(fila, 2).Range.Text = p_NC.RESPONSABLEIMPLANTACION
        .Cell(fila, 2).Range.Font.Bold = False
        .Cell(fila, 2).Range.Font.Name = "Segoe UI"
        .Cell(fila, 2).Range.Font.Color = RGB(0, 0, 0)
        .Cell(fila, 2).Range.ParagraphFormat.Alignment = 0
        fila = fila + 1
        
        .Cell(fila, 1).Range.Text = "Notas"
        .Cell(fila, 1).Range.Font.Bold = True
        .Cell(fila, 1).Range.Font.Name = "Segoe UI"
        .Cell(fila, 1).Range.Font.Color = RGB(0, 102, 255)
        .Cell(fila, 1).Range.ParagraphFormat.Alignment = 0
        .Cell(fila, 2).Range.Text = p_NC.Notas
        .Cell(fila, 2).Range.Font.Bold = False
        .Cell(fila, 2).Range.Font.Name = "Segoe UI"
        .Cell(fila, 2).Range.Font.Color = RGB(0, 0, 0)
        .Cell(fila, 2).Range.ParagraphFormat.Alignment = 0
        fila = fila + 1
        
        .Cell(fila, 1).Range.Text = "C.Eficacia"
        .Cell(fila, 1).Range.Font.Bold = True
        .Cell(fila, 1).Range.Font.Name = "Segoe UI"
        .Cell(fila, 1).Range.Font.Color = RGB(0, 102, 255)
        .Cell(fila, 1).Range.ParagraphFormat.Alignment = 0
        .Cell(fila, 2).Range.Text = p_NC.ControlEficacia
        .Cell(fila, 2).Range.Font.Bold = False
        .Cell(fila, 2).Range.Font.Name = "Segoe UI"
        .Cell(fila, 2).Range.Font.Color = RGB(0, 0, 0)
        .Cell(fila, 2).Range.ParagraphFormat.Alignment = 0
        fila = fila + 1
        
        If p_NC.RequiereAccionCorrectiva = "No" Then
            .Cell(fila, 1).Range.Text = "Motivo No AC"
            .Cell(fila, 1).Range.Font.Bold = True
            .Cell(fila, 1).Range.Font.Name = "Segoe UI"
            .Cell(fila, 1).Range.Font.Color = RGB(0, 102, 255)
            .Cell(fila, 1).Range.ParagraphFormat.Alignment = 0
            .Cell(fila, 2).Range.Text = p_NC.MotivoNoAccionCorrectiva
            .Cell(fila, 2).Range.Font.Bold = False
            .Cell(fila, 2).Range.Font.Name = "Segoe UI"
            .Cell(fila, 2).Range.Font.Color = RGB(0, 0, 0)
            .Cell(fila, 2).Range.ParagraphFormat.Alignment = 0
            fila = fila + 1
        End If
        
        If p_NC.RequiereControlEficacia = "No" Then
            .Cell(fila, 1).Range.Text = "Motivo C.Eficacia No Requerida"
            .Cell(fila, 1).Range.Font.Bold = True
            .Cell(fila, 1).Range.Font.Name = "Segoe UI"
            .Cell(fila, 1).Range.Font.Color = RGB(0, 102, 255)
            .Cell(fila, 1).Range.ParagraphFormat.Alignment = 0
            .Cell(fila, 2).Range.Text = p_NC.MotivoNoRequiereControlEficacia
            .Cell(fila, 2).Range.Font.Bold = False
            .Cell(fila, 2).Range.Font.Name = "Segoe UI"
            .Cell(fila, 2).Range.Font.Color = RGB(0, 0, 0)
            .Cell(fila, 2).Range.ParagraphFormat.Alignment = 0
        End If
        
        .AutoFitBehavior 2
    End With
    
    Set getTb2DatosPrincipalesNCAudoria = tblDatos
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método Informe.getTb2DatosPrincipalesNCAudoria ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
    End If
End Function
Private Function InsertarNoConformidad( _
                                        p_EsDeProyecto As EnumSino, _
                                        wordDoc As Object, _
                                        p_NC As Object, _
                                        Optional p_Error As String _
                                        ) As String
    
   
    Dim rng As Object
    
    On Error GoTo errores
    If p_EsDeProyecto = EnumSino.Sí Then
        Avance "Obteniendo Datos Principales de " & p_NC.CodigoNoConformidad & " ..."
    Else
        Avance "Obteniendo Datos Principales de " & Format(p_NC.Numero, "00") & " ..."
    End If
    
    ' Posicionar al final del documento
    Set rng = wordDoc.Range
    rng.Collapse 0  ' Colapsar al final
    
    ' Insertar título de la No Conformidad
    rng.InsertParagraphAfter
    If p_EsDeProyecto = EnumSino.Sí Then
        rng.InsertAfter "NO CONFORMIDAD " & p_NC.CodigoNoConformidad
    Else
        
        rng.InsertAfter p_NC.Particula & " " & Format(p_NC.Numero, "00")
    End If
    
    rng.Collapse 0  ' Colapsar al final
    With rng.Paragraphs.Last.Range
        .Font.Name = "Segoe UI"
        .Font.Size = 10
        .Font.Bold = True
        .ParagraphFormat.SpaceAfter = 10
        .Style = wordDoc.Styles("Título 1")
        '.Shading.BackgroundPatternColor = RGB(230, 230, 230)
    End With
    rng.Collapse 0  ' Colapsar al final
    rng.InsertParagraphAfter
    rng.Collapse 0  ' Colapsar al final
    
    ' Insertar tabla con datos principales
    Dim tblDatos As Object
    If p_EsDeProyecto = EnumSino.Sí Then
        Set tblDatos = getTb1DatosPrincipalesNCProyecto(wordDoc, p_NC, rng, p_Error)
    Else
        Set tblDatos = getTb1DatosPrincipalesNCAudoria(wordDoc, p_NC, rng, p_Error)
    End If
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    
    Set rng = tblDatos.Range
    rng.Collapse 0
    rng.InsertParagraphAfter
    rng.Collapse 0
    If p_EsDeProyecto = EnumSino.Sí Then
        Set tblDatos = getTb2DatosPrincipalesNCProyecto(wordDoc, p_NC, rng, p_Error)
    Else
        Set tblDatos = getTb2DatosPrincipalesNCAudoria(wordDoc, p_NC, rng, p_Error)
    End If
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    
    Set rng = tblDatos.Range
    rng.Collapse 0
    rng.InsertParagraphAfter
    rng.Collapse 0
    
    If p_EsDeProyecto = EnumSino.Sí Then
        InsertarAccionesCorrectivas wordDoc, p_NC, rng, p_Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
    Else
        If p_NC.RequiereAccionCorrectiva = "Sí" Then
            InsertarAccionesCorrectivas wordDoc, p_NC, rng, p_Error
            If p_Error <> "" Then
                Err.Raise 1000
            End If
        End If
    End If


    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método Informe.InsertarNoConformidad ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
    End If
End Function
Private Function InsertarSeparadorNoConformidad(wordDoc As Object, Optional p_Error As String) As String
    Dim rng As Object
    On Error GoTo errores
    ' Posicionar al final del documento
    Set rng = wordDoc.Range
    rng.Collapse 0  ' Colapsar al final
    
    ' Insertar espacio y línea horizontal
    rng.InsertParagraphAfter
    rng.InsertParagraphAfter
    
    ' Insertar línea horizontal como separador
    Dim separador As Object
    Set separador = rng.Paragraphs.Last.Range
    separador.InsertHorizontalLine
    
    ' Espacio después del separador
    rng.InsertParagraphAfter
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método Informe.InsertarSeparadorNoConformidad ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
    End If
End Function
Private Function CrearPiePaginaSimple(wordDoc As Object, Optional p_Error As String) As String
    Dim footerRange As Object
    On Error GoTo errores
    ' Configurar el pie de página para todas las páginas
    Set footerRange = wordDoc.Sections(1).Footers(1).Range
    
    ' Añadir línea horizontal sobre el pie de página
    'footerRange.InsertHorizontalLine
    With footerRange
        .Text = "Página "
        .Collapse wdCollapseEnd  ' Mover al final del texto
        .Fields.Add Range:=.Duplicate, Type:=7  ' Número de página
        .InsertAfter " de "
        .Collapse wdCollapseEnd
        .Fields.Add Range:=.Duplicate, Type:=8  ' Número total de páginas
    End With
    ' Insertar texto con tabulaciones para alinear elementos
    
    
    ' Formato del texto
    With footerRange
        .Font.Name = "Segoe UI"
        .Font.Size = 8
        .Font.Color = RGB(80, 80, 80)
        .ParagraphFormat.Alignment = 2  ' Alineación a la derecha
    End With
    Exit Function
    
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método Informe.CrearPiePaginaSimple ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
    End If
End Function


