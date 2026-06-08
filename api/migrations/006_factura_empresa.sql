-- ============================================================
-- MIGRACIÓN 006: EmpresaId en factura (timbrados por empresa)
-- ============================================================
-- La tabla `factura` guarda los timbrados / rangos de numeración legal
-- (FacturaTimbrado, FacturaDesde, FacturaHasta). Los timbrados se emiten por
-- unidad de facturación, así que cada empresa (minorista / distribuidora) tiene
-- los suyos. Antes la unicidad de timbrado y la validación de superposición de
-- rangos eran globales, lo que impedía que dos empresas usaran rangos que para
-- el fisco son independientes.
--
-- La tabla está vacía al momento de esta migración, así que el DEFAULT 1 no
-- afecta datos existentes. Aditiva y reversible (DROP COLUMN).
-- ============================================================

BEGIN;

ALTER TABLE factura
  ADD COLUMN IF NOT EXISTS EmpresaId INTEGER NOT NULL DEFAULT 1
    REFERENCES empresa(EmpresaId);

COMMIT;

-- ============================================================
-- VERIFICACIÓN
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'factura';
-- ============================================================
