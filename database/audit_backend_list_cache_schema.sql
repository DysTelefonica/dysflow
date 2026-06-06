-- One-time backend DDL artifact for issue #57 / audit-backend-list-cache Slice 1.
-- Already applied through Dysflow to NoConformidades_Datos.accdb.
-- Do not rerun blindly: use NCAuditoriaListadoCache.EnsureNCAuditoriaListadoCacheSchema for idempotent additive enforcement.
CREATE TABLE TbCacheListadoNCAuditoria (ID LONG);
ALTER TABLE TbCacheListadoNCAuditoria ADD COLUMN IDAuditoria LONG;
ALTER TABLE TbCacheListadoNCAuditoria ADD COLUMN Tipo TEXT(255);
ALTER TABLE TbCacheListadoNCAuditoria ADD COLUMN Numero TEXT(255);
ALTER TABLE TbCacheListadoNCAuditoria ADD COLUMN Descripcion LONGTEXT;
ALTER TABLE TbCacheListadoNCAuditoria ADD COLUMN CAUSARAIZ LONGTEXT;
ALTER TABLE TbCacheListadoNCAuditoria ADD COLUMN RESPONSABLEIMPLANTACION TEXT(255);
ALTER TABLE TbCacheListadoNCAuditoria ADD COLUMN Estado TEXT(255);
ALTER TABLE TbCacheListadoNCAuditoria ADD COLUMN FechaApertura DATETIME;
ALTER TABLE TbCacheListadoNCAuditoria ADD COLUMN FECHACIERRE DATETIME;
ALTER TABLE TbCacheListadoNCAuditoria ADD COLUMN RequiereControlEficacia TEXT(25);
ALTER TABLE TbCacheListadoNCAuditoria ADD COLUMN ControlEficacia LONGTEXT;
ALTER TABLE TbCacheListadoNCAuditoria ADD COLUMN Notas LONGTEXT;
ALTER TABLE TbCacheListadoNCAuditoria ADD COLUMN Cerrada TEXT(10);
ALTER TABLE TbCacheListadoNCAuditoria ADD COLUMN Borrado YESNO;
ALTER TABLE TbCacheListadoNCAuditoria ADD COLUMN AccionesCorrectivasConcatenadas LONGTEXT;
ALTER TABLE TbCacheListadoNCAuditoria ADD COLUMN AccionesRealizadasConcatenadas LONGTEXT;
ALTER TABLE TbCacheListadoNCAuditoria ADD COLUMN FechaCache DATETIME;
ALTER TABLE TbCacheListadoNCAuditoria ADD COLUMN CacheValida YESNO;
ALTER TABLE TbCacheListadoNCAuditoria ADD COLUMN Version LONG;
CREATE UNIQUE INDEX PK_TbCacheListadoNCAuditoria ON TbCacheListadoNCAuditoria (ID);
CREATE INDEX IX_TbCacheListadoNCAuditoria_AuditoriaValida ON TbCacheListadoNCAuditoria (IDAuditoria, CacheValida);
CREATE INDEX IX_TbCacheListadoNCAuditoria_EstadoValida ON TbCacheListadoNCAuditoria (Estado, CacheValida);
