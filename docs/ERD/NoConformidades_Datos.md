# ERD - NoConformidades_Datos

Generado: 2026-03-14 18:40

## Tablas (40)

### Copia de TbNCARAvisos

| Campo | Tipo | Tamaño | Requerido | PK |
|---|---|---|---|---|
| ID | Long | 4 | Si | PK |
| IDAR | Long | 4 | No |  |
| IDCorreo15 | Long | 4 | No |  |
| IDCorreo7 | Long | 4 | No |  |
| IDCorreo0 | Long | 4 | No |  |
| Fecha | Date/Time | 8 | No |  |

### TbAnexos

| Campo | Tipo | Tamaño | Requerido | PK |
|---|---|---|---|---|
| IDAnexo | Long | 4 | Si | PK |
| IDNoConformidad | Long | 4 | Si |  |
| TituloAnexo | Text | 255 | No |  |
| DescripcionAnexo | Memo | - | No |  |
| URLInicial | Text | 255 | No |  |
| NombreArchivoFinalAnexo | Text | 255 | No |  |
| FechaAnexo | Date/Time | 8 | No |  |

### TbAnexosAuditoria

| Campo | Tipo | Tamaño | Requerido | PK |
|---|---|---|---|---|
| IDAnexo | Long | 4 | Si | PK |
| IDAuditoria | Long | 4 | Si |  |
| URLInicial | Text | 255 | No |  |
| NombreArchivo | Text | 255 | No |  |
| FechaAnexo | Date/Time | 8 | No |  |

### TbAnexosNCAuditorias

| Campo | Tipo | Tamaño | Requerido | PK |
|---|---|---|---|---|
| IDAnexo | Long | 4 | Si | PK |
| IDNoConformidad | Long | 4 | Si |  |
| URLInicial | Text | 255 | No |  |
| NombreArchivo | Text | 255 | No |  |
| FechaAnexo | Date/Time | 8 | No |  |

### TbAuditoriaLog

| Campo | Tipo | Tamaño | Requerido | PK |
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

| Campo | Tipo | Tamaño | Requerido | PK |
|---|---|---|---|---|
| IDAuditoria | Long | 4 | Si | PK |
| Tipo | Text | 255 | No |  |
| FechaInicio | Date/Time | 8 | No |  |
| FechaFin | Date/Time | 8 | No |  |

### TbAuxPuntoNorma

| Campo | Tipo | Tamaño | Requerido | PK |
|---|---|---|---|---|
| PuntoNorma | Text | 255 | Si | PK |

### TbCacheNCProyecto

| Campo | Tipo | Tamaño | Requerido | PK |
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

| Campo | Tipo | Tamaño | Requerido | PK |
|---|---|---|---|---|
| Usuario | Text | 255 | Si | PK |
| UltimaConexion | Date/Time | 8 | No |  |
| UltimaDesconexion | Date/Time | 8 | No |  |
| InstaladoFW3 | Text | 2 | No |  |
| InstaladoFW4 | Text | 2 | No |  |
| Exitoso | Text | 2 | No |  |

### TbConsultasPorFechas

| Campo | Tipo | Tamaño | Requerido | PK |
|---|---|---|---|---|
| Descripcion | Text | 255 | Si | PK |

### TbCorreosEnviados

| Campo | Tipo | Tamaño | Requerido | PK |
|---|---|---|---|---|

### TbDocumentosAuditorias

| Campo | Tipo | Tamaño | Requerido | PK |
|---|---|---|---|---|
| IDDocumento | Long | 4 | Si | PK |
| IDNoConformidad | Long | 4 | No |  |
| Documento | Text | 255 | Si |  |
| NombreAnexo | Text | 255 | No |  |
| IDAccionRealizada | Long | 4 | No |  |
| IDAuditoria | Long | 4 | No |  |
| IDAuditoriaResultante | Long | 4 | No |  |

### TbExpedientes

| Campo | Tipo | Tamaño | Requerido | PK |
|---|---|---|---|---|

### TbExpedientesResponsables

| Campo | Tipo | Tamaño | Requerido | PK |
|---|---|---|---|---|

### TbHerramientaDocAyuda

| Campo | Tipo | Tamaño | Requerido | PK |
|---|---|---|---|---|
| NombreFormulario | Text | 255 | Si | PK |
| NombreArchivoAyuda | Text | 255 | Si | PK |

### TbLog

| Campo | Tipo | Tamaño | Requerido | PK |
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

| Campo | Tipo | Tamaño | Requerido | PK |
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

| Campo | Tipo | Tamaño | Requerido | PK |
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

| Campo | Tipo | Tamaño | Requerido | PK |
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

| Campo | Tipo | Tamaño | Requerido | PK |
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

| Campo | Tipo | Tamaño | Requerido | PK |
|---|---|---|---|---|
| ID | Long | 4 | Si | PK |
| IDAR | Long | 4 | No |  |
| IDCorreo15 | Long | 4 | No |  |
| IDCorreo7 | Long | 4 | No |  |
| IDCorreo0 | Long | 4 | No |  |
| Fecha | Date/Time | 8 | No |  |

### TbNCAuditoriaAccionCorrectivas

| Campo | Tipo | Tamaño | Requerido | PK |
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

| Campo | Tipo | Tamaño | Requerido | PK |
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

| Campo | Tipo | Tamaño | Requerido | PK |
|---|---|---|---|---|
| IDDocumento | Long | 4 | Si | PK |
| IDNoConformidad | Long | 4 | No |  |
| Documento | Text | 255 | Si |  |
| NombreAnexo | Text | 255 | No |  |
| IDAccionRealizada | Long | 4 | No |  |
| IDNoConformidadResultante | Long | 4 | No |  |

### TbNCInformacionRAC

| Campo | Tipo | Tamaño | Requerido | PK |
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

| Campo | Tipo | Tamaño | Requerido | PK |
|---|---|---|---|---|
| IDAnexoInformacionRAC | Long | 4 | Si | PK |
| IDInformacionRAC | Long | 4 | No |  |
| NombreArchivo | Text | 255 | No |  |
| FechaAnexo | Date/Time | 8 | No |  |

### TbNoConformidades

| Campo | Tipo | Tamaño | Requerido | PK |
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

### TbNoConformidades1

| Campo | Tipo | Tamaño | Requerido | PK |
|---|---|---|---|---|

### TbNoConformidadesAuditoria

| Campo | Tipo | Tamaño | Requerido | PK |
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

### TbNoConformidadesIngresoPorLotesDetalle

| Campo | Tipo | Tamaño | Requerido | PK |
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

| Campo | Tipo | Tamaño | Requerido | PK |
|---|---|---|---|---|
| IDLoteExcel | Long | 4 | Si | PK |
| FechaRegistro | Date/Time | 8 | No |  |
| URLCompletaOrigen | Text | 255 | No |  |
| NombreArchivoExcel | Text | 255 | No |  |
| FilaDatosInicial | Integer | 2 | No |  |
| Observaciones | Memo | - | No |  |

### TbNoConformidadesIngresoPorLotesTemporal

| Campo | Tipo | Tamaño | Requerido | PK |
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

| Campo | Tipo | Tamaño | Requerido | PK |
|---|---|---|---|---|
| IDReplanificacion | Long | 4 | Si | PK |
| IDNoConformidad | Long | 4 | Si |  |
| IDAccionRealizada | Long | 4 | Si |  |
| FechaReprogramacion | Date/Time | 8 | No |  |
| FechaPrevistaAlInicio | Date/Time | 8 | No |  |
| FechaPrevistaReplanificada | Date/Time | 8 | No |  |
| Observaciones | Memo | - | No |  |

### TbReplanificacionesProyecto

| Campo | Tipo | Tamaño | Requerido | PK |
|---|---|---|---|---|
| IDReplanificacion | Long | 4 | Si | PK |
| IDNoConformidad | Long | 4 | Si |  |
| IDAccionRealizada | Long | 4 | Si |  |
| FechaReprogramacion | Date/Time | 8 | No |  |
| FechaPrevistaAlInicio | Date/Time | 8 | No |  |
| FechaPrevistaReplanificada | Date/Time | 8 | No |  |
| Observaciones | Memo | - | No |  |

### TbRiesgos

| Campo | Tipo | Tamaño | Requerido | PK |
|---|---|---|---|---|

### TbRiesgosNC

| Campo | Tipo | Tamaño | Requerido | PK |
|---|---|---|---|---|

### TbTareasExplicaciones

| Campo | Tipo | Tamaño | Requerido | PK |
|---|---|---|---|---|
| NodoTarea | Text | 255 | Si | PK |
| TituloTarea | Text | 255 | No |  |
| Explicacion | Memo | - | No |  |

### TbTipologia

| Campo | Tipo | Tamaño | Requerido | PK |
|---|---|---|---|---|
| CodTipologia | Text | 2 | Si | PK |
| Tipologia | Text | 255 | No |  |

### TbTiposNCProyectos

| Campo | Tipo | Tamaño | Requerido | PK |
|---|---|---|---|---|
| IDTipo | Long | 4 | Si | PK |
| Tipologia | Text | 255 | No |  |

### TbUsuariosAplicaciones

| Campo | Tipo | Tamaño | Requerido | PK |
|---|---|---|---|---|

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

## Backends vinculados no alcanzados

Las siguientes bases de datos vinculadas no estaban disponibles al generar este ERD.
Sus tablas aparecen en el listado de tablas pero su estructura no pudo verificarse.

- `\\datoste\Aplicaciones_dys\Aplicaciones PpD\00Recursos\Tareas_datos.accdb` — tablas vinculadas: TbCorreosEnviados
- `\\datoste\aplicaciones_dys\Aplicaciones PpD\EXPEDIENTES\Expedientes_datos.accdb` — tablas vinculadas: TbExpedientes, TbExpedientesResponsables
- `\\datoste\aplicaciones_dys\Aplicaciones PpD\0Lanzadera\Lanzadera_Datos.accdb` — tablas vinculadas: TbUsuariosAplicaciones
- `C:\OneDrive\Telefonica\Aplicaciones_dys.TMETF - Aplicaciones PpD\No Conformidades\NoConformidades_Datos.accdb` — tablas vinculadas: TbNoConformidades1
- `\\datoste\aplicaciones_dys\Aplicaciones PpD\GESTION RIESGOS\Gestion_Riesgos_Datos.accdb` — tablas vinculadas: TbRiesgos, TbRiesgosNC

