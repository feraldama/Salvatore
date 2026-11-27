-- ============================================================
-- MIGRACIÓN 039: Permisos del CAJERO para repartos
-- ============================================================
-- Decisión del cliente: los cajeros arman los repartos en la oficina y
-- corrigen la forma de pago de las ventas de envío.
--   REPARTOS            -> leer, crear, editar (armar, asignar ventas, anular)
--   CORREGIRCOBROENVIO  -> leer, editar (migración 038)
-- Se aplica a todo perfil llamado CAJERO. El RUTEADOR ya tiene
-- CONTROLREPARTOS (migración 036).
--
-- Idempotente: se puede correr varias veces sin romper.
-- ============================================================

BEGIN;

INSERT INTO perfilmenu (PerfilId, MenuId, puedeCrear, puedeEditar, puedeEliminar, puedeLeer)
SELECT p.PerfilId, m.menu, m.crear, m.editar, 0, 1
  FROM perfil p
 CROSS JOIN (VALUES
   ('REPARTOS',           1, 1),
   ('CORREGIRCOBROENVIO', 0, 1)
 ) AS m(menu, crear, editar)
 WHERE p.PerfilDescripcion = 'CAJERO'
ON CONFLICT (PerfilId, MenuId) DO UPDATE
   SET puedeCrear  = EXCLUDED.puedeCrear,
       puedeEditar = EXCLUDED.puedeEditar,
       puedeLeer   = 1;

COMMIT;

-- ============================================================
-- VERIFICACIÓN
-- SELECT p.PerfilDescripcion, pm.* FROM perfilmenu pm
--   JOIN perfil p ON p.PerfilId = pm.PerfilId
--  WHERE pm.MenuId IN ('REPARTOS', 'CORREGIRCOBROENVIO');
-- ============================================================
