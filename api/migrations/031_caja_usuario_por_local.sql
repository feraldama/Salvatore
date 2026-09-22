-- ============================================================
-- MIGRACIÓN 031: UNA CAJA POR CAJERO **POR SUCURSAL**
-- ============================================================
-- Corrige una restricción de la 029 que dejaba sin salida al caso que originó
-- todo este trabajo.
--
-- La 029 puso un índice único sobre caja.UsuarioId: un cajero, UNA caja en todo
-- el sistema. Sumado a que la terminal (030) exige que la caja sea de la
-- sucursal donde está el equipo, el cajero que va a cubrir a otra bodega queda
-- trabado: no puede usar su caja (es de su sucursal) y tampoco se le puede dar
-- una de la bodega donde está, porque el índice lo impide. La única salida era
-- reasignarle la caja a mano cada vez y revertirlo al día siguiente — un paso
-- manual diario, o sea un paso que tarde o temprano se saltea quitándole el
-- dueño a la caja y volviendo al selector que veníamos a eliminar.
--
-- El modelo correcto es un cajero con UNA caja POR SUCURSAL. "Mi caja" deja de
-- ser una constante y pasa a ser "mi caja donde estoy parado": el sistema la
-- resuelve con la sucursal de la terminal. Isaac se sienta en CENTRAL y opera
-- con su caja de CENTRAL; vuelve a SUCURSAL y opera con la de SUCURSAL. Sin
-- elegir, sin pedir permiso y sin que nadie tenga que acordarse de nada.
--
-- De paso se indexa sobre el valor recortado: la columna es VARCHAR(25) y todas
-- las consultas comparan con TRIM(UsuarioId), así que con el índice sobre el
-- valor crudo 'marlis' y 'marlis ' pasaban como dos dueños distintos.
-- Idempotente.
-- ============================================================

BEGIN;

DROP INDEX IF EXISTS caja_usuarioid_uniq;

-- btrim es IMMUTABLE, así que se puede indexar la expresión.
CREATE UNIQUE INDEX IF NOT EXISTS caja_usuario_local_uniq
  ON caja (TRIM(UsuarioId), LocalId)
  WHERE UsuarioId IS NOT NULL;

COMMIT;

-- ============================================================
-- VERIFICACIÓN
-- Cajas por cajero y sucursal (un cajero puede figurar en varias filas, pero
-- nunca dos veces en la misma sucursal):
--   SELECT TRIM(c.usuarioid) AS cajero, l.localnombre, c.cajadescripcion
--     FROM caja c JOIN local l ON l.localid = c.localid
--    WHERE c.usuarioid IS NOT NULL
--    ORDER BY cajero, l.localnombre;
-- Cajeros que pueden trabajar en más de una sucursal:
--   SELECT TRIM(usuarioid) AS cajero, count(*) AS sucursales
--     FROM caja WHERE usuarioid IS NOT NULL
--    GROUP BY TRIM(usuarioid) HAVING count(*) > 1;
-- ============================================================
