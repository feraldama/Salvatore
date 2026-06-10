-- ============================================================
-- MIGRACIÓN 004: Separar Almacén de Local (relación correcta)
-- ============================================================
-- Establece la relación "un local tiene un almacén":
--   - almacen.LocalId  → a qué local pertenece el depósito
--   - UNIQUE(LocalId)  → un solo almacén por local
-- Crea un almacén por cada local existente y reasigna el
-- "Depósito Central" huérfano al primer local.
-- Seguro: no hay productos, stock ni ventas (base limpia).
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. almacen.LocalId
-- ------------------------------------------------------------
ALTER TABLE almacen
  ADD COLUMN IF NOT EXISTS LocalId INTEGER REFERENCES local(LocalId);

-- ------------------------------------------------------------
-- 2. Reasignar el "Depósito Central" existente (id 1) al
--    local MAYORISTA (id 1) y renombrarlo coherentemente.
-- ------------------------------------------------------------
UPDATE almacen
   SET LocalId = 1,
       AlmacenNombre = 'Depósito SALVATORE MAYORISTA',
       EmpresaId = (SELECT EmpresaId FROM local WHERE LocalId = 1)
 WHERE AlmacenId = 1;

-- ------------------------------------------------------------
-- 3. Crear un almacén para cada local que aún no tenga uno.
--    (Genera "Depósito <NombreLocal>" heredando la empresa del local.)
-- ------------------------------------------------------------
INSERT INTO almacen (AlmacenNombre, EmpresaId, LocalId)
SELECT 'Depósito ' || l.LocalNombre, l.EmpresaId, l.LocalId
  FROM local l
 WHERE NOT EXISTS (
   SELECT 1 FROM almacen a WHERE a.LocalId = l.LocalId
 );

-- ------------------------------------------------------------
-- 4. Forzar "un almacén por local" con índice único.
--    (Permite múltiples NULL por si en el futuro hay almacenes
--     sin local, pero impide dos almacenes para el mismo local.)
-- ------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uq_almacen_local
  ON almacen(LocalId)
  WHERE LocalId IS NOT NULL;

COMMIT;

-- ============================================================
-- VERIFICACIÓN
-- ============================================================
-- SELECT a.AlmacenId, a.AlmacenNombre, a.LocalId, l.LocalNombre, a.EmpresaId
--   FROM almacen a LEFT JOIN local l ON a.LocalId = l.LocalId
--  ORDER BY a.AlmacenId;
-- ============================================================
