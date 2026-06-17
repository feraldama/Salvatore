-- ============================================================
-- MIGRACIÓN 019: Permiso DELIVERIES para el perfil VENDEDOR
-- ============================================================
-- El vendedor de minorista debe poder ver la lista de deliveries pendientes a
-- cobrar y registrar el cobro cuando vuelve el repartidor. Le damos lectura +
-- edición sobre el menú DELIVERIES (creado en la migración 017). Los admin ya
-- ven todo sin necesidad de este permiso.
--
-- Idempotente: borra el permiso previo del VENDEDOR sobre DELIVERIES y lo
-- vuelve a insertar.
-- ============================================================

BEGIN;

DELETE FROM perfilmenu
WHERE PerfilId = (SELECT PerfilId FROM perfil WHERE PerfilDescripcion = 'VENDEDOR')
  AND MenuId = 'DELIVERIES';

INSERT INTO perfilmenu (PerfilId, MenuId, puedeCrear, puedeEditar, puedeEliminar, puedeLeer)
SELECT
  (SELECT PerfilId FROM perfil WHERE PerfilDescripcion = 'VENDEDOR'),
  'DELIVERIES',
  0,  -- crear
  1,  -- editar (cambiar estado / cobrar)
  0,  -- eliminar
  1   -- leer
WHERE EXISTS (SELECT 1 FROM perfil WHERE PerfilDescripcion = 'VENDEDOR');

COMMIT;

-- ============================================================
-- VERIFICACIÓN
-- SELECT p.PerfilDescripcion, pm.MenuId, pm.puedeLeer, pm.puedeEditar
--   FROM perfilmenu pm JOIN perfil p ON pm.PerfilId = p.PerfilId
--  WHERE pm.MenuId = 'DELIVERIES';
-- ============================================================
