-- ============================================================
-- MIGRACIÓN 015: Renumerar grupos de pago de ENVÍO 11-14 -> 7-10
-- ============================================================
-- La migración 011 creó los grupos de envío en 11-14 dejando un hueco (faltaban
-- 5,6, agregados en 014). Ahora la numeración de VENTA (TipoGastoId=2) queda
-- contigua: 1-6 = caja física, 7-10 = envío (cobrado por el móvil).
--      7  = VENTA ENVÍO EFECTIVO   (antes 11)
--      8  = VENTA ENVÍO POS        (antes 12)
--      9  = VENTA ENVÍO VOUCHER    (antes 13)
--      10 = VENTA ENVÍO TRANSFERENCIA (antes 14)
--
-- Hay un FK registrodiariocaja(tipogastoid,tipogastogrupoid) -> tipogastogrupo,
-- así que: 1) se crean los grupos 7-10, 2) se reapuntan los movimientos
-- existentes (11-14 -> 7-10), 3) se borran los grupos 11-14.
--
-- Idempotente y seguro en instalaciones nuevas (011 crea 11-14, 015 los remapea).
-- ============================================================

BEGIN;

-- 1. Crear los grupos nuevos 7-10.
INSERT INTO tipogastogrupo (TipoGastoId, TipoGastoGrupoId, TipoGastoGrupoDescripcion)
VALUES
  (2, 7,  'VENTA ENVÍO EFECTIVO'),
  (2, 8,  'VENTA ENVÍO POS'),
  (2, 9,  'VENTA ENVÍO VOUCHER'),
  (2, 10, 'VENTA ENVÍO TRANSFERENCIA')
ON CONFLICT DO NOTHING;

-- 2. Reapuntar los movimientos ya cargados (11->7, 12->8, 13->9, 14->10).
UPDATE registrodiariocaja
   SET TipoGastoGrupoId = TipoGastoGrupoId - 4
 WHERE TipoGastoId = 2 AND TipoGastoGrupoId IN (11, 12, 13, 14);

-- 3. Borrar los grupos viejos 11-14 (ya sin movimientos que los referencien).
DELETE FROM tipogastogrupo
 WHERE TipoGastoId = 2 AND TipoGastoGrupoId IN (11, 12, 13, 14);

COMMIT;

-- ============================================================
-- VERIFICACIÓN
-- SELECT * FROM tipogastogrupo WHERE tipogastoid=2 ORDER BY tipogastogrupoid;
-- ============================================================
