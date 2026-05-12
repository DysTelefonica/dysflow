Attribute VB_Name = "Módulo1"
Option Compare Database
Option Explicit

Sub LimpiarDuplicadosNCARAvisos()
    Dim db As DAO.Database
    Dim rs As DAO.Recordset
    Dim rsDel As DAO.Recordset
    Dim strSQL As String
    Dim idar As Long
    Dim i As Integer
    Dim fieldNames As Variant
    Dim fieldName As Variant
    Dim recordsDeleted As Long
    
    Set db = CurrentDb
    ' Los tres campos que deben ser únicos por IDAR
    fieldNames = Array("IDCorreo15", "IDCorreo7", "IDCorreo0")
    recordsDeleted = 0
    
    Debug.Print "Iniciando limpieza..."
    
    ' Iterar sobre cada tipo de columna de correo
    For Each fieldName In fieldNames
        ' Seleccionar IDARs que tienen más de un registro para este tipo de correo
        strSQL = "SELECT IDAR, Count(" & fieldName & ") as Cnt " & _
                 "FROM TbNCARAvisos " & _
                 "WHERE " & fieldName & " Is Not Null " & _
                 "GROUP BY IDAR " & _
                 "HAVING Count(" & fieldName & ") > 1;"
        
        Set rs = db.OpenRecordset(strSQL)
        
        Do While Not rs.EOF
            idar = rs!idar
            
            ' Obtener todos los registros de este IDAR y tipo, ordenados por ID descendente
            ' Esto asume que queremos CONSERVAR el último (el más reciente).
            ' Si prefieres conservar el primero, cambia "ORDER BY ID DESC" a "ORDER BY ID ASC"
            Dim sqlDetails As String
            sqlDetails = "SELECT ID FROM TbNCARAvisos WHERE IDAR=" & idar & _
                         " AND " & fieldName & " Is Not Null ORDER BY ID DESC"
            
            Set rsDel = db.OpenRecordset(sqlDetails)
            
            If Not rsDel.EOF Then
                ' El primer registro es el que conservamos (el más reciente)
                rsDel.MoveNext
                
                ' El resto los borramos
                Do While Not rsDel.EOF
                    db.Execute "DELETE * FROM TbNCARAvisos WHERE ID = " & rsDel!ID
                    recordsDeleted = recordsDeleted + 1
                    rsDel.MoveNext
                Loop
            End If
            rsDel.Close
            
            rs.MoveNext
        Loop
        rs.Close
    Next fieldName
    
    MsgBox "Proceso finalizado. Se eliminaron " & recordsDeleted & " registros duplicados.", vbInformation
End Sub

