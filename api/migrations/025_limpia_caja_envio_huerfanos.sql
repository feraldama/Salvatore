-- ============================================================
-- MIGRACIÓN 025: Limpia movimientos de caja huérfanos de ENVÍO/DELIVERY
-- ============================================================
-- Al anular una venta, la reversión de caja buscaba los detalles exactos sin
-- sufijo ("Venta N°: X", "Venta POS N°: X", ...). Los movimientos de envío y
-- delivery se insertan con sufijo (" (ENVÍO)" / " (DELIVERY)") y el costo de
-- envío como "Costo Delivery N°: X", así que al anular esas ventas los
-- movimientos quedaban huérfanos en registrodiariocaja e inflaban el resumen
-- de cierre de caja mayorista (Ingresos ENVIOS mostraba más efectivo que el
-- reporte de envíos por móvil, que sí cruza contra venta).
--
-- El fix de código (venta.controller.js, exports.delete) ya borra las
-- variantes con sufijo al anular. Esta migración elimina los huérfanos que
-- quedaron de anulaciones anteriores: movimientos con sufijo ENVÍO/DELIVERY
-- (o Costo Delivery) cuyo N° de venta ya no existe en venta.
--
-- No toca caja.CajaMonto: el efectivo de envío nunca entró a la caja física
-- (lo cobra el móvil) y los demás grupos afectados (10 transferencia envío,
-- 11 cuenta corriente, 12 costo delivery) tampoco suman a CajaMonto.
--
-- Idempotente: la segunda corrida no encuentra filas.
-- ============================================================

BEGIN;

DELETE FROM registrodiariocaja r
 WHERE (r.registrodiariocajadetalle LIKE '%(ENVÍO)'
     OR r.registrodiariocajadetalle LIKE '%(DELIVERY)'
     OR r.registrodiariocajadetalle LIKE 'Costo Delivery N°:%')
   AND NOT EXISTS (
         SELECT 1 FROM venta v
          WHERE v.ventaid = CAST(
                  substring(r.registrodiariocajadetalle from 'N°:\s*([0-9]+)')
                  AS INTEGER)
       );

COMMIT;

-- ============================================================
-- VERIFICACIÓN: no debe quedar ninguna fila
-- SELECT r.registrodiariocajaid, r.registrodiariocajadetalle, r.registrodiariocajamonto
--   FROM registrodiariocaja r
--   LEFT JOIN venta v ON v.ventaid = CAST(substring(r.registrodiariocajadetalle from 'N°:\s*([0-9]+)') AS INTEGER)
--  WHERE (r.registrodiariocajadetalle LIKE '%(ENVÍO)' OR r.registrodiariocajadetalle LIKE '%(DELIVERY)')
--    AND v.ventaid IS NULL;
-- ============================================================
