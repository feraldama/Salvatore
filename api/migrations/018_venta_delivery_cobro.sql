-- ============================================================
-- MIGRACIÓN 018: Cobro contra-entrega (efectivo) del delivery minorista
-- ============================================================
-- Regla del cliente: en una venta DELIVERY minorista, el EFECTIVO se cobra
-- recién cuando el repartidor vuelve. Por eso, a diferencia de una venta normal
-- (donde el efectivo entra a CajaMonto al confirmar), en el delivery el efectivo
-- queda PENDIENTE y entra a la caja del cajero cuando se marca ENTREGADO.
--
-- Los métodos NO-efectivo (POS, transferencia, voucher, cuenta corriente) se
-- cobran/registran normalmente al confirmar en el mostrador; solo el efectivo
-- se difiere.
--
-- Columnas nuevas en venta_delivery:
--   efectivo_pendiente : monto en efectivo a cobrar contra entrega (lo fija la
--                        confirmación de la venta; 0 si no hubo efectivo).
--   cobrado_en         : timestamp en que el efectivo entró a la caja (NULL si
--                        todavía no se cobró). Idempotencia: si ya está seteado,
--                        marcar ENTREGADO no vuelve a sumar a la caja.
--   cobro_caja_id      : caja a la que entró el efectivo (la que el cajero tenía
--                        abierta al registrar el regreso).
--   cobro_usuario_id   : usuario que registró el cobro.
--
-- Idempotente.
-- ============================================================

BEGIN;

ALTER TABLE venta_delivery
  ADD COLUMN IF NOT EXISTS efectivo_pendiente BIGINT      NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cobrado_en         TIMESTAMP,
  ADD COLUMN IF NOT EXISTS cobro_caja_id      INTEGER,
  ADD COLUMN IF NOT EXISTS cobro_usuario_id   VARCHAR(25);

COMMIT;

-- ============================================================
-- VERIFICACIÓN
-- SELECT column_name FROM information_schema.columns WHERE table_name='venta_delivery';
-- ============================================================
