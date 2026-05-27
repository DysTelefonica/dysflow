VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "ACProyecto"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
Option Compare Database
Option Explicit


Public IdAccionCorrectiva As String
Public IDNoConformidad As String
Public NAccion As String
Public AccionCorrectiva As String
Public Estado As String
Public FechaAccionCorrectiva As String
Public FechaInicialMinima As String
Public FechaFinalUltima As String
Public FechaFinPrevistaUltima As String
Public Notas As String
Public Responsable As String 'usuario de red'

Private m_sIDAccionCorrectivaCalculada As String
Private m_ObjNC As ncProyecto
Private m_objARs As Scripting.Dictionary

Private m_eESTADOCalculado As EnumEstadoAC
Private m_sESTADOCalculadoTexto As String
Private m_sFechaInicialMinimaCalculada As String
Private m_sFechaFinalUltimaCalculada As String
Private m_sFechaFinPrevistaUltimaCalculada As String
Private m_eTieneAcciones As EnumSino
Private m_eAlgunaAccionActiva As EnumSino
Private m_eAlgunaAccionPteReplanificar As EnumSino

Private m_eTodasAccionesFinalizadas As EnumSino
Private m_eTodasAccionesSinPlanificar As EnumSino
Private m_eEstadoEnum As EnumEstadoAC
Private m_eAlgunaAccionIrregular As EnumSino
Private m_sNAccionARCalculado As String
Private m_ObjResponsableObj As usuario

Private m_objColCampos As Collection
Public Error As String
Private m_Error As String

Public Property Get ResponsableObj() As usuario
    
    On Error GoTo errores
    Me.Error = ""
    m_Error = ""
    If Not m_ObjResponsableObj Is Nothing Then
        Set ResponsableObj = m_ObjResponsableObj
        Exit Property
    End If
    If Me.Responsable = "" Then
        Exit Property
    End If
    Set m_ObjResponsableObj = constructor.getUsuario(p_UsuarioRed:=Me.Responsable, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set ResponsableObj = m_ObjResponsableObj
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método AC.ResponsableObj ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Set ResponsableObj(ByVal objNewValue As Variant)

    Set m_ObjResponsableObj = objNewValue

End Property
Public Property Get NAccionARCalculado() As String
    
    Dim m_ARProyecto As ARProyecto
    Dim m_ID As Variant
   
    Dim m_Numero As Long
    On Error GoTo errores

    Me.Error = ""
    m_Error = ""
    
    
    If Me.ARs Is Nothing Then
        m_sNAccionARCalculado = "1"
        NAccionARCalculado = m_sNAccionARCalculado
        Exit Property
    End If
    
    
    For Each m_ID In Me.ARs
        Set m_ARProyecto = Me.ARs(m_ID)
        If IsNumeric(m_ARProyecto.NAccion) Then
            If CLng(m_ARProyecto.NAccion) > CLng(m_Numero) Then
                m_Numero = CLng(m_ARProyecto.NAccion)
            End If
        End If
        
        Set m_ARProyecto = Nothing
    Next
    
    m_sNAccionARCalculado = CStr(m_Numero + 1)
    
    NAccionARCalculado = m_sNAccionARCalculado
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método AC.NAccionARCalculado  ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property

Public Property Get AlgunaAccionIrregular() As EnumSino
    
       
    On Error GoTo errores

    Me.Error = ""
    m_Error = ""
    If m_eAlgunaAccionIrregular <> Empty Then
        AlgunaAccionIrregular = m_eAlgunaAccionIrregular
        Exit Property
    End If
    m_eAlgunaAccionIrregular = getAlgunaAccionIrregular( _
                                    p_ID:=Me.IdAccionCorrectiva, _
                                    p_EsDeProyecto:=EnumSino.Sí, _
                                    p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
   
    AlgunaAccionIrregular = m_eAlgunaAccionIrregular
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método ACProyecto.AlgunaAccionIrregular ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property
Public Property Set AlgunaAccionIrregular(p_Valor As Variant)
    m_eAlgunaAccionIrregular = p_Valor
End Property
Public Property Get EstadoCalculado() As EnumEstadoAC
    
    
       
    On Error GoTo errores

    Me.Error = ""
    m_Error = ""
    Set Me.ARs = Nothing
    If Me.ARs Is Nothing Then
        m_eESTADOCalculado = EnumEstadoAC.SINACCIONES
        EstadoCalculado = m_eESTADOCalculado
        Exit Property
    End If
    m_eAlgunaAccionIrregular = Empty
    If Me.AlgunaAccionIrregular = EnumSino.Sí Then
        m_eESTADOCalculado = EnumEstadoAC.PTEREREGULARIZAR
        EstadoCalculado = m_eESTADOCalculado
        Exit Property
    End If
    m_eAlgunaAccionPteReplanificar = Empty
    If Me.AlgunaAccionPteReplanificar = EnumSino.Sí Then
        m_eESTADOCalculado = EnumEstadoAC.PTEREPLANIFICAR
        EstadoCalculado = m_eESTADOCalculado
        Exit Property
    End If
    
    m_eTodasAccionesFinalizadas = Empty
    If Me.TodasAccionesFinalizadas = EnumSino.Sí Then
        m_eESTADOCalculado = EnumEstadoAC.FINALIZADA
        EstadoCalculado = m_eESTADOCalculado
        Exit Property
    End If
    m_eAlgunaAccionActiva = Empty
    If Me.AlgunaAccionActiva = EnumSino.Sí Then
        m_eESTADOCalculado = EnumEstadoAC.ACTIVA
        EstadoCalculado = m_eESTADOCalculado
        Exit Property
    End If
    
    m_eESTADOCalculado = EnumEstadoAC.REGISTRADA
    EstadoCalculado = m_eESTADOCalculado
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método AC.EstadoCalculado ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property

Public Property Get EstadoCalculadoTexto() As String
    Dim m_EstadoCalculado As EnumEstadoAC
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    m_EstadoCalculado = Me.EstadoCalculado
    If m_ObjEntorno.ColEstadosAC.Exists(CStr(m_EstadoCalculado)) Then
        m_sESTADOCalculadoTexto = m_ObjEntorno.ColEstadosAC(CStr(m_EstadoCalculado))
    Else
        m_sESTADOCalculadoTexto = "DESCONOCIDO"
    End If
    
    
    EstadoCalculadoTexto = m_sESTADOCalculadoTexto
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Riesgo.EstadoCalculadoTexto ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Function EstadoGrabar( _
                                Optional p_Estado As String, _
                                Optional ByRef p_Error As String _
                                ) As String
                
    Dim m_SQL As String
    
    On Error GoTo errores
    
    If Not IsDate(p_Estado) Then
        p_Estado = Me.EstadoCalculadoTexto
    End If
    Me.Estado = p_Estado
    If p_Estado = "" Then
        m_SQL = "UPDATE TbNCAccionCorrectivas set ESTADO=Null " & _
                "WHERE IDAccionCorrectiva=" & Me.IdAccionCorrectiva & ";"
    Else
        m_SQL = "UPDATE TbNCAccionCorrectivas " & _
                "set ESTADO='" & Me.Estado & "' " & _
                "WHERE IDAccionCorrectiva=" & Me.IdAccionCorrectiva & ";"
    End If
    getdb().Execute m_SQL
    EstadoGrabar = p_Estado
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método AC.EstadoGrabar ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
    End If
    
End Function

Public Property Get EstadoEnum() As EnumEstadoAC
    
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If Me.Estado = "" Then
        Exit Property
    End If
    
    If m_ObjEntorno.ColEstadosACTexto.Exists(Me.Estado) Then
        m_eEstadoEnum = m_ObjEntorno.ColEstadosACTexto(Me.Estado)
    Else
        m_eEstadoEnum = "DESCONOCIDO"
    End If
    
   
    EstadoEnum = m_eEstadoEnum
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método AC.EstadoEnum ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property


Public Property Get TieneAcciones() As EnumSino
    
       
    On Error GoTo errores

    Me.Error = ""
    m_Error = ""
    
    If Me.ARs Is Nothing Then
        m_eTieneAcciones = EnumSino.No
    Else
        m_eTieneAcciones = EnumSino.Sí
    End If
    
    TieneAcciones = m_eTieneAcciones
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método AC.TieneAcciones ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property

Public Property Get AlgunaAccionActiva() As EnumSino
    
       
    On Error GoTo errores

    Me.Error = ""
    m_Error = ""
    If m_eAlgunaAccionActiva <> Empty Then
        AlgunaAccionActiva = m_eAlgunaAccionActiva
        Exit Property
    End If
    m_eAlgunaAccionActiva = getAlgunaAccionActiva( _
                                    p_ID:=Me.IdAccionCorrectiva, _
                                    p_EsDeProyecto:=EnumSino.Sí, _
                                    p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
   
    AlgunaAccionActiva = m_eAlgunaAccionActiva
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método ACProyecto.AlgunaAccionActiva ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property
Public Property Set AlgunaAccionActiva(p_Valor As Variant)
    m_eAlgunaAccionActiva = p_Valor
End Property

Public Property Get TodasAccionesFinalizadas() As EnumSino
    
       
    On Error GoTo errores

    Me.Error = ""
    m_Error = ""
    If m_eTodasAccionesFinalizadas <> Empty Then
        TodasAccionesFinalizadas = m_eTodasAccionesFinalizadas
        Exit Property
    End If
    m_eTodasAccionesFinalizadas = getTodasAccionesFinalizadas( _
                                    p_ID:=Me.IdAccionCorrectiva, _
                                    p_EsDeProyecto:=EnumSino.Sí, _
                                    p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
   
    TodasAccionesFinalizadas = m_eTodasAccionesFinalizadas
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método ACProyecto.TodasAccionesFinalizadas ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property
Public Property Set TodasAccionesFinalizadas(p_Valor As Variant)
    m_eTodasAccionesFinalizadas = p_Valor
End Property
Public Property Get TodasAccionesSinPlanificar() As EnumSino
    
       
    On Error GoTo errores

    Me.Error = ""
    m_Error = ""
    If m_eTodasAccionesSinPlanificar <> Empty Then
        TodasAccionesSinPlanificar = m_eTodasAccionesSinPlanificar
        Exit Property
    End If
    m_eTodasAccionesSinPlanificar = getTieneAccionesPorReplanificar( _
                                    p_ID:=Me.IdAccionCorrectiva, _
                                    p_EsDeProyecto:=EnumSino.Sí, _
                                    p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
   
    TodasAccionesSinPlanificar = m_eTodasAccionesSinPlanificar
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método ACProyecto.TodasAccionesSinPlanificar ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property
Public Property Set TodasAccionesSinPlanificar(p_Valor As Variant)
    m_eTodasAccionesSinPlanificar = p_Valor
End Property
Public Property Get AlgunaAccionPteReplanificar() As EnumSino
    
    
       
    On Error GoTo errores

    Me.Error = ""
    m_Error = ""
    If m_eAlgunaAccionPteReplanificar <> Empty Then
        AlgunaAccionPteReplanificar = m_eAlgunaAccionPteReplanificar
        Exit Property
    End If
    m_eAlgunaAccionPteReplanificar = getAlgunaAccionPteReplanificar( _
                                    p_ID:=Me.IdAccionCorrectiva, _
                                    p_EsDeProyecto:=EnumSino.Sí, _
                                    p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
   
    AlgunaAccionPteReplanificar = m_eAlgunaAccionPteReplanificar
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método ACProyecto.AlgunaAccionPteReplanificar ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property
Public Property Set AlgunaAccionPteReplanificar(p_Valor As Variant)
    
    m_eAlgunaAccionPteReplanificar = p_Valor
End Property

Public Property Get FechaInicialMinimaCalculada() As String
    
    On Error GoTo errores

    Me.Error = ""
    m_Error = ""
    If m_sFechaInicialMinimaCalculada <> "" Then
        FechaInicialMinimaCalculada = m_sFechaInicialMinimaCalculada
        Exit Property
    End If
    m_sFechaInicialMinimaCalculada = getFechaInicialMinimaCalculada( _
                                    p_ID:=Me.IdAccionCorrectiva, _
                                    p_EsDeProyecto:=EnumSino.Sí, _
                                    p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
   
    FechaInicialMinimaCalculada = m_sFechaInicialMinimaCalculada
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método ACProyecto.FechaInicialMinimaCalculada ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property

Public Property Set FechaInicialMinimaCalculada(p_Valor As Variant)
    
    m_sFechaInicialMinimaCalculada = p_Valor
End Property

Public Property Get FechaFinalUltimaCalculada() As String
    
    On Error GoTo errores

    Me.Error = ""
    m_Error = ""
    If m_sFechaFinalUltimaCalculada <> "" Then
        FechaFinalUltimaCalculada = m_sFechaFinalUltimaCalculada
        Exit Property
    End If
    m_eTodasAccionesFinalizadas = Empty
    If Me.TodasAccionesFinalizadas = EnumSino.No Then
        Exit Property
    End If
    m_sFechaFinalUltimaCalculada = getFechaFinalUltimaCalculada( _
                                    p_ID:=Me.IdAccionCorrectiva, _
                                    p_EsDeProyecto:=EnumSino.Sí, _
                                    p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
   
    FechaFinalUltimaCalculada = m_sFechaFinalUltimaCalculada
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método ACProyecto.FechaFinalUltimaCalculada ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property

Public Property Set FechaFinalUltimaCalculada(p_Valor As Variant)
    
    m_sFechaFinalUltimaCalculada = p_Valor
End Property

Public Property Get FechaFinPrevistaUltimaCalculada() As String
    
    On Error GoTo errores

    Me.Error = ""
    m_Error = ""
    If m_sFechaFinPrevistaUltimaCalculada <> "" Then
        FechaFinPrevistaUltimaCalculada = m_sFechaFinPrevistaUltimaCalculada
        Exit Property
    End If
    m_sFechaFinPrevistaUltimaCalculada = getFechaFinPrevistaUltimaCalculada( _
                                    p_ID:=Me.IdAccionCorrectiva, _
                                    p_EsDeProyecto:=EnumSino.Sí, _
                                    p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
   
    FechaFinPrevistaUltimaCalculada = m_sFechaFinPrevistaUltimaCalculada
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método ACProyecto.FechaFinPrevistaUltimaCalculada ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property

Public Property Set FechaFinPrevistaUltimaCalculada(p_Valor As Variant)
    
    m_sFechaFinPrevistaUltimaCalculada = p_Valor
End Property

Public Function FechaInicialMinimaGrabar( _
                                                Optional p_Fecha As String, _
                                                Optional ByRef p_Error As String _
                                                ) As String
                
    Dim m_SQL As String
    
    On Error GoTo errores
    
    If Not IsDate(p_Fecha) Then
        m_sFechaInicialMinimaCalculada = ""
        p_Fecha = Me.FechaInicialMinimaCalculada
    End If
    Me.FechaInicialMinima = p_Fecha
    If p_Fecha = "" Then
        m_SQL = "UPDATE TbNCAccionCorrectivas set FechaInicialMinima=Null " & _
                "WHERE IDAccionCorrectiva=" & Me.IdAccionCorrectiva & ";"
    Else
        m_SQL = "UPDATE TbNCAccionCorrectivas " & _
                "set FechaInicialMinima=#" & Format(Me.FechaInicialMinima, "mm/dd/yyyy") & "# " & _
                "WHERE IDAccionCorrectiva=" & Me.IdAccionCorrectiva & ";"
    End If
    getdb().Execute m_SQL
    FechaInicialMinimaGrabar = p_Fecha
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método AC.FechaInicialMinimaGrabar ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
    End If
    
End Function




Public Function FechaFinalUltimaGrabar( _
                                                Optional p_Fecha As String, _
                                                Optional ByRef p_Error As String _
                                                ) As String
                
    Dim m_SQL As String
    
    On Error GoTo errores
    
    If Not IsDate(p_Fecha) Then
        m_sFechaFinalUltimaCalculada = ""
        p_Fecha = Me.FechaFinalUltimaCalculada
    End If
    Me.FechaFinalUltima = p_Fecha
    If p_Fecha = "" Then
        m_SQL = "UPDATE TbNCAccionCorrectivas set FechaFinalUltima=Null " & _
                "WHERE IDAccionCorrectiva=" & Me.IdAccionCorrectiva & ";"
    Else
        m_SQL = "UPDATE TbNCAccionCorrectivas " & _
                "set FechaFinalUltima=#" & Format(Me.FechaFinalUltima, "mm/dd/yyyy") & "# " & _
                "WHERE IDAccionCorrectiva=" & Me.IdAccionCorrectiva & ";"
    End If
    getdb().Execute m_SQL
    FechaFinalUltimaGrabar = p_Fecha
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método AC.FechaFinalUltimaGrabar ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
    End If
    
End Function



Public Function FechaFinPrevistaUltimaGrabar( _
                                                Optional p_Fecha As String, _
                                                Optional ByRef p_Error As String _
                                                ) As String
                
    Dim m_SQL As String
    
    On Error GoTo errores
    
    If Not IsDate(p_Fecha) Then
        m_sFechaFinPrevistaUltimaCalculada = ""
        p_Fecha = Me.FechaFinPrevistaUltimaCalculada
    End If
    Me.FechaFinPrevistaUltima = p_Fecha
    If p_Fecha = "" Then
        m_SQL = "UPDATE TbNCAccionCorrectivas set FechaFinPrevistaUltima=Null " & _
                "WHERE IDAccionCorrectiva=" & Me.IdAccionCorrectiva & ";"
    Else
        m_SQL = "UPDATE TbNCAccionCorrectivas " & _
                "set FechaFinPrevistaUltima=#" & Format(Me.FechaFinPrevistaUltima, "mm/dd/yyyy") & "# " & _
                "WHERE IDAccionCorrectiva=" & Me.IdAccionCorrectiva & ";"
    End If
    getdb().Execute m_SQL
    FechaFinPrevistaUltimaGrabar = p_Fecha
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método AC.FechaFinPrevistaUltimaGrabar ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
    End If
    
End Function


Public Property Get nc() As ncProyecto
    
    On Error GoTo errores

    Me.Error = ""
    m_Error = ""
    If Not m_ObjNC Is Nothing Then
        Set nc = m_ObjNC
        Exit Property
    End If
    If Me.IDNoConformidad = "" Then
        Exit Property
    End If
    Set m_ObjNC = constructor.getNCProyecto(p_IDNC:=Me.IDNoConformidad, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set nc = m_ObjNC
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método AC.NC ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property

Public Property Get IDAccionCorrectivaCalculada() As String
    
    On Error GoTo errores

    Me.Error = ""
    m_Error = ""
    m_sIDAccionCorrectivaCalculada = constructor.getID("TbNCAccionCorrectivas", "IDAccionCorrectiva", getdb(), m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    IDAccionCorrectivaCalculada = m_sIDAccionCorrectivaCalculada
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método AC.IDAccionCorrectivaCalculada ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property

Public Property Get ARs() As Scripting.Dictionary
    
    On Error GoTo errores

    Me.Error = ""
    m_Error = ""
    If Not m_objARs Is Nothing Then
        Set ARs = m_objARs
        Exit Property
    End If
    Set m_objARs = constructor.getARsProyecto(p_IDAC:=Me.IdAccionCorrectiva, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set ARs = m_objARs
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método AC.ARs ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property

Public Property Set ARs(ByVal objNewValue As Variant)

    Set m_objARs = objNewValue
    
End Property




Public Property Get ColCampos() As Collection

    On Error GoTo errores

    Me.Error = ""
    m_Error = ""
    If Not m_objColCampos Is Nothing Then
        Set ColCampos = m_objColCampos
        Exit Property
    End If
    Set m_objColCampos = New Collection
    With m_objColCampos
        .Add "IDAccionCorrectiva"
        .Add "IDNoConformidad"
        .Add "NAccion"
        .Add "AccionCorrectiva"
        .Add "FechaAccionCorrectiva"
        .Add "ESTADO"
        .Add "FechaInicialMinima"
        .Add "FechaFinalUltima"
        .Add "FechaFinPrevistaUltima"
        .Add "Notas"
        .Add "Responsable"
    End With
    Set ColCampos = m_objColCampos
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método AC.ColCampos ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property


Public Function getPropiedad(m_NombrePropiedad As Variant, Optional ByRef p_Error As String) As Variant

    On Error GoTo errores

    Me.Error = ""
    If m_NombrePropiedad = "IDAccionCorrectiva" Then
        getPropiedad = Me.IdAccionCorrectiva
        Exit Function
    End If
    If m_NombrePropiedad = "IDNoConformidad" Then
        getPropiedad = Me.IDNoConformidad
        Exit Function
    End If
    If m_NombrePropiedad = "NAccion" Then
        getPropiedad = Me.NAccion
        Exit Function
    End If
    If m_NombrePropiedad = "AccionCorrectiva" Then
        getPropiedad = Me.AccionCorrectiva
        Exit Function
    End If
    If m_NombrePropiedad = "FechaAccionCorrectiva" Then
        getPropiedad = Me.FechaAccionCorrectiva
        Exit Function
    End If
    If m_NombrePropiedad = "ESTADO" Then
        getPropiedad = Me.Estado
        Exit Function
    End If
    If m_NombrePropiedad = "FechaInicialMinima" Then
        getPropiedad = Me.FechaInicialMinima
        Exit Function
    End If
    If m_NombrePropiedad = "FechaFinalUltima" Then
        getPropiedad = Me.FechaFinalUltima
        Exit Function
    End If
    If m_NombrePropiedad = "FechaFinPrevistaUltima" Then
        getPropiedad = Me.FechaFinPrevistaUltima
        Exit Function
    End If
    If m_NombrePropiedad = "Notas" Then
        getPropiedad = Me.Notas
        Exit Function
    End If
    If m_NombrePropiedad = "Responsable" Then
        getPropiedad = Me.Responsable
        Exit Function
    End If
    p_Error = "Propiedad no reconocida en AC.getPropiedad"
    Err.Raise 1000
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método AC.getPropiedad ha devuelto el error:" & vbNewLine & Err.Description
    End If
End Function


Public Function SetPropiedad(m_NombrePropiedad As Variant, m_ValorPropiedad As Variant, Optional ByRef p_Error As String) As String
    On Error GoTo errores

    Me.Error = ""
    p_Error = ""
    If m_NombrePropiedad = "IDAccionCorrectiva" Then
        Me.IdAccionCorrectiva = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "IDNoConformidad" Then
        Me.IDNoConformidad = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "NAccion" Then
        Me.NAccion = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "AccionCorrectiva" Then
        Me.AccionCorrectiva = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "FechaAccionCorrectiva" Then
        Me.FechaAccionCorrectiva = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "ESTADO" Then
        Me.Estado = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "FechaInicialMinima" Then
        Me.FechaInicialMinima = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "FechaFinalUltima" Then
        Me.FechaFinalUltima = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "FechaFinPrevistaUltima" Then
        Me.FechaFinPrevistaUltima = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "Notas" Then
        Me.Notas = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "Responsable" Then
        Me.Responsable = m_ValorPropiedad
        Exit Function
    End If
    p_Error = "Propiedad no reconocida en AC.SetPropiedad"
    Err.Raise 1000
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método AC.SetPropiedad ha devuelto el error:" & vbNewLine & Err.Description
    End If
End Function





