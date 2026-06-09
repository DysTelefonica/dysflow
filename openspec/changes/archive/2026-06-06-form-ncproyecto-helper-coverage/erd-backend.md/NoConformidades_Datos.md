# ERD - NoConformidades_Datos

Generado: 2026-06-03 12:33

## Tablas (44)

### Copia de TbNCARAvisos

| Campo | Tipo | TamaÃ±o | Requerido | PK |
|---|---|---|---|---|
| ID | Long | 4 | Si | PK |
| IDAR | Long | 4 | No |  |
| IDCorreo15 | Long | 4 | No |  |
| IDCorreo7 | Long | 4 | No |  |
| IDCorreo0 | Long | 4 | No |  |
| Fecha | Date/Time | 8 | No |  |

### TbAnexos

| Campo | Tipo | TamaÃ±o | Requerido | PK |
|---|---|---|---|---|
| IDAnexo | Long | 4 | Si | PK |
| IDNoConformidad | Long | 4 | Si |  |
| TituloAnexo | Text | 255 | No |  |
| DescripcionAnexo | Memo | - | No |  |
| URLInicial | Text | 255 | No |  |
| NombreArchivoFinalAnexo | Text | 255 | No |  |
| FechaAnexo | Date/Time | 8 | No |  |

### TbAnexosAuditoria

| Campo | Tipo | TamaÃ±o | Requerido | PK |
|---|---|---|---|---|
| IDAnexo | Long | 4 | Si | PK |
| IDAuditoria | Long | 4 | Si |  |
| URLInicial | Text | 255 | No |  |
| NombreArchivo | Text | 255 | No |  |
| FechaAnexo | Date/Time | 8 | No |  |

### TbAnexosNCAuditorias

| Campo | Tipo | TamaÃ±o | Requerido | PK |
|---|---|---|---|---|
| IDAnexo | Long | 4 | Si | PK |
| IDNoConformidad | Long | 4 | Si |  |
| URLInicial | Text | 255 | No |  |
| NombreArchivo | Text | 255 | No |  |
| FechaAnexo | Date/Time | 8 | No |  |

### TbAuditoriaLog

| Campo | Tipo | TamaÃ±o | Requerido | PK |
|---|---|---|---|---|
| IDLog | Long | 4 | Si | PK |
| IDNC | Long | 4 | No |  |
| IDAC | Long | 4 | No |  |
| IDAR | Long | 4 | No |  |
| Usuario | Text | 255 | No |  |
| Fecha | Date/Time | 8 | No |  |
| Titulo | Memo | - | No |  |
| Linea | Memo | - | No |  |

### TbAuditorias

| Campo | Tipo | TamaÃ±o | Requerido | PK |
|---|---|---|---|---|
| IDAuditoria | Long | 4 | Si | PK |
| Tipo | Text | 255 | No |  |
| FechaInicio | Date/Time | 8 | No |  |
| FechaFin | Date/Time | 8 | No |  |

### TbAuxPuntoNorma

| Campo | Tipo | TamaÃ±o | Requerido | PK |
|---|---|---|---|---|
| PuntoNorma | Text | 255 | Si | PK |

### TbCacheIndicadoresProyectoDetalle

| Campo | Tipo | TamaÃ±o | Requerido | PK |
|---|---|---|---|---|
| IDCacheDetalle | Long | 4 | No | PK |
| IDCacheIndicadorProyecto | Long | 4 | Si |  |
| Bucket | Text | 64 | Si |  |
| TipoFila | Text | 16 | Si |  |
| IDEntidad | Long | 4 | Si |  |
| IDNoConformidad | Long | 4 | No |  |
| IDAccionCorrectiva | Long | 4 | No |  |
| IDAccionRealizada | Long | 4 | No |  |
| ResponsableCalidad | Text | 255 | No |  |
| CodigoNoConformidad | Text | 255 | No |  |
| Descripcion | Memo | - | No |  |
| Nemotecnico | Text | 255 | No |  |
| Tarea | Memo | - | No |  |
| Estado | Text | 255 | No |  |
| Tecnico | Text | 255 | No |  |
| TipoNC | Text | 255 | No |  |
| IDExpediente | Long | 4 | No |  |
| NAccion | Text | 50 | No |  |
| FechaInicio | Date/Time | 8 | No |  |
| FechaFinPrevista | Date/Time | 8 | No |  |
| FechaFinReal | Date/Time | 8 | No |  |
| FechaCierre | Date/Time | 8 | No |  |
| RequiereControlEficacia | Text | 50 | No |  |
| ResultadoControlEficacia | Text | 255 | No |  |
| FechaSnapshot | Date/Time | 8 | Si |  |

### TbCacheIndicadoresProyectoHeader

| Campo | Tipo | TamaÃ±o | Requerido | PK |
|---|---|---|---|---|
| IDCacheIndicadorProyecto | Long | 4 | Si | PK |
| FechaSincronizacion | Date/Time | 8 | Si |  |
| UsuarioSincronizacion | Text | 255 | No |  |
| Estado | Text | 50 | No |  |
| ErrorUltimaSincronizacion | Memo | - | No |  |

### TbCacheListadoNC

| Campo | Tipo | TamaÃ±o | Requerido | PK |
|---|---|---|---|---|
| IDNoConformidad | Long | 4 | No |  |
| CodigoNoConformidad | Text | 255 | No |  |
| IDExpediente | Long | 4 | No |  |
| Nemotecnico | Text | 255 | No |  |
| CodExp | Text | 255 | No |  |
| IDTipo | Long | 4 | No |  |
| Descripcion | Memo | - | No |  |
| Notas | Memo | - | No |  |
| Estado | Text | 100 | No |  |
| FechaApertura | Date/Time | 8 | No |  |
| FechaCierre | Date/Time | 8 | No |  |
| RequiereControlEficacia | Text | 10 | No |  |
| ControlEficacia | Text | 255 | No |  |
| ResponsableTelefonica | Text | 255 | No |  |
| RESPONSABLECALIDAD | Text | 255 | No |  |
| ACR | Text | 255 | No |  |
| Cerrada | Text | 10 | No |  |
| FechaCache | Date/Time | 8 | No |  |
| CacheValida | Boolean | 1 | No |  |
| Version | Long | 4 | No |  |
| JuridicaExp | Text | 255 | No |  |

### TbCacheNCProyecto

| Campo | Tipo | TamaÃ±o | Requerido | PK |
|---|---|---|---|---|
| IDNoConformidad | Long | 4 | Si | PK |
| IDCache | Long | 4 | No |  |
| Version | Integer | 2 | No |  |
| FechaCache | Date/Time | 8 | No |  |
| DatosNC | Memo | - | No |  |
| DatosACs | Memo | - | No |  |
| DatosARs | Memo | - | No |  |
| DatosReplanificaciones | Memo | - | No |  |
| DatosRiesgos | Memo | - | No |  |
| UsuarioCache | Text | 50 | No |  |
| CacheValida | Boolean | 1 | No |  |

### TbConexiones

| Campo | Tipo | TamaÃ±o | Requerido | PK |
|---|---|---|---|---|
| Usuario | Text | 255 | Si | PK |
| UltimaConexion | Date/Time | 8 | No |  |
| UltimaDesconexion | Date/Time | 8 | No |  |
| InstaladoFW3 | Text | 2 | No |  |
| InstaladoFW4 | Text | 2 | No |  |
| Exitoso | Text | 2 | No |  |

### TbConfiguracion

| Campo | Tipo | TamaÃ±o | Requerido | PK |
|---|---|---|---|---|
| ID | Long | 4 | No | PK |
| CacheHabilitada | Boolean | 1 | No |  |
| FechaCambioCache | Date/Time | 8 | No |  |
| UsuarioCambioCache | Text | 255 | No |  |
| MotivoCambioCache | Memo | - | No |  |

### TbConsultasPorFechas

| Campo | Tipo | TamaÃ±o | Requerido | PK |
|---|---|---|---|---|
| Descripcion | Text | 255 | Si | PK |

### TbCorreosEnviados

| Campo | Tipo | TamaÃ±o | Requerido | PK |
|---|---|---|---|---|
| IDCorreo | Long | 4 | Si |  |
| URLAdjunto | Memo | - | No |  |
| Aplicacion | Text | 255 | No |  |
| Originador | Text | 50 | No |  |
| Destinatarios | Memo | - | No |  |
| DestinatariosConCopia | Memo | - | No |  |
| DestinatariosConCopiaOculta | Memo | - | No |  |
| Asunto | Text | 255 | No |  |
| Cuerpo | Memo | - | No |  |
| FechaEnvio | Date/Time | 8 | No |  |
| Observaciones | Memo | - | No |  |
| NDPD | Text | 50 | No |  |
| NPEDIDO | Text | 50 | No |  |
| NFACTURA | Text | 50 | No |  |
| FechaGrabacion | Date/Time | 8 | No |  |
| CuerpoHTML | Boolean | 1 | No |  |
| IDEdicion | Integer | 2 | No |  |

### TbDocumentosAuditorias

| Campo | Tipo | TamaÃ±o | Requerido | PK |
|---|---|---|---|---|
| IDDocumento | Long | 4 | Si | PK |
| IDNoConformidad | Long | 4 | No |  |
| Documento | Text | 255 | Si |  |
| NombreAnexo | Text | 255 | No |  |
| IDAccionRealizada | Long | 4 | No |  |
| IDAuditoria | Long | 4 | No |  |
| IDAuditoriaResultante | Long | 4 | No |  |

### TbExpedientes

| Campo | Tipo | TamaÃ±o | Requerido | PK |
|---|---|---|---|---|
| IDExpediente | Long | 4 | Si | PK |
| IDExpedientePadre | Long | 4 | No |  |
| OrdinalE2E | Long | 4 | No |  |
| Nemotecnico | Text | 255 | No |  |
| Titulo | Memo | - | No |  |
| ImporteLicitacion | Double | 8 | No |  |
| ImporteContratacion | Double | 8 | No |  |
| CodProyecto | Text | 255 | No |  |
| CodExp | Text | 255 | No |  |
| CodExpLargo | Text | 255 | No |  |
| CodS4H | Text | 255 | No |  |
| FechaInicioContrato | Date/Time | 8 | No |  |
| FechaFinContrato | Date/Time | 8 | No |  |
| FechaFinGarantia | Date/Time | 8 | No |  |
| EsAM | Text | 2 | No |  |
| EsLote | Text | 2 | No |  |
| EsBasado | Text | 255 | No |  |
| EsExpediente | Text | 2 | No |  |
| Ordinal | Text | 255 | No |  |
| IdGradoClasificacion | Long | 4 | No |  |
| IDOrganoContratacion | Long | 4 | No |  |
| IDOficinaPrograma | Long | 4 | No |  |
| IDEjercito | Long | 4 | No |  |
| AccesoSharepoint | Memo | - | No |  |
| Observaciones | Memo | - | No |  |
| FechaCreacion | Date/Time | 8 | No |  |
| IDUsuarioCreacion | Text | 255 | No |  |
| FechaUltimoCambio | Date/Time | 8 | No |  |
| IDUsuarioUltimoCambio | Text | 255 | No |  |
| IDEstado | Long | 4 | No |  |
| Ambito | Text | 10 | No |  |
| NPedido | Text | 255 | No |  |
| IDResponsableCalidad | Long | 4 | No |  |
| Adjudicado | Text | 2 | No |  |
| EnPeriodoDeAdjudicacion | Text | 2 | No |  |
| Tipo | Text | 255 | No |  |
| TipoInforme | Text | 255 | No |  |
| AGEDYSAplica | Text | 2 | No |  |
| AGEDYSGenerico | Text | 2 | No |  |
| HPSAplica | Text | 2 | No |  |
| CadenaPecal | Text | 255 | No |  |
| Pecal | Text | 2 | No |  |
| POSTAGEDO | Text | 2 | No |  |
| FECHAPREOFERTA | Date/Time | 8 | No |  |
| APLICAESTADO | Text | 2 | No |  |
| FECHAINICIOLICITACION | Date/Time | 8 | No |  |
| FECHAOFERTA | Date/Time | 8 | No |  |
| FECHAADJUDICACION | Date/Time | 8 | No |  |
| FECHAFIRMACONTRATO | Date/Time | 8 | No |  |
| GARANTIAMESES | Text | 255 | No |  |
| FECHACERTIFICACION | Date/Time | 8 | No |  |
| FECHAPERDIDA | Date/Time | 8 | No |  |
| FECHADESESTIMADA | Date/Time | 8 | No |  |
| ESTADO | Text | 255 | No |  |
| CodigoActividad | Text | 255 | No |  |
| AplicaTareaS4H | Text | 2 | No |  |
| ContratistaPrincipal | Text | 2 | No |  |
| IDResponsableSeguridad | Long | 4 | No |  |
| ObjetoContrato | Memo | - | No |  |
| HashActual | Text | 64 | No |  |
| HashUltimaExportacion | Text | 64 | No |  |

### TbExpedientesResponsables

| Campo | Tipo | TamaÃ±o | Requerido | PK |
|---|---|---|---|---|
| IDExpedienteResponsable | Long | 4 | Si | PK |
| IdExpediente | Long | 4 | Si |  |
| IdUsuario | Long | 4 | Si |  |
| CorreoSiempre | Text | 2 | No |  |
| EsJefeProyecto | Text | 2 | No |  |
| esPreventa | Text | 2 | No |  |

### TbHerramientaDocAyuda

| Campo | Tipo | TamaÃ±o | Requerido | PK |
|---|---|---|---|---|
| NombreFormulario | Text | 255 | Si | PK |
| NombreArchivoAyuda | Text | 255 | Si | PK |

### TbLog

| Campo | Tipo | TamaÃ±o | Requerido | PK |
|---|---|---|---|---|
| IDLog | Long | 4 | Si | PK |
| IDNC | Long | 4 | No |  |
| IDAC | Long | 4 | No |  |
| IDAR | Long | 4 | No |  |
| Usuario | Text | 255 | No |  |
| Fecha | Date/Time | 8 | No |  |
| Titulo | Memo | - | No |  |
| Linea | Memo | - | No |  |

### TbLogAuditoria

| Campo | Tipo | TamaÃ±o | Requerido | PK |
|---|---|---|---|---|
| IDLog | Long | 4 | Si | PK |
| IDNC | Long | 4 | No |  |
| IDAC | Long | 4 | No |  |
| IDAR | Long | 4 | No |  |
| Usuario | Text | 255 | No |  |
| Fecha | Date/Time | 8 | No |  |
| Titulo | Memo | - | No |  |
| Linea | Memo | - | No |  |

### TbLogCache

| Campo | Tipo | TamaÃ±o | Requerido | PK |
|---|---|---|---|---|
| IDLog | Long | 4 | No | PK |
| IDNoConformidad | Long | 4 | Si |  |
| TipoOperacion | Text | 50 | No |  |
| SeccionCache | Text | 50 | No |  |
| Detalles | Memo | - | No |  |
| FechaOperacion | Date/Time | 8 | No |  |
| Usuario | Text | 50 | No |  |
| DuracionMs | Long | 4 | No |  |
| Exito | Boolean | 1 | No |  |

### TbNCAccionCorrectivas

| Campo | Tipo | TamaÃ±o | Requerido | PK |
|---|---|---|---|---|
| IDAccionCorrectiva | Long | 4 | Si | PK |
| IDNoConformidad | Long | 4 | No |  |
| NAccion | Long | 4 | No |  |
| AccionCorrectiva | Memo | - | No |  |
| FechaAccionCorrectiva | Date/Time | 8 | No |  |
| ESTADO | Text | 255 | No |  |
| FechaInicialMinima | Date/Time | 8 | No |  |
| FechaFinalUltima | Date/Time | 8 | No |  |
| Notas | Memo | - | No |  |
| Responsable | Text | 255 | No |  |
| FechaFinPrevistaUltima | Date/Time | 8 | No |  |

### TbNCAccionesRealizadas

| Campo | Tipo | TamaÃ±o | Requerido | PK |
|---|---|---|---|---|
| IDAccionRealizada | Long | 4 | Si | PK |
| IDAccionCorrectiva | Long | 4 | No |  |
| NAccion | Long | 4 | No |  |
| AccionRealizada | Memo | - | No |  |
| FechaAccionRealizada | Date/Time | 8 | No |  |
| FechaInicio | Date/Time | 8 | No |  |
| FechaFinPrevista | Date/Time | 8 | No |  |
| FechaFinReal | Date/Time | 8 | No |  |
| ESTADO | Text | 255 | No |  |
| Notas | Memo | - | No |  |
| Responsable | Text | 255 | No |  |

### TbNCARAvisos

| Campo | Tipo | TamaÃ±o | Requerido | PK |
|---|---|---|---|---|
| ID | Long | 4 | Si | PK |
| IDAR | Long | 4 | No |  |
| IDCorreo15 | Long | 4 | No |  |
| IDCorreo7 | Long | 4 | No |  |
| IDCorreo0 | Long | 4 | No |  |
| Fecha | Date/Time | 8 | No |  |

### TbNCAuditoriaAccionCorrectivas

| Campo | Tipo | TamaÃ±o | Requerido | PK |
|---|---|---|---|---|
| IDAccionCorrectiva | Long | 4 | Si | PK |
| ID | Long | 4 | No |  |
| NAccion | Long | 4 | No |  |
| AccionCorrectiva | Memo | - | No |  |
| FechaAccionCorrectiva | Date/Time | 8 | No |  |
| ESTADO | Text | 255 | No |  |
| FechaInicialMinima | Date/Time | 8 | No |  |
| FechaFinalUltima | Date/Time | 8 | No |  |
| Notas | Memo | - | No |  |
| Responsable | Text | 255 | No |  |
| FechaFinPrevistaUltima | Date/Time | 8 | No |  |

### TbNCAuditoriaAccionesRealizadas

| Campo | Tipo | TamaÃ±o | Requerido | PK |
|---|---|---|---|---|
| IDAccionRealizada | Long | 4 | Si | PK |
| IDAccionCorrectiva | Long | 4 | No |  |
| NAccion | Long | 4 | No |  |
| AccionRealizada | Memo | - | No |  |
| FechaAccionRealizada | Date/Time | 8 | No |  |
| FechaInicio | Date/Time | 8 | No |  |
| FechaFinPrevista | Date/Time | 8 | No |  |
| FechaFinReal | Date/Time | 8 | No |  |
| ESTADO | Text | 255 | No |  |
| Notas | Memo | - | No |  |
| Responsable | Text | 255 | No |  |

### TbNCDocumentos

| Campo | Tipo | TamaÃ±o | Requerido | PK |
|---|---|---|---|---|
| IDDocumento | Long | 4 | Si | PK |
| IDNoConformidad | Long | 4 | No |  |
| Documento | Text | 255 | Si |  |
| NombreAnexo | Text | 255 | No |  |
| IDAccionRealizada | Long | 4 | No |  |
| IDNoConformidadResultante | Long | 4 | No |  |

### TbNCInformacionRAC

| Campo | Tipo | TamaÃ±o | Requerido | PK |
|---|---|---|---|---|
| IDInformacionRAC | Long | 4 | Si | PK |
| IDNoConformidad | Long | 4 | No |  |
| Informacion | Memo | - | No |  |
| FechaInformacion | Date/Time | 8 | No |  |
| FechaCreacion | Date/Time | 8 | No |  |
| FechaEdicion | Date/Time | 8 | No |  |
| UsuarioCrea | Text | 255 | No |  |
| UltimoUsuarioEdita | Text | 255 | No |  |

### TbNCInformacionRACAnexos

| Campo | Tipo | TamaÃ±o | Requerido | PK |
|---|---|---|---|---|
| IDAnexoInformacionRAC | Long | 4 | Si | PK |
| IDInformacionRAC | Long | 4 | No |  |
| NombreArchivo | Text | 255 | No |  |
| FechaAnexo | Date/Time | 8 | No |  |

### TbNoConformidades

| Campo | Tipo | TamaÃ±o | Requerido | PK |
|---|---|---|---|---|
| IDNoConformidad | Long | 4 | Si | PK |
| Juridica | Text | 255 | No |  |
| CodigoNoConformidad | Text | 255 | Si |  |
| EsNoConformidad | Boolean | 1 | No |  |
| EXPEDIENTE | Text | 255 | Si |  |
| PROYECTO | Text | 255 | No |  |
| VEHICULO | Text | 255 | No |  |
| DESCRIPCION | Memo | - | No |  |
| CAUSA | Memo | - | No |  |
| ENTIDADRESPONSABLE | Text | 50 | No |  |
| RESPONSABLETELEFONICA | Text | 50 | No |  |
| FECHAAPERTURA | Date/Time | 8 | No |  |
| FECHACIERRE | Date/Time | 8 | No |  |
| FPREVCIERRE | Date/Time | 8 | No |  |
| TIPO | Text | 255 | No |  |
| NOTAS | Memo | - | No |  |
| Borrado | Boolean | 1 | No |  |
| RequiereACR | Boolean | 1 | No |  |
| ACR | Memo | - | No |  |
| MotivoBorrado | Memo | - | No |  |
| RequiereControlEficacia | Text | 255 | No |  |
| ControlEficacia | Memo | - | No |  |
| FechaControlEficacia | Date/Time | 8 | No |  |
| FechaPrevistaControlEficacia | Date/Time | 8 | No |  |
| ResultadoControlEficacia | Memo | - | No |  |
| ConformeControlEficacia | Text | 2 | No |  |
| RESPONSABLECALIDAD | Text | 255 | No |  |
| IDExpediente | Long | 4 | No |  |
| CodExp | Text | 255 | No |  |
| Nemotecnico | Text | 255 | No |  |
| JuridicaExp | Text | 255 | No |  |
| RESPONSABLECALIDADExp | Text | 255 | No |  |
| CausaYAnalisRaiz | Memo | - | No |  |
| Tipologia | Text | 255 | No |  |
| IDProyecto | Long | 4 | No |  |
| CodigoRiesgo | Text | 255 | No |  |
| DetectadoPor | Text | 255 | No |  |
| ResponsableEjecucion | Text | 255 | No |  |
| ESTADO | Text | 255 | No |  |
| IDTipo | Long | 4 | No |  |
| Cerrada | Text | 2 | No |  |
| IDNCAsociada | Long | 4 | No |  |
| CodigoNoConformidadAsociada | Text | 255 | No |  |
| CodConcesionAsociada | Text | 255 | No |  |
| MotivoNoRequiereControlEficacia | Memo | - | No |  |

### TbNoConformidadesAuditoria

| Campo | Tipo | TamaÃ±o | Requerido | PK |
|---|---|---|---|---|
| ID | Long | 4 | Si | PK |
| IDAuditoria | Long | 4 | No |  |
| FechaApertura | Date/Time | 8 | No |  |
| Numero | Text | 255 | No |  |
| DESCRIPCION | Memo | - | No |  |
| CAUSARAIZ | Memo | - | Si |  |
| ACCIONCORRECTIVA | Memo | - | No |  |
| CORRECCION | Memo | - | No |  |
| FECHACIERRE | Date/Time | 8 | No |  |
| FPREVCIERRE | Date/Time | 8 | No |  |
| RESPONSABLEIMPLANTACION | Text | 255 | No |  |
| RequiereControlEficacia | Text | 25 | Si |  |
| ControlEficacia | Memo | - | No |  |
| FechaControlEficacia | Date/Time | 8 | No |  |
| FechaPrevistaControlEficacia | Date/Time | 8 | No |  |
| ResultadoControlEficacia | Memo | - | No |  |
| ConformeControlEficacia | Text | 2 | No |  |
| RequiereAccionCorrectiva | Text | 2 | No |  |
| MotivoNoAccionCorrectiva | Memo | - | No |  |
| Tipo | Text | 255 | No |  |
| PuntoNorma | Text | 255 | No |  |
| ESTADO | Text | 255 | No |  |
| Borrado | Boolean | 1 | No |  |
| MotivoBorrado | Memo | - | No |  |
| Notas | Memo | - | No |  |
| Cerrada | Text | 2 | No |  |
| MotivoNoRequiereControlEficacia | Memo | - | No |  |

### TbNoConformidadesIngresoPorLotesDetalle

| Campo | Tipo | TamaÃ±o | Requerido | PK |
|---|---|---|---|---|
| IDLoteExcel | Long | 4 | No |  |
| CodigoNoConformidad | Text | 255 | Si |  |
| EsNoConformidad | Boolean | 1 | No |  |
| DocumentoDeReferencia | Memo | - | No |  |
| EXPEDIENTE | Text | 255 | Si |  |
| PROYECTO | Text | 255 | No |  |
| VEHICULO | Text | 255 | No |  |
| DESCRIPCION | Memo | - | No |  |
| CAUSA | Memo | - | Si |  |
| ACCIONCORRECTIVA | Memo | - | No |  |
| ACCIONREALIZADA | Memo | - | No |  |
| ENTIDADRESPONSABLE | Text | 50 | No |  |
| RESPONSABLETELEFONICA | Text | 50 | No |  |
| FECHAAPERTURA | Date/Time | 8 | No |  |
| FECHAPREVISTACIERRE | Date/Time | 8 | No |  |
| FECHACIERRE | Date/Time | 8 | No |  |
| TIPO | Text | 255 | No |  |
| NOTAS | Memo | - | No |  |
| DatosDelRegistro | Memo | - | No |  |

### TbNoConformidadesIngresoPorLotesPrincipal

| Campo | Tipo | TamaÃ±o | Requerido | PK |
|---|---|---|---|---|
| IDLoteExcel | Long | 4 | Si | PK |
| FechaRegistro | Date/Time | 8 | No |  |
| URLCompletaOrigen | Text | 255 | No |  |
| NombreArchivoExcel | Text | 255 | No |  |
| FilaDatosInicial | Integer | 2 | No |  |
| Observaciones | Memo | - | No |  |

### TbNoConformidadesIngresoPorLotesTemporal

| Campo | Tipo | TamaÃ±o | Requerido | PK |
|---|---|---|---|---|
| IDTmp | Long | 4 | Si | PK |
| EsNoConformidadTmp | Memo | - | No |  |
| DocumentoDeReferenciaTmp | Memo | - | No |  |
| EXPEDIENTETmp | Memo | - | Si |  |
| PROYECTOTmp | Memo | - | No |  |
| VEHICULOTmp | Memo | - | No |  |
| DESCRIPCIONTmp | Memo | - | No |  |
| CAUSATmp | Memo | - | No |  |
| ACCIONCORRECTIVATmp | Memo | - | No |  |
| ACCIONREALIZADATmp | Memo | - | No |  |
| ENTIDADRESPONSABLETmp | Memo | - | No |  |
| RESPONSABLETELEFONICATmp | Memo | - | No |  |
| FECHAAPERTURATmp | Memo | - | No |  |
| FECHAPREVISTACIERRETmp | Memo | - | No |  |
| FECHACIERRETmp | Memo | - | No |  |
| TIPOTmp | Memo | - | No |  |
| NOTASTmp | Memo | - | No |  |
| blnPasaCriterioParaGrabar | Boolean | 1 | No |  |
| DatosDelRegistroTmp | Memo | - | No |  |
| ValidacionDatos | Memo | - | No |  |

### TbReplanificacionesAuditoria

| Campo | Tipo | TamaÃ±o | Requerido | PK |
|---|---|---|---|---|
| IDReplanificacion | Long | 4 | Si | PK |
| IDNoConformidad | Long | 4 | Si |  |
| IDAccionRealizada | Long | 4 | Si |  |
| FechaReprogramacion | Date/Time | 8 | No |  |
| FechaPrevistaAlInicio | Date/Time | 8 | No |  |
| FechaPrevistaReplanificada | Date/Time | 8 | No |  |
| Observaciones | Memo | - | No |  |

### TbReplanificacionesProyecto

| Campo | Tipo | TamaÃ±o | Requerido | PK |
|---|---|---|---|---|
| IDReplanificacion | Long | 4 | Si | PK |
| IDNoConformidad | Long | 4 | Si |  |
| IDAccionRealizada | Long | 4 | Si |  |
| FechaReprogramacion | Date/Time | 8 | No |  |
| FechaPrevistaAlInicio | Date/Time | 8 | No |  |
| FechaPrevistaReplanificada | Date/Time | 8 | No |  |
| Observaciones | Memo | - | No |  |

### TbRiesgos

| Campo | Tipo | TamaÃ±o | Requerido | PK |
|---|---|---|---|---|
| IDRiesgo | Long | 4 | Si | PK |
| IDEdicion | Long | 4 | Si |  |
| CodigoUnico | Text | 255 | Si |  |
| CodigoRiesgo | Text | 5 | Si |  |
| FechaDetectado | Date/Time | 8 | No |  |
| DetectadoPor | Text | 255 | No |  |
| EntidadDetecta | Text | 255 | No |  |
| Plazo | Text | 255 | No |  |
| Calidad | Text | 255 | No |  |
| Coste | Text | 255 | No |  |
| ImpactoGlobal | Text | 15 | No |  |
| Vulnerabilidad | Text | 15 | No |  |
| Valoracion | Text | 15 | No |  |
| Mitigacion | Text | 15 | No |  |
| Contingencia | Text | 15 | No |  |
| RequierePlanContingencia | Text | 2 | No |  |
| Descripcion | Memo | - | No |  |
| CausaRaiz | Memo | - | No |  |
| Estado | Text | 255 | No |  |
| FechaEstado | Text | 255 | No |  |
| Priorizacion | Integer | 2 | No |  |
| FechaMaterializado | Date/Time | 8 | No |  |
| FechaRetirado | Date/Time | 8 | No |  |
| FechaCerrado | Date/Time | 8 | No |  |
| FechaMitigacionAceptar | Date/Time | 8 | No |  |
| JustificacionAceptacionRiesgo | Memo | - | No |  |
| FechaJustificacionAceptacionRiesgo | Date/Time | 8 | No |  |
| FechaAprobacionAceptacionPorCalidad | Date/Time | 8 | No |  |
| FechaRechazoAceptacionPorCalidad | Date/Time | 8 | No |  |
| JustificacionRetiroRiesgo | Memo | - | No |  |
| FechaJustificacionRetiroRiesgo | Date/Time | 8 | No |  |
| FechaAprobacionRetiroPorCalidad | Date/Time | 8 | No |  |
| FechaRechazoRetiroPorCalidad | Date/Time | 8 | No |  |
| RequiereRiesgoDeBiblioteca | Text | 2 | No |  |
| CodRiesgoBiblioteca | Text | 255 | No |  |
| RiesgoPendienteRetipificacion | Text | 2 | No |  |
| FechaRiesgoParaRetipificar | Date/Time | 8 | No |  |
| FechaRiesgoRetipificado | Date/Time | 8 | No |  |
| DiasSinRespuestaCalidadAceptacion | Text | 255 | No |  |
| DiasSinRespuestaCalidadRetiro | Text | 255 | No |  |
| DiasSinRespuestaCalidadRetipificacion | Text | 255 | No |  |
| Origen | Text | 255 | No |  |
| HayErrorEnRiesgo | Text | 255 | No |  |
| NombreNodoDesc | Text | 255 | No |  |
| NombreNodoEstado | Text | 255 | No |  |
| NombreIcono | Text | 255 | No |  |
| ColorIcono | Text | 255 | No |  |

### TbRiesgosNC

| Campo | Tipo | TamaÃ±o | Requerido | PK |
|---|---|---|---|---|
| ID | Long | 4 | Si | PK |
| IDRiesgo | Long | 4 | No |  |
| IDNC | Long | 4 | No |  |
| FechaRegistro | Date/Time | 8 | No |  |
| ParaNC | Text | 2 | No |  |
| FechaDecison | Date/Time | 8 | No |  |

### TbTareasExplicaciones

| Campo | Tipo | TamaÃ±o | Requerido | PK |
|---|---|---|---|---|
| NodoTarea | Text | 255 | Si | PK |
| TituloTarea | Text | 255 | No |  |
| Explicacion | Memo | - | No |  |

### TbTipologia

| Campo | Tipo | TamaÃ±o | Requerido | PK |
|---|---|---|---|---|
| CodTipologia | Text | 2 | Si | PK |
| Tipologia | Text | 255 | No |  |

### TbTiposNCProyectos

| Campo | Tipo | TamaÃ±o | Requerido | PK |
|---|---|---|---|---|
| IDTipo | Long | 4 | Si | PK |
| Tipologia | Text | 255 | No |  |

### TbUsuariosAplicaciones

| Campo | Tipo | TamaÃ±o | Requerido | PK |
|---|---|---|---|---|
| CorreoUsuario | Text | 255 | Si | PK |
| Password | Text | 255 | No |  |
| UsuarioRed | Text | 255 | No |  |
| Nombre | Text | 255 | No |  |
| Matricula | Text | 255 | No |  |
| FechaAlta | Date/Time | 8 | No |  |
| Activado | Boolean | 1 | No |  |
| FechaProximoCambioContrasenia | Date/Time | 8 | No |  |
| FechaUltimaConexion | Date/Time | 8 | No |  |
| TieneQueCambiarLaContrasenia | Boolean | 1 | No |  |
| Telefono | Text | 255 | No |  |
| Movil | Text | 255 | No |  |
| Observaciones | Memo | - | No |  |
| UsuarioImborrable | Boolean | 1 | No |  |
| EsAdministrador | Text | 2 | No |  |
| PermisosAsignados | Boolean | 1 | No |  |
| FechaBaja | Date/Time | 8 | No |  |
| PasswordNuncaCaduca | Boolean | 1 | No |  |
| MantenerLanzaderaAbierta | Boolean | 1 | No |  |
| PassIncialPlana | Text | 255 | No |  |
| UsuarioSSID | Text | 255 | No |  |
| Id | Integer | 2 | Si |  |
| JefeDelUsuario | Text | 50 | No |  |
| PermisoPruebas | Text | 2 | No |  |
| ParaTareasProgramadas | Boolean | 1 | No |  |
| FechaBloqueo | Date/Time | 8 | No |  |

### TbUsuariosAplicacionesPermisos

| Campo | Tipo | TamaÃ±o | Requerido | PK |
|---|---|---|---|---|
| CorreoUsuario | Text | 255 | Si | PK |
| IDAplicacion | Long | 4 | Si | PK |
| EsUsuarioAdministrador | Text | 2 | No |  |
| EsUsuarioCalidad | Text | 2 | No |  |
| EsUsuarioEconomia | Text | 2 | No |  |
| EsUsuarioSecretaria | Text | 2 | No |  |
| EsUsuarioTecnico | Text | 2 | No |  |
| EsUsuarioSinAcceso | Text | 2 | No |  |
| EsUsuarioCalidadAvisos | Text | 2 | No |  |

## Relaciones

| Nombre | Tabla origen | Campo origen | Tabla destino | Campo destino |
|---|---|---|---|---|
| MSysNavPaneGroupCategoriesMSysNavPaneGroups | MSysNavPaneGroupCategories | Id | MSysNavPaneGroups | GroupCategoryID |
| TbAuditoriasTbDocumentosAuditorias | TbAuditorias | IDAuditoria | TbDocumentosAuditorias | IDAuditoria |
| TbAuditoriasTbNoConformidadesAuditoria | TbAuditorias | IDAuditoria | TbNoConformidadesAuditoria | IDAuditoria |
| TbNCAccionCorrectivasTbNCAccionesRealizadas | TbNCAccionCorrectivas | IDAccionCorrectiva | TbNCAccionesRealizadas | IDAccionCorrectiva |
| TbNCAccionesRealizadasTbReplanificacionesProyecto | TbNCAccionesRealizadas | IDAccionRealizada | TbReplanificacionesProyecto | IDAccionRealizada |
| TbNCAuditoriaAccionCorrectivaTbNCAuditoriaAccionesRealizadas | TbNCAuditoriaAccionCorrectivas | IDAccionCorrectiva | TbNCAuditoriaAccionesRealizadas | IDAccionCorrectiva |
| TbNCAuditoriaAccionesRealizadTbDocumentosAuditorias | TbNCAuditoriaAccionesRealizadas | IDAccionRealizada | TbDocumentosAuditorias | IDAccionRealizada |
| TbNCInformacionRACTbNCInformacionRACAnexos | TbNCInformacionRAC | IDInformacionRAC | TbNCInformacionRACAnexos | IDInformacionRAC |
| TbNoConformidadesAuditoriaTbDocumentosAuditorias | TbNoConformidadesAuditoria | ID | TbDocumentosAuditorias | IDNoConformidad |
| TbNoConformidadesAuditoriaTbNCAuditoriaAccionCorrectivas | TbNoConformidadesAuditoria | ID | TbNCAuditoriaAccionCorrectivas | ID |
| TbNoConformidadesTbAnexos | TbNoConformidades | IDNoConformidad | TbAnexos | IDNoConformidad |
| TbNoConformidadesTbNCAccionCorrectivas | TbNoConformidades | IDNoConformidad | TbNCAccionCorrectivas | IDNoConformidad |
| TbNoConformidadesTbNCDocumentos | TbNoConformidades | IDNoConformidad | TbNCDocumentos | IDNoConformidad |
| TbNoConformidadesTbNCInformacionRAC | TbNoConformidades | IDNoConformidad | TbNCInformacionRAC | IDNoConformidad |

