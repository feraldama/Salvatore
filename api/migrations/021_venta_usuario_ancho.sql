-- ============================================================
-- MIGRACIÓN 021: Alinear columnas de UsuarioId a VARCHAR(25)
-- ============================================================
-- La PK usuario.UsuarioId es VARCHAR(25), pero varias columnas que almacenan un
-- UsuarioId quedaron más angostas que la PK, por lo que pueden desbordar:
--
--   venta.VentaUsuario            VARCHAR(12)  <- BUG ACTIVO
--   flota_asignacion.usuario_id   VARCHAR(20)
--   flota_carga_combustible.usuario_id  VARCHAR(20)
--   flota_documento_chofer.usuario_id   VARCHAR(20)
--   flota_ubicacion.usuario_id    VARCHAR(20)
--   flota_viaje.usuario_id        VARCHAR(20)
--   venta_delivery.chofer_id      VARCHAR(20)
--   venta_envio.chofer_id         VARCHAR(20)
--
-- Síntoma (el caso de 12): al confirmar una venta de un usuario cuyo UsuarioId
-- supera 12 caracteres, el INSERT INTO venta falla con:
--   error: el valor es demasiado largo para el tipo character varying(12)  (22001)
-- (api/controllers/venta.controller.js -> exports.confirmar, INSERT cabecera).
-- Las columnas de 20 tienen el mismo defecto latente para UsuarioId de 21-25.
--
-- Fix: alinear todas con el ancho de la FK usuario.UsuarioId (25). Ampliar el
-- ancho de un VARCHAR nunca trunca datos y es seguro aunque la columna tenga FK
-- (la PK referenciada también es VARCHAR(25)).
--
-- Idempotente: ALTER ... TYPE VARCHAR(25) es seguro de re-ejecutar.
-- ============================================================

BEGIN;

ALTER TABLE venta                   ALTER COLUMN VentaUsuario TYPE VARCHAR(25);
ALTER TABLE flota_asignacion        ALTER COLUMN usuario_id   TYPE VARCHAR(25);
ALTER TABLE flota_carga_combustible ALTER COLUMN usuario_id   TYPE VARCHAR(25);
ALTER TABLE flota_documento_chofer  ALTER COLUMN usuario_id   TYPE VARCHAR(25);
ALTER TABLE flota_ubicacion         ALTER COLUMN usuario_id   TYPE VARCHAR(25);
ALTER TABLE flota_viaje             ALTER COLUMN usuario_id   TYPE VARCHAR(25);
ALTER TABLE venta_delivery          ALTER COLUMN chofer_id    TYPE VARCHAR(25);
ALTER TABLE venta_envio             ALTER COLUMN chofer_id    TYPE VARCHAR(25);

COMMIT;

-- ============================================================
-- VERIFICACIÓN
-- SELECT table_name, column_name, character_maximum_length
--   FROM information_schema.columns
--  WHERE (table_name='venta' AND column_name='ventausuario')
--     OR column_name IN ('usuario_id','chofer_id')
--  ORDER BY table_name;
-- -> todas deben devolver 25
-- ============================================================
