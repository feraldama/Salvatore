-- ============================================================
-- MIGRACIÓN 016: Grupo de pago VENTA CUENTA CORRIENTE
-- ============================================================
-- Hasta ahora el saldo que una venta dejaba a crédito (cuentaCliente en el
-- frontend; "Cuenta de cliente" en minorista, "Cuenta corriente" en mayorista)
-- solo se anotaba en ventacredito y NO generaba ningún registro en
-- registrodiariocaja. Por eso el ticket de cierre de caja no podía mostrar
-- cuánto se vendió a cuenta durante el turno.
--
-- Se agrega el grupo 11 de TipoGastoId=2 para registrar ese saldo. Como el
-- crédito NO es dinero recibido, este grupo NUNCA entra a la caja física
-- (CajaMonto) ni a los ingresos en efectivo del cierre; es informativo.
--
-- Numeración de VENTA (TipoGastoId=2):
--      1-6  = caja física (efectivo, POS, voucher, transferencia...)
--      7-10 = envío (cobrado por el móvil)
--      11   = cuenta corriente (saldo a crédito)  <-- NUEVO
--
-- Existe un FK registrodiariocaja(tipogastoid, tipogastogrupoid) ->
-- tipogastogrupo, así que el grupo debe existir antes de insertar movimientos.
--
-- Idempotente.
-- ============================================================

BEGIN;

INSERT INTO tipogastogrupo (TipoGastoId, TipoGastoGrupoId, TipoGastoGrupoDescripcion)
VALUES
  (2, 11, 'VENTA CUENTA CORRIENTE')
ON CONFLICT DO NOTHING;

COMMIT;

-- ============================================================
-- VERIFICACIÓN
-- SELECT * FROM tipogastogrupo WHERE tipogastoid=2 ORDER BY tipogastogrupoid;
-- ============================================================
