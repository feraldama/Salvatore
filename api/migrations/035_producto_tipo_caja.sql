-- ============================================================
-- MIGRACIÓN 035: Tipo de caja (envase retornable) del producto
-- ============================================================
-- Dato opcional para marcar en qué caja viene el producto. Se asigna solo a
-- los productos que lo necesitan; el resto queda en NULL (= "Ninguno").
--
--   'CERVEPAR'      = Caja Cervepar
--   'COCA'          = Caja Coca
--   '340'           = Caja 340
--   'MUNICH_POLAR'  = Caja Munich/Polar
--   '710_NEGRO'     = Caja 710 negro
--   '710_ROJO'      = Caja 710 rojo
--   '710_AZUL'      = Caja 710 azul
--
-- Todos los productos existentes quedan en NULL (Ninguno).
-- ============================================================

BEGIN;

ALTER TABLE producto
  ADD COLUMN IF NOT EXISTS ProductoTipoCaja VARCHAR(20) NULL;

ALTER TABLE producto DROP CONSTRAINT IF EXISTS chk_producto_tipo_caja;
ALTER TABLE producto
  ADD CONSTRAINT chk_producto_tipo_caja CHECK (
    ProductoTipoCaja IS NULL OR ProductoTipoCaja IN (
      'CERVEPAR', 'COCA', '340', 'MUNICH_POLAR',
      '710_NEGRO', '710_ROJO', '710_AZUL'
    )
  );

COMMIT;

-- ============================================================
-- VERIFICACIÓN
-- SELECT productotipocaja, COUNT(*) FROM producto GROUP BY productotipocaja;
-- ============================================================
