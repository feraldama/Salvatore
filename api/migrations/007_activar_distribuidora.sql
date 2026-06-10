-- ============================================================
-- MIGRACIÓN 007: Activación de la Distribuidora (empresa 2)
-- ============================================================
-- Estado previo (technow + multiempresa):
--   - almacen 1 "SALON"        (emp1, local 1) -> bodega minorista. 928 productos en stock.
--   - almacen 2 "DISTRIBUIDORA"(emp1, local 2) -> MAL asignado: figuraba en la
--     bodega (emp1) aunque su local 2 es de la distribuidora (emp2). 65 productos
--     en stock, TODOS los cuales ya existen también en el almacén 1.
--   - 0 ventas y 0 compras referencian al almacen 2 (seguro reasignarlo).
--
-- Objetivo (decisión del dueño): los productos/stock actuales son de la BODEGA;
-- el almacén "DISTRIBUIDORA" pasa a ser de la distribuidora (empresa 2), vacío.
--
-- Acciones:
--   1. Consolidar el stock del almacen 2 en el almacen 1 (bodega): como los 65
--      productos ya existen en el almacen 1, se SUMAN las cantidades y se borran
--      las filas del almacen 2.
--   2. Reasignar almacen 2 -> empresa 2 (queda ligado al local 2, ya emp2).
--   3. Crear una caja para la distribuidora.
-- Reversible: el snapshot de las 65 filas se imprime al ejecutar.
-- ============================================================

BEGIN;

-- 1. Consolidar stock del almacén 2 en el almacén 1 (bodega).
UPDATE productoalmacen pa1
   SET ProductoAlmacenStock         = pa1.ProductoAlmacenStock + pa2.ProductoAlmacenStock,
       ProductoAlmacenStockUnitario = pa1.ProductoAlmacenStockUnitario + pa2.ProductoAlmacenStockUnitario
  FROM productoalmacen pa2
 WHERE pa2.AlmacenId = 2
   AND pa1.AlmacenId = 1
   AND pa1.ProductoId = pa2.ProductoId;

DELETE FROM productoalmacen WHERE AlmacenId = 2;

-- 2. El almacén "DISTRIBUIDORA" pasa a ser de la distribuidora (empresa 2).
UPDATE almacen SET EmpresaId = 2 WHERE AlmacenId = 2;

-- 3. Caja para la distribuidora.
INSERT INTO caja (CajaDescripcion, CajaMonto, EmpresaId)
VALUES ('Caja Distribuidora', 0, 2);

COMMIT;

-- ============================================================
-- VERIFICACIÓN
-- SELECT AlmacenId, AlmacenNombre, EmpresaId, LocalId FROM almacen ORDER BY AlmacenId;
-- SELECT AlmacenId, COUNT(*) FROM productoalmacen GROUP BY AlmacenId;
-- SELECT * FROM caja WHERE EmpresaId = 2;
-- ============================================================
