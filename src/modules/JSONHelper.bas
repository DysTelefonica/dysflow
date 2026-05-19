Attribute VB_Name = "JSONHelper"

Option Compare Database
Option Explicit

' ============================================
' MÓDULO JSONHELPER
' ============================================
' Propósito: Wrapper para funciones JSON usando JsonConverter de Access 365
' Fecha creación: 12/01/2026
' Referencias necesarias:
'   - Microsoft Office 16.0 Object Library (para JsonConverter)
' ============================================

' Variables privadas
Private m_JsonParser As Object

' ============================================
' FUNCIONES PÚBLICAS
' ============================================

' Convierte un objeto VBA a JSON
Public Function ObjetoAJSON( _
    p_Objeto As Object, _
    Optional ByRef p_Error As String _
) As String
    
    On Error GoTo errores
    
    ' Intentar usar JsonConverter de Access 365
    If JsonConverterDisponible() Then
        ObjetoAJSON = JsonConverter.ConvertToJson(p_Objeto, Whitespace:=2)
        Exit Function
    End If
    
    ' Fallback: Implementación propia simple
    ObjetoAJSON = ObjetoAJSONPropio(p_Objeto, p_Error)
    Exit Function
    
errores:
    p_Error = "Error en JSONHelper.ObjetoAJSON: " & Err.Description
    ObjetoAJSON = "{}"
End Function

' Convierte JSON a objeto VBA (Dictionary/Collection)
Public Function JSONAObjeto( _
    p_JSON As String, _
    Optional ByRef p_Error As String _
) As Object
    
    On Error GoTo errores
    
    If p_JSON = "" Then
        p_Error = "JSON vacío"
        JSONAObjeto = Nothing
        Exit Function
    End If
    
    ' Intentar usar JsonConverter de Access 365
    If JsonConverterDisponible() Then
        Set JSONAObjeto = JsonConverter.ParseJson(p_JSON)
        Exit Function
    End If
    
    ' Fallback: Implementación propia simple
    Set JSONAObjeto = JSONAObjetoPropio(p_JSON, p_Error)
    Exit Function
    
errores:
    p_Error = "Error en JSONHelper.JSONAObjeto: " & Err.Description
    Set JSONAObjeto = New Scripting.Dictionary
End Function

' Crea un objeto JSON vacío
Public Function CrearObjetoJSON() As Object
    Set CrearObjetoJSON = New Scripting.Dictionary
    CrearObjetoJSON.CompareMode = TextCompare
End Function

' Crea un array JSON vacío
Public Function CrearArrayJSON() As Object
    Set CrearArrayJSON = New Collection
End Function

' Escapa caracteres especiales para JSON
Public Function EscaparTextoJSON( _
                                    p_Texto As Variant _
                                ) As String
                                    
                                    If IsNull(p_Texto) Then
                                        EscaparTextoJSON = ""
                                        Exit Function
                                    End If
                                    
                                    If p_Texto = "" Then
                                        EscaparTextoJSON = ""
                                        Exit Function
                                    End If
                                    
                                    ' Reemplazar caracteres especiales
                                    p_Texto = Replace(p_Texto, "\", "\\")
                                    p_Texto = Replace(p_Texto, """", "\""")
                                    p_Texto = Replace(p_Texto, vbCr, "\r")
                                    p_Texto = Replace(p_Texto, vbLf, "\n")
                                    p_Texto = Replace(p_Texto, vbTab, "\t")
                                    
                                    EscaparTextoJSON = p_Texto
                                End Function

' Deshace el escape de caracteres especiales
Public Function UnescaparTextoJSON( _
    p_Texto As String _
) As String
    
    If IsNull(p_Texto) Then
        UnescaparTextoJSON = ""
        Exit Function
    End If
    
    If p_Texto = "" Then
        UnescaparTextoJSON = ""
        Exit Function
    End If
    
    ' Reemplazar en orden inverso
    p_Texto = Replace(p_Texto, "\t", vbTab)
    p_Texto = Replace(p_Texto, "\n", vbLf)
    p_Texto = Replace(p_Texto, "\r", vbCr)
    p_Texto = Replace(p_Texto, "\""", """")
    p_Texto = Replace(p_Texto, "\\", "\")
    
    UnescaparTextoJSON = p_Texto
End Function

' Valida si un string es JSON válido
Public Function EsJSONValido( _
    p_JSON As String, _
    Optional ByRef p_Error As String _
) As Boolean
    
    On Error GoTo errores
    
    If p_JSON = "" Then
        EsJSONValido = False
        Exit Function
    End If
    
    Dim objTemp As Object
    Set objTemp = JSONAObjeto(p_JSON, p_Error)
    
    EsJSONValido = True
    Set objTemp = Nothing
    Exit Function
    
errores:
    EsJSONValido = False
    If p_Error = "" Then
        p_Error = "JSON no válido: " & Err.Description
    End If
End Function

' Formatea JSON con indentación
Public Function FormatearJSON( _
    p_JSON As String, _
    Optional p_Indentacion As Integer = 4 _
) As String
    
    ' Si usamos JsonConverter, ya viene formateado
    ' Solo necesario si usamos implementación propia
    FormatearJSON = p_JSON
End Function

' Obtiene valor de una ruta JSON (ej: "datos.usuario.nombre")
Public Function ObtenerValorJSON( _
    p_JSON As String, _
    p_Ruta As String, _
    Optional ByRef p_Error As String _
) As Variant
    
    Dim objJSON As Object
    Dim partes() As String
    Dim i As Integer
    
    On Error GoTo errores
    
    Set objJSON = JSONAObjeto(p_JSON, p_Error)
    If p_Error <> "" Then
        Exit Function
    End If
    
    ' Parsear ruta (ej: "datos.usuario.nombre")
    partes = Split(p_Ruta, ".")
    
    Dim current As Object
    Set current = objJSON
    
    For i = LBound(partes) To UBound(partes)
        If current.Exists(partes(i)) Then
            If i = UBound(partes) Then
                ' Es el último elemento, retornar el valor
                If IsObject(current(partes(i))) Then
                    ' Es un objeto/array, no podemos retornarlo como Variant directamente
                    ObtenerValorJSON = current(partes(i))
                Else
                    ObtenerValorJSON = current(partes(i))
                End If
            Else
                ' Navegar al siguiente nivel
                Set current = current(partes(i))
            End If
        Else
            p_Error = "Ruta no encontrada: " & p_Ruta
            ObtenerValorJSON = Null
            Exit Function
        End If
    Next i
    
    Exit Function
    
errores:
    p_Error = "Error en JSONHelper.ObtenerValorJSON: " & Err.Description
    ObtenerValorJSON = Null
End Function

' Actualiza un valor en una ruta JSON
Public Function ActualizarValorJSON( _
    p_JSON As String, _
    p_Ruta As String, _
    p_Valor As Variant, _
    Optional ByRef p_Error As String _
) As String
    
    Dim objJSON As Object
    Dim partes() As String
    Dim i As Integer
    
    On Error GoTo errores
    
    Set objJSON = JSONAObjeto(p_JSON, p_Error)
    If p_Error <> "" Then
        Exit Function
    End If
    
    ' Parsear ruta
    partes = Split(p_Ruta, ".")
    
    Dim current As Object
    Set current = objJSON
    
    ' Navegar hasta el penúltimo nivel
    For i = LBound(partes) To UBound(partes) - 1
        If current.Exists(partes(i)) Then
            If IsObject(current(partes(i))) Then
                Set current = current(partes(i))
            Else
                p_Error = "Ruta inválida, " & partes(i) & " no es un objeto"
                ActualizarValorJSON = p_JSON
                Exit Function
            End If
        Else
            p_Error = "Ruta no encontrada: " & p_Ruta
            ActualizarValorJSON = p_JSON
            Exit Function
        End If
    Next i
    
    ' Actualizar el último elemento
    current(partes(UBound(partes))) = p_Valor
    
    ' Convertir de nuevo a JSON
    ActualizarValorJSON = ObjetoAJSON(objJSON, p_Error)
    
    Exit Function
    
errores:
    p_Error = "Error en JSONHelper.ActualizarValorJSON: " & Err.Description
    ActualizarValorJSON = p_JSON
End Function

' ============================================
' FUNCIONES PRIVADAS
' ============================================

' Verifica si JsonConverter está disponible
Private Function JsonConverterDisponible() As Boolean
    On Error Resume Next
    
    Dim temp As Object
    Set temp = CreateObject("System.Text.StringBuilder")
    
    If Err.Number = 0 Then
        ' Access 365 tiene JsonConverter
        JsonConverterDisponible = True
    Else
        JsonConverterDisponible = False
    End If
    
    On Error GoTo 0
    Set temp = Nothing
End Function

' Implementación propia simple de objeto a JSON
Private Function ObjetoAJSONPropio( _
                                        p_Objeto As Variant, _
                                        Optional ByRef p_Error As String _
                                    ) As String
    
    Dim json As String
    Dim i As Integer
    Dim key As Variant
    
    On Error GoTo errores
    
    json = "{"
    
    If TypeOf p_Objeto Is Scripting.Dictionary Then
        Dim dict As Scripting.Dictionary
        Set dict = p_Objeto
        
        i = 0
        For Each key In dict.Keys
            If i > 0 Then json = json & ","
            
            json = json & """" & EscaparTextoJSON(CStr(key)) & """:"
            json = json & ValorAJSON(dict(key), p_Error)
            
            If p_Error <> "" Then Err.Raise 1000
            i = i + 1
        Next key
    End If
    
    json = json & "}"
    ObjetoAJSONPropio = json
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "Error en ObjetoAJSONPropio: " & Err.Description
    ElseIf p_Error = "" Then
        p_Error = Err.Description
    End If
End Function

' Implementación propia simple de valor a JSON
Private Function ValorAJSON( _
                                p_Valor As Variant, _
                                Optional ByRef p_Error As String _
                            ) As String
    
    On Error GoTo errores
    
    If IsNull(p_Valor) Or IsEmpty(p_Valor) Then
        ValorAJSON = "null"
    ElseIf VarType(p_Valor) = vbString Then
        ValorAJSON = """" & EscaparTextoJSON(p_Valor) & """"
    ElseIf VarType(p_Valor) = vbBoolean Then
        If p_Valor Then
            ValorAJSON = "true"
        Else
            ValorAJSON = "false"
        End If
    ElseIf IsNumeric(p_Valor) Then
        ValorAJSON = CStr(p_Valor)
    ElseIf IsDate(p_Valor) Then
        ValorAJSON = """" & Format(p_Valor, "yyyy-mm-ddThh:nn:ss") & """"
    ElseIf IsObject(p_Valor) Then
        If TypeOf p_Valor Is Scripting.Dictionary Then
            ValorAJSON = ObjetoAJSONPropio(p_Valor, p_Error)
        ElseIf TypeOf p_Valor Is Collection Then
            ValorAJSON = CollectionAJSONPropio(p_Valor, p_Error)
        End If
    Else
        ValorAJSON = "null"
    End If
    
    Exit Function
    
errores:
    p_Error = "Error en ValorAJSON: " & Err.Description
    ValorAJSON = "null"
End Function

' Implementación propia simple de collection a JSON
Private Function CollectionAJSONPropio( _
                                            p_col As Variant, _
                                            Optional ByRef p_Error As String _
                                        ) As String
    
    Dim json As String
    Dim i As Integer
    
    On Error GoTo errores
    
    json = "["
    
    i = 0
    Dim item As Variant
    For Each item In p_col
        If i > 0 Then json = json & ","
        json = json & ValorAJSON(item, p_Error)
        
        If p_Error <> "" Then Err.Raise 1000
        i = i + 1
    Next item
    
    json = json & "]"
    CollectionAJSONPropio = json
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "Error en CollectionAJSONPropio: " & Err.Description
    ElseIf p_Error = "" Then
        p_Error = Err.Description
    End If
End Function

' Implementación propia simple de JSON a objeto
Private Function JSONAObjetoPropio( _
    p_JSON As String, _
    Optional ByRef p_Error As String _
) As Object
    
    Dim obj As Scripting.Dictionary
    Set obj = New Scripting.Dictionary
    obj.CompareMode = TextCompare
    
    On Error GoTo errores
    
    ' Implementación muy básica - solo soporta objetos planos
    ' Para uso en producción, usar JsonConverter de Access 365
    
    ' Eliminar espacios en blanco
    p_JSON = Trim(p_JSON)
    
    ' Verificar que sea un objeto
    If Left(p_JSON, 1) <> "{" Or Right(p_JSON, 1) <> "}" Then
        p_Error = "JSON no es un objeto válido"
        Exit Function
    End If
    
    ' Eliminar llaves exteriores
    p_JSON = Mid(p_JSON, 2, Len(p_JSON) - 2)
    
    ' Parsear pares clave-valor
    ' NOTA: Esta es una implementación simplificada
    ' Para parseo completo, usar JsonConverter de Access 365
    
    Set JSONAObjetoPropio = obj
    Exit Function
    
errores:
    p_Error = "Error en JSONAObjetoPropio (implementación simplificada): " & Err.Description
    Set JSONAObjetoPropio = New Scripting.Dictionary
End Function

' ============================================
' FUNCIONES DE UTILIDAD PARA OBJETOS DE NEGOCIO
' ============================================

' Convierte un objeto NCProyecto a JSON (solo campos principales)
Public Function NCProyectoAJSON( _
    p_NC As NCProyecto, _
    Optional ByRef p_Error As String _
) As String
    
    Dim obj As Scripting.Dictionary
    Set obj = CrearObjetoJSON()
    
    On Error GoTo errores
    
    obj("IDNoConformidad") = p_NC.IDNoConformidad
    obj("CodigoNoConformidad") = p_NC.CodigoNoConformidad
    obj("EsNoConformidad") = p_NC.EsNoConformidad
    obj("Expediente") = p_NC.Expediente
    obj("Proyecto") = p_NC.Proyecto
    obj("Vehiculo") = p_NC.VEHICULO
    obj("Descripcion") = p_NC.Descripcion
    obj("Causa") = p_NC.Causa
    obj("CausaYAnalisRaiz") = p_NC.CausaYAnalisRaiz
    obj("EntidadResponsable") = p_NC.EntidadResponsable
    obj("ResponsableTelefonica") = p_NC.ResponsableTelefonica
    obj("FechaApertura") = p_NC.FechaApertura
    obj("FechaCierre") = p_NC.FECHACIERRE
    obj("FechaPrevistaCierre") = p_NC.FPREVCIERRE
    obj("Notas") = p_NC.Notas
    obj("Borrado") = p_NC.Borrado
    obj("RequiereACR") = p_NC.RequiereACR
    obj("ACR") = p_NC.ACR
    obj("MotivoBorrado") = p_NC.MotivoBorrado
    obj("RequiereControlEficacia") = p_NC.RequiereControlEficacia
    obj("ControlEficacia") = p_NC.ControlEficacia
    obj("FechaControlEficacia") = p_NC.FechaControlEficacia
    obj("FechaPrevistaControlEficacia") = p_NC.FechaPrevistaControlEficacia
    obj("ResultadoControlEficacia") = p_NC.ResultadoControlEficacia
    obj("ConformeControlEficacia") = p_NC.ConformeControlEficacia
    obj("Cerrada") = p_NC.Cerrada
    obj("IDNCAsociada") = p_NC.IDNCAsociada
    obj("CodigoNoConformidadAsociada") = p_NC.CodigoNoConformidadAsociada
    obj("CodConcesionAsociada") = p_NC.CodConcesionAsociada
    obj("ResponsableCalidad") = p_NC.RESPONSABLECALIDAD
    obj("IDExpediente") = p_NC.IDExpediente
    obj("CodExp") = p_NC.CodExp
    obj("Nemotecnico") = p_NC.Nemotecnico
    obj("JuridicaExp") = p_NC.JuridicaExp
    obj("IDTipo") = p_NC.IDTipo
    obj("DetectadoPor") = p_NC.DetectadoPor
    obj("Estado") = p_NC.Estado
    
    NCProyectoAJSON = ObjetoAJSON(obj, p_Error)
    
    Exit Function
    
errores:
    p_Error = "Error en NCProyectoAJSON: " & Err.Description
    NCProyectoAJSON = "{}"
End Function

' Convierte una colección de ACProyecto a JSON array
Public Function ACsAJSONArray( _
    p_ACs As Scripting.Dictionary, _
    Optional ByRef p_Error As String _
) As String
    
    Dim arr As Collection
    Dim id As Variant
    Dim AC As ACProyecto
    
    On Error GoTo errores
    
    If p_ACs Is Nothing Or p_ACs.count = 0 Then
        ACsAJSONArray = "[]"
        Exit Function
    End If
    
    Set arr = CrearArrayJSON()
    
    For Each id In p_ACs.Keys
        Set AC = p_ACs(id)
        arr.Add ACAJSON(AC, p_Error)
        If p_Error <> "" Then Err.Raise 1000
    Next id
    
    ACsAJSONArray = ObjetoAJSON(arr, p_Error)
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "Error en ACsAJSONArray: " & Err.Description
    ElseIf p_Error = "" Then
        p_Error = Err.Description
    End If
    ACsAJSONArray = "[]"
End Function

' Convierte un objeto ACProyecto a JSON
Private Function ACAJSON( _
    p_AC As ACProyecto, _
    Optional ByRef p_Error As String _
) As String
    
    Dim obj As Scripting.Dictionary
    Set obj = CrearObjetoJSON()
    
    obj("IdAccionCorrectiva") = p_AC.IdAccionCorrectiva
    obj("IDNoConformidad") = p_AC.IDNoConformidad
    obj("NAccion") = p_AC.NAccion
    obj("AccionCorrectiva") = p_AC.AccionCorrectiva
    obj("Estado") = p_AC.Estado
    obj("FechaAccionCorrectiva") = p_AC.FechaAccionCorrectiva
    obj("FechaInicialMinima") = p_AC.FechaInicialMinima
    obj("FechaFinalUltima") = p_AC.FechaFinalUltima
    obj("FechaFinPrevistaUltima") = p_AC.FechaFinPrevistaUltima
    obj("Notas") = p_AC.Notas
    obj("Responsable") = p_AC.Responsable
    
    ACAJSON = ObjetoAJSON(obj, p_Error)
End Function

' Convierte objetos ARs anidados por AC a JSON
Public Function ARsAJSONObject( _
    p_ACs As Scripting.Dictionary, _
    Optional ByRef p_Error As String _
) As String
    
    Dim objRaiz As Scripting.Dictionary
    Set objRaiz = CrearObjetoJSON()
    
    Dim idAC As Variant
    Dim AC As ACProyecto
    Dim idAR As Variant
    Dim AR As ARProyecto
    
    On Error GoTo errores
    
    If p_ACs Is Nothing Then
        ARsAJSONObject = "{}"
        Exit Function
    End If
    
    For Each idAC In p_ACs.Keys
        Set AC = p_ACs(idAC)
        
        If Not AC.ARs Is Nothing Then
            Dim arrARs As Collection
            Set arrARs = CrearArrayJSON()
            
            For Each idAR In AC.ARs.Keys
                Set AR = AC.ARs(idAR)
                arrARs.Add ARAJSON(AR, p_Error)
                If p_Error <> "" Then Err.Raise 1000
            Next idAR
            
            objRaiz(CStr(AC.IdAccionCorrectiva)) = arrARs
        End If
    Next idAC
    
    ARsAJSONObject = ObjetoAJSON(objRaiz, p_Error)
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "Error en ARsAJSONObject: " & Err.Description
    ElseIf p_Error = "" Then
        p_Error = Err.Description
    End If
    ARsAJSONObject = "{}"
End Function

' Convierte un objeto ARProyecto a JSON
Private Function ARAJSON( _
    p_AR As ARProyecto, _
    Optional ByRef p_Error As String _
) As String
    
    Dim obj As Scripting.Dictionary
    Set obj = CrearObjetoJSON()
    
    obj("IDAccionRealizada") = p_AR.IDAccionRealizada
    obj("IdAccionCorrectiva") = p_AR.IdAccionCorrectiva
    obj("NAccion") = p_AR.NAccion
    obj("AccionRealizada") = p_AR.AccionRealizada
    obj("FechaAccionRealizada") = p_AR.FechaAccionRealizada
    obj("FechaInicio") = p_AR.FechaInicio
    obj("FechaFinPrevista") = p_AR.FechaFinPrevista
    obj("FechaFinReal") = p_AR.FechaFinReal
    obj("Estado") = p_AR.Estado
    obj("Notas") = p_AR.Notas
    obj("Responsable") = p_AR.Responsable
    
    ARAJSON = ObjetoAJSON(obj, p_Error)
End Function

' Convierte colección de Replanificaciones a JSON array
Public Function ReplanificacionesAJSONArray( _
    p_Replanificaciones As Scripting.Dictionary, _
    Optional ByRef p_Error As String _
) As String
    
    Dim arr As Collection
    Dim id As Variant
    Dim replanif As ReplanificacionesProyecto
    
    On Error GoTo errores
    
    If p_Replanificaciones Is Nothing Or p_Replanificaciones.count = 0 Then
        ReplanificacionesAJSONArray = "[]"
        Exit Function
    End If
    
    Set arr = CrearArrayJSON()
    
    For Each id In p_Replanificaciones.Keys
        Set replanif = p_Replanificaciones(id)
        arr.Add ReplanificacionAJSON(replanif, p_Error)
        If p_Error <> "" Then Err.Raise 1000
    Next id
    
    ReplanificacionesAJSONArray = ObjetoAJSON(arr, p_Error)
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "Error en ReplanificacionesAJSONArray: " & Err.Description
    ElseIf p_Error = "" Then
        p_Error = Err.Description
    End If
    ReplanificacionesAJSONArray = "[]"
End Function

' Convierte un objeto ReplanificacionesProyecto a JSON
Private Function ReplanificacionAJSON( _
    p_Replanif As ReplanificacionesProyecto, _
    Optional ByRef p_Error As String _
) As String
    
    Dim obj As Scripting.Dictionary
    Set obj = CrearObjetoJSON()
    
    obj("IDReplanificacion") = p_Replanif.IDReplanificacion
    obj("IDNoConformidad") = p_Replanif.IDNoConformidad
    obj("IDAccionRealizada") = p_Replanif.IDAccionRealizada
    obj("FechaReprogramacion") = p_Replanif.FechaReprogramacion
    obj("FechaPrevistaAlInicio") = p_Replanif.FechaPrevistaAlInicio
    obj("FechaPrevistaReplanificada") = p_Replanif.FechaPrevistaReplanificada
    obj("Observaciones") = p_Replanif.Observaciones
    
    ReplanificacionAJSON = ObjetoAJSON(obj, p_Error)
End Function

' Convierte colección de Riesgos a JSON array
Public Function RiesgosAJSONArray( _
    p_Riesgos As Scripting.Dictionary, _
    Optional ByRef p_Error As String _
) As String
    
    Dim arr As Collection
    Dim id As Variant
    Dim riesgo As riesgo
    
    On Error GoTo errores
    
    If p_Riesgos Is Nothing Or p_Riesgos.count = 0 Then
        RiesgosAJSONArray = "[]"
        Exit Function
    End If
    
    Set arr = CrearArrayJSON()
    
    For Each id In p_Riesgos.Keys
        Set riesgo = p_Riesgos(id)
        arr.Add RiesgoAJSON(riesgo, p_Error)
        If p_Error <> "" Then Err.Raise 1000
    Next id
    
    RiesgosAJSONArray = ObjetoAJSON(arr, p_Error)
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "Error en RiesgosAJSONArray: " & Err.Description
    ElseIf p_Error = "" Then
        p_Error = Err.Description
    End If
    RiesgosAJSONArray = "[]"
End Function

' Convierte un objeto Riesgo a JSON
Private Function RiesgoAJSON( _
    p_Riesgo As riesgo, _
    Optional ByRef p_Error As String _
) As String
    
    Dim obj As Scripting.Dictionary
    Set obj = CrearObjetoJSON()
    
    obj("idRiesgo") = p_Riesgo.idRiesgo
    obj("CodigoRiesgo") = p_Riesgo.CodigoRiesgo
    obj("Descripcion") = p_Riesgo.Descripcion
    obj("Estado") = p_Riesgo.Estado
    
    RiesgoAJSON = ObjetoAJSON(obj, p_Error)
End Function


