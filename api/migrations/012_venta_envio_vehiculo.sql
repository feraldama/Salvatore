-- ============================================================
-- MIGRACIÓN 012: Vehículo asignado al ENVÍO (venta_envio)
-- ============================================================
-- Al confirmar una venta tipo ENVÍO (venta.EsEnvio = 'S', migración 011) se
-- elige con qué vehículo de la flota sale la mercadería. Se guarda en una
-- tabla aparte (y no como columnas de venta) porque el envío tiene su propio
-- ciclo de vida, que la app mobile de flota va a manejar:
--   PENDIENTE -> EN_RUTA (chofer inicia viaje) -> ENTREGADO (cobra/entrega)
--                                              -> CANCELADO
--
-- Convención de nombres: snake_case minúsculas, igual que las tablas flota_*
-- (contrato esperado por la app Mobile; el adaptador PG no las remapea a
-- PascalCase porque no figuran en columnMap.js).
--
-- chofer_id queda NULL al crear el envío: se deriva de flota_asignacion /
-- flota_viaje cuando el chofer toma el reparto desde la app.
--
-- Idempotente: se puede correr varias veces sin romper.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS venta_envio (
  venta_id     INTEGER     PRIMARY KEY REFERENCES venta(ventaid) ON DELETE CASCADE,
  vehiculo_id  INTEGER     NOT NULL REFERENCES flota_vehiculo(id),
  chofer_id    VARCHAR(20) REFERENCES usuario(usuarioid),
  estado       VARCHAR(12) NOT NULL DEFAULT 'PENDIENTE',
  viaje_id     INTEGER     REFERENCES flota_viaje(id) ON DELETE SET NULL,
  entregado_en TIMESTAMP,
  creado_en    TIMESTAMP   NOT NULL DEFAULT now(),
  CONSTRAINT chk_venta_envio_estado
    CHECK (estado IN ('PENDIENTE', 'EN_RUTA', 'ENTREGADO', 'CANCELADO'))
);

CREATE INDEX IF NOT EXISTS idx_venta_envio_vehiculo
  ON venta_envio(vehiculo_id) WHERE estado IN ('PENDIENTE', 'EN_RUTA');
CREATE INDEX IF NOT EXISTS idx_venta_envio_estado ON venta_envio(estado);

COMMIT;

-- ============================================================
-- VERIFICACIÓN
-- SELECT * FROM venta_envio ORDER BY creado_en DESC LIMIT 10;
-- ============================================================
