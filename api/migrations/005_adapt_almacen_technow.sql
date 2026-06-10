-- ============================================================
-- MIGRACIÓN 005: Adaptar almacén↔local sobre los datos de technow
-- ============================================================
-- En technow, almacen y local son espejos (mismos IDs):
--   0=TODOS, 1=SALON, 2=FUERA STOCK
-- Las ~400k ventas y productoalmacen ya referencian esos AlmacenId.
-- Para acoplar al modelo "un almacén pertenece a un local" SIN romper
-- esas referencias, mapeamos almacen.LocalId = almacen.AlmacenId.
-- (Reemplaza la lógica de la 004, que era específica del seed de dev.)
-- ============================================================

BEGIN;

-- 1. almacen.LocalId (la 002 ya agregó EmpresaId)
ALTER TABLE almacen
  ADD COLUMN IF NOT EXISTS LocalId INTEGER REFERENCES local(LocalId);

-- 2. Espejo: cada almacén pertenece al local con su mismo Id.
UPDATE almacen SET LocalId = AlmacenId
 WHERE LocalId IS DISTINCT FROM AlmacenId;

-- 3. Un almacén por local.
CREATE UNIQUE INDEX IF NOT EXISTS uq_almacen_local
  ON almacen(LocalId)
  WHERE LocalId IS NOT NULL;

COMMIT;

-- ============================================================
-- VERIFICACIÓN
-- SELECT a.AlmacenId, a.AlmacenNombre, a.LocalId, l.LocalNombre
--   FROM almacen a LEFT JOIN local l ON a.LocalId = l.LocalId ORDER BY a.AlmacenId;
-- ============================================================
