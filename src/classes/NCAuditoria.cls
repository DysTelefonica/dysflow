VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "NCAuditoria"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
Option Compare Database
Option Explicit


Public id As String
Public IDAuditoria As String
Public FechaApertura As String
Public Numero As String
Public Descripcion As String
Public CAUSARAIZ As String
Public AccionCorrectiva As String
Public CORRECCION As String
Public FECHACIERRE As String
Public FPREVCIERRE As String
Public RESPONSABLEIMPLANTACION As String 'nombre usuario
Public RequiereControlEficacia As String
Public ControlEficacia As String
Public FechaControlEficacia As String
Public FechaPrevistaControlEficacia As String
Public ResultadoControlEficacia As String
Public ConformeControlEficacia As String
Public RequiereAccionCorrectiva As String
Public MotivoNoAccionCorrectiva As String
Public MotivoNoRequiereControlEficacia As String
Public Tipo As String
Public PuntoNorma As String
Public Estado As String
Public Borrado As Boolean
Public MotivoBorrado As String
Public Notas As String
Public Cerrada As String


Private m_sParticula As String
Private m_sIDCalculado As String
Private m_ObjAuditoria As Auditoria
Private m_objDocumentos As Scripting.Dictionary
Private m_objDocumentosCompletos As Scripting.Dictionary
Private m_objACs As Scripting.Dictionary
Private m_objARsSinFinalizar As Scripting.Dictionary
Private m_objACsSinAR As Scripting.Dictionary
Private m_eTodasLasArsFinalizadas As EnumSino
Private m_eAlgunaACSinAR As EnumSino
Private m_eTodasLasACsSinFechas As EnumSino
Private m_eBorradoCalculado As EnumSino
Private m_eRequiereACRCalculado As EnumSino
Private m_eRequiereControlEficaciaCalculado As EnumSino
Private m_eConControlDeEficaciaSinRellenar As EnumSino
Private m_eDatosGeneralesOK As EnumSino
Private m_eEficaciaOK As EnumSino
Private m_eAccionesOK As EnumSino
Private m_eTieneAcciones As EnumSino
Private m_eCerradaCalculada As EnumSino
Private m_sFPREVCIERRECalculada As String
Private m_sFECHACIERRECalculada As String

Private m_eESTADOCalculado As EnumEstadoNC
Private m_sESTADOCalculadoTexto As String
Private m_sNAccionCalculado As String

Private m_eTieneAccionesPorReplanificar As EnumSino
Private m_eEstadoEnum As EnumEstadoNC
Private m_sEstadoTitulo As String
Private m_ObjReplanificaciones As Scripting.Dictionary
Private m_sTitulo As String

Private m_objColCampos As Collection
Public Error As String
Private m_Error As String


Public Property Get Particula() As String
    
   
    On Error GoTo errores

    Me.Error = ""
    m_Error = ""
    
    If Me.Tipo = "NC" Then
        m_sParticula = "NO CONFORMIDAD"
    ElseIf Me.Tipo = "OB" Then
        m_sParticula = "OBSERVACIÓN"
    ElseIf Me.Tipo = "OP" Then
        m_sParticula = "OPORTUNIDAD DE MEJORA"
    Else
        Exit Property
    End If
    
    
    Particula = m_sParticula
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método NCAuditoria.Particula  ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property


Public Property Get Titulo() As String
    
   
    On Error GoTo errores

    Me.Error = ""
    m_Error = ""
    If m_sTitulo <> "" Then
        Titulo = m_sTitulo
        Exit Property
    End If
    If Me.Auditoria Is Nothing Then
        Exit Property
    End If
    If Me.Numero = "" Then
        Exit Property
    End If
    
    m_sTitulo = Me.Auditoria.NombreAuditoria & " (" & Me.Numero & ")"
    
    Titulo = m_sTitulo
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método NCAuditoria.Titulo  ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property

Public Property Get NAccionCalculado() As String
    
   On Error GoTo errores

    Me.Error = ""
    m_Error = ""
    
    m_sNAccionCalculado = getNAccionACCalculado( _
                                                p_ID:=Me.id, _
                                                p_EsDeProyecto:=EnumSino.No, _
                                                p_Error:=m_Error)
    
    
    NAccionCalculado = m_sNAccionCalculado
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método NCAuditoria.NAccionCalculado  ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property



Public Function FPREVCIERREGrabar( _
                                    Optional p_Fecha As String, _
                                    Optional ByRef p_Error As String _
                                    ) As String
    
    Dim m_SQL As String
    
    On Error GoTo errores
    
    If Not IsDate(p_Fecha) Then
        m_sFPREVCIERRECalculada = ""
        p_Fecha = Me.FPREVCIERRECalculada
    End If
    Me.FPREVCIERRE = p_Fecha
    If p_Fecha = "" Then
        m_SQL = "UPDATE TbNoConformidadesAuditoria set FPREVCIERRE=Null " & _
                "WHERE ID=" & Me.id & ";"
    Else
        m_SQL = "UPDATE TbNoConformidadesAuditoria set FPREVCIERRE=#" & Format(Me.FPREVCIERRE, "mm/dd/yyyy") & "# " & _
                "WHERE ID=" & Me.id & ";"
    End If
    getdb().Execute m_SQL
    FPREVCIERREGrabar = p_Fecha
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método NCAuditoria.FPREVCIERREGrabar ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
    End If
    
End Function
Public Function FECHACIERREGrabar( _
                                    Optional p_Fecha As String, _
                                    Optional ByRef p_Error As String _
                                    ) As String
    
    Dim m_SQL As String
    
    On Error GoTo errores
    
    If Not IsDate(p_Fecha) Then
        m_sFECHACIERRECalculada = ""
        p_Fecha = Me.FECHACIERRECalculada
    End If
    Me.FECHACIERRE = p_Fecha
    If p_Fecha = "" Then
        m_SQL = "UPDATE TbNoConformidadesAuditoria set FECHACIERRE=Null " & _
                "WHERE ID=" & Me.id & ";"
    Else
        m_SQL = "UPDATE TbNoConformidadesAuditoria set FECHACIERRE=#" & Format(Me.FECHACIERRE, "mm/dd/yyyy") & "# " & _
                "WHERE ID=" & Me.id & ";"
    End If
    getdb().Execute m_SQL
    FECHACIERREGrabar = p_Fecha
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método NCAuditoria.FECHACIERREGrabar ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
    End If
    
End Function
Public Property Get FECHACIERRECalculada() As String
    
     On Error GoTo errores

    Me.Error = ""
    m_Error = ""
    
    If Me.RequiereAccionCorrectiva = "No" Then
        m_sFECHACIERRECalculada = Me.FechaApertura
        FECHACIERRECalculada = m_sFECHACIERRECalculada
        Exit Property
    End If
    If Me.CerradaCalculada = EnumSino.No Then
        Exit Property
    End If
    m_sFECHACIERRECalculada = getFECHACIERRENCCalculada( _
                                    p_ID:=Me.id, _
                                    p_EsDeProyecto:=EnumSino.No, _
                                    p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
   
    FECHACIERRECalculada = m_sFECHACIERRECalculada
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método NCAuditoria.FECHACIERRECalculada ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property

Public Function CIERREGrabar( _
                                    Optional p_Cerrada As EnumSino, _
                                    Optional ByRef p_Error As String _
                                    ) As String
    
    Dim m_SQL As String
    
    On Error GoTo errores
    
    If p_Cerrada = Empty Then
        p_Cerrada = Me.CerradaCalculada
    End If
    If p_Cerrada = EnumSino.Sí Then
        Me.Cerrada = "Sí"
    ElseIf p_Cerrada = EnumSino.No Then
        Me.Cerrada = "No"
    Else
        Exit Function
    End If
    m_SQL = "UPDATE TbNoConformidadesAuditoria set Cerrada='" & Me.Cerrada & "' WHERE ID=" & Me.id & ";"
    getdb().Execute m_SQL
    CIERREGrabar = Me.Cerrada
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método NCAuditoria.CIERREGrabar ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
    End If
    
End Function


Public Property Get FPREVCIERRECalculada() As String
    On Error GoTo errores

    Me.Error = ""
    m_Error = ""
    
    If Me.RequiereAccionCorrectiva = "No" Then
        m_sFPREVCIERRECalculada = Me.FechaApertura
        FPREVCIERRECalculada = m_sFPREVCIERRECalculada
        Exit Property
    End If
    m_sFPREVCIERRECalculada = getFPREVCIERRENCCalculada( _
                                    p_ID:=Me.id, _
                                    p_EsDeProyecto:=EnumSino.No, _
                                    p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
   
    FPREVCIERRECalculada = m_sFPREVCIERRECalculada
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método NCAuditoria.FPREVCIERRECalculada ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error

End Property
Public Property Get CerradaCalculada() As EnumSino
    
    Dim m_EstadoNC As EnumEstadoNC
    
    
    On Error GoTo errores
    Me.Error = ""
    m_Error = ""
    
    m_eTodasLasArsFinalizadas = Empty
    If Me.TodasLasArsFinalizadas = EnumSino.Sí Then
        m_eCerradaCalculada = EnumSino.Sí
    Else
        m_eCerradaCalculada = EnumSino.No
    End If
    
    CerradaCalculada = m_eCerradaCalculada
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método NCAuditoria.CerradaCalculada ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error

End Property





Public Property Get TieneAccionesPorReplanificar() As EnumSino
    
   On Error GoTo errores

    Me.Error = ""
    m_Error = ""
    
    If Me.CerradaCalculada = EnumSino.Sí Then
        m_eTieneAccionesPorReplanificar = EnumSino.No
        TieneAccionesPorReplanificar = m_eTieneAccionesPorReplanificar
        Exit Property
    End If
    m_eTieneAccionesPorReplanificar = getTieneAccionesNCPorReplanificar( _
                                    p_ID:=Me.id, _
                                    p_EsDeProyecto:=EnumSino.No, _
                                    p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
   
    TieneAccionesPorReplanificar = m_eTieneAccionesPorReplanificar
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método NCAuditoria.TieneAccionesPorReplanificar ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property

Public Property Get EstadoCalculado() As EnumEstadoNC
    
    On Error GoTo errores

    Me.Error = ""
    m_Error = ""
    
    With Me
        If .Borrado = True Then
            m_eESTADOCalculado = EnumEstadoNC.BORRADA
            EstadoCalculado = m_eESTADOCalculado
            Exit Property
        End If
        If .RequiereAccionCorrectiva = "No" Then
             m_eESTADOCalculado = EnumEstadoNC.Cerrada
            EstadoCalculado = m_eESTADOCalculado
            Exit Property
        End If
        If .ACs Is Nothing Then
            m_eESTADOCalculado = EnumEstadoNC.REGISTRADA
            EstadoCalculado = m_eESTADOCalculado
            Exit Property
        End If
        m_eAlgunaACSinAR = Empty
        If .AlgunaACSinAR = EnumSino.Sí Then
             m_eESTADOCalculado = EnumEstadoNC.ACSSINTAREAS
            EstadoCalculado = m_eESTADOCalculado
            Exit Property
        End If
        m_eTodasLasACsSinFechas = Empty
        If .TodasLasACsSinFechas = EnumSino.Sí Then
            m_eESTADOCalculado = EnumEstadoNC.PLANIFICADA
            EstadoCalculado = m_eESTADOCalculado
            Exit Property
        End If
        m_eTieneAccionesPorReplanificar = Empty
        If .TieneAccionesPorReplanificar = EnumSino.Sí Then
            m_eESTADOCalculado = EnumEstadoNC.ENEJECUCIONFUERADEPLAZO
            EstadoCalculado = m_eESTADOCalculado
            Exit Property
        End If
        m_eTodasLasArsFinalizadas = Empty
        If .TodasLasArsFinalizadas = EnumSino.Sí Then
            If .RequiereControlEficacia = "Sí" Then
                If .ControlEficacia = "" Then
                    'para los que hay que regularizar
                    m_eESTADOCalculado = EnumEstadoNC.CERRADAPTECE
                Else
                    If .FechaControlEficacia = "" Then
                        If IsDate(.FechaPrevistaControlEficacia) Then
                            If CDate(.FechaPrevistaControlEficacia) < CDate(Date) Then
                                m_eESTADOCalculado = EnumEstadoNC.CERRADAPTECECADUCADA
                            Else
                                m_eESTADOCalculado = EnumEstadoNC.CERRADAPTECE
                            End If
                        Else
                            m_eESTADOCalculado = EnumEstadoNC.CERRADAPTECE
                        End If
                        
                    Else
                        
                        If .ConformeControlEficacia = "No" Then
                            m_eESTADOCalculado = EnumEstadoNC.CERRADACENOCONFORME
                        Else
                             m_eESTADOCalculado = EnumEstadoNC.Cerrada
                        End If
                            
                       
                    End If
                End If
                
            Else
                m_eESTADOCalculado = EnumEstadoNC.Cerrada
            End If
        Else
            m_eESTADOCalculado = EnumEstadoNC.ENEJECUCION
        End If
        
    End With
    
    EstadoCalculado = m_eESTADOCalculado
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método NCAuditoria.EstadoCalculado ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property

Public Property Get EstadoCalculadoTexto() As String
    Dim m_EstadoCalculado As EnumEstadoNC
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    m_EstadoCalculado = Me.EstadoCalculado
    If m_ObjEntorno.ColEstadosNC.Exists(CStr(m_EstadoCalculado)) Then
        m_sESTADOCalculadoTexto = m_ObjEntorno.ColEstadosNC(CStr(m_EstadoCalculado))
    Else
        m_sESTADOCalculadoTexto = "DESCONOCIDO"
    End If
    
    
    EstadoCalculadoTexto = m_sESTADOCalculadoTexto
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método NCAuditoria.EstadoCalculadoTexto ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Get ACs() As Scripting.Dictionary
    
    On Error GoTo errores
    Me.Error = ""
    m_Error = ""
    If Not m_objACs Is Nothing Then
        Set ACs = m_objACs
        Exit Property
    End If
    Set m_objACs = constructor.getACsAuditoria(p_IDNC:=Me.id, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    
    Set ACs = m_objACs
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método NCAuditoria.ACs ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Set ACs(ByVal objNewValue As Variant)

    Set m_objACs = objNewValue

End Property

Public Property Get ARsSinFinalizar() As Scripting.Dictionary
    
    On Error GoTo errores
    Me.Error = ""
    m_Error = ""
    If Not m_objARsSinFinalizar Is Nothing Then
        Set ARsSinFinalizar = m_objARsSinFinalizar
        Exit Property
    End If
    If Me.RequiereAccionCorrectiva = "No" Then
        Exit Property
    End If
    Set m_objARsSinFinalizar = constructor.getACsAuditoriasSinFinalizar(p_IDNC:=Me.id, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    
    Set ARsSinFinalizar = m_objARsSinFinalizar
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método NCAuditoria.ARsSinFinalizar ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Set ARsSinFinalizar(ByVal objNewValue As Variant)

    Set m_objARsSinFinalizar = objNewValue

End Property
Public Property Get ACsSinAR() As Scripting.Dictionary
    
    On Error GoTo errores
    Me.Error = ""
    m_Error = ""
    If Not m_objACsSinAR Is Nothing Then
        Set ACsSinAR = m_objACsSinAR
        Exit Property
    End If
    If Me.RequiereAccionCorrectiva = "No" Then
        Exit Property
    End If
    Set m_objACsSinAR = constructor.getACsAuditoriasSinAR(p_IDNC:=Me.id, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    
    Set ACsSinAR = m_objACsSinAR
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método NCAuditoria.ACsSinAR ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Set ACsSinAR(ByVal objNewValue As Variant)

    Set m_objACsSinAR = objNewValue

End Property
Public Property Get TodasLasArsFinalizadas() As EnumSino
    On Error GoTo errores

    Me.Error = ""
    m_Error = ""
    
   
    m_eTodasLasArsFinalizadas = getTodasLasArsFinalizadas( _
                                    p_ID:=Me.id, _
                                    p_EsDeProyecto:=EnumSino.No, _
                                    p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
   
    TodasLasArsFinalizadas = m_eTodasLasArsFinalizadas
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método NCAuditoria.TodasLasArsFinalizadas ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property
Public Property Get AlgunaACSinAR() As EnumSino
    
    Dim m_Col As Scripting.Dictionary
    On Error GoTo errores
    Me.Error = ""
    m_Error = ""
    
    
    Set m_Col = Me.ACsSinAR
    m_Error = Me.Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    If Not m_Col Is Nothing Then
        m_eAlgunaACSinAR = EnumSino.Sí
    Else
         m_eAlgunaACSinAR = EnumSino.No
    End If
    AlgunaACSinAR = m_eAlgunaACSinAR
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método NCAuditoria.AlgunaACSinAR ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Get TodasLasACsSinFechas() As EnumSino
    
    On Error GoTo errores

    Me.Error = ""
    m_Error = ""
    
   
    m_eTodasLasACsSinFechas = getTodasLasACsSinFechas( _
                                    p_ID:=Me.id, _
                                    p_EsDeProyecto:=EnumSino.No, _
                                    p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
   
    TodasLasACsSinFechas = m_eTodasLasACsSinFechas
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método NCAuditoria.TodasLasACsSinFechas ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property
Public Property Get BorradoCalculado() As EnumSino

    On Error GoTo errores
    Me.Error = ""
    m_Error = ""
    
    If Me.Borrado = True Then
        m_eBorradoCalculado = EnumSino.Sí
    Else
        m_eBorradoCalculado = EnumSino.No
    End If
    BorradoCalculado = m_eBorradoCalculado
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método NCAuditoria.BorradoCalculado ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error

End Property



Public Property Get RequiereACRCalculado() As EnumSino

    On Error GoTo errores
    Me.Error = ""
    m_Error = ""
    
    If Me.RequiereAccionCorrectiva = True Then
        m_eRequiereACRCalculado = EnumSino.Sí
    Else
        m_eRequiereACRCalculado = EnumSino.No
    End If
    RequiereACRCalculado = m_eRequiereACRCalculado
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método NCAuditoria.RequiereACRCalculado ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error

End Property

Public Property Get RequiereControlEficaciaCalculado() As EnumSino

    On Error GoTo errores
    Me.Error = ""
    m_Error = ""
    
    If Me.RequiereControlEficacia = "Sí" Then
        m_eRequiereControlEficaciaCalculado = EnumSino.Sí
    ElseIf Me.RequiereControlEficacia = "No" Then
        m_eRequiereControlEficaciaCalculado = EnumSino.No
   
    End If
    RequiereControlEficaciaCalculado = m_eRequiereControlEficaciaCalculado
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método NCAuditoria.RequiereControlEficaciaCalculado ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error

End Property

Public Property Get ConControlDeEficaciaSinRellenar() As EnumSino

    On Error GoTo errores
    Me.Error = ""
    m_Error = ""
    If Me.RequiereControlEficaciaCalculado <> EnumSino.Sí Then
        m_eConControlDeEficaciaSinRellenar = EnumSino.No
        ConControlDeEficaciaSinRellenar = m_eConControlDeEficaciaSinRellenar
        Exit Property
    End If
    If CDate(Me.FechaControlEficacia) < CDate(Date) Then
        If Me.ControlEficacia = "" Then
            m_eConControlDeEficaciaSinRellenar = EnumSino.Sí
        Else
            m_eConControlDeEficaciaSinRellenar = EnumSino.No
        End If
    Else
        m_eConControlDeEficaciaSinRellenar = EnumSino.No
    End If
    ConControlDeEficaciaSinRellenar = m_eConControlDeEficaciaSinRellenar
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método NCAuditoria.ConControlDeEficaciaSinRellenar  ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error

End Property



Public Function DatosGeneralesOK( _
                                Optional p_MenosCef As EnumSino = EnumSino.No, _
                                Optional ByRef p_Error As String _
                                ) As EnumSino


    On Error GoTo errores
    Me.Error = ""
    m_Error = ""
    With Me
        If .Tipo = "" Then
            m_eDatosGeneralesOK = EnumSino.No
            DatosGeneralesOK = m_eDatosGeneralesOK
            Exit Function
        End If
        If .RequiereAccionCorrectiva = "" Then
            m_eDatosGeneralesOK = EnumSino.No
            DatosGeneralesOK = m_eDatosGeneralesOK
            Exit Function
        End If
        If .Descripcion = "" Then
            m_eDatosGeneralesOK = EnumSino.No
            DatosGeneralesOK = m_eDatosGeneralesOK
            Exit Function
        End If
        If .CAUSARAIZ = "" Then
            m_eDatosGeneralesOK = EnumSino.No
            DatosGeneralesOK = m_eDatosGeneralesOK
            Exit Function
        End If


        If .PuntoNorma = "" Then
            m_eDatosGeneralesOK = EnumSino.No
            DatosGeneralesOK = m_eDatosGeneralesOK
            Exit Function
        End If
        If .RESPONSABLEIMPLANTACION = "" Then
            m_eDatosGeneralesOK = EnumSino.No
            DatosGeneralesOK = m_eDatosGeneralesOK
            Exit Function
        End If

        If p_MenosCef <> EnumSino.Sí Then
            If .RequiereControlEficacia = "" Then
                m_eDatosGeneralesOK = EnumSino.No
                DatosGeneralesOK = m_eDatosGeneralesOK
                Exit Function

            End If

            If .RequiereControlEficacia = "Sí" Then
                If .ControlEficacia = "" Or .FechaPrevistaControlEficacia = "" Then
                    m_eDatosGeneralesOK = EnumSino.No
                    DatosGeneralesOK = m_eDatosGeneralesOK
                    Exit Function
                End If
            End If
        End If


    End With
    m_eDatosGeneralesOK = EnumSino.Sí
    DatosGeneralesOK = m_eDatosGeneralesOK
    Exit Function
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método NCAuditoria.DatosGeneralesOK  ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error

End Function
Public Property Get EficaciaOK() As EnumSino
    
    
    On Error GoTo errores
    Me.Error = ""
    m_Error = ""
    With Me
        If .RequiereControlEficacia = "" Then
            m_eEficaciaOK = EnumSino.No
            EficaciaOK = m_eEficaciaOK
            Exit Property
        End If
        If .ControlEficacia = "" Then
            m_eEficaciaOK = EnumSino.No
            EficaciaOK = m_eEficaciaOK
            Exit Property
        End If
        If .FechaControlEficacia = "" Then
            If .ResultadoControlEficacia <> "" Then
                m_eEficaciaOK = EnumSino.No
                EficaciaOK = m_eEficaciaOK
                Exit Property
            End If
            If .ConformeControlEficacia <> "" Then
                m_eEficaciaOK = EnumSino.No
                EficaciaOK = m_eEficaciaOK
                Exit Property
            End If
        Else
            If .ResultadoControlEficacia = "" Then
                m_eEficaciaOK = EnumSino.No
                EficaciaOK = m_eEficaciaOK
                Exit Property
            End If
            If .ConformeControlEficacia = "" Then
                m_eEficaciaOK = EnumSino.No
                EficaciaOK = m_eEficaciaOK
                Exit Property
            End If
        End If
        If .ResultadoControlEficacia = "" Then
            If .FechaControlEficacia <> "" Then
                m_eEficaciaOK = EnumSino.No
                EficaciaOK = m_eEficaciaOK
                Exit Property
            End If
            If .ConformeControlEficacia <> "" Then
                m_eEficaciaOK = EnumSino.No
                EficaciaOK = m_eEficaciaOK
                Exit Property
            End If
        Else
            If .FechaControlEficacia = "" Then
                m_eEficaciaOK = EnumSino.No
                EficaciaOK = m_eEficaciaOK
                Exit Property
            End If
            If .ConformeControlEficacia = "" Then
                m_eEficaciaOK = EnumSino.No
                EficaciaOK = m_eEficaciaOK
                Exit Property
            End If
        End If
        
        
    End With
    m_eEficaciaOK = EnumSino.Sí
    EficaciaOK = m_eEficaciaOK
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método NCAuditoria.EficaciaOK  ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error

End Property
Public Property Get AccionesOK() As EnumSino
    
    Dim m_Estado As EnumEstadoNC
    
    On Error GoTo errores
    Me.Error = ""
    m_Error = ""
    With Me
        m_Estado = .EstadoCalculado
        If m_Estado = EnumEstadoNC.REGISTRADA Or m_Estado = EnumEstadoNC.ACSSINTAREAS Or m_Estado = EnumEstadoNC.ENEJECUCIONFUERADEPLAZO Then
            m_eAccionesOK = EnumSino.No
        Else
            m_eAccionesOK = EnumSino.Sí
        End If
    End With
    AccionesOK = m_eAccionesOK
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método NCAuditoria.AccionesOK  ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error


End Property

Public Property Get TieneAcciones() As EnumSino
    
    
    On Error GoTo errores
    Me.Error = ""
    m_Error = ""
    With Me
        If Me.RequiereAccionCorrectiva = "No" Then
            m_eTieneAcciones = EnumSino.No
            TieneAcciones = m_eTieneAcciones
            Exit Property
        End If
       
        If Not .ACs Is Nothing Then
            m_eTieneAcciones = EnumSino.Sí
        Else
            m_eTieneAcciones = EnumSino.No
        End If
    End With
    TieneAcciones = m_eTieneAcciones
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método NCAuditoria.TieneAcciones  ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error

End Property





Public Property Get Documentos() As Scripting.Dictionary
    
    On Error GoTo errores
    Me.Error = ""
    m_Error = ""
    If Not m_objDocumentos Is Nothing Then
        Set Documentos = m_objDocumentos
        Exit Property
    End If
    Set m_objDocumentos = constructor.getDocumentosAuditoria(p_IDNC:=Me.id, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set Documentos = m_objDocumentos
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método NCAuditoria.Documentos ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Set Documentos(ByVal objNewValue As Variant)

    Set m_objDocumentos = objNewValue

End Property

Public Property Get DocumentosCompletos() As Scripting.Dictionary
    
    On Error GoTo errores
    Me.Error = ""
    m_Error = ""
    If Not m_objDocumentosCompletos Is Nothing Then
        Set DocumentosCompletos = m_objDocumentosCompletos
        Exit Property
    End If
    Set m_objDocumentosCompletos = constructor.getDocumentosCompletosAuditoria(p_IDNC:=Me.id, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set DocumentosCompletos = m_objDocumentosCompletos
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método NCAuditoria.DocumentosCompletos ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Set DocumentosCompletos(ByVal objNewValue As Variant)

    Set m_objDocumentosCompletos = objNewValue

End Property
Public Property Get Auditoria() As Auditoria
    
    On Error GoTo errores
    Me.Error = ""
    m_Error = ""
    If Not m_ObjAuditoria Is Nothing Then
        Set Auditoria = m_ObjAuditoria
        Exit Property
    End If
    If Me.IDAuditoria = "" Then
        Exit Property
    End If
    Set m_ObjAuditoria = constructor.getAuditoria(p_ID:=Me.IDAuditoria, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set Auditoria = m_ObjAuditoria
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método NCAuditoria.Auditoria ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Get IDCalculado() As String

    On Error GoTo errores
    Me.Error = ""
    m_Error = ""
    m_sIDCalculado = constructor.getID("TbNoConformidadesAuditoria", "ID", getdb(), m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    IDCalculado = m_sIDCalculado
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método NCAuditoria.IDCalculado ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error

End Property

Public Function EstadoGrabar( _
                                Optional p_Estado As String, _
                                Optional ByRef p_Error As String _
                                ) As String
    
    
    
    Dim m_SQL As String
    
    
    On Error GoTo errores
    
    If p_Estado = "" Then
        p_Estado = Me.EstadoCalculadoTexto
    End If
    Me.Estado = p_Estado
    
    
    m_SQL = "UPDATE TbNoConformidadesAuditoria " & _
            "SET Estado = '" & Me.Estado & "' " & _
            "WHERE ID=" & Me.id & ";"
    getdb().Execute m_SQL
   
   
   
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método NCAuditoria.EstadoGrabar ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function


Public Property Get EstadoEnum() As EnumEstadoNC
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If m_eEstadoEnum <> Empty Then
        EstadoEnum = m_eEstadoEnum
        Exit Property
    End If
    If m_ObjEntorno.ColEstadosNCTexto.Exists(Me.Estado) Then
        m_eEstadoEnum = m_ObjEntorno.ColEstadosNCTexto(Me.Estado)
    End If
    EstadoEnum = m_eEstadoEnum
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método NCAuditoria.EstadoEnum ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Get EstadoTitulo() As String
    
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    If Me.EstadoEnum = Empty Then
        Exit Property
    End If
    If m_ObjEntorno.ColEstadosNCTitulo.Exists(CStr(Me.EstadoEnum)) Then
        m_sEstadoTitulo = m_ObjEntorno.ColEstadosNCTitulo(CStr(Me.EstadoEnum))
    End If
    EstadoTitulo = m_sEstadoTitulo
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método NCAuditoria.EstadoTitulo ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property


Public Property Get Replanificaciones() As Scripting.Dictionary
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If Not m_ObjReplanificaciones Is Nothing Then
        Set Replanificaciones = m_ObjReplanificaciones
        Exit Property
    End If
    If Me.id = "" Then
        Exit Property
    End If
    Set m_ObjReplanificaciones = constructor.getReplanificacionesDeNCAuditoria( _
                                        p_IDNC:=Me.id, p_Error:=m_Error)
    
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    
    Set Replanificaciones = m_ObjReplanificaciones
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método NCAuditoria.Replanificaciones ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Set Replanificaciones(p_Valor As Variant)

    Set m_ObjReplanificaciones = p_Valor

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
        .Add "ID"
        .Add "IDAuditoria"
        .Add "FechaApertura"
        .Add "Numero"
        .Add "DESCRIPCION"
        .Add "CAUSARAIZ"
        .Add "ACCIONCORRECTIVA"
        .Add "CORRECCION"
        .Add "FECHACIERRE"
        .Add "FPREVCIERRE"
        .Add "RESPONSABLEIMPLANTACION"
        .Add "RequiereControlEficacia"
        .Add "ControlEficacia"
        .Add "FechaControlEficacia"
        .Add "FechaPrevistaControlEficacia"
        .Add "ResultadoControlEficacia"
        .Add "ConformeControlEficacia"
        .Add "RequiereAccionCorrectiva"
        .Add "MotivoNoAccionCorrectiva"
        .Add "Tipo"
        .Add "PuntoNorma"
        .Add "ESTADO"
        .Add "Borrado"
        .Add "MotivoBorrado"
        .Add "Notas"
        .Add "Cerrada"
        .Add "MotivoNoRequiereControlEficacia"
    End With
    Set ColCampos = m_objColCampos
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método NCAuditoria.ColCampos ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property


Public Function getPropiedad(m_NombrePropiedad As Variant, Optional ByRef p_Error As String) As Variant

    On Error GoTo errores

    Me.Error = ""
    If m_NombrePropiedad = "ID" Then
        getPropiedad = Me.id
        Exit Function
    End If
    If m_NombrePropiedad = "IDAuditoria" Then
        getPropiedad = Me.IDAuditoria
        Exit Function
    End If
    If m_NombrePropiedad = "FechaApertura" Then
        getPropiedad = Me.FechaApertura
        Exit Function
    End If
    If m_NombrePropiedad = "Numero" Then
        getPropiedad = Me.Numero
        Exit Function
    End If
    If m_NombrePropiedad = "DESCRIPCION" Then
        getPropiedad = Me.Descripcion
        Exit Function
    End If
    If m_NombrePropiedad = "CAUSARAIZ" Then
        getPropiedad = Me.CAUSARAIZ
        Exit Function
    End If
    If m_NombrePropiedad = "ACCIONCORRECTIVA" Then
        getPropiedad = Me.AccionCorrectiva
        Exit Function
    End If
    If m_NombrePropiedad = "CORRECCION" Then
        getPropiedad = Me.CORRECCION
        Exit Function
    End If
    If m_NombrePropiedad = "FECHACIERRE" Then
        getPropiedad = Me.FECHACIERRE
        Exit Function
    End If
    If m_NombrePropiedad = "FPREVCIERRE" Then
        getPropiedad = Me.FPREVCIERRE
        Exit Function
    End If
    If m_NombrePropiedad = "RESPONSABLEIMPLANTACION" Then
        getPropiedad = Me.RESPONSABLEIMPLANTACION
        Exit Function
    End If
    If m_NombrePropiedad = "RequiereControlEficacia" Then
        getPropiedad = Me.RequiereControlEficacia
        Exit Function
    End If
    If m_NombrePropiedad = "ControlEficacia" Then
        getPropiedad = Me.ControlEficacia
        Exit Function
    End If
    If m_NombrePropiedad = "FechaControlEficacia" Then
        getPropiedad = Me.FechaControlEficacia
        Exit Function
    End If
    If m_NombrePropiedad = "FechaPrevistaControlEficacia" Then
        getPropiedad = Me.FechaPrevistaControlEficacia
        Exit Function
    End If
    If m_NombrePropiedad = "ResultadoControlEficacia" Then
        getPropiedad = Me.ResultadoControlEficacia
        Exit Function
    End If
    If m_NombrePropiedad = "ConformeControlEficacia" Then
        getPropiedad = Me.ConformeControlEficacia
        Exit Function
    End If
    If m_NombrePropiedad = "RequiereAccionCorrectiva" Then
        getPropiedad = Me.RequiereAccionCorrectiva
        Exit Function
    End If
    If m_NombrePropiedad = "MotivoNoAccionCorrectiva" Then
        getPropiedad = Me.MotivoNoAccionCorrectiva
        Exit Function
    End If
    If m_NombrePropiedad = "Tipo" Then
        getPropiedad = Me.Tipo
        Exit Function
    End If
    If m_NombrePropiedad = "PuntoNorma" Then
        getPropiedad = Me.PuntoNorma
        Exit Function
    End If
    If m_NombrePropiedad = "Borrado" Then
        getPropiedad = Me.Borrado
        Exit Function
    End If
    If m_NombrePropiedad = "MotivoBorrado" Then
        getPropiedad = Me.MotivoBorrado
        Exit Function
    End If
    If m_NombrePropiedad = "Notas" Then
        getPropiedad = Me.Notas
        Exit Function
    End If
    If m_NombrePropiedad = "Cerrada" Then
        getPropiedad = Me.Cerrada
        Exit Function
    End If
    If m_NombrePropiedad = "Estado" Then
        getPropiedad = Me.Estado
        Exit Function
    End If
    If m_NombrePropiedad = "MotivoNoRequiereControlEficacia" Then
        getPropiedad = Me.MotivoNoRequiereControlEficacia
        Exit Function
    End If
    p_Error = "Propiedad no reconocida en NCAuditoria.getPropiedad"
    Err.Raise 1000
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método NCAuditoria.getPropiedad ha devuelto el error:" & vbNewLine & Err.Description
    End If
End Function


Public Function SetPropiedad(m_NombrePropiedad As Variant, m_ValorPropiedad As Variant, Optional ByRef p_Error As String) As String
    On Error GoTo errores

    Me.Error = ""
    p_Error = ""
    If m_NombrePropiedad = "ID" Then
        Me.id = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "IDAuditoria" Then
        Me.IDAuditoria = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "FechaApertura" Then
        Me.FechaApertura = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "Numero" Then
        Me.Numero = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "DESCRIPCION" Then
        Me.Descripcion = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "CAUSARAIZ" Then
        Me.CAUSARAIZ = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "ACCIONCORRECTIVA" Then
        Me.AccionCorrectiva = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "CORRECCION" Then
        Me.CORRECCION = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "FECHACIERRE" Then
        Me.FECHACIERRE = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "FPREVCIERRE" Then
        Me.FPREVCIERRE = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "RESPONSABLEIMPLANTACION" Then
        Me.RESPONSABLEIMPLANTACION = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "RequiereControlEficacia" Then
        Me.RequiereControlEficacia = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "ControlEficacia" Then
        Me.ControlEficacia = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "FechaControlEficacia" Then
        Me.FechaControlEficacia = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "FechaPrevistaControlEficacia" Then
        Me.FechaPrevistaControlEficacia = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "ResultadoControlEficacia" Then
        Me.ResultadoControlEficacia = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "ConformeControlEficacia" Then
        Me.ConformeControlEficacia = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "RequiereAccionCorrectiva" Then
        Me.RequiereAccionCorrectiva = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "MotivoNoAccionCorrectiva" Then
        Me.MotivoNoAccionCorrectiva = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "Tipo" Then
        Me.Tipo = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "PuntoNorma" Then
        Me.PuntoNorma = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "Borrado" Then
        Me.Borrado = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "MotivoBorrado" Then
        Me.MotivoBorrado = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "Notas" Then
        Me.Notas = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "Cerrada" Then
        Me.Cerrada = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "Estado" Then
        Me.Estado = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "MotivoNoRequiereControlEficacia" Then
        Me.MotivoNoRequiereControlEficacia = m_ValorPropiedad
        Exit Function
    End If
    p_Error = "Propiedad no reconocida en NCAuditoria.SetPropiedad"
    Err.Raise 1000
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método NCAuditoria.SetPropiedad ha devuelto el error:" & vbNewLine & Err.Description
    End If
End Function



