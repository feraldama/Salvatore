-- ============================================================
-- MIGRACIÓN 020: Cobro DIFERIDO COMPLETO del delivery minorista
-- ============================================================
-- Cambio de regla del cliente: en una venta DELIVERY minorista, al DESPACHAR el
-- cajero NO carga ningún método de pago — solo registra la venta y el chofer. El
-- método/desglose de pago se carga RECIÉN al COBRAR, cuando el chofer vuelve.
--
-- Esto difiere TODO el cobro (no solo el efectivo, como en la migración 018):
-- nada entra a la caja al confirmar; toda la registración en caja
-- (registrodiariocaja + CajaMonto + ventacredito) ocurre en el endpoint de cobro
-- (POST /venta/deliveries/:id/cobrar) contra la caja abierta del cajero.
--
-- Columna nueva:
--   monto_pendiente : total de la venta a cobrar contra entrega (lo fija la
--                     confirmación; 0 una vez cobrado). Reemplaza a
--                     efectivo_pendiente como "monto a cobrar" (ahora se difiere
--                     el total, no solo el efectivo).
--
-- Backfill: los deliveries viejos (flujo 018) que todavía tienen efectivo
-- pendiente sin cobrar arrastran ese monto a monto_pendiente, así pasan a
-- cobrarse por el flujo nuevo de forma uniforme.
--
-- Idempotente.
-- ============================================================

BEGIN;

ALTER TABLE venta_delivery
  ADD COLUMN IF NOT EXISTS monto_pendiente BIGINT NOT NULL DEFAULT 0;

-- Backfill de deliveries pendientes creados con el flujo anterior (018): el
-- monto a cobrar pasa a ser el efectivo que quedó pendiente.
UPDATE venta_delivery
   SET monto_pendiente = efectivo_pendiente
 WHERE monto_pendiente = 0
   AND efectivo_pendiente > 0
   AND cobrado_en IS NULL;

COMMIT;

-- ============================================================
-- VERIFICACIÓN
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name='venta_delivery' AND column_name='monto_pendiente';
-- SELECT venta_id, monto_pendiente, efectivo_pendiente, cobrado_en
--   FROM venta_delivery ORDER BY creado_en DESC LIMIT 10;
-- ============================================================
