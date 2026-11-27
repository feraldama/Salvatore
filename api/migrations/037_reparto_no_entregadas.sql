-- ============================================================
-- MIGRACIÓN 037: Ventas no entregadas en un reparto
-- ============================================================
-- En la recepción el ruteador marca las ventas que volvieron sin entregar
-- (cliente cerrado, pedido rechazado...). Esas ventas vuelven a PENDIENTE y
-- quedan libres (venta_envio.reparto_id = NULL) para salir en otro reparto.
--
-- Esta tabla guarda el historial: qué ventas de cada reparto no se
-- entregaron, para que el detalle y la hoja de carga del reparto las sigan
-- mostrando aunque la venta ya esté en otro reparto.
--
-- Las cajas no cambian: las de una venta no entregada vuelven llenas y se
-- cuentan igual que las vacías (ver 036).
--
-- Idempotente: se puede correr varias veces sin romper.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS reparto_venta_no_entregada (
  reparto_id     INTEGER    NOT NULL REFERENCES reparto(id) ON DELETE CASCADE,
  venta_id       INTEGER    NOT NULL REFERENCES venta(ventaid) ON DELETE CASCADE,
  registrado_en  TIMESTAMP  NOT NULL DEFAULT now(),
  PRIMARY KEY (reparto_id, venta_id)
);

CREATE INDEX IF NOT EXISTS idx_reparto_venta_no_entregada_venta
  ON reparto_venta_no_entregada(venta_id);

COMMIT;

-- ============================================================
-- VERIFICACIÓN
-- SELECT * FROM reparto_venta_no_entregada ORDER BY registrado_en DESC LIMIT 10;
-- ============================================================
