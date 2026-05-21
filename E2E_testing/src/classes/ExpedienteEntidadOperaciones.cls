VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "ExpedienteEntidadOperaciones"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
Option Compare Database
Option Explicit

Public Expediente As Expediente

Private Const TEST_ONLY_CACHE_REFRESH_FAILURE As String = "TEST_ONLY_CACHE_REFRESH_FAILURE"
Private m_TestOnlyForceCacheRefreshFailure As Boolean

Public Sub TestOnlyForceCacheRefreshFailure(ByVal p_Enabled As Boolean)
    m_TestOnlyForceCacheRefreshFailure = p_Enabled
End Sub

Public Sub TestOnlyResetCacheRefreshFailure()
    m_TestOnlyForceCacheRefreshFailure = False
End Sub

Public Function TestOnlyIsCacheRefreshFailureForced() As Boolean
    TestOnlyIsCacheRefreshFailureForced = m_TestOnlyForceCacheRefreshFailure
End Function


Public Function Registrar( _
                            Optional p_Db As DAO.Database = Nothing, _
                            Optional p_Ambito As EnumAmbitoActualizacion = Todo, _
                            Optional p_ForceCacheFailureForTest As Boolean = False, _
                            Optional ByRef p_Error As String _
                            ) As String
    
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_ExpEntidadDeExpediente As ExpedienteEntidad
    Dim m_ParaAlta As Boolean
    Dim blnActualizarNC As Boolean
    
    ' Variable para la conexión a usar
    Dim dbUse As DAO.Database
    
    On Error GoTo errores

    If p_ForceCacheFailureForTest Or m_TestOnlyForceCacheRefreshFailure Then
        p_Error = TEST_ONLY_CACHE_REFRESH_FAILURE
        Err.Raise 1000
    End If
    
    ' GESTIÓN DE TRANSACCIÓN
    If p_Db Is Nothing Then
        Set dbUse = getdb()
    Else
        Set dbUse = p_Db
    End If

    If Me.Expediente Is Nothing Then
        p_Error = "No se ha indicado el expediente"
        Err.Raise 1000
    End If
    
    ' 1. HIDRATACIÓN GRANULAR: Solo calculamos lo que vamos a guardar
    Set m_ExpEntidadDeExpediente = getExpEntidadDeExpediente( _
                                        p_Expediente:=Me.Expediente, _
                                        p_Ambito:=p_Ambito, _
                                        p_Error:=p_Error)
    If p_Error <> "" Then Err.Raise 1000
    
    ' 2. Comprobar si existe el registro
    m_SQL = "SELECT * FROM TbExpedientesConEntidades WHERE IDExpediente=" & Me.Expediente.IDExpediente & ";"
    Set rcdDatos = dbUse.OpenRecordset(m_SQL)
    
    If rcdDatos.EOF Then
        m_ParaAlta = True
        rcdDatos.AddNew
        rcdDatos.Fields("IDExpediente") = Me.Expediente.IDExpediente
        ' En alta nueva, forzamos ámbito TODO para asegurar integridad inicial
        p_Ambito = Todo
        ' Volvemos a hidratar todo si el ámbito original era parcial
        Set m_ExpEntidadDeExpediente = getExpEntidadDeExpediente(p_Expediente:=Me.Expediente, p_Ambito:=Todo, p_Error:=p_Error)
    Else
        m_ParaAlta = False
        rcdDatos.Edit
    End If
    
    With m_ExpEntidadDeExpediente
        
        ' --- BLOQUE CABECERA ---
        If p_Ambito = EnumAmbitoActualizacion.Todo Or p_Ambito = EnumAmbitoActualizacion.Cabecera Then
            rcdDatos.Fields("Clasificacion") = IIf(.Clasificacion <> "", .Clasificacion, Null)
            rcdDatos.Fields("OrganoContratacion") = IIf(.OrganoContratacion <> "", .OrganoContratacion, Null)
            rcdDatos.Fields("OficinaPrograma") = IIf(.OficinaPrograma <> "", .OficinaPrograma, Null)
            rcdDatos.Fields("Ejercito") = IIf(.Ejercito <> "", .Ejercito, Null)
            rcdDatos.Fields("ResponsableCalidad") = IIf(.responsableCalidad <> "", .responsableCalidad, Null)
            rcdDatos.Fields("ResponsableSeguridad") = IIf(.responsableSeguridad <> "", .responsableSeguridad, Null)
            rcdDatos.Fields("TipoParaLista") = IIf(.TipoParaLista <> "", .TipoParaLista, Null)
        End If
        
        ' --- BLOQUE PECAL ---
        If p_Ambito = EnumAmbitoActualizacion.Todo Or p_Ambito = EnumAmbitoActualizacion.PECAL Then
            rcdDatos.Fields("CadenaPecal") = IIf(.CadenaPecal <> "", .CadenaPecal, Null)
            rcdDatos.Fields("Pecal") = IIf(.PECAL <> "", .PECAL, Null)
        End If
        
        ' --- BLOQUE SUMINISTRADORES ---
        If p_Ambito = EnumAmbitoActualizacion.Todo Or p_Ambito = EnumAmbitoActualizacion.Suministradores Then
            ' Comprobar cambios para NCs solo si estamos tocando contratistas
            If Nz(rcdDatos.Fields("CadenaContratistas"), "") <> .CadenaContratistas Then
                blnActualizarNC = True
            End If
            
            rcdDatos.Fields("CadenaContratistas") = IIf(.CadenaContratistas <> "", .CadenaContratistas, Null)
            rcdDatos.Fields("CadenaSubContratistas") = IIf(.CadenaSubContratistas <> "", .CadenaSubContratistas, Null)
        End If
        
        ' --- BLOQUE COMERCIALES ---
        If p_Ambito = EnumAmbitoActualizacion.Todo Or p_Ambito = EnumAmbitoActualizacion.Comerciales Then
            rcdDatos.Fields("CadenaComerciales") = IIf(.CadenaComerciales <> "", .CadenaComerciales, Null)
        End If
        
        ' --- BLOQUE RESPONSABLES (JPs) ---
        If p_Ambito = EnumAmbitoActualizacion.Todo Or p_Ambito = EnumAmbitoActualizacion.Responsables Then
             ' Nota: Aquí la lógica de AGEDYS ya se aplicó en el constructor
            rcdDatos.Fields("CadenaJPs") = IIf(.CadenaJPs <> "", .CadenaJPs, Null)
        End If
        
        ' --- BLOQUE RACs ---
        If p_Ambito = EnumAmbitoActualizacion.Todo Or p_Ambito = EnumAmbitoActualizacion.RACs Then
            rcdDatos.Fields("CadenaRACs") = IIf(.CadenaRACs <> "", .CadenaRACs, Null)
            rcdDatos.Fields("CadenaCorreoRACs") = IIf(.CadenaCorreoRACs <> "", .CadenaCorreoRACs, Null)
        End If
        
        ' --- BLOQUE HITOS ---
        If p_Ambito = EnumAmbitoActualizacion.Todo Or p_Ambito = EnumAmbitoActualizacion.Hitos Then
            rcdDatos.Fields("CadenaHitos") = IIf(.CadenaHitos <> "", .CadenaHitos, Null)
        End If
        
        ' --- BLOQUE LUGARES (Si existiera en la tabla, el código original tenía CadenaLugares en la clase pero no vi el campo en el update original, lo añado por coherencia si existe en tabla) ---
        ' Verifica si tu tabla tiene CadenaLugares, si no, comenta esto.
        If p_Ambito = EnumAmbitoActualizacion.Todo Or p_Ambito = EnumAmbitoActualizacion.Lugares Then
             On Error Resume Next ' Por si el campo no existe en la tabla
             rcdDatos.Fields("CadenaLugares") = IIf(.CadenaLugares <> "", .CadenaLugares, Null)
             On Error GoTo errores
        End If
        
    End With
    
    rcdDatos.Update
    
    ' Lógica post-update específica
    If blnActualizarNC Then
        ActualizarNCsContratistas _
            p_IDExp:=Me.Expediente.IDExpediente, _
            p_Cadena:=m_ExpEntidadDeExpediente.CadenaContratistas, _
            p_Db:=dbUse, _
            p_Error:=p_Error
        If p_Error <> "" Then Err.Raise 1000
    End If
    
    rcdDatos.Close
    Set rcdDatos = Nothing
    
    ' Actualizar memoria global (Solo la cabecera del expediente, los detalles se recargan al pedir)
    ActualizarExpedienteCompleto Me.Expediente, p_Error
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método ExpedienteEntidadOperaciones.Registrar ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
    End If
End Function

Public Function Eliminar( _
                            Optional ByRef p_Error As String _
                            ) As String
    
    Dim m_SQL As String
    
    On Error GoTo errores
    If Me.Expediente Is Nothing Then
        p_Error = "No se ha indicado el expediente"
        Err.Raise 1000
    End If
    If Me.Expediente.IDExpediente = "" Then
        p_Error = "No se ha indicado el expediente"
        Err.Raise 1000
    End If
    m_SQL = "DELETE * " & _
            "FROM TbExpedientesConEntidades " & _
            "WHERE IDExpediente=" & Me.Expediente.IDExpediente & ";"
    getdb().Execute m_SQL
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método ExpedienteOperaciones.Eliminar ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
    End If
End Function


