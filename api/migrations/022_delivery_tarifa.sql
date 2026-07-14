-- ============================================================
-- MIGRACIÓN 022: Tarifas de DELIVERY (minorista) configurables
-- ============================================================
-- Regla de negocio: en una venta DELIVERY minorista se cobra un costo de envío
-- (default 10.000) que se suma al total. El cliente quiere poder agregar más
-- montos (15.000, 20.000…) según la distancia, sin tocar código. Para eso:
--
-- 1. delivery_tarifa: catálogo de tarifas por empresa (nombre + monto), con
--    `activo` y `orden` para listarlas/preseleccionar en la pantalla de venta.
--    La tarifa de menor `orden` es la default que se preselecciona al marcar
--    delivery. Convención snake_case minúscula (igual que venta_delivery);
--    fuera de columnMap.js a propósito.
-- 2. venta_delivery.costo_delivery: persiste el costo aplicado a ESA venta, así
--    la factura se puede reimprimir con la línea de delivery aun después.
-- 3. menu DELIVERYTARIFAS: código RBAC para la pantalla de administración de
--    tarifas (el frontend lo usa en Sidebar.tsx prop `permiso`).
--
-- Idempotente: se puede correr varias veces sin romper.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS delivery_tarifa (
  id         SERIAL      PRIMARY KEY,
  empresa_id INTEGER     NOT NULL REFERENCES empresa(empresaid),
  nombre     VARCHAR(60) NOT NULL,
  monto      BIGINT      NOT NULL DEFAULT 0,
  activo     CHAR(1)     NOT NULL DEFAULT 'S',
  orden      INTEGER     NOT NULL DEFAULT 0,
  creado_en  TIMESTAMP   NOT NULL DEFAULT now(),
  CONSTRAINT chk_delivery_tarifa_activo CHECK (activo IN ('S', 'N')),
  CONSTRAINT chk_delivery_tarifa_monto  CHECK (monto >= 0)
);

CREATE INDEX IF NOT EXISTS idx_delivery_tarifa_empresa
  ON delivery_tarifa (empresa_id, activo, orden);

-- Costo de delivery aplicado a la venta (0 = sin costo / venta no delivery).
ALTER TABLE venta_delivery
  ADD COLUMN IF NOT EXISTS costo_delivery BIGINT NOT NULL DEFAULT 0;

-- Seed: tarifa "Estándar" de 10.000 para cada empresa minorista que aún no
-- tenga tarifas cargadas (no pisa configuraciones existentes).
INSERT INTO delivery_tarifa (empresa_id, nombre, monto, activo, orden)
SELECT e.empresaid, 'Estándar', 10000, 'S', 0
  FROM empresa e
 WHERE e.empresatipo = 'M'
   AND NOT EXISTS (
     SELECT 1 FROM delivery_tarifa t WHERE t.empresa_id = e.empresaid
   );

INSERT INTO menu (MenuId, MenuNombre) VALUES
  ('DELIVERYTARIFAS', 'DELIVERYTARIFAS')
ON CONFLICT DO NOTHING;

COMMIT;

-- ============================================================
-- VERIFICACIÓN
-- SELECT * FROM delivery_tarifa ORDER BY empresa_id, orden;
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name='venta_delivery' AND column_name='costo_delivery';
-- SELECT * FROM menu WHERE menuid = 'DELIVERYTARIFAS';
-- ============================================================
