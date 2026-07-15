-- ============================================================
-- MIGRACIÓN 024: Estado del producto (dar de baja / descontinuar)
-- ============================================================
-- Permite "descontinuar" un producto sin borrarlo (imposible borrar los
-- que tienen ventas: ventaproducto tiene FK a producto). Un producto en
-- estado 'I' (Inactivo) desaparece del catálogo de venta (POS minorista y
-- mayorista) y de las alertas de reposición, pero se sigue viendo en
-- Gestión de Productos para poder reactivarlo.
--
--   'A' = Activo (default, se vende normalmente)
--   'I' = Inactivo / dado de baja (oculto para la venta)
--
-- Todos los productos existentes quedan Activos (DEFAULT 'A').
-- ============================================================

BEGIN;

ALTER TABLE producto
  ADD COLUMN IF NOT EXISTS ProductoEstado VARCHAR(1) NOT NULL DEFAULT 'A';

-- Índice parcial: acelera el filtro "solo activos" del catálogo de venta,
-- que es el caso mayoritario (los inactivos son la minoría).
CREATE INDEX IF NOT EXISTS idx_producto_estado_empresa
  ON producto(EmpresaId)
  WHERE ProductoEstado = 'A';

COMMIT;

-- ============================================================
-- VERIFICACIÓN
-- SELECT productoestado, COUNT(*) FROM producto GROUP BY productoestado;
-- ============================================================
