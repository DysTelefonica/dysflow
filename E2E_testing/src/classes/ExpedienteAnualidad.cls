VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "ExpedienteAnualidad"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
Option Compare Database
Option Explicit


Public IDAnualidad As String
Public IDExpediente As String
Public AÑO As String
Public BIIVA As String
Public BIIPSI As String
Public BIIGIC As String
Public BIEXENTA As String
Public IVA As String
Public IPSI As String
Public IGIC As String
Public PeriodoFacturacion As String

Private m_sIDAnualidadCalculada As String
Private m_sPresupuesto As String
Private m_objColCampos As Collection
Public Error As String
Private m_Error As String

Public Property Get IDAnualidadCalculada() As String
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    m_sIDAnualidadCalculada = DameID("TbExpedientesAnualidades", "IDAnualidad", getdb(), m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    IDAnualidadCalculada = m_sIDAnualidadCalculada
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método ExpedienteAnualidad.IDAnualidadCalculada ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Get Presupuesto() As String
   
        
    Dim m_BIIVA As String
    Dim m_BIIPSI As String
    Dim m_BIIGIC As String
    Dim m_BIEXENTA As String
    
    On Error GoTo errores

    Me.Error = ""
    m_Error = ""
    If IsNumeric(m_sPresupuesto) Then
        Presupuesto = m_sPresupuesto
        Exit Property
    End If
    m_BIIVA = Me.BIIVA
    m_BIIPSI = Me.BIIPSI
    m_BIIGIC = Me.BIIGIC
    m_BIEXENTA = Me.BIEXENTA
    
    If Not IsNumeric(m_BIIVA) Then m_BIIVA = "0"
    If Not IsNumeric(m_BIIPSI) Then m_BIIPSI = "0"
    If Not IsNumeric(m_BIIGIC) Then m_BIIGIC = "0"
    If Not IsNumeric(m_BIEXENTA) Then m_BIEXENTA = "0"
    
    m_sPresupuesto = CStr(CDbl(m_BIIVA) + CDbl(m_BIIPSI) + CDbl(m_BIIGIC) + CDbl(m_BIEXENTA))
    Presupuesto = m_sPresupuesto
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método ExpedienteAnualidad.Presupuesto ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
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
        .Add "IDAnualidad"
        .Add "IDExpediente"
        .Add "Año"
        .Add "BIIVA"
        .Add "BIIPSI"
        .Add "BIIGIC"
        .Add "BIEXENTA"
        .Add "IVA"
        .Add "IPSI"
        .Add "IGIC"
        .Add "PeriodoFacturacion"
    End With
    Set ColCampos = m_objColCampos
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método ExpedienteAnualidad.ColCampos ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property


Public Function getPropiedad(m_NombrePropiedad As Variant, Optional ByRef p_Error As String) As Variant

    On Error GoTo errores

    Me.Error = ""
    If m_NombrePropiedad = "IDAnualidad" Then
        getPropiedad = Me.IDAnualidad
        Exit Function
    End If
    If m_NombrePropiedad = "IDExpediente" Then
        getPropiedad = Me.IDExpediente
        Exit Function
    End If
    If m_NombrePropiedad = "Año" Then
        getPropiedad = Me.AÑO
        Exit Function
    End If
    If m_NombrePropiedad = "BIIVA" Then
        getPropiedad = Me.BIIVA
        Exit Function
    End If
    If m_NombrePropiedad = "BIIPSI" Then
        getPropiedad = Me.BIIPSI
        Exit Function
    End If
    If m_NombrePropiedad = "BIIGIC" Then
        getPropiedad = Me.BIIGIC
        Exit Function
    End If
    If m_NombrePropiedad = "BIEXENTA" Then
        getPropiedad = Me.BIEXENTA
        Exit Function
    End If
    If m_NombrePropiedad = "IVA" Then
        getPropiedad = Me.IVA
        Exit Function
    End If
    If m_NombrePropiedad = "IPSI" Then
        getPropiedad = Me.IPSI
        Exit Function
    End If
    If m_NombrePropiedad = "IGIC" Then
        getPropiedad = Me.IGIC
        Exit Function
    End If
    If m_NombrePropiedad = "PeriodoFacturacion" Then
        getPropiedad = Me.PeriodoFacturacion
        Exit Function
    End If
    p_Error = "Propiedad no reconocida en ExpedienteAnualidad.getPropiedad"
    Err.Raise 1000
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método ExpedienteAnualidad.getPropiedad ha devuelto el error:" & vbNewLine & Err.Description
    End If
End Function


Public Function SetPropiedad(m_NombrePropiedad As Variant, m_ValorPropiedad As Variant, Optional ByRef p_Error As String) As String
    On Error GoTo errores

    Me.Error = ""
    p_Error = ""
    If m_NombrePropiedad = "IDAnualidad" Then
        Me.IDAnualidad = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "IDExpediente" Then
        Me.IDExpediente = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "Año" Then
        Me.AÑO = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "BIIVA" Then
        Me.BIIVA = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "BIIPSI" Then
        Me.BIIPSI = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "BIIGIC" Then
        Me.BIIGIC = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "BIEXENTA" Then
        Me.BIEXENTA = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "IVA" Then
        Me.IVA = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "IPSI" Then
        Me.IPSI = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "IGIC" Then
        Me.IGIC = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "PeriodoFacturacion" Then
        Me.PeriodoFacturacion = m_ValorPropiedad
        Exit Function
    End If
    p_Error = "Propiedad no reconocida en ExpedienteAnualidad.SetPropiedad"
    Err.Raise 1000
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método ExpedienteAnualidad.SetPropiedad ha devuelto el error:" & vbNewLine & Err.Description
    End If
End Function

