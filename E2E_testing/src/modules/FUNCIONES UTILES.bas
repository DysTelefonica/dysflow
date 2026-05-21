Attribute VB_Name = "FUNCIONES UTILES"
Option Compare Database
Option Explicit
Private s_contadorPasos As Long
Private m_AntiSpamDict As Scripting.Dictionary
Public g_BusyFlag As String

Public Function RellenarListaImagenes( _
                                        ByRef p_ListImages As Object, _
                                        Optional ByRef p_Error As String _
                                    ) As String

    Dim m_VarItem As Variant
    Dim m_URLIcono As String
    Dim m_Col As Scripting.Dictionary
    Dim k As String

    On Error GoTo errores

    p_Error = ""
    Set m_Col = m_ObjEntorno.ColImagenes

    ' Limpia la lista (opcional pero recomendable)
    On Error Resume Next
    Do While p_ListImages.ListImages.Count > 0
        p_ListImages.ListImages.Remove 1
    Loop
    On Error GoTo errores

    For Each m_VarItem In m_Col
        m_URLIcono = CStr(m_VarItem)
        k = fso.GetFileName(m_URLIcono) ' Key = nombre de fichero (tu estándar)

        ' Si ya existe esa Key, la quitamos
        On Error Resume Next
        p_ListImages.ListImages.Remove k
        Err.Clear
        On Error GoTo errores

        ' Añade SIEMPRE al final (sin índice)
        p_ListImages.ListImages.Add , k, LoadPicture(m_URLIcono)
    Next

    Exit Function

errores:
    If Err.Number <> 1000 Then
        p_Error = "El método RellenarListaImagenes ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function

Public Function ActualizarExpedienteCompleto(p_Expediente As Expediente, Optional ByRef p_Error As String) As String
    
    Dim m_Col As Scripting.Dictionary
    
    
    
    On Error GoTo errores
    
    If m_ObjEntorno.ColExpedientesCompletos.exists(CStr(p_Expediente.IDExpediente)) Then
        m_ObjEntorno.ColExpedientesCompletos.Remove CStr(p_Expediente.IDExpediente)
    End If
    m_ObjEntorno.ColExpedientesCompletos.Add p_Expediente.IDExpediente, p_Expediente.ExpedienteCompleto
   
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método ActualizarExpedienteCompleto ha producido el error n: " & Err.Number & _
        vbNewLine & "Detalle: " & Err.Description
    End If
End Function
Public Function RellenarComboEstado(cmb As ComboBox, Optional ByRef p_Error As String) As String
    Dim m_Col As Scripting.Dictionary
    
    Dim m_ID As Variant
    
    On Error GoTo errores
    Set m_Col = m_ObjEntorno.ColEstadosTitulo
    
    cmb.RowSource = ""
    cmb.AddItem "0;Todos"
    If Not m_Col Is Nothing Then
        For Each m_ID In m_Col
            
            cmb.AddItem m_ID & ";" & m_Col(m_ID)
            
        Next
        
    End If
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método RellenarComboEstado ha producido el error n: " & Err.Number & _
        vbNewLine & "Detalle: " & Err.Description
    End If
End Function
Public Function RellenarComboSuministradores(cmb As ComboBox, Optional ByRef p_Error As String) As String
    
    Dim m_Col As Scripting.Dictionary
    
    
    Dim m_CadenaContratista As Variant
    On Error GoTo errores
    Set m_Col = m_ObjEntorno.CadenaSuministradores
    
    cmb.RowSource = ""
    cmb.AddItem "Todos"
    If Not m_Col Is Nothing Then
        For Each m_CadenaContratista In m_Col
            
            cmb.AddItem m_CadenaContratista
            
        Next
       
    End If
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método RellenarComboSuministradores ha producido el error n: " & Err.Number & _
        vbNewLine & "Detalle: " & Err.Description
    End If
End Function
Public Function RellenarComboCodExp(cmb As ComboBox, Optional ByRef p_Error As String) As String
    Dim m_Col As Scripting.Dictionary
    
    Dim m_ID As Variant
    Dim m_ExpedienteC As ExpedienteCompleto
    On Error GoTo errores
    
    If m_DatosEnMemoria <> EnumSiNo.Sí Then
        
        Set m_ObjEntorno.ColExpedientesCompletos = Nothing
    
    End If
    Set m_Col = m_ObjEntorno.ColExpedientesCompletos
    
    cmb.RowSource = ""
    cmb.AddItem "Todos"
    If Not m_Col Is Nothing Then
        For Each m_ID In m_Col
            Set m_ExpedienteC = m_Col(m_ID)
            cmb.AddItem m_ExpedienteC.CodExp
            Set m_ExpedienteC = Nothing
        Next
       
    End If
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método RellenarComboCodExp ha producido el error n: " & Err.Number & _
        vbNewLine & "Detalle: " & Err.Description
    End If
End Function
Public Function RellenarComboJefesProyecto(cmb As ComboBox, Optional ByRef p_Error As String) As String
    
    Dim m_Col As Scripting.Dictionary
    Dim m_ID As Variant
    
    On Error GoTo errores
    Set m_Col = m_ObjEntorno.JPs
    
    cmb.RowSource = ""
    cmb.AddItem "Todos"
    If Not m_Col Is Nothing Then
        For Each m_ID In m_Col
            cmb.AddItem m_ID
        Next
       
    End If
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método RellenarComboJefesProyecto ha producido el error n: " & Err.Number & _
        vbNewLine & "Detalle: " & Err.Description
    End If
End Function

Public Function RegistrarUltimoCambio( _
                                        Optional p_IDExpediente As String, _
                                        Optional p_Expediente As Expediente, _
                                        Optional ByRef p_Error As String _
                                        ) As String
    Dim m_UltimoCambioOp As UltimoCambioOperaciones
    Dim m_UltimoCambio As UltimoCambio
    On Error GoTo errores
    If p_Expediente Is Nothing Then
        Set p_Expediente = constructor.getExpediente(p_IDExpediente:=p_IDExpediente, p_Error:=p_Error)
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        If p_Expediente Is Nothing Then
            Exit Function
        End If
    End If
    Set m_UltimoCambioOp = New UltimoCambioOperaciones
    With m_UltimoCambioOp
        Set m_UltimoCambio = .Registrar(p_Expediente:=p_Expediente, p_Error:=p_Error)
        If p_Error <> "" Then
            Err.Raise 1000
        End If
    End With
    Set m_ObjEntorno.UltimoCambio = m_UltimoCambio
    If FormularioAbierto("FormExpedientesGestion") Then
        Forms("FormExpedientesGestion").Controls("lblUltimaModificacion").Caption = m_ObjEntorno.UltimoCambio.texto
    End If
    If FormularioAbierto("FormExpediente") Then
        Forms("FormExpediente").Controls("lblUltimaModificacion").Caption = m_ObjEntorno.UltimoCambio.texto
    End If
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método RegistrarUltimoCambio ha devuelto el error: " & Err.Description
    End If
End Function


Public Function ExisteCampoEnObjeto( _
                                        p_Campo As Variant, _
                                        p_EnumTipoObjeto As EnumTipoObjeto, _
                                        Optional ByRef p_Error As String _
                                        ) As EnumSiNo
    Dim m_Campo As Variant
    Dim m_expediente As Expediente
    Dim m_ExpedienteEntidad As ExpedienteEntidad
    Dim m_Col As Collection
    Dim m_Objeto As Object
    On Error GoTo errores
    If p_EnumTipoObjeto = EnumTipoObjeto.Expediente Then
        Set m_Objeto = New Expediente
    ElseIf p_EnumTipoObjeto = EnumTipoObjeto.ExpedienteEntidad Then
        Set m_Objeto = New ExpedienteEntidad
    Else
        Exit Function
    End If
    
    Set m_Col = m_Objeto.ColCampos
    
    For Each m_Campo In m_Col
        If CStr(p_Campo) = CStr(m_Campo) Then
            ExisteCampoEnObjeto = EnumSiNo.Sí
            Exit Function
        End If
    Next
   ExisteCampoEnObjeto = EnumSiNo.No
   Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método ExisteCampoEnObjeto ha devuelto el error: " & Err.Description
    End If
End Function

Public Function getWhereBusqueda( _
                                        p_ExpBusqueda As ExpedienteBusqueda, _
                                        Optional ByRef p_Error As String _
                                        ) As String
                                        
    Dim m_WhereEstado As String
    Dim m_WherEJuridica As String
    Dim m_WherePecal As String
    Dim m_WhereSeguridad As String
    Dim m_WhereLugar As String
    Dim m_WhereCodExp As String
    Dim m_WherePostAgedo As String
    Dim m_WhereCalidad As String
    Dim m_WhereRespSeguridad As String
    Dim m_WhereComercial As String
    Dim m_WhereJP As String
    Dim m_WhereRAC As String
    Dim m_WhereNemotecnico As String
    Dim m_Where As String
    On Error GoTo errores
    
    With p_ExpBusqueda
        If .ESTADO = "Todos" Or .ESTADO = "" Then
            m_WhereEstado = "(Estado Is Null or Not Estado Is Null) "
        Else
            m_WhereEstado = "Estado='" & .ESTADO & "' "
        End If
        If .Suministrador = "Todos" Or .Suministrador = "" Then
            m_WherEJuridica = "(CadenaContratistas Is Null or Not CadenaContratistas Is Null) "
        Else
            m_WherEJuridica = "CadenaContratistas Like '*" & .Suministrador & "*' "
        End If
        If .PECAL = "Todos" Or .PECAL = "" Then
            m_WherePecal = "(TbExpedientesConEntidades.CadenaPecal Is Null or Not TbExpedientesConEntidades.CadenaPecal Is Null) "
        Else
            m_WherePecal = "TbExpedientesConEntidades.CadenaPecal Like '*" & .PECAL & "*' "
        End If
        If .GradoClasificacion = "Todos" Or .GradoClasificacion = "" Then
            m_WhereSeguridad = "(Clasificacion Is Null or Not Clasificacion Is Null) "
        ElseIf .GradoClasificacion = "SinClass" Then
            m_WhereSeguridad = "(Clasificacion='Sin Clasificación' or Clasificacion Is Null) "
        Else
            m_WhereSeguridad = "Clasificacion='" & .GradoClasificacion & "' "
        End If
        If .m_EnumAmbito = EnumAmbito.Defensa Then
            m_WhereLugar = "Ambito='Sí' "
        ElseIf .m_EnumAmbito = EnumAmbito.Fuera Then
            m_WhereLugar = "Ambito='No' "
        ElseIf .m_EnumAmbito = EnumAmbito.Todos Then
            m_WhereLugar = "(Ambito Is Null or Not Ambito Is Null) "
        End If
        
        If .m_EnumPostAgedoCombo = EnumPostAgedoCombo.No Then
            m_WherePostAgedo = "(POSTAGEDO='No' or POSTAGEDO Is Null) "
        ElseIf .m_EnumPostAgedoCombo = EnumPostAgedoCombo.Solo Then
            m_WherePostAgedo = "POSTAGEDO='Sí' "
        ElseIf .m_EnumPostAgedoCombo = EnumPostAgedoCombo.Todos Then
            m_WherePostAgedo = "(POSTAGEDO Is Null or Not POSTAGEDO Is Null) "
        End If
        If .responsableCalidad = "Todos" Or .responsableCalidad = "" Then
            m_WhereCalidad = "(ResponsableCalidad Is Null or Not ResponsableCalidad Is Null) "
        Else
            m_WhereCalidad = "ResponsableCalidad='" & .responsableCalidad & "' "
        End If
        If .responsableSeguridad = "Todos" Or .responsableSeguridad = "" Then
            m_WhereRespSeguridad = "(ResponsableSeguridad Is Null or Not ResponsableSeguridad Is Null) "
        Else
            m_WhereRespSeguridad = "ResponsableSeguridad='" & .responsableSeguridad & "' "
        End If
        If .Comercial = "Todos" Or .Comercial = "" Then
            m_WhereComercial = "(CadenaComerciales Is Null or Not CadenaComerciales Is Null) "
        Else
            m_WhereComercial = "CadenaComerciales Like '*" & .Comercial & "*' "
        End If
        If .jp = "Todos" Or .jp = "" Then
            m_WhereJP = "(CadenaJPs Is Null or Not CadenaJPs Is Null) "
        Else
            m_WhereJP = "CadenaJPs Like '*" & .jp & "*' "
        End If
        If .RAC = "Todos" Or .RAC = "" Then
            m_WhereRAC = "(CadenaRACs Is Null or Not CadenaRACs Is Null) "
        Else
            m_WhereRAC = "CadenaRACs Like '*" & .RAC & "*' "
        End If
        If .CodExp = "Todos" Or .CodExp = "" Then
            m_WhereNemotecnico = "(CodExp Is Null or Not CodExp Is Null) "
        Else
            If .PalabraClave = "" Then
                m_WhereNemotecnico = "CodExp='" & .CodExp & "' "
            Else
                m_WhereNemotecnico = "(Nemotecnico Like '*" & .PalabraClave & "*' or CodExp Like '*" & .PalabraClave & "*') "
            End If
        End If
        
    End With
    
    
    
    getWhereBusqueda = "WHERE " & _
                    m_WhereEstado & " AND " & _
                    m_WherEJuridica & " AND " & _
                    m_WherePecal & " AND " & _
                    m_WhereSeguridad & " AND " & _
                    m_WhereLugar & " AND " & _
                    m_WhereNemotecnico & " AND " & _
                    m_WherePostAgedo & " AND " & _
                    m_WhereCalidad & " AND " & _
                    m_WhereRespSeguridad & " AND " & _
                    m_WhereComercial & " AND " & _
                    m_WhereRAC & ";"

    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getWhereBusqueda ha devuelto el error: " & Err.Description
    End If
End Function

Public Function getWhereTipoExpediente( _
                                        Optional p_ParaAM As EnumSiNo, _
                                        Optional p_ParaLote As EnumSiNo, _
                                        Optional p_ParaBasado As EnumSiNo, _
                                        Optional ByRef p_Error As String _
                                        ) As String
    
    
    
    Dim m_Where As String
    Dim m_WhereClienteDefensa As String
    Dim m_WherePostAgedo As String
    Dim m_WhereTipoExpediente As String
    
    On Error GoTo errores
    
   
    If m_EnumPostAgedoCombo = EnumPostAgedoCombo.No Then
        m_WherePostAgedo = "(POSTAGEDO='No' or POSTAGEDO Is Null) "
    ElseIf m_EnumPostAgedoCombo = EnumPostAgedoCombo.Solo Then
        m_WherePostAgedo = "POSTAGEDO='Sí' "
    Else
        m_WherePostAgedo = "(POSTAGEDO Like '*' or POSTAGEDO Is Null) "
    End If
    If m_EnumAmbitoCombo = EnumAmbito.Defensa Then
        m_WhereClienteDefensa = "Ambito='Defensa' "
    ElseIf m_EnumAmbitoCombo = EnumAmbito.Fuera Then
        m_WhereClienteDefensa = "Ambito='Fuera' "
    ElseIf m_EnumAmbitoCombo = EnumAmbito.HPS Then
        m_WhereClienteDefensa = "Ambito='HPS' "
    Else
        m_WhereClienteDefensa = "(Ambito Like '*' or Ambito Is Null) "
    End If
    If p_ParaAM = EnumSiNo.Sí Then
        m_WhereTipoExpediente = "(EsLote='No' AND EsBasado='No') "
    ElseIf p_ParaLote = EnumSiNo.Sí Then
        m_WhereTipoExpediente = "EsLote='Sí' "
    ElseIf p_ParaBasado = EnumSiNo.Sí Then
        m_WhereTipoExpediente = "EsBasado='Sí' "
    Else
        p_Error = "Falta el tipo de expediente"
        Err.Raise 1000
    End If
    
    m_Where = "WHERE " & _
            m_WhereClienteDefensa & " " & _
            "AND " & m_WherePostAgedo & " " & _
            "AND " & m_WhereTipoExpediente & ";"
    
    getWhereTipoExpediente = m_Where
    
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getWhereTipoExpediente ha devuelto el error: " & Err.Description
    End If
End Function

Public Function getColBusquedaPorTablas( _
                                        p_ExpBusqueda As ExpedienteBusqueda, _
                                        Optional p_ParaAM As EnumSiNo, _
                                        Optional p_ParaLote As EnumSiNo, _
                                        Optional p_ParaBasado As EnumSiNo, _
                                        Optional p_ParaExpediente As EnumSiNo, _
                                        Optional ByRef p_Error As String _
                                        ) As Scripting.Dictionary
    
    Dim m_Col As Scripting.Dictionary
    Dim m_ExpC As ExpedienteCompleto
    Dim m_ID As Variant
    Dim m_PasaCriterioBusqueda As EnumSiNo
    
    
    On Error GoTo errores
    Set m_Col = constructor.getExpedientesCompletos(p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    Set getColBusquedaPorTablas = ColPasanCriterioBusqueda(m_Col, p_ExpBusqueda, p_ParaAM, p_ParaLote, p_ParaBasado, p_ParaExpediente, p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
   
    
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getColBusquedaPorTablas ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getColBusqueda( _
                                    p_ExpBusqueda As ExpedienteBusqueda, _
                                    Optional p_ParaAM As EnumSiNo, _
                                    Optional p_ParaLote As EnumSiNo, _
                                    Optional p_ParaBasado As EnumSiNo, _
                                    Optional p_ParaExpediente As EnumSiNo, _
                                    Optional ByRef p_Error As String _
                                    ) As Scripting.Dictionary
    
    On Error GoTo errores
    
    If m_DatosEnMemoria = EnumSiNo.Sí Then
        Set getColBusqueda = getColBusquedaPorMemoria(p_ExpBusqueda, p_ParaAM, p_ParaLote, p_ParaBasado, p_ParaExpediente, p_Error)
        
    Else
        Set getColBusqueda = getColBusquedaPorTablas(p_ExpBusqueda, p_ParaAM, p_ParaLote, p_ParaBasado, p_ParaExpediente, p_Error)
    End If
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getColBusqueda ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getColLotes( _
                                    p_ExpPadre As Object, _
                                    Optional ByRef p_Error As String _
                                    ) As Scripting.Dictionary
    
    On Error GoTo errores
    
    If m_DatosEnMemoria = EnumSiNo.Sí Then
        Set getColLotes = getColLotesPorMemoria(p_ExpPadre, p_Error)
        
    Else
        Set getColLotes = getColLotesPorTablas(p_ExpPadre, p_Error)
    End If
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getColBusqueda ha devuelto el error: " & Err.Description
    End If
End Function
'Public Function getLoteDeBasado( _
'                                    p_Exp As Expediente, _
'                                    Optional ByRef p_Error As String _
'                                    ) As Object
'
'    On Error GoTo errores
'
'    If m_DatosEnMemoria = EnumSiNo.Sí Then
'        Set getLoteDeBasado = getLoteDeBasadoPorMemoria(p_Exp, p_Error)
'
'    Else
'        Set getLoteDeBasado = getLoteDeBasadoPorTablas(p_Exp, p_Error)
'    End If
'    If p_Error <> "" Then
'        Err.Raise 1000
'    End If
'
'    Exit Function
'
'errores:
'    If Err.Number <> 1000 Then
'        p_Error = "El método getColBusqueda ha devuelto el error: " & Err.Description
'    End If
'End Function


Public Function getColBasados( _
                                    p_ExpPadre As Object, _
                                    Optional ByRef p_Error As String _
                                    ) As Scripting.Dictionary
    
    On Error GoTo errores
    
    If m_DatosEnMemoria = EnumSiNo.Sí Then
        Set getColBasados = getColBasadosPorMemoria(p_ExpPadre, p_Error)
        
    Else
        Set getColBasados = getColBasadosPorTablas(p_ExpPadre, p_Error)
    End If
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getColBusqueda ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getColLotesPorMemoria( _
                                            p_ExpPadre As Object, _
                                            Optional ByRef p_Error As String _
                                            ) As Scripting.Dictionary
    Dim m_Col  As Scripting.Dictionary
    Dim m_ID As Variant
    Dim m_ExpC As ExpedienteCompleto
    Dim m_IDExpediente As String
    
    
    On Error GoTo errores
    Set m_Col = m_ObjEntorno.ColExpedientesCompletos
    If m_Col Is Nothing Then
        Exit Function
    End If
    m_IDExpediente = p_ExpPadre.IDExpediente
    For Each m_ID In m_Col
        Set m_ExpC = m_Col(m_ID)
        If m_ExpC.EsLote <> "Sí" Then
            GoTo siguiente
        End If
        If m_ExpC.IDExpedientePadre <> m_IDExpediente Then
            GoTo siguiente
        End If
        

        If getColLotesPorMemoria Is Nothing Then
            Set getColLotesPorMemoria = New Scripting.Dictionary
            getColLotesPorMemoria.CompareMode = TextCompare
        End If
        If Not getColLotesPorMemoria.exists(CStr(m_ExpC.IDExpediente)) Then
            getColLotesPorMemoria.Add m_ExpC.IDExpediente, m_ExpC
        End If
siguiente:
        Set m_ExpC = Nothing
    Next
    
    
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getColLotesPorMemoria ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getColBasadosPorMemoria( _
                                            p_ExpPadre As Object, _
                                            Optional ByRef p_Error As String _
                                            ) As Scripting.Dictionary
    Dim m_Col  As Scripting.Dictionary
    Dim m_ID As Variant
    Dim m_ExpC As ExpedienteCompleto
    Dim m_IDExpediente As String
    
    
    On Error GoTo errores
    Set m_Col = m_ObjEntorno.ColExpedientesCompletos
    If m_Col Is Nothing Then
        Exit Function
    End If
    m_IDExpediente = p_ExpPadre.IDExpediente
    For Each m_ID In m_Col
        Set m_ExpC = m_Col(m_ID)
        If m_ExpC.EsBasado <> "Sí" Then
            GoTo siguiente
        End If
        If m_ExpC.IDExpedientePadre <> m_IDExpediente Then
            GoTo siguiente
        End If
        

        If getColBasadosPorMemoria Is Nothing Then
            Set getColBasadosPorMemoria = New Scripting.Dictionary
            getColBasadosPorMemoria.CompareMode = TextCompare
        End If
        If Not getColBasadosPorMemoria.exists(CStr(m_ExpC.IDExpediente)) Then
            getColBasadosPorMemoria.Add m_ExpC.IDExpediente, m_ExpC
        End If
siguiente:
        Set m_ExpC = Nothing
    Next
    
    
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getColBasadosPorMemoria ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getColBasadosDeLotePorMemoria( _
                                            p_ExpAM As Object, _
                                            Optional ByRef p_Error As String _
                                            ) As Scripting.Dictionary
    Dim m_Col  As Scripting.Dictionary
    Dim m_ID As Variant
    Dim m_ExpC As ExpedienteCompleto
    Dim m_IDExpediente As String
    
    
    On Error GoTo errores
    Set m_Col = m_ObjEntorno.ColExpedientesCompletos
    If m_Col Is Nothing Then
        Exit Function
    End If
    m_IDExpediente = p_ExpAM.IDExpediente
    For Each m_ID In m_Col
        Set m_ExpC = m_Col(m_ID)
        If m_ExpC.EsBasado <> "Sí" Then
            GoTo siguiente
        End If
        If m_ExpC.IDExpedientePadre <> m_IDExpediente Then
            GoTo siguiente
        End If
        

        If getColBasadosDeLotePorMemoria Is Nothing Then
            Set getColBasadosDeLotePorMemoria = New Scripting.Dictionary
            getColBasadosDeLotePorMemoria.CompareMode = TextCompare
        End If
        If Not getColBasadosDeLotePorMemoria.exists(CStr(m_ExpC.IDExpediente)) Then
            getColBasadosDeLotePorMemoria.Add m_ExpC.IDExpediente, m_ExpC
        End If
siguiente:
        Set m_ExpC = Nothing
    Next
    
    
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getColBasadosDeLotePorMemoria ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getColLotesPorTablas( _
                                            p_ExpPadre As Object, _
                                            Optional ByRef p_Error As String _
                                            ) As Scripting.Dictionary
    
    
    On Error GoTo errores
    Set getColLotesPorTablas = p_ExpPadre.Lotes
    
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getColLotesPorTablas ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getColBasadosPorTablas( _
                                            p_ExpPadre As Object, _
                                            Optional ByRef p_Error As String _
                                            ) As Scripting.Dictionary
    
    
    On Error GoTo errores
    Set getColBasadosPorTablas = p_ExpPadre.Basados
    
    
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getColBasadosPorTablas ha devuelto el error: " & Err.Description
    End If
End Function

Public Function getColBusquedaPorMemoria( _
                                            p_ExpBusqueda As ExpedienteBusqueda, _
                                            Optional p_ParaAM As EnumSiNo, _
                                            Optional p_ParaLote As EnumSiNo, _
                                            Optional p_ParaBasado As EnumSiNo, _
                                            Optional p_ParaExpediente As EnumSiNo, _
                                            Optional ByRef p_Error As String _
                                            ) As Scripting.Dictionary
    
    Dim m_Col As Scripting.Dictionary
    
    
    
    On Error GoTo errores
    
    Set m_Col = m_ObjEntorno.ColExpedientesCompletos
    If m_Col Is Nothing Then
        Exit Function
    End If
    Set getColBusquedaPorMemoria = ColPasanCriterioBusqueda(m_Col, p_ExpBusqueda, p_ParaAM, p_ParaLote, p_ParaBasado, p_ParaExpediente, p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    
    
    
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getColBusquedaPorMemoria ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getColBusquedaTecnica( _
                                        p_ExpBusqueda As ExpedienteBusquedaTecnica, _
                                        Optional ByRef p_Error As String _
                                        ) As Scripting.Dictionary
    On Error GoTo errores
    
    If m_DatosEnMemoria = EnumSiNo.Sí Then
        Set getColBusquedaTecnica = getColBusquedaTecnicaPorMemoria(p_ExpBusqueda, p_Error)
        
    Else
        Set getColBusquedaTecnica = getColBusquedaTecnicaPorTablas(p_ExpBusqueda, p_Error)
    End If
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getColBusqueda ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getColBusquedaTecnicaPorMemoria( _
                                                    p_ExpBusqueda As ExpedienteBusquedaTecnica, _
                                                    Optional ByRef p_Error As String _
                                                 ) As Scripting.Dictionary
    Dim m_Col As Scripting.Dictionary
    
    
    
    On Error GoTo errores
    
    Set m_Col = m_ObjEntorno.ColExpedientesCompletos
    If m_Col Is Nothing Then
        Exit Function
    End If
    Set getColBusquedaTecnicaPorMemoria = ColPasanCriterioBusquedaTecnica(m_Col, p_ExpBusqueda, p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getColBusquedaTecnicaPorMemoria ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getColBusquedaTecnicaPorTablas( _
                                                p_ExpBusqueda As ExpedienteBusquedaTecnica, _
                                                    Optional ByRef p_Error As String _
                                                ) As Scripting.Dictionary
    Dim m_Col As Scripting.Dictionary
    
    
    
    On Error GoTo errores
    
    Set m_Col = constructor.getExpedientesCompletos(p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If m_Col Is Nothing Then
        Exit Function
    End If
    Set getColBusquedaTecnicaPorTablas = ColPasanCriterioBusquedaTecnica(m_Col, p_ExpBusqueda, p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getColBusquedaTecnicaPorTablas ha devuelto el error: " & Err.Description
    End If
End Function

Public Function ColPasanCriterioBusqueda( _
                                                    p_Col As Scripting.Dictionary, _
                                                    p_ExpBusqueda As ExpedienteBusqueda, _
                                                    Optional p_ParaAM As EnumSiNo, _
                                                    Optional p_ParaLote As EnumSiNo, _
                                                    Optional p_ParaBasado As EnumSiNo, _
                                                    Optional p_ParaExpediente As EnumSiNo, _
                                                    Optional ByRef p_Error As String _
                                                    ) As Scripting.Dictionary
                                            
    Dim m_ExpC As ExpedienteCompleto
    Dim m_ID As Variant
    
    On Error GoTo errores
    If p_Col Is Nothing Then
        Exit Function
    End If
    For Each m_ID In p_Col
        Set m_ExpC = p_Col(m_ID)
       'If CStr(m_ID) = "402" Then Stop
        If p_ParaAM = EnumSiNo.Sí Then
            If m_ExpC.EsAM <> "Sí" Then
                GoTo siguiente
            End If
        End If
        If p_ParaLote = EnumSiNo.Sí Then
            If m_ExpC.EsLote <> "Sí" Then
                GoTo siguiente
            End If
        End If
        If p_ParaBasado = EnumSiNo.Sí Then
            If m_ExpC.EsBasado <> "Sí" Then
                GoTo siguiente
            End If
        End If
        If p_ParaExpediente = EnumSiNo.Sí Then
            If m_ExpC.EsExpediente <> "Sí" Then
                GoTo siguiente
            End If
        End If
        If p_ExpBusqueda.CodExp <> "" And p_ExpBusqueda.jp <> "Todos" Then
            If m_ExpC.CodExp <> p_ExpBusqueda.CodExp Then
                GoTo siguiente
            End If
        End If
        If p_ExpBusqueda.Comercial <> "" And p_ExpBusqueda.Comercial <> "Todos" Then
            If InStr(1, m_ExpC.CadenaComerciales, p_ExpBusqueda.Comercial) = 0 Then
                GoTo siguiente
            End If
        End If
        If p_ExpBusqueda.ESTADO <> "" And p_ExpBusqueda.ESTADO <> "Todos" Then
            If m_ExpC.ESTADOCalculadoTexto <> p_ExpBusqueda.ESTADO Then
                GoTo siguiente
            End If
        End If
        'If m_ExpC.IDExpediente = "421" Then Stop
        If p_ExpBusqueda.GradoClasificacion <> "" And p_ExpBusqueda.GradoClasificacion <> "Todos" _
            And p_ExpBusqueda.GradoClasificacion <> "" Then
            If p_ExpBusqueda.GradoClasificacion = "Sin Clasificación" Then
                If m_ExpC.Clasificacion = p_ExpBusqueda.GradoClasificacion Then
                    GoTo continua
                End If
                If m_ExpC.Clasificacion = "" Then
                    GoTo continua
                End If
                GoTo siguiente
            Else
                If m_ExpC.Clasificacion <> p_ExpBusqueda.GradoClasificacion Then
                    GoTo siguiente
                End If
            End If
            
        End If
continua:
        If p_ExpBusqueda.IDExpediente <> "" And p_ExpBusqueda.IDExpediente <> "Todos" Then
            If m_ExpC.IDExpediente <> p_ExpBusqueda.IDExpediente Then
                GoTo siguiente
            End If
        End If
        If p_ExpBusqueda.jp <> "" And p_ExpBusqueda.jp <> "Todos" Then
            If InStr(1, m_ExpC.CadenaJPs, p_ExpBusqueda.jp) = 0 Then
                GoTo siguiente
            End If
        End If
        If p_ExpBusqueda.Suministrador <> "" And p_ExpBusqueda.Suministrador <> "Todos" Then
            
            If InStr(1, m_ExpC.CadenaContratistas, p_ExpBusqueda.Suministrador) = 0 Then
                GoTo siguiente
            End If
        End If
        If p_ExpBusqueda.PalabraClave <> "" Then
            If InStr(1, m_ExpC.Titulo, p_ExpBusqueda.PalabraClave) = 0 And _
                InStr(1, m_ExpC.Nemotecnico, p_ExpBusqueda.PalabraClave) = 0 And _
                m_ExpC.CodExp <> p_ExpBusqueda.PalabraClave And _
                m_ExpC.IDExpediente <> p_ExpBusqueda.PalabraClave Then
                GoTo siguiente
            End If
                
        End If
        If p_ExpBusqueda.PECAL = "Sí" Then
            If m_ExpC.CadenaPecal = "" Or m_ExpC.CadenaPecal = "N/A" Then
                GoTo siguiente
            End If
        ElseIf p_ExpBusqueda.PECAL = "No" Then
            If m_ExpC.CadenaPecal <> "" And m_ExpC.CadenaPecal <> "N/A" Then
                GoTo siguiente
            End If
        End If
        
        If p_ExpBusqueda.RAC <> "" And p_ExpBusqueda.RAC <> "Todos" Then
            If InStr(1, m_ExpC.CadenaRACs, p_ExpBusqueda.RAC) = 0 Then
                GoTo siguiente
            End If
        End If
        If p_ExpBusqueda.responsableCalidad <> "" And p_ExpBusqueda.responsableCalidad <> "Todos" Then
            If m_ExpC.responsableCalidad <> p_ExpBusqueda.responsableCalidad Then
                GoTo siguiente
            End If
            
        End If
        If p_ExpBusqueda.responsableSeguridad <> "" And p_ExpBusqueda.responsableSeguridad <> "Todos" Then
            If m_ExpC.responsableSeguridad <> p_ExpBusqueda.responsableSeguridad Then
                GoTo siguiente
            End If
            
        End If
        If p_ExpBusqueda.m_EnumAmbito <> EnumAmbito.Todos And p_ExpBusqueda.m_EnumAmbito <> Empty Then
            If p_ExpBusqueda.m_EnumAmbito = EnumAmbito.Defensa Then
                If m_ExpC.Ambito <> "Defensa" Then
                    GoTo siguiente
                End If
            End If
            If p_ExpBusqueda.m_EnumAmbito = EnumAmbito.Fuera Then
                If m_ExpC.Ambito <> "Fuera" Then
                    GoTo siguiente
                End If
            End If
            If p_ExpBusqueda.m_EnumAmbito = EnumAmbito.HPS Then
                If m_ExpC.Ambito <> "HPS" Then
                    GoTo siguiente
                End If
            End If
        End If
        If p_ExpBusqueda.m_EnumPostAgedoCombo <> Empty And p_ExpBusqueda.m_EnumPostAgedoCombo <> EnumPostAgedoCombo.Todos Then
            If p_ExpBusqueda.m_EnumPostAgedoCombo = EnumPostAgedoCombo.No Then
                If m_ExpC.POSTAGEDO <> "No" Then
                    GoTo siguiente
                End If
            End If
            If p_ExpBusqueda.m_EnumPostAgedoCombo = EnumPostAgedoCombo.Solo Then
                If m_ExpC.POSTAGEDO <> "Sí" Then
                    GoTo siguiente
                End If
            End If
            
        End If
        If ColPasanCriterioBusqueda Is Nothing Then
            Set ColPasanCriterioBusqueda = New Scripting.Dictionary
            ColPasanCriterioBusqueda.CompareMode = TextCompare
        End If
        If Not ColPasanCriterioBusqueda.exists(CStr(m_ExpC.IDExpediente)) Then
            ColPasanCriterioBusqueda.Add m_ExpC.IDExpediente, m_ExpC
        End If
siguiente:
        Set m_ExpC = Nothing
    Next
    
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método ColPasanCriterioBusqueda ha devuelto el error: " & Err.Description
    End If
End Function
Public Function ColPasanCriterioBusquedaTecnica( _
                                                p_Col As Scripting.Dictionary, _
                                                 p_ExpBusqueda As ExpedienteBusquedaTecnica, _
                                                Optional ByRef p_Error As String _
                                                ) As Scripting.Dictionary
                                            
    Dim m_ExpC As ExpedienteCompleto
    Dim m_ID As Variant
    
    On Error GoTo errores
    If p_Col Is Nothing Then
        Exit Function
    End If
    For Each m_ID In p_Col
        Set m_ExpC = p_Col(m_ID)
        'If CStr(m_ID) = "363" Then Stop
        If p_ExpBusqueda.jp <> "" And p_ExpBusqueda.jp <> "Todos" Then
            If InStr(1, m_ExpC.CadenaJPs, p_ExpBusqueda.jp) = 0 Then
                GoTo siguiente
            End If
        End If
        If p_ExpBusqueda.ESTADO <> "" And p_ExpBusqueda.ESTADO <> "Todos" Then
            If m_ExpC.ESTADOCalculadoTexto <> p_ExpBusqueda.ESTADO Then
                GoTo siguiente
            End If
        End If
        If p_ExpBusqueda.JURIDICA <> "" And p_ExpBusqueda.JURIDICA <> "Todos" Then
            If InStr(1, m_ExpC.CadenaContratistas, p_ExpBusqueda.JURIDICA) = 0 Then
                GoTo siguiente
            End If
        End If
        
        
        If p_ExpBusqueda.CodExp <> "" And p_ExpBusqueda.CodExp <> "Todos" Then
            If m_ExpC.CodExp <> p_ExpBusqueda.CodExp Then
                GoTo siguiente
            End If
        End If
        If p_ExpBusqueda.PalabraClave <> "" Then
            If InStr(1, m_ExpC.Titulo, p_ExpBusqueda.PalabraClave) = 0 And _
                InStr(1, m_ExpC.Nemotecnico, p_ExpBusqueda.PalabraClave) = 0 And _
                m_ExpC.CodExp <> p_ExpBusqueda.PalabraClave And _
                m_ExpC.IDExpediente <> p_ExpBusqueda.PalabraClave Then
                GoTo siguiente
            End If
        End If
        If ColPasanCriterioBusquedaTecnica Is Nothing Then
            Set ColPasanCriterioBusquedaTecnica = New Scripting.Dictionary
            ColPasanCriterioBusquedaTecnica.CompareMode = TextCompare
        End If
        If Not ColPasanCriterioBusquedaTecnica.exists(CStr(m_ExpC.IDExpediente)) Then
            ColPasanCriterioBusquedaTecnica.Add m_ExpC.IDExpediente, m_ExpC
        End If
siguiente:
        Set m_ExpC = Nothing
    Next
    
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método ColPasanCriterioBusquedaTecnica ha devuelto el error: " & Err.Description
    End If
End Function

Public Function getExpBusqueda( _
                                   p_Form As Form, _
                                   Optional ByRef p_Error As String _
                                   ) As ExpedienteBusqueda
                            
    Dim m_ExpBusqueda As ExpedienteBusqueda
    On Error GoTo errores
    Set m_ExpBusqueda = New ExpedienteBusqueda
    With m_ExpBusqueda
        .PalabraClave = Nz(p_Form.PalabraClave, "")
        .ESTADO = Nz(p_Form.ESTADO.Column(1), "")
        .Suministrador = Nz(p_Form.Suministrador, "")
        If p_Form.MarcoPecal = 1 Then
            .PECAL = "Sí"
        ElseIf p_Form.MarcoPecal = 2 Then
            .PECAL = "No"
        Else
            .PECAL = "Todos"
        End If
        If p_Form.MarcoSeguridad = 1 Then
            .GradoClasificacion = "Confidencial"
        ElseIf p_Form.MarcoSeguridad = 2 Then
            .GradoClasificacion = "Reservado"
        ElseIf p_Form.MarcoSeguridad = 3 Then
            .GradoClasificacion = "Sin Clasificación"
        Else
            .GradoClasificacion = "Todos"
        End If
        If p_Form.Ambito = "Todos" Then
            m_EnumAmbitoCombo = EnumAmbito.Todos
        ElseIf p_Form.Ambito = "Defensa" Then
            m_EnumAmbitoCombo = EnumAmbito.Defensa
        ElseIf p_Form.Ambito = "Fuera" Then
            m_EnumAmbitoCombo = EnumAmbito.Fuera
        ElseIf p_Form.Ambito = "HPS" Then
            m_EnumAmbitoCombo = EnumAmbito.HPS
        End If
        .m_EnumAmbito = m_EnumAmbitoCombo
        .CodExp = Nz(p_Form.CodExp, "")
        .IDExpediente = Nz(p_Form.IDExpediente, "")
        If p_Form.MarcoPostAgedo = 1 Then
            m_EnumPostAgedoCombo = EnumPostAgedoCombo.Todos
            
        ElseIf p_Form.MarcoPostAgedo = 2 Then
            m_EnumPostAgedoCombo = EnumPostAgedoCombo.No
        ElseIf p_Form.MarcoPostAgedo = 3 Then
            m_EnumPostAgedoCombo = EnumPostAgedoCombo.Solo
        End If
        .m_EnumPostAgedoCombo = m_EnumPostAgedoCombo
        
        If p_Form.MarcoRespSeguridad = 1 Then
            .responsableSeguridad = "Martina Torralba Rodríguez"
        ElseIf p_Form.MarcoRespSeguridad = 2 Then
            .responsableSeguridad = "Esperanza del Álamo Arriba"
        ElseIf p_Form.MarcoRespSeguridad = 3 Then
            .responsableSeguridad = "Almudena Cárdenas Velloso"
        Else
            .responsableSeguridad = "Todos"
        End If
        
        If p_Form.MarcoCalidad = 1 Then
            .responsableCalidad = "Ana Rubio Canales"
        ElseIf p_Form.MarcoCalidad = 2 Then
            .responsableCalidad = "Beatriz Noval Gutiérrez"
        ElseIf p_Form.MarcoCalidad = 3 Then
            .responsableCalidad = "Sergio García Montalvo"
        ElseIf p_Form.MarcoCalidad = 4 Then
            .responsableCalidad = "Natalia Casán García"
        ElseIf p_Form.MarcoCalidad = 5 Then
            .responsableCalidad = "Mario Martín Abad"
        Else
            .responsableCalidad = "Todos"
        End If
        
        .Comercial = Nz(p_Form.Comercial, "")
        .jp = Nz(p_Form.jp, "")
        .RAC = Nz(p_Form.RAC, "")
    End With
    
    
    Set getExpBusqueda = m_ExpBusqueda
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getExpBusqueda ha devuelto el error: " & Err.Description
    End If
End Function

Public Function getColBusquedaParaCambio( _
                                        p_PalabraClave As String, _
                                        Optional ByRef p_Error As String _
                                        ) As Scripting.Dictionary
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_expediente As Expediente
    
    
    
    On Error GoTo errores
    m_SQL = "SELECT * " & _
            "FROM TbExpedientes " & _
            "WHERE CodExp Like '*" & p_PalabraClave & "*' OR " & _
            "Titulo Like '*" & p_PalabraClave & "*' OR " & _
            "Nemotecnico Like '*" & p_PalabraClave & "*';"
    
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    If rcdDatos.EOF Then
        rcdDatos.Close
        Set rcdDatos = Nothing
        Exit Function
    End If
    With rcdDatos
        .MoveFirst
        Do While Not .EOF
            Set m_expediente = New Expediente
            For Each m_Campo In m_expediente.ColCampos
                m_expediente.SetPropiedad m_Campo, Nz(.Fields(m_Campo).value, ""), p_Error
                 If p_Error <> "" Then
                     Err.Raise 1000
                 End If
             Next
             If getColBusquedaParaCambio Is Nothing Then
                Set getColBusquedaParaCambio = New Scripting.Dictionary
                getColBusquedaParaCambio.CompareMode = TextCompare
             End If
             If Not getColBusquedaParaCambio.exists(CStr(m_expediente.IDExpediente)) Then
                getColBusquedaParaCambio.Add CStr(m_expediente.IDExpediente), m_expediente
             End If
            .MoveNext
        Loop
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getColBusquedaParaCambio ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getExpTecnicoBusqueda( _
                                   p_Form As Form, _
                                   Optional ByRef p_Error As String _
                                   ) As ExpedienteBusquedaTecnica
                            
    Dim m_ExpBusqueda As ExpedienteBusquedaTecnica
    On Error GoTo errores
    Set m_ExpBusqueda = New ExpedienteBusquedaTecnica
    With m_ExpBusqueda
        .PalabraClave = Nz(p_Form.PalabraClave, "")
        .ESTADO = Nz(p_Form.ESTADO.Column(1), "")
        .JURIDICA = Nz(p_Form.JURIDICA, "")
        
        .CodExp = Nz(p_Form.CodExp, "")
        
        .jp = Nz(p_Form.jp, "")
        
    End With
    
    
    Set getExpTecnicoBusqueda = m_ExpBusqueda
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getExpTecnicoBusqueda ha devuelto el error: " & Err.Description
    End If
End Function
Public Function HaHabidoCambiosBusqueda( _
                                                Optional p_ExpBusqueda As ExpedienteBusqueda, _
                                                Optional p_ExpBusquedaAnterior As ExpedienteBusqueda, _
                                                Optional ByRef p_Error As String _
                                                ) As EnumSiNo
                                 
    
    On Error GoTo errores
    If p_ExpBusqueda Is Nothing Then
        If p_ExpBusquedaAnterior Is Nothing Then
            HaHabidoCambiosBusqueda = EnumSiNo.No
        Else
            HaHabidoCambiosBusqueda = EnumSiNo.Sí
        End If
        Exit Function
    End If
    If p_ExpBusquedaAnterior Is Nothing Then
        If p_ExpBusqueda Is Nothing Then
            HaHabidoCambiosBusqueda = EnumSiNo.No
        Else
            HaHabidoCambiosBusqueda = EnumSiNo.Sí
        End If
        Exit Function
    End If
    With p_ExpBusqueda
        If .IDExpediente <> p_ExpBusquedaAnterior.IDExpediente Then
            HaHabidoCambiosBusqueda = EnumSiNo.Sí
            Exit Function
        End If
        If .PalabraClave <> p_ExpBusquedaAnterior.PalabraClave Then
            HaHabidoCambiosBusqueda = EnumSiNo.Sí
            Exit Function
        End If
        If .ESTADO <> p_ExpBusquedaAnterior.ESTADO Then
            HaHabidoCambiosBusqueda = EnumSiNo.Sí
            Exit Function
        End If
        If .Suministrador <> p_ExpBusquedaAnterior.Suministrador Then
            HaHabidoCambiosBusqueda = EnumSiNo.Sí
            Exit Function
        End If
        If .PECAL <> p_ExpBusquedaAnterior.PECAL Then
            HaHabidoCambiosBusqueda = EnumSiNo.Sí
            Exit Function
        End If
        If .GradoClasificacion <> p_ExpBusquedaAnterior.GradoClasificacion Then
            HaHabidoCambiosBusqueda = EnumSiNo.Sí
            Exit Function
        End If
        If .m_EnumAmbito <> p_ExpBusquedaAnterior.m_EnumAmbito Then
            HaHabidoCambiosBusqueda = EnumSiNo.Sí
            Exit Function
        End If
        If .CodExp <> p_ExpBusquedaAnterior.CodExp Then
            HaHabidoCambiosBusqueda = EnumSiNo.Sí
            Exit Function
        End If
        If .m_EnumPostAgedoCombo <> p_ExpBusquedaAnterior.m_EnumPostAgedoCombo Then
            HaHabidoCambiosBusqueda = EnumSiNo.Sí
            Exit Function
        End If
        If .responsableCalidad <> p_ExpBusquedaAnterior.responsableCalidad Then
            HaHabidoCambiosBusqueda = EnumSiNo.Sí
            Exit Function
        End If
        If .responsableSeguridad <> p_ExpBusquedaAnterior.responsableSeguridad Then
            HaHabidoCambiosBusqueda = EnumSiNo.Sí
            Exit Function
        End If
        If .Comercial <> p_ExpBusquedaAnterior.Comercial Then
            HaHabidoCambiosBusqueda = EnumSiNo.Sí
            Exit Function
        End If
        If .jp <> p_ExpBusquedaAnterior.jp Then
            HaHabidoCambiosBusqueda = EnumSiNo.Sí
            Exit Function
        End If
        If .RAC <> p_ExpBusquedaAnterior.RAC Then
            HaHabidoCambiosBusqueda = EnumSiNo.Sí
            Exit Function
        End If
        
    End With
    HaHabidoCambiosBusqueda = EnumSiNo.No
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método HaHabidoCambiosBusqueda ha devuelto el error: " & Err.Description
    End If
End Function
Public Function HaHabidoCambiosBusquedaTecnica( _
                                                Optional p_ExpBusqueda As ExpedienteBusquedaTecnica, _
                                                Optional p_ExpBusquedaAnterior As ExpedienteBusquedaTecnica, _
                                                Optional ByRef p_Error As String _
                                                ) As EnumSiNo
                                 
    
    On Error GoTo errores
    If p_ExpBusqueda Is Nothing Then
        If p_ExpBusquedaAnterior Is Nothing Then
            HaHabidoCambiosBusquedaTecnica = EnumSiNo.No
        Else
            HaHabidoCambiosBusquedaTecnica = EnumSiNo.Sí
        End If
        Exit Function
    End If
    If p_ExpBusquedaAnterior Is Nothing Then
        If p_ExpBusqueda Is Nothing Then
            HaHabidoCambiosBusquedaTecnica = EnumSiNo.No
        Else
            HaHabidoCambiosBusquedaTecnica = EnumSiNo.Sí
        End If
        Exit Function
    End If
    With p_ExpBusqueda
        
        If .PalabraClave <> p_ExpBusquedaAnterior.PalabraClave Then
            HaHabidoCambiosBusquedaTecnica = EnumSiNo.Sí
            Exit Function
        End If
        If .ESTADO <> p_ExpBusquedaAnterior.ESTADO Then
            HaHabidoCambiosBusquedaTecnica = EnumSiNo.Sí
            Exit Function
        End If
        If .JURIDICA <> p_ExpBusquedaAnterior.JURIDICA Then
            HaHabidoCambiosBusquedaTecnica = EnumSiNo.Sí
            Exit Function
        End If
        
        If .CodExp <> p_ExpBusquedaAnterior.CodExp Then
            HaHabidoCambiosBusquedaTecnica = EnumSiNo.Sí
            Exit Function
        End If
        
        If .jp <> p_ExpBusquedaAnterior.jp Then
            HaHabidoCambiosBusquedaTecnica = EnumSiNo.Sí
            Exit Function
        End If
        
    End With
    HaHabidoCambiosBusquedaTecnica = EnumSiNo.No
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método HaHabidoCambiosBusquedaTecnica ha devuelto el error: " & Err.Description
    End If
End Function
Public Function setExpBusqueda( _
                                   p_Form As Form, _
                                   Optional p_ExpBusqueda As ExpedienteBusqueda, _
                                   Optional ByRef p_Error As String _
                                   ) As String
                            
    
    On Error GoTo errores
    If p_ExpBusqueda Is Nothing Then
        With p_Form
            .PalabraClave = Null
            .ESTADO = "0"
            .Suministrador = "Todos"
            .MarcoPecal = 0
            .MarcoSeguridad = 0
            .MarcoPostAgedo = 3
            If m_EnumAmbitoCombo = EnumAmbito.Todos Then
                .Ambito = "Todos"
            ElseIf m_EnumAmbitoCombo = EnumAmbito.Defensa Then
                .Ambito = "Defensa"
            ElseIf m_EnumAmbitoCombo = EnumAmbito.Fuera Then
                .Ambito = "Fuera"
            ElseIf m_EnumAmbitoCombo = EnumAmbito.HPS Then
                .Ambito = "HPS"
            Else
                .Ambito = "Todos"
            End If
            .CodExp = "Todos"
            .IDExpediente = "Todos"
            .MarcoCalidad = 0
            
            .Comercial = "Todos"
            .jp = "Todos"
            .RAC = "Todos"
            
        End With
        Exit Function
    End If
    With p_ExpBusqueda
        If .PalabraClave = "" Then
            p_Form.PalabraClave = Null
        Else
            p_Form.PalabraClave = .PalabraClave
        End If
        If .ESTADO = "" Or .ESTADO = "Todos" Then
             p_Form.ESTADO = "0"
        Else
            If m_ObjEntorno.ColEstadosTexto.exists(.ESTADO) Then
                p_Form.ESTADO = m_ObjEntorno.ColEstadosTexto(.ESTADO)
            Else
                p_Form.ESTADO = Null
            End If
        End If
        If .Suministrador = "" Or .Suministrador = "Todos" Then
            p_Form.Suministrador = Null
        Else
            p_Form.Suministrador = .Suministrador
        End If
        If .PECAL = "Sí" Then
            p_Form.MarcoPecal = 1
        ElseIf .PECAL = "No" Then
            p_Form.MarcoPecal = 2
        Else
            p_Form.MarcoPecal = 0
        End If
        If .GradoClasificacion = "Confidencial" Then
            p_Form.MarcoSeguridad = 1
        ElseIf .GradoClasificacion = "Reservado" Then
            p_Form.MarcoSeguridad = 2
        ElseIf .GradoClasificacion = "SinClasificacion" Then
            p_Form.MarcoSeguridad = 3
        Else
            p_Form.MarcoSeguridad = 0
        End If
        If m_EnumAmbitoCombo = EnumAmbito.Todos Then
            p_Form.MarcoLugar = 1
        ElseIf m_EnumAmbitoCombo = EnumAmbito.Defensa Then
            p_Form.MarcoLugar = 2
        ElseIf m_EnumAmbitoCombo = EnumAmbito.Fuera Then
            p_Form.MarcoLugar = 3
        End If
        If .CodExp = "" Or .CodExp = "Todos" Then
            p_Form.CodExp = Null
        Else
            p_Form.CodExp = .CodExp
        End If
        If m_EnumPostAgedoCombo = EnumPostAgedoCombo.Todos Then
            p_Form.MarcoPostAgedo = 1
        ElseIf m_EnumPostAgedoCombo = EnumPostAgedoCombo.No Then
            p_Form.MarcoPostAgedo = 2
        ElseIf m_EnumPostAgedoCombo = EnumPostAgedoCombo.Solo Then
            p_Form.MarcoPostAgedo = 3
        End If
        If .responsableSeguridad = "Martina Torralba Rodríguez" Then
            p_Form.MarcoRespSeguridad = 1
        ElseIf .responsableSeguridad = "Esperanza del Álamo Arriba" Then
            p_Form.MarcoRespSeguridad = 2
        ElseIf .responsableSeguridad = "Almudena Cárdenas Velloso" Then
            p_Form.MarcoRespSeguridad = 3
       
        Else
            p_Form.MarcoRespSeguridad = 0
        End If
        
        If .responsableCalidad = "Ana Rubio Canales" Then
            p_Form.MarcoCalidad = 1
        ElseIf .responsableCalidad = "Beatriz Noval Gutiérrez" Then
            p_Form.MarcoCalidad = 2
        ElseIf .responsableCalidad = "Sergio García Montalvo" Then
            p_Form.MarcoCalidad = 3
        ElseIf .responsableCalidad = "Natalia Casán García" Then
            p_Form.MarcoCalidad = 4
         ElseIf .responsableCalidad = "Mario Martín Abad" Then
            p_Form.MarcoCalidad = 5
        Else
            p_Form.MarcoCalidad = 0
        End If
        If .Comercial = "" Or .Comercial = "Todos" Then
            p_Form.Comercial = Null
        Else
            p_Form.Comercial = .Comercial
        End If
        If .jp = "" Or .jp = "Todos" Then
            p_Form.jp = Null
        Else
            p_Form.jp = .jp
        End If
        If .RAC = "" Or .RAC = "Todos" Then
            p_Form.RAC = Null
        Else
            p_Form.RAC = .RAC
        End If
        
        
    End With
    
    
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método setExpBusqueda ha devuelto el error: " & Err.Description
    End If
End Function
Public Function setExpBusquedaTecnica( _
                                   p_Form As Form, _
                                   Optional p_ExpBusquedaTecnica As ExpedienteBusquedaTecnica, _
                                   Optional ByRef p_Error As String _
                                   ) As String
                            
    
    On Error GoTo errores
    If p_ExpBusquedaTecnica Is Nothing Then
        With p_Form
            .PalabraClave = Null
            .ESTADO = "0"
            .JURIDICA = "Todos"
            .CodExp = "Todos"
            .jp = "Todos"
        End With
        Exit Function
    End If
    With p_ExpBusquedaTecnica
        If .PalabraClave = "" Then
            p_Form.PalabraClave = Null
        Else
            p_Form.PalabraClave = .PalabraClave
        End If
        If .ESTADO = "" Or .ESTADO = "Todos" Then
            p_Form.ESTADO = Null
        Else
            p_Form.ESTADO = .ESTADO
        End If
        If .JURIDICA = "" Or .JURIDICA = "Todos" Then
            p_Form.JURIDICA = Null
        Else
            p_Form.JURIDICA = .JURIDICA
        End If
        If .CodExp = "" Or .CodExp = "Todos" Then
            p_Form.CodExp = Null
        Else
            p_Form.CodExp = .CodExp
        End If
        If .jp = "" Or .jp = "Todos" Then
            p_Form.jp = Null
        Else
            p_Form.jp = .jp
        End If
    End With
    
    
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método setExpBusquedaTecnica ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getCadenaPecal( _
                                Optional p_IDExpediente As String, _
                                Optional p_Expediente As Expediente, _
                                Optional p_Error As String _
                                ) As String
    
    Dim m_Pecal As PECAL
    Dim m_ID As Variant
    Dim m_Cadena As String
    On Error GoTo errores
    If p_Expediente Is Nothing Then
        Set p_Expediente = constructor.getExpediente(p_IDExpediente:=p_IDExpediente, p_Error:=p_Error)
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        If p_Expediente Is Nothing Then
            Exit Function
        End If
    End If
    If p_Expediente.PECALES Is Nothing Then
        Exit Function
    End If
    For Each m_ID In p_Expediente.PECALES
        Set m_Pecal = p_Expediente.PECALES(m_ID)

        If m_Cadena = "" Then
            m_Cadena = m_Pecal.PECAL
        Else
            m_Cadena = m_Cadena & "|" & m_Pecal.PECAL
        End If
siguiente:
        Set m_Pecal = Nothing
    Next
    getCadenaPecal = m_Cadena
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getCadenaPecal ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
    End If
End Function



Public Function getSQLUltimoDerivado( _
                                        Optional p_ID As String, _
                                        Optional p_Expediente As Expediente, _
                                        Optional ByRef p_Error As String _
                                        ) As String
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_SQLLimite As String
    Dim m_OrdinalMaximo As String
    Dim m_IDExpedienteMaximo As String
    Dim m_IDPadre As String
    Dim m_Tipo As EnumTipoExpediente
    
    On Error GoTo errores
    
    If p_ID = "" And p_Expediente Is Nothing Then
        Exit Function
    End If
    If p_Expediente Is Nothing Then
        Set p_Expediente = constructor.getExpediente(p_IDExpediente:=p_ID, p_Error:=p_Error)
        If p_Error <> "" Then
            Err.Raise 100
        End If
    End If
    If p_Expediente Is Nothing Then
        Exit Function
    End If
    With p_Expediente
        If .Lotes Is Nothing And .Basados Is Nothing Then
            If .ExpedientePadre Is Nothing Then
                getSQLUltimoDerivado = "SELECT * " & _
                                "FROM TbExpedientes " & _
                                "WHERE IDExpediente=" & .IDExpediente & ";"
                 Exit Function
            End If
            m_IDPadre = .IDExpedientePadre
           
        End If
        If m_IDPadre = "" Then
            getSQLUltimoDerivado = "SELECT * " & _
                                    "FROM TbExpedientes " & _
                                    "WHERE IDExpediente=" & .IDExpediente & ";"
            Exit Function
           
        End If
         m_SQL = "SELECT Max(Ordinal) AS MáxDeOrdinal " & _
                "FROM TbExpedientes " & _
                "WHERE IDExpedientePadre=" & m_IDPadre & ";"
        Set rcdDatos = getdb().OpenRecordset(m_SQL)
        If Not rcdDatos.EOF Then
            m_OrdinalMaximo = Nz(rcdDatos.Fields("MáxDeOrdinal"), "")
            rcdDatos.Close
            Set rcdDatos = Nothing
            If IsNumeric(m_OrdinalMaximo) Then
                getSQLUltimoDerivado = "SELECT * " & _
                                        "FROM TbExpedientes " & _
                                        "WHERE IDExpedientePadre=" & m_IDPadre & _
                                        " AND Ordinal='" & m_OrdinalMaximo & "';"
                Exit Function
            End If
        End If
        m_SQL = "SELECT Max(IDExpediente) AS MáxDeIDExpediente " & _
                "FROM TbExpedientes " & _
                "WHERE IDExpedientePadre=" & m_IDPadre & ";"
        Set rcdDatos = getdb().OpenRecordset(m_SQL)
        If Not rcdDatos.EOF Then
            m_IDExpedienteMaximo = Nz(rcdDatos.Fields("MáxDeIDExpediente"), "")
            If IsNumeric(m_IDExpedienteMaximo) Then
                getSQLUltimoDerivado = "SELECT * " & _
                                        "FROM TbExpedientes " & _
                                        "WHERE IDExpediente=" & m_IDExpedienteMaximo & ";"
                Exit Function
            End If
        End If
    End With
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getSQLUltimoDerivado ha devuelto el error: " & Err.Description
    End If
End Function


Public Function GenerarConsultaExpedientes( _
                                            p_ColCampos As Scripting.Dictionary, _
                                            Optional p_ColAM As Scripting.Dictionary, _
                                            Optional p_ColLotes As Scripting.Dictionary, _
                                            Optional p_ColBasados As Scripting.Dictionary, _
                                            Optional p_ColTecnica As Scripting.Dictionary, _
                                            Optional p_IncluirDerivados As Boolean = True, _
                                            Optional ByRef p_Error As String _
                                            ) As String
   
    Dim m_ID As Variant
    Dim m_ColExpUsados As Scripting.Dictionary
    Dim m_ExpC As ExpedienteCompleto
    Dim m_Campo As Variant
    Dim m_NombreCampo As String
    Dim intFila As Integer
    Dim columna As Integer
    Dim m_NombreArchivo As String
    Dim m_URLExcel As String
    Dim appExcel As Excel.Application
    Dim wbLibro As Excel.Workbook
    Dim wbHoja As Excel.Worksheet
    On Error GoTo errores
    
    If p_ColCampos Is Nothing Then
        Exit Function
    End If
    If p_ColAM Is Nothing And p_ColLotes Is Nothing And p_ColBasados Is Nothing And p_ColTecnica Is Nothing Then
        Exit Function
    End If
    If Not p_ColTecnica Is Nothing Then
        Set p_ColBasados = p_ColTecnica
    End If

    MostrarPopupProgreso "Exportando a Excel", "Preparando consulta..."
    AnimarProgresoIndefinido

    Avance "Abriendo excel para rellenar ..."
    m_NombreArchivo = fso.GetTempName & ".xlsx"
    m_URLExcel = m_ObjEntorno.URLDirectorioLocal & m_NombreArchivo
    If fso.FileExists(m_URLExcel) Then
        If FicheroAbierto(m_URLExcel) Then
            p_Error = "Tiene una consulta abierta"
            Err.Raise 1000
        End If
        fso.DeleteFile m_URLExcel, True
    End If
    Set appExcel = New Excel.Application
    appExcel.Visible = False
    Set wbLibro = appExcel.Workbooks.Add
    wbLibro.SaveAs m_URLExcel
    Set wbHoja = wbLibro.Worksheets(1)
    intFila = 1
    columna = 0
    'CABECERA
    With wbHoja
        For Each m_Campo In p_ColCampos
            m_NombreCampo = p_ColCampos(m_Campo)
            columna = columna + 1
            .Cells(intFila, columna).value = m_NombreCampo
        Next

    End With
    ' Aquí pasamos el parámetro p_IncluirDerivados a RellenarLinea
    If Not p_ColAM Is Nothing Then
        For Each m_ID In p_ColAM
            ActualizarEstadoPopup "Procesando lote AM: " & m_ID
            DoEvents
            Set m_ExpC = p_ColAM(m_ID)
            RellenarLinea p_ColCampos, m_ColExpUsados, wbHoja, intFila, m_ExpC, p_IncluirDerivados, p_Error
            If p_Error <> "" Then
                Err.Raise 1000
            End If
            Set m_ExpC = Nothing
        Next
    End If
    If Not p_ColLotes Is Nothing Then
        For Each m_ID In p_ColLotes
            ActualizarEstadoPopup "Procesando lote Lotes: " & m_ID
            DoEvents
            Set m_ExpC = p_ColLotes(m_ID)
            RellenarLinea p_ColCampos, m_ColExpUsados, wbHoja, intFila, m_ExpC, p_IncluirDerivados, p_Error
            If p_Error <> "" Then
                Err.Raise 1000
            End If
            Set m_ExpC = Nothing
        Next
    End If
    If Not p_ColBasados Is Nothing Then
        For Each m_ID In p_ColBasados
            ActualizarEstadoPopup "Procesando lote Basados: " & m_ID
            DoEvents
            Set m_ExpC = p_ColBasados(m_ID)
            RellenarLinea p_ColCampos, m_ColExpUsados, wbHoja, intFila, m_ExpC, p_IncluirDerivados, p_Error
            If p_Error <> "" Then
                Err.Raise 1000
            End If
            Set m_ExpC = Nothing
        Next
    End If
    AjustarCeldas p_Hoja:=wbHoja, p_Error:=p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    ConvertirATabla p_Hoja:=wbHoja, p_Error:=p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    For columna = 1 To p_ColCampos.Count
        With wbHoja
            .Columns(columna).EntireColumn.AutoFit
        End With
    Next
    wbLibro.Close True
    Set wbLibro = Nothing
    appExcel.Quit
    Set appExcel = Nothing
    
    GenerarConsultaExpedientes = m_URLExcel
    CerrarPopupProgreso
    Exit Function
errores:
    CerrarPopupProgreso
    If Err.Number <> 1000 Then
        p_Error = "El método Consultas.GenerarConsultaExpedientes ha producido el error nº: " & Err.Number & vbCrLf & "Detalle: " & Err.Description
    End If

     If Not wbLibro Is Nothing Then
        wbLibro.Close False
        Set wbLibro = Nothing
    End If
    If Not appExcel Is Nothing Then
        appExcel.Quit
        Set appExcel = Nothing
    End If
    
End Function

Public Function RellenarLinea( _
                                p_ColCampos As Scripting.Dictionary, _
                                ByRef m_ColExpUsados As Scripting.Dictionary, _
                                ByRef wbHoja As Excel.Worksheet, _
                                ByRef intFila As Integer, _
                                p_ExpC As ExpedienteCompleto, _
                                Optional p_IncluirDerivados As Boolean = True, _
                                Optional ByRef p_Error As String _
                                ) As String
   
    Dim m_ID As Variant
    Dim m_ExpCDerivado As ExpedienteCompleto
    Dim m_Campo As Variant
    Dim m_NombreCampo As String
    Dim columna As Integer
    Dim m_Valor As String
    On Error GoTo errores
    
    If p_ColCampos Is Nothing Then
        Exit Function
    End If
    If Not m_ColExpUsados Is Nothing Then
        If m_ColExpUsados.exists(CStr(p_ExpC.IDExpediente)) Then
            Exit Function
        End If
    End If
    intFila = intFila + 1
   
    Avance p_ExpC.IDExpediente & "..........." & p_ExpC.Nemotecnico
    
    VBA.DoEvents
    Debug.Print p_ExpC.Nemotecnico
    With wbHoja
        columna = 0
        For Each m_Campo In p_ColCampos
           ' If CStr(m_Campo) = "ResponsableSeguridad" Then Stop
            m_Valor = p_ExpC.getPropiedad(m_Campo, p_Error)
            If p_Error <> "" Then
                Err.Raise 1000
            End If
            If m_Campo = "Estado" Then
                m_Valor = p_ExpC.ESTADOCalculadoTexto
            End If
            If CStr(m_Campo) = "ImporteContratacion" And IsNumeric(m_Valor) Then
                m_Valor = Replace(m_Valor, ",", ".")
            ElseIf InStr(1, m_Campo, "Fecha") <> 0 And IsDate(m_Valor) Then
                m_Valor = Format(m_Valor, "mm/dd/yyyy")
            ElseIf CStr(m_Campo) = "ResponsableSeguridad" Then
                If m_Valor = "0" Or m_Valor = "" Then
                    m_Valor = "N/A"
                End If
            End If
            columna = columna + 1
            If m_Valor <> "" Then
                .Cells(intFila, columna).value = m_Valor
            End If
        Next
      
    End With
    If m_ColExpUsados Is Nothing Then
        Set m_ColExpUsados = New Scripting.Dictionary
        m_ColExpUsados.CompareMode = TextCompare
    End If
    If Not m_ColExpUsados.exists(CStr(p_ExpC.IDExpediente)) Then
        m_ColExpUsados.Add CStr(p_ExpC.IDExpediente), p_ExpC.IDExpediente
    End If
    
    ' BLOQUE MODIFICADO: Controlamos la recursividad con p_IncluirDerivados
    If p_IncluirDerivados Then
        If Not p_ExpC.Derivados Is Nothing Then
            For Each m_ID In p_ExpC.Derivados
                Set m_ExpCDerivado = p_ExpC.Derivados(m_ID)
                
                ' Llamada recursiva propagando el valor True
                RellenarLinea = RellenarLinea(p_ColCampos, m_ColExpUsados, wbHoja, intFila, m_ExpCDerivado, p_IncluirDerivados, p_Error)
                If p_Error <> "" Then
                    Err.Raise 1000
                End If
                
                Set m_ExpCDerivado = Nothing
            Next
        End If
    End If
   
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método RellenarLinea ha producido el error nº: " & Err.Number & vbCrLf & "Detalle: " & Err.Description
    End If
    
End Function
Public Function ConvertirATabla( _
                                        p_Hoja As Excel.Worksheet, _
                                        Optional ByRef p_Error As String _
                                        ) As String
    Dim m_Rango As Excel.Range
    On Error GoTo errores
    Set m_Rango = p_Hoja.Range("A1").CurrentRegion
    p_Hoja.Application.CutCopyMode = False
    p_Hoja.ListObjects.Add(xlSrcRange, m_Rango, , xlYes).Name = "Tabla1"
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método ConvertirATabla ha producido el error nº: " & Err.Number & vbCrLf & "Detalle: " & Err.Description
    End If
End Function
Public Function AjustarCeldas( _
                                p_Hoja As Excel.Worksheet, _
                                Optional ByRef p_Error As String _
                                ) As String
    
    On Error GoTo errores
    
   
    With p_Hoja.Cells
        .HorizontalAlignment = xlGeneral
        .VerticalAlignment = xlBottom
        .WrapText = False
        .Orientation = 0
        .AddIndent = False
        .IndentLevel = 0
        .ShrinkToFit = False
        .ReadingOrder = xlContext
        .MergeCells = False
    End With
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método AjustarCeldas ha producido el error nº: " & Err.Number & vbCrLf & "Detalle: " & Err.Description
    End If
End Function

Public Function getExpedienteEsDerivable( _
                                            p_Tipo As EnumTipoExpediente, _
                                            Optional ByRef p_Error As String _
                                            ) As EnumSiNo
                                            
    On Error GoTo errores
    If p_Tipo = Empty Then
        getExpedienteEsDerivable = EnumSiNo.No
        Exit Function
    End If
    
    If p_Tipo = EnumTipoExpediente.AM Or p_Tipo = EnumTipoExpediente.Lote Then
        getExpedienteEsDerivable = EnumSiNo.Sí
    Else
        getExpedienteEsDerivable = EnumSiNo.No
    End If
   
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getExpedienteEsDerivable ha producido el error : " & vbNewLine & Err.Description
    End If
End Function
Public Function ExpedienteEnAGEDYS( _
                                    p_IDExpediente As String, _
                                    Optional ByRef p_Error As String _
                                    ) As EnumSiNo
                                            
    On Error GoTo errores
    If p_IDExpediente = "" Then
        Exit Function
    End If
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método ExpedienteEnAGEDYS ha producido el error : " & vbNewLine & Err.Description
    End If
End Function

Public Function EstablecerDTODeExpediente( _
                                            p_Expediente As Expediente, _
                                            Optional p_ParaCopia As EnumSiNo = EnumSiNo.No, _
                                            Optional ByRef p_Error As String _
                                            ) As ExpedienteDTO

    Dim m_ExpDTO As ExpedienteDTO
    
    ' Variables para cargar el árbol
    Dim rs As DAO.Recordset
    Dim itemSum As ExpedienteSuministrador
    
    On Error GoTo errores
    
    Set m_ExpDTO = New ExpedienteDTO
    
    ' Cargar el objeto Expediente principal
    Set m_ExpDTO.Expediente = constructor.getExpediente(p_IDExpediente:=p_Expediente.IDExpediente, p_Error:=p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    
    With m_ExpDTO
        If p_ParaCopia <> EnumSiNo.Sí Then
            Set .ColAnexos = p_Expediente.Anexos
            Set .ColAnualidades = p_Expediente.Anualidades
        End If
        
        ' --- CARGA DE COLECCIONES ESTÁNDAR ---
        Set .ColCodCompras = p_Expediente.CodigosComprasOperaciones
        Set .ColComerciales = p_Expediente.Comerciales
        Set .ColCPVs = p_Expediente.CPVs
        
        ' --- CORRECCIÓN: CARGA DE SUMINISTRADORES (ÁRBOL UNIFICADO) ---
        ' Eliminamos las asignaciones a .ColContratistas, etc. porque ya no existen en el DTO.
        ' En su lugar, cargamos la estructura jerárquica desde el repositorio.
        
        Set .ColArbolSuministradores = New Scripting.Dictionary
        .ColArbolSuministradores.CompareMode = TextCompare
        
        ' Usamos el repositorio para obtener los datos crudos del árbol
        Set rs = ExpedienteSuministradorRepositorio.getDatosArbol(p_Expediente.IDExpediente)
        
        If Not rs.EOF Then
            Do While Not rs.EOF
                Set itemSum = New ExpedienteSuministrador
                With itemSum
                    .IDExpedienteSuministrador = CStr(rs!IDExpedienteSuministrador)
                    .IDExpediente = p_Expediente.IDExpediente
                    .IDSuministrador = CStr(rs!IDSuministrador)
                    .IdPadre = rs!IdPadre ' Variant (acepta Null)
                    .ContratistaPrincipal = Nz(rs!ContratistaPrincipal, "No")
                    .SubContratista = Nz(rs!SubContratista, "No")
                    .Descripcon = Nz(rs!Descripcon, "")
                    .Tag = .IDExpedienteSuministrador ' Guardamos el ID real como Tag por coherencia
                End With
                
                ' Añadimos al diccionario del DTO usando el ID de relación como clave
                .ColArbolSuministradores.Add CStr(itemSum.IDExpedienteSuministrador), itemSum
                
                rs.MoveNext
            Loop
        End If
        rs.Close
        Set rs = Nothing
        ' -----------------------------------------------------------

        Set .ColLugaresEjecucion = p_Expediente.LugaresEjecucion
        Set .ColPECALES = p_Expediente.PECALES
        Set .ColRACs = p_Expediente.RACs
        Set .ColResponsables = p_Expediente.Responsables
        Set .ColModificados = p_Expediente.Modificados
        
    End With
    
    Set EstablecerDTODeExpediente = m_ExpDTO
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método EstablecerDTODeExpediente ha producido el error : " & vbNewLine & Err.Description
    End If
End Function
Public Function Seleccionar( _
                            p_EsArchivo As Boolean, _
                            Optional p_Titulo As String, _
                            Optional ByRef p_Error As String _
                            ) As String
    
    Dim m_ObjfDialog As Object
    Dim varFile As Variant
    
    On Error GoTo errores
    
    If p_Titulo = "" Then
        p_Titulo = "Seleccione el archivo"
    End If
    If p_EsArchivo = True Then
        Set m_ObjfDialog = Application.FileDialog(msoFileDialogFilePicker)
    Else
        Set m_ObjfDialog = Application.FileDialog(msoFileDialogFolderPicker)
    End If
    With m_ObjfDialog
        .Show
        If p_EsArchivo Then
            .AllowMultiSelect = False
            .InitialFileName = m_ObjEntorno.URLArchivoUltimo
            .Title = p_Titulo
            .Filters.Clear
            .Filters.Add "All Files", "*.*"
        End If
        For Each varFile In .SelectedItems
            Seleccionar = CStr(varFile)
        Next
    End With
    If p_EsArchivo Then
        m_ObjEntorno.URLArchivoUltimo = CStr(varFile)
    End If
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método Seleccionar ha producido el error : " & vbNewLine & Err.Description
    End If
End Function

Public Function HayArchivosEnCarpeta( _
                                    ByVal p_URCarpeta As String, _
                                    Optional ByRef p_Error As String _
                                    ) As Boolean
    
    Dim m_Carpeta As Scripting.Folder
    On Error GoTo errores
    
    If Not fso.FolderExists(p_URCarpeta) Then
        Exit Function
    End If
    If Right(p_URCarpeta, 1) = "\" Then
        p_URCarpeta = Left(p_URCarpeta, Len(p_URCarpeta) - 1)
    End If
    Set m_Carpeta = fso.GetFolder(p_URCarpeta)
    
    If m_Carpeta.Files.Count = 0 And m_Carpeta.SubFolders.Count = 0 Then
        HayArchivosEnCarpeta = False
    Else
        HayArchivosEnCarpeta = True
    End If
    Exit Function
   
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método HayArchivosEnCarpeta ha devuelto" & vbNewLine & Err.Description
    End If
    Debug.Print p_Error
End Function
Public Function getURLFinalAnexo( _
                                    Optional p_URLLocal As String, _
                                    Optional p_NombreDocumento As String, _
                                    Optional p_Expediente As Expediente, _
                                    Optional p_IDExpediente As String, _
                                    Optional ByRef p_Error As String _
                                    ) As String
    
    Dim m_URLDirectorio As String
    On Error GoTo errores
    
    If p_URLLocal = "" And p_NombreDocumento = "" Then
        p_Error = "Falta la ruta o nombre del documento"
        Err.Raise 1000
    End If
    If p_NombreDocumento = "" Then
        p_NombreDocumento = fso.GetFileName(p_URLLocal)
    End If
    
    If p_Expediente Is Nothing Then
        Set p_Expediente = constructor.getExpediente(p_IDExpediente:=p_IDExpediente, p_Error:=p_Error)
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        If p_Expediente Is Nothing Then
            p_Error = "Falta el expediente o la ruta del mismo"
            Err.Raise 1000
        End If
    End If
    m_URLDirectorio = p_Expediente.URLDirectorioAnexo & p_NombreDocumento
    
    
    Exit Function
   
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getURLFinalAnexo ha devuelto" & vbNewLine & Err.Description
    End If
    Debug.Print p_Error
End Function
Public Function getURLDirectorioExpediente( _
                                            p_IDExpediente As String, _
                                            Optional ByRef p_Error As String _
                                            ) As String
    
    
    On Error GoTo errores
    If p_IDExpediente = "" Then
        Exit Function
    End If
    
    getURLDirectorioExpediente = m_ObjEntorno.URLDirectorioDocumentacion & Format(p_IDExpediente, "00000") & "\"
    
    
    Exit Function
   
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getURLDirectorioExpediente ha devuelto" & vbNewLine & Err.Description
    End If
    Debug.Print p_Error
End Function


Public Function getDPDsParaExpediente( _
                                        p_IDExpediente As String, _
                                        Optional ByRef p_Error As String _
                                        ) As String
    
    Dim m_JSON As Object
    Dim m_Col As Collection
    Dim i As Long
    Dim m_Valor As String
    Dim m_Cadena As String
    
    On Error GoTo errores
    If p_IDExpediente = "" Then
        Exit Function
    End If
    Set m_JSON = getJSonDeTabla("TbProyectos", "IDExpediente", p_IDExpediente, getdb(), p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If m_JSON Is Nothing Then
        Exit Function
    End If
    Set m_Col = m_JSON
    For i = 1 To m_Col.Count
        m_Valor = m_JSON(i)("CODPROYECTOS")
        m_Valor = TextoParsedoParaTxt(m_Valor)
        If m_Cadena = "" Then
            m_Cadena = m_Valor
        Else
            m_Cadena = m_Cadena & vbNewLine & m_Valor
        End If
    Next
    getDPDsParaExpediente = m_Cadena
    
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getDPDsParaExpediente ha devuelto" & vbNewLine & Err.Description
    End If
    Debug.Print p_Error
End Function
Public Function getGestionesDeRiesgoParaExpediente( _
                                                    p_CodExp As String, _
                                                    Optional ByRef p_Error As String _
                                                    ) As String
                
    Dim m_JSON As Object
    Dim m_Col As Collection
    Dim i As Long
    Dim m_Valor As String
    Dim m_Cadena As String
    
    On Error GoTo errores
    If p_CodExp = "" Then
        Exit Function
    End If
    Set m_JSON = getJSonDeTabla("TbProyectos", "Proyecto", p_CodExp, getdb(), p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If m_JSON Is Nothing Then
        Exit Function
    End If
    Set m_Col = m_JSON
    For i = 1 To m_Col.Count
        m_Valor = m_JSON(i)("IDProyecto")
        m_Valor = TextoParsedoParaTxt(m_Valor)
        If m_Cadena = "" Then
            m_Cadena = m_Valor
        Else
            m_Cadena = m_Cadena & vbNewLine & m_Valor
        End If
    Next
    getGestionesDeRiesgoParaExpediente = m_Cadena
    
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getGestionesDeRiesgoParaExpediente ha devuelto" & vbNewLine & Err.Description
    End If
    Debug.Print p_Error
End Function

Public Function getHPSParaExpediente( _
                                        p_IDExpediente As String, _
                                        Optional p_ParaHistoricos As EnumSiNo = EnumSiNo.No, _
                                        Optional ByRef p_Error As String _
                                        ) As String
                
    Dim m_JSON As Object
    Dim m_Col As Collection
    Dim i As Long
    Dim m_Valor As String
    Dim m_Nombre As String
    Dim m_Apellido_1 As String
    Dim m_Apellido_2 As String
    Dim m_Cadena As String
    Dim m_Tabla As String
    
    On Error GoTo errores
    If p_IDExpediente = "" Then
        Exit Function
    End If
    If p_ParaHistoricos = Empty Then
        p_ParaHistoricos = EnumSiNo.No
    End If
    If p_ParaHistoricos = EnumSiNo.Sí Then
        m_Tabla = "TbUsuariosHistoricos"
    Else
        m_Tabla = "TbUsuarios"
    End If
    Set m_JSON = getJSonDeTabla(m_Tabla, "IDExpediente", p_IDExpediente, getdb(), p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If m_JSON Is Nothing Then
        Exit Function
    End If
    Set m_Col = m_JSON
    For i = 1 To m_Col.Count
        m_Nombre = m_JSON(i)("Nombre")
        m_Apellido_1 = m_JSON(i)("Apellido_1")
        m_Apellido_2 = m_JSON(i)("Apellido_2")
        m_Valor = m_Nombre & " " & m_Apellido_1 & " " & m_Apellido_2
        m_Valor = TextoParsedoParaTxt(m_Valor)
        If m_Cadena = "" Then
            m_Cadena = m_Valor
        Else
            m_Cadena = m_Cadena & vbNewLine & m_Valor
        End If
    Next
    getHPSParaExpediente = m_Cadena
    
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getGestionesDeRiesgoParaExpediente ha devuelto" & vbNewLine & Err.Description
    End If
    Debug.Print p_Error
End Function
Public Function getHPSParaSuministrador( _
                                        p_IDSuministrador As String, _
                                        Optional p_ParaHistoricos As EnumSiNo = EnumSiNo.No, _
                                        Optional ByRef p_Error As String _
                                        ) As String
                
    Dim m_JSON As Object
    Dim m_Col As Collection
    Dim i As Long
    Dim m_Valor As String
    Dim m_Nombre As String
    Dim m_Apellido_1 As String
    Dim m_Apellido_2 As String
    Dim m_Cadena As String
    Dim m_Tabla As String
    
    On Error GoTo errores
    If p_IDSuministrador = "" Then
        Exit Function
    End If
    If p_ParaHistoricos = Empty Then
        p_ParaHistoricos = EnumSiNo.No
    End If
    If p_ParaHistoricos = EnumSiNo.Sí Then
        m_Tabla = "TbUsuariosHistoricos"
    Else
        m_Tabla = "TbUsuarios"
    End If
    Set m_JSON = getJSonDeTabla(m_Tabla, "IDEmpresaHPS", p_IDSuministrador, getdb(), p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If m_JSON Is Nothing Then
        Exit Function
    End If
    Set m_Col = m_JSON
    For i = 1 To m_Col.Count
        m_Nombre = m_JSON(i)("Nombre")
        m_Apellido_1 = m_JSON(i)("Apellido_1")
        m_Apellido_2 = m_JSON(i)("Apellido_2")
        m_Valor = m_Nombre & " " & m_Apellido_1 & " " & m_Apellido_2
        m_Valor = TextoParsedoParaTxt(m_Valor)
        If m_Cadena = "" Then
            m_Cadena = m_Valor
        Else
            m_Cadena = m_Cadena & vbNewLine & m_Valor
        End If
    Next
    getHPSParaSuministrador = m_Cadena
    
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getGestionesDeRiesgoParaExpediente ha devuelto" & vbNewLine & Err.Description
    End If
    Debug.Print p_Error
End Function
Public Function getNCParaExpediente( _
                                        Optional p_CodExpediente As String, _
                                        Optional p_CodCodS4H As String, _
                                        Optional ByRef p_Error As String _
                                        ) As String
    
    Dim m_JSON As Object
    Dim m_Col As Collection
    Dim i As Long
    Dim m_Valor As String
    Dim m_CadenaExpediente As String
    Dim m_CadenaS4H As String
    Dim m_Cadena As String
    
    On Error GoTo errores
    If p_CodExpediente = "" And p_CodCodS4H = "" Then
        Exit Function
    End If
    
    If p_CodExpediente <> "" Then
        Set m_JSON = getJSonDeTabla("TbNoConformidades", "EXPEDIENTE", p_CodExpediente, getdb(), p_Error)
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        If m_JSON Is Nothing Then
            GoTo CodS4H
        End If
        Set m_Col = m_JSON
        For i = 1 To m_Col.Count
            m_Valor = m_JSON(i)("CodigoNoConformidad")
            m_Valor = TextoParsedoParaTxt(m_Valor)
            If m_CadenaExpediente = "" Then
                m_CadenaExpediente = m_Valor
            Else
                m_CadenaExpediente = m_CadenaExpediente & vbNewLine & m_Valor
            End If
        Next
    End If
CodS4H:
    If p_CodCodS4H <> "" Then
        Set m_JSON = getJSonDeTabla("TbNoConformidades", "EXPEDIENTE", p_CodCodS4H, getdb(), p_Error)
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        If m_JSON Is Nothing Then
            GoTo fin
        End If
        Set m_Col = m_JSON
        For i = 1 To m_Col.Count
            m_Valor = m_JSON(i)("CodigoNoConformidad")
            m_Valor = TextoParsedoParaTxt(m_Valor)
            If m_CadenaS4H = "" Then
                m_CadenaS4H = m_Valor
            Else
                m_CadenaS4H = m_CadenaS4H & vbNewLine & m_Valor
            End If
        Next
    End If
fin:
    If m_CadenaExpediente <> "" Then
        m_Cadena = m_CadenaExpediente
    End If
    If m_CadenaS4H <> "" Then
        If m_Cadena = "" Then
            m_Cadena = m_CadenaS4H
        Else
            m_Cadena = m_Cadena & vbNewLine & m_CadenaS4H
        End If
        
    End If
    getNCParaExpediente = m_Cadena
    
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getNCParaExpediente ha devuelto" & vbNewLine & Err.Description
    End If
    Debug.Print p_Error
End Function

Public Function getExpedientePorCampo( _
                                        p_NombreCampo As String, _
                                        p_ValorCampo As String, _
                                        Optional p_ElCampoEsTexto As EnumSiNo = EnumSiNo.Sí, _
                                        Optional ByRef p_Error As String _
                                        ) As Expediente
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_NOmbreTabla As String
    
    
    On Error GoTo errores
    
    If p_NombreCampo = "" Then
        p_Error = "Ha de indicar p_NombreCampo"
        Err.Raise 1000
    End If
    If p_ValorCampo = "" Then
        p_Error = "Ha de indicar p_ValorCampo"
        Err.Raise 1000
    End If
    m_NOmbreTabla = "TbExpedientes"
    If p_ElCampoEsTexto = EnumSiNo.Sí Then
        m_SQL = "SELECT * " & _
                "FROM " & m_NOmbreTabla & " " & _
                "WHERE " & p_NombreCampo & "='" & p_ValorCampo & "';"
    Else
        m_SQL = "SELECT * " & _
                "FROM " & m_NOmbreTabla & " " & _
                "WHERE " & p_NombreCampo & "=" & p_ValorCampo & ";"
    End If
    
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        Set getExpedientePorCampo = New Expediente
        For Each m_Campo In getExpedientePorCampo.ColCampos
            'If CStr(m_Campo) = "TipoInforme" Then Stop
            getExpedientePorCampo.SetPropiedad m_Campo, Nz(.Fields(m_Campo).value, ""), p_Error
             If p_Error <> "" Then
                 Err.Raise 1000
             End If
         Next
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getExpedientePorCampo ha devuelto el error: " & Err.Description
    End If
End Function
Public Function SiguienteOrdinal( _
                                    p_Expediente As Expediente, _
                                    Optional p_EsLote As EnumSiNo = EnumSiNo.Sí, _
                                    Optional ByRef p_Error As String _
                                    ) As String
    
    Dim m_ExpedienteDerivado As Expediente
    Dim m_Derivados As Scripting.Dictionary
    Dim m_ID As Variant
    Dim m_OrdinalMaximo As Integer
    
    On Error GoTo errores
    With p_Expediente
        If p_EsLote = EnumSiNo.Sí Then
            Set m_Derivados = .Lotes
        Else
            Set m_Derivados = .Basados
        End If
        If m_Derivados Is Nothing Then
            SiguienteOrdinal = "1"
            Exit Function
        End If
        For Each m_ID In m_Derivados
            Set m_ExpedienteDerivado = m_Derivados(m_ID)
            If IsNumeric(m_ExpedienteDerivado.Ordinal) Then
                If CInt(m_ExpedienteDerivado.Ordinal) > m_OrdinalMaximo Then
                    m_OrdinalMaximo = CInt(m_ExpedienteDerivado.Ordinal)
                End If
            End If
            Set m_ExpedienteDerivado = Nothing
        Next
    End With
    SiguienteOrdinal = CStr(m_OrdinalMaximo + 1)
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método SiguienteOrdinal ha devuelto el error: " & vbNewLine & Err.Description
    End If
    
End Function
Public Sub Ajustar(ByRef frmFormulario As Form)
    Dim i As Integer

    On Error Resume Next

    ' ajusto el ancho del formulario teniendo en cuenta si tiene o no selector de registros
    If Not frmFormulario.RecordSelectors Then
        frmFormulario.InsideWidth = frmFormulario.Width
    Else
        frmFormulario.InsideWidth = frmFormulario.Width + 250
    End If

    ' si se abre en vista formulario simple
    If frmFormulario.DefaultView = 0 Then
        'ajusto el alto incluyendo las distintas secciones, encabezado, pie, grupos...
        ' como no sé el número de secciones del formulario, me salgo al producirse un error
        frmFormulario.InsideHeight = 0
        For i = 0 To 100
            frmFormulario.InsideHeight = frmFormulario.InsideHeight + frmFormulario.Section(i).Height
        Next
    End If



End Sub

Public Sub Avance(ByRef p_Linea As Variant)
    Dim frm As Form
    On Error Resume Next
    
    Set frm = Screen.ActiveForm
    If Not frm Is Nothing Then
        If Not frm.Controls("lblEstado") Is Nothing Then
            frm.Controls("lblEstado").Caption = p_Linea
        End If
    End If
    
    If FormularioAbierto("frmSplash") Then
        With Forms("frmSplash")
            Dim totalPasos As Long
            Dim anchoMaximo As Long, nuevoAncho As Long
            
            Dim tempEntorno As New Entorno
            totalPasos = tempEntorno.ColItems.Count
            Set tempEntorno = Nothing
            
            s_contadorPasos = s_contadorPasos + 1
            
            anchoMaximo = .lblProgresoFondo.Width
            
            If totalPasos > 0 Then
                ' Cálculo proporcional
                nuevoAncho = (s_contadorPasos / totalPasos) * anchoMaximo
                
                ' SALVAGUARDA: Asegurarse de que el nuevo ancho no supere el máximo.
                If nuevoAncho > anchoMaximo Then
                    nuevoAncho = anchoMaximo
                End If
            End If
            
            .lblProgresoBarra.Width = nuevoAncho
        End With
    End If
    
    VBA.DoEvents
End Sub

Public Function AvanceCerrar( _
                            Optional ByRef p_Error As String _
                            ) As String
    
    
    Dim frm As Form
    
    
    On Error GoTo errores
    
    
    Set frm = Application.Screen.ActiveForm
    If frm Is Nothing Then
        Exit Function
    End If
    On Error Resume Next
    If Not lbl Is Nothing Then
        lbl.Visible = False
        Set lbl = Nothing
    End If
    
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método AvanceCerrar ha devuelto el error: " & Err.Description
    End If
End Function



Private Function getUsuarioMaquina( _
                            Optional ByRef p_Error As String _
                            ) As String
    Dim objNetwork As Object
    On Error GoTo errores
    Set objNetwork = CreateObject("Wscript.Network")
    With objNetwork
        getUsuarioMaquina = .UserName & "|" & .computername
    End With
   
    Set objNetwork = Nothing
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getUsuarioMaquina ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function

Public Function FormularioAbierto(strNombreFormulario As String) As Boolean
   
    Dim strEstado As String
    On Error GoTo errores
    strEstado = SysCmd(acSysCmdGetObjectState, acForm, strNombreFormulario)
    If strEstado = "0" Then
        FormularioAbierto = False
    Else
        FormularioAbierto = True
    End If
    Exit Function
errores:
    FormularioAbierto = False
End Function

Public Function DameID( _
                        p_NOmbreTabla As String, _
                        p_NombreCampoID As String, _
                        Optional ByRef p_Db As DAO.Database, _
                        Optional ByRef p_Error As String _
                        ) As String
   
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim lngOrdinalMaximo As Long
    On Error GoTo errores
    
    If p_Db Is Nothing Then
        Set p_Db = CurrentDb()
    End If
    m_SQL = "SELECT Max(" & p_NOmbreTabla & "." & p_NombreCampoID & ") AS Maximo " & _
            "FROM " & p_NOmbreTabla & ";"
    Set rcdDatos = p_Db.OpenRecordset(m_SQL)
    With rcdDatos
        If Not .EOF Then
            If IsNumeric(Nz(.Fields("Maximo"), "")) Then
                lngOrdinalMaximo = .Fields("Maximo")
            End If
        End If
        
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    DameID = CStr(lngOrdinalMaximo + 1)
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método DameID ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
    End If
    
End Function
Function FicheroAbierto(strURLArchivo As String) As Boolean
    
    Dim infNumeroFichero As Integer, intNumeroError As Integer
    On Error Resume Next
    infNumeroFichero = FreeFile()
    Open strURLArchivo For Input Lock Read As #infNumeroFichero
    Close infNumeroFichero          ' Close the file.
    intNumeroError = Err.Number
    On Error GoTo 0        ' Turn error checking back on.
    Select Case intNumeroError
        Case 0
         FicheroAbierto = False
    
        ' Error number for "Permission Denied."
        ' File is already opened by another user.
        Case Else
            FicheroAbierto = True
    End Select
End Function
Public Function EjecutarShell( _
                                p_Comando As String, _
                                Optional ByRef p_Error As String _
                                ) As String
    
    Dim ManejadorProceso As Long
    Dim IDProceso As Long
    Dim lpExitCode As Long
    
    On Error GoTo errores
    If p_Comando = "" Then
        p_Error = "No se ha indicado el comando"
        Err.Raise 1000
    End If
    IDProceso = Shell(p_Comando, vbHide)
    ManejadorProceso = OpenProcess(PROCESS_QUERY_INFORMATION, False, IDProceso)
    ' Mientras lp_ExitCode = STATUS_PENDING, se ejecuta el do
    Do
        Call GetExitCodeProcess(ManejadorProceso, lpExitCode)
        DoEvents
    Loop While lpExitCode = STATUS_PENDING
    Call CloseHandle(ManejadorProceso)
    
    EjecutarShell = "OK"
    Exit Function
errores:
    
    If Err.Number <> 1000 Then
        p_Error = "El método EjecutarShell ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
    End If
    
End Function

Public Function EnOficina(Optional ByRef p_Error As String) As EnumSiNo
    
    Dim strIPS As String
    On Error GoTo errores
    strIPS = GetIPAddresses
    If InStr(1, strIPS, SubRedOficina) = 0 Then
        EnOficina = EnumSiNo.No
    Else
        EnOficina = EnumSiNo.Sí
    End If
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método EnOficina ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
    End If
End Function

Public Function CorreoAlAdministrador( _
                                        p_MensajeError As String, _
                                        Optional ByRef p_Error As String _
                                        ) As String
    Dim m_Correo As CORREO
    Dim m_CorreoOp As CorreoOperaciones
    
    Dim m_mensaje As String
    Dim m_Asunto As String
    Dim strCadenaDestinatario As String
    
    Dim m_Nombre As String
    Dim m_NombreFormulario As String
    Dim m_TextoEnOficina As String
    
    
    On Error GoTo errores
    If Application.TempVars("EnDesarrollo") = "Sí" Then
        Exit Function
    End If
    strCadenaDestinatario = "ardelperal@gmail.com;andres.romandelperal@telefonica.com"
    #If Win64 = 1 Then
        
        m_TextoWin64 = "(64 bits)"
    #Else
         
         m_TextoWin64 = "(32 bits)"
    #End If
    If m_EnOficina = Empty Then
        m_EnOficina = EnOficina(p_Error)
        If p_Error <> "" Then
            Err.Raise 1000
        End If
    End If
    If m_EnOficina = Empty Then
        m_TextoEnOficina = "En Oficina Desconocido"
    Else
        If m_EnOficina = EnumSiNo.Sí Then
            m_TextoEnOficina = "En Oficina"
        Else
            m_TextoEnOficina = "Fuera de Oficina"
        End If
    End If
    m_Nombre = getNombreUsuarioConectado()
    
    On Error Resume Next
    m_NombreFormulario = Application.Screen.ActiveForm.Name
    If Err.Number <> 0 Then
        Err.Clear
        m_NombreFormulario = "Formulario Desconocido Desconocido"
    Else
        m_NombreFormulario = "Formulario " & m_NombreFormulario
    End If
    On Error GoTo errores
     m_Asunto = "Error en GESTIÓN DE EXPEDIENTES " & m_TextoWin64 & " " & m_Nombre & " " & m_TextoEnOficina
    
    m_mensaje = "FORMULARIO del ERROR: " & m_NombreFormulario & vbNewLine
    m_mensaje = m_mensaje & "<BR> </BR>" & vbNewLine
    On Error Resume Next
    m_mensaje = m_mensaje & "NOMBRE EQUIPO: " & VBA.Environ("COMPUTERNAME")
    m_mensaje = m_mensaje & "<BR> </BR>" & vbNewLine
    On Error GoTo errores
    
    m_mensaje = m_mensaje & "DETALLE: " & p_MensajeError
    
    
     Set m_Correo = New CORREO
    With m_Correo
        .Cuerpo = m_mensaje
        .Asunto = m_Asunto
        .Originador = m_ObjUsuarioConectado.Nombre
        .DESTINATARIOS = strCadenaDestinatario
        '.DestinatariosConCopia = m_ObjEntorno.CadenaCorreoResponsablesEconomia
        '.URLAdjunto = Me.FacturaCliente.URLFacturaCalculada
        Set m_CorreoOp = New CorreoOperaciones
        Set m_CorreoOp.CORREO = m_Correo
        m_CorreoOp.EnviarCorreo p_Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
    End With
    
 
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método CorreoAlAdministrador ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
    End If
    
End Function
Public Function AbrirEnLocal( _
                                p_URLFinal As String, _
                                Optional ByRef p_Error As String _
                                ) As String
    
    Dim m_URLLocal As String
    Dim m_Hwn As Long
    
    On Error Resume Next
    m_Hwn = Application.Screen.ActiveForm.hwnd
    If Err.Number <> 0 Then
        Err.Clear
        m_Hwn = 1
    End If
    On Error GoTo errores
    If Not fso.FileExists(p_URLFinal) Then
        p_Error = "No es accesible la ruta del archivo que se pretende abrir" & vbNewLine & p_URLFinal
        Err.Raise 1000
    End If
    If Left(p_URLFinal, 2) = "\\" Then
        m_URLLocal = m_ObjEntorno.URLDirectorioLocal & fso.GetFileName(p_URLFinal)
        If fso.FileExists(m_URLLocal) Then
            If FicheroAbierto(m_URLLocal) Then
                p_Error = "Tiene el archivo abierto"
                Err.Raise 1000
            End If
            fso.DeleteFile m_URLLocal, True
        End If
        fso.CopyFile p_URLFinal, m_URLLocal, True
    Else
        m_URLLocal = p_URLFinal
    End If
    
    Ejecutar m_Hwn, "open", m_URLLocal, "", "", 1
    
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método AbrirEnLocal ha producido el error nº: " & Err.Number & vbNewLine & _
                    "Detalle: " & Err.Description
    End If
End Function
Public Function AbrirAyuda( _
                            Optional ByRef p_Error As String _
                            ) As String

    
    Dim m_URLNombreArchivo As String
    On Error Resume Next
    If Application.Screen.ActiveForm Is Nothing Then
        If Err.Number <> 0 Then
            Exit Function
        End If
        Exit Function
    End If
    If Err.Number <> 0 Then
        Exit Function
    End If
    Err.Clear
    On Error GoTo errores
    m_URLNombreArchivo = m_ObjEntorno.URLDirectorioDocumentacionAyuda & Application.Screen.ActiveForm.Name & ".pdf"
    m_URLNombreArchivo = m_ObjEntorno.URLDirectorioDocumentacionAyuda & "Gestor de Expedientes - Presentación y usos v1.pdf"
    If Not fso.FileExists(m_URLNombreArchivo) Then
        p_Error = "No se ha generado la ayuda para este formulario aún"
        Err.Raise 1000
        
    End If
    AbrirEnLocal m_URLNombreArchivo, p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método AbrirAyuda ha devuelto el error: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
    End If
    
End Function

Public Function Dame( _
                        p_NOmbreTabla As String, _
                        p_NombreCampo As String, _
                        p_NombreCampoID As String, _
                        p_ValorID As String, _
                        Optional ByRef p_Db As DAO.Database, _
                        Optional ByRef p_Error As String _
                        ) As String
   
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim blnYaError As Boolean
    On Error GoTo errores
    
    If p_Db Is Nothing Then
        Set p_Db = getdb()
    End If
    m_SQL = "SELECT " & p_NombreCampo & " " & _
            "FROM " & p_NOmbreTabla & " " & _
            "WHERE " & p_NombreCampoID & "=" & p_ValorID & ";"
    On Error Resume Next
    Set rcdDatos = p_Db.OpenRecordset(m_SQL)
    If Err.Number <> 0 Then
        Err.Clear
        
        blnYaError = True
        m_SQL = "SELECT " & p_NombreCampo & " " & _
            "FROM " & p_NOmbreTabla & " " & _
            "WHERE " & p_NombreCampoID & "='" & p_ValorID & "';"
        Set rcdDatos = p_Db.OpenRecordset(m_SQL)
        If Err.Number <> 0 Then
            Exit Function
        End If
    End If
    If rcdDatos.EOF Then
        If blnYaError = True Then
            Exit Function
        End If
        m_SQL = "SELECT " & p_NombreCampo & " " & _
            "FROM " & p_NOmbreTabla & " " & _
            "WHERE " & p_NombreCampoID & "='" & p_ValorID & "';"
        Set rcdDatos = p_Db.OpenRecordset(m_SQL)
        If rcdDatos.EOF Then
            Exit Function
        End If
    End If
    Dame = Nz(rcdDatos.Fields(p_NombreCampo).value, "")
    rcdDatos.Close
    Set rcdDatos = Nothing
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método Dame ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
    End If
    
End Function
Public Function getExpEntidadDeExpediente( _
                                            Optional p_IDExp As String, _
                                            Optional p_Expediente As Expediente, _
                                            Optional p_Ambito As EnumAmbitoActualizacion = Todo, _
                                            Optional ByRef p_Error As String _
                                            ) As ExpedienteEntidad

    Dim m_ExpEntidad As ExpedienteEntidad
    
    On Error GoTo errores
    
    ' 1. Obtener el Expediente base si no se pasa
    If p_Expediente Is Nothing Then
        Set p_Expediente = constructor.getExpediente(p_IDExpediente:=p_IDExp, p_Error:=p_Error)
        If p_Error <> "" Then Err.Raise 1000
        If p_Expediente Is Nothing Then
            p_Error = "No se puede encontrar el Expediente"
            Err.Raise 1000
        End If
    End If
    
    Set m_ExpEntidad = New ExpedienteEntidad
    m_ExpEntidad.IDExpediente = p_Expediente.IDExpediente
    
    ' 2. CÁLCULO GRANULAR SEGÚN EL ÁMBITO
    With p_Expediente
        
        ' --- GRUPO CABECERA ---
        If p_Ambito = Todo Or p_Ambito = Cabecera Then
            m_ExpEntidad.TipoParaLista = .TipoParaLista ' Derivado de EsAM/EsLote
            
            If .GradoClasificacion Is Nothing Then
                m_ExpEntidad.Clasificacion = ""
            Else
                m_ExpEntidad.Clasificacion = .GradoClasificacion.GradoClasificacion
            End If
            
            If .OrganoContratacion Is Nothing Then
                m_ExpEntidad.OrganoContratacion = ""
            Else
                m_ExpEntidad.OrganoContratacion = .OrganoContratacion.OrganoContratacion
            End If
            
            If .OficinaPrograma Is Nothing Then
                m_ExpEntidad.OficinaPrograma = ""
            Else
                m_ExpEntidad.OficinaPrograma = .OficinaPrograma.OficinaPrograma
            End If
            
            If .Ejercito Is Nothing Then
                m_ExpEntidad.Ejercito = ""
            Else
                m_ExpEntidad.Ejercito = .Ejercito.Ejercito
            End If
            
            If .responsableCalidad Is Nothing Then
                m_ExpEntidad.responsableCalidad = ""
            Else
                m_ExpEntidad.responsableCalidad = .responsableCalidad.Nombre
            End If
            
            If .responsableSeguridad Is Nothing Then
                m_ExpEntidad.responsableSeguridad = ""
            Else
                m_ExpEntidad.responsableSeguridad = .responsableSeguridad.Nombre
            End If
        End If
        
        ' --- GRUPO PECAL ---
        If p_Ambito = Todo Or p_Ambito = PECAL Then
            Dim m_CadenaPECAL As String
            m_CadenaPECAL = .CadenaPecalCalculada
            If m_CadenaPECAL = "" Then
                m_ExpEntidad.CadenaPecal = ""
                m_ExpEntidad.PECAL = "No"
            Else
                m_ExpEntidad.CadenaPecal = m_CadenaPECAL
                If m_CadenaPECAL = "N/A" Then
                    m_ExpEntidad.PECAL = "No"
                Else
                    m_ExpEntidad.PECAL = "Sí"
                End If
            End If
        End If
        
        ' --- GRUPO SUMINISTRADORES ---
        If p_Ambito = Todo Or p_Ambito = Suministradores Then
            ' Nota: Asumimos que las propiedades .CadenaContratistas del objeto expediente
            ' ya llaman internamente a la lógica de cálculo si no están cacheadas en el objeto.
            m_ExpEntidad.CadenaContratistas = Nz(.CadenaContratistas, "")
            m_ExpEntidad.CadenaSubContratistas = Nz(.CadenaSubContratistas, "")
        End If
        
        ' --- GRUPO COMERCIALES ---
        If p_Ambito = EnumAmbitoActualizacion.Todo Or p_Ambito = EnumAmbitoActualizacion.Comerciales Then
            m_ExpEntidad.CadenaComerciales = Nz(.CadenaComerciales, "")
        End If
        
        ' --- GRUPO RESPONSABLES (JPs) ---
        If p_Ambito = EnumAmbitoActualizacion.Todo Or p_Ambito = EnumAmbitoActualizacion.Responsables Then
            If .AGEDYSGenericoCalculado <> EnumSiNo.Sí Then
                m_ExpEntidad.CadenaJPs = Nz(.CadenaResponsables, "")
            Else
                m_ExpEntidad.CadenaJPs = ""
            End If
        End If
        
        ' --- GRUPO RACs ---
        If p_Ambito = EnumAmbitoActualizacion.Todo Or p_Ambito = EnumAmbitoActualizacion.RACs Then
            m_ExpEntidad.CadenaRACs = Nz(.CadenaRACs, "")
            m_ExpEntidad.CadenaCorreoRACs = Nz(.CadenaCorreoRACs, "")
        End If
        
        ' --- GRUPO HITOS ---
        If p_Ambito = EnumAmbitoActualizacion.Todo Or p_Ambito = EnumAmbitoActualizacion.Hitos Then
            m_ExpEntidad.CadenaHitos = Nz(.CadenaHitos, "")
        End If
        
        ' --- GRUPO LUGARES ---
        If p_Ambito = EnumAmbitoActualizacion.Todo Or p_Ambito = EnumAmbitoActualizacion.Lugares Then
            m_ExpEntidad.CadenaLugares = Nz(.CadenaLugares, "")
        End If
        
    End With
    
    Set getExpEntidadDeExpediente = m_ExpEntidad
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getExpEntidadDeExpediente ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
    End If
End Function
  
Public Function getColExpedientesDeLista( _
                                            lst As ListBox, _
                                            Optional ByRef _
                                            p_Error As String _
                                            ) As Scripting.Dictionary
    
    Dim m_ExpC As ExpedienteCompleto
    Dim i As Integer
    Dim IDExp As String
    On Error GoTo errores
    
    If lst Is Nothing Then
        Exit Function
    End If
    If lst.ListCount = 1 Then
        Exit Function
    End If
   
    
    For i = 1 To lst.ListCount - 1
        'If lst.Column(1, i) = "1025" Then Stop
        IDExp = lst.Column(0, i)
        Set m_ExpC = constructor.getExpedienteCompleto(p_IDExpediente:=IDExp, p_Error:=p_Error)
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        Avance m_ExpC.IDExpediente & "..........." & m_ExpC.Nemotecnico
        
        If getColExpedientesDeLista Is Nothing Then
            Set getColExpedientesDeLista = New Scripting.Dictionary
            getColExpedientesDeLista.CompareMode = TextCompare
        End If
        If Not getColExpedientesDeLista.exists(CStr(m_ExpC.IDExpediente)) Then
            getColExpedientesDeLista.Add CStr(m_ExpC.IDExpediente), m_ExpC
        End If
        Set m_ExpC = Nothing
       
    Next
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getColExpedientesDeLista ha devuelto el error: " & Err.Description
    End If
End Function


Public Function CopiarSuministradores( _
                                    p_ExpOrigen As Expediente, _
                                    p_ExpDestino As Expediente, _
                                    Optional ByRef p_Error As String _
                                    ) As String
     
     Dim m_SQL As String
     Dim rcdDatosOrigen As DAO.Recordset
     Dim rcdDatosDestino As DAO.Recordset
     Dim fld As DAO.Field
     
     On Error GoTo errores
     If p_ExpOrigen Is Nothing Or p_ExpDestino Is Nothing Then
        p_Error = "No se ha indicado el expediente de Origen o de destino"
        Err.Raise 1000
     End If
     If p_ExpOrigen.IDExpediente = "" Then
        p_Error = "El expediente de origen parece que todavía no ha sido registrado"
        Err.Raise 1000
     End If
If p_ExpDestino.IDExpediente = "" Then
         p_Error = "El expediente de Destino parece que todavía no ha sido registrado"
         Err.Raise 1000
      End If
      MostrarPopupProgreso "Copiando entidades", "Copiando Suministradores..."
      m_SQL = "DELETE * " & _
             "FROM TbExpedientesSuministradores " & _
             "WHERE IDExpediente=" & p_ExpDestino.IDExpediente & ";"
     'primero hemos de borrar el destino
     getdb().Execute (m_SQL)
     m_SQL = "DELETE * " & _
            "FROM TbExpedientesSuministradores " & _
            "WHERE IDExpediente=" & p_ExpOrigen.IDExpediente & ";"
     Set rcdDatosOrigen = getdb().OpenRecordset(m_SQL)
     m_SQL = "TbExpedientesSuministradores"
     Set rcdDatosDestino = getdb().OpenRecordset(m_SQL)
If Not rcdDatosOrigen.EOF Then
         Do While Not rcdDatosOrigen.EOF
             ActualizarEstadoPopup "Copiando Suministradores (" & rcdDatosOrigen.AbsolutePosition + 1 & ")"
             DoEvents
             rcdDatosDestino.AddNew
             For Each fld In rcdDatosOrigen.Fields
                 rcdDatosDestino.Fields(fld.Name).value = rcdDatosOrigen.Fields(fld.Name).value
             Next
             rcdDatosDestino.Update

             rcdDatosOrigen.MoveNext
         Loop
      End If

      CerrarPopupProgreso
      Exit Function
errores:
     CerrarPopupProgreso
     If Err.Number <> 1000 Then
        p_Error = "El método ExpedienteOperaciones.CopiarSuministradores ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
    End If
End Function
Public Function CopiarPecales( _
                                p_ExpOrigen As Expediente, _
                                p_ExpDestino As Expediente, _
                                Optional ByRef p_Error As String _
                                ) As String
     Dim m_ID As Variant
     Dim m_Pecal As PECAL
     Dim m_PECALDestino As ExpedientePECAL
     Dim m_SQL As String
     
     On Error GoTo errores
     If p_ExpOrigen Is Nothing Or p_ExpDestino Is Nothing Then
        p_Error = "No se ha indicado el expediente de Origen o de destino"
        Err.Raise 1000
     End If
     If p_ExpOrigen.IDExpediente = "" Then
        p_Error = "El expediente de origen parece que todavía no ha sido registrado"
        Err.Raise 1000
     End If
If p_ExpDestino.IDExpediente = "" Then
         p_Error = "El expediente de Destino parece que todavía no ha sido registrado"
         Err.Raise 1000
      End If
      MostrarPopupProgreso "Copiando entidades", "Copiando PECALES..."
      'primero hemos de borrar el destino
      If Not p_ExpDestino.PECALES Is Nothing Then
        For Each m_ID In p_ExpDestino.PECALES
            Set m_Pecal = p_ExpDestino.PECALES(m_ID)
            m_SQL = "DELETE * " & _
                    "FROM TbExpedientesPECAL " & _
                    "WHERE IDExpediente=" & p_ExpDestino.IDExpediente & " " & _
                    "AND IDPECAL=" & m_Pecal.IDPECAL & ";"
            getdb().Execute m_SQL
            Set m_Pecal = Nothing
        Next
     End If
'Las copiamos al destino
      If Not p_ExpOrigen.PECALES Is Nothing Then
         For Each m_ID In p_ExpOrigen.PECALES
             ActualizarEstadoPopup "Copiando PECALES (" & m_ID & ")"
             DoEvents
             Set m_Pecal = p_ExpOrigen.PECALES(m_ID)
            Set m_PECALDestino = New ExpedientePECAL
            With m_PECALDestino
                .IDExpediente = p_ExpDestino.IDExpediente
                .IDPECAL = m_Pecal.IDPECAL
                .IDPECALExpediente = .IDPECALExpedienteCalculado
                m_SQL = "INSERT INTO TbExpedientesPECAL (" & _
                        "IDPECALExpediente,IDExpediente,IDPECAL) " & _
                        "VALUES (" & .IDPECALExpediente & "," & .IDExpediente & "," & .IDPECAL & ");"
                getdb().Execute m_SQL
                
            End With
            Set m_PECALDestino = Nothing
            
Set m_Pecal = Nothing
         Next
      End If

      CerrarPopupProgreso
      Exit Function
errores:
     CerrarPopupProgreso
     If Err.Number <> 1000 Then
         p_Error = "El método ExpedienteOperaciones.CopiarPecales ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
     End If
 End Function

 Public Function CopiarCPVs( _
                                p_ExpOrigen As Expediente, _
                                p_ExpDestino As Expediente, _
                                Optional ByRef p_Error As String _
                                ) As String
     Dim m_ID As Variant
     Dim m_CPV As CPV
     Dim m_CPVDestino As ExpedienteCPV
     Dim m_SQL As String
     
     On Error GoTo errores
     If p_ExpOrigen Is Nothing Or p_ExpDestino Is Nothing Then
        p_Error = "No se ha indicado el expediente de Origen o de destino"
        Err.Raise 1000
     End If
     If p_ExpOrigen.IDExpediente = "" Then
        p_Error = "El expediente de origen parece que todavía no ha sido registrado"
        Err.Raise 1000
     End If
If p_ExpDestino.IDExpediente = "" Then
         p_Error = "El expediente de Destino parece que todavía no ha sido registrado"
         Err.Raise 1000
      End If
      MostrarPopupProgreso "Copiando entidades", "Copiando CPVs..."
      'primero hemos de borrar el destino
      If Not p_ExpDestino.CPVs Is Nothing Then
        For Each m_ID In p_ExpDestino.CPVs
            Set m_CPV = p_ExpDestino.CPVs(m_ID)
            m_SQL = "DELETE * " & _
                    "FROM TbExpedientesCPVs " & _
                    "WHERE IDExpediente=" & p_ExpDestino.IDExpediente & " " & _
                    "AND IDCPV=" & m_CPV.IDCPV & ";"
            getdb().Execute m_SQL
            Set m_CPV = Nothing
        Next
     End If
'Las copiamos al destino
      If Not p_ExpOrigen.CPVs Is Nothing Then
         For Each m_ID In p_ExpOrigen.CPVs
             ActualizarEstadoPopup "Copiando CPVs (" & m_ID & ")"
             DoEvents
             Set m_CPV = p_ExpOrigen.CPVs(m_ID)
            Set m_CPVDestino = New ExpedienteCPV
            With m_CPVDestino
                .IDExpediente = p_ExpDestino.IDExpediente
                .IDCPV = m_CPV.IDCPV
                .IDCPVExpediente = .IDCPVExpedienteCalculado
                m_SQL = "INSERT INTO TbExpedientesCPVs (" & _
                        "IDCPVExpediente,IDExpediente,IDCPV) " & _
                        "VALUES (" & .IDCPVExpediente & "," & .IDExpediente & "," & .IDCPV & ");"
                getdb().Execute m_SQL
                
            End With
            Set m_CPVDestino = Nothing
            
Set m_CPV = Nothing
         Next
      End If

      CerrarPopupProgreso
      Exit Function
errores:
     CerrarPopupProgreso
     If Err.Number <> 1000 Then
         p_Error = "El método ExpedienteOperaciones.CopiarCPVs ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
     End If
 End Function
 Public Function CopiarLugares( _
                                p_ExpOrigen As Expediente, _
                                p_ExpDestino As Expediente, _
                                Optional ByRef p_Error As String _
                                ) As String
     Dim m_ID As Variant
     Dim m_Lugar As LugarEjecucion
     Dim m_LugarDestino As ExpedienteLugarEjecucion
     Dim m_SQL As String
     
     On Error GoTo errores
     If p_ExpOrigen Is Nothing Or p_ExpDestino Is Nothing Then
        p_Error = "No se ha indicado el expediente de Origen o de destino"
        Err.Raise 1000
     End If
     If p_ExpOrigen.IDExpediente = "" Then
        p_Error = "El expediente de origen parece que todavía no ha sido registrado"
        Err.Raise 1000
     End If
If p_ExpDestino.IDExpediente = "" Then
         p_Error = "El expediente de Destino parece que todavía no ha sido registrado"
         Err.Raise 1000
      End If
      MostrarPopupProgreso "Copiando entidades", "Copiando Lugares de Ejecución..."
      'primero hemos de borrar el destino
      If Not p_ExpDestino.LugaresEjecucion Is Nothing Then
        For Each m_ID In p_ExpDestino.LugaresEjecucion
            Set m_Lugar = p_ExpDestino.LugaresEjecucion(m_ID)
            m_SQL = "DELETE * " & _
                    "FROM TbExpedientesLugaresEjecucion " & _
                    "WHERE IDExpediente=" & p_ExpDestino.IDExpediente & " " & _
                    "AND IDLugarEjecucion=" & m_Lugar.IDLugarEjecucion & ";"
            getdb().Execute m_SQL
            Set m_Lugar = Nothing
        Next
     End If
'Las copiamos al destino
      If Not p_ExpOrigen.LugaresEjecucion Is Nothing Then
         For Each m_ID In p_ExpOrigen.LugaresEjecucion
             ActualizarEstadoPopup "Copiando Lugares (" & m_ID & ")"
             DoEvents
             Set m_Lugar = p_ExpOrigen.LugaresEjecucion(m_ID)
            Set m_LugarDestino = New ExpedienteLugarEjecucion
            With m_LugarDestino
                .IDExpediente = p_ExpDestino.IDExpediente
                .IDLugarEjecucion = m_Lugar.IDLugarEjecucion
                .IDExpedienteLugarEjecucion = .IDLugarEjecucionExpedienteCalculado
                m_SQL = "INSERT INTO TbExpedientesLugaresEjecucion (" & _
                        "IDExpedienteLugarEjecucion,IDExpediente,IDLugarEjecucion) " & _
                        "VALUES (" & .IDExpedienteLugarEjecucion & "," & .IDExpediente & "," & .IDLugarEjecucion & ");"
                getdb().Execute m_SQL
                
            End With
            Set m_LugarDestino = Nothing
            
Set m_Lugar = Nothing
         Next
      End If

      CerrarPopupProgreso
      Exit Function
errores:
     CerrarPopupProgreso
     If Err.Number <> 1000 Then
         p_Error = "El método ExpedienteOperaciones.CopiarLugares ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
     End If
 End Function


 Public Function CopiarComerciales( _
                                p_ExpOrigen As Expediente, _
                                p_ExpDestino As Expediente, _
                                Optional ByRef p_Error As String _
                                ) As String
     Dim m_ID As Variant
     Dim m_Comercial As Comercial
     Dim m_ComercialDestino As ExpedienteComercial
     Dim m_SQL As String
     
     On Error GoTo errores
     If p_ExpOrigen Is Nothing Or p_ExpDestino Is Nothing Then
        p_Error = "No se ha indicado el expediente de Origen o de destino"
        Err.Raise 1000
     End If
     If p_ExpOrigen.IDExpediente = "" Then
        p_Error = "El expediente de origen parece que todavía no ha sido registrado"
        Err.Raise 1000
     End If
If p_ExpDestino.IDExpediente = "" Then
         p_Error = "El expediente de Destino parece que todavía no ha sido registrado"
         Err.Raise 1000
      End If
      MostrarPopupProgreso "Copiando entidades", "Copiando Comerciales..."
      'primero hemos de borrar el destino
      If Not p_ExpDestino.Comerciales Is Nothing Then
        For Each m_ID In p_ExpDestino.Comerciales
            Set m_Comercial = p_ExpDestino.Comerciales(m_ID)
            m_SQL = "DELETE * " & _
                    "FROM TbExpedientesComerciales " & _
                    "WHERE IDExpediente=" & p_ExpDestino.IDExpediente & " " & _
                    "AND IDComercial=" & m_Comercial.IDComercial & ";"
            getdb().Execute m_SQL
            Set m_Comercial = Nothing
        Next
     End If
'Las copiamos al destino
      If Not p_ExpOrigen.Comerciales Is Nothing Then
         For Each m_ID In p_ExpOrigen.Comerciales
             ActualizarEstadoPopup "Copiando Comerciales (" & m_ID & ")"
             DoEvents
             Set m_Comercial = p_ExpOrigen.Comerciales(m_ID)
            Set m_ComercialDestino = New ExpedienteComercial
            With m_ComercialDestino
                .IDExpediente = p_ExpDestino.IDExpediente
                .IDComercial = m_Comercial.IDComercial
                .IDComercialExpediente = .IDComercialExpedienteCalculado
                m_SQL = "INSERT INTO TbExpedientesComerciales (" & _
                        "IDComercialExpediente,IDExpediente,IDComercial) " & _
                        "VALUES (" & .IDComercialExpediente & "," & .IDExpediente & "," & .IDComercial & ");"
                getdb().Execute m_SQL
                
            End With
            Set m_ComercialDestino = Nothing
            
Set m_Comercial = Nothing
         Next
      End If

      CerrarPopupProgreso
      Exit Function
errores:
     CerrarPopupProgreso
     If Err.Number <> 1000 Then
         p_Error = "El método ExpedienteOperaciones.CopiarComerciales ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
     End If
 End Function


 Public Function CopiarRACs( _
                                p_ExpOrigen As Expediente, _
                                p_ExpDestino As Expediente, _
                                Optional ByRef p_Error As String _
                                ) As String
     Dim m_ID As Variant
     Dim m_RAC As RAC
     Dim m_RACDestino As ExpedienteRAC
     Dim m_SQL As String
     
     On Error GoTo errores
     If p_ExpOrigen Is Nothing Or p_ExpDestino Is Nothing Then
        p_Error = "No se ha indicado el expediente de Origen o de destino"
        Err.Raise 1000
     End If
     If p_ExpOrigen.IDExpediente = "" Then
        p_Error = "El expediente de origen parece que todavía no ha sido registrado"
        Err.Raise 1000
     End If
If p_ExpDestino.IDExpediente = "" Then
         p_Error = "El expediente de Destino parece que todavía no ha sido registrado"
         Err.Raise 1000
      End If
      MostrarPopupProgreso "Copiando entidades", "Copiando RACs..."
      'primero hemos de borrar el destino
      If Not p_ExpDestino.RACs Is Nothing Then
        For Each m_ID In p_ExpDestino.RACs
            Set m_RAC = p_ExpDestino.RACs(m_ID)
            m_SQL = "DELETE * " & _
                    "FROM TbExpedientesRACs " & _
                    "WHERE IDExpediente=" & p_ExpDestino.IDExpediente & " " & _
                    "AND IDRAC=" & m_RAC.IDRAC & ";"
            getdb().Execute m_SQL
            Set m_RAC = Nothing
        Next
     End If
'Las copiamos al destino
      If Not p_ExpOrigen.RACs Is Nothing Then
         For Each m_ID In p_ExpOrigen.RACs
             ActualizarEstadoPopup "Copiando RACs (" & m_ID & ")"
             DoEvents
             Set m_RAC = p_ExpOrigen.RACs(m_ID)
            Set m_RACDestino = New ExpedienteRAC
            With m_RACDestino
                .IDExpediente = p_ExpDestino.IDExpediente
                .IDRAC = m_RAC.IDRAC
                .IDRacExpediente = .IDRacExpedienteCalculado
                m_SQL = "INSERT INTO TbExpedientesRACs (" & _
                        "IDRACExpediente,IDExpediente,IDRAC) " & _
                        "VALUES (" & .IDRacExpediente & "," & .IDExpediente & "," & .IDRAC & ");"
                getdb().Execute m_SQL
                
            End With
            Set m_RACDestino = Nothing
            
Set m_RAC = Nothing
         Next
      End If

      CerrarPopupProgreso
      Exit Function
errores:
     CerrarPopupProgreso
     If Err.Number <> 1000 Then
         p_Error = "El método ExpedienteOperaciones.CopiarRACs ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
     End If
 End Function
 Public Function CopiarResponsables( _
                                    p_ExpOrigen As Expediente, _
                                    p_ExpDestino As Expediente, _
                                    Optional ByRef p_Error As String _
                                    ) As String
     Dim m_ID As Variant
     Dim m_Responsable As ExpedienteResponsable
     Dim m_ResponsableDestino As ExpedienteResponsable
     Dim m_SQL As String
     
     On Error GoTo errores
     If p_ExpOrigen Is Nothing Or p_ExpDestino Is Nothing Then
        p_Error = "No se ha indicado el expediente de Origen o de destino"
        Err.Raise 1000
     End If
     If p_ExpOrigen.IDExpediente = "" Then
        p_Error = "El expediente de origen parece que todavía no ha sido registrado"
        Err.Raise 1000
     End If
If p_ExpDestino.IDExpediente = "" Then
         p_Error = "El expediente de Destino parece que todavía no ha sido registrado"
         Err.Raise 1000
      End If
      MostrarPopupProgreso "Copiando entidades", "Copiando Responsables..."
      'primero hemos de borrar el destino
      If Not p_ExpDestino.Responsables Is Nothing Then
        For Each m_ID In p_ExpDestino.Responsables
            Set m_Responsable = p_ExpDestino.Responsables(m_ID)
            m_SQL = "DELETE * " & _
                    "FROM TbExpedientesResponsables " & _
                    "WHERE IDExpediente=" & p_ExpDestino.IDExpediente & " " & _
                    "AND IdUsuario=" & m_Responsable.IdUsuario & ";"
            getdb().Execute m_SQL
            Set m_Responsable = Nothing
        Next
     End If
'Las copiamos al destino
      If Not p_ExpOrigen.Responsables Is Nothing Then
         For Each m_ID In p_ExpOrigen.Responsables
             ActualizarEstadoPopup "Copiando Responsables (" & m_ID & ")"
             DoEvents
             Set m_Responsable = p_ExpOrigen.Responsables(m_ID)
            Set m_ResponsableDestino = New ExpedienteResponsable
            With m_ResponsableDestino
                .IDExpediente = p_ExpDestino.IDExpediente
                .IdUsuario = m_Responsable.IdUsuario
                .IDExpedienteResponsable = .IDExpedienteResponsableCalculado
                .CorreoSiempre = m_Responsable.CorreoSiempre
                .EsJefeProyecto = m_Responsable.EsJefeProyecto
                m_SQL = "INSERT INTO TbExpedientesResponsables (" & _
                        "IDExpedienteResponsable,IDExpediente,IdUsuario,CorreoSiempre,EsJefeProyecto) " & _
                        "VALUES (" & .IDExpedienteResponsable & _
                        "," & .IDExpediente & _
                        "," & .IdUsuario & _
                        ",'" & .CorreoSiempre & _
                        "','" & .EsJefeProyecto & "');"
                getdb().Execute m_SQL
                
            End With
            Set m_ResponsableDestino = Nothing
            
Set m_Responsable = Nothing
         Next
      End If

      CerrarPopupProgreso
      Exit Function
errores:
     CerrarPopupProgreso
     If Err.Number <> 1000 Then
         p_Error = "El método ExpedienteOpeResponsableiones.CopiarResponsables ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
     End If
 End Function
 Public Function CopiarAnualidades( _
                                    p_ExpOrigen As Expediente, _
                                    p_ExpDestino As Expediente, _
                                    Optional ByRef p_Error As String _
                                    ) As String
     Dim m_ID As Variant
     Dim m_Anualidad As ExpedienteAnualidad
     Dim m_AnualidadDestino As ExpedienteAnualidad
     Dim m_SQL As String
     
     On Error GoTo errores
     If p_ExpOrigen Is Nothing Or p_ExpDestino Is Nothing Then
        p_Error = "No se ha indicado el expediente de Origen o de destino"
        Err.Raise 1000
     End If
     If p_ExpOrigen.IDExpediente = "" Then
        p_Error = "El expediente de origen parece que todavía no ha sido registrado"
        Err.Raise 1000
     End If
If p_ExpDestino.IDExpediente = "" Then
         p_Error = "El expediente de Destino parece que todavía no ha sido registrado"
         Err.Raise 1000
      End If
      MostrarPopupProgreso "Copiando entidades", "Copiando Anualidades..."
      'primero hemos de borrar el destino
      If Not p_ExpDestino.Anualidades Is Nothing Then
        For Each m_ID In p_ExpDestino.Anualidades
            Set m_Anualidad = p_ExpDestino.Anualidades(m_ID)
            m_SQL = "DELETE * " & _
                    "FROM TbExpedientesAnualidades " & _
                    "WHERE IDExpediente=" & p_ExpDestino.IDExpediente & " " & _
                    "AND Año=" & m_Anualidad.AÑO & ";"
            getdb().Execute m_SQL
            Set m_Anualidad = Nothing
        Next
     End If
'Las copiamos al destino
      If Not p_ExpOrigen.Anualidades Is Nothing Then
         For Each m_ID In p_ExpOrigen.Anualidades
             ActualizarEstadoPopup "Copiando Anualidades (" & m_Anualidad.AÑO & ")"
             DoEvents
             Set m_Anualidad = p_ExpOrigen.Anualidades(m_ID)
            Set m_AnualidadDestino = New ExpedienteAnualidad
            With m_AnualidadDestino
                .IDExpediente = p_ExpDestino.IDExpediente
                .IDAnualidad = .IDAnualidadCalculada
                .AÑO = m_Anualidad.AÑO
                .BIIVA = m_Anualidad.BIIVA
                .BIIPSI = m_Anualidad.BIIPSI
                .BIIGIC = m_Anualidad.BIIGIC
                .BIEXENTA = m_Anualidad.BIEXENTA
                .IVA = m_Anualidad.IVA
                .IPSI = m_Anualidad.IPSI
                .IGIC = m_Anualidad.IGIC
                .PeriodoFacturacion = m_Anualidad.PeriodoFacturacion
                m_SQL = "INSERT INTO TbExpedientesAnualidades (" & _
                        "IDAnualidad,IDExpediente,AÑO,BIIVA,BIIPSI,BIIGIC,BIEXENTA,IVA,IPSI,IGIC,PeriodoFacturacion) " & _
                        "VALUES (" & _
                        .IDAnualidad & _
                        "," & .IDExpediente & _
                        "," & .AÑO & _
                        "," & .BIIVA & _
                        "," & .BIIPSI & _
                        "," & .BIIGIC & _
                        "," & .BIEXENTA & _
                        "," & .IVA & _
                        "," & .IPSI & _
                        "," & .IGIC & _
                        ",'" & .PeriodoFacturacion & "');"
                getdb().Execute m_SQL
                
            End With
            Set m_AnualidadDestino = Nothing
            
Set m_Anualidad = Nothing
         Next
      End If

      CerrarPopupProgreso
      Exit Function
errores:
     CerrarPopupProgreso
     If Err.Number <> 1000 Then
         p_Error = "El método ExpedienteOpeResponsableiones.CopiarAnualidades ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
     End If
 End Function

 Public Function ExtenderEntidadesDeExpediente( _
                                           p_ExpOrigen As Expediente, _
                                           p_ExpDestino As Expediente, _
                                           Optional ByRef p_Error As String _
                                           ) As String
                                        
On Error GoTo errores
     MostrarPopupProgreso "Copiando entidades", "Copiando todas las entidades..."
     Avance "Copiando Jurídicas....:"
     CopiarSuministradores p_ExpOrigen, p_ExpDestino, p_Error
     If p_Error <> "" Then
         Err.Raise 1000
     End If
     ActualizarEstadoPopup "Copiando PECALES..."
     DoEvents
Avance "Copiando PECALES....:"
     CopiarPecales p_ExpOrigen, p_ExpDestino, p_Error
     If p_Error <> "" Then
         Err.Raise 1000
     End If
     ActualizarEstadoPopup "Copiando CPVs..."
     DoEvents
Avance "Copiando CPvs....:"
     CopiarCPVs p_ExpOrigen, p_ExpDestino, p_Error
     If p_Error <> "" Then
         Err.Raise 1000
     End If
     ActualizarEstadoPopup "Copiando Lugares..."
     DoEvents
Avance "Copiando Lugares....:"
     CopiarLugares p_ExpOrigen, p_ExpDestino, p_Error
     If p_Error <> "" Then
         Err.Raise 1000
     End If
     ActualizarEstadoPopup "Copiando Comerciales..."
     DoEvents
Avance "Copiando Comerciales....:"
     CopiarComerciales p_ExpOrigen, p_ExpDestino, p_Error
     If p_Error <> "" Then
         Err.Raise 1000
     End If
     ActualizarEstadoPopup "Copiando RACs..."
     DoEvents
Avance "Copiando RACs....:"
     CopiarRACs p_ExpOrigen, p_ExpDestino, p_Error
     If p_Error <> "" Then
         Err.Raise 1000
     End If
     ActualizarEstadoPopup "Copiando Responsables..."
     DoEvents
Avance "Copiando Responsables....:"
     CopiarResponsables p_ExpOrigen, p_ExpDestino, p_Error
     If p_Error <> "" Then
         Err.Raise 1000
     End If
     ActualizarEstadoPopup "Copiando Anualidades..."
     DoEvents
     Avance "Copiando Anualidades....:"
     CopiarAnualidades p_ExpOrigen, p_ExpDestino, p_Error
     If p_Error <> "" Then
         Err.Raise 1000
     End If
     CerrarPopupProgreso
     Exit Function
errores:
     CerrarPopupProgreso
     If Err.Number <> 1000 Then
        p_Error = "El método ExpedienteOperaciones.ExtenderEntidadesDeExpediente ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
    End If
End Function
Public Function ExtenderEntidades( _
                                    p_Expediente As Expediente, _
                                    Optional ByRef p_Error As String _
                                    ) As String
    
    Dim m_ExpHijo As Expediente
    Dim m_ExpNieto As Expediente
    Dim m_ID As Variant
    Dim m_ID1 As Variant
On Error GoTo errores
     If p_Expediente Is Nothing Then
         p_Error = "No hay un expediente registrado"
         Err.Raise 1000
     End If
     If p_Expediente.IDExpediente = "" Then
         p_Error = "No hay un expediente registrado"
         Err.Raise 1000
     End If
     If p_Expediente.Derivados Is Nothing Then
         p_Error = "El expediente no tiene descendencia"
         Err.Raise 1000
     End If
     MostrarPopupProgreso "Copiando entidades", "Extendiendo entidades a derivados..."
     For Each m_ID In p_Expediente.Derivados
         ActualizarEstadoPopup "Copiando entidades a expediente hijo (" & m_ID & ")"
         DoEvents
         Set m_ExpHijo = p_Expediente.Derivados(m_ID)
        ExtenderEntidadesDeExpediente p_Expediente, m_ExpHijo, p_Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        RegistrarUltimoCambio p_Expediente:=m_ExpHijo
If Not m_ExpHijo.Derivados Is Nothing Then
            For Each m_ID1 In m_ExpHijo.Derivados
                ActualizarEstadoPopup "Copiando entidades a expediente nieto (" & m_ID1 & ")"
                DoEvents
                Set m_ExpNieto = m_ExpHijo.Derivados(m_ID1)
                    ExtenderEntidadesDeExpediente p_Expediente, m_ExpNieto, p_Error
                    If p_Error <> "" Then
                        Err.Raise 1000
                    End If
                    RegistrarUltimoCambio p_Expediente:=m_ExpNieto
                Set m_ExpNieto = Nothing
            Next
        End If

        Set m_ExpHijo = Nothing
     Next
     CerrarPopupProgreso
     Exit Function
errores:
     CerrarPopupProgreso
     If Err.Number <> 1000 Then
        p_Error = "El método ExpedienteOperaciones.ExtenderEntidades ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
    End If
End Function

Public Function PintarTareas( _
                                Optional p_Actualizando As EnumSiNo = EnumSiNo.No, _
                                Optional ByRef p_Error As String _
                            ) As String
            
    
    Dim frm As Form
    Dim lst As ListBox
    Dim m_NTareasExpEstadoDesconocido As Integer
    Dim m_NTareasExpAPuntoDeRecepcionarCompleto As Integer
    Dim m_NTareasExpAPuntoDeRecepcionarHito As Integer
    Dim m_NTareasExpAdjudicadosSinContrato As Integer
    Dim m_NTareasExpAdjudicadosTSOLSinCodS4H As Integer
    Dim m_NTareasExpFaseOfertaPorMuchoTiempo As Integer
    
    Dim m_NTareasTotales As Integer
    On Error GoTo errores
    If Not FormularioAbierto("Form0BDOpciones") And Not FormularioAbierto("FormTareas") _
        And Not FormularioAbierto("FormExpedientesGestion") Then
        Exit Function
    End If
    If p_Actualizando = Empty Then
        p_Actualizando = EnumSiNo.No
    End If
    Avance "Obteniendo las tareas "
    With m_ObjEntorno
        If p_Actualizando = EnumSiNo.Sí Then
            Set .ColExpedientesEstadoDesconocido = Nothing
            Set .ColExpedientesAPuntoDeRecepcionarCompleto = Nothing
            Set .ColExpedientesAPuntoDeRecepcionarHito = Nothing
            Set .ColExpedientesAdjudicadosSinContrato = Nothing
            Set .ColExpedientesAdjudicadosTSOLSinCodS4H = Nothing
            Set .ColExpedientesFaseOfertaPorMuchoTiempo = Nothing
        End If
       
        If Not .ColExpedientesEstadoDesconocido Is Nothing Then
            m_NTareasExpEstadoDesconocido = .ColExpedientesEstadoDesconocido.Count
        End If
        If Not .ColExpedientesAPuntoDeRecepcionarCompleto Is Nothing Then
            m_NTareasExpAPuntoDeRecepcionarCompleto = .ColExpedientesAPuntoDeRecepcionarCompleto.Count
        End If
        If Not .ColExpedientesAPuntoDeRecepcionarHito Is Nothing Then
            m_NTareasExpAPuntoDeRecepcionarHito = .ColExpedientesAPuntoDeRecepcionarHito.Count
        End If
        If Not .ColExpedientesAdjudicadosSinContrato Is Nothing Then
            m_NTareasExpAdjudicadosSinContrato = .ColExpedientesAdjudicadosSinContrato.Count
        End If
        If Not .ColExpedientesAdjudicadosTSOLSinCodS4H Is Nothing Then
            m_NTareasExpAdjudicadosTSOLSinCodS4H = .ColExpedientesAdjudicadosTSOLSinCodS4H.Count
        End If
        If Not .ColExpedientesFaseOfertaPorMuchoTiempo Is Nothing Then
            m_NTareasExpFaseOfertaPorMuchoTiempo = .ColExpedientesFaseOfertaPorMuchoTiempo.Count
        End If
    End With
    m_NTareasTotales = m_NTareasExpEstadoDesconocido + m_NTareasExpAPuntoDeRecepcionarCompleto + _
                        m_NTareasExpAPuntoDeRecepcionarHito + m_NTareasExpAdjudicadosSinContrato + _
                        m_NTareasExpAdjudicadosTSOLSinCodS4H + m_NTareasExpFaseOfertaPorMuchoTiempo
         
    If FormularioAbierto("Form0BDOpciones") Then
        Set frm = Forms("Form0BDOpciones")
        frm.lblNumeroTareas.Visible = True
        Set frm = Forms("Form0BDOpciones")
        If m_NTareasTotales > 0 Then
            frm.ImagenTareasOFF.Visible = False
            frm.ImagenTareasON.Visible = True
            frm.lblNumeroTareas.Caption = m_NTareasTotales
        Else
            frm.ImagenTareasOFF.Visible = True
            frm.ImagenTareasON.Visible = False
            frm.lblNumeroTareas.Caption = "0"
        End If
    End If
   
    If FormularioAbierto("FormTareas") Then
        Set frm = Forms("FormTareas")
        Set lst = frm.ListaTipoTareas
        lst.RowSource = ""
        With lst
            .AddItem EnumTipoTarea.EstadoDesconocido & ";" & "Exp. Estado DESCONOCIDO (" & m_NTareasExpEstadoDesconocido & ")"
            .AddItem EnumTipoTarea.APuntoDeRecepcionarCompleto & ";" & "Exp. a punto de Recepcionar (" & m_NTareasExpAPuntoDeRecepcionarCompleto & ")"
            .AddItem EnumTipoTarea.APuntoDeRecepcionarHito & ";" & "Exp. algún hito a punto de Recepcionar (" & m_NTareasExpAPuntoDeRecepcionarHito & ")"
            .AddItem EnumTipoTarea.AdjudicadoSinContrato & ";" & "Exp.Adjudicados sin Contrato (" & m_NTareasExpAdjudicadosSinContrato & ")"
            .AddItem EnumTipoTarea.AdjudicadosTSOLSinCodS4H & ";" & "Exp.Adjudicados TSOL sin CodS4H (" & m_NTareasExpAdjudicadosTSOLSinCodS4H & ")"
            .AddItem EnumTipoTarea.EnFaseOfertaPorMuchoTiempo & ";" & "Exp.En Fase Oferta por mucho tiempo (" & m_NTareasExpFaseOfertaPorMuchoTiempo & ")"
        End With
        Form_FormTareas.m_TipoTareaSeleccionada = Empty
        Set Form_FormTareas.m_ExpSeleccionado = Nothing
        Form_FormTareas.ListaTipoTareas_Click
    End If
    If FormularioAbierto("FormExpedientesGestion") Then
        Set frm = Forms("FormExpedientesGestion")
        frm.lblNumeroTareas.Visible = True
        Set frm = Forms("FormExpedientesGestion")
        If m_NTareasTotales > 0 Then
            frm.ImagenTareasOFF.Visible = False
            frm.ImagenTareasON.Visible = True
            frm.lblNumeroTareas.Caption = m_NTareasTotales
        Else
            frm.ImagenTareasOFF.Visible = True
            frm.ImagenTareasON.Visible = False
            frm.lblNumeroTareas.Caption = "0"
        End If
    End If
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método PintarTareas ha devuelto el error: " & vbNewLine & Err.Description
    End If
    
End Function


Public Function RegistrarMostrarEstado( _
                                        Optional p_MostrarEstado As String = "Sí", _
                                        Optional ByRef p_Error As String _
                                        ) As MostrarEstado

    Dim m_SQL As String
    Dim rcdDatos As DAO.Recordset
    Dim m_Mostrar As MostrarEstado
    
    On Error GoTo errores
    
    If m_ObjUsuarioConectado Is Nothing Then
        Exit Function
    End If
    
    If p_MostrarEstado <> "Sí" And p_MostrarEstado <> "No" Then
        p_MostrarEstado = "Sí"
    End If
    Set m_Mostrar = constructor.getMostrarEstado(p_UsuarioRed:=m_ObjUsuarioConectado.usuarioRed, p_Error:=p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If Not m_Mostrar Is Nothing Then
        If m_Mostrar.MostrarEstado = p_MostrarEstado Then
            Set RegistrarMostrarEstado = m_Mostrar
            Exit Function
        Else
            m_Mostrar.MostrarEstado = p_MostrarEstado
        End If
    Else
        Set m_Mostrar = New MostrarEstado
        With m_Mostrar
            .ID = .IDCalculado
            .usuarioRed = m_ObjUsuarioConectado.usuarioRed
            .MostrarEstado = p_MostrarEstado
        End With
    End If
     m_SQL = "SELECT * " & _
            "FROM TbConfMostrarEstado " & _
            "WHERE UsuarioRed='" & m_ObjUsuarioConectado.usuarioRed & "';"
            
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    If rcdDatos.EOF Then
        rcdDatos.AddNew
            
            rcdDatos.Fields("ID") = m_Mostrar.ID
            rcdDatos.Fields("UsuarioRed") = m_Mostrar.usuarioRed
            rcdDatos.Fields("MostrarEstado") = m_Mostrar.MostrarEstado
            
        rcdDatos.Update
    Else
        rcdDatos.Edit
            rcdDatos.Fields("MostrarEstado") = m_Mostrar.MostrarEstado
        rcdDatos.Update
    End If
    rcdDatos.Close
    Set rcdDatos = Nothing
    
    Set RegistrarMostrarEstado = m_Mostrar
    
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método RegistrarMostrarEstado.Registrar ha producido el error nº: " & Err.Number & _
        vbCrLf & "Detalle: " & Err.Description
    End If
    
End Function

Public Function ExpedienteOrdinalUsado( _
                                            p_IDExpedientePadre As String, _
                                            p_Ordinal As String, _
                                            Optional ByRef p_Error As String _
                                            ) As Expediente
    Dim m_SQL As String
    Dim rcdDatos As DAO.Recordset
    
    
    
    On Error GoTo errores
    If p_IDExpedientePadre = "" Then
        Exit Function
    End If
    
        
    m_SQL = "SELECT IDExpediente " & _
            "FROM TbExpedientes " & _
            "WHERE IDExpedientePadre=" & p_IDExpedientePadre & _
            " AND Ordinal='" & p_Ordinal & "';"
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    If Not rcdDatos.EOF Then
       
        Set ExpedienteOrdinalUsado = constructor.getExpediente( _
                                p_IDExpediente:=rcdDatos.Fields("IDExpediente").value, _
                                p_Error:=p_Error)
        If p_Error <> "" Then
            Err.Raise 1000
        End If
       
        
    End If
    rcdDatos.Close
    Set rcdDatos = Nothing
    
    
    Exit Function
     
errores:
     If Err.Number <> 1000 Then
         p_Error = "El método ExpedienteOperaciones.ExpedienteOrdinalUsado ha devuelto el error: " & Err.Description
     End If

End Function
Public Function HTMLENTXT( _
                            Optional p_HTML As String, _
                            Optional m_mensaje As ADODB.stream, _
                            Optional p_Mostrandolo As EnumSiNo = EnumSiNo.Sí, _
                            Optional ByRef p_Error As String _
                            ) As String
    
    Dim F1 As Object
    Dim m_URLHTML As String
    Dim m_URLTXT As String
    Dim m_URLCompletaArchivo As String
    Dim m_Nombre As String
        
    On Error GoTo errores
    
    If p_HTML = "" And m_mensaje Is Nothing Then
        p_Error = "No se ha indicado el HTML"
        Err.Raise 1000
    End If
       
    DameUntxtYHtml m_URLTXT, m_URLHTML, p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
   
    If p_HTML <> "" Then
        Set F1 = fso.CreateTextFile(m_URLTXT, True)
        F1.WriteLine p_HTML
        F1.Close
        fso.GetFile(m_URLTXT).Name = fso.GetBaseName(m_URLTXT) & ".html"
    Else
        m_mensaje.SaveToFile m_URLHTML
    End If
    If p_Mostrandolo = EnumSiNo.Sí Then
        Ejecutar Screen.ActiveForm.hwnd, "open", m_URLHTML, "", "", 1
    End If
    
    HTMLENTXT = m_URLHTML
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método HTMLENTXT ha devuelto el error: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
    End If
        
    
End Function
Public Function EscribirTextoAArchivo( _
                                        p_Texto As String, _
                                        p_URLArchivo As String, _
                                        Optional ByRef p_Error As String _
                                        ) As String
    
    Dim stream As ADODB.stream
        
    On Error GoTo errores
    
    If p_Texto = "" Then
        p_Error = "No se ha indicado el Texto"
        Err.Raise 1000
    End If
    If p_URLArchivo = "" Then
        p_Error = "No se ha indicado la URL del Archivo"
        Err.Raise 1000
    End If
    If fso.FileExists(p_URLArchivo) Then
        If FicheroAbierto(p_URLArchivo) Then
            p_Error = "El archivo está abierto o es de sólo lectura"
            Err.Raise 1000
        End If
    End If
    Set stream = New ADODB.stream
    With stream
        .Type = 2 ' 2 indica texto
        .Charset = "UTF-8"
        .Open
        .WriteText p_Texto
        .SaveToFile p_URLArchivo, 2 ' 2 para sobrescribir si existe
        .Close
    End With
    Set stream = Nothing
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método EscribirTextoAArchivo ha devuelto el error: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
    End If
        
    
End Function

Private Function DameUntxtYHtml( _
                                ByRef p_URLTXT As String, _
                                ByRef p_URLHTML As String, _
                                Optional ByRef p_Error As String) As String
    
    Dim m_URLHTML As String
    Dim m_URLTXT As String
    Dim i As Integer
    
    
    Dim m_NombreHTML As String
    Dim m_Nombretxt As String
    
    On Error GoTo errores
    BorraHTMLs
    For i = 1 To 50
        m_Nombretxt = "HTML" & i & ".txt"
        m_NombreHTML = "HTML" & i & ".html"
        m_URLTXT = m_ObjEntorno.URLDirectorioLocal & m_Nombretxt
        m_URLHTML = m_ObjEntorno.URLDirectorioLocal & m_NombreHTML
        If Not fso.FileExists(m_URLHTML) And Not fso.FileExists(m_URLHTML) Then
            p_URLTXT = m_URLTXT
            p_URLHTML = m_URLHTML
            Exit Function
        End If
    Next
    
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método DameUntxtYHtml ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
    End If
End Function
Private Function BorraHTMLs( _
                            Optional ByRef p_Error As String) As String
    
    Dim fichero As File
    
    On Error GoTo errores
    
    For Each fichero In fso.GetFolder(m_ObjEntorno.URLDirectorioLocal).Files
        If fso.GetExtensionName(fichero.Path) = "html" Or fso.GetExtensionName(fichero.Path) = "htm" Then
            If Not FicheroAbierto(fichero.Path) Then
                fso.DeleteFile fichero.Path
            End If
        End If
    Next
    
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método BorraHTMLs ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
    End If
End Function


Public Function getURLInformeExpedientesEstadoDesconocido( _
                                                            Optional ByRef p_Error As String _
                                                            ) As String

    
    Dim m_HTML As ADODB.stream
    
    
    On Error GoTo errores
    
    
    
    Set m_HTML = HTMLExpedientesEstadoDesconocido(p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    
    getURLInformeExpedientesEstadoDesconocido = HTMLENTXT(, m_HTML, EnumSiNo.Sí, p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If

    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getURLInformeExpedientesEstadoDesconocido ha producido el error num " & Err.Number & _
        vbCrLf & "Detalle: " & Err.Description
    End If

End Function
Public Function getURLInformeExpedientesAPuntoDeRecepcionarCompleto( _
                                                                    Optional ByRef p_Error As String _
                                                                    ) As String

    
    Dim m_HTML As ADODB.stream
    
    
    On Error GoTo errores
    
    
    
    Set m_HTML = HTMLExpedientesAPuntoDeRecepcionarCompleto(p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    
    getURLInformeExpedientesAPuntoDeRecepcionarCompleto = HTMLENTXT(, m_HTML, EnumSiNo.Sí, p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If

    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getURLInformeExpedientesAPuntoDeRecepcionarCompleto ha producido el error num " & Err.Number & _
        vbCrLf & "Detalle: " & Err.Description
    End If

End Function
Public Function getURLInformeExpedientesAPuntoDeRecepcionarHito( _
                                                                    Optional ByRef p_Error As String _
                                                                    ) As String

    
    Dim m_HTML As ADODB.stream
    
    
    On Error GoTo errores
    
    
    
    Set m_HTML = HTMLExpedientesAPuntoDeRecepcionarHito(p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    
    getURLInformeExpedientesAPuntoDeRecepcionarHito = HTMLENTXT(, m_HTML, EnumSiNo.Sí, p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If

    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getURLInformeExpedientesAPuntoDeRecepcionarHito ha producido el error num " & Err.Number & _
        vbCrLf & "Detalle: " & Err.Description
    End If

End Function
Public Function getURLInformeExpedientesAdjudicadosSinContrato( _
                                                            Optional ByRef p_Error As String _
                                                            ) As String

    
    Dim m_HTML As ADODB.stream
    
    
    On Error GoTo errores
    
    
    
    Set m_HTML = HTMLExpedientesAdjudicadosSinContrato(p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    
    getURLInformeExpedientesAdjudicadosSinContrato = HTMLENTXT(, m_HTML, EnumSiNo.Sí, p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If

    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getURLInformeExpedientesAdjudicadosSinContrato ha producido el error num " & Err.Number & _
        vbCrLf & "Detalle: " & Err.Description
    End If

End Function

Public Function getURLInformeExpedientesAdjudicadosTSOLSinCodS4H( _
                                                            Optional ByRef p_Error As String _
                                                            ) As String

    
    Dim m_HTML As ADODB.stream
    
    
    On Error GoTo errores
    
    
    
    Set m_HTML = HTMLExpedientesAdjudicadosTSOLSinCodS4H(p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    
    getURLInformeExpedientesAdjudicadosTSOLSinCodS4H = HTMLENTXT(, m_HTML, EnumSiNo.Sí, p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If

    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getURLInformeExpedientesAdjudicadosTSOLSinCodS4H ha producido el error num " & Err.Number & _
        vbCrLf & "Detalle: " & Err.Description
    End If

End Function
Public Function getURLInformeExpedientesFaseOfertaPorMuchoTiempo( _
                                                            Optional ByRef p_Error As String _
                                                            ) As String

    
    Dim m_HTML As ADODB.stream
    
    
    On Error GoTo errores
    
    
    
    Set m_HTML = HTMLExpedientesFaseOfertaPorMuchoTiempo(p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    
    getURLInformeExpedientesFaseOfertaPorMuchoTiempo = HTMLENTXT(, m_HTML, EnumSiNo.Sí, p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If

    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getURLInformeExpedientesFaseOfertaPorMuchoTiempo ha producido el error num " & Err.Number & _
        vbCrLf & "Detalle: " & Err.Description
    End If

End Function
Private Function HTMLExpedientesEstadoDesconocido( _
                                                Optional ByRef p_Error As String _
                                                ) As ADODB.stream

    Dim m_mensaje As String
    Dim m_Cabecera As String
    Dim m_HTMLTablaxpedientesEstadoDesconocido As String
    
    
    On Error GoTo errores
    
    m_HTMLTablaxpedientesEstadoDesconocido = getHTMLTablaExpedientesEstadoDesconocido(p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    Set HTMLExpedientesEstadoDesconocido = New ADODB.stream
    HTMLExpedientesEstadoDesconocido.Open
    
    m_Cabecera = DameCabeceraHTML("Expedientes Estados Desconocido", p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    
    m_mensaje = m_Cabecera & vbNewLine
    m_mensaje = m_mensaje & "<br /><br />" & vbNewLine
    m_mensaje = m_mensaje & m_HTMLTablaxpedientesEstadoDesconocido & vbNewLine
    m_mensaje = m_mensaje & "</body>" & vbNewLine
    m_mensaje = m_mensaje & "</html>" & vbNewLine
    
    HTMLExpedientesEstadoDesconocido.WriteText m_mensaje


    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método HTMLExpedientesEstadoDesconocido ha producido el error num " & Err.Number & _
        vbCrLf & "Detalle: " & Err.Description
    End If

End Function
Private Function HTMLExpedientesAPuntoDeRecepcionarCompleto( _
                                                            Optional ByRef p_Error As String _
                                                            ) As ADODB.stream

    Dim m_mensaje As String
    Dim m_Cabecera As String
    Dim m_HTMLTabla As String
    
    
    On Error GoTo errores
    
    m_HTMLTabla = getHTMLTablaExpedientesAPuntoDeRecepcionarCompleto(p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    Set HTMLExpedientesAPuntoDeRecepcionarCompleto = New ADODB.stream
    HTMLExpedientesAPuntoDeRecepcionarCompleto.Open
    
    m_Cabecera = DameCabeceraHTML("Expedientes A Punto de Finalizar/Recepcionar", p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    
    m_mensaje = m_Cabecera & vbNewLine
    m_mensaje = m_mensaje & "<br /><br />" & vbNewLine
    m_mensaje = m_mensaje & m_HTMLTabla & vbNewLine
    m_mensaje = m_mensaje & "</body>" & vbNewLine
    m_mensaje = m_mensaje & "</html>" & vbNewLine
    
    HTMLExpedientesAPuntoDeRecepcionarCompleto.WriteText m_mensaje


    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método HTMLExpedientesAPuntoDeRecepcionarCompleto ha producido el error num " & Err.Number & _
        vbCrLf & "Detalle: " & Err.Description
    End If

End Function
Private Function HTMLExpedientesAPuntoDeRecepcionarHito( _
                                                            Optional ByRef p_Error As String _
                                                            ) As ADODB.stream

    Dim m_mensaje As String
    Dim m_Cabecera As String
    Dim m_HTMLTabla As String
    
    
    On Error GoTo errores
    
    m_HTMLTabla = getHTMLTablaExpedientesAPuntoDeRecepcionarHito(p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    Set HTMLExpedientesAPuntoDeRecepcionarHito = New ADODB.stream
    HTMLExpedientesAPuntoDeRecepcionarHito.Open
    
    m_Cabecera = DameCabeceraHTML("Expedientes A Punto de Finalizar/Recepcionar", p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    
    m_mensaje = m_Cabecera & vbNewLine
    m_mensaje = m_mensaje & "<br /><br />" & vbNewLine
    m_mensaje = m_mensaje & m_HTMLTabla & vbNewLine
    m_mensaje = m_mensaje & "</body>" & vbNewLine
    m_mensaje = m_mensaje & "</html>" & vbNewLine
    
    HTMLExpedientesAPuntoDeRecepcionarHito.WriteText m_mensaje


    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método HTMLExpedientesAPuntoDeRecepcionarHito ha producido el error num " & Err.Number & _
        vbCrLf & "Detalle: " & Err.Description
    End If

End Function
Private Function HTMLExpedientesAdjudicadosSinContrato( _
                                                        Optional ByRef p_Error As String _
                                                        ) As ADODB.stream

    Dim m_mensaje As String
    Dim m_Cabecera As String
    Dim m_HTMLTabla As String
    
    
    On Error GoTo errores
    
    m_HTMLTabla = getHTMLTablaExpedientesAdjudicadosSinContrato(p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    Set HTMLExpedientesAdjudicadosSinContrato = New ADODB.stream
    HTMLExpedientesAdjudicadosSinContrato.Open
    
    m_Cabecera = DameCabeceraHTML("Expedientes Adjudicados sin Contrato", p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    
    m_mensaje = m_Cabecera & vbNewLine
    m_mensaje = m_mensaje & "<br /><br />" & vbNewLine
    m_mensaje = m_mensaje & m_HTMLTabla & vbNewLine
    m_mensaje = m_mensaje & "</body>" & vbNewLine
    m_mensaje = m_mensaje & "</html>" & vbNewLine
    
    HTMLExpedientesAdjudicadosSinContrato.WriteText m_mensaje


    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método HTMLExpedientesAdjudicadosSinContrato ha producido el error num " & Err.Number & _
        vbCrLf & "Detalle: " & Err.Description
    End If

End Function
Private Function HTMLExpedientesAdjudicadosTSOLSinCodS4H( _
                                                        Optional ByRef p_Error As String _
                                                        ) As ADODB.stream

    Dim m_mensaje As String
    Dim m_Cabecera As String
    Dim m_HTMLTabla As String
    
    
    On Error GoTo errores
    
    m_HTMLTabla = getHTMLTablaExpedientesAdjudicadosTSOLSinCodS4H(p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    Set HTMLExpedientesAdjudicadosTSOLSinCodS4H = New ADODB.stream
    HTMLExpedientesAdjudicadosTSOLSinCodS4H.Open
    
    m_Cabecera = DameCabeceraHTML("Expedientes Adjudicados de TSOL sin  sin CodS4H", p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    
    m_mensaje = m_Cabecera & vbNewLine
    m_mensaje = m_mensaje & "<br /><br />" & vbNewLine
    m_mensaje = m_mensaje & m_HTMLTabla & vbNewLine
    m_mensaje = m_mensaje & "</body>" & vbNewLine
    m_mensaje = m_mensaje & "</html>" & vbNewLine
    
    HTMLExpedientesAdjudicadosTSOLSinCodS4H.WriteText m_mensaje


    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método HTMLExpedientesAdjudicadosTSOLSinCodS4H ha producido el error num " & Err.Number & _
        vbCrLf & "Detalle: " & Err.Description
    End If

End Function
Private Function HTMLExpedientesFaseOfertaPorMuchoTiempo( _
                                                        Optional ByRef p_Error As String _
                                                        ) As ADODB.stream

    Dim m_mensaje As String
    Dim m_Cabecera As String
    Dim m_HTMLTabla As String
    
    
    On Error GoTo errores
    
    m_HTMLTabla = getHTMLTablaExpedientesFaseOfertaPorMuchoTiempo(p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    Set HTMLExpedientesFaseOfertaPorMuchoTiempo = New ADODB.stream
    HTMLExpedientesFaseOfertaPorMuchoTiempo.Open
    
    m_Cabecera = DameCabeceraHTML("Expedientes en fase de oferta sin resolución", p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    
    m_mensaje = m_Cabecera & vbNewLine
    m_mensaje = m_mensaje & "<br /><br />" & vbNewLine
    m_mensaje = m_mensaje & m_HTMLTabla & vbNewLine
    m_mensaje = m_mensaje & "</body>" & vbNewLine
    m_mensaje = m_mensaje & "</html>" & vbNewLine
    
    HTMLExpedientesFaseOfertaPorMuchoTiempo.WriteText m_mensaje


    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método HTMLExpedientesFaseOfertaPorMuchoTiempo ha producido el error num " & Err.Number & _
        vbCrLf & "Detalle: " & Err.Description
    End If

End Function
Private Function getHTMLTablaExpedientesEstadoDesconocido( _
                                                            Optional ByRef p_Error As String _
                                                            ) As String

    Dim m_ID As Variant
    Dim m_expediente As Expediente
    Dim m_Col As Scripting.Dictionary
    Dim m_mensaje As String
    
    On Error GoTo errores
    
    m_mensaje = m_mensaje & "<table>" & vbNewLine
        m_mensaje = m_mensaje & "<tr>" & vbNewLine
            m_mensaje = m_mensaje & "<td colspan='10' class=""ColespanArriba""> EXPEDIENTES CON ESTADO DESCONOCIDO </td>"
        m_mensaje = m_mensaje & "</tr>" & vbNewLine
        m_mensaje = m_mensaje & "<tr>" & vbNewLine
            m_mensaje = m_mensaje & "<td class=""Cabecera"" > <strong>IDExp</strong></td>"
            m_mensaje = m_mensaje & "<td class=""Cabecera"" > <strong>CÓDIGO</strong></td>"
            m_mensaje = m_mensaje & "<td class=""Cabecera"" > <strong>NEMOTÉCNICO</strong></td>"
            m_mensaje = m_mensaje & "<td class=""Cabecera"" > <strong>TÍTULO</strong></td>"
            m_mensaje = m_mensaje & "<td class=""Cabecera"" > <strong>RESP. CALIDAD</strong></td>"
            m_mensaje = m_mensaje & "<td class=""Cabecera"" > <strong>RESP. SEGURIDAD</strong></td>"
            m_mensaje = m_mensaje & "<td class=""Cabecera"" > <strong>F.INICIO</strong></td>"
            m_mensaje = m_mensaje & "<td class=""Cabecera"" > <strong>F.FIN </strong></td>"
            m_mensaje = m_mensaje & "<td class=""Cabecera"" > <strong>GARANTIAMESES </strong></td>"
            m_mensaje = m_mensaje & "<td class=""Cabecera"" > <strong>Estado</strong></td>"
        m_mensaje = m_mensaje & "</tr>" & vbNewLine
        Set m_Col = m_ObjEntorno.ColExpedientesEstadoDesconocido
        If m_Col.Count = 0 Then
            m_mensaje = m_mensaje & "</table>" & vbNewLine
            getHTMLTablaExpedientesEstadoDesconocido = m_mensaje
            Exit Function
        End If
        For Each m_ID In m_Col
            Set m_expediente = m_Col(m_ID)
            m_mensaje = m_mensaje & "<tr>" & vbNewLine
                m_mensaje = m_mensaje & "<td> " & m_ID & "</td>" & vbNewLine
                m_mensaje = m_mensaje & "<td> " & m_expediente.CodExp & "</td>" & vbNewLine
                If m_expediente.NemotecnicoCalculado <> "" Then
                    m_mensaje = m_mensaje & "<td> " & m_expediente.NemotecnicoCalculado & "</td>" & vbNewLine
                Else
                    m_mensaje = m_mensaje & "<td> &nbsp;</td>" & vbNewLine
                End If
                
                m_mensaje = m_mensaje & "<td> " & m_expediente.Titulo & "</td>" & vbNewLine
                If Not m_expediente.responsableCalidad Is Nothing Then
                    If m_expediente.responsableCalidad.Nombre <> "" Then
                        m_mensaje = m_mensaje & "<td> " & m_expediente.responsableCalidad.Nombre & "</td>" & vbNewLine
                    Else
                        m_mensaje = m_mensaje & "<td> &nbsp;</td>" & vbNewLine
                    End If
                Else
                    m_mensaje = m_mensaje & "<td> &nbsp;</td>" & vbNewLine
                End If
                If Not m_expediente.responsableSeguridad Is Nothing Then
                    If m_expediente.responsableSeguridad.Nombre <> "" Then
                        m_mensaje = m_mensaje & "<td> " & m_expediente.responsableSeguridad.Nombre & "</td>" & vbNewLine
                    Else
                        m_mensaje = m_mensaje & "<td> &nbsp;</td>" & vbNewLine
                    End If
                Else
                    m_mensaje = m_mensaje & "<td> &nbsp;</td>" & vbNewLine
                End If
                If IsDate(m_expediente.FechaInicioContrato) Then
                    m_mensaje = m_mensaje & "<td> " & m_expediente.FechaInicioContrato & "</td>" & vbNewLine
                Else
                    m_mensaje = m_mensaje & "<td> &nbsp;</td>" & vbNewLine
                End If
                If IsDate(m_expediente.FechaFinContrato) Then
                    m_mensaje = m_mensaje & "<td> " & m_expediente.FechaFinContrato & "</td>" & vbNewLine
                Else
                    m_mensaje = m_mensaje & "<td> &nbsp;</td>" & vbNewLine
                End If
                If IsNumeric(m_expediente.GARANTIAMESES) Then
                    m_mensaje = m_mensaje & "<td> " & m_expediente.GARANTIAMESES & "</td>" & vbNewLine
                Else
                    m_mensaje = m_mensaje & "<td> &nbsp;</td>" & vbNewLine
                End If
                If m_expediente.ESTADOCalculadoTitulo <> "" Then
                    m_mensaje = m_mensaje & "<td> " & m_expediente.ESTADOCalculadoTitulo & "</td>" & vbNewLine
                Else
                    m_mensaje = m_mensaje & "<td> &nbsp;</td>" & vbNewLine
                End If
                
            m_mensaje = m_mensaje & "</tr>" & vbNewLine
            Set m_expediente = Nothing
            
            
            
            
        Next
    m_mensaje = m_mensaje & "</table>" & vbNewLine

    getHTMLTablaExpedientesEstadoDesconocido = m_mensaje
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getHTMLTablaExpedientesEstadoDesconocido ha producido el error num " & Err.Number & _
        vbCrLf & "Detalle: " & Err.Description
    End If

End Function

Private Function getHTMLTablaExpedientesAPuntoDeRecepcionarCompleto( _
                                                            Optional ByRef p_Error As String _
                                                            ) As String

    Dim m_ID As Variant
    Dim m_expediente As Expediente
    Dim m_Col As Scripting.Dictionary
    Dim m_DiasParaElFin As String
    Dim m_mensaje As String
    
    On Error GoTo errores
    
    m_mensaje = m_mensaje & "<table>" & vbNewLine
        m_mensaje = m_mensaje & "<tr>" & vbNewLine
            m_mensaje = m_mensaje & "<td colspan='12' class=""ColespanArriba""> EXPEDIENTES A PUNTO DE FINALIZAR/RECEPCIONAR </td>"
        m_mensaje = m_mensaje & "</tr>" & vbNewLine
        m_mensaje = m_mensaje & "<tr>" & vbNewLine
            m_mensaje = m_mensaje & "<td class=""centrado"" > <strong>IDExp</strong></td>"
            m_mensaje = m_mensaje & "<td class=""centrado"" > <strong>CÓDIGO</strong></td>"
            m_mensaje = m_mensaje & "<td class=""centrado"" > <strong>NEMOTÉCNICO</strong></td>"
            m_mensaje = m_mensaje & "<td class=""centrado"" > <strong>TÍTULO</strong></td>"
            m_mensaje = m_mensaje & "<td class=""centrado"" > <strong>RESP. CALIDAD</strong></td>"
            m_mensaje = m_mensaje & "<td class=""centrado"" > <strong>RESP. SEGURIDAD</strong></td>"
            m_mensaje = m_mensaje & "<td class=""centrado"" > <strong>F.INICIO</strong></td>"
            m_mensaje = m_mensaje & "<td class=""centrado"" > <strong>F.FIN </strong></td>"
            m_mensaje = m_mensaje & "<td class=""centrado"" > <strong>F.FIN GARANTÍA </strong></td>"
            m_mensaje = m_mensaje & "<td class=""centrado"" > <strong>MESES GARANTÍA </strong></td>"
            m_mensaje = m_mensaje & "<td class=""centrado"" > <strong>F.CERTIFICACIÓN </strong></td>"
            m_mensaje = m_mensaje & "<td class=""centrado"" > <strong>Días para el FIN</strong></td>"
        m_mensaje = m_mensaje & "</tr>" & vbNewLine
        Set m_Col = m_ObjEntorno.ColExpedientesAPuntoDeRecepcionarCompleto
        If m_Col.Count = 0 Then
            m_mensaje = m_mensaje & "</table>" & vbNewLine
            getHTMLTablaExpedientesAPuntoDeRecepcionarCompleto = m_mensaje
            Exit Function
        End If
        For Each m_ID In m_Col
            Set m_expediente = m_Col(m_ID)
            m_mensaje = m_mensaje & "<tr>" & vbNewLine
                m_mensaje = m_mensaje & "<td> " & m_ID & "</td>" & vbNewLine
                m_mensaje = m_mensaje & "<td> " & m_expediente.CodExp & "</td>" & vbNewLine
                If m_expediente.NemotecnicoCalculado <> "" Then
                    m_mensaje = m_mensaje & "<td> " & m_expediente.NemotecnicoCalculado & "</td>" & vbNewLine
                Else
                    m_mensaje = m_mensaje & "<td> &nbsp;</td>" & vbNewLine
                End If
                
                m_mensaje = m_mensaje & "<td> " & m_expediente.Titulo & "</td>" & vbNewLine
                If Not m_expediente.responsableCalidad Is Nothing Then
                    If m_expediente.responsableCalidad.Nombre <> "" Then
                        m_mensaje = m_mensaje & "<td> " & m_expediente.responsableCalidad.Nombre & "</td>" & vbNewLine
                    Else
                        m_mensaje = m_mensaje & "<td> &nbsp;</td>" & vbNewLine
                    End If
                Else
                    m_mensaje = m_mensaje & "<td> &nbsp;</td>" & vbNewLine
                End If
                If Not m_expediente.responsableSeguridad Is Nothing Then
                    If m_expediente.responsableSeguridad.Nombre <> "" Then
                        m_mensaje = m_mensaje & "<td> " & m_expediente.responsableSeguridad.Nombre & "</td>" & vbNewLine
                    Else
                        m_mensaje = m_mensaje & "<td> &nbsp;</td>" & vbNewLine
                    End If
                Else
                    m_mensaje = m_mensaje & "<td> &nbsp;</td>" & vbNewLine
                End If
                If IsDate(m_expediente.FechaInicioContrato) Then
                    m_mensaje = m_mensaje & "<td> " & m_expediente.FechaInicioContrato & "</td>" & vbNewLine
                Else
                    m_mensaje = m_mensaje & "<td> &nbsp;</td>" & vbNewLine
                End If
                If IsDate(m_expediente.FechaFinContrato) Then
                    m_mensaje = m_mensaje & "<td> " & m_expediente.FechaFinContrato & "</td>" & vbNewLine
                Else
                    m_mensaje = m_mensaje & "<td> &nbsp;</td>" & vbNewLine
                End If
                If IsDate(m_expediente.FechaFinGarantia) Then
                    m_mensaje = m_mensaje & "<td> " & m_expediente.FechaFinGarantia & "</td>" & vbNewLine
                Else
                    m_mensaje = m_mensaje & "<td> &nbsp;</td>" & vbNewLine
                End If
                
                If IsNumeric(m_expediente.GARANTIAMESES) Then
                    m_mensaje = m_mensaje & "<td> " & m_expediente.GARANTIAMESES & "</td>" & vbNewLine
                Else
                    m_mensaje = m_mensaje & "<td> &nbsp;</td>" & vbNewLine
                End If
                If IsDate(m_expediente.FECHACERTIFICACION) Then
                    m_mensaje = m_mensaje & "<td> " & m_expediente.FECHACERTIFICACION & "</td>" & vbNewLine
                Else
                    m_mensaje = m_mensaje & "<td> &nbsp;</td>" & vbNewLine
                End If
                If IsNumeric(m_expediente.DiasParaElFin) Then
                    m_mensaje = m_mensaje & "<td> " & m_expediente.DiasParaElFin & "</td>" & vbNewLine
                Else
                    m_mensaje = m_mensaje & "<td> &nbsp;</td>" & vbNewLine
                End If
                
            m_mensaje = m_mensaje & "</tr>" & vbNewLine
            Set m_expediente = Nothing
        Next
    m_mensaje = m_mensaje & "</table>" & vbNewLine

    getHTMLTablaExpedientesAPuntoDeRecepcionarCompleto = m_mensaje
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getHTMLTablaExpedientesAPuntoDeRecepcionarCompleto ha producido el error num " & Err.Number & _
        vbCrLf & "Detalle: " & Err.Description
    End If

End Function
Private Function getHTMLTablaExpedientesAPuntoDeRecepcionarHito( _
                                                            Optional ByRef p_Error As String _
                                                            ) As String

    Dim m_ID As Variant
    Dim m_expediente As Expediente
    Dim m_ExpHito As ExpedienteHito
    Dim m_Col As Scripting.Dictionary
    Dim m_DiasParaElFin As String
    Dim m_mensaje As String
    
    On Error GoTo errores
    
    m_mensaje = m_mensaje & "<table>" & vbNewLine
        m_mensaje = m_mensaje & "<tr>" & vbNewLine
            m_mensaje = m_mensaje & "<td colspan='12' class=""ColespanArriba""> HITOS A PUNTO DE FINALIZAR/RECEPCIONAR </td>"
        m_mensaje = m_mensaje & "</tr>" & vbNewLine
        m_mensaje = m_mensaje & "<tr>" & vbNewLine
            m_mensaje = m_mensaje & "<td class=""centrado"" > <strong>IDExp</strong></td>"
            m_mensaje = m_mensaje & "<td class=""centrado"" > <strong>CÓDIGO</strong></td>"
            m_mensaje = m_mensaje & "<td class=""centrado"" > <strong>NEMOTÉCNICO</strong></td>"
            m_mensaje = m_mensaje & "<td class=""centrado"" > <strong>TÍTULO</strong></td>"
            m_mensaje = m_mensaje & "<td class=""centrado"" > <strong>RESP. CALIDAD</strong></td>"
            m_mensaje = m_mensaje & "<td class=""centrado"" > <strong>RESP. SEGURIDAD</strong></td>"
            m_mensaje = m_mensaje & "<td class=""centrado"" > <strong>F.INICIO</strong></td>"
            m_mensaje = m_mensaje & "<td class=""centrado"" > <strong>F.FIN </strong></td>"
            m_mensaje = m_mensaje & "<td class=""centrado"" > <strong>F.FIN GARANTÍA </strong></td>"
            m_mensaje = m_mensaje & "<td class=""centrado"" > <strong>MESES GARANTÍA </strong></td>"
            m_mensaje = m_mensaje & "<td class=""centrado"" > <strong>DESC. HITO </strong></td>"
            m_mensaje = m_mensaje & "<td class=""centrado"" > <strong>F.HITO </strong></td>"
            m_mensaje = m_mensaje & "<td class=""centrado"" > <strong>Días para el FIN</strong></td>"
        m_mensaje = m_mensaje & "</tr>" & vbNewLine
        Set m_Col = m_ObjEntorno.ColExpedientesAPuntoDeRecepcionarHito
        If m_Col.Count = 0 Then
            m_mensaje = m_mensaje & "</table>" & vbNewLine
            getHTMLTablaExpedientesAPuntoDeRecepcionarHito = m_mensaje
            Exit Function
        End If
        For Each m_ID In m_Col
            Set m_ExpHito = m_Col(m_ID)
            Set m_expediente = m_ExpHito.Expediente
            m_mensaje = m_mensaje & "<tr>" & vbNewLine
                m_mensaje = m_mensaje & "<td> " & m_ID & "</td>" & vbNewLine
                m_mensaje = m_mensaje & "<td> " & m_expediente.CodExp & "</td>" & vbNewLine
                If m_expediente.NemotecnicoCalculado <> "" Then
                    m_mensaje = m_mensaje & "<td> " & m_expediente.NemotecnicoCalculado & "</td>" & vbNewLine
                Else
                    m_mensaje = m_mensaje & "<td> &nbsp;</td>" & vbNewLine
                End If
                
                m_mensaje = m_mensaje & "<td> " & m_expediente.Titulo & "</td>" & vbNewLine
                If Not m_expediente.responsableCalidad Is Nothing Then
                    If m_expediente.responsableCalidad.Nombre <> "" Then
                        m_mensaje = m_mensaje & "<td> " & m_expediente.responsableCalidad.Nombre & "</td>" & vbNewLine
                    Else
                        m_mensaje = m_mensaje & "<td> &nbsp;</td>" & vbNewLine
                    End If
                Else
                    m_mensaje = m_mensaje & "<td> &nbsp;</td>" & vbNewLine
                End If
                If Not m_expediente.responsableSeguridad Is Nothing Then
                    If m_expediente.responsableSeguridad.Nombre <> "" Then
                        m_mensaje = m_mensaje & "<td> " & m_expediente.responsableSeguridad.Nombre & "</td>" & vbNewLine
                    Else
                        m_mensaje = m_mensaje & "<td> &nbsp;</td>" & vbNewLine
                    End If
                Else
                    m_mensaje = m_mensaje & "<td> &nbsp;</td>" & vbNewLine
                End If
                If IsDate(m_expediente.FechaInicioContrato) Then
                    m_mensaje = m_mensaje & "<td> " & m_expediente.FechaInicioContrato & "</td>" & vbNewLine
                Else
                    m_mensaje = m_mensaje & "<td> &nbsp;</td>" & vbNewLine
                End If
                If IsDate(m_expediente.FechaFinContrato) Then
                    m_mensaje = m_mensaje & "<td> " & m_expediente.FechaFinContrato & "</td>" & vbNewLine
                Else
                    m_mensaje = m_mensaje & "<td> &nbsp;</td>" & vbNewLine
                End If
                If IsDate(m_expediente.FechaFinGarantia) Then
                    m_mensaje = m_mensaje & "<td> " & m_expediente.FechaFinGarantia & "</td>" & vbNewLine
                Else
                    m_mensaje = m_mensaje & "<td> &nbsp;</td>" & vbNewLine
                End If
                
                If IsNumeric(m_expediente.GARANTIAMESES) Then
                    m_mensaje = m_mensaje & "<td> " & m_expediente.GARANTIAMESES & "</td>" & vbNewLine
                Else
                    m_mensaje = m_mensaje & "<td> &nbsp;</td>" & vbNewLine
                End If
                If m_ExpHito.DESCRIPCION <> "" Then
                    m_mensaje = m_mensaje & "<td> " & m_ExpHito.DESCRIPCION & "</td>" & vbNewLine
                Else
                    m_mensaje = m_mensaje & "<td> &nbsp;</td>" & vbNewLine
                End If
                If IsDate(m_ExpHito.FechaHito) Then
                    m_mensaje = m_mensaje & "<td> " & m_ExpHito.FechaHito & "</td>" & vbNewLine
                Else
                    m_mensaje = m_mensaje & "<td> &nbsp;</td>" & vbNewLine
                End If
                If IsNumeric(m_ExpHito.DiasParaElFin) Then
                    m_mensaje = m_mensaje & "<td> " & m_ExpHito.DiasParaElFin & "</td>" & vbNewLine
                Else
                    m_mensaje = m_mensaje & "<td> &nbsp;</td>" & vbNewLine
                End If
                
            m_mensaje = m_mensaje & "</tr>" & vbNewLine
            Set m_ExpHito = Nothing
        Next
    m_mensaje = m_mensaje & "</table>" & vbNewLine

    getHTMLTablaExpedientesAPuntoDeRecepcionarHito = m_mensaje
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getHTMLTablaExpedientesAPuntoDeRecepcionarHito ha producido el error num " & Err.Number & _
        vbCrLf & "Detalle: " & Err.Description
    End If

End Function
Private Function getHTMLTablaExpedientesAdjudicadosSinContrato( _
                                                            Optional ByRef p_Error As String _
                                                            ) As String

    Dim m_ID As Variant
    Dim m_expediente As Expediente
    Dim m_Col As Scripting.Dictionary
    Dim m_mensaje As String
    
    On Error GoTo errores
    
    m_mensaje = m_mensaje & "<table>" & vbNewLine
        m_mensaje = m_mensaje & "<tr>" & vbNewLine
            m_mensaje = m_mensaje & "<td colspan='9' class=""ColespanArriba""> EXPEDIENTES ADJUDICADOS SIN DATOS DE CONTRATO </td>"
        m_mensaje = m_mensaje & "</tr>" & vbNewLine
        m_mensaje = m_mensaje & "<tr>" & vbNewLine
            m_mensaje = m_mensaje & "<td class=""Cabecera"" > <strong>IDExp</strong></td>"
            m_mensaje = m_mensaje & "<td class=""Cabecera"" > <strong>CÓDIGO</strong></td>"
            m_mensaje = m_mensaje & "<td class=""Cabecera"" > <strong>NEMOTÉCNICO</strong></td>"
            m_mensaje = m_mensaje & "<td class=""Cabecera"" > <strong>TÍTULO</strong></td>"
            m_mensaje = m_mensaje & "<td class=""Cabecera"" > <strong>RESP. CALIDAD</strong></td>"
            m_mensaje = m_mensaje & "<td class=""Cabecera"" > <strong>RESP. SEGURIDAD</strong></td>"
            m_mensaje = m_mensaje & "<td class=""Cabecera"" > <strong>F.INICIO</strong></td>"
            m_mensaje = m_mensaje & "<td class=""Cabecera"" > <strong>F.FIN </strong></td>"
            m_mensaje = m_mensaje & "<td class=""Cabecera"" > <strong>F.ADJUDICACIÓN </strong></td>"
           
        m_mensaje = m_mensaje & "</tr>" & vbNewLine
        Set m_Col = m_ObjEntorno.ColExpedientesAdjudicadosSinContrato
        If m_Col.Count = 0 Then
            m_mensaje = m_mensaje & "</table>" & vbNewLine
            getHTMLTablaExpedientesAdjudicadosSinContrato = m_mensaje
            Exit Function
        End If
        For Each m_ID In m_Col
            Set m_expediente = m_Col(m_ID)
            m_mensaje = m_mensaje & "<tr>" & vbNewLine
                m_mensaje = m_mensaje & "<td> " & m_ID & "</td>" & vbNewLine
                m_mensaje = m_mensaje & "<td> " & m_expediente.CodExp & "</td>" & vbNewLine
                If m_expediente.NemotecnicoCalculado <> "" Then
                    m_mensaje = m_mensaje & "<td> " & m_expediente.NemotecnicoCalculado & "</td>" & vbNewLine
                Else
                    m_mensaje = m_mensaje & "<td> &nbsp;</td>" & vbNewLine
                End If
                
                m_mensaje = m_mensaje & "<td> " & m_expediente.Titulo & "</td>" & vbNewLine
                If Not m_expediente.responsableCalidad Is Nothing Then
                    If m_expediente.responsableCalidad.Nombre <> "" Then
                        m_mensaje = m_mensaje & "<td> " & m_expediente.responsableCalidad.Nombre & "</td>" & vbNewLine
                    Else
                        m_mensaje = m_mensaje & "<td> &nbsp;</td>" & vbNewLine
                    End If
                Else
                    m_mensaje = m_mensaje & "<td> &nbsp;</td>" & vbNewLine
                End If
                If Not m_expediente.responsableSeguridad Is Nothing Then
                    If m_expediente.responsableSeguridad.Nombre <> "" Then
                        m_mensaje = m_mensaje & "<td> " & m_expediente.responsableSeguridad.Nombre & "</td>" & vbNewLine
                    Else
                        m_mensaje = m_mensaje & "<td> &nbsp;</td>" & vbNewLine
                    End If
                Else
                    m_mensaje = m_mensaje & "<td> &nbsp;</td>" & vbNewLine
                End If
                If IsDate(m_expediente.FechaInicioContrato) Then
                    m_mensaje = m_mensaje & "<td> " & m_expediente.FechaInicioContrato & "</td>" & vbNewLine
                Else
                    m_mensaje = m_mensaje & "<td> &nbsp;</td>" & vbNewLine
                End If
                If IsDate(m_expediente.FechaFinContrato) Then
                    m_mensaje = m_mensaje & "<td> " & m_expediente.FechaFinContrato & "</td>" & vbNewLine
                Else
                    m_mensaje = m_mensaje & "<td> &nbsp;</td>" & vbNewLine
                End If
                
                If IsDate(m_expediente.FECHAADJUDICACION) Then
                    m_mensaje = m_mensaje & "<td> " & m_expediente.FECHAADJUDICACION & "</td>" & vbNewLine
                Else
                    m_mensaje = m_mensaje & "<td> &nbsp;</td>" & vbNewLine
                End If
                
            m_mensaje = m_mensaje & "</tr>" & vbNewLine
            Set m_expediente = Nothing
            
            
            
            
        Next
    m_mensaje = m_mensaje & "</table>" & vbNewLine

    getHTMLTablaExpedientesAdjudicadosSinContrato = m_mensaje
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getHTMLTablaExpedientesAdjudicadosSinContrato ha producido el error num " & Err.Number & _
        vbCrLf & "Detalle: " & Err.Description
    End If

End Function
Private Function getHTMLTablaExpedientesAdjudicadosTSOLSinCodS4H( _
                                                            Optional ByRef p_Error As String _
                                                            ) As String

    Dim m_ID As Variant
    Dim m_expediente As Expediente
    Dim m_Col As Scripting.Dictionary
    Dim m_mensaje As String
    
    On Error GoTo errores
    
    m_mensaje = m_mensaje & "<table>" & vbNewLine
        m_mensaje = m_mensaje & "<tr>" & vbNewLine
            m_mensaje = m_mensaje & "<td colspan='8' class=""ColespanArriba""> EXPEDIENTES ADJUDICADOS DE TSOL SIN DATOS DE CodS4H </td>"
        m_mensaje = m_mensaje & "</tr>" & vbNewLine
        m_mensaje = m_mensaje & "<tr>" & vbNewLine
            m_mensaje = m_mensaje & "<td class=""Cabecera"" > <strong>IDExp</strong></td>"
            m_mensaje = m_mensaje & "<td class=""Cabecera"" > <strong>CÓDIGO</strong></td>"
            m_mensaje = m_mensaje & "<td class=""Cabecera"" > <strong>NEMOTÉCNICO</strong></td>"
            m_mensaje = m_mensaje & "<td class=""Cabecera"" > <strong>TÍTULO</strong></td>"
            m_mensaje = m_mensaje & "<td class=""Cabecera"" > <strong>RESP. CALIDAD</strong></td>"
            m_mensaje = m_mensaje & "<td class=""Cabecera"" > <strong>RESP. SEGURIDAD</strong></td>"
            m_mensaje = m_mensaje & "<td class=""Cabecera"" > <strong>F.INICIO</strong></td>"
            m_mensaje = m_mensaje & "<td class=""Cabecera"" > <strong>F.FIN </strong></td>"
            m_mensaje = m_mensaje & "<td class=""Cabecera"" > <strong>F.ADJUDICACIÓN </strong></td>"
           
        m_mensaje = m_mensaje & "</tr>" & vbNewLine
        Set m_Col = m_ObjEntorno.ColExpedientesAdjudicadosTSOLSinCodS4H
        If m_Col.Count = 0 Then
            m_mensaje = m_mensaje & "</table>" & vbNewLine
            getHTMLTablaExpedientesAdjudicadosTSOLSinCodS4H = m_mensaje
            Exit Function
        End If
        For Each m_ID In m_Col
            Set m_expediente = m_Col(m_ID)
            m_mensaje = m_mensaje & "<tr>" & vbNewLine
                m_mensaje = m_mensaje & "<td> " & m_ID & "</td>" & vbNewLine
                m_mensaje = m_mensaje & "<td> " & m_expediente.CodExp & "</td>" & vbNewLine
                If m_expediente.NemotecnicoCalculado <> "" Then
                    m_mensaje = m_mensaje & "<td> " & m_expediente.NemotecnicoCalculado & "</td>" & vbNewLine
                Else
                    m_mensaje = m_mensaje & "<td> &nbsp;</td>" & vbNewLine
                End If
                
                m_mensaje = m_mensaje & "<td> " & m_expediente.Titulo & "</td>" & vbNewLine
                If Not m_expediente.responsableCalidad Is Nothing Then
                    If m_expediente.responsableCalidad.Nombre <> "" Then
                        m_mensaje = m_mensaje & "<td> " & m_expediente.responsableCalidad.Nombre & "</td>" & vbNewLine
                    Else
                        m_mensaje = m_mensaje & "<td> &nbsp;</td>" & vbNewLine
                    End If
                Else
                    m_mensaje = m_mensaje & "<td> &nbsp;</td>" & vbNewLine
                End If
                If Not m_expediente.responsableSeguridad Is Nothing Then
                    If m_expediente.responsableSeguridad.Nombre <> "" Then
                        m_mensaje = m_mensaje & "<td> " & m_expediente.responsableSeguridad.Nombre & "</td>" & vbNewLine
                    Else
                        m_mensaje = m_mensaje & "<td> &nbsp;</td>" & vbNewLine
                    End If
                Else
                    m_mensaje = m_mensaje & "<td> &nbsp;</td>" & vbNewLine
                End If
                If IsDate(m_expediente.FechaInicioContrato) Then
                    m_mensaje = m_mensaje & "<td> " & m_expediente.FechaInicioContrato & "</td>" & vbNewLine
                Else
                    m_mensaje = m_mensaje & "<td> &nbsp;</td>" & vbNewLine
                End If
                If IsDate(m_expediente.FechaFinContrato) Then
                    m_mensaje = m_mensaje & "<td> " & m_expediente.FechaFinContrato & "</td>" & vbNewLine
                Else
                    m_mensaje = m_mensaje & "<td> &nbsp;</td>" & vbNewLine
                End If
                
                If IsDate(m_expediente.FECHAADJUDICACION) Then
                    m_mensaje = m_mensaje & "<td> " & m_expediente.FECHAADJUDICACION & "</td>" & vbNewLine
                Else
                    m_mensaje = m_mensaje & "<td> &nbsp;</td>" & vbNewLine
                End If
                
            m_mensaje = m_mensaje & "</tr>" & vbNewLine
            Set m_expediente = Nothing
            
            
            
            
        Next
    m_mensaje = m_mensaje & "</table>" & vbNewLine

    getHTMLTablaExpedientesAdjudicadosTSOLSinCodS4H = m_mensaje
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getHTMLTablaExpedientesAdjudicadosTSOLSinCodS4H ha producido el error num " & Err.Number & _
        vbCrLf & "Detalle: " & Err.Description
    End If

End Function
Private Function getHTMLTablaExpedientesFaseOfertaPorMuchoTiempo( _
                                                            Optional ByRef p_Error As String _
                                                            ) As String

    Dim m_ID As Variant
    Dim m_expediente As Expediente
    Dim m_Col As Scripting.Dictionary
    Dim m_mensaje As String
    
    On Error GoTo errores
    
    m_mensaje = m_mensaje & "<table>" & vbNewLine
        m_mensaje = m_mensaje & "<tr>" & vbNewLine
            m_mensaje = m_mensaje & "<td colspan='7' class=""ColespanArriba""> EXPEDIENTES EN FASE DE OFERTA SIN RESOLUCIÓN POR MÁS DE " & m_ObjEntorno.DiasParaOfertasSinDecision & " DÍAS </td>"
        m_mensaje = m_mensaje & "</tr>" & vbNewLine
        m_mensaje = m_mensaje & "<tr>" & vbNewLine
            m_mensaje = m_mensaje & "<td class=""Cabecera"" > <strong>IDExp</strong></td>"
            m_mensaje = m_mensaje & "<td class=""Cabecera"" > <strong>CÓDIGO</strong></td>"
            m_mensaje = m_mensaje & "<td class=""Cabecera"" > <strong>NEMOTÉCNICO</strong></td>"
            m_mensaje = m_mensaje & "<td class=""Cabecera"" > <strong>TÍTULO</strong></td>"
            m_mensaje = m_mensaje & "<td class=""Cabecera"" > <strong>RESP. CALIDAD</strong></td>"
            m_mensaje = m_mensaje & "<td class=""Cabecera"" > <strong>RESP. SEGURIDAD</strong></td>"
            m_mensaje = m_mensaje & "<td class=""Cabecera"" > <strong>F.OFERTA</strong></td>"
            
           
        m_mensaje = m_mensaje & "</tr>" & vbNewLine
        Set m_Col = m_ObjEntorno.ColExpedientesAdjudicadosTSOLSinCodS4H
        If m_Col.Count = 0 Then
            m_mensaje = m_mensaje & "</table>" & vbNewLine
            getHTMLTablaExpedientesFaseOfertaPorMuchoTiempo = m_mensaje
            Exit Function
        End If
        For Each m_ID In m_Col
            Set m_expediente = m_Col(m_ID)
            m_mensaje = m_mensaje & "<tr>" & vbNewLine
                m_mensaje = m_mensaje & "<td> " & m_ID & "</td>" & vbNewLine
                m_mensaje = m_mensaje & "<td> " & m_expediente.CodExp & "</td>" & vbNewLine
                If m_expediente.NemotecnicoCalculado <> "" Then
                    m_mensaje = m_mensaje & "<td> " & m_expediente.NemotecnicoCalculado & "</td>" & vbNewLine
                Else
                    m_mensaje = m_mensaje & "<td> &nbsp;</td>" & vbNewLine
                End If
                
                m_mensaje = m_mensaje & "<td> " & m_expediente.Titulo & "</td>" & vbNewLine
                If Not m_expediente.responsableCalidad Is Nothing Then
                    If m_expediente.responsableCalidad.Nombre <> "" Then
                        m_mensaje = m_mensaje & "<td> " & m_expediente.responsableCalidad.Nombre & "</td>" & vbNewLine
                    Else
                        m_mensaje = m_mensaje & "<td> &nbsp;</td>" & vbNewLine
                    End If
                Else
                    m_mensaje = m_mensaje & "<td> &nbsp;</td>" & vbNewLine
                End If
                If Not m_expediente.responsableSeguridad Is Nothing Then
                    If m_expediente.responsableSeguridad.Nombre <> "" Then
                        m_mensaje = m_mensaje & "<td> " & m_expediente.responsableSeguridad.Nombre & "</td>" & vbNewLine
                    Else
                        m_mensaje = m_mensaje & "<td> &nbsp;</td>" & vbNewLine
                    End If
                Else
                    m_mensaje = m_mensaje & "<td> &nbsp;</td>" & vbNewLine
                End If
                If IsDate(m_expediente.FECHAOFERTA) Then
                    m_mensaje = m_mensaje & "<td> " & m_expediente.FECHAOFERTA & "</td>" & vbNewLine
                Else
                    m_mensaje = m_mensaje & "<td> &nbsp;</td>" & vbNewLine
                End If
                
                
            m_mensaje = m_mensaje & "</tr>" & vbNewLine
            Set m_expediente = Nothing
            
            
            
            
        Next
    m_mensaje = m_mensaje & "</table>" & vbNewLine

    getHTMLTablaExpedientesFaseOfertaPorMuchoTiempo = m_mensaje
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getHTMLTablaExpedientesFaseOfertaPorMuchoTiempo ha producido el error num " & Err.Number & _
        vbCrLf & "Detalle: " & Err.Description
    End If

End Function
Public Function DameCabeceraHTML( _
                                p_Titulo As String, _
                                Optional ByRef p_Error As String _
                                ) As String
    
    Dim m_mensaje As String
    
    On Error GoTo errores
    
    
    m_mensaje = "<!DOCTYPE html>" & vbNewLine
    m_mensaje = m_mensaje & "<html lang=""es"">" & vbNewLine
    m_mensaje = m_mensaje & "<head>" & vbNewLine
        m_mensaje = m_mensaje & "<title>" & p_Titulo & "</title>" & vbNewLine
        m_mensaje = m_mensaje & "<meta charset=""ISO-8859-1"" />" & vbNewLine
        'm_Mensaje = m_Mensaje & "<meta charset=""UTF-8"">" & vbnewline
        
        m_mensaje = m_mensaje & "<style type=""text/css"">" & vbNewLine
            m_mensaje = m_mensaje & m_ObjEntorno.CSS & vbNewLine
        m_mensaje = m_mensaje & "</style>" & vbNewLine
    m_mensaje = m_mensaje & "</head>" & vbNewLine
    m_mensaje = m_mensaje & "<body>" & vbNewLine
    DameCabeceraHTML = m_mensaje
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método DameCabeceraHTML ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
    End If
End Function


Public Function getTipoCalculado(p_Expediente As Object, Optional ByRef p_Error As String) As EnumTipoExpediente
    
    
    On Error GoTo errores
    
    
    With p_Expediente
        If .EsAM = "Sí" Then
            getTipoCalculado = EnumTipoExpediente.AM
            
            Exit Function
        End If
        If .EsLote = "Sí" Then
            getTipoCalculado = EnumTipoExpediente.Lote
            
            Exit Function
        End If
        If .EsExpediente = "Sí" Then
            getTipoCalculado = EnumTipoExpediente.EXPIndividual
            
            Exit Function
        End If
        If .EsBasado = "Sí" Then
            If Not .ExpedientePadre Is Nothing Then
                If .ExpedientePadre.EsAM = "Sí" Then
                    getTipoCalculado = EnumTipoExpediente.BasadoDeAM
                ElseIf .ExpedientePadre.EsLote = "Sí" Then
                    getTipoCalculado = EnumTipoExpediente.BasadoDeLote
                End If
            End If
            
            Exit Function
        End If
    End With
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método Expediente.getTipoCalculado ha devuelto el error: " & vbNewLine & Err.Description
    End If
    
End Function

Public Function GetESTADOCalculado(p_Expediente As Object, Optional ByRef p_Error As String) As EnumEstados
    
    Dim m_FechaFinal As String
    Dim m_Hoy As String
    Dim m_FechasIrregulares As String
    
    m_Hoy = Date
    With p_Expediente
        If .APLICAESTADO <> "Sí" And .APLICAESTADO <> "No" Then
            GoTo fechas
        End If
        If .APLICAESTADO <> "Sí" Then
            GetESTADOCalculado = EnumEstados.NoAPlica
            
            Exit Function
        End If
fechas:
    'SonFechasIrregulares = "No|"
    'SonFechasIrregulares = "Sí|motivo"
        m_FechasIrregulares = SonFechasIrregulares(p_Expediente, p_Error)
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        If m_FechasIrregulares <> "No|" Then
             GetESTADOCalculado = EnumEstados.Desconocido
            
            Exit Function
        End If
        If IsDate(.FECHADESESTIMADA) Then
            GetESTADOCalculado = EnumEstados.Desestimado
            
            Exit Function
        End If
        If IsDate(.FECHAPERDIDA) Then
            GetESTADOCalculado = EnumEstados.Perdido
            
            Exit Function
        End If
        If Not IsDate(.FECHAADJUDICACION) Then
            If IsDate(.FECHAOFERTA) Then
                GetESTADOCalculado = EnumEstados.Oferta
            Else
                If IsDate(.FECHAPREOFERTA) Then
                    GetESTADOCalculado = EnumEstados.Preoferta
                Else
                    GetESTADOCalculado = EnumEstados.Oferta
                End If
            End If
            
            Exit Function
        End If
        If IsDate(.FECHAADJUDICACION) Then
            If Not IsDate(.FechaFinContrato) Then
                GetESTADOCalculado = EnumEstados.Adjudicada
                
                Exit Function
            End If
        End If
        
        
        
        If IsDate(.FECHACERTIFICACION) Then
            m_FechaFinal = .FECHACERTIFICACION
        Else
            m_FechaFinal = .FechaFinContrato
        End If
        If CDate(m_Hoy) <= CDate(m_FechaFinal) Then
            GetESTADOCalculado = EnumEstados.EnEjecucion
            
            Exit Function
        End If
        If CDate(m_Hoy) > CDate(.FechaFinGarantia) Then
            GetESTADOCalculado = EnumEstados.Cerrado
        Else
            GetESTADOCalculado = EnumEstados.EnGarantia
            
        End If
        
        Exit Function
        
    End With
    
   
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método GetESTADOCalculado ha devuelto el p_Error: " & vbNewLine & Err.Description
    End If
    
End Function
Public Function GetNemotecnicoCalculado(p_Expediente As Object, Optional ByRef p_Error As String) As String
    Dim m_ExpPadre As Expediente
    Dim m_ExpAbuelo As Expediente
    Dim m_NombreEjercito As String
    On Error GoTo errores
   
    
    With p_Expediente
        Set m_ExpPadre = .ExpedientePadre
        If m_ExpPadre Is Nothing Then
            GetNemotecnicoCalculado = .Nemotecnico
            
            Exit Function
        End If
        If m_ExpPadre.Nemotecnico = "" Then
            Exit Function
        End If
        If .TipoCalculado = EnumTipoExpediente.BasadoDeAM Or .TipoCalculado = EnumTipoExpediente.BasadoDeLote Then
            If IsNumeric(.Ordinal) Then
                If Not .Ejercito Is Nothing Then
                    m_NombreEjercito = .Ejercito.Ejercito
                    If m_NombreEjercito <> "N/A" Then
                        GetNemotecnicoCalculado = m_ExpPadre.Nemotecnico & "_" & "CB" & Format(.Ordinal, "00") & "_" & m_NombreEjercito
                    Else
                        GetNemotecnicoCalculado = m_ExpPadre.Nemotecnico & "_" & "CB" & Format(.Ordinal, "00")
                    End If
                    
                Else
                    GetNemotecnicoCalculado = m_ExpPadre.Nemotecnico & "_" & "CB" & Format(.Ordinal, "00")
                End If
            Else
                If Not .Ejercito Is Nothing Then
                    m_NombreEjercito = .Ejercito.Ejercito
                    If m_NombreEjercito <> "N/A" Then
                        GetNemotecnicoCalculado = m_ExpPadre.Nemotecnico & "_" & m_NombreEjercito
                    
                    End If
                End If
            End If
            
            Exit Function
        End If
        If .TipoCalculado = EnumTipoExpediente.Lote Then
            If IsNumeric(.Ordinal) Then
                GetNemotecnicoCalculado = m_ExpPadre.Nemotecnico & "_" & "L" & Format(.Ordinal, "00")
            End If
            
            Exit Function
        End If
    End With
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método Expediente.NemotecnicoCalculado ha devuelto el p_Error: " & vbNewLine & Err.Description
    End If
    
End Function

Public Function SonFechasIrregulares(p_Expediente As Object, Optional ByRef p_Error As String) As String
    
    'SonFechasIrregulares = "No|"
    'SonFechasIrregulares = "Sí|motivo"
    On Error GoTo errores
    
   
    
    With p_Expediente
        If IsDate(.FECHADESESTIMADA) Then
            SonFechasIrregulares = "No|"
             
            Exit Function
        End If
        If IsDate(.FECHAPERDIDA) Then
            SonFechasIrregulares = "No|"
            Exit Function
        End If
        If IsDate(.FechaInicioContrato) And Not IsDate(.FechaFinContrato) Then
            SonFechasIrregulares = "Sí|Fecha inicio contrato rellena y no lo está Fecha Fin contrato"
            
            Exit Function
        End If
        If IsDate(.FechaFinContrato) And Not IsDate(.FechaInicioContrato) Then
            SonFechasIrregulares = "Sí|Fecha fin contrato rellena y no lo está Fecha inicio contrato"
            
            Exit Function
        End If
        If IsDate(.FechaInicioContrato) And Not IsNumeric(.GARANTIAMESES) Then
            SonFechasIrregulares = "Sí|Fecha inicio contrato rellena y no lo están los mneses de garantía"
            
            Exit Function
        End If
        If IsDate(.FECHAFIRMACONTRATO) Then
            If Not IsDate(.FechaInicioContrato) Or Not IsDate(.FechaFinContrato) Or Not IsNumeric(.GARANTIAMESES) Then
                SonFechasIrregulares = "Sí|Fecha firma del contrato rellena pero una de estas tres no están rellenas.FechaInicioContrato,FechaFinContrato o GARANTIAMESES "
                
                Exit Function
            End If
        End If
       
        If IsDate(.FECHACERTIFICACION) Then
            If Not IsDate(.FechaInicioContrato) Or Not IsDate(.FechaFinContrato) Or _
                Not IsNumeric(.GARANTIAMESES) Or Not IsDate(.FECHAFIRMACONTRATO) Then
                SonFechasIrregulares = "Sí|Fecha certificación rellena pero una de estas 4 no están rellenas.FechaInicioContrato,FechaFinContrato,GARANTIAMESES o FECHAFIRMACONTRATO "
                 
                Exit Function
            End If
        End If
        
        
    End With
    SonFechasIrregulares = "No|"
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método SonFechasIrregulares ha devuelto el p_Error: " & vbNewLine & Err.Description
    End If
    
End Function
Public Function ActualizarCadenaAutorizadosEnGestionRiesgos(p_Expediente As Expediente, Optional ByRef p_Error As String) As String
    
    Dim m_SQL As String
    Dim m_CadenaResponsables As String
    
    
    
    On Error GoTo errores
    
    m_CadenaResponsables = p_Expediente.CadenaResponsables
    p_Error = p_Expediente.Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If InStr(1, m_CadenaResponsables, "|") <> 0 Then
        m_CadenaResponsables = Replace(m_CadenaResponsables, "|", ";")
    End If
    
     m_SQL = "UPDATE TbProyectos SET CadenaNombreAutorizados ='" & m_CadenaResponsables & "' " & _
             "WHERE IDExpediente=" & p_Expediente.IDExpediente & ";"
             getdb().Execute m_SQL
    
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método ActualizarCadenaAutorizadosEnGestionRiesgos ha producido el error n: " & Err.Number & _
        vbNewLine & "Detalle: " & Err.Description
    End If
End Function

Sub CopiarAlPortapapeles(texto As String)
    Dim hGlobalMemory As LongPtr
    Dim lpGlobalMemory As LongPtr
    Dim hwnd As LongPtr
    Dim lngReturnValue As LongPtr

    ' Abrir el portapapeles
    lngReturnValue = OpenClipboard(hwnd)
    If lngReturnValue = 0 Then Exit Sub

    ' Vaciar el portapapeles
    lngReturnValue = EmptyClipboard
    If lngReturnValue = 0 Then
        CloseClipboard
        Exit Sub
    End If

    ' Asignar memoria global para el texto
    hGlobalMemory = GlobalAlloc(GMEM_MOVEABLE, Len(texto) + 1)
    If hGlobalMemory = 0 Then
        CloseClipboard
        Exit Sub
    End If

    ' Bloquear la memoria global
    lpGlobalMemory = GlobalLock(hGlobalMemory)
    If lpGlobalMemory = 0 Then
        CloseClipboard
        Exit Sub
    End If

    ' Copiar el texto a la memoria global
    lstrcpy lpGlobalMemory, texto

    ' Desbloquear la memoria global
    GlobalUnlock hGlobalMemory

    ' Establecer los datos del portapapeles
    lngReturnValue = SetClipboardData(CF_TEXT, hGlobalMemory)
    If lngReturnValue = 0 Then
        CloseClipboard
        Exit Sub
    End If

    ' Cerrar el portapapeles
    CloseClipboard
End Sub

Public Function ActualizarDatosEnGestionRiegos( _
                                                p_Expediente As Expediente, _
                                                Optional p_ConJuridica As EnumSiNo, _
                                                Optional p_ConAutorizados As EnumSiNo, _
                                                Optional ByRef p_Error As String _
                                                ) As String
    
    Dim m_SQL As String
    Dim m_ProyectoCalculado As String
    Dim m_NombreProyectoCalculado As String
    Dim m_GestionRiesgos As GestionRiesgos
    Dim m_FechaPrevistaCierreCalculada As String
    Dim m_CodigoDocumentoCalculado As String
    Dim m_FechaFirmaContratoCalculada As String
    Dim m_NombreUsuarioCalidadCalculado As String
   
    Dim m_IDProyecto As String
    On Error GoTo errores
    If p_Expediente Is Nothing Then
        Exit Function
    End If
    
    Set m_GestionRiesgos = constructor.getGestionRiesgosPorExpediente(p_Expediente.IDExpediente, p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If m_GestionRiesgos Is Nothing Then
        Exit Function
    End If
    m_IDProyecto = m_GestionRiesgos.IDProyecto
    m_ProyectoCalculado = m_GestionRiesgos.ProyectoCalculado
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If p_ConJuridica = EnumSiNo.Sí Then
        ActualizarJuridicaEnGR p_Expediente, p_Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
    End If
    
    m_NombreProyectoCalculado = m_GestionRiesgos.NombreProyectoCalculado
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    m_FechaPrevistaCierreCalculada = m_GestionRiesgos.FechaPrevistaCierreCalculada
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    m_CodigoDocumentoCalculado = m_GestionRiesgos.CodigoDocumentoCalculado
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    m_FechaFirmaContratoCalculada = m_GestionRiesgos.FechaFirmaContratoCalculada
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    m_NombreUsuarioCalidadCalculado = m_GestionRiesgos.NombreUsuarioCalidadCalculado
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If p_ConAutorizados = EnumSiNo.Sí Then
        ActualizarCadenaAutorizadosEnGR p_Expediente, p_Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
    End If
    Set m_GestionRiesgos = New GestionRiesgos
    With m_GestionRiesgos
        .IDProyecto = m_IDProyecto
        .Proyecto = m_ProyectoCalculado
        .NombreProyecto = m_NombreProyectoCalculado
        .FechaPrevistaCierre = m_FechaPrevistaCierreCalculada
        .CodigoDocumento = m_CodigoDocumentoCalculado
        .FECHAFIRMACONTRATO = m_FechaFirmaContratoCalculada
        .NombreUsuarioCalidad = m_NombreUsuarioCalidadCalculado
        ActualizarTablaGestionRiesgos m_GestionRiesgos, p_Error
        If p_Error <> "" Then
            Err.Raise 10000
        End If
    End With
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método ActualizarDatosEnGestionRiegos ha producido el error n: " & Err.Number & _
        vbNewLine & "Detalle: " & Err.Description
    End If
End Function

Public Function ActualizarCadenaAutorizadosEnGR( _
                                                p_Expediente As Expediente, _
                                                Optional ByRef p_Error As String _
                                                ) As String
    
    Dim m_SQL As String
    Dim m_CadenaNombreAutorizadosCalculados As String
    Dim m_GestionRiesgos As GestionRiesgos
    
    On Error GoTo errores
    If p_Expediente Is Nothing Then
        Exit Function
    End If
    
    Set m_GestionRiesgos = constructor.getGestionRiesgosPorExpediente(p_Expediente.IDExpediente, p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If m_GestionRiesgos Is Nothing Then
        Exit Function
    End If
    m_CadenaNombreAutorizadosCalculados = m_GestionRiesgos.CadenaNombreAutorizadosCalculados
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If m_CadenaNombreAutorizadosCalculados <> m_GestionRiesgos.CadenaNombreAutorizados Then
        If m_CadenaNombreAutorizadosCalculados <> "" Then
            m_SQL = "UPDATE TbProyectos SET " & _
                    "CadenaNombreAutorizados = '" & m_CadenaNombreAutorizadosCalculados & "' " & _
                    "WHERE IDExpediente=" & p_Expediente.IDExpediente & ";"
        Else
            m_SQL = "UPDATE TbProyectos SET " & _
                    "CadenaNombreAutorizados =Null " & _
                    "WHERE IDExpediente=" & p_Expediente.IDExpediente & ";"
        End If
        getdb().Execute m_SQL
    End If
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método ActualizarCadenaAutorizadosEnGR ha producido el error n: " & Err.Number & _
        vbNewLine & "Detalle: " & Err.Description
    End If
End Function
Public Function ActualizarJuridicaEnGR( _
                                            p_Expediente As Expediente, _
                                            Optional ByRef p_Error As String _
                                            ) As String
    
    Dim m_SQL As String
    Dim m_JuridicaCalculada As String
     Dim m_GestionRiesgos As GestionRiesgos
    On Error GoTo errores
    If p_Expediente Is Nothing Then
        Exit Function
    End If
    
    Set m_GestionRiesgos = constructor.getGestionRiesgosPorExpediente(p_Expediente.IDExpediente, p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If m_GestionRiesgos Is Nothing Then
        Exit Function
    End If
    m_JuridicaCalculada = m_GestionRiesgos.JuridicaCalculada
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If m_JuridicaCalculada <> m_GestionRiesgos.JURIDICA Then
        If m_JuridicaCalculada <> "" Then
            m_SQL = "UPDATE TbProyectos SET " & _
                    "JURIDICA = '" & m_JuridicaCalculada & "' " & _
                    "WHERE IDExpediente=" & p_Expediente.IDExpediente & ";"
        Else
            m_SQL = "UPDATE TbProyectos SET " & _
                    "JURIDICA =Null " & _
                    "WHERE IDExpediente=" & p_Expediente.IDExpediente & ";"
        End If
        getdb().Execute m_SQL
    End If
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método ActualizarJuridicaEnGR ha producido el error n: " & Err.Number & _
        vbNewLine & "Detalle: " & Err.Description
    End If
End Function
Public Function ActualizarTablaGestionRiesgos( _
                                                p_GR As GestionRiesgos, _
                                                Optional ByRef p_Error As String _
                                                ) As String
    
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    
    
    On Error GoTo errores
     m_SQL = "SELECT * " & _
            "FROM TbProyectos " & _
            "WHERE IDProyecto=" & p_GR.IDProyecto & ";"
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .Edit
            If p_GR.Proyecto <> "" Then
                .Fields("Proyecto") = p_GR.Proyecto
            Else
                .Fields("Proyecto") = Null
            End If
            If p_GR.JURIDICA <> "" Then
                .Fields("JURIDICA") = p_GR.JURIDICA
            Else
                .Fields("JURIDICA") = Null
            End If
            If p_GR.NombreProyecto <> "" Then
                .Fields("NombreProyecto") = p_GR.NombreProyecto
            Else
                .Fields("NombreProyecto") = Null
            End If
            If p_GR.FechaPrevistaCierre <> "" Then
                .Fields("FechaPrevistaCierre") = p_GR.FechaPrevistaCierre
            Else
                .Fields("FechaPrevistaCierre") = Null
            End If
            If p_GR.CodigoDocumento <> "" Then
                .Fields("CodigoDocumento") = p_GR.CodigoDocumento
            Else
                .Fields("CodigoDocumento") = Null
            End If
            If p_GR.FECHAFIRMACONTRATO <> "" Then
                .Fields("FECHAFIRMACONTRATO") = p_GR.FECHAFIRMACONTRATO
            Else
                .Fields("FECHAFIRMACONTRATO") = Null
            End If
            If p_GR.NombreUsuarioCalidad <> "" Then
                .Fields("NombreUsuarioCalidad") = p_GR.NombreUsuarioCalidad
            Else
                .Fields("NombreUsuarioCalidad") = Null
            End If
            If p_GR.CadenaNombreAutorizados <> "" Then
                .Fields("CadenaNombreAutorizados") = p_GR.CadenaNombreAutorizados
            Else
                .Fields("CadenaNombreAutorizados") = Null
            End If
            
        .Update
        
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing

    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método ActualizarTablaGestionRiesgos ha producido el error n: " & Err.Number & _
        vbNewLine & "Detalle: " & Err.Description
    End If
End Function
Public Function MotivoNoOKGR( _
                                p_Expediente As Expediente, _
                                Optional ByRef p_Error As String _
                                ) As String
    
    Dim m_GestionRiesgos As GestionRiesgos
    Dim m_ProyectoCalculado As String
    Dim m_JuridicaCalculada As String
    Dim m_NombreProyectoCalculado As String
    Dim m_FechaPrevistaCierreCalculada As String
    Dim m_CodigoDocumentoCalculado As String
    Dim m_NombreUsuarioCalidadCalculado As String
    Dim m_CadenaNombreAutorizadosCalculados As String
    Dim m_AlMenosUnaEdicionPublicada As EnumSiNo
    
    On Error GoTo errores
    Set m_GestionRiesgos = constructor.getGestionRiesgosPorExpediente(p_Expediente.IDExpediente, p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If m_GestionRiesgos Is Nothing Then
        Exit Function
    End If
    With m_GestionRiesgos
        m_ProyectoCalculado = .ProyectoCalculado
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        If m_ProyectoCalculado = "" Then
            MotivoNoOKGR = "Este expediente está involucrado en una Gestión de Riesgos y se quedaría sin el campo Proyecto"
            Err.Raise 1000
        End If
        m_JuridicaCalculada = .JuridicaCalculada
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        If m_JuridicaCalculada = "" Or m_JuridicaCalculada = "N/A" Then
            MotivoNoOKGR = "Este expediente está involucrado en una Gestión de Riesgos y se quedaría sin Jurídica"
            Err.Raise 1000
        End If
        m_NombreProyectoCalculado = .NombreProyectoCalculado
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        If m_NombreProyectoCalculado = "" Then
            MotivoNoOKGR = "Este expediente está involucrado en una Gestión de Riesgos y se quedaría el nemotécnico del proyecto"
            Err.Raise 1000
        End If
        m_AlMenosUnaEdicionPublicada = AlMenosUnaEdicionPublicada(m_GestionRiesgos, p_Error)
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        If m_AlMenosUnaEdicionPublicada = EnumSiNo.Sí Then
            m_FechaPrevistaCierreCalculada = .FechaPrevistaCierreCalculada
            If p_Error <> "" Then
                Err.Raise 1000
            End If
            If m_FechaPrevistaCierreCalculada = "" Then
                MotivoNoOKGR = "Este expediente está involucrado en una Gestión de Riesgos, ya tiene al menos una publicación y se necesita saber cuándo acaba el expediente"
                Err.Raise 1000
            End If
        End If
        m_CodigoDocumentoCalculado = .CodigoDocumentoCalculado
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        If m_CodigoDocumentoCalculado = "" Then
            MotivoNoOKGR = "Este expediente está involucrado en una Gestión de Riesgos y se quedaría sin el código del documento"
            Err.Raise 1000
        End If
       
        m_NombreUsuarioCalidadCalculado = .NombreUsuarioCalidadCalculado
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        If m_NombreUsuarioCalidadCalculado = "" Then
            MotivoNoOKGR = "Este expediente está involucrado en una Gestión de Riesgos y se quedaría sin el responsable de Calidad"
            Err.Raise 1000
        End If
        m_CadenaNombreAutorizadosCalculados = .CadenaNombreAutorizadosCalculados
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        If m_CadenaNombreAutorizadosCalculados = "" Then
            MotivoNoOKGR = "Este expediente está involucrado en una Gestión de Riesgos y se quedaría sin ningún responsable"
            Err.Raise 1000
        End If
    End With
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método MotivoNoOKGR ha producido el error n: " & Err.Number & _
        vbNewLine & "Detalle: " & Err.Description
    End If
End Function

Public Function AlMenosUnaEdicionPublicada( _
                                            p_GR As GestionRiesgos, _
                                            Optional ByRef p_Error As String _
                                            ) As EnumSiNo
    
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    
    
    On Error GoTo errores
     m_SQL = "SELECT distinct IDProyecto " & _
            "FROM TbProyectosEdiciones " & _
            "WHERE IDProyecto=" & p_GR.IDProyecto & " " & _
            "AND Not FechaPublicacion Is Null;"
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        If Not .EOF Then
            AlMenosUnaEdicionPublicada = EnumSiNo.Sí
        Else
            AlMenosUnaEdicionPublicada = EnumSiNo.No
        End If
        
        
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing

    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método AlMenosUnaEdicionPublicada ha producido el error n: " & Err.Number & _
        vbNewLine & "Detalle: " & Err.Description
    End If
End Function

Public Function EliminarContenidoCarpeta(ByVal rutaCarpeta As String)
    On Error Resume Next
    ' Crear un objeto FileSystemObject
    Dim fso As Object
    Set fso = CreateObject("Scripting.FileSystemObject")
    
    ' Verificar si la carpeta existe
    If fso.FolderExists(rutaCarpeta) Then
        Dim carpeta As Object
        Set carpeta = fso.GetFolder(rutaCarpeta)
        
        ' Eliminar todos los archivos en la carpeta
        Dim archivo As Object
        For Each archivo In carpeta.Files
            archivo.Delete True ' Eliminar forzando
        Next archivo
        
        ' Eliminar todas las subcarpetas
        Dim subCarpeta As Object
        For Each subCarpeta In carpeta.SubFolders
            subCarpeta.Delete True ' Eliminar forzando
        Next subCarpeta
        
   
    End If
    
    Exit Function

End Function

Private Function getDirectorioOneDrive(Optional ByRef p_Error As String) As String
    Dim fso As Object
    Dim carpetaRaiz As Object
    Dim subCarpeta As Object
    Dim rutaEncontrada As String
    Dim encontrado As Boolean
    
    On Error GoTo errores
    ' Crear objeto FileSystemObject
    Set fso = CreateObject("Scripting.FileSystemObject")
    
    ' Obtener la carpeta raíz de C:\
    Set carpetaRaiz = fso.GetFolder("C:\")
    
    ' Inicializar variables
    encontrado = False
    rutaEncontrada = ""
    
    ' Recorrer las subcarpetas en la raíz de C:\
    For Each subCarpeta In carpetaRaiz.SubFolders
        If InStr(1, subCarpeta.Name, "OneDrive", vbTextCompare) > 0 Then
            rutaEncontrada = subCarpeta.Path
            encontrado = True
            Exit For
        
        End If
    Next subCarpeta
    
    ' Mostrar el resultado
    If encontrado Then
        getDirectorioOneDrive = rutaEncontrada
    
    End If
    
    ' Liberar objetos
    Set subCarpeta = Nothing
    Set carpetaRaiz = Nothing
    Set fso = Nothing
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getDirectorioOneDrive ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Debug.Print p_Error
End Function

Private Function getDirectorioOneDriveTelefonicaApps(Optional ByRef p_Error As String) As String
    Dim fso As Object
    Dim carpeta As String
    Dim m_RutaOneDrive As String
    
    On Error GoTo errores
    ' Crear objeto FileSystemObject
    Set fso = CreateObject("Scripting.FileSystemObject")
    m_RutaOneDrive = getDirectorioOneDrive(p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If m_RutaOneDrive = "" Then
        Exit Function
    End If
    carpeta = m_RutaOneDrive & "\Telefonica\Aplicaciones_dys.TMETF - Aplicaciones PpD\"
    If Not fso.FolderExists(carpeta) Then
        Exit Function
    End If
    getDirectorioOneDriveTelefonicaApps = carpeta
    
    ' Liberar objetos
   
    
    Set fso = Nothing
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getDirectorioOneDriveTelefonicaApps ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Debug.Print p_Error
End Function
Private Function getDirectorioOneDriveApps(Optional ByRef p_Error As String) As String
    Dim fso As Object
    Dim carpeta As String
    Dim m_RutaOneDrive As String
    
    On Error GoTo errores
    ' Crear objeto FileSystemObject
    Set fso = CreateObject("Scripting.FileSystemObject")
    m_RutaOneDrive = getDirectorioOneDrive(p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If m_RutaOneDrive = "" Then
        Exit Function
    End If
    'C:\OneDrive\OneDrive - Telefonica\00LABORAL\Aplicaciones PpD
    carpeta = m_RutaOneDrive & "\OneDrive - Telefonica\00LABORAL\Aplicaciones PpD\"
    If Not fso.FolderExists(carpeta) Then
        Exit Function
    End If
    getDirectorioOneDriveApps = carpeta
    
    ' Liberar objetos
   
    
    Set fso = Nothing
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getDirectorioOneDriveApps ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Debug.Print p_Error
End Function


Public Function getRutaAplicacionesLocal(Optional ByRef p_Error As String) As String
    Dim fso As Object
    Dim m_RutaOneDrive As String
    Dim m_RutaOneDriveTelefonica As String
    
    On Error GoTo errores
    ' Crear objeto FileSystemObject
    Set fso = CreateObject("Scripting.FileSystemObject")
    m_RutaOneDriveTelefonica = getDirectorioOneDriveTelefonicaApps(p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    
    If fso.FolderExists(m_RutaOneDriveTelefonica) Then
        Set fso = Nothing
        getRutaAplicacionesLocal = m_RutaOneDriveTelefonica
        Exit Function
    End If
    
    m_RutaOneDrive = getDirectorioOneDrive(p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If m_RutaOneDrive = "" Then
        Set fso = Nothing
        Exit Function
    End If
   
    getRutaAplicacionesLocal = m_RutaOneDrive
    
    ' Liberar objetos
   
    
    Set fso = Nothing
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getRutaAplicacionesLocal ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Debug.Print p_Error
End Function
Public Function ActualizarNCs( _
                            p_Exp As Expediente, _
                            p_ExpAlInicio As Expediente, _
                            Optional ByVal p_Db As DAO.Database = Nothing, _
                            Optional ByRef p_Error As String _
                            ) As String
    
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Db As DAO.Database
    
    On Error GoTo errores
    If p_Exp Is Nothing Then
        Exit Function
    End If
    If p_ExpAlInicio Is Nothing Then
        Exit Function
    End If
    With p_Exp
        
        If Not .responsableCalidad Is Nothing Then
            If p_ExpAlInicio.responsableCalidad Is Nothing Then
                GoTo ejecucion
            End If
            If .responsableCalidad.ID <> p_ExpAlInicio.responsableCalidad.ID Then
                GoTo ejecucion
            End If
        Else
            If Not p_ExpAlInicio.responsableCalidad Is Nothing Then
                GoTo ejecucion
            End If
        End If
        If .Nemotecnico <> p_ExpAlInicio.Nemotecnico Then
            GoTo ejecucion
        End If
        If .CodExp <> p_ExpAlInicio.CodExp Then
            GoTo ejecucion
        End If
        GoTo fin
    End With
ejecucion:
    If p_Db Is Nothing Then
        Set m_Db = getdb()
    Else
        Set m_Db = p_Db
    End If

    m_SQL = "SELECT  * " & _
            "FROM TbNoConformidades " & _
            "WHERE IDExpediente=" & p_Exp.IDExpediente & ";"
    Set rcdDatos = m_Db.OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            Exit Function
        End If
        Do While Not .EOF
            .Edit
                
                If Not p_Exp.responsableCalidad Is Nothing Then
                    If p_ExpAlInicio.responsableCalidad Is Nothing Then
                        .Fields("RESPONSABLECALIDADExp") = p_Exp.responsableCalidad.Nombre
                    End If
                    If Not p_ExpAlInicio.responsableCalidad Is Nothing Then
                        If p_Exp.responsableCalidad.ID <> p_ExpAlInicio.responsableCalidad.ID Then
                            .Fields("RESPONSABLECALIDADExp") = p_Exp.responsableCalidad.Nombre
                        End If
                    End If
                    
                Else
                    If Not p_ExpAlInicio.responsableCalidad Is Nothing Then
                        .Fields("RESPONSABLECALIDADExp") = Null
                    End If
                End If
                If p_Exp.Nemotecnico <> p_ExpAlInicio.Nemotecnico Then
                    If p_Exp.Nemotecnico <> "" Then
                        .Fields("Nemotecnico") = p_Exp.Nemotecnico
                    Else
                        .Fields("Nemotecnico") = Null
                    End If
                    
                End If
                If p_Exp.CodExp <> p_ExpAlInicio.CodExp Then
                    If p_Exp.CodExp <> "" Then
                        .Fields("CodExp") = p_Exp.CodExp
                    Else
                        .Fields("CodExp") = Null
                    End If
                    
                End If
            .Update
            .MoveNext
        Loop
        
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
fin:
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método ActualizarNCs ha devuelto el error: " & vbNewLine & Err.Description
    End If
   
End Function
Public Function ActualizarNCsContratistas( _
                                            p_IDExp As String, _
                                            Optional p_Cadena As String, _
                                            Optional ByVal p_Db As DAO.Database = Nothing, _
                                            Optional ByRef p_Error As String _
                                        ) As String

    Dim m_SQL As String
    Dim m_Db As DAO.Database

    On Error GoTo errores
    If p_IDExp = "" Then
        Exit Function
    End If

    If p_Db Is Nothing Then
        Set m_Db = getdb()
    Else
        Set m_Db = p_Db
    End If

    If p_Cadena <> "" Then
        m_SQL = "UPDATE TbNoConformidades SET JuridicaExp = '" & p_Cadena & "' " & _
                "WHERE IDExpediente=" & p_IDExp & ";"
    Else
        m_SQL = "UPDATE TbNoConformidades SET JuridicaExp = Null" & _
                "WHERE IDExpediente=" & p_IDExp & ";"
    End If

    m_Db.Execute m_SQL, dbFailOnError

    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método ActualizarNCsContratistas ha devuelto el error: " & vbNewLine & Err.Description
    End If

End Function
Public Function RellenarArchivoJSONConColExpedientes( _
                                                        p_Col As Scripting.Dictionary, _
                                                        Optional p_EnUnArchivo As EnumSiNo = EnumSiNo.No, _
                                                        Optional ByRef p_Error As String _
                                                        ) As String
    
    
    Dim JsonString As String
    Dim JsonStringParseado As String
    Dim m_URLArchivo As String
    Dim m_ExpedientesSerializados As Object
   
    On Error GoTo errores
    
    If p_Col Is Nothing Then
        Exit Function
    End If
    Set m_ExpedientesSerializados = getExpedientesSerializados(p_Col:=p_Col, p_Error:=p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If m_ExpedientesSerializados Is Nothing Then
        Exit Function
    End If
    JsonString = JsonConverter.ConvertToJson(m_ExpedientesSerializados, Whitespace:=2)
    JsonStringParseado = TextoParsedoParaTxt(JsonString)
    If p_EnUnArchivo = EnumSiNo.Sí Then
        m_URLArchivo = Application.CurrentProject.Path & "\" & fso.GetBaseName(fso.GetTempName) & ".json"
        EscribirTextoAArchivo p_Texto:=JsonStringParseado, p_URLArchivo:=m_URLArchivo, p_Error:=p_Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        RellenarArchivoJSONConColExpedientes = m_URLArchivo
    Else
        RellenarArchivoJSONConColExpedientes = JsonStringParseado
    End If
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método RellenarArchivoJSONConColExpedientes ha devuelto" & vbNewLine & Err.Description
    End If
    Debug.Print p_Error
End Function
Public Function getExpedientesSerializados( _
                                            p_Col As Scripting.Dictionary, _
                                            Optional ByRef p_Error As String _
                                            ) As Object
    
    
    Dim m_JSON As String
    Dim m_ColExpediente As Scripting.Dictionary
    Dim m_colExpedientes As New Collection
    Dim m_ColGeneral As New Scripting.Dictionary
    Dim m_IDExp As Variant
    Dim m_Exp As Expediente
    
    On Error GoTo errores
    
    If p_Col Is Nothing Then
        Exit Function
    End If
    With m_ColGeneral
        .CompareMode = TextCompare
        .Add "FechaLista", Now()
    End With
    For Each m_IDExp In p_Col
        Set m_Exp = p_Col(m_IDExp)
        Set m_ColExpediente = getColExpedienteParaJSON(p_Exp:=m_Exp, p_Error:=p_Error)
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        m_colExpedientes.Add m_ColExpediente
        Set m_Exp = Nothing
    Next
    m_ColGeneral.Add "Data", m_colExpedientes
    m_JSON = JsonConverter.ConvertToJson(m_ColGeneral, 2)
    Set getExpedientesSerializados = JsonConverter.ParseJson(m_JSON)
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getExpedientesSerializados ha devuelto" & vbNewLine & Err.Description
    End If
    Debug.Print p_Error
End Function
Public Function getColExpedienteParaJSON( _
                                        Optional p_IDExp As String, _
                                        Optional p_Exp As Expediente, _
                                        Optional ByRef p_Error As String _
                                        ) As Scripting.Dictionary
    
    
    
    Dim m_ColExpediente As New Scripting.Dictionary
    Dim m_ColPecal As New Collection
    Dim m_Pecal As PECAL
    Dim m_IDPecal As Variant
    Dim m_ColAnualidad As Scripting.Dictionary
    Dim m_Anualidad As ExpedienteAnualidad
    Dim m_IDAnualidad As Variant
    Dim m_ColComerciales As New Collection
    Dim m_Comercial As Comercial
    Dim m_IDComercial As Variant
    Dim m_ColCPVs As New Collection
    Dim m_CPV As CPV
    Dim m_IDCPV As Variant
    Dim m_ColHitos As Scripting.Dictionary
    Dim m_Hito As ExpedienteHito
    Dim m_IDHito As Variant
    Dim m_ColContratistas As New Collection
    Dim m_ColSubContratistas As New Collection
    Dim m_ColSuministradores As New Collection
    Dim m_Suministrador As Suministrador
    Dim m_IDSuministrador As Variant
    Dim m_ColLugares As New Collection
    Dim m_Lugar As LugarEjecucion
    Dim m_IDLugar As Variant
    Dim m_ColModificados As Scripting.Dictionary
    Dim m_Modificado As ExpedienteModificado
    Dim m_IDModificado As Variant
    Dim m_ColResponsables As New Collection
    Dim m_ColUsuarios As Scripting.Dictionary
    Dim m_Responsable As ExpedienteResponsable
    Dim m_IDResponsable As Variant
    Dim m_UsuarioResponsable As USUARIO
    
    On Error GoTo errores
    
    
    If p_Exp Is Nothing Then
        Set p_Exp = constructor.getExpediente(p_IDExpediente:=p_IDExp, p_Error:=p_Error)
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        If p_Exp Is Nothing Then
            Exit Function
        End If
        
    End If
    
    
    With m_ColExpediente
        
        .Add "IDExpediente", p_Exp.IDExpediente
        .Add "IDExpedientePadre", p_Exp.IDExpedientePadre
        .Add "Nemotecnico", TextoParsedoParaJSON(p_Exp.Nemotecnico)
        .Add "Titulo", TextoParsedoParaJSON(p_Exp.Titulo)
        .Add "ImporteLicitacion", TextoParsedoParaJSON(p_Exp.ImporteLicitacion)
        .Add "ImporteContratacion", TextoParsedoParaJSON(p_Exp.ImporteContratacion)
        .Add "CodProyecto", TextoParsedoParaJSON(p_Exp.CodProyecto)
        .Add "CodExpLargo", TextoParsedoParaJSON(p_Exp.CodExpLargo)
        .Add "CodS4H", TextoParsedoParaJSON(p_Exp.CodS4H)
        .Add "FechaInicioContrato", TextoParsedoParaJSON(p_Exp.FechaInicioContrato)
        .Add "FechaFinContrato", TextoParsedoParaJSON(p_Exp.FechaFinContrato)
        .Add "FechaFinGarantia", TextoParsedoParaJSON(p_Exp.FechaFinGarantia)
        .Add "EsAM", TextoParsedoParaJSON(p_Exp.EsAM)
        .Add "EsLote", TextoParsedoParaJSON(p_Exp.EsLote)
        .Add "EsBasado", TextoParsedoParaJSON(p_Exp.EsBasado)
        .Add "EsExpediente", TextoParsedoParaJSON(p_Exp.EsExpediente)
        .Add "Ordinal", TextoParsedoParaJSON(p_Exp.Ordinal)
        If Not p_Exp.GradoClasificacion Is Nothing Then
            .Add "GradoClasificacion", TextoParsedoParaJSON(p_Exp.GradoClasificacion.GradoClasificacion)
        Else
            .Add "GradoClasificacion", ""
        End If
        If Not p_Exp.OrganoContratacion Is Nothing Then
            .Add "OrganoContratacion", TextoParsedoParaJSON(p_Exp.OrganoContratacion.OrganoContratacion)
        Else
            .Add "OrganoContratacion", ""
        End If
        If Not p_Exp.OficinaPrograma Is Nothing Then
            .Add "OficinaPrograma", TextoParsedoParaJSON(p_Exp.OficinaPrograma.OficinaPrograma)
        Else
            .Add "OficinaPrograma", ""
        End If
        If Not p_Exp.Ejercito Is Nothing Then
            .Add "Ejercito", TextoParsedoParaJSON(p_Exp.Ejercito.Ejercito)
        Else
            .Add "Ejercito", ""
        End If
        .Add "AccesoSharepoint", TextoParsedoParaJSON(p_Exp.AccesoSharepoint)
        .Add "Observaciones", TextoParsedoParaJSON(p_Exp.Observaciones)
        .Add "FechaCreacion", TextoParsedoParaJSON(p_Exp.FechaCreacion)
        If Not p_Exp.UsuarioCreacion Is Nothing Then
            .Add "UsuarioCreacion", TextoParsedoParaJSON(p_Exp.UsuarioCreacion.Nombre)
        Else
            .Add "UsuarioCreacion", ""
        End If
        
        .Add "FechaUltimoCambio", TextoParsedoParaJSON(p_Exp.FechaUltimoCambio)
        If Not p_Exp.UsuarioUltimoCambio Is Nothing Then
            .Add "UsuarioUltimoCambio", TextoParsedoParaJSON(p_Exp.UsuarioUltimoCambio.Nombre)
        Else
            .Add "UsuarioUltimoCambio", ""
        End If
        
        .Add "Ambito", TextoParsedoParaJSON(p_Exp.Ambito)
        .Add "NPedido", TextoParsedoParaJSON(p_Exp.NPedido)
        If Not p_Exp.responsableCalidad Is Nothing Then
            .Add "ResponsableCalidad", TextoParsedoParaJSON(p_Exp.responsableCalidad.Nombre)
        Else
            .Add "ResponsableCalidad", ""
        End If
        If Not p_Exp.responsableSeguridad Is Nothing Then
            .Add "ResponsableSeguridad", TextoParsedoParaJSON(p_Exp.responsableSeguridad.Nombre)
        Else
            .Add "ResponsableSeguridad", ""
        End If
        .Add "AGEDYSAplica", TextoParsedoParaJSON(p_Exp.AGEDYSAplica)
        .Add "AGEDYSGenerico", TextoParsedoParaJSON(p_Exp.AGEDYSGenerico)
        .Add "HPSAplica", TextoParsedoParaJSON(p_Exp.HPSAplica)
        .Add "TIpo", TextoParsedoParaJSON(p_Exp.TIpo)
        If Not p_Exp.PECALES Is Nothing Then
           
            For Each m_IDPecal In p_Exp.PECALES
                Set m_Pecal = p_Exp.PECALES(m_IDPecal)
                    m_ColPecal.Add m_Pecal.PECAL
                Set m_Pecal = Nothing
            Next
            .Add "PECALES", m_ColPecal
        Else
            .Add "PECALES", ""
        End If
        Set m_ColPecal = New Collection
        .Add "TipoInforme", TextoParsedoParaJSON(p_Exp.TipoInforme)
        .Add "POSTAGEDO", TextoParsedoParaJSON(p_Exp.POSTAGEDO)
        .Add "APLICAESTADO", TextoParsedoParaJSON(p_Exp.APLICAESTADO)
        .Add "FECHAINICIOLICITACION", TextoParsedoParaJSON(p_Exp.FECHAINICIOLICITACION)
        .Add "FECHAPREOFERTA", TextoParsedoParaJSON(p_Exp.FECHAPREOFERTA)
        .Add "FECHAOFERTA", TextoParsedoParaJSON(p_Exp.FECHAOFERTA)
        .Add "FECHAADJUDICACION", TextoParsedoParaJSON(p_Exp.FECHAADJUDICACION)
        .Add "FECHAFIRMACONTRATO", TextoParsedoParaJSON(p_Exp.FECHAFIRMACONTRATO)
        .Add "GARANTIAMESES", TextoParsedoParaJSON(p_Exp.GARANTIAMESES)
        .Add "FECHACERTIFICACION", TextoParsedoParaJSON(p_Exp.FECHACERTIFICACION)
        .Add "FECHAPERDIDA", TextoParsedoParaJSON(p_Exp.FECHAPERDIDA)
        .Add "FECHADESESTIMADA", TextoParsedoParaJSON(p_Exp.FECHADESESTIMADA)
        .Add "ESTADO", TextoParsedoParaJSON(p_Exp.ESTADOCalculadoTexto)
        .Add "CodigoActividad", TextoParsedoParaJSON(p_Exp.CodigoActividad)
        .Add "AplicaTareaS4H", TextoParsedoParaJSON(p_Exp.AplicaTareaS4H)
        If Not p_Exp.Anualidades Is Nothing Then
            Set m_ColAnualidad = New Scripting.Dictionary
            m_ColAnualidad.CompareMode = TextCompare
            
            For Each m_IDAnualidad In p_Exp.Anualidades
                Set m_Anualidad = p_Exp.Anualidades(m_IDAnualidad)
                m_ColAnualidad.Add "IDAnualidad", m_Anualidad.IDAnualidad
                m_ColAnualidad.Add TextoParsedoParaJSON("AÑO"), m_Anualidad.AÑO
                m_ColAnualidad.Add "BIEXENTA", m_Anualidad.BIEXENTA
                m_ColAnualidad.Add "BIIGIC", m_Anualidad.BIIGIC
                m_ColAnualidad.Add "BIIPSI", m_Anualidad.BIIPSI
                m_ColAnualidad.Add "BIIVA", m_Anualidad.BIIVA
                m_ColAnualidad.Add "IGIC", m_Anualidad.IGIC
                m_ColAnualidad.Add "IPSI", m_Anualidad.IPSI
                m_ColAnualidad.Add "IVA", m_Anualidad.IVA
                m_ColAnualidad.Add "PeriodoFacturacion", m_Anualidad.PeriodoFacturacion
                m_ColAnualidad.Add "Presupuesto", m_Anualidad.Presupuesto
                
                Set m_Anualidad = Nothing
            Next
            .Add "ANUALIDADES", m_ColAnualidad
        Else
            .Add "ANUALIDADES", ""
        End If
        Set m_ColAnualidad = Nothing
        If Not p_Exp.Comerciales Is Nothing Then
           
            For Each m_IDComercial In p_Exp.Comerciales
                Set m_Comercial = p_Exp.Comerciales(m_IDComercial)
                    m_ColComerciales.Add TextoParsedoParaJSON(m_Comercial.Comercial)
                Set m_Comercial = Nothing
            Next
            .Add "COMERCIALES", m_Comercial
        Else
            .Add "COMERCIALES", ""
        End If
        Set m_ColComerciales = New Collection
        If Not p_Exp.CPVs Is Nothing Then
           
            For Each m_IDCPV In p_Exp.CPVs
                Set m_CPV = p_Exp.CPVs(m_IDCPV)
                m_ColCPVs.Add TextoParsedoParaJSON(m_CPV.CPV)
                Set m_CPV = Nothing
            Next
            .Add "CPVS", m_ColCPVs
        Else
            .Add "CPVS", ""
        End If
        Set m_ColCPVs = New Collection
        If Not p_Exp.Hitos Is Nothing Then
            Set m_ColHitos = New Scripting.Dictionary
            m_ColHitos.CompareMode = TextCompare
            
            For Each m_IDHito In p_Exp.Hitos
                Set m_Hito = p_Exp.Hitos(m_IDHito)
                m_ColHitos.Add "FechaHito", m_Hito.FechaHito
                m_ColHitos.Add "Importe", m_Hito.Importe
                Set m_Hito = Nothing
            Next
            .Add "HITOS", m_ColHitos
        Else
            .Add "HITOS", ""
        End If
        Set m_ColHitos = Nothing
        If Not p_Exp.Contratistas Is Nothing Then
            For Each m_IDSuministrador In p_Exp.Contratistas
                Set m_Suministrador = p_Exp.Contratistas(m_IDSuministrador)
                m_ColContratistas.Add TextoParsedoParaJSON(m_Suministrador.Nemotecnico)
                Set m_Suministrador = Nothing
            Next
            .Add "CONTRATISTAS", m_ColContratistas
        Else
            .Add "CONTRATISTAS", ""
        End If
        Set m_ColContratistas = New Collection
        If Not p_Exp.SubContratistas Is Nothing Then
            For Each m_IDSuministrador In p_Exp.SubContratistas
                Set m_Suministrador = p_Exp.SubContratistas(m_IDSuministrador)
                m_ColSubContratistas.Add TextoParsedoParaJSON(m_Suministrador.Nemotecnico)
                Set m_Suministrador = Nothing
            Next
            .Add "SUBCONTRATISTAS", m_ColSubContratistas
        Else
            .Add "SUBCONTRATISTAS", ""
        End If
        Set m_ColSubContratistas = New Collection
        If Not p_Exp.Suministradores Is Nothing Then
            For Each m_IDSuministrador In p_Exp.Suministradores
                Set m_Suministrador = p_Exp.Suministradores(m_IDSuministrador)
                m_ColSuministradores.Add TextoParsedoParaJSON(m_Suministrador.Nemotecnico)
                Set m_Suministrador = Nothing
            Next
            .Add "SUMINISTRADORES", m_ColSuministradores
        Else
            .Add "SUMINISTRADORES", ""
        End If
        Set m_ColSuministradores = New Collection
        If Not p_Exp.LugaresEjecucion Is Nothing Then
            For Each m_IDLugar In p_Exp.LugaresEjecucion
                Set m_Lugar = p_Exp.LugaresEjecucion(m_IDLugar)
                m_ColLugares.Add TextoParsedoParaJSON(m_Lugar.LugarEjecucion)
                Set m_Lugar = Nothing
            Next
            .Add "LUGARESJECUCION", m_ColLugares
        Else
            .Add "LUGARESJECUCION", ""
        End If
        Set m_ColLugares = New Collection
        If Not p_Exp.Modificados Is Nothing Then
            Set m_ColModificados = New Scripting.Dictionary
            m_ColModificados.CompareMode = TextCompare
            
            For Each m_IDModificado In p_Exp.Modificados
                Set m_Modificado = p_Exp.Modificados(m_IDModificado)
                m_ColModificados.Add "FechaFirmaModificado", m_Modificado.FechaFirmaModificado
                m_ColModificados.Add "FechaFinModificado", m_Modificado.FechaFinModificado
                m_ColModificados.Add "NModificado", TextoParsedoParaJSON(m_Modificado.NModificado)
                
                Set m_Modificado = Nothing
            Next
            .Add "MODIFICADOS", m_ColModificados
        Else
            .Add "MODIFICADOS", ""
        End If
        Set m_ColModificados = Nothing
        If Not p_Exp.Responsables Is Nothing Then
            Set m_ColResponsables = New Collection
            For Each m_IDResponsable In p_Exp.Responsables
                Set m_ColUsuarios = New Scripting.Dictionary
                m_ColUsuarios.CompareMode = TextCompare
                Set m_Responsable = p_Exp.Responsables(m_IDResponsable)
                
                
                If Not m_Responsable.USUARIO Is Nothing Then
                    
                    m_ColUsuarios.Add "Nombre", TextoParsedoParaJSON(m_Responsable.USUARIO.Nombre)
                End If
                m_ColUsuarios.Add "EsJefeProyecto", TextoParsedoParaJSON(m_Responsable.EsJefeProyecto)
                m_ColUsuarios.Add "CorreoSiempre", TextoParsedoParaJSON(m_Responsable.CorreoSiempre)
                If Not m_Responsable.USUARIO Is Nothing Then
                    m_ColUsuarios.Add "FechaBaja", TextoParsedoParaJSON(m_Responsable.USUARIO.FechaBaja)
                Else
                    m_ColUsuarios.Add "FechaBaja", ""
                End If
                m_ColResponsables.Add m_ColUsuarios
                Set m_Responsable = Nothing
            Next
            .Add "RESPONSABLES", m_ColResponsables
        Else
            .Add "RESPONSABLES", ""
        End If
        
    End With
    Set getColExpedienteParaJSON = m_ColExpediente
       
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getColExpedienteParaJSON ha devuelto" & vbNewLine & Err.Description
    End If
    Debug.Print p_Error
End Function
Public Sub ResetAvanceCounter()
    ' Responsabilidad: Pone a cero el contador de pasos del splash.
    ' Debe ser llamado desde el evento Form_Open del frmSplash.
    s_contadorPasos = 0
End Sub
' =============================================
' AntiSpamHelper — Centralized button protection
' =============================================

' Returns True if form is locked (operation in progress)
Public Function AntiSpamIsOperationInProgress( _
    p_Form As Form, _
    Optional ByRef p_Error As String) As Boolean

    On Error GoTo errores
    If m_AntiSpamDict Is Nothing Then
        Set m_AntiSpamDict = New Scripting.Dictionary
    End If

    AntiSpamIsOperationInProgress = m_AntiSpamDict.exists(p_Form.hwnd)
    Exit Function
errores:
    p_Error = "AntiSpamIsOperationInProgress: " & Err.Description
End Function

' Locks form, disables buttons, prefixes caption
' NOTE: EnterOperation is fire-and-forget (p_Error not propagated).
' ExitOperation does propagate errors if needed.
' Usage: AntiSpamEnterOperation Me, Me.Caption, "btn1", "btn2", "btn3"
Public Sub AntiSpamEnterOperation( _
    p_Form As Form, _
    p_CaptionOriginal As String, _
    ParamArray p_Botones())

    On Error GoTo errores
    If m_AntiSpamDict Is Nothing Then Set m_AntiSpamDict = New Scripting.Dictionary

    ' Re-entrancy guard
    If m_AntiSpamDict.exists(p_Form.hwnd) Then Exit Sub

    ' Store state — copy ParamArray to array for storage
    Dim state As New Scripting.Dictionary
    state("CaptionOriginal") = p_CaptionOriginal

    Dim botonesArr() As Variant
    Dim i As Long
    If UBound(p_Botones) >= 0 Then
        ReDim botonesArr(UBound(p_Botones))
        For i = 0 To UBound(p_Botones)
            botonesArr(i) = p_Botones(i)
        Next i
    End If
    state("Botones") = botonesArr
    Set m_AntiSpamDict(p_Form.hwnd) = state

    ' Disable buttons
    Dim ctrl As Control
    For Each ctrl In p_Form.Controls
        If TypeName(ctrl) = "CommandButton" Then
            For i = 0 To UBound(botonesArr)
                If ctrl.Name = botonesArr(i) Then
                    ctrl.Enabled = False
                    Exit For
                End If
            Next i
        End If
    Next ctrl

    ' Prefix caption
    p_Form.Caption = "? EN CURSO — " & p_CaptionOriginal
    Exit Sub
errores:
    ' Silent cleanup on error — ensure no orphan locks
    On Error Resume Next
    Dim dummyCaption As String
    dummyCaption = p_CaptionOriginal
    AntiSpamExitOperation p_Form, dummyCaption
End Sub

' Restores form to idle state (safe: no-op if not locked)
Public Sub AntiSpamExitOperation( _
    p_Form As Form, _
    p_CaptionOriginal As String, _
    Optional ByRef p_Error As String)

    On Error GoTo errores
    If m_AntiSpamDict Is Nothing Then Exit Sub
    If Not m_AntiSpamDict.exists(p_Form.hwnd) Then Exit Sub  ' safe no-op

    Dim state As Scripting.Dictionary
    Set state = m_AntiSpamDict(p_Form.hwnd)

    ' Re-enable buttons
    Dim botonesArr As Variant
    botonesArr = state("Botones")
    Dim ctrl As Control
    Dim btnName As Variant
    Dim i As Long
    For Each ctrl In p_Form.Controls
        If TypeName(ctrl) = "CommandButton" Then
            For i = 0 To UBound(botonesArr)
                If ctrl.Name = botonesArr(i) Then
                    ctrl.Enabled = True
                    Exit For
                End If
            Next i
        End If
    Next ctrl

    ' Restore caption
    p_Form.Caption = p_CaptionOriginal

    ' Remove from dict
    m_AntiSpamDict.Remove p_Form.hwnd
    Set state = Nothing
    Exit Sub
errores:
    p_Error = "AntiSpamExitOperation: " & Err.Description
End Sub
Public Sub CerrarPopupProgreso()
    On Error Resume Next
    g_BusyFlag = ""
    DoCmd.Close acForm, "frmBusy"
End Sub

'========================================
' POPUP ANTI-SPAM CON PROGRESS BAR
'========================================

Public Sub MostrarPopupProgreso(p_Titulo As String, p_Mensaje As String)
    g_BusyFlag = "running"
    DoCmd.OpenForm "frmBusy", WindowMode:=acHidden
    Forms("frmBusy").Caption = p_Titulo
    Forms("frmBusy").lblTitulo.Caption = p_Titulo
    ActualizarEstadoPopup p_Mensaje
    Forms("frmBusy").lblProgresoBarra.Width = 0
    Forms("frmBusy").Visible = True
    DoEvents
End Sub

' Actualiza el mensaje de estado del popup, abriéndolo si no está abierto.
' Si no hay popup abierto, lo abre con título genérico y actualiza el mensaje.
' Sí se llama desde funciones de copia/export/import que hacen acceso directo
' a Forms("frmBusy") sin pasar por MostrarPopupProgreso primero.
Public Sub ActualizarEstadoPopup(p_Mensaje As String)
    On Error Resume Next
    If Not FormularioAbierto("frmBusy") Then
        MostrarPopupProgreso "Procesando...", p_Mensaje
    Else
        Forms("frmBusy").lblEstado.Caption = p_Mensaje
        DoEvents
    End If
End Sub

Public Sub AnimarProgresoIndefinido()
    Dim m_Width As Long
    Dim m_Direction As Long
    Dim m_MaxWidth As Long
    Dim m_MinWidth As Long

    On Error Resume Next
    If g_BusyFlag <> "running" Then Exit Sub
    If Not FormularioAbierto("frmBusy") Then Exit Sub  ' Guard: no crash si el popup no está abierto

    m_MaxWidth = Forms("frmBusy").lblProgresoFondo.Width
    m_MinWidth = 0
    m_Direction = 1
    m_Width = m_MinWidth

    Do While g_BusyFlag = "running"
        m_Width = m_Width + (m_MaxWidth \ 50) * m_Direction

        If m_Width >= m_MaxWidth Then
            m_Width = m_MaxWidth
            m_Direction = -1
        ElseIf m_Width <= m_MinWidth Then
            m_Width = m_MinWidth
            m_Direction = 1
        End If

        Forms("frmBusy").lblProgresoBarra.Width = m_Width
        DoEvents
        Sleep 30
    Loop
End Sub

Public Sub GestionarRibbon(ByVal mostrar As Boolean)
    ' RESPONSABILIDAD: Muestra u oculta la cinta de opciones de Access.
    On Error Resume Next ' Si hay algún problema, no debe detener el arranque.

    If mostrar Then
        DoCmd.ShowToolbar "Ribbon", acToolbarYes
    Else
        DoCmd.ShowToolbar "Ribbon", acToolbarNo
    End If
End Sub


