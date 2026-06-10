-- ============================================================
-- MIGRACIÓN 009: Capa de SCOPE POR LOCAL (sucursal/bodega)
-- ============================================================
-- Modelo adoptado: empresa = unidad de negocio (Minorista vs Distribuidora);
-- local = sucursal/bodega; almacén = depósito dentro del local. El catálogo y
-- los precios se comparten a nivel EMPRESA; el stock es por ALMACÉN y las
-- ventas/cajas se aíslan por LOCAL. Esto habilita agregar más bodegas (cada
-- una un local nuevo de la empresa Minorista) sin duplicar catálogo.
--
-- Esta migración prepara los DATOS para que el backend pueda filtrar por local:
--   1. caja.LocalId         -> cada caja pertenece a una sucursal.
--   2. consolidar ventas legacy del almacén 0 (TODOS) en el almacén 1 (SALON).
--   3. reconciliar producto.ProductoStock global con la suma por almacén.
--   4. trigger: el almacén siempre hereda la empresa de su local (coherencia).
-- Idempotente.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. caja.LocalId
-- ------------------------------------------------------------
ALTER TABLE caja
  ADD COLUMN IF NOT EXISTS LocalId INTEGER REFERENCES local(LocalId);

-- Backfill: las cajas existentes de la empresa 1 son de la bodega actual
-- (local SALON = 1); la caja de la distribuidora va al local 2.
UPDATE caja SET LocalId = 1 WHERE EmpresaId = 1 AND LocalId IS NULL;
UPDATE caja SET LocalId = 2 WHERE EmpresaId = 2 AND LocalId IS NULL;

-- ------------------------------------------------------------
-- 2. Consolidar ventas del almacén 0 (TODOS) en el almacén 1 (SALON)
--    Todo el historial es de la bodega actual (decisión registrada en la 007).
--    Sin esto, el filtrado por local de la bodega dejaría 1328 ventas afuera.
-- ------------------------------------------------------------
UPDATE venta SET AlmacenId = 1 WHERE AlmacenId = 0;

-- ------------------------------------------------------------
-- 3. Reconciliar el stock global con la suma por almacén
--    producto.ProductoStock / ProductoStockUnitario estaban divergidos de
--    productoalmacen (p.ej. producto 1116 = -1). El stock real vive en
--    productoalmacen; la columna global pasa a ser el TOTAL de la empresa.
-- ------------------------------------------------------------
UPDATE producto p
   SET ProductoStock         = COALESCE(s.cajas, 0),
       ProductoStockUnitario = COALESCE(s.unid, 0)
  FROM (
    SELECT productoid,
           SUM(productoalmacenstock)         AS cajas,
           SUM(productoalmacenstockunitario) AS unid
      FROM productoalmacen
     GROUP BY productoid
  ) s
 WHERE p.productoid = s.productoid
   AND (p.ProductoStock <> COALESCE(s.cajas, 0)
     OR p.ProductoStockUnitario <> COALESCE(s.unid, 0));

-- Productos sin ninguna fila en productoalmacen: stock global a 0.
UPDATE producto p
   SET ProductoStock = 0, ProductoStockUnitario = 0
 WHERE NOT EXISTS (SELECT 1 FROM productoalmacen pa WHERE pa.productoid = p.productoid)
   AND (p.ProductoStock <> 0 OR p.ProductoStockUnitario <> 0);

-- ------------------------------------------------------------
-- 4. Coherencia almacén↔local↔empresa
--    Un almacén siempre pertenece a la empresa de su local. El trigger lo
--    fuerza en cada INSERT/UPDATE para que no puedan divergir desde los CRUD.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_almacen_hereda_empresa() RETURNS trigger AS $$
BEGIN
  IF NEW.LocalId IS NOT NULL THEN
    SELECT EmpresaId INTO NEW.EmpresaId FROM local WHERE LocalId = NEW.LocalId;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS almacen_hereda_empresa ON almacen;
CREATE TRIGGER almacen_hereda_empresa
  BEFORE INSERT OR UPDATE ON almacen
  FOR EACH ROW EXECUTE FUNCTION trg_almacen_hereda_empresa();

COMMIT;

-- ============================================================
-- VERIFICACIÓN
-- SELECT cajaid, cajadescripcion, empresaid, localid FROM caja ORDER BY cajaid;
-- SELECT almacenid, COUNT(*) FROM venta GROUP BY almacenid;        -- almacén 0 debe quedar en 0
-- SELECT COUNT(*) FROM producto p WHERE p.empresaid=1 AND p.productostock <>
--   COALESCE((SELECT SUM(productoalmacenstock) FROM productoalmacen pa WHERE pa.productoid=p.productoid),0);
-- ============================================================
