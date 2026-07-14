-- ============================================================
-- MIGRACIÓN 023: Grupo de caja COSTO DELIVERY (informativo)
-- ============================================================
-- Al COBRAR un delivery (Venta.cobrarDelivery) el monto total entra a la caja
-- repartido en los grupos normales (1/3 efectivo, 4 POS, 5 voucher, 6
-- transferencia, 11 cuenta corriente). Para que el resumen de cierre pueda
-- desglosar cuánto de ese total correspondió al COSTO DE ENVÍO, se registra
-- además una fila informativa en el grupo 12.
--
-- Es informativo (igual que el 11): NO entra a la caja física (CajaMonto) ni se
-- suma a los ingresos del cierre —el costo ya está incluido en los grupos
-- anteriores—. Solo permite mostrarlo desglosado, y queda dentro del rango de
-- IDs de la sesión apertura→cierre (sin depender de timestamps).
--
-- Numeración de VENTA (TipoGastoId=2):
--      1-6  = caja física (efectivo, POS, voucher, transferencia...)
--      7-10 = envío (cobrado por el móvil)
--      11   = cuenta corriente (saldo a crédito)
--      12   = costo de delivery (informativo)            <-- NUEVO
--
-- Existe un FK registrodiariocaja(tipogastoid, tipogastogrupoid) ->
-- tipogastogrupo, así que el grupo debe existir antes de insertar movimientos.
--
-- Idempotente.
-- ============================================================

BEGIN;

INSERT INTO tipogastogrupo (TipoGastoId, TipoGastoGrupoId, TipoGastoGrupoDescripcion)
VALUES
  (2, 12, 'COSTO DELIVERY')
ON CONFLICT DO NOTHING;

COMMIT;

-- ============================================================
-- VERIFICACIÓN
-- SELECT * FROM tipogastogrupo WHERE tipogastoid=2 ORDER BY tipogastogrupoid;
-- ============================================================
