# Estructura de Datos: NoConformidades_Datos.accdb

## Tabla: Copia de TbNCARAvisos
| Campo | Tipo | Longitud |
| :--- | :--- | :--- |
| ID | 4 | 4 |
| IDAR | 4 | 4 |
| IDCorreo15 | 4 | 4 |
| IDCorreo7 | 4 | 4 |
| IDCorreo0 | 4 | 4 |
| Fecha | 8 | 8 |

## Tabla: TbAnexos
| Campo | Tipo | Longitud |
| :--- | :--- | :--- |
| IDAnexo | 4 | 4 |
| IDNoConformidad | 4 | 4 |
| TituloAnexo | 10 | 255 |
| DescripcionAnexo | 12 | 0 |
| URLInicial | 10 | 255 |
| NombreArchivoFinalAnexo | 10 | 255 |
| FechaAnexo | 8 | 8 |

## Tabla: TbAnexosAuditoria
| Campo | Tipo | Longitud |
| :--- | :--- | :--- |
| IDAnexo | 4 | 4 |
| IDAuditoria | 4 | 4 |
| URLInicial | 10 | 255 |
| NombreArchivo | 10 | 255 |
| FechaAnexo | 8 | 8 |

## Tabla: TbAnexosNCAuditorias
| Campo | Tipo | Longitud |
| :--- | :--- | :--- |
| IDAnexo | 4 | 4 |
| IDNoConformidad | 4 | 4 |
| URLInicial | 10 | 255 |
| NombreArchivo | 10 | 255 |
| FechaAnexo | 8 | 8 |

## Tabla: TbAuditoriaLog
| Campo | Tipo | Longitud |
| :--- | :--- | :--- |
| IDLog | 4 | 4 |
| IDNC | 4 | 4 |
| IDAC | 4 | 4 |
| IDAR | 4 | 4 |
| Usuario | 10 | 255 |
| Fecha | 8 | 8 |
| Titulo | 12 | 0 |
| Linea | 12 | 0 |

## Tabla: TbAuditorias
| Campo | Tipo | Longitud |
| :--- | :--- | :--- |
| IDAuditoria | 4 | 4 |
| Tipo | 10 | 255 |
| FechaInicio | 8 | 8 |
| FechaFin | 8 | 8 |

## Tabla: TbAuxPuntoNorma
| Campo | Tipo | Longitud |
| :--- | :--- | :--- |
| PuntoNorma | 10 | 255 |

## Tabla: TbCacheNCProyecto
| Campo | Tipo | Longitud |
| :--- | :--- | :--- |
| IDNoConformidad | 4 | 4 |
| IDCache | 4 | 4 |
| Version | 3 | 2 |
| FechaCache | 8 | 8 |
| DatosNC | 12 | 0 |
| DatosACs | 12 | 0 |
| DatosARs | 12 | 0 |
| DatosReplanificaciones | 12 | 0 |
| DatosRiesgos | 12 | 0 |
| UsuarioCache | 10 | 50 |
| CacheValida | 1 | 1 |

## Tabla: TbConexiones
| Campo | Tipo | Longitud |
| :--- | :--- | :--- |
| Usuario | 10 | 255 |
| UltimaConexion | 8 | 8 |
| UltimaDesconexion | 8 | 8 |
| InstaladoFW3 | 10 | 2 |
| InstaladoFW4 | 10 | 2 |
| Exitoso | 10 | 2 |

## Tabla: TbConsultasPorFechas
| Campo | Tipo | Longitud |
| :--- | :--- | :--- |
| Descripcion | 10 | 255 |

## Tabla: TbCorreosEnviados
> (LINKED) **Tabla Vinculada**
> *Origen:* TbCorreosEnviados
> *ConexiÃ³n:* ;DATABASE=\\datoste\Aplicaciones_dys\Aplicaciones PpD\00Recursos\Tareas_datos.accdb

| Campo | Tipo | Longitud |
| :--- | :--- | :--- |

## Tabla: TbDocumentosAuditorias
| Campo | Tipo | Longitud |
| :--- | :--- | :--- |
| IDDocumento | 4 | 4 |
| IDNoConformidad | 4 | 4 |
| Documento | 10 | 255 |
| NombreAnexo | 10 | 255 |
| IDAccionRealizada | 4 | 4 |
| IDAuditoria | 4 | 4 |
| IDAuditoriaResultante | 4 | 4 |

## Tabla: TbExpedientes
> (LINKED) **Tabla Vinculada**
> *Origen:* TbExpedientes
> *ConexiÃ³n:* MS Access;PWD=***;DATABASE=\\datoste\aplicaciones_dys\Aplicaciones PpD\EXPEDIENTES\Expedientes_datos.accdb

| Campo | Tipo | Longitud |
| :--- | :--- | :--- |

## Tabla: TbExpedientesResponsables
> (LINKED) **Tabla Vinculada**
> *Origen:* TbExpedientesResponsables
> *ConexiÃ³n:* MS Access;PWD=***;DATABASE=\\datoste\aplicaciones_dys\Aplicaciones PpD\EXPEDIENTES\Expedientes_datos.accdb

| Campo | Tipo | Longitud |
| :--- | :--- | :--- |

## Tabla: TbHerramientaDocAyuda
| Campo | Tipo | Longitud |
| :--- | :--- | :--- |
| NombreFormulario | 10 | 255 |
| NombreArchivoAyuda | 10 | 255 |

## Tabla: TbLog
| Campo | Tipo | Longitud |
| :--- | :--- | :--- |
| IDLog | 4 | 4 |
| IDNC | 4 | 4 |
| IDAC | 4 | 4 |
| IDAR | 4 | 4 |
| Usuario | 10 | 255 |
| Fecha | 8 | 8 |
| Titulo | 12 | 0 |
| Linea | 12 | 0 |

## Tabla: TbLogAuditoria
| Campo | Tipo | Longitud |
| :--- | :--- | :--- |
| IDLog | 4 | 4 |
| IDNC | 4 | 4 |
| IDAC | 4 | 4 |
| IDAR | 4 | 4 |
| Usuario | 10 | 255 |
| Fecha | 8 | 8 |
| Titulo | 12 | 0 |
| Linea | 12 | 0 |

## Tabla: TbLogCache
| Campo | Tipo | Longitud |
| :--- | :--- | :--- |
| IDLog | 4 | 4 |
| IDNoConformidad | 4 | 4 |
| TipoOperacion | 10 | 50 |
| SeccionCache | 10 | 50 |
| Detalles | 12 | 0 |
| FechaOperacion | 8 | 8 |
| Usuario | 10 | 50 |
| DuracionMs | 4 | 4 |
| Exito | 1 | 1 |

## Tabla: TbNCAccionCorrectivas
| Campo | Tipo | Longitud |
| :--- | :--- | :--- |
| IDAccionCorrectiva | 4 | 4 |
| IDNoConformidad | 4 | 4 |
| NAccion | 4 | 4 |
| AccionCorrectiva | 12 | 0 |
| FechaAccionCorrectiva | 8 | 8 |
| ESTADO | 10 | 255 |
| FechaInicialMinima | 8 | 8 |
| FechaFinalUltima | 8 | 8 |
| Notas | 12 | 0 |
| Responsable | 10 | 255 |
| FechaFinPrevistaUltima | 8 | 8 |

## Tabla: TbNCAccionesRealizadas
| Campo | Tipo | Longitud |
| :--- | :--- | :--- |
| IDAccionRealizada | 4 | 4 |
| IDAccionCorrectiva | 4 | 4 |
| NAccion | 4 | 4 |
| AccionRealizada | 12 | 0 |
| FechaAccionRealizada | 8 | 8 |
| FechaInicio | 8 | 8 |
| FechaFinPrevista | 8 | 8 |
| FechaFinReal | 8 | 8 |
| ESTADO | 10 | 255 |
| Notas | 12 | 0 |
| Responsable | 10 | 255 |

## Tabla: TbNCARAvisos
| Campo | Tipo | Longitud |
| :--- | :--- | :--- |
| ID | 4 | 4 |
| IDAR | 4 | 4 |
| IDCorreo15 | 4 | 4 |
| IDCorreo7 | 4 | 4 |
| IDCorreo0 | 4 | 4 |
| Fecha | 8 | 8 |

## Tabla: TbNCAuditoriaAccionCorrectivas
| Campo | Tipo | Longitud |
| :--- | :--- | :--- |
| IDAccionCorrectiva | 4 | 4 |
| ID | 4 | 4 |
| NAccion | 4 | 4 |
| AccionCorrectiva | 12 | 0 |
| FechaAccionCorrectiva | 8 | 8 |
| ESTADO | 10 | 255 |
| FechaInicialMinima | 8 | 8 |
| FechaFinalUltima | 8 | 8 |
| Notas | 12 | 0 |
| Responsable | 10 | 255 |
| FechaFinPrevistaUltima | 8 | 8 |

## Tabla: TbNCAuditoriaAccionesRealizadas
| Campo | Tipo | Longitud |
| :--- | :--- | :--- |
| IDAccionRealizada | 4 | 4 |
| IDAccionCorrectiva | 4 | 4 |
| NAccion | 4 | 4 |
| AccionRealizada | 12 | 0 |
| FechaAccionRealizada | 8 | 8 |
| FechaInicio | 8 | 8 |
| FechaFinPrevista | 8 | 8 |
| FechaFinReal | 8 | 8 |
| ESTADO | 10 | 255 |
| Notas | 12 | 0 |
| Responsable | 10 | 255 |

## Tabla: TbNCDocumentos
| Campo | Tipo | Longitud |
| :--- | :--- | :--- |
| IDDocumento | 4 | 4 |
| IDNoConformidad | 4 | 4 |
| Documento | 10 | 255 |
| NombreAnexo | 10 | 255 |
| IDAccionRealizada | 4 | 4 |
| IDNoConformidadResultante | 4 | 4 |

## Tabla: TbNCInformacionRAC
| Campo | Tipo | Longitud |
| :--- | :--- | :--- |
| IDInformacionRAC | 4 | 4 |
| IDNoConformidad | 4 | 4 |
| Informacion | 12 | 0 |
| FechaInformacion | 8 | 8 |
| FechaCreacion | 8 | 8 |
| FechaEdicion | 8 | 8 |
| UsuarioCrea | 10 | 255 |
| UltimoUsuarioEdita | 10 | 255 |

## Tabla: TbNCInformacionRACAnexos
| Campo | Tipo | Longitud |
| :--- | :--- | :--- |
| IDAnexoInformacionRAC | 4 | 4 |
| IDInformacionRAC | 4 | 4 |
| NombreArchivo | 10 | 255 |
| FechaAnexo | 8 | 8 |

## Tabla: TbNoConformidades
| Campo | Tipo | Longitud |
| :--- | :--- | :--- |
| IDNoConformidad | 4 | 4 |
| Juridica | 10 | 255 |
| CodigoNoConformidad | 10 | 255 |
| EsNoConformidad | 1 | 1 |
| EXPEDIENTE | 10 | 255 |
| PROYECTO | 10 | 255 |
| VEHICULO | 10 | 255 |
| DESCRIPCION | 12 | 0 |
| CAUSA | 12 | 0 |
| ENTIDADRESPONSABLE | 10 | 50 |
| RESPONSABLETELEFONICA | 10 | 50 |
| FECHAAPERTURA | 8 | 8 |
| FECHACIERRE | 8 | 8 |
| FPREVCIERRE | 8 | 8 |
| TIPO | 10 | 255 |
| NOTAS | 12 | 0 |
| Borrado | 1 | 1 |
| RequiereACR | 1 | 1 |
| ACR | 12 | 0 |
| MotivoBorrado | 12 | 0 |
| RequiereControlEficacia | 10 | 255 |
| ControlEficacia | 12 | 0 |
| FechaControlEficacia | 8 | 8 |
| FechaPrevistaControlEficacia | 8 | 8 |
| ResultadoControlEficacia | 12 | 0 |
| ConformeControlEficacia | 10 | 2 |
| RESPONSABLECALIDAD | 10 | 255 |
| IDExpediente | 4 | 4 |
| CodExp | 10 | 255 |
| Nemotecnico | 10 | 255 |
| JuridicaExp | 10 | 255 |
| RESPONSABLECALIDADExp | 10 | 255 |
| CausaYAnalisRaiz | 12 | 0 |
| Tipologia | 10 | 255 |
| IDProyecto | 4 | 4 |
| CodigoRiesgo | 10 | 255 |
| DetectadoPor | 10 | 255 |
| ResponsableEjecucion | 10 | 255 |
| ESTADO | 10 | 255 |
| IDTipo | 4 | 4 |
| Cerrada | 10 | 2 |
| IDNCAsociada | 4 | 4 |
| CodigoNoConformidadAsociada | 10 | 255 |
| CodConcesionAsociada | 10 | 255 |

## Tabla: TbNoConformidades1
> (LINKED) **Tabla Vinculada**
> *Origen:* TbNoConformidades
> *ConexiÃ³n:* MS Access;PWD=***;DATABASE=C:\OneDrive\Telefonica\Aplicaciones_dys.TMETF - Aplicaciones PpD\No Conformidades\NoConformidades_Datos.accdb

| Campo | Tipo | Longitud |
| :--- | :--- | :--- |

## Tabla: TbNoConformidadesAuditoria
| Campo | Tipo | Longitud |
| :--- | :--- | :--- |
| ID | 4 | 4 |
| IDAuditoria | 4 | 4 |
| FechaApertura | 8 | 8 |
| Numero | 10 | 255 |
| DESCRIPCION | 12 | 0 |
| CAUSARAIZ | 12 | 0 |
| ACCIONCORRECTIVA | 12 | 0 |
| CORRECCION | 12 | 0 |
| FECHACIERRE | 8 | 8 |
| FPREVCIERRE | 8 | 8 |
| RESPONSABLEIMPLANTACION | 10 | 255 |
| RequiereControlEficacia | 10 | 25 |
| ControlEficacia | 12 | 0 |
| FechaControlEficacia | 8 | 8 |
| FechaPrevistaControlEficacia | 8 | 8 |
| ResultadoControlEficacia | 12 | 0 |
| ConformeControlEficacia | 10 | 2 |
| RequiereAccionCorrectiva | 10 | 2 |
| MotivoNoAccionCorrectiva | 12 | 0 |
| Tipo | 10 | 255 |
| PuntoNorma | 10 | 255 |
| ESTADO | 10 | 255 |
| Borrado | 1 | 1 |
| MotivoBorrado | 12 | 0 |
| Notas | 12 | 0 |
| Cerrada | 10 | 2 |

## Tabla: TbNoConformidadesIngresoPorLotesDetalle
| Campo | Tipo | Longitud |
| :--- | :--- | :--- |
| IDLoteExcel | 4 | 4 |
| CodigoNoConformidad | 10 | 255 |
| EsNoConformidad | 1 | 1 |
| DocumentoDeReferencia | 12 | 0 |
| EXPEDIENTE | 10 | 255 |
| PROYECTO | 10 | 255 |
| VEHICULO | 10 | 255 |
| DESCRIPCION | 12 | 0 |
| CAUSA | 12 | 0 |
| ACCIONCORRECTIVA | 12 | 0 |
| ACCIONREALIZADA | 12 | 0 |
| ENTIDADRESPONSABLE | 10 | 50 |
| RESPONSABLETELEFONICA | 10 | 50 |
| FECHAAPERTURA | 8 | 8 |
| FECHAPREVISTACIERRE | 8 | 8 |
| FECHACIERRE | 8 | 8 |
| TIPO | 10 | 255 |
| NOTAS | 12 | 0 |
| DatosDelRegistro | 12 | 0 |

## Tabla: TbNoConformidadesIngresoPorLotesPrincipal
| Campo | Tipo | Longitud |
| :--- | :--- | :--- |
| IDLoteExcel | 4 | 4 |
| FechaRegistro | 8 | 8 |
| URLCompletaOrigen | 10 | 255 |
| NombreArchivoExcel | 10 | 255 |
| FilaDatosInicial | 3 | 2 |
| Observaciones | 12 | 0 |

## Tabla: TbNoConformidadesIngresoPorLotesTemporal
| Campo | Tipo | Longitud |
| :--- | :--- | :--- |
| IDTmp | 4 | 4 |
| EsNoConformidadTmp | 12 | 0 |
| DocumentoDeReferenciaTmp | 12 | 0 |
| EXPEDIENTETmp | 12 | 0 |
| PROYECTOTmp | 12 | 0 |
| VEHICULOTmp | 12 | 0 |
| DESCRIPCIONTmp | 12 | 0 |
| CAUSATmp | 12 | 0 |
| ACCIONCORRECTIVATmp | 12 | 0 |
| ACCIONREALIZADATmp | 12 | 0 |
| ENTIDADRESPONSABLETmp | 12 | 0 |
| RESPONSABLETELEFONICATmp | 12 | 0 |
| FECHAAPERTURATmp | 12 | 0 |
| FECHAPREVISTACIERRETmp | 12 | 0 |
| FECHACIERRETmp | 12 | 0 |
| TIPOTmp | 12 | 0 |
| NOTASTmp | 12 | 0 |
| blnPasaCriterioParaGrabar | 1 | 1 |
| DatosDelRegistroTmp | 12 | 0 |
| ValidacionDatos | 12 | 0 |

## Tabla: TbReplanificacionesAuditoria
| Campo | Tipo | Longitud |
| :--- | :--- | :--- |
| IDReplanificacion | 4 | 4 |
| IDNoConformidad | 4 | 4 |
| IDAccionRealizada | 4 | 4 |
| FechaReprogramacion | 8 | 8 |
| FechaPrevistaAlInicio | 8 | 8 |
| FechaPrevistaReplanificada | 8 | 8 |
| Observaciones | 12 | 0 |

## Tabla: TbReplanificacionesProyecto
| Campo | Tipo | Longitud |
| :--- | :--- | :--- |
| IDReplanificacion | 4 | 4 |
| IDNoConformidad | 4 | 4 |
| IDAccionRealizada | 4 | 4 |
| FechaReprogramacion | 8 | 8 |
| FechaPrevistaAlInicio | 8 | 8 |
| FechaPrevistaReplanificada | 8 | 8 |
| Observaciones | 12 | 0 |

## Tabla: TbRiesgos
> (LINKED) **Tabla Vinculada**
> *Origen:* TbRiesgos
> *ConexiÃ³n:* MS Access;PWD=***;DATABASE=\\datoste\aplicaciones_dys\Aplicaciones PpD\GESTION RIESGOS\Gestion_Riesgos_Datos.accdb

| Campo | Tipo | Longitud |
| :--- | :--- | :--- |

## Tabla: TbRiesgosNC
> (LINKED) **Tabla Vinculada**
> *Origen:* TbRiesgosNC
> *ConexiÃ³n:* MS Access;PWD=***;DATABASE=\\datoste\aplicaciones_dys\Aplicaciones PpD\GESTION RIESGOS\Gestion_Riesgos_Datos.accdb

| Campo | Tipo | Longitud |
| :--- | :--- | :--- |

## Tabla: TbTareasExplicaciones
| Campo | Tipo | Longitud |
| :--- | :--- | :--- |
| NodoTarea | 10 | 255 |
| TituloTarea | 10 | 255 |
| Explicacion | 12 | 0 |

## Tabla: TbTipologia
| Campo | Tipo | Longitud |
| :--- | :--- | :--- |
| CodTipologia | 10 | 2 |
| Tipologia | 10 | 255 |

## Tabla: TbTiposNCProyectos
| Campo | Tipo | Longitud |
| :--- | :--- | :--- |
| IDTipo | 4 | 4 |
| Tipologia | 10 | 255 |

## Tabla: TbUsuariosAplicaciones
> (LINKED) **Tabla Vinculada**
> *Origen:* TbUsuariosAplicaciones
> *ConexiÃ³n:* MS Access;PWD=***;DATABASE=\\datoste\aplicaciones_dys\Aplicaciones PpD\0Lanzadera\Lanzadera_Datos.accdb

| Campo | Tipo | Longitud |
| :--- | :--- | :--- |

