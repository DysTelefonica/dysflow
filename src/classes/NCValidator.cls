VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "NCValidator"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
Option Compare Database
Option Explicit

Public Function ValidarAlta(ByRef p_NC As ncProyecto, Optional ByRef p_Error As String) As Boolean
    Dim m_NC As ncProyecto
    Dim blnComprobar As Boolean
    On Error GoTo errores
    p_Error = ""
    
    If p_NC Is Nothing Then
        p_Error = "NC no puede ser Nothing"
        Exit Function
    End If
    
    With p_NC
        If .ExpedienteObj Is Nothing Then
            p_Error = "No se conoce el expediente"
            Exit Function
        End If
        
        If .Descripcion = "" Then
            p_Error = "No se conoce la descipción"
            Exit Function
        End If
        
        If .DetectadoPor = "" Then
            p_Error = "No se conoce DetectadoPor"
            Exit Function
        End If
        
        If Not IsDate(.FechaApertura) Then
            p_Error = "No se conoce la fecha de apertura"
            Exit Function
        End If
        
        If .VinculadoANC = EnumSino.Sí Then
            blnComprobar = True
            If .NCProyectoAsociada Is Nothing And .IDNCAsociada <> "" Then
                Set m_NC = constructor.getNCProyecto(p_IDNC:=.IDNCAsociada, p_Error:=p_Error)
                If p_Error <> "" Then
                    Err.Raise 1000
                End If
            ElseIf Not .NCProyectoAsociada Is Nothing Then
                Set m_NC = .NCProyectoAsociada
            End If
            
            If blnComprobar And Not m_NC Is Nothing Then
                If CDate(.FechaApertura) < CDate(m_NC.FechaApertura) Then
                    p_Error = "La fecha de apertura es anterior a la de la que está vinculada"
                    Exit Function
                End If
            End If
        End If
        
        If .CausaYAnalisRaiz = "" Then
            p_Error = "No se conoce la CausaYAnalisRaiz"
            Exit Function
        End If
        
        If .IDTipo = "" Then
            p_Error = "No se conoce la tipología"
            Exit Function
        End If
        
        If .EntidadResponsable = "" Then
            p_Error = "No se conoce la Entidad Responsable"
            Exit Function
        End If
        
        If .RequiereControlEficacia <> "Sí" And .RequiereControlEficacia <> "No" Then
            p_Error = "Se ha de indicar si requiere control de eficacia"
            Exit Function
        End If
        
        If .RequiereControlEficacia = "Sí" Then
            If Not IsDate(.FechaPrevistaControlEficacia) Then
                p_Error = "Si requiere el control de eficacia se ha de indicar la fecha prevista del mismo"
                Exit Function
            End If
            If .ControlEficacia = "" Then
                p_Error = "Si requiere el control de eficacia se ha de indicar el mismo"
                Exit Function
            End If
        End If
    End With
    
    ValidarAlta = True
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "NCValidator.ValidarAlta: " & Err.Description
    End If
End Function

Public Function ValidarEdicion(ByRef p_NC As ncProyecto, Optional ByRef p_Error As String) As Boolean
    Dim m_NC As ncProyecto
    Dim blnComprobar As Boolean
    On Error GoTo errores
    p_Error = ""
    
    If p_NC Is Nothing Then
        p_Error = "NC no puede ser Nothing"
        Exit Function
    End If
    
    With p_NC
        If .ExpedienteObj Is Nothing Then
            p_Error = "No se conoce el expediente"
            Exit Function
        End If
        
        If .Descripcion = "" Then
            p_Error = "No se conoce la descipción"
            Exit Function
        End If
        
        If .DetectadoPor = "" Then
            p_Error = "No se conoce DetectadoPor"
            Exit Function
        End If
        
        If Not IsDate(.FechaApertura) Then
            p_Error = "No se conoce la fecha de apertura"
            Exit Function
        End If
        
        If IsDate(.FPREVCIERRE) Then
            If CDate(.FPREVCIERRE) < CDate(.FechaApertura) Then
                p_Error = "La fecha de apertura no puede ser mayor a la fecha prevista de cierre"
                Exit Function
            End If
        End If
        
        If .IDNCAsociada <> "" Then
            If .NCProyectoAsociada Is Nothing Then
                Set m_NC = constructor.getNCProyecto(p_IDNC:=.IDNCAsociada, p_Error:=p_Error)
                If p_Error <> "" Then
                    Err.Raise 1000
                End If
            Else
                Set m_NC = .NCProyectoAsociada
            End If
            
            If Not m_NC Is Nothing Then
                If CDate(.FechaApertura) < CDate(m_NC.FechaApertura) Then
                    p_Error = "La fecha de apertura es anterior a la de la que está vinculada"
                    Exit Function
                End If
            End If
        End If
    End With
    
    ValidarEdicion = True
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "NCValidator.ValidarEdicion: " & Err.Description
    End If
End Function

Public Function Validar(ByRef p_NC As ncProyecto, Optional ByRef p_Error As String) As Boolean
    Dim m_NC As ncProyecto
    Dim blnComprobar As Boolean
    On Error GoTo errores
    p_Error = ""
    
    If p_NC Is Nothing Then
        p_Error = "NC no puede ser Nothing"
        Exit Function
    End If
    
    With p_NC
        If .ExpedienteObj Is Nothing Then
            p_Error = "No se conoce el expediente"
            Exit Function
        End If
        
        If .RESPONSABLECALIDAD = "" Then
            p_Error = "Falta el responsable de Calidad"
            Exit Function
        End If
        
        If .Descripcion = "" Then
            p_Error = "No se conoce la descipción"
            Exit Function
        End If
        
        If .DetectadoPor = "" Then
            p_Error = "No se conoce DetectadoPor"
            Exit Function
        End If
        
        If Not IsDate(.FechaApertura) Then
            p_Error = "No se conoce la fecha de apertura"
            Exit Function
        End If
        
        If IsDate(.FPREVCIERRE) Then
            If CDate(.FPREVCIERRE) < CDate(.FechaApertura) Then
                p_Error = "La fecha de apertura no puede ser mayor a la fecha prevista de cierre"
                Exit Function
            End If
        End If
        
        If .VinculadoANC = EnumSino.Sí Then
            If .NCProyectoAsociada Is Nothing And .IDNCAsociada <> "" Then
                Set m_NC = constructor.getNCProyecto(p_IDNC:=.IDNCAsociada, p_Error:=p_Error)
                If p_Error <> "" Then
                    Err.Raise 1000
                End If
            ElseIf Not .NCProyectoAsociada Is Nothing Then
                Set m_NC = .NCProyectoAsociada
            End If
            
            If Not m_NC Is Nothing Then
                If CDate(.FechaApertura) < CDate(m_NC.FechaApertura) Then
                    p_Error = "La fecha de apertura es anterior a la de la que está vinculada"
                    Exit Function
                End If
            End If
        End If
        
        If .CausaYAnalisRaiz = "" Then
            p_Error = "No se conoce la CausaYAnalisRaiz"
            Exit Function
        End If
        
        If .IDTipo = "" Then
            p_Error = "No se conoce la tipología"
            Exit Function
        End If
        
        If .EntidadResponsable = "" Then
            p_Error = "No se conoce la Entidad Responsable"
            Exit Function
        End If
        
        If .RequiereControlEficacia <> "Sí" And .RequiereControlEficacia <> "No" Then
            p_Error = "Se ha de indicar si requiere control de eficacia"
            Exit Function
        End If
        
        If .RequiereControlEficacia = "Sí" Then
            If Not IsDate(.FechaPrevistaControlEficacia) Then
                p_Error = "Si requiere el control de eficacia se ha de indicar la fecha prevista del mismo"
                Exit Function
            End If
            If .ControlEficacia = "" Then
                p_Error = "Si requiere el control de eficacia se ha de indicar el mismo"
                Exit Function
            End If
        End If
    End With
    
    Validar = True
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "NCValidator.Validar: " & Err.Description
    End If
End Function
