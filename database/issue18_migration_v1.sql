-- Issue #18 migration: add shared cache config table and missing domain fields
-- to existing TbCacheIndicadoresProyectoHeader / Detalle.
-- Target: NoConformidades_Datos.accdb (backend).
-- Idempotent by design: skips columns that already exist (handled in VBA wrapper).
-- This is a one-way forward migration.

-- 1) New config table that the contract requires.
CREATE TABLE TbCacheIndicadoresConfig (
    IDCacheConfig LONG NOT NULL,
    Dominio TEXT(32) NOT NULL,
    Activo YESNO NOT NULL,
    VersionRegla TEXT(64) NOT NULL,
    FechaConfiguracion DATETIME NOT NULL,
    UsuarioConfiguracion TEXT(255),
    CONSTRAINT PK_TbCacheIndicadoresConfig PRIMARY KEY (IDCacheConfig)
);

-- 2) Unique index required by the RED index test.
CREATE UNIQUE INDEX UX_TbCacheIndicadoresConfig_Dominio
ON TbCacheIndicadoresConfig (Dominio);

-- 3) Add missing columns to Header.
ALTER TABLE TbCacheIndicadoresProyectoHeader ADD COLUMN IDCacheConfig LONG;
ALTER TABLE TbCacheIndicadoresProyectoHeader ADD COLUMN Dominio TEXT(32);
ALTER TABLE TbCacheIndicadoresProyectoHeader ADD COLUMN VersionRegla TEXT(64);
ALTER TABLE TbCacheIndicadoresProyectoHeader ADD COLUMN MotivoSincronizacion TEXT(64);
ALTER TABLE TbCacheIndicadoresProyectoHeader ADD COLUMN IDNoConformidadUltimaSync LONG;
ALTER TABLE TbCacheIndicadoresProyectoHeader ADD COLUMN FechaUltimaSincronizacionNC DATETIME;
ALTER TABLE TbCacheIndicadoresProyectoHeader ADD COLUMN OperadorSync TEXT(64);

-- 4) Add missing columns to Detalle.
ALTER TABLE TbCacheIndicadoresProyectoDetalle ADD COLUMN IDCacheConfig LONG;
ALTER TABLE TbCacheIndicadoresProyectoDetalle ADD COLUMN Dominio TEXT(32);
ALTER TABLE TbCacheIndicadoresProyectoDetalle ADD COLUMN ClaveEntidad TEXT(128);
ALTER TABLE TbCacheIndicadoresProyectoDetalle ADD COLUMN IDTarea LONG;
ALTER TABLE TbCacheIndicadoresProyectoDetalle ADD COLUMN OrigenTabla TEXT(64);
ALTER TABLE TbCacheIndicadoresProyectoDetalle ADD COLUMN ResponsableUsuarioRed TEXT(255);
ALTER TABLE TbCacheIndicadoresProyectoDetalle ADD COLUMN DisplayTitulo TEXT(255);
ALTER TABLE TbCacheIndicadoresProyectoDetalle ADD COLUMN DisplaySubtitulo LONGTEXT;
ALTER TABLE TbCacheIndicadoresProyectoDetalle ADD COLUMN FechaActualizacionEntidad DATETIME;
ALTER TABLE TbCacheIndicadoresProyectoDetalle ADD COLUMN VersionRegla TEXT(64);
