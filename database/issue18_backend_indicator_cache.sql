-- Issue #18 backend DDL: shared materialized indicator cache.
-- Run against NoConformidades_Datos.accdb, not the frontend.
-- TbConfiguracionBackends remains frontend/local and is intentionally untouched.
-- Logical scopes are separated by IDCacheIndicadorProyecto:
--   1 = Proyecto
--   2 = Auditoria
-- Table/field names keep the Proyecto legacy wording to avoid churn in the existing backend schema.

CREATE TABLE TbCacheIndicadoresProyectoHeader (
    IDCacheIndicadorProyecto LONG NOT NULL,
    FechaSincronizacion DATETIME NOT NULL,
    UsuarioSincronizacion TEXT(255),
    Estado TEXT(50),
    ErrorUltimaSincronizacion LONGTEXT,
    CONSTRAINT PK_TbCacheIndicadoresProyectoHeader PRIMARY KEY (IDCacheIndicadorProyecto)
);

CREATE TABLE TbCacheIndicadoresProyectoDetalle (
    IDCacheDetalle COUNTER CONSTRAINT PK_TbCacheIndicadoresProyectoDetalle PRIMARY KEY,
    IDCacheIndicadorProyecto LONG NOT NULL,
    Bucket TEXT(64) NOT NULL,
    TipoFila TEXT(16) NOT NULL,
    IDEntidad LONG NOT NULL,
    IDNoConformidad LONG,
    IDAccionCorrectiva LONG,
    IDAccionRealizada LONG,
    ResponsableCalidad TEXT(255),
    CodigoNoConformidad TEXT(255),
    Descripcion LONGTEXT,
    Nemotecnico TEXT(255),
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
    FechaSnapshot DATETIME NOT NULL
);

CREATE INDEX IX_TbCacheIndicadoresProyectoDetalle_CacheBucketResponsable
ON TbCacheIndicadoresProyectoDetalle (IDCacheIndicadorProyecto, Bucket, ResponsableCalidad);

CREATE INDEX IX_TbCacheIndicadoresProyectoDetalle_NC
ON TbCacheIndicadoresProyectoDetalle (IDNoConformidad);

CREATE INDEX IX_TbCacheIndicadoresProyectoDetalle_AR
ON TbCacheIndicadoresProyectoDetalle (IDAccionRealizada);
