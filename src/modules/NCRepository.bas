Option Compare Database
Option Explicit

Public Function GetById(ByVal p_IDNC As String, ByRef p_Db As Dao.Database, Optional ByRef p_Error As String) As NCProyecto
    Dim rs As Dao.Recordset
    Dim SQL As String
    Dim m_NC As NCProyecto
    
    On Error GoTo errores
    p_Error = ""
    
    If p_IDNC = "" Then
        Set GetById = Nothing
        Exit Function
    End If
    
    SQL = "SELECT * FROM TbNoConformidades WHERE IDNoConformidad = " & p_IDNC & ";"
    Set rs = p_Db.OpenRecordset(SQL)
    
    If rs.EOF Then
        rs.Close
        Set GetById = Nothing
        Exit Function
    End If
    
    Set m_NC = New NCProyecto
    
    With m_NC
        .IDNoConformidad = Nz(rs!IDNoConformidad, "")
        .Juridica = Nz(rs!Juridica, "")
        .CodigoNoConformidad = Nz(rs!CodigoNoConformidad, "")
        .EsNoConformidad = Nz(rs!EsNoConformidad, False)
        .Expediente = Nz(rs!Expediente, "")
        .Proyecto = Nz(rs!Proyecto, "")
        .VEHICULO = Nz(rs!VEHICULO, "")
        .Descripcion = Nz(rs!Descripcion, "")
        .Causa = Nz(rs!Causa, "")
        .CausaYAnalisRaiz = Nz(rs!CausaYAnalisRaiz, "")
        .EntidadResponsable = Nz(rs!EntidadResponsable, "")
        .ResponsableTelefonica = Nz(rs!ResponsableTelefonica, "")
        .FechaApertura = Nz(rs!FechaApertura, "")
        .FECHACIERRE = Nz(rs!FECHACIERRE, "")
        .FPREVCIERRE = Nz(rs!FPREVCIERRE, "")
        .Notas = Nz(rs!Notas, "")
        .Borrado = Nz(rs!Borrado, False)
        .RequiereACR = Nz(rs!RequiereACR, False)
        .ACR = Nz(rs!ACR, "")
        .MotivoBorrado = Nz(rs!MotivoBorrado, "")
        .RequiereControlEficacia = Nz(rs!RequiereControlEficacia, "")
        .ControlEficacia = Nz(rs!ControlEficacia, "")
        .FechaControlEficacia = Nz(rs!FechaControlEficacia, "")
        .FechaPrevistaControlEficacia = Nz(rs!FechaPrevistaControlEficacia, "")
        .ResultadoControlEficacia = Nz(rs!ResultadoControlEficacia, "")
        .ConformeControlEficacia = Nz(rs!ConformeControlEficacia, "")
        .Cerrada = Nz(rs!Cerrada, "")
        .IDNCAsociada = Nz(rs!IDNCAsociada, "")
        .CodigoNoConformidadAsociada = Nz(rs!CodigoNoConformidadAsociada, "")
        .CodConcesionAsociada = Nz(rs!CodConcesionAsociada, "")
        .RESPONSABLECALIDAD = Nz(rs!RESPONSABLECALIDAD, "")
        .IDExpediente = Nz(rs!IDExpediente, "")
        .CodExp = Nz(rs!CodExp, "")
        .Nemotecnico = Nz(rs!Nemotecnico, "")
        .JuridicaExp = Nz(rs!JuridicaExp, "")
        .IDTipo = Nz(rs!IDTipo, "")
        .IDProyecto = Nz(rs!IDProyecto, "")
        .DetectadoPor = Nz(rs!DetectadoPor, "")
        .Estado = Nz(rs!Estado, "")
    End With
    
    rs.Close
    Set GetById = m_NC
    Exit Function
    
errores:
    p_Error = "NCRepository.GetById: " & Err.Description
    Set GetById = Nothing
End Function

Public Function Insert(ByRef p_NC As NCProyecto, ByRef p_Db As Dao.Database, Optional ByRef p_Error As String) As Boolean
    Dim rs As Dao.Recordset
    Dim SQL As String
    
    On Error GoTo errores
    p_Error = ""
    Insert = False
    
    If p_NC Is Nothing Then
        p_Error = "NC no puede ser Nothing"
        Exit Function
    End If
    
    SQL = "TbNoConformidades"
    Set rs = p_Db.OpenRecordset(SQL)
    
    rs.AddNew
        rs!IDNoConformidad = p_NC.IDNoConformidad
        rs!CodigoNoConformidad = p_NC.CodigoNoConformidad
        rs!EsNoConformidad = p_NC.EsNoConformidad
        rs!IDExpediente = p_NC.IDExpediente
        
        If p_NC.Juridica <> "" Then rs!Juridica = p_NC.Juridica
        If p_NC.JuridicaExp <> "" Then rs!JuridicaExp = p_NC.JuridicaExp
        If p_NC.CodExp <> "" Then rs!CodExp = p_NC.CodExp
        If p_NC.Expediente <> "" Then rs!Expediente = p_NC.Expediente
        If p_NC.Nemotecnico <> "" Then rs!Nemotecnico = p_NC.Nemotecnico
        If p_NC.RESPONSABLECALIDAD <> "" Then rs!RESPONSABLECALIDAD = p_NC.RESPONSABLECALIDAD
        
        rs!Descripcion = p_NC.Descripcion
        rs!CausaYAnalisRaiz = p_NC.CausaYAnalisRaiz
        rs!Causa = p_NC.CausaYAnalisRaiz
        
        If p_NC.VEHICULO <> "" Then rs!VEHICULO = p_NC.VEHICULO
        If p_NC.CodConcesionAsociada <> "" Then rs!CodConcesionAsociada = p_NC.CodConcesionAsociada
        
        rs!RequiereACR = True
        rs!IDTipo = p_NC.IDTipo
        rs!EntidadResponsable = p_NC.EntidadResponsable
        rs!DetectadoPor = p_NC.DetectadoPor
        
        If p_NC.ResponsableTelefonica <> "" Then rs!ResponsableTelefonica = p_NC.ResponsableTelefonica
        
        rs!RequiereControlEficacia = p_NC.RequiereControlEficacia
        rs!FechaApertura = p_NC.FechaApertura
        rs!Estado = p_NC.Estado
        
        If p_NC.FPREVCIERRE <> "" Then rs!FPREVCIERRE = p_NC.FPREVCIERRE
        If p_NC.FECHACIERRE <> "" Then rs!FECHACIERRE = p_NC.FECHACIERRE
        If p_NC.IDNCAsociada <> "" Then rs!IDNCAsociada = p_NC.IDNCAsociada
        If p_NC.CodigoNoConformidadAsociada <> "" Then rs!CodigoNoConformidadAsociada = p_NC.CodigoNoConformidadAsociada
        
    rs.Update
    rs.Close
    
    Insert = True
    Exit Function
    
errores:
    p_Error = "NCRepository.Insert: " & Err.Description
    Insert = False
End Function

Public Function Update(ByRef p_NC As NCProyecto, ByRef p_Db As Dao.Database, Optional ByRef p_Error As String) As Boolean
    Dim rs As Dao.Recordset
    Dim SQL As String
    
    On Error GoTo errores
    p_Error = ""
    Update = False
    
    If p_NC Is Nothing Then
        p_Error = "NC no puede ser Nothing"
        Exit Function
    End If
    
    If p_NC.IDNoConformidad = "" Then
        p_Error = "IDNoConformidad no puede estar vacío"
        Exit Function
    End If
    
    SQL = "SELECT * FROM TbNoConformidades WHERE IDNoConformidad = " & p_NC.IDNoConformidad & ";"
    Set rs = p_Db.OpenRecordset(SQL)
    
    If rs.EOF Then
        rs.Close
        p_Error = "No se encontró la NC"
        Exit Function
    End If
    
    rs.Edit
        rs!IDExpediente = p_NC.IDExpediente
        
        If p_NC.Juridica <> "" Then
            rs!Juridica = p_NC.Juridica
        Else
            rs!Juridica = Null
        End If
        
        If p_NC.JuridicaExp <> "" Then
            rs!JuridicaExp = p_NC.JuridicaExp
        Else
            rs!JuridicaExp = Null
        End If
        
        If p_NC.CodExp <> "" Then
            rs!CodExp = p_NC.CodExp
            rs!Expediente = p_NC.Expediente
        Else
            rs!CodExp = Null
            rs!Expediente = Null
        End If
        
        If p_NC.Nemotecnico <> "" Then
            rs!Nemotecnico = p_NC.Nemotecnico
        Else
            rs!Nemotecnico = Null
        End If
        
        If p_NC.RESPONSABLECALIDAD <> "" Then
            rs!RESPONSABLECALIDAD = p_NC.RESPONSABLECALIDAD
        Else
            rs!RESPONSABLECALIDAD = Null
        End If
        
        rs!Descripcion = p_NC.Descripcion
        rs!CausaYAnalisRaiz = p_NC.CausaYAnalisRaiz
        rs!Causa = p_NC.CausaYAnalisRaiz
        
        If p_NC.VEHICULO <> "" Then
            rs!VEHICULO = p_NC.VEHICULO
        Else
            rs!VEHICULO = Null
        End If
        
        rs!RequiereACR = True
        rs!IDTipo = p_NC.IDTipo
        rs!EntidadResponsable = p_NC.EntidadResponsable
        rs!DetectadoPor = p_NC.DetectadoPor
        
        If p_NC.ResponsableTelefonica <> "" Then
            rs!ResponsableTelefonica = p_NC.ResponsableTelefonica
        Else
            rs!ResponsableTelefonica = Null
        End If
        
        rs!RequiereControlEficacia = p_NC.RequiereControlEficacia
        
        If p_NC.RequiereControlEficacia <> "Sí" Then
            rs!FechaPrevistaControlEficacia = Null
            rs!ControlEficacia = Null
            rs!FechaControlEficacia = Null
            rs!ResultadoControlEficacia = Null
            rs!ConformeControlEficacia = Null
        End If
        
        rs!FechaApertura = p_NC.FechaApertura
        rs!Estado = p_NC.Estado
        
    rs.Update
    rs.Close
    
    Update = True
    Exit Function
    
errores:
    p_Error = "NCRepository.Update: " & Err.Description
    Update = False
End Function

Public Function Delete(ByVal p_IDNC As String, ByVal p_Logico As Boolean, ByRef p_Db As Dao.Database, Optional ByRef p_Error As String) As Boolean
    Dim rs As Dao.Recordset
    Dim SQL As String
    
    On Error GoTo errores
    p_Error = ""
    Delete = False
    
    If p_IDNC = "" Then
        p_Error = "IDNoConformidad no puede estar vacío"
        Exit Function
    End If
    
    If p_Logico Then
        SQL = "SELECT * FROM TbNoConformidades WHERE IDNoConformidad = " & p_IDNC & ";"
        Set rs = p_Db.OpenRecordset(SQL)
        
        If rs.EOF Then
            rs.Close
            p_Error = "No se encontró la NC"
            Exit Function
        End If
        
        rs.Edit
            rs!Borrado = True
            rs!MotivoBorrado = "Eliminado por NCService"
        rs.Update
        rs.Close
    Else
        SQL = "DELETE FROM TbNoConformidades WHERE IDNoConformidad = " & p_IDNC & ";"
        p_Db.Execute SQL
    End If
    
    Delete = True
    Exit Function
    
errores:
    p_Error = "NCRepository.Delete: " & Err.Description
    Delete = False
End Function

Public Function GetAll(ByRef p_Db As Dao.Database, Optional ByVal p_Filtro As String = "", Optional ByRef p_Error As String) As Collection
    Dim rs As Dao.Recordset
    Dim SQL As String
    Dim col As Collection
    Dim m_NC As NCProyecto
    
    On Error GoTo errores
    p_Error = ""
    
    SQL = "SELECT * FROM TbNoConformidades"
    If p_Filtro <> "" Then
        SQL = SQL & " WHERE " & p_Filtro
    End If
    SQL = SQL & ";"
    
    Set rs = p_Db.OpenRecordset(SQL)
    Set col = New Collection
    
    Do While Not rs.EOF
        Set m_NC = New NCProyecto
        
        With m_NC
            .IDNoConformidad = Nz(rs!IDNoConformidad, "")
            .Juridica = Nz(rs!Juridica, "")
            .CodigoNoConformidad = Nz(rs!CodigoNoConformidad, "")
            .EsNoConformidad = Nz(rs!EsNoConformidad, False)
            .Expediente = Nz(rs!Expediente, "")
            .Proyecto = Nz(rs!Proyecto, "")
            .VEHICULO = Nz(rs!VEHICULO, "")
            .Descripcion = Nz(rs!Descripcion, "")
            .Causa = Nz(rs!Causa, "")
            .CausaYAnalisRaiz = Nz(rs!CausaYAnalisRaiz, "")
            .EntidadResponsable = Nz(rs!EntidadResponsable, "")
            .ResponsableTelefonica = Nz(rs!ResponsableTelefonica, "")
            .FechaApertura = Nz(rs!FechaApertura, "")
            .FECHACIERRE = Nz(rs!FECHACIERRE, "")
            .FPREVCIERRE = Nz(rs!FPREVCIERRE, "")
            .Notas = Nz(rs!Notas, "")
            .Borrado = Nz(rs!Borrado, False)
            .RequiereACR = Nz(rs!RequiereACR, False)
            .ACR = Nz(rs!ACR, "")
            .MotivoBorrado = Nz(rs!MotivoBorrado, "")
            .RequiereControlEficacia = Nz(rs!RequiereControlEficacia, "")
            .ControlEficacia = Nz(rs!ControlEficacia, "")
            .FechaControlEficacia = Nz(rs!FechaControlEficacia, "")
            .FechaPrevistaControlEficacia = Nz(rs!FechaPrevistaControlEficacia, "")
            .ResultadoControlEficacia = Nz(rs!ResultadoControlEficacia, "")
            .ConformeControlEficacia = Nz(rs!ConformeControlEficacia, "")
            .Cerrada = Nz(rs!Cerrada, "")
            .IDNCAsociada = Nz(rs!IDNCAsociada, "")
            .CodigoNoConformidadAsociada = Nz(rs!CodigoNoConformidadAsociada, "")
            .CodConcesionAsociada = Nz(rs!CodConcesionAsociada, "")
            .RESPONSABLECALIDAD = Nz(rs!RESPONSABLECALIDAD, "")
            .IDExpediente = Nz(rs!IDExpediente, "")
            .CodExp = Nz(rs!CodExp, "")
            .Nemotecnico = Nz(rs!Nemotecnico, "")
            .JuridicaExp = Nz(rs!JuridicaExp, "")
            .IDTipo = Nz(rs!IDTipo, "")
            .IDProyecto = Nz(rs!IDProyecto, "")
            .DetectadoPor = Nz(rs!DetectadoPor, "")
            .Estado = Nz(rs!Estado, "")
        End With
        
        col.Add m_NC
        rs.MoveNext
    Loop
    
    rs.Close
    Set GetAll = col
    Exit Function
    
errores:
    p_Error = "NCRepository.GetAll: " & Err.Description
    Set GetAll = New Collection
End Function
