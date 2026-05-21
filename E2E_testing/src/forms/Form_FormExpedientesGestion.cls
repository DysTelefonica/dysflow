Option Compare Database
Option Explicit
Private WithEvents m_FormCambioTipo As Form_FormExpedienteCambioTipo
Private WithEvents m_FormExpediente As Form_FormExpediente

Private WithEvents m_FormAltaExpediente As Form_FormExpedienteAltaTipo
Private m_ExpAMSeleccionadoC As ExpedienteCompleto
Private m_ExpLoteSeleccionadoC As ExpedienteCompleto
Private m_ExpBasadoSeleccionadoC As ExpedienteCompleto
Public m_ExpBusquedaUltimo As ExpedienteBusqueda
Public Event ExpSeleccionado(m_expediente As ExpedienteCompleto)
Public Event ExpEliminado()

Private m_ColAM As Scripting.Dictionary
Private m_ColLotes As Scripting.Dictionary
Private m_ColBasados As Scripting.Dictionary
Private AbiertoParaEditar As Boolean

Private Const CLICK_DELAY_MS As Long = 1000   'ventana para distinguir click vs doble click

'--- Estado ---
Private m_ClickPendiente As Boolean
Private m_ClickItemData As Variant   'guarda info necesaria del click (índice, valor, etc.)
Private m_Reentrando As Boolean      'bloqueo reentrante por seguridad

Private m_Error As String

Public Function EstablecerDatos(Optional ByRef p_Error As String) As String
    
    On Error GoTo errores
    If AbiertoParaEditar = True Then
        If EsAdministrador = EnumSiNo.Sí Then
            If m_ObjEntorno.UltimoCambio Is Nothing Then
                Me.lblUltimaModificacion.Caption = "Aún sin registrar"
            Else
                Me.lblUltimaModificacion.Caption = m_ObjEntorno.UltimoCambio.texto
            End If
        Else
            Me.lblUltimaModificacion.Visible = False
        End If
    Else
        Me.lblUltimaModificacion.Visible = False
    End If
    
    If Not m_ObjMostrarEstadoUsuarioConectado Is Nothing Then
        Me.VerEstado = m_ObjMostrarEstadoUsuarioConectado.MostrarEstado
    End If
    
    RellenarCombos p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If

    setExpBusqueda Me, m_ObjExpBusquedaActiva, p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método EstablecerDatos ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
    End If
    
End Function

Public Function RellenarCombos(Optional ByRef p_Error As String) As String
    
    On Error GoTo errores
    RellenarComboEstado Me.ESTADO, p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    RellenarComboSuministradores Me.Suministrador, p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    RellenarComboCodExp Me.CodExp, p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    RellenarComboComercial p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    RellenarComboJefesProyecto Me.jp, p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    RellenarComboRAC p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    RellenarComboIDExp p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método RellenarCombos ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
    End If
    
End Function

Private Sub Ambito_AfterUpdate()
    On Error GoTo errores
    DoCmd.Hourglass True
    m_Error = ""
    
    Filtrar m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    DoCmd.Hourglass False
    
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al Ambito_AfterUpdate se ha devuelto el error: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If
    
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub cmdSalir_Click()
    On Error Resume Next
    
    DoCmd.Close acForm, Me.Name, acSaveNo
    
End Sub
Public Function Refiltrar( _
                            Optional ByRef p_Error As String _
                            ) As String
    
    
    On Error GoTo errores
    
    RellenarAM p_Error:=p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    RellenarLote p_Error:=p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    RellenarBasado p_Error:=p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    
    Exit Function
errores:
    Me.AllowEdits = True
    If Err.Number <> 1000 Then
        p_Error = "El método Refiltrar ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
    End If
End Function


Public Function RellenarAM( _
                            Optional ByRef p_Error As String _
                            ) As String
    On Error GoTo errores
    
    If m_DatosEnMemoria = EnumSiNo.Sí Then
        RellenarAM = RellenarAMPorMemoria(p_Error)
    Else
        RellenarAM = RellenarAMPorTabla(p_Error)
    End If
    
   
    
    Exit Function
errores:
    Me.AllowEdits = True
    If Err.Number <> 1000 Then
        p_Error = "El método RellenarAM ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
    End If
End Function
Public Function RellenarAMPorMemoria( _
                                    Optional ByRef p_Error As String _
                                    ) As String
    Dim m_ExpC As ExpedienteCompleto
    Dim m_ID As Variant
    Dim m_Estado As String
    Dim lst As ListBox
    
    On Error GoTo errores
    
    Set lst = Me.ListaAMEIndividual
    If m_ObjMostrarEstadoUsuarioConectado.MostrarEstado = "Sí" Then
        lst.ColumnCount = 5
        lst.ColumnWidths = "0cm;1cm;4,101cm;2cm;2cm"
        lst.RowSource = "IDExpediente;Tipo;Nemotécnico;NºExp;Estado"
    Else
        lst.ColumnCount = 6
        lst.ColumnWidths = "0cm;1cm;2,101cm;2cm;2cm;2cm"
        lst.RowSource = "IDExpediente;Tipo;Nemotécnico;NºExp;FInicial;FFinal"
    End If
    
    
    If Not m_ColAM Is Nothing Then
        For Each m_ID In m_ColAM
            Set m_ExpC = m_ColAM(m_ID)
            With m_ExpC
                If m_ObjMostrarEstadoUsuarioConectado.MostrarEstado = "Sí" Then
                    m_Estado = m_ExpC.ESTADO
                    If m_Estado = "NoAplica" Then
                        m_Estado = "--"
                    End If
                    lst.AddItem .IDExpediente & ";" & .TipoParaLista & ";" & .Nemotecnico & _
                        ";" & .CodExp & ";" & m_Estado
                Else
                    lst.AddItem .IDExpediente & ";" & .TipoParaLista & ";" & .Nemotecnico & _
                        ";" & .CodExp & ";" & .FechaInicioContrato & ";" & .FechaFinContrato
                End If
                
            End With
            Set m_ExpC = Nothing
        Next
    End If
    
    
    Exit Function
errores:
    Me.AllowEdits = True
    If Err.Number <> 1000 Then
        p_Error = "El método RellenarAMPorMemoria ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
    End If
End Function
Public Function RellenarAMPorTabla( _
                                    Optional ByRef p_Error As String _
                                    ) As String
    Dim m_Exp As Expediente
    Dim m_ID As Variant
    Dim m_Estado As String
    Dim lst As ListBox
    
    On Error GoTo errores
    
    Set lst = Me.ListaAMEIndividual
    If m_ObjMostrarEstadoUsuarioConectado.MostrarEstado = "Sí" Then
        lst.ColumnCount = 5
        lst.ColumnWidths = "0cm;1cm;4,101cm;2cm;2cm"
        lst.RowSource = "IDExpediente;Tipo;Nemotécnico;NºExp;Estado"
    Else
        lst.ColumnCount = 6
        lst.ColumnWidths = "0cm;1cm;2,101cm;2cm;2cm;2cm"
        lst.RowSource = "IDExpediente;Tipo;Nemotécnico;NºExp;FInicial;FFinal"
    End If
    
    
    If Not m_ColAM Is Nothing Then
        For Each m_ID In m_ColAM
            Set m_Exp = m_ColAM(m_ID)
            With m_Exp
                If m_ObjMostrarEstadoUsuarioConectado.MostrarEstado = "Sí" Then
                    m_Estado = m_Exp.ESTADOCalculadoTexto
                    If m_Estado = "NoAplica" Then
                        m_Estado = "--"
                    End If
                    lst.AddItem .IDExpediente & ";" & .TipoParaLista & ";" & .Nemotecnico & _
                        ";" & .CodExp & ";" & m_Estado
                Else
                    lst.AddItem .IDExpediente & ";" & .TipoParaLista & ";" & .Nemotecnico & _
                        ";" & .CodExp & ";" & .FechaInicioContrato & ";" & .FechaFinContrato
                End If
                
            End With
            Set m_Exp = Nothing
        Next
    End If
    
    
    Exit Function
errores:
    Me.AllowEdits = True
    If Err.Number <> 1000 Then
        p_Error = "El método RellenarAMPorTabla ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
    End If
End Function
Public Function RellenarLote( _
                                Optional ByRef p_IdPadre As String, _
                                Optional p_IDExpediente As String, _
                                Optional ByRef p_Error As String _
                                ) As String
   
    
    On Error GoTo errores
    
    If m_DatosEnMemoria = EnumSiNo.Sí Then
        RellenarLote = RellenarLotePorMemoria(p_IdPadre, p_IDExpediente, p_Error)
    Else
        RellenarLote = RellenarLotePorTabla(p_IdPadre, p_IDExpediente, p_Error)
    End If
    
   
    
    Exit Function
errores:
    Me.AllowEdits = True
    If Err.Number <> 1000 Then
        p_Error = "El método RellenarLote ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
    End If
End Function
Public Function RellenarLotePorMemoria( _
                                        Optional ByRef p_IdPadre As String, _
                                        Optional p_IDExpediente As String, _
                                        Optional ByRef p_Error As String _
                                        ) As String
    Dim m_ExpC As ExpedienteCompleto
    Dim m_ID As Variant
    Dim m_Estado As String
    Dim m_Nemotecnico As String
    Dim lst As ListBox
    Dim dato As Variant
    
    On Error GoTo errores
    
    Set lst = Me.ListaLotes
    If m_ObjMostrarEstadoUsuarioConectado.MostrarEstado = "Sí" Then
        lst.ColumnCount = 4
        lst.ColumnWidths = "0cm;1cm;5cm;2cm"
        lst.RowSource = "IDExpediente;Nº;Nemotécnico;Estado"
    Else
        lst.ColumnCount = 5
        lst.ColumnWidths = "0cm;1cm;3cm;2cm;2cm"
        lst.RowSource = "IDExpediente;Nº;Nemotécnico;FInicial;FFinal"
    End If
    If Not m_ColLotes Is Nothing Then
        For Each m_ID In m_ColLotes
            Set m_ExpC = m_ColLotes(m_ID)
            With m_ExpC
                If p_IdPadre <> "" Then
                    If .IDExpedientePadre <> p_IdPadre Then
                        GoTo siguiente
                    End If
                End If
                If p_IDExpediente <> "" Then
                    If .IDExpediente <> p_IDExpediente Then
                        GoTo siguiente
                    End If
                End If
                m_Nemotecnico = .Nemotecnico
                If InStr(1, m_Nemotecnico, "_") <> 0 Then
                    dato = Split(m_Nemotecnico, "_")
                    m_Nemotecnico = dato(0)
                End If
                If m_ObjMostrarEstadoUsuarioConectado.MostrarEstado = "Sí" Then
                    m_Estado = .ESTADO
                    If m_Estado = "NoAplica" Then
                        m_Estado = "--"
                    End If
                    lst.AddItem .IDExpediente & ";" & .Ordinal & ";" & m_Nemotecnico & _
                        ";" & m_Estado
                Else
                    lst.AddItem .IDExpediente & ";" & .Ordinal & ";" & m_Nemotecnico & _
                        ";" & .FechaInicioContrato & ";" & .FechaFinContrato
                End If
            End With
            
siguiente:
            Set m_ExpC = Nothing
        Next
    End If
    
   
    
    Exit Function
errores:
    Me.AllowEdits = True
    If Err.Number <> 1000 Then
        p_Error = "El método RellenarLotePorMemoria ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
    End If
End Function
Public Function RellenarLotePorTabla( _
                                        Optional ByRef p_IdPadre As String, _
                                        Optional p_IDExpediente As String, _
                                        Optional ByRef p_Error As String _
                                        ) As String
    Dim m_Exp As Expediente
    Dim m_ID As Variant
    Dim m_Estado As String
    Dim m_Nemotecnico As String
    Dim lst As ListBox
    Dim dato As Variant
    
    On Error GoTo errores
    
    Set lst = Me.ListaLotes
    If m_ObjMostrarEstadoUsuarioConectado.MostrarEstado = "Sí" Then
        lst.ColumnCount = 4
        lst.ColumnWidths = "0cm;1cm;5cm;2cm"
        lst.RowSource = "IDExpediente;Nº;Nemotécnico;Estado"
    Else
        lst.ColumnCount = 5
        lst.ColumnWidths = "0cm;1cm;3cm;2cm;2cm"
        lst.RowSource = "IDExpediente;Nº;Nemotécnico;FInicial;FFinal"
    End If
    If Not m_ColLotes Is Nothing Then
        For Each m_ID In m_ColLotes
            Set m_Exp = m_ColLotes(m_ID)
            With m_Exp
                If p_IdPadre <> "" Then
                    If .IDExpedientePadre <> p_IdPadre Then
                        GoTo siguiente
                    End If
                End If
                If p_IDExpediente <> "" Then
                    If .IDExpediente <> p_IDExpediente Then
                        GoTo siguiente
                    End If
                End If
                m_Nemotecnico = .Nemotecnico
                If InStr(1, m_Nemotecnico, "_") <> 0 Then
                    dato = Split(m_Nemotecnico, "_")
                    m_Nemotecnico = dato(0)
                End If
                If m_ObjMostrarEstadoUsuarioConectado.MostrarEstado = "Sí" Then
                    m_Estado = .ESTADOCalculadoTexto
                    If m_Estado = "NoAplica" Then
                        m_Estado = "--"
                    End If
                    lst.AddItem .IDExpediente & ";" & .Ordinal & ";" & m_Nemotecnico & _
                        ";" & m_Estado
                Else
                    lst.AddItem .IDExpediente & ";" & .Ordinal & ";" & m_Nemotecnico & _
                        ";" & .FechaInicioContrato & ";" & .FechaFinContrato
                End If
            End With
            
siguiente:
            Set m_Exp = Nothing
        Next
    End If
    
   
    
    Exit Function
errores:
    Me.AllowEdits = True
    If Err.Number <> 1000 Then
        p_Error = "El método RellenarLotePorTabla ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
    End If
End Function
Public Function RellenarBasado( _
                                Optional ByRef p_Error As String _
                                ) As String
    On Error GoTo errores
    
    If m_DatosEnMemoria = EnumSiNo.Sí Then
        RellenarBasado = RellenarBasadoPorMemoria(p_Error)
    Else
        RellenarBasado = RellenarBasadoPorTabla(p_Error)
    End If
    
   
    
    Exit Function
errores:
    Me.AllowEdits = True
    If Err.Number <> 1000 Then
        p_Error = "El método RellenarBasado ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
    End If
End Function
Public Function RellenarBasadoPorMemoria( _
                                        Optional ByRef p_Error As String _
                                        ) As String
    Dim m_ExpC As ExpedienteCompleto
    Dim m_ID As Variant
    Dim m_Estado As String
    Dim m_Ejercito As String
    Dim lst As ListBox
    
    On Error GoTo errores
    
    Set lst = Me.ListaBasados
    
    If m_ObjMostrarEstadoUsuarioConectado.MostrarEstado = "Sí" Then
        lst.ColumnCount = 5
        lst.ColumnWidths = "0cm;1,505cm;4cm;1cm;2cm"
        lst.RowSource = "IDExpediente;NºExp;Ejército;Nº;Estado"
    Else
        lst.ColumnCount = 6
        lst.ColumnWidths = "0cm;1,505cm;2cm;1cm;2cm;2cm"
        lst.RowSource = "IDExpediente;NºExp;Ejército;Nº;FInicial;FFinal"
    End If
    If Not m_ColBasados Is Nothing Then
        For Each m_ID In m_ColBasados
            Set m_ExpC = m_ColBasados(m_ID)
            With m_ExpC
                
                m_Ejercito = .Ejercito
                If m_ObjMostrarEstadoUsuarioConectado.MostrarEstado = "Sí" Then
                    m_Estado = m_ExpC.ESTADO
                    If m_Estado = "NoAplica" Then
                        m_Estado = "--"
                    End If
                    lst.AddItem .IDExpediente & ";" & .CodExp & ";" & m_Ejercito & ";" & .Ordinal & _
                    ";" & m_Estado
                Else
                    lst.AddItem .IDExpediente & ";" & .CodExp & ";" & m_Ejercito & ";" & .Ordinal & _
                    ";" & .FechaInicioContrato & ";" & .FechaFinContrato
                End If
                
               
            End With

            Set m_ExpC = Nothing
        Next
    End If
    Exit Function
errores:
    Me.AllowEdits = True
    If Err.Number <> 1000 Then
        p_Error = "El método RellenarBasadoPorMemoria ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
    End If
End Function
Public Function RellenarBasadoPorTabla( _
                                        Optional ByRef p_Error As String _
                                        ) As String
    Dim m_Exp As Expediente
    Dim m_ID As Variant
    Dim m_Estado As String
    Dim m_Ejercito As String
    Dim lst As ListBox
    
    On Error GoTo errores
    
    Set lst = Me.ListaBasados
    
    If m_ObjMostrarEstadoUsuarioConectado.MostrarEstado = "Sí" Then
        lst.ColumnCount = 5
        lst.ColumnWidths = "0cm;1,505cm;4cm;1cm;2cm"
        lst.RowSource = "IDExpediente;NºExp;Ejército;Nº;Estado"
    Else
        lst.ColumnCount = 6
        lst.ColumnWidths = "0cm;1,505cm;2cm;1cm;2cm;2cm"
        lst.RowSource = "IDExpediente;NºExp;Ejército;Nº;FInicial;FFinal"
    End If
    If Not m_ColBasados Is Nothing Then
        For Each m_ID In m_ColBasados
            Set m_Exp = m_ColBasados(m_ID)
            With m_Exp
                
                If Not .Ejercito Is Nothing Then
                    m_Ejercito = .Ejercito.Ejercito
                Else
                    m_Ejercito = ""
                End If
                
                If m_ObjMostrarEstadoUsuarioConectado.MostrarEstado = "Sí" Then
                    m_Estado = m_Exp.ESTADO
                    If m_Estado = "NoAplica" Then
                        m_Estado = "--"
                    End If
                    lst.AddItem .IDExpediente & ";" & .CodExp & ";" & m_Ejercito & ";" & .Ordinal & _
                    ";" & m_Estado
                Else
                    lst.AddItem .IDExpediente & ";" & .CodExp & ";" & m_Ejercito & ";" & .Ordinal & _
                    ";" & .FechaInicioContrato & ";" & .FechaFinContrato
                End If
                
               
            End With

            Set m_Exp = Nothing
        Next
    End If
    Exit Function
errores:
    Me.AllowEdits = True
    If Err.Number <> 1000 Then
        p_Error = "El método RellenarBasadoPorTabla ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
    End If
End Function
Public Function Filtrar( _
                        Optional ByRef p_Error As String _
                        ) As String

    Dim lstAM As ListBox
    Dim lstLote As ListBox
    Dim lstBasado As ListBox
    Dim m_Estado As String
    Dim m_HaHabidoCambios As EnumSiNo
    Dim m_ExpBusqueda As ExpedienteBusqueda
    Dim m_ExpAM As Expediente
    Dim m_Lote As Expediente
    Dim m_Basado As Expediente
    Dim m_Nemotecnico As String
    Dim m_ColExpInd As Scripting.Dictionary
    Dim m_ColAM1 As Scripting.Dictionary
    Dim dato As Variant
    Dim m_ID As Variant
    Dim m_ExpC As ExpedienteCompleto

    On Error GoTo errores

    p_Error = ""
    Me.AllowEdits = False
    
    Set lstAM = Me.ListaAMEIndividual
    Set lstLote = Me.ListaLotes
    Set lstBasado = Me.ListaBasados
    Me.IDSeleccionado = Null
    Me.TipoElementoSeleccionado = Null
         
    Avance "Obteniendo los Parámetros de búsqueda"
    Set m_ExpBusqueda = getExpBusqueda(p_Form:=Me, p_Error:=p_Error)
    If p_Error <> "" Then
        Err.Raise 100
    End If
    m_HaHabidoCambios = HaHabidoCambiosBusqueda(m_ExpBusqueda, m_ExpBusquedaUltimo, p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    
    If m_HaHabidoCambios = EnumSiNo.No Then
        
        Me.AllowEdits = True
        Exit Function
    End If
    ReestablecerTitulosListas
    Set m_ExpAMSeleccionadoC = Nothing
    Set m_ExpLoteSeleccionadoC = Nothing
    Set m_ExpBasadoSeleccionadoC = Nothing
    
    
    
    
    
    Set m_ColAM = Nothing
    Set m_ColLotes = Nothing
    Set m_ColBasados = Nothing
    Set m_ColAM1 = getColBusqueda(p_ExpBusqueda:=m_ExpBusqueda, p_ParaAM:=EnumSiNo.Sí, p_Error:=p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    Set m_ColExpInd = getColBusqueda(p_ExpBusqueda:=m_ExpBusqueda, p_ParaExpediente:=EnumSiNo.Sí, p_Error:=p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If Not m_ColAM1 Is Nothing Then
        For Each m_ID In m_ColAM1
            Set m_ExpC = m_ColAM1(m_ID)
            If m_ColAM Is Nothing Then
                Set m_ColAM = New Scripting.Dictionary
                m_ColAM.CompareMode = TextCompare
            End If
            If Not m_ColAM.exists(CStr(m_ExpC.IDExpediente)) Then
                m_ColAM.Add m_ExpC.IDExpediente, m_ExpC
            End If
            Set m_ExpC = Nothing
        Next
    End If
    If Not m_ColExpInd Is Nothing Then
        For Each m_ID In m_ColExpInd
            Set m_ExpC = m_ColExpInd(m_ID)
            If m_ColAM Is Nothing Then
                Set m_ColAM = New Scripting.Dictionary
                m_ColAM.CompareMode = TextCompare
            End If
            If Not m_ColAM.exists(CStr(m_ExpC.IDExpediente)) Then
                m_ColAM.Add m_ExpC.IDExpediente, m_ExpC
            End If
            Set m_ExpC = Nothing
        Next
    End If
    Set m_ColLotes = getColBusqueda(p_ExpBusqueda:=m_ExpBusqueda, p_ParaLote:=EnumSiNo.Sí, p_Error:=p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    Set m_ColBasados = getColBusqueda(p_ExpBusqueda:=m_ExpBusqueda, p_ParaBasado:=EnumSiNo.Sí, p_Error:=p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    RellenarAM p_Error:=p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    RellenarLote p_Error:=p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    RellenarBasado p_Error:=p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    
    
    DeseleccionarLista p_Error:=p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    PonerNumeroExp p_Error:=p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    InicializarBotonera p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If Me.ListaAMEIndividual.ListCount > 1 Then
        Me.ComandoExportarExcelAMs.Enabled = True
    End If
    If Me.ListaLotes.ListCount > 1 Then
        Me.ComandoExportarExcelLotes.Enabled = True
    End If
    If Me.ListaBasados.ListCount > 1 Then
        Me.ComandoExportarExcelBasados.Enabled = True
    End If
    Set m_ExpBusquedaUltimo = m_ExpBusqueda
    Me.AllowEdits = True
    Exit Function
errores:
    Me.AllowEdits = True
    If Err.Number <> 1000 Then
        p_Error = "El método Filtrar ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
    End If

End Function
Private Function VerDetalle(btn As CommandButton, Optional ByRef p_Error As String) As String
    
    Dim lst As ListBox
    Dim m_expediente As Expediente
    On Error GoTo errores
    
    
    If btn.Name = Me.ComandoVerDetalleAMoC.Name Then
        Set m_expediente = m_ExpAMSeleccionadoC.Expediente
        Set lst = Me.ListaAMEIndividual
    ElseIf btn.Name = Me.ComandoVerDetalleLote.Name Then
        Set m_expediente = m_ExpLoteSeleccionadoC.Expediente
        Set lst = Me.ListaLotes
    ElseIf btn.Name = Me.ComandoVerDetalleBasado.Name Then
        Set m_expediente = m_ExpBasadoSeleccionadoC.Expediente
        Set lst = Me.ListaBasados
    Else
        p_Error = "Botón no identificado"
        Err.Raise 1000
    End If
    
     Set m_ObjExpedienteActivo = m_expediente
     Set m_ObjExpedienteDTOActivo = EstablecerDTODeExpediente(p_Expediente:=m_ObjExpedienteActivo, _
                                                             p_ParaCopia:=EnumSiNo.No, _
                                                             p_Error:=p_Error)
     If p_Error <> "" Then
         Err.Raise 1000
     End If
     
     
     If FormularioAbierto("FormExpediente") Then
         DoCmd.Close acForm, "FormExpediente", acSaveNo
     End If
     DoCmd.OpenForm "FormExpediente", OpenArgs:=Nz(Me.OpenArgs(), "")
     If FormularioAbierto("FormExpediente") Then
         Set m_FormExpediente = Forms("FormExpediente")
     End If
   
    
    
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método VerDetalle ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
    End If
End Function

Private Sub CodExp_AfterUpdate()
    On Error GoTo errores
    DoCmd.Hourglass True
    m_Error = ""
    
    Filtrar m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    DoCmd.Hourglass False
    
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al CodExp_AfterUpdate se ha devuelto el error: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If
    
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub ComandoAltaAMoC_Click()
    Dim m_CaptionOriginal As String

    On Error GoTo errores

    m_CaptionOriginal = Me.Caption
    If AntiSpamIsOperationInProgress(Me, m_Error) Then Exit Sub
    AntiSpamEnterOperation Me, m_CaptionOriginal, _
        "ComandoAltaAMoC", "ComandoAltaLote", "ComandoAltaDerivadoLote", _
        "ComandoCambiarTipoLote", "ComandoCambiarTipoBasado", _
        "ComandoVerDetalleAMoC", "ComandoVerDetalleLote", "ComandoVerDetalleBasado", _
        "ComandoEliminarAMoC", "ComandoEliminarLote", "ComandoEliminarBasado"

    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents

    m_Error = ""

    g_BusyFlag = "running"
    DoCmd.OpenForm "frmBusy", WindowMode:=acHidden
    Forms("frmBusy").Visible = True
    DoEvents

    Alta Me.ComandoAltaAMoC, m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If

    DoCmd.Close acForm, "frmBusy"
    g_BusyFlag = ""

    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents

    AntiSpamExitOperation Me, m_CaptionOriginal, m_Error
    Exit Sub
errores:
    AntiSpamExitOperation Me, m_CaptionOriginal, m_Error
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoAltaAMoC_Click se ha devuelto el error: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If

    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub


Private Sub ComandoAltaDerivadoLote_Click()
    Dim m_Argumento As String

    On Error GoTo errores

    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents

    m_Error = ""
    
    Set m_ObjExpedienteActivo = m_ExpLoteSeleccionadoC.Expediente
    AltaDerivado Me.ComandoAltaDerivadoLote, m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoAltaDerivadoLote_Click se ha devuelto el error: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If
    
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub ComandoAltaLote_Click()
    Dim m_CaptionOriginal As String
    On Error GoTo errores

    m_CaptionOriginal = Me.Caption
    If AntiSpamIsOperationInProgress(Me, m_Error) Then Exit Sub
    AntiSpamEnterOperation Me, m_CaptionOriginal, _
        "ComandoAltaAMoC", "ComandoAltaLote", "ComandoAltaDerivadoLote", _
        "ComandoCambiarTipoLote", "ComandoCambiarTipoBasado", _
        "ComandoVerDetalleAMoC", "ComandoVerDetalleLote", "ComandoVerDetalleBasado", _
        "ComandoEliminarAMoC", "ComandoEliminarLote", "ComandoEliminarBasado"

    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents

    m_Error = ""

    ' Abrir popup — se muestra mientras Alta hace Sleep
    g_BusyFlag = "running"
    DoCmd.OpenForm "frmBusy", WindowMode:=acHidden
    Forms("frmBusy").Visible = True
    DoEvents

    ' Alta tiene Sleep 5000 + abre FormExpedienteAltaTipo como acDialog
    Alta Me.ComandoAltaLote, m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If

    DoCmd.Close acForm, "frmBusy"
    g_BusyFlag = ""

    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents

    AntiSpamExitOperation Me, m_CaptionOriginal, m_Error
    Exit Sub
errores:
    AntiSpamExitOperation Me, m_CaptionOriginal, m_Error
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoAltaLote_Click se ha devuelto el error: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If

    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub ComandoCambiarTipoBasado_Click()
    On Error GoTo errores

    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents

    m_Error = ""
    
    CambiarTipo Me.ComandoCambiarTipoBasado, m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoCambiarTipoBasado_Click se ha devuelto el error: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If
    
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub ComandoCambiarTipoLote_Click()
    On Error GoTo errores

    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents

    m_Error = ""
   
    
    CambiarTipo Me.ComandoCambiarTipoLote, m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoCambiarTipoLote_Click se ha devuelto el error: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If
    
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub
Private Function IniciarCampo(Optional p_NombreCampo As String, Optional ByRef p_Error As String) As String
    
    On Error GoTo errores
    
    If p_NombreCampo = "" Then
        IniciarCampo = IniciarCampo(Me.IDExpediente.Name, p_Error)
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        IniciarCampo = IniciarCampo(Me.PalabraClave.Name, p_Error)
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        IniciarCampo = IniciarCampo(Me.ESTADO.Name, p_Error)
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        IniciarCampo = IniciarCampo(Me.Suministrador.Name, p_Error)
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        IniciarCampo = IniciarCampo(Me.MarcoPecal.Name, p_Error)
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        IniciarCampo = IniciarCampo(Me.Ambito.Name, p_Error)
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        
        IniciarCampo = IniciarCampo(Me.CodExp.Name, p_Error)
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        IniciarCampo = IniciarCampo(Me.MarcoPostAgedo.Name, p_Error)
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        IniciarCampo = IniciarCampo(Me.MarcoCalidad.Name, p_Error)
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        IniciarCampo = IniciarCampo(Me.Comercial.Name, p_Error)
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        IniciarCampo = IniciarCampo(Me.jp.Name, p_Error)
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        IniciarCampo = IniciarCampo(Me.RAC.Name, p_Error)
        If p_Error <> "" Then
            Err.Raise 1000
        End If
    Else
        If p_NombreCampo = Me.IDExpediente.Name Then
            Me.IDExpediente = "Todos"
        ElseIf p_NombreCampo = Me.PalabraClave.Name Then
            Me.PalabraClave = Null
        ElseIf p_NombreCampo = Me.ESTADO.Name Then
            Me.ESTADO = "0"
        ElseIf p_NombreCampo = Me.Suministrador.Name Then
            Me.Suministrador = "Todos"
        ElseIf p_NombreCampo = Me.MarcoPecal.Name Then
            Me.MarcoPecal = 0
        ElseIf p_NombreCampo = Me.MarcoSeguridad.Name Then
            Me.MarcoSeguridad = 0
        ElseIf p_NombreCampo = Me.Ambito.Name Then
            Me.Ambito = "Defensa"
        ElseIf p_NombreCampo = Me.CodExp.Name Then
            Me.CodExp = "Todos"
        ElseIf p_NombreCampo = Me.MarcoPostAgedo.Name Then
            Me.MarcoPostAgedo = 3
            
        ElseIf p_NombreCampo = Me.MarcoCalidad.Name Then
            Me.MarcoCalidad = 0
        ElseIf p_NombreCampo = Me.Comercial.Name Then
            Me.Comercial = "Todos"
        ElseIf p_NombreCampo = Me.jp.Name Then
            Me.jp = "Todos"
        ElseIf p_NombreCampo = Me.RAC.Name Then
            Me.RAC = "Todos"
        Else
            Exit Function
        End If
    End If
    
    Filtrar p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método IniciarCampo ha producido el error nº: " & Err.Number & vbCrLf & "Detalle: " & Err.Description
    End If
End Function

Private Sub ComandoExportarExcelAMs_Click()
    On Error GoTo errores

    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents

    m_Error = ""
    m_NombreListaParaInforme = Me.ListaAMEIndividual.Name
    If FormularioAbierto("FOrmEleccionTipoConsulta") Then
        DoCmd.Close acForm, "FOrmEleccionTipoConsulta"
    End If
    DoCmd.OpenForm "FOrmEleccionTipoConsulta"
   
    
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoIniciarCalidad_Click se ha devuelto el error: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If
    
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub ComandoExportarExcelBasados_Click()
    On Error GoTo errores

    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents

    m_Error = ""
     m_NombreListaParaInforme = Me.ListaBasados.Name
    If FormularioAbierto("FOrmEleccionTipoConsulta") Then
        DoCmd.Close acForm, "FOrmEleccionTipoConsulta"
    End If
    DoCmd.OpenForm "FOrmEleccionTipoConsulta"
   
    
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoExportarExcelBasados_Click se ha devuelto el error: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If
    
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub ComandoExportarExcelLotes_Click()
    On Error GoTo errores

    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents

    m_Error = ""
    
    m_NombreListaParaInforme = Me.ListaLotes.Name
    If FormularioAbierto("FOrmEleccionTipoConsulta") Then
        DoCmd.Close acForm, "FOrmEleccionTipoConsulta"
    End If
    DoCmd.OpenForm "FOrmEleccionTipoConsulta"
   
    
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoExportarExcelLotes_Click se ha devuelto el error: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If
    
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub ComandoInformeUnificado_Click()
    On Error GoTo errores

    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents

    m_Error = ""
    m_NombreListaParaInforme = "Todos"
    If FormularioAbierto("FOrmEleccionTipoConsulta") Then
        DoCmd.Close acForm, "FOrmEleccionTipoConsulta"
    End If
    DoCmd.OpenForm "FOrmEleccionTipoConsulta"
   
    
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoInformeUnificado_Click se ha devuelto el error: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If
    
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub ComandoIniciarCalidad_Click()
    On Error GoTo errores

    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents

    m_Error = ""
    IniciarCampo Me.MarcoCalidad.Name, m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoIniciarCalidad_Click se ha devuelto el error: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If
    
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub ComandoIniciarCodExp_Click()
    On Error GoTo errores

    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents

    m_Error = ""
    IniciarCampo Me.CodExp.Name, m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoIniciarCodExp_Click se ha devuelto el error: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If
    
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub ComandoIniciarComercial_Click()
    On Error GoTo errores

    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents

    m_Error = ""
    IniciarCampo Me.Comercial.Name, m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoIniciarComercial_Click se ha devuelto el error: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If
    
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub ComandoIniciarEstado_Click()
    On Error GoTo errores

    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents

    m_Error = ""
    IniciarCampo Me.ESTADO.Name, m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoIniciarEstado_Click se ha devuelto el error: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If
    DoCmd.Hourglass False
End Sub



Private Sub ComandoIniciarIDExpediente_Click()
    On Error GoTo errores

    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents

    m_Error = ""
    IniciarCampo Me.IDExpediente.Name, m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoIniciarIDExpediente_Click se ha devuelto el error: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If
    
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub ComandoIniciarJP_Click()
    On Error GoTo errores

    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents

    m_Error = ""
    IniciarCampo Me.jp.Name, m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoIniciarJP_Click se ha devuelto el error: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If
    
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub ComandoIniciarSuministrador_Click()
    On Error GoTo errores

    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents

    m_Error = ""
    IniciarCampo Me.Suministrador.Name, m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoIniciarSuministrador_Click se ha devuelto el error: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If
    
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub ComandoAmbito_Click()
    On Error GoTo errores

    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents

    m_Error = ""
    IniciarCampo Me.Ambito.Name, m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoAmbito_Click se ha devuelto el error: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If
    
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub ComandoIniciarPalabraClave_Click()
    On Error GoTo errores

    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents

    m_Error = ""
    IniciarCampo Me.PalabraClave.Name, m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoIniciarPalabraClave_Click se ha devuelto el error: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If
    
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub


Private Sub ComandoIniciarPECAL_Click()
    On Error GoTo errores

    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents

    m_Error = ""
    IniciarCampo Me.MarcoPecal.Name, m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoIniciarPECAL_Click se ha devuelto el error: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If
    
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub ComandoIniciarPostAgedo_Click()
    On Error GoTo errores

    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents

    m_Error = ""
    IniciarCampo Me.MarcoPostAgedo.Name, m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoIniciarPostAgedo_Click se ha devuelto el error: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If
    
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub ComandoIniciarRAC_Click()
    On Error GoTo errores

    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents

    m_Error = ""
    IniciarCampo Me.RAC.Name, m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoIniciarRAC_Click se ha devuelto el error: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If
    
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub ComandoIniciarSeguridad_Click()
    On Error GoTo errores

    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents

    m_Error = ""
    IniciarCampo Me.MarcoSeguridad.Name, m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoIniciarSeguridad_Click se ha devuelto el error: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If
    
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub ComandoPalabraClave_Click()
    On Error GoTo errores
    DoCmd.Hourglass True
    m_Error = ""
    
    Filtrar m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    DoCmd.Hourglass False
    
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoPalabraClave_Click se ha devuelto el error: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If
    
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub ComandoReiniciarParametrosBusqueda_Click()
    Dim m_CaptionOriginal As String
    On Error GoTo errores

    m_CaptionOriginal = Me.Caption
    If AntiSpamIsOperationInProgress(Me, m_Error) Then Exit Sub
    AntiSpamEnterOperation Me, m_CaptionOriginal, _
        "ComandoAltaAMoC", "ComandoAltaLote", "ComandoAltaDerivadoLote", _
        "ComandoCambiarTipoLote", "ComandoCambiarTipoBasado", _
        "ComandoVerDetalleAMoC", "ComandoVerDetalleLote", "ComandoVerDetalleBasado", _
        "ComandoEliminarAMoC", "ComandoEliminarLote", "ComandoEliminarBasado", _
        "ComandoReiniciarParametrosBusqueda"

    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    Me.AllowEdits = False
    Set m_ObjExpBusquedaActiva = Nothing
    Set m_ObjEntorno.ColExpedientesCompletos = Nothing
    m_EnumPostAgedoCombo = EnumPostAgedoCombo.No
    m_EnumAmbitoCombo = EnumAmbito.Defensa

    MostrarPopupProgreso "Buscando...", "Reiniciando parámetros..."

    setExpBusqueda Me, m_ObjExpBusquedaActiva, m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    If ComandoReiniciar.Enabled Then
        ComandoReiniciar_Click
    End If

    ' Rellenar la barra antes de cerrar (mínimo visible)
    Dim k As Long
    For k = 0 To Forms("frmBusy").lblProgresoFondo.Width Step 30
        Forms("frmBusy").lblProgresoBarra.Width = k
        DoEvents
    Next k

    DoCmd.Close acForm, "frmBusy"
    g_BusyFlag = ""

    Me.AllowEdits = True
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents

    AntiSpamExitOperation Me, m_CaptionOriginal, m_Error
    Exit Sub
errores:
    DoCmd.Close acForm, "frmBusy", acSaveNo
    g_BusyFlag = ""
    AntiSpamExitOperation Me, m_CaptionOriginal, m_Error
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoReiniciarParametrosBusqueda_Click se ha devuelto el error: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If
    Me.AllowEdits = True
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub ComandoVerDetalleAMoC_Click()
    
   
    On Error GoTo errores

    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents

    m_Error = ""
    
    VerDetalle Me.ComandoVerDetalleAMoC, m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoVerDetalleAMoC_Click se ha devuelto el error: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If
    
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub ComandoVerDetalleBasado_Click()
    
    On Error GoTo errores

    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents

    m_Error = ""
   
    
    VerDetalle Me.ComandoVerDetalleBasado, m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoVerDetalleBasado_Click se ha devuelto el error: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If
    
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub ComandoVerDetalleLote_Click()
    On Error GoTo errores

    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents

    m_Error = ""
   
    
    VerDetalle Me.ComandoVerDetalleLote, m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoVerDetalleLote_Click se ha devuelto el error: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If
    
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub Comercial_AfterUpdate()
    
    On Error GoTo errores
    DoCmd.Hourglass True
    m_Error = ""
    
    Filtrar m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    DoCmd.Hourglass False
    
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al Comercial_AfterUpdate se ha devuelto el error: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If
    
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub Estado_AfterUpdate()
    
    On Error GoTo errores
    DoCmd.Hourglass True
    m_Error = ""
    
    Filtrar m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    DoCmd.Hourglass False
    
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al Estado_AfterUpdate se ha devuelto el error: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If
    
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub
Private Sub IDExpediente_AfterUpdate()
    On Error GoTo errores
    DoCmd.Hourglass True
    m_Error = ""
    
    Filtrar m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    DoCmd.Hourglass False
    
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al IDExpediente_AfterUpdate se ha devuelto el error: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If
    
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub ImagenTareasOFF_Click()
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    
    DoCmd.OpenForm "FormTareas"
    
    AvanceCerrar
    
    VBA.DoEvents
    DoCmd.Hourglass False
    Me.AllowEdits = True
    VBA.DoEvents
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al ImagenTareasOFF_Click se ha producido el error num " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If
    Me.AllowEdits = True
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub ImagenTareasON_Click()
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    
    DoCmd.OpenForm "FormTareas"
    
    AvanceCerrar
    
    VBA.DoEvents
    DoCmd.Hourglass False
    Me.AllowEdits = True
    VBA.DoEvents
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al ImagenTareasON_Click se ha producido el error num " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If
    Me.AllowEdits = True
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub JP_AfterUpdate()
    On Error GoTo errores
    DoCmd.Hourglass True
    m_Error = ""
    
    
    Filtrar m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    DoCmd.Hourglass False
    
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al JP_AfterUpdate se ha devuelto el error: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If
    
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub MarcoRespSeguridad_AfterUpdate()
    On Error GoTo errores
    DoCmd.Hourglass True
    m_Error = ""
    
    Filtrar m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    DoCmd.Hourglass False
    
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al MarcoRespSeguridad_AfterUpdate se ha devuelto el error: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If
    
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub Suministrador_AfterUpdate()
    On Error GoTo errores
    DoCmd.Hourglass True
    m_Error = ""
    
    Filtrar m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    DoCmd.Hourglass False
    
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al Juridica_AfterUpdate se ha devuelto el error: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If
    
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub ListaAMEIndividual_Click()
    
    Dim lstAM As ListBox
    Dim lstLote As ListBox
    Dim lstBasado As ListBox
    Dim m_ID As Variant
    Dim m_Ejercito As String
    
    Dim m_Lote As Expediente
    Dim m_Basado As Expediente
   
    Dim m_expediente As Expediente
    Dim m_ExpLote As String
    Dim m_Nemotecnico As String
    Dim dato As Variant
    On Error GoTo errores

    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents

    m_Error = ""
    Me.AllowEdits = False
    
    If Nz(Me.ListaAMEIndividual.Column(0), "") = "" Then
        Set m_ExpAMSeleccionadoC = Nothing
        VBA.DoEvents
        DoCmd.Hourglass False
        VBA.DoEvents
        Me.ComandoVerDetalleAMoC.Enabled = False
        Me.ComandoCambiarTipoAMoC.Enabled = False
        Me.ComandoAltaDerivadoAMoC.Enabled = False
        Me.ComandoEliminarAMoC.Enabled = False
        
        Me.AllowEdits = True
        
        Exit Sub
    End If
    If m_ExpAMSeleccionadoC Is Nothing Then
        Set m_ExpAMSeleccionadoC = constructor.getExpedienteCompleto( _
                                p_IDExpediente:=Me.ListaAMEIndividual.Column(0), _
                                p_Error:=m_Error)
        If m_Error <> "" Then
            Err.Raise 1000
        End If
    Else
        If m_ExpAMSeleccionadoC.IDExpediente <> Me.ListaAMEIndividual.Column(0) Then
            Set m_ExpAMSeleccionadoC = constructor.getExpedienteCompleto( _
                                    p_IDExpediente:=Me.ListaAMEIndividual.Column(0), _
                                    p_Error:=m_Error)
            If m_Error <> "" Then
                Err.Raise 1000
            End If
        
        End If
    End If
    
    If m_ExpAMSeleccionadoC Is Nothing Then
       
        Me.ComandoVerDetalleAMoC.Enabled = False
        Me.ComandoCambiarTipoAMoC.Enabled = False
        Me.ComandoAltaDerivadoAMoC.Enabled = False
        Me.ComandoEliminarAMoC.Enabled = False
        Me.ComandoExportarExcelAMs.Enabled = False
        VBA.DoEvents
        DoCmd.Hourglass False
        VBA.DoEvents
        Me.AllowEdits = True
        Exit Sub
    End If
    Me.ComandoVerDetalleAMoC.Enabled = True
    If AbiertoParaEditar = True Then
        If EsAdministrador = EnumSiNo.Sí Then
            
            Me.ComandoCambiarTipoAMoC.Enabled = True
            If m_ExpAMSeleccionadoC.TipoCalculado = EnumTipoExpediente.EXPIndividual Then
                Me.ComandoAltaDerivadoAMoC.Enabled = False
            Else
                Me.ComandoAltaDerivadoAMoC.Enabled = True
            End If
            
            Me.ComandoEliminarAMoC.Enabled = True
        Else
            Me.ComandoCambiarTipoAMoC.Enabled = False
            Me.ComandoAltaDerivadoAMoC.Enabled = False
            Me.ComandoEliminarAMoC.Enabled = False
        End If
    Else
        Me.ComandoCambiarTipoAMoC.Enabled = False
        Me.ComandoAltaDerivadoAMoC.Enabled = False
        Me.ComandoEliminarAMoC.Enabled = False
    End If
    Me.IDSeleccionado = m_ExpAMSeleccionadoC.IDExpediente
    If m_ExpAMSeleccionadoC.EsAM = "Sí" Then
        Me.TipoElementoSeleccionado = "AM"
    Else
        Me.TipoElementoSeleccionado = "C"
    End If
    
    
   
    Set m_ColAM = New Scripting.Dictionary
    m_ColAM.CompareMode = TextCompare
    m_ColAM.Add m_ExpAMSeleccionadoC.IDExpediente, m_ExpAMSeleccionadoC
    
    
    Me.lblListaLotes.Caption = "Lotes del Acuerdo Marco: " & m_ExpAMSeleccionadoC.CodExp
'    Set lstLote = Me.ListaLotes
'    lstLote.RowSource = "IDExpediente;Nº;Nemotécnico;FInicio;FFin"
    
    Set m_ColLotes = getColLotes(m_ExpAMSeleccionadoC, m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    RellenarLote
    
    
    Me.lblListaBasados.Caption = "Basados del Acuerdo Marco: " & m_ExpAMSeleccionadoC.CodExp
'    Set lstBasado = Me.ListaBasados
'    lstBasado.RowSource = "IDExpediente;NºExp;Ejército;Nº;FInicio;FFin"
    Set m_ColBasados = getColBasados(m_ExpAMSeleccionadoC, m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    RellenarBasado
    If Me.ListaAMEIndividual.ListCount > 1 Then
        Me.ComandoExportarExcelAMs.Enabled = True
    End If
    If Me.ListaLotes.ListCount > 1 Then
        Me.ComandoExportarExcelLotes.Enabled = True
    End If
    If Me.ListaBasados.ListCount > 1 Then
        Me.ComandoExportarExcelBasados.Enabled = True
    End If
    PonerNumeroExp p_Error:=m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Me.AllowEdits = True
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al ListaAMEIndividual_Click se ha devuelto el error: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If
    Me.AllowEdits = True
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub ListaAMEIndividual_DblClick(Cancel As Integer)
    On Error Resume Next
    Application.Echo False
    Me.AllowEdits = False
    
    If Me.ComandoVerDetalleAMoC.Enabled = True Then
        ComandoVerDetalleAMoC_Click
    End If
    Me.AllowEdits = True
    Application.Echo True
End Sub


Private Function DeseleccionarLista(Optional p_Nombre As String, Optional ByRef p_Error As String) As String
    
    Dim lst As ListBox
    Dim i As Long
    
    On Error GoTo errores

    If p_Nombre <> "" Then
        Set lst = Me.Controls(p_Nombre)
        
        For i = 1 To lst.ListCount - 1
            If lst.Selected(i) = True Then
                lst.Selected(i) = False
                Exit For
            End If
        Next
    Else
        DeseleccionarLista = DeseleccionarLista("ListaAMEIndividual", p_Error)
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        DeseleccionarLista = DeseleccionarLista("ListaLotes", p_Error)
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        DeseleccionarLista = DeseleccionarLista("ListaBasados", p_Error)
        If p_Error <> "" Then
            Err.Raise 1000
        End If
    End If
    
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método DeseleccionarLista ha devuelto el error: " & Err.Description
    End If
End Function
Private Function InicializarBotonera(Optional ByRef p_Error As String) As String
    
    On Error GoTo errores
    If AbiertoParaEditar = True Then
        If EsAdministrador = EnumSiNo.Sí Then
            Me.ComandoAltaAMoC.Enabled = True
            Me.ComandoAltaLote.Enabled = True
           
        Else
            Me.ComandoAltaAMoC.Enabled = False
            Me.ComandoAltaLote.Enabled = False
        End If
    Else
        Me.ComandoAltaAMoC.Enabled = False
        Me.ComandoAltaLote.Enabled = False
    End If
    
    If ListaSeleccionada(Me.ListaAMEIndividual.Name) = False Then
    
        Me.ComandoVerDetalleAMoC.Enabled = False
        Me.ComandoCambiarTipoAMoC.Enabled = False
        Me.ComandoAltaDerivadoAMoC.Enabled = False
        Me.ComandoEliminarAMoC.Enabled = False
        Me.ComandoExportarExcelAMs.Enabled = False
    Else
        Me.ComandoVerDetalleAMoC.Enabled = True
        Me.ComandoExportarExcelAMs.Enabled = True
        If AbiertoParaEditar = True Then
            If EsAdministrador = EnumSiNo.Sí Then
                Me.ComandoCambiarTipoAMoC.Enabled = True
                Me.ComandoAltaDerivadoAMoC.Enabled = True
                Me.ComandoEliminarAMoC.Enabled = True
            Else
                Me.ComandoCambiarTipoAMoC.Enabled = False
                Me.ComandoAltaDerivadoAMoC.Enabled = False
                Me.ComandoEliminarAMoC.Enabled = False
            End If
        Else
            Me.ComandoCambiarTipoAMoC.Enabled = False
            Me.ComandoAltaDerivadoAMoC.Enabled = False
            Me.ComandoEliminarAMoC.Enabled = False
        End If
        
    End If
    If ListaSeleccionada(Me.ListaLotes.Name) = False Then
        Me.ComandoVerDetalleLote.Enabled = False
        Me.ComandoCambiarTipoLote.Enabled = False
        Me.ComandoAltaDerivadoLote.Enabled = False
        Me.ComandoEliminarLote.Enabled = False
        Me.ComandoExportarExcelLotes.Enabled = False
    Else
        Me.ComandoVerDetalleLote.Enabled = True
        Me.ComandoExportarExcelLotes.Enabled = True
        If AbiertoParaEditar = True Then
            If EsAdministrador = EnumSiNo.Sí Then
                Me.ComandoCambiarTipoLote.Enabled = True
                Me.ComandoAltaDerivadoLote.Enabled = True
                Me.ComandoEliminarLote.Enabled = True
            Else
                Me.ComandoCambiarTipoLote.Enabled = False
                Me.ComandoAltaDerivadoLote.Enabled = False
                Me.ComandoEliminarLote.Enabled = False
            End If
        Else
            Me.ComandoCambiarTipoLote.Enabled = False
            Me.ComandoAltaDerivadoLote.Enabled = False
            Me.ComandoEliminarLote.Enabled = False
        End If
        
    End If
    If ListaSeleccionada(Me.ListaBasados.Name) = False Then
        Me.ComandoVerDetalleBasado.Enabled = False
        Me.ComandoCambiarTipoBasado.Enabled = False
        Me.ComandoEliminarBasado.Enabled = False
        Me.ComandoExportarExcelBasados.Enabled = False
    Else
        Me.ComandoVerDetalleBasado.Enabled = True
        Me.ComandoExportarExcelBasados.Enabled = True
        If AbiertoParaEditar = True Then
            If EsAdministrador = EnumSiNo.Sí Then
                Me.ComandoCambiarTipoBasado.Enabled = True
                Me.ComandoEliminarBasado.Enabled = True
            Else
                Me.ComandoCambiarTipoBasado.Enabled = False
                Me.ComandoEliminarBasado.Enabled = False
            End If
        Else
            Me.ComandoCambiarTipoBasado.Enabled = False
            Me.ComandoEliminarBasado.Enabled = False
        End If
        
    End If
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método InicializarBotonera ha devuelto el error: " & Err.Description
    End If
    
End Function

Private Function ListaSeleccionada(p_NombreLista As String, Optional ByRef p_Error As String) As Boolean
    Dim i As Integer
    Dim lst As ListBox
    
    On Error GoTo errores
    Set lst = Me.Controls(p_NombreLista)
    If lst.ListCount = 1 Then
        Exit Function
    End If
    For i = 1 To lst.ListCount - 1
        If lst.Selected(i) = True Then
            ListaSeleccionada = True
            Exit Function
        End If
    Next
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método ListaSeleccionada ha devuelto el error: " & Err.Description
    End If
    
End Function
Private Sub ListaBasados_Click()

    Dim lstAM As ListBox
    Dim lstLote As ListBox
    Dim m_ExpLote As String
    Dim m_ID As Variant
    Dim m_Col As Scripting.Dictionary
    Dim m_LoteDeBasado As ExpedienteCompleto
    Dim m_AMDeLoteDeBasado As ExpedienteCompleto
    Dim m_AMDeBasado As ExpedienteCompleto
    Dim m_Nemotecnico As String
    Dim dato As Variant
    
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents

    m_Error = ""
    If m_Reentrando Then Exit Sub
    
    Me.TimerInterval = CLICK_DELAY_MS
    If Nz(Me.ListaBasados.Column(0), "") = "" Then
        Set m_ExpBasadoSeleccionadoC = Nothing
        VBA.DoEvents
        DoCmd.Hourglass False
        VBA.DoEvents
        Me.ComandoVerDetalleBasado.Enabled = False
        Me.ComandoCambiarTipoBasado.Enabled = False
        Me.ComandoEliminarBasado.Enabled = False
        
        m_Reentrando = False
        Exit Sub
    End If
    If m_ExpBasadoSeleccionadoC Is Nothing Then
        Set m_ExpBasadoSeleccionadoC = constructor.getExpedienteCompleto( _
                                p_IDExpediente:=Me.ListaBasados.Column(0), _
                                p_Error:=m_Error)
        If m_Error <> "" Then
            Err.Raise 1000
        End If
    Else
        If m_ExpBasadoSeleccionadoC.IDExpediente <> Me.ListaBasados.Column(0) Then
            Set m_ExpBasadoSeleccionadoC = constructor.getExpedienteCompleto( _
                                    p_IDExpediente:=Me.ListaBasados.Column(0), _
                                    p_Error:=m_Error)
            If m_Error <> "" Then
                Err.Raise 1000
            End If
        
        End If
    End If
    If m_ExpBasadoSeleccionadoC Is Nothing Then
        VBA.DoEvents
        DoCmd.Hourglass False
        VBA.DoEvents
        Me.ComandoVerDetalleBasado.Enabled = False
        Me.ComandoCambiarTipoBasado.Enabled = False
        Me.ComandoEliminarBasado.Enabled = False
        m_Reentrando = False
        Exit Sub
    End If
    Me.lblListaLotes.Caption = "Lotes del CB: " & m_ExpBasadoSeleccionadoC.CodExp
    
    Me.IDSeleccionado = m_ExpBasadoSeleccionadoC.IDExpediente
    Me.TipoElementoSeleccionado = "BASADO"
    Me.ComandoVerDetalleBasado.Enabled = True
    
    If AbiertoParaEditar = True Then
        If EsAdministrador = EnumSiNo.Sí Then
            Me.ComandoCambiarTipoBasado.Enabled = True
            Me.ComandoEliminarBasado.Enabled = True
        Else
            Me.ComandoCambiarTipoBasado.Enabled = False
            Me.ComandoEliminarBasado.Enabled = False
        End If
    Else
        Me.ComandoCambiarTipoBasado.Enabled = False
        Me.ComandoEliminarBasado.Enabled = False
    End If
    



    Set lstLote = Me.ListaLotes
    lstLote.RowSource = "IDExpediente;Nº;Nemotécnico;FInicio;FFin"
    
    
    Set m_LoteDeBasado = m_ExpBasadoSeleccionadoC.ExpedientePadreLote
    If Not m_LoteDeBasado Is Nothing Then
        With m_LoteDeBasado
            m_Nemotecnico = .NemotecnicoCalculado
            If InStr(1, m_Nemotecnico, "_") <> 0 Then
                dato = Split(m_Nemotecnico, "_")
                m_Nemotecnico = dato(0)
            End If
            lstLote.AddItem .IDExpediente & ";" & .Ordinal & ";" & m_Nemotecnico & _
                    ";" & .FechaInicioContrato & ";" & .FechaFinContrato
        End With
'        Me.ListaLotes.Selected(1) = True
'        ListaLotes_Click
    End If
    Set lstAM = Me.ListaAMEIndividual
    If m_ObjMostrarEstadoUsuarioConectado.MostrarEstado = "Sí" Then
        lstAM.ColumnCount = 5
        lstAM.ColumnWidths = "0cm;1cm;4,101cm;2cm;2cm"
        lstAM.RowSource = "IDExpediente;Tipo;Nemotécnico;NºExp;Estado"
    Else
        lstAM.ColumnCount = 6
        lstAM.ColumnWidths = "0cm;1cm;2,101cm;2cm;2cm;2cm"
        lstAM.RowSource = "IDExpediente;Tipo;Nemotécnico;NºExp;FInicial;FFinal"
    End If
    
    Set m_AMDeBasado = m_ExpBasadoSeleccionadoC.ExpedientePadreAM
    If Not m_AMDeBasado Is Nothing Then
        Me.lblListaAM.Caption = "Acuerdo Marco del CB: " & m_ExpBasadoSeleccionadoC.CodExp
        With m_AMDeBasado
            If lstAM Is Nothing Then
                Set lstAM = Me.ListaAMEIndividual
            End If
            If m_ObjMostrarEstadoUsuarioConectado.MostrarEstado <> "Sí" Then
                lstAM.AddItem .IDExpediente & ";" & .TipoParaLista & ";" & .Nemotecnico & _
                        ";" & .CodExp & ";" & .FechaInicioContrato & ";" & .FechaFinContrato
            Else
                lstAM.AddItem .IDExpediente & ";" & .TipoParaLista & ";" & .Nemotecnico & _
                        ";" & .CodExp & ";" & .ESTADO
            End If
        End With
        
    End If

fin:
    
    If Me.ListaAMEIndividual.ListCount > 1 Then
        Me.ComandoExportarExcelAMs.Enabled = True
    End If
    If Me.ListaLotes.ListCount > 1 Then
        Me.ComandoExportarExcelLotes.Enabled = True
    End If
    If Me.ListaBasados.ListCount > 1 Then
        Me.ComandoExportarExcelBasados.Enabled = True
    End If
    
    m_Reentrando = False
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al ListaBasados_Click se ha devuelto el error: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If
    m_Reentrando = False
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Function Alta(btn As CommandButton, Optional ByRef p_Error As String) As String
    Dim m_Argumento As String

    On Error GoTo errores

    If btn.Name = Me.ComandoAltaAMoC.Name Then
        ' Incluye AM + EXPIndividual ( marco individual) + EXPHPS
        g_ArgumentoAltaTipo = EnumTipoExpediente.AM & ";" & EnumTipoExpediente.EXPIndividual & ";" & EnumTipoExpediente.EXPHPS
    ElseIf btn.Name = Me.ComandoAltaLote.Name Then
        g_ArgumentoAltaTipo = EnumTipoExpediente.Lote
    Else
        p_Error = "Botón no identificado"
        Err.Raise 1000
    End If
    Debug.Print "=== Alta() === btn=" & btn.Name & " g_ArgumentoAltaTipo=" & g_ArgumentoAltaTipo

    Set m_ObjExpedienteActivo = Nothing
    If FormularioAbierto("FormExpedienteAltaTipo") Then
        DoCmd.Close acForm, "FormExpedienteAltaTipo", acSaveNo
    End If
    DoCmd.OpenForm "FormExpedienteAltaTipo", OpenArgs:=g_ArgumentoAltaTipo, WindowMode:=acDialog
    If FormularioAbierto("FormExpedienteAltaTipo") Then
        Set m_FormAltaExpediente = Forms("FormExpedienteAltaTipo")
    End If
    Set m_ExpBusquedaUltimo = Nothing
    Filtrar m_Error

    Exit Function

errores:
    If Err.Number <> 1000 Then
        p_Error = "El método Alta ha devuelto el error: " & Err.Description
    End If
End Function
Private Sub ComandoAltaDerivadoAMoC_Click()

    Dim m_Argumento As String

    On Error GoTo errores

    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents

    m_Error = ""
    
    Set m_ObjExpedienteActivo = m_ExpAMSeleccionadoC.Expediente
    AltaDerivado Me.ComandoAltaDerivadoAMoC, m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoAltaDerivadoAMoC_Click se ha devuelto el error: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If
    
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Function AltaDerivado(btn As CommandButton, Optional ByRef p_Error As String) As String
    
    Dim m_Argumento As String
    
    
    On Error GoTo errores
    
   
    If btn.Name = Me.ComandoAltaDerivadoAMoC.Name Then
        
        m_Argumento = m_ExpAMSeleccionadoC.IDExpediente & "|" & EnumTipoExpediente.Lote & ";" & EnumTipoExpediente.BasadoDeAM
        
    ElseIf btn.Name = Me.ComandoAltaDerivadoLote.Name Then
        
        m_Argumento = m_ExpLoteSeleccionadoC.IDExpediente & "|" & EnumTipoExpediente.BasadoDeLote
    Else
        p_Error = "Botón no identificado"
        Err.Raise 1000
    End If
    

    If FormularioAbierto("FormExpedienteAltaTipo") Then
        DoCmd.Close acForm, "FormExpedienteAltaTipo", acSaveNo
    End If
    DoCmd.OpenForm "FormExpedienteAltaTipo", OpenArgs:=m_Argumento, WindowMode:=acDialog
    If FormularioAbierto("FormExpedienteAltaTipo") Then
        Set m_FormAltaExpediente = Forms("FormExpedienteAltaTipo")
    End If
    Exit Function

errores:
    If Err.Number <> 1000 Then
        p_Error = "El método AltaDerivado ha devuelto el error: " & Err.Description
    End If
End Function

Private Sub ComandoAyuda_Click()
    On Error GoTo errores
    m_Error = ""
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
   
    AbrirAyuda m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    
    Exit Sub
errores:
     If Err.Number <> 1000 Then
        m_Error = "Al ComandoAyuda_Click se ha devuelto el error: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If
    
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub ComandoCambiarTipoAMoC_Click()
    On Error GoTo errores

    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents

    m_Error = ""
    
    
    CambiarTipo Me.ComandoCambiarTipoAMoC, m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoCambiarTipoAMoC se ha devuelto el error: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If
    
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Function CambiarTipo(btn As CommandButton, Optional ByRef p_Error As String) As String
    
    Dim lst As ListBox
    Dim m_expediente As Expediente
    On Error GoTo errores
    
    
    
    If btn.Name = Me.ComandoCambiarTipoAMoC.Name Then
        Set m_expediente = m_ExpAMSeleccionadoC.Expediente
        Set lst = Me.ListaAMEIndividual
    ElseIf btn.Name = Me.ComandoCambiarTipoLote.Name Then
        Set m_expediente = m_ExpLoteSeleccionadoC.Expediente
        Set lst = Me.ListaLotes
    ElseIf btn.Name = Me.ComandoCambiarTipoBasado.Name Then
        Set m_expediente = m_ExpBasadoSeleccionadoC.Expediente
        Set lst = Me.ListaBasados
    Else
        p_Error = "Botón no identificado"
        Err.Raise 1000
    End If
    
    If m_expediente Is Nothing Then
        Set m_expediente = constructor.getExpediente(p_IDExpediente:=Nz(lst.Column(0), ""), p_Error:=p_Error)
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        If m_expediente Is Nothing Then
            p_Error = "Ha de seleccionar un expediente del tipo adecuado de la lista"
            Err.Raise 1000
        End If
        If btn.Name = Me.ComandoCambiarTipoAMoC.Name Then
             Set m_ExpAMSeleccionadoC = m_expediente
            
         ElseIf btn.Name = Me.ComandoCambiarTipoLote.Name Then
             Set m_ExpLoteSeleccionadoC = m_expediente
         ElseIf btn.Name = Me.ComandoCambiarTipoBasado.Name Then
             Set m_ExpBasadoSeleccionadoC = m_expediente
        
         End If
    End If
    If lst.Name = Me.ListaAMEIndividual.Name Then
        If Not m_expediente.Derivados Is Nothing Then
            p_Error = "El AM tiene derivados, por lo que no se puede cambiar de tipo hasta que no tenga descendencia"
            Err.Raise 1000
        End If
    End If
    If lst.Name = Me.ListaLotes.Name Then
        If Not m_expediente.Derivados Is Nothing Then
            p_Error = "El Lote tiene derivados, por lo que no se puede cambiar de tipo hasta que no tenga descendencia"
            Err.Raise 1000
        End If
    End If
    
    
    Set m_ObjExpedienteActivo = m_expediente
    If FormularioAbierto("FormExpedienteCambioTipo") Then
        DoCmd.Close acForm, "FormExpedienteCambioTipo", acSaveNo
    End If
    DoCmd.OpenForm "FormExpedienteCambioTipo"
    If FormularioAbierto("FormExpedienteCambioTipo") Then
        Set m_FormCambioTipo = Forms("FormExpedienteCambioTipo")
    End If
    
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método CambiarTipo ha devuelto el error: " & Err.Description
    End If
End Function




Private Sub ComandoEliminarAMoC_Click()
   
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    
    Eliminar Me.ComandoEliminarAMoC, m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoEliminarAMoC_Click se ha producido el error num " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If
    
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub
Private Function Eliminar(btn As CommandButton, Optional ByRef p_Error As String) As String
    
    Dim lst As ListBox
    Dim m_expediente As Expediente
    Dim m_ExpedienteOp As ExpedienteOperaciones
    Dim i As Integer
    Dim m_IDAMSeleccionado As String
    Dim m_IDLoteSeleccionado As String
    On Error GoTo errores
    
    Me.AllowEdits = False
    If btn.Name = Me.ComandoEliminarAMoC.Name Then
        Set m_expediente = m_ExpAMSeleccionadoC.Expediente
        Set lst = Me.ListaAMEIndividual
    ElseIf btn.Name = Me.ComandoEliminarLote.Name Then
        Set m_expediente = m_ExpLoteSeleccionadoC.Expediente
        Set lst = Me.ListaLotes
    ElseIf btn.Name = Me.ComandoEliminarBasado.Name Then
        Set m_expediente = m_ExpBasadoSeleccionadoC.Expediente
        Set lst = Me.ListaBasados
    Else
        p_Error = "Botón no identificado"
        Err.Raise 1000
    End If
    
    If m_expediente Is Nothing Then
        Set m_expediente = constructor.getExpediente(p_IDExpediente:=Nz(lst.Column(0), ""), p_Error:=p_Error)
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        If m_expediente Is Nothing Then
            p_Error = "Ha de seleccionar un expediente del tipo adecuado de la lista"
            Err.Raise 1000
        End If
        If btn.Name = Me.ComandoEliminarAMoC.Name Then
             Set m_ExpAMSeleccionadoC = m_expediente
            
         ElseIf btn.Name = Me.ComandoEliminarLote.Name Then
             Set m_ExpLoteSeleccionadoC = m_expediente
         ElseIf btn.Name = Me.ComandoEliminarBasado.Name Then
             Set m_ExpBasadoSeleccionadoC = m_expediente
        
         End If
    End If
    
    pregunta = MsgBox("¿Desea realmente borrar el expediente seleccionado?", vbExclamation + vbYesNo + vbDefaultButton2, "Eliminar")
    If pregunta <> vbYes Then
        Me.AllowEdits = True
        Exit Function
    End If
    
    Set m_ExpedienteOp = New ExpedienteOperaciones
    With m_ExpedienteOp
        Set .Expediente = m_expediente
        .Eliminar p_Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        RaiseEvent ExpEliminado
    End With
    Set m_ExpBusquedaUltimo = Nothing
    Me.IDExpediente = Null
    Set m_ObjEntorno.ColExpedientesParaCombo = Nothing
    RellenarComboIDExp
    Me.IDExpediente = "Todos"
    If btn.Name = Me.ComandoEliminarLote.Name Then
    
        If Not m_ExpAMSeleccionadoC Is Nothing Then
            m_IDAMSeleccionado = m_ExpAMSeleccionadoC.IDExpediente
            Set m_ExpAMSeleccionadoC = constructor.getExpediente(p_IDExpediente:=m_IDAMSeleccionado, p_Error:=m_Error)
            If m_Error <> "" Then
                Err.Raise 1000
            End If
            
        End If
    End If
    If btn.Name = Me.ComandoEliminarBasado.Name Then
    
        If Not m_ExpLoteSeleccionadoC Is Nothing Then
            m_IDLoteSeleccionado = m_ExpLoteSeleccionadoC.IDExpediente
            Set m_ExpLoteSeleccionadoC = constructor.getExpediente(p_IDExpediente:=m_IDLoteSeleccionado, p_Error:=m_Error)
            If m_Error <> "" Then
                Err.Raise 1000
            End If
    
        End If
    End If
    Filtrar p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If btn.Name = Me.ComandoEliminarLote.Name Then
        
        If m_IDAMSeleccionado <> "" Then
            For i = 1 To Me.ListaAMEIndividual.ListCount - 1
                If Me.ListaAMEIndividual.Column(0, i) = m_IDAMSeleccionado Then
                    Me.ListaAMEIndividual.Selected(i) = True
                    ListaAMEIndividual_Click
                    Exit For
                End If
            Next
        End If
    End If
    If btn.Name = Me.ComandoEliminarBasado.Name Then
       
        If m_IDLoteSeleccionado <> "" Then
            For i = 1 To Me.ListaLotes.ListCount - 1
                If Me.ListaLotes.Column(0, i) = m_IDLoteSeleccionado Then
                    Me.ListaLotes.Selected(i) = True
                    ListaLotes_Click
                    Exit For
                End If
            Next
        End If
    End If
    Me.AllowEdits = True
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método Eliminar ha devuelto el error: " & Err.Description
    End If
    Me.AllowEdits = True
End Function
Private Sub ComandoEliminarLote_Click()
    
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    Me.AllowEdits = False
    Eliminar Me.ComandoEliminarLote, m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Me.AllowEdits = True
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoEliminarLote_Click se ha producido el error num " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If
    Me.AllowEdits = True
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub ComandoEliminarBasado_Click()
    
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    Me.AllowEdits = False
    Eliminar Me.ComandoEliminarBasado, m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Me.AllowEdits = True
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoEliminarBasado_Click se ha producido el error num " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If
    Me.AllowEdits = True
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub
Private Sub Form_Open(Cancel As Integer)

    On Error GoTo errores

    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    On Error GoTo errores
    Ajustar Me
    Me.AllowEdits = False
    Me.Caption = m_TituloFormulario
    If Nz(Me.OpenArgs(), "") = "Sololectura" Then
        AbiertoParaEditar = False
    Else
        AbiertoParaEditar = True
    End If
    If AbiertoParaEditar = True Then
        PintarTareas EnumSiNo.No, m_Error
        If m_Error <> "" Then
            Err.Raise 1000
        End If
    End If
    
    ReestablecerTitulosListas
    EstablecerDatos m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Filtrar m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Me.AllowEdits = True
    AvanceCerrar
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al Form_Open se ha devuelto el error: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
    End If
    
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
    DoCmd.Close acForm, Me.Name, acSaveNo
End Sub



Private Sub ListaBasados_DblClick(Cancel As Integer)
    On Error Resume Next
    If Me.ComandoVerDetalleBasado.Enabled Then
        ComandoVerDetalleBasado_Click
    End If
End Sub

Private Sub ListaLotes_Click()
    Dim lstAM As ListBox
    Dim lstLote As ListBox
    Dim lstBasado As ListBox
    Dim m_ID As Variant
    
    
    Dim m_Lote As Expediente
    Dim m_ExpedienteAM As ExpedienteCompleto
    Dim m_expediente As ExpedienteCompleto
    Dim m_Basado As ExpedienteCompleto
    Dim m_Ejercito As String
    Dim m_OrdenadoPorEjercito As EnumSiNo
    Dim m_PrimeroLosMasNuevos As EnumSiNo
    On Error GoTo errores
    If m_Reentrando Then Exit Sub
    m_ClickPendiente = False
    Me.TimerInterval = 0
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents

    m_Error = ""
   
    
    If Nz(Me.ListaLotes.Column(0), "") = "" Then
        Set m_ExpLoteSeleccionadoC = Nothing
        VBA.DoEvents
        DoCmd.Hourglass False
        VBA.DoEvents
        Me.ComandoVerDetalleLote.Enabled = False
        Me.ComandoCambiarTipoLote.Enabled = False
        Me.ComandoAltaDerivadoLote.Enabled = False
        Me.ComandoEliminarLote.Enabled = False
        m_Reentrando = False
        Exit Sub
    End If
    If m_ExpLoteSeleccionadoC Is Nothing Then
         
        Set m_ExpLoteSeleccionadoC = constructor.getExpedienteCompleto( _
                                p_IDExpediente:=Me.ListaLotes.Column(0), _
                                p_Error:=m_Error)
        If m_Error <> "" Then
            Err.Raise 1000
        End If
    Else
        If m_ExpLoteSeleccionadoC.IDExpediente <> Me.ListaLotes.Column(0) Then
            Set m_ExpLoteSeleccionadoC = constructor.getExpedienteCompleto( _
                                    p_IDExpediente:=Me.ListaLotes.Column(0), _
                                    p_Error:=m_Error)
            If m_Error <> "" Then
                Err.Raise 1000
            End If
        
        End If
    End If
    If m_ExpLoteSeleccionadoC Is Nothing Then
        VBA.DoEvents
        DoCmd.Hourglass False
        VBA.DoEvents
        Me.ComandoVerDetalleLote.Enabled = False
        Me.ComandoCambiarTipoLote.Enabled = False
        Me.ComandoAltaDerivadoLote.Enabled = False
        Me.ComandoEliminarLote.Enabled = False
        m_Reentrando = False
        Exit Sub
    End If
    Me.ComandoVerDetalleLote.Enabled = True
    If AbiertoParaEditar = True Then
        If EsAdministrador = EnumSiNo.Sí Then
            Me.ComandoCambiarTipoLote.Enabled = True
            Me.ComandoAltaDerivadoLote.Enabled = True
            Me.ComandoEliminarLote.Enabled = True
        Else
            Me.ComandoCambiarTipoLote.Enabled = False
            Me.ComandoAltaDerivadoLote.Enabled = False
            Me.ComandoEliminarLote.Enabled = False
        End If
    Else
        Me.ComandoCambiarTipoLote.Enabled = False
        Me.ComandoAltaDerivadoLote.Enabled = False
        Me.ComandoEliminarLote.Enabled = False
    End If
    
    
    Me.IDSeleccionado = m_ExpLoteSeleccionadoC.IDExpediente
    Me.TipoElementoSeleccionado = "LOTE"
    
    If m_ExpLoteSeleccionadoC.IDExpedientePadre = Nz(Me.ListaAMEIndividual.Column(1), "") Then
        Me.lblListaBasados.Caption = "Basados del Lote: " & m_ExpLoteSeleccionadoC.Ordinal
        GoTo establecerListaBasado
    Else
        Me.lblListaAM.Caption = "Acuerdo Mardo del Lote: " & m_ExpLoteSeleccionadoC.Ordinal
        GoTo establecerListaAM
    End If
   
establecerListaAM:
    Set lstAM = Me.ListaAMEIndividual
    lstAM.RowSource = "IDExpediente;Tipo;Nemotécnico;NºExp;FInicio;FFin"
    Set m_ExpedienteAM = m_ExpLoteSeleccionadoC.ExpedientePadreAM
    m_Error = m_ExpLoteSeleccionadoC.Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    If Not m_ExpedienteAM Is Nothing Then
        Set m_ColAM = New Scripting.Dictionary
        m_ColAM.CompareMode = TextCompare
        m_ColAM.Add m_ExpedienteAM.IDExpediente, m_ExpedienteAM
        For Each m_ID In m_ColAM
            Set m_expediente = m_ColAM(m_ID)
                With m_expediente
                    lstAM.AddItem .IDExpediente & ";" & .TipoParaLista & ";" & .Nemotecnico & _
                            ";" & .CodExp & ";" & .FechaInicioContrato & ";" & .FechaFinContrato
                End With
            Set m_expediente = Nothing
            
        Next
    End If
establecerListaBasado:
    Set lstBasado = Me.ListaBasados
    lstBasado.RowSource = "IDExpediente;NºExp;Ejército;Nº;FInicio;FFin"
    Set m_ColBasados = m_ExpLoteSeleccionadoC.Basados
    If Not m_ColBasados Is Nothing Then
        For Each m_ID In m_ColBasados
            Set m_Basado = m_ColBasados(m_ID)
            With m_Basado
'                VBA.DoEvents
'                Debug.Print .IDExpediente
                m_Ejercito = .Ejercito
                lstBasado.AddItem .IDExpediente & ";" & .CodExp & ";" & m_Ejercito & ";" & .Ordinal & _
                    ";" & .FechaInicioContrato & ";" & .FechaFinContrato
            End With
            Set m_Basado = Nothing
        Next
    End If

    
    PonerNumeroExp p_Error:=m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    m_Reentrando = False
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al ListaLotes_Click se ha devuelto el error: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If
    m_Reentrando = False
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub ListaLotes_DblClick(Cancel As Integer)
   On Error Resume Next
   Application.Echo False
    If Me.ComandoVerDetalleLote.Enabled Then
        ComandoVerDetalleLote_Click
    End If
    Application.Echo True
End Sub



Private Sub m_FormAltaExpediente_Alta(p_Exp As Expediente)
    Dim i As Integer
    Dim m_IDAMSeleccionado As String
    Dim m_IDLoteSeleccionado As String
    
    On Error GoTo errores

    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    If Not m_ExpAMSeleccionadoC Is Nothing Then
        m_IDAMSeleccionado = m_ExpAMSeleccionadoC.IDExpediente
        If p_Exp.IDExpedientePadre <> "" Then
            If p_Exp.IDExpedientePadre = m_IDAMSeleccionado Then
                Set m_ExpAMSeleccionadoC = constructor.getExpedienteCompleto(p_IDExpediente:=m_IDAMSeleccionado, p_Error:=m_Error)
                If m_Error <> "" Then
                    Err.Raise 1000
                End If
            End If
        End If
        
    End If
    If Not m_ExpLoteSeleccionadoC Is Nothing Then
        m_IDLoteSeleccionado = m_ExpLoteSeleccionadoC.IDExpediente
        If p_Exp.IDExpedientePadre <> "" Then
            If p_Exp.IDExpedientePadre = m_IDLoteSeleccionado Then
                Set m_ExpLoteSeleccionadoC = constructor.getExpedienteCompleto(p_IDExpediente:=m_IDLoteSeleccionado, p_Error:=m_Error)
                If m_Error <> "" Then
                    Err.Raise 1000
                End If
            End If
        End If
    End If
    RellenarComboIDExp
    RellenarComboCodExp Me.CodExp
    Set m_ExpBusquedaUltimo = Nothing
    Filtrar m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    If m_IDAMSeleccionado <> "" Then
        For i = 1 To Me.ListaAMEIndividual.ListCount - 1
            If Me.ListaAMEIndividual.Column(0, i) = m_IDAMSeleccionado Then
                Me.ListaAMEIndividual.Selected(i) = True
                ListaAMEIndividual_Click
                Exit For
            End If
        Next
    End If
    If m_IDLoteSeleccionado <> "" Then
        For i = 1 To Me.ListaLotes.ListCount - 1
            If Me.ListaLotes.Column(0, i) = m_IDLoteSeleccionado Then
                Me.ListaLotes.Selected(i) = True
                ListaLotes_Click
                Exit For
            End If
        Next
    End If
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents

    ' Abrir expediente recién creado en pestaña Fechas
    If p_Exp.IDExpediente <> "" Then
        AbrirExpedienteEnFechas p_Exp.IDExpediente, m_Error
        If m_Error <> "" Then Err.Raise 1000
    End If

    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al m_FormAltaExpediente_Alta se ha devuelto el error: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If
    
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub m_FormCambioTipo_CambioRealizado()
     On Error GoTo errores

    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    Set m_ObjEntorno.ColExpedientesCompletos = Nothing
    Set m_ExpBusquedaUltimo = Nothing
    Set m_ExpLoteSeleccionadoC = Nothing
    Filtrar
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al m_FormCambioTipo_CambioRealizado se ha devuelto el error: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If
    
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub m_FormExpediente_AltaExpediente(m_expediente As Expediente)
    On Error GoTo errores

    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    Set m_ExpBusquedaUltimo = Nothing
    Filtrar m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al m_FormExpediente_AltaExpediente se ha devuelto el error: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If
    
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub m_FormExpediente_ExpedienteEditado(m_expediente As Expediente)
    
    Dim i As Integer
    Dim m_IDAMSeleccionado As String
    Dim m_IDLoteSeleccionado As String
    
    On Error GoTo errores

    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    If Not m_ExpAMSeleccionadoC Is Nothing Then
        m_IDAMSeleccionado = m_ExpAMSeleccionadoC.IDExpediente
    End If
    If Not m_ExpLoteSeleccionadoC Is Nothing Then
        m_IDLoteSeleccionado = m_ExpLoteSeleccionadoC.IDExpediente
    End If
    Set m_ExpBusquedaUltimo = Nothing
    Filtrar m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    If m_IDAMSeleccionado <> "" Then
        For i = 1 To Me.ListaAMEIndividual.ListCount - 1
            If Me.ListaAMEIndividual.Column(0, i) = m_IDAMSeleccionado Then
                Me.ListaAMEIndividual.Selected(i) = True
                ListaAMEIndividual_Click
                Exit For
            End If
        Next
    End If
    If m_IDLoteSeleccionado <> "" Then
        For i = 1 To Me.ListaLotes.ListCount - 1
            If Me.ListaLotes.Column(0, i) = m_IDLoteSeleccionado Then
                Me.ListaLotes.Selected(i) = True
                ListaLotes_Click
                Exit For
            End If
        Next
    End If
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al m_FormExpediente_ExpedienteEditado se ha devuelto el error: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If
    
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub



Private Sub MarcoPecal_AfterUpdate()
    On Error GoTo errores
    DoCmd.Hourglass True
    m_Error = ""
    
    
    Filtrar m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    DoCmd.Hourglass False
    
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al MarcoPecal_AfterUpdate se ha devuelto el error: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If
    
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub


Private Sub MarcoPostAgedo_AfterUpdate()
    Dim m_Valor As Long
    On Error GoTo errores

    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents

    m_Error = ""
    
    
    m_Valor = Me.MarcoPostAgedo.value
    If m_Valor = 1 Then 'Todos
        m_EnumPostAgedoCombo = EnumPostAgedoCombo.Todos
    ElseIf m_Valor = 2 Then 'No
        m_EnumPostAgedoCombo = EnumPostAgedoCombo.No
    ElseIf m_Valor = 3 Then 'Sólo
        m_EnumPostAgedoCombo = EnumPostAgedoCombo.Solo
    End If
    Filtrar m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al MarcoPostAgedo_AfterUpdate se ha devuelto el error: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If
    
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub MarcoSeguridad_AfterUpdate()
    On Error GoTo errores
    DoCmd.Hourglass True
    m_Error = ""
    
    Filtrar m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    DoCmd.Hourglass False
    
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al MarcoSeguridad_AfterUpdate se ha devuelto el error: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If
    
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub
Private Sub MarcoCalidad_AfterUpdate()
    On Error GoTo errores
    DoCmd.Hourglass True
    m_Error = ""
    
    Filtrar m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    DoCmd.Hourglass False
    
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al MarcoCalidad_AfterUpdate se ha devuelto el error: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If
    
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub




Public Function RellenarComboIDExp(Optional ByRef p_Error As String) As String
    Dim m_Col As Scripting.Dictionary
    Dim cmb As ComboBox
    Dim m_ID As Variant
    Dim m_ExpedienteC As ExpedienteCompleto
    On Error GoTo errores
    If m_DatosEnMemoria <> EnumSiNo.Sí Then
        
        Set m_ObjEntorno.ColExpedientesCompletos = Nothing
    
    End If
    Set m_Col = m_ObjEntorno.ColExpedientesCompletos
    Set cmb = Me.IDExpediente
    cmb.RowSource = ""
    cmb.AddItem "Todos"
    If Not m_Col Is Nothing Then
        For Each m_ID In m_Col
            Set m_ExpedienteC = m_Col(m_ID)
            cmb.AddItem m_ExpedienteC.IDExpediente
            Set m_ExpedienteC = Nothing
        Next
       
    End If
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método RellenarComboIDExp ha producido el error n: " & Err.Number & _
        vbNewLine & "Detalle: " & Err.Description
    End If
End Function

Public Function RellenarComboComercial(Optional ByRef p_Error As String) As String
    Dim m_Col As Scripting.Dictionary
    Dim cmb As ComboBox
    Dim m_ID As Variant
    Dim m_Comercial As Comercial
    On Error GoTo errores
    Set m_Col = m_ObjEntorno.Comerciales
    Set cmb = Me.Comercial
    cmb.RowSource = ""
    cmb.AddItem "Todos"
    If Not m_Col Is Nothing Then
        For Each m_ID In m_Col
            Set m_Comercial = m_Col(m_ID)
            cmb.AddItem m_Comercial.Comercial
            Set m_Comercial = Nothing
        Next
       
    End If
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método RellenarComboComercial ha producido el error n: " & Err.Number & _
        vbNewLine & "Detalle: " & Err.Description
    End If
End Function
Public Function RellenarComboRAC(Optional ByRef p_Error As String) As String
    
    Dim m_Col As Scripting.Dictionary
    Dim cmb As ComboBox
    Dim m_ID As Variant
    Dim m_RAC As RAC
    On Error GoTo errores
    Set m_Col = m_ObjEntorno.RACs
    Set cmb = Me.RAC
    cmb.RowSource = ""
    cmb.AddItem "Todos"
    If Not m_Col Is Nothing Then
        For Each m_ID In m_Col
            Set m_RAC = m_Col(m_ID)
            cmb.AddItem m_RAC.RAC
            Set m_RAC = Nothing
        Next
       
    End If
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método RellenarComboRAC ha producido el error n: " & Err.Number & _
        vbNewLine & "Detalle: " & Err.Description
    End If
End Function


Public Function Reestablecer(Optional ByRef p_Error As String) As String
    
    On Error GoTo errores
    
    Set m_ObjEntorno.ColExpedientesParaCombo = Nothing
    Set m_ObjEntorno.Comerciales = Nothing
    Set m_ObjEntorno.RACs = Nothing
    Set m_ObjEntorno.JPs = Nothing
    
    Set m_ObjExpBusquedaActiva = Nothing
    
    RellenarCombos p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    setExpBusqueda Me, m_ObjExpBusquedaActiva, p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método Reestablecer ha producido el error n: " & Err.Number & _
        vbNewLine & "Detalle: " & Err.Description
    End If
End Function
Public Function ReestablecerTitulosListas(Optional ByRef p_Error As String) As String
    
    On Error GoTo errores
    Me.lblListaAM.Caption = "Acuerdos Marco y los Expedientes individuales"
    Me.lblListaLotes.Caption = "Lotes"
    Me.lblListaBasados.Caption = "Basados"
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método ReestablecerTitulosListas ha producido el error n: " & Err.Number & _
        vbNewLine & "Detalle: " & Err.Description
    End If
End Function

Private Sub ComandoReiniciar_Click()
        
    On Error GoTo errores

    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents

    m_Error = ""
   Set m_ObjEntorno.ColExpedientesCompletos = Nothing
'    Reestablecer p_Error:=m_Error
'    If m_Error <> "" Then
'        Err.Raise 1000
'    End If
    Set m_ExpBusquedaUltimo = Nothing
'    Me.ListaAMEIndividual.RowSource = "IDExpediente;Tipo;Nemotécnico;NºExp;FInicio;FFin"
'    Me.ListaLotes.RowSource = "IDExpediente;Nº;NºExp;FInicio;FFin"
'    Me.ListaBasados.RowSource = "IDExpediente;Ejército;Nº;FInicio;FFin"
    Filtrar m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoReiniciar_Click se ha devuelto el error: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If
    
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub


Private Function PonerNumeroExp(Optional ByRef p_Error As String) As String
    
    Dim dblNumero As Double
    On Error GoTo errores

    
    Me.NAMC = CDbl(Me.ListaAMEIndividual.ListCount - 1)
    Me.NLOTES = CDbl(Me.ListaLotes.ListCount - 1)
    Me.NBASADOS = CDbl(Me.ListaBasados.ListCount - 1)
    Me.NTOTAL = CDbl(Nz(Me.NAMC, "0") + Nz(Me.NLOTES, "0") + Nz(Me.NBASADOS, "0"))
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método PonerNumeroExp ha devuelto el error: " & Err.Description
    End If
End Function

Private Sub PalabraClave_KeyDown(KeyCode As Integer, Shift As Integer)
    
    ' Detectar si se ha pulsado la tecla Enter
    If KeyCode = vbKeyReturn Then
        ' Código que deseas ejecutar cuando se pulse Enter
        
        If ComandoPalabraClave.Enabled = True Then
            Me.ComandoPalabraClave.SetFocus
            ComandoPalabraClave_Click
        End If
        ' Si deseas evitar que Access realice la acción predeterminada de Enter,
        ' puedes utilizar la siguiente línea:
        'KeyCode = 0
    End If


End Sub

Private Sub RAC_AfterUpdate()
    On Error GoTo errores
    DoCmd.Hourglass True
    m_Error = ""
    
    
    Filtrar m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    DoCmd.Hourglass False
    
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al RAC_AfterUpdate se ha devuelto el error: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If
    
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub VerEstado_AfterUpdate()
    
    On Error GoTo errores
    DoCmd.Hourglass True
    m_Error = ""
    
    Set m_ObjMostrarEstadoUsuarioConectado = RegistrarMostrarEstado(Nz(Me.VerEstado, ""))
    Refiltrar m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    DoCmd.Hourglass False
    
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al VerEstado_AfterUpdate se ha devuelto el error: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If
    
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub
