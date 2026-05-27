VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "NCProyectoListItemVM"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
Option Compare Database
Option Explicit

Private m_IDNoConformidad As Long
Private m_CodigoNoConformidad As String
Private m_IDExpediente As Long
Private m_Descripcion As String
Private m_Expediente As String
Private m_Estado As String
Private m_FechaApertura As Date
Private m_FechaCierre As Date
Private m_Proyecto As String
Private m_VEHICULO As String
Private m_ResponsableTelefonica As String
Private m_ResponsableCalidad As String
Private m_Cerrada As String
Private m_RequiereACR As Boolean
Private m_ACR As String
Private m_RequiereControlEficacia As String
Private m_Nemotecnico As String
Private m_CodExp As String

Private m_Cargado As Boolean

Public Property Get IDNoConformidad() As Long
    IDNoConformidad = m_IDNoConformidad
End Property

Public Property Let IDNoConformidad(ByVal p_Value As Long)
    m_IDNoConformidad = p_Value
End Property

Public Property Get CodigoNoConformidad() As String
    CodigoNoConformidad = m_CodigoNoConformidad
End Property

Public Property Let CodigoNoConformidad(ByVal p_Value As String)
    m_CodigoNoConformidad = p_Value
End Property

Public Property Get IDExpediente() As Long
    IDExpediente = m_IDExpediente
End Property

Public Property Let IDExpediente(ByVal p_Value As Long)
    m_IDExpediente = p_Value
End Property

Public Property Get Descripcion() As String
    Descripcion = m_Descripcion
End Property

Public Property Let Descripcion(ByVal p_Value As String)
    m_Descripcion = p_Value
End Property

Public Property Get Expediente() As String
    Expediente = m_Expediente
End Property

Public Property Get Estado() As String
    Estado = m_Estado
End Property

Public Property Let Estado(ByVal p_Value As String)
    m_Estado = p_Value
End Property

Public Property Get FechaApertura() As Date
    FechaApertura = m_FechaApertura
End Property

Public Property Let FechaApertura(ByVal p_Value As Date)
    m_FechaApertura = p_Value
End Property

Public Property Get FECHACIERRE() As Date
    FECHACIERRE = m_FechaCierre
End Property

Public Property Let FECHACIERRE(ByVal p_Value As Date)
    m_FechaCierre = p_Value
End Property

Public Property Get Proyecto() As String
    Proyecto = m_Proyecto
End Property

Public Property Get VEHICULO() As String
    VEHICULO = m_VEHICULO
End Property

Public Property Get ResponsableTelefonica() As String
    ResponsableTelefonica = m_ResponsableTelefonica
End Property

Public Property Get RESPONSABLECALIDAD() As String
    RESPONSABLECALIDAD = m_ResponsableCalidad
End Property

Public Property Get Cerrada() As String
    Cerrada = m_Cerrada
End Property

Public Property Let Cerrada(ByVal p_Value As String)
    m_Cerrada = p_Value
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

Public Property Get Nemotecnico() As String
    Nemotecnico = m_Nemotecnico
End Property

Public Property Let Nemotecnico(ByVal p_Value As String)
    m_Nemotecnico = p_Value
End Property

Public Property Get CodExp() As String
    CodExp = m_CodExp
End Property

Public Property Let CodExp(ByVal p_Value As String)
    m_CodExp = p_Value
End Property

Public Property Get ExpedienteCalculadoTexto() As String
    If m_Nemotecnico <> "" And m_CodExp <> "" Then
        ExpedienteCalculadoTexto = m_Nemotecnico & " (" & m_CodExp & ")"
    ElseIf m_Nemotecnico <> "" Then
        ExpedienteCalculadoTexto = m_Nemotecnico
    Else
        ExpedienteCalculadoTexto = m_CodExp
    End If
End Property

Public Property Get EstaCargado() As Boolean
    EstaCargado = m_Cargado
End Property

Public Function CargarPorID( _
            ByVal p_IDNoConformidad As Long, _
            Optional ByRef p_Error As String) As Boolean

    Dim db As DAO.Database
    Dim rs As DAO.Recordset
    Dim sql As String

    On Error GoTo errores

    p_Error = ""
    m_Cargado = False

    Set db = getdb()
    sql = "SELECT IDNoConformidad, CodigoNoConformidad, Descripcion, Expediente, " & _
          "Estado, FechaApertura, FECHACIERRE, Proyecto, Vehiculo, " & _
          "ResponsableTelefonica, ResponsableCalidad, Cerrada, RequiereACR, ACR, " & _
          "RequiereControlEficacia " & _
          "FROM TbNoConformidades " & _
          "WHERE IDNoConformidad = " & p_IDNoConformidad

    Set rs = db.OpenRecordset(sql, dbOpenSnapshot)

    If Not rs.EOF Then
        m_IDNoConformidad = Nz(rs!IDNoConformidad, 0)
        m_CodigoNoConformidad = Nz(rs!CodigoNoConformidad, "")
        m_Descripcion = Nz(rs!Descripcion, "")
        m_Expediente = Nz(rs!Expediente, "")
        m_Estado = Nz(rs!Estado, "")
        m_FechaApertura = Nz(rs!FechaApertura, 0)
        m_FechaCierre = Nz(rs!FECHACIERRE, 0)
        m_Proyecto = Nz(rs!Proyecto, "")
        m_VEHICULO = Nz(rs!VEHICULO, "")
        m_ResponsableTelefonica = Nz(rs!ResponsableTelefonica, "")
        m_ResponsableCalidad = Nz(rs!RESPONSABLECALIDAD, "")
        m_Cerrada = Nz(rs!Cerrada, "")
        m_RequiereACR = Nz(rs!RequiereACR, False)
        m_ACR = Nz(rs!ACR, "")
        m_RequiereControlEficacia = Nz(rs!RequiereControlEficacia, "")

        m_Cargado = True
    End If

    rs.Close
    Set rs = Nothing
    Set db = Nothing

    CargarPorID = True
    Exit Function

errores:
    p_Error = "Error en NCProyectoListItemVM.CargarPorID: " & Err.Description
    If Not rs Is Nothing Then
        rs.Close
        Set rs = Nothing
    End If
    Set db = Nothing
    CargarPorID = False
End Function

Public Function CargarDesdeRecordset( _
            ByRef p_Rs As DAO.Recordset, _
            Optional ByRef p_Error As String) As Boolean

    On Error GoTo errores

    p_Error = ""
    m_Cargado = False

    If Not p_Rs.EOF Then
        m_IDNoConformidad = Nz(p_Rs!IDNoConformidad, 0)
        m_CodigoNoConformidad = Nz(p_Rs!CodigoNoConformidad, "")
        m_Descripcion = Nz(p_Rs!Descripcion, "")
        m_Expediente = Nz(p_Rs!Expediente, "")
        m_Estado = Nz(p_Rs!Estado, "")
        m_FechaApertura = Nz(p_Rs!FechaApertura, 0)
        m_FechaCierre = Nz(p_Rs!FECHACIERRE, 0)
        m_Proyecto = Nz(p_Rs!Proyecto, "")
        m_VEHICULO = Nz(p_Rs!VEHICULO, "")
        m_ResponsableTelefonica = Nz(p_Rs!ResponsableTelefonica, "")
        m_ResponsableCalidad = Nz(p_Rs!RESPONSABLECALIDAD, "")
        m_Cerrada = Nz(p_Rs!Cerrada, "")
        m_RequiereACR = Nz(p_Rs!RequiereACR, False)
        m_ACR = Nz(p_Rs!ACR, "")
        m_RequiereControlEficacia = Nz(p_Rs!RequiereControlEficacia, "")
        m_Nemotecnico = Nz(p_Rs!Nemotecnico, "")
        m_CodExp = Nz(p_Rs!CodExp, "")

        m_Cargado = True
    End If

    CargarDesdeRecordset = True
    Exit Function

errores:
    p_Error = "Error en NCProyectoListItemVM.CargarDesdeRecordset: " & Err.Description
    CargarDesdeRecordset = False
End Function

