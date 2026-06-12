-- ============================================================
-- MIGRACIÓN 011: Venta tipo ENVÍO (mayorista)
-- ============================================================
-- Un ENVÍO entrega la mercadería ahora y el cliente paga al recibir. El pago
-- puede ser por cualquier método (efectivo, tarjeta, transferencia, voucher) o
-- quedar a crédito (cuenta corriente). La diferencia con una venta normal es
-- CONTABLE: esa plata NO es de la caja del operador (la cobra el repartidor /
-- al recibir), así que no entra al arqueo del cierre, pero debe poder verse
-- por método al final del día.
--
-- 1. venta.EsEnvio: marca la venta como envío (fuente de verdad única).
-- 2. Grupos de pago dedicados para envío en registrodiariocaja (TipoGastoId=2):
--      11 = VENTA ENVÍO EFECTIVO
--      12 = VENTA ENVÍO POS
--      13 = VENTA ENVÍO VOUCHER
--      14 = VENTA ENVÍO TRANSFERENCIA
--    Así el cierre los separa del efectivo/POS/etc. de la caja física.
-- ============================================================

BEGIN;

ALTER TABLE venta ADD COLUMN IF NOT EXISTS EsEnvio CHAR(1) NOT NULL DEFAULT 'N';

INSERT INTO tipogastogrupo (TipoGastoId, TipoGastoGrupoId, TipoGastoGrupoDescripcion)
VALUES
  (2, 11, 'VENTA ENVÍO EFECTIVO'),
  (2, 12, 'VENTA ENVÍO POS'),
  (2, 13, 'VENTA ENVÍO VOUCHER'),
  (2, 14, 'VENTA ENVÍO TRANSFERENCIA')
ON CONFLICT DO NOTHING;

COMMIT;

-- ============================================================
-- VERIFICACIÓN
-- SELECT column_name FROM information_schema.columns WHERE table_name='venta' AND column_name='esenvio';
-- SELECT * FROM tipogastogrupo WHERE tipogastoid=2 ORDER BY tipogastogrupoid;
-- ============================================================
