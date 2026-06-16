-- ============================================================
-- MIGRACIÓN 014: Grupos de pago faltantes de VENTA (voucher y transferencia)
-- ============================================================
-- El controller de ventas (venta.controller.js) registra en registrodiariocaja
-- los pagos de ventas NORMALES (no envío) con estos grupos de TipoGastoId=2:
--      1 = VENTA (efectivo)        4 = VENTA POS (tarjeta)
--      3 = VENTA CRÉDITO           5 = VENTA VOUCHER  (faltaba)
--                                  6 = VENTA TRANSFERENCIA (faltaba)
-- Los grupos 5 y 6 nunca se habían insertado, pero existe un FK
--   registrodiariocaja(tipogastoid, tipogastogrupoid) -> tipogastogrupo
-- así que una venta de contado pagada con voucher/transferencia fallaba.
-- (En el proyecto, "voucher" = descuento.)
--
-- Los grupos de envío (11-14, migración 011) ya separan los pagos cobrados por
-- el repartidor de la caja física; estos 5 y 6 son los equivalentes de caja.
--
-- Idempotente.
-- ============================================================

BEGIN;

INSERT INTO tipogastogrupo (TipoGastoId, TipoGastoGrupoId, TipoGastoGrupoDescripcion)
VALUES
  (2, 5, 'VENTA VOUCHER'),
  (2, 6, 'VENTA TRANSFERENCIA')
ON CONFLICT DO NOTHING;

COMMIT;

-- ============================================================
-- VERIFICACIÓN
-- SELECT * FROM tipogastogrupo WHERE tipogastoid=2 ORDER BY tipogastogrupoid;
-- ============================================================
