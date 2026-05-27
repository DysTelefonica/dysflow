VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "NCProyectoDetailVM"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
Option Compare Database
Option Explicit

Private m_IDNoConformidad As Long
Private m_CodigoNoConformidad As String
Private m_Estado As String
Private m_Descripcion As String
Private m_Causa As String
Private m_ResponsableTelefonica As String
Private m_ResponsableCalidad As String
Private m_Proyecto As String
Private m_VEHICULO As String
Private m_Expediente As String
Private m_FechaApertura As Date
Private m_FechaCierre As Date
Private m_FechaPrevCierre As Date
Private m_Juridica As String
Private m_Tipo As String
Private m_Not As String
Private m_Cerrada As String
Private m_RequiereACR As Boolean
Private m_ACR As String
Private m_RequiereControlEficacia As String
Private m_ControlEficacia As String
Private m_FechaControlEficacia As Date
Private m_ConformeControlEficacia As String
Private m_IDTipo As Long
Private m_Tipologia As String
Private m_IDExpediente As Long
Private m_CodExp As String
Private m_Nemotecnico As String
Private m_CodigoRiesgo As String
Private m_DetectadoPor As String
Private m_ResponsableEjecucion As String
Private m_IDNCAsociada As Long
Private m_CodigoNoConformidadAsociada As String

Private m_ColARs As Collection
Private m_ColACs As Collection
Private m_ColDocumentos As Collection
Private m_ColReplanificaciones As Collection

Private m_Cargado As Boolean

Public Property Get IDNoConformidad() As Long
    IDNoConformidad = m_IDNoConformidad
End Property

Public Property Get CodigoNoConformidad() As String
    CodigoNoConformidad = m_CodigoNoConformidad
End Property

Public Property Get Estado() As String
    Estado = m_Estado
End Property

Public Property Get Descripcion() As String
    Descripcion = m_Descripcion
End Property

Public Property Get Causa() As String
    Causa = m_Causa
End Property

Public Property Get ResponsableTelefonica() As String
    ResponsableTelefonica = m_ResponsableTelefonica
End Property

Public Property Get RESPONSABLECALIDAD() As String
    RESPONSABLECALIDAD = m_ResponsableCalidad
End Property

Public Property Get Proyecto() As String
    Proyecto = m_Proyecto
End Property

Public Property Get VEHICULO() As String
    VEHICULO = m_VEHICULO
End Property

Public Property Get Expediente() As String
    Expediente = m_Expediente
End Property

Public Property Get FechaApertura() As Date
    FechaApertura = m_FechaApertura
End Property

Public Property Get FECHACIERRE() As Date
    FECHACIERRE = m_FechaCierre
End Property

Public Property Get FechaPrevCierre() As Date
    FechaPrevCierre = m_FechaPrevCierre
End Property

Public Property Get Juridica() As String
    Juridica = m_Juridica
End Property

Public Property Get Tipo() As String
    Tipo = m_Tipo
End Property

Public Property Get Notas() As String
    Notas = m_Not
End Property

Public Property Get Cerrada() As String
    Cerrada = m_Cerrada
End Property

Public Property Get RequiereACR() As Boolean
    RequiereACR = m_RequiereACR
End Property

Public Property Get ACR() As String
    ACR = m_ACR
End Property

Public Property Get RequiereControlEficacia() As String
    RequiereControlEficacia = m_RequiereControlEficacia
End Property

Public Property Get ControlEficacia() As String
    ControlEficacia = m_ControlEficacia
End Property

Public Property Get FechaControlEficacia() As Date
    FechaControlEficacia = m_FechaControlEficacia
End Property

Public Property Get ConformeControlEficacia() As String
    ConformeControlEficacia = m_ConformeControlEficacia
End Property

Public Property Get IDTipo() As Long
    IDTipo = m_IDTipo
End Property

Public Property Get Tipologia() As String
    Tipologia = m_Tipologia
End Property

Public Property Get IDExpediente() As Long
    IDExpediente = m_IDExpediente
End Property

Public Property Get CodExp() As String
    CodExp = m_CodExp
End Property

Public Property Get Nemotecnico() As String
    Nemotecnico = m_Nemotecnico
End Property

Public Property Get CodigoRiesgo() As String
    CodigoRiesgo = m_CodigoRiesgo
End Property

Public Property Get DetectadoPor() As String
    DetectadoPor = m_DetectadoPor
End Property

Public Property Get ResponsableEjecucion() As String
    ResponsableEjecucion = m_ResponsableEjecucion
End Property

Public Property Get IDNCAsociada() As Long
    IDNCAsociada = m_IDNCAsociada
End Property

Public Property Get CodigoNoConformidadAsociada() As String
    CodigoNoConformidadAsociada = m_CodigoNoConformidadAsociada
End Property

Public Property Get colARs() As Collection
    Set colARs = m_ColARs
End Property

Public Property Get ColACs() As Collection
    Set ColACs = m_ColACs
End Property

Public Property Get ColDocumentos() As Collection
    Set ColDocumentos = m_ColDocumentos
End Property

Public Property Get ColReplanificaciones() As Collection
    Set ColReplanificaciones = m_ColReplanificaciones
End Property

Public Property Get EstaCargado() As Boolean
    EstaCargado = m_Cargado
End Property

Public Function CargarPorID( _
            ByVal p_IDNoConformidad As Long, _
            Optional ByRef p_Error As String) As Boolean

    Dim db As DAO.Database
    Dim rs As DAO.Recordset
    Dim rsACs As DAO.Recordset
    Dim rsARs As DAO.Recordset
    Dim rsDocs As DAO.Recordset
    Dim rsReplanif As DAO.Recordset
    Dim sql As String

    On Error GoTo errores

    p_Error = ""
    m_Cargado = False

    Set db = getdb()

    sql = "SELECT * FROM TbNoConformidades WHERE IDNoConformidad = " & p_IDNoConformidad
    Set rs = db.OpenRecordset(sql, dbOpenSnapshot)

    If Not rs.EOF Then
        m_IDNoConformidad = Nz(rs!IDNoConformidad, 0)
        m_CodigoNoConformidad = Nz(rs!CodigoNoConformidad, "")
        m_Estado = Nz(rs!Estado, "")
        m_Descripcion = Nz(rs!Descripcion, "")
        m_Causa = Nz(rs!Causa, "")
        m_ResponsableTelefonica = Nz(rs!ResponsableTelefonica, "")
        m_ResponsableCalidad = Nz(rs!RESPONSABLECALIDAD, "")
        m_Proyecto = Nz(rs!Proyecto, "")
        m_VEHICULO = Nz(rs!VEHICULO, "")
        m_Expediente = Nz(rs!Expediente, "")
        m_FechaApertura = Nz(rs!FechaApertura, 0)
        m_FechaCierre = Nz(rs!FECHACIERRE, 0)
        m_FechaPrevCierre = Nz(rs!FPREVCIERRE, 0)
        m_Juridica = Nz(rs!Juridica, "")
        m_Tipo = Nz(rs!Tipo, "")
        m_Not = Nz(rs!Notas, "")
        m_Cerrada = Nz(rs!Cerrada, "")
        m_RequiereACR = Nz(rs!RequiereACR, False)
        m_ACR = Nz(rs!ACR, "")
        m_RequiereControlEficacia = Nz(rs!RequiereControlEficacia, "")
        m_ControlEficacia = Nz(rs!ControlEficacia, "")
        m_FechaControlEficacia = Nz(rs!FechaControlEficacia, 0)
        m_ConformeControlEficacia = Nz(rs!ConformeControlEficacia, "")
        m_IDTipo = Nz(rs!IDTipo, 0)
        m_Tipologia = Nz(rs!Tipologia, "")
        m_IDExpediente = Nz(rs!IDExpediente, 0)
        m_CodExp = Nz(rs!CodExp, "")
        m_Nemotecnico = Nz(rs!Nemotecnico, "")
        m_CodigoRiesgo = Nz(rs!CodigoRiesgo, "")
        m_DetectadoPor = Nz(rs!DetectadoPor, "")
        m_ResponsableEjecucion = Nz(rs!ResponsableEjecucion, "")
        m_IDNCAsociada = Nz(rs!IDNCAsociada, 0)
        m_CodigoNoConformidadAsociada = Nz(rs!CodigoNoConformidadAsociada, "")
    Else
        rs.Close
        Set rs = Nothing
        Set db = Nothing
        CargarPorID = True
        Exit Function
    End If

    rs.Close

    Set m_ColARs = New Collection
    ' ARs: join con ACs para obtener ARs filtradas por NC
    sql = "SELECT AR.IDAccionRealizada, AR.NAccion, AR.AccionRealizada, AR.Responsable, " & _
          "AR.Estado, AR.FechaAccionRealizada, AR.FechaInicio, AR.FechaFinPrevista, " & _
          "AR.FechaFinReal, AR.Notas " & _
          "FROM (TbNCAccionesRealizadas AR " & _
          "INNER JOIN TbNCAccionCorrectivas AC ON AR.IDAccionCorrectiva = AC.IDAccionCorrectiva) " & _
          "WHERE AC.IDNoConformidad = " & p_IDNoConformidad & " " & _
          "ORDER BY AR.NAccion"
    Set rsARs = db.OpenRecordset(sql, dbOpenSnapshot)
    Do While Not rsARs.EOF
        m_ColARs.Add Array( _
            Nz(rsARs!IDAccionRealizada, 0), _
            Nz(rsARs!NAccion, 0), _
            Nz(rsARs!AccionRealizada, ""), _
            Nz(rsARs!Responsable, ""), _
            Nz(rsARs!Estado, ""), _
            Nz(rsARs!FechaAccionRealizada, 0), _
            Nz(rsARs!FechaInicio, 0), _
            Nz(rsARs!FechaFinPrevista, 0), _
            Nz(rsARs!FechaFinReal, 0), _
            Nz(rsARs!Notas, ""))
        rsARs.MoveNext
    Loop
    rsARs.Close

    Set m_ColACs = New Collection
    sql = "SELECT IDAccionCorrectiva, NAccion, AccionCorrectiva, Responsable, Estado, " & _
          "FechaAccionCorrectiva, FechaFinPrevistaUltima, FechaFinalUltima " & _
          "FROM TbNCAccionCorrectivas " & _
          "WHERE IDNoConformidad = " & p_IDNoConformidad & " " & _
          "ORDER BY NAccion"
    Set rsACs = db.OpenRecordset(sql, dbOpenSnapshot)
    Do While Not rsACs.EOF
        m_ColACs.Add Array( _
            Nz(rsACs!IdAccionCorrectiva, 0), _
            Nz(rsACs!NAccion, 0), _
            Nz(rsACs!AccionCorrectiva, ""), _
            Nz(rsACs!Responsable, ""), _
            Nz(rsACs!Estado, ""), _
            Nz(rsACs!FechaAccionCorrectiva, 0), _
            Nz(rsACs!FechaFinPrevistaUltima, 0), _
            Nz(rsACs!FechaFinalUltima, 0))
        rsACs.MoveNext
    Loop
    rsACs.Close

    Set m_ColDocumentos = New Collection
    sql = "SELECT IDAnexo, TituloAnexo, NombreArchivoFinalAnexo, FechaAnexo " & _
          "FROM TbAnexos " & _
          "WHERE IDNoConformidad = " & p_IDNoConformidad & " " & _
          "ORDER BY FechaAnexo DESC"
    Set rsDocs = db.OpenRecordset(sql, dbOpenSnapshot)
    Do While Not rsDocs.EOF
        m_ColDocumentos.Add Array( _
            Nz(rsDocs!IDAnexo, 0), _
            Nz(rsDocs!TituloAnexo, ""), _
            Nz(rsDocs!NombreArchivoFinalAnexo, ""), _
            Nz(rsDocs!FechaAnexo, 0))
        rsDocs.MoveNext
    Loop
    rsDocs.Close

    Set m_ColReplanificaciones = New Collection
    sql = "SELECT IDReplanificacion, Observaciones, FechaPrevistaAlInicio, FechaPrevistaReplanificada, " & _
          "FechaReprogramacion " & _
          "FROM TbReplanificacionesProyecto " & _
          "WHERE IDNoConformidad = " & p_IDNoConformidad & " " & _
          "ORDER BY FechaReprogramacion DESC"
    Set rsReplanif = db.OpenRecordset(sql, dbOpenSnapshot)
    Do While Not rsReplanif.EOF
        m_ColReplanificaciones.Add Array( _
            Nz(rsReplanif!IDReplanificacion, 0), _
            Nz(rsReplanif!Observaciones, ""), _
            Nz(rsReplanif!FechaPrevistaAlInicio, 0), _
            Nz(rsReplanif!FechaPrevistaReplanificada, 0), _
            Nz(rsReplanif!FechaReprogramacion, 0))
        rsReplanif.MoveNext
    Loop
    rsReplanif.Close

    If Not rsARs Is Nothing Then Set rsARs = Nothing
    If Not rsACs Is Nothing Then Set rsACs = Nothing
    If Not rsDocs Is Nothing Then Set rsDocs = Nothing
    If Not rsReplanif Is Nothing Then Set rsReplanif = Nothing
    If Not rs Is Nothing Then Set rs = Nothing
    Set db = Nothing

    m_Cargado = True
    CargarPorID = True
    Exit Function

errores:
    p_Error = "Error en NCProyectoDetailVM.CargarPorID: " & Err.Description
    If Not rsARs Is Nothing Then rsARs.Close: Set rsARs = Nothing
    If Not rsACs Is Nothing Then rsACs.Close: Set rsACs = Nothing
    If Not rsDocs Is Nothing Then rsDocs.Close: Set rsDocs = Nothing
    If Not rsReplanif Is Nothing Then rsReplanif.Close: Set rsReplanif = Nothing
    If Not rs Is Nothing Then rs.Close: Set rs = Nothing
    Set db = Nothing
    CargarPorID = False
End Function

