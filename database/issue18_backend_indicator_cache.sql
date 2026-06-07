-- Issue #18 backend DDL: shared materialized indicator cache.
-- Run against NoConformidades_Datos.accdb, not the frontend.
-- TbConfiguracionBackends remains frontend/local and is intentionally untouched.
-- Logical scopes are separated by IDCacheIndicadorProyecto:
--   1 = Proyecto
--   2 = Auditoria
-- Table/field names keep the Proyecto legacy wording to avoid churn in the existing backend schema.

CREATE TABLE TbCacheIndicadoresConfig (
    IDCacheConfig LONG NOT NULL,
    Dominio TEXT(32) NOT NULL,
    Activo YESNO NOT NULL,
    VersionRegla TEXT(64) NOT NULL,
    FechaConfiguracion DATETIME NOT NULL,
    UsuarioConfiguracion TEXT(255),
    CONSTRAINT PK_TbCacheIndicadoresConfig PRIMARY KEY (IDCacheConfig)
);

CREATE UNIQUE INDEX UX_TbCacheIndicadoresConfig_Dominio
ON TbCacheIndicadoresConfig (Dominio);

CREATE TABLE TbCacheIndicadoresProyectoHeader (
    IDCacheIndicadorProyecto LONG NOT NULL,
    IDCacheConfig LONG NOT NULL,
    Dominio TEXT(32) NOT NULL,
    FechaSincronizacion DATETIME NOT NULL,
    UsuarioSincronizacion TEXT(255),
    Estado TEXT(50),
    VersionRegla TEXT(64),
    MotivoSincronizacion TEXT(64),
    IDNoConformidadUltimaSync LONG,
    FechaUltimaSincronizacionNC DATETIME,
    OperadorSync TEXT(64),
    ErrorUltimaSincronizacion LONGTEXT,
    CONSTRAINT PK_TbCacheIndicadoresProyectoHeader PRIMARY KEY (IDCacheIndicadorProyecto)
);

CREATE UNIQUE INDEX UX_TbCacheIndicadoresProyectoHeader_Dominio
ON TbCacheIndicadoresProyectoHeader (Dominio);

CREATE TABLE TbCacheIndicadoresProyectoDetalle (
    IDCacheDetalle COUNTER CONSTRAINT PK_TbCacheIndicadoresProyectoDetalle PRIMARY KEY,
    IDCacheIndicadorProyecto LONG NOT NULL,
    IDCacheConfig LONG NOT NULL,
    Dominio TEXT(32) NOT NULL,
    Bucket TEXT(64) NOT NULL,
    TipoFila TEXT(16) NOT NULL,
    IDEntidad LONG NOT NULL,
    ClaveEntidad TEXT(128),
    IDNoConformidad LONG,
    IDAccionCorrectiva LONG,
    IDAccionRealizada LONG,
    IDTarea LONG,
    OrigenTabla TEXT(64),
    ResponsableCalidad TEXT(255),
    ResponsableUsuarioRed TEXT(255),
    CodigoNoConformidad TEXT(255),
    Descripcion LONGTEXT,
    Nemotecnico TEXT(255),
    DisplayTitulo TEXT(255),
    DisplaySubtitulo LONGTEXT,
    Tarea LONGTEXT,
    Estado TEXT(255),
    Tecnico TEXT(255),
    TipoNC TEXT(255),
    IDExpediente LONG,
    NAccion TEXT(50),
    FechaInicio DATETIME,
    FechaFinPrevista DATETIME,
    FechaFinReal DATETIME,
    FechaCierre DATETIME,
    RequiereControlEficacia TEXT(50),
    ResultadoControlEficacia TEXT(255),
    FechaSnapshot DATETIME NOT NULL,
    FechaActualizacionEntidad DATETIME,
    VersionRegla TEXT(64)
);

CREATE INDEX IX_TbCacheIndicadoresProyectoDetalle_CacheBucketResponsable
ON TbCacheIndicadoresProyectoDetalle (Dominio, Bucket, ResponsableCalidad);

CREATE INDEX IX_TbCacheIndicadoresProyectoDetalle_CacheBucketUsuario
ON TbCacheIndicadoresProyectoDetalle (Dominio, Bucket, ResponsableUsuarioRed);

CREATE INDEX IX_TbCacheIndicadoresProyectoDetalle_NC
ON TbCacheIndicadoresProyectoDetalle (Dominio, IDNoConformidad);

CREATE INDEX IX_TbCacheIndicadoresProyectoDetalle_Entidad
ON TbCacheIndicadoresProyectoDetalle (Dominio, TipoFila, IDEntidad);

CREATE INDEX IX_TbCacheIndicadoresProyectoDetalle_AR
ON TbCacheIndicadoresProyectoDetalle (Dominio, IDAccionRealizada);

CREATE INDEX IX_TbCacheIndicadoresProyectoDetalle_Tarea
ON TbCacheIndicadoresProyectoDetalle (Dominio, IDTarea);
