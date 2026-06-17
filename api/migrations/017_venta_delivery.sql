-- ============================================================
-- MIGRACIÓN 017: Venta por DELIVERY (minorista)
-- ============================================================
-- En minorista la venta es por defecto "en ventana" (mostrador). El cajero
-- puede marcarla como DELIVERY y elegir el CHOFER (usuario perfil CHOFER) que
-- la reparte. A diferencia del ENVÍO mayorista (migración 011), el delivery se
-- COBRA NORMAL en la caja del operador: NO cambia el flujo de caja ni los
-- grupos de pago. La única diferencia es de clasificación + seguimiento del
-- reparto, para poder separarlo en reportes.
--
-- 1. venta.EsDelivery: marca la venta como delivery ('S') vs ventana ('N',
--    default). Mutuamente excluyente con EsEnvio (minorista nunca envía).
-- 2. venta_delivery: el reparto se ata a un CHOFER (no a un vehículo, a
--    diferencia de venta_envio) y tiene su propio ciclo de vida, gestionado
--    desde una pantalla web del sistema:
--      PENDIENTE -> EN_RUTA -> ENTREGADO
--                            -> CANCELADO
--    Convención snake_case minúscula (igual que flota_* / venta_envio); fuera
--    de columnMap.js a propósito, no se remapea a PascalCase.
-- 3. menu DELIVERIES: código RBAC para dar acceso a la pantalla de gestión a
--    perfiles no-admin (el frontend lo usa en Sidebar.tsx prop `permiso`).
--
-- Idempotente: se puede correr varias veces sin romper.
-- ============================================================

BEGIN;

ALTER TABLE venta ADD COLUMN IF NOT EXISTS EsDelivery CHAR(1) NOT NULL DEFAULT 'N';

CREATE INDEX IF NOT EXISTS idx_venta_delivery
  ON venta (EmpresaId, EsDelivery);

CREATE TABLE IF NOT EXISTS venta_delivery (
  venta_id     INTEGER     PRIMARY KEY REFERENCES venta(ventaid) ON DELETE CASCADE,
  chofer_id    VARCHAR(20) NOT NULL REFERENCES usuario(usuarioid),
  estado       VARCHAR(12) NOT NULL DEFAULT 'PENDIENTE',
  entregado_en TIMESTAMP,
  creado_en    TIMESTAMP   NOT NULL DEFAULT now(),
  CONSTRAINT chk_venta_delivery_estado
    CHECK (estado IN ('PENDIENTE', 'EN_RUTA', 'ENTREGADO', 'CANCELADO'))
);

CREATE INDEX IF NOT EXISTS idx_venta_delivery_estado ON venta_delivery(estado);
CREATE INDEX IF NOT EXISTS idx_venta_delivery_chofer
  ON venta_delivery(chofer_id) WHERE estado IN ('PENDIENTE', 'EN_RUTA');

INSERT INTO menu (MenuId, MenuNombre) VALUES
  ('DELIVERIES', 'DELIVERIES')
ON CONFLICT DO NOTHING;

COMMIT;

-- ============================================================
-- VERIFICACIÓN
-- SELECT column_name FROM information_schema.columns WHERE table_name='venta' AND column_name='esdelivery';
-- SELECT * FROM venta_delivery ORDER BY creado_en DESC LIMIT 10;
-- SELECT * FROM menu WHERE menuid = 'DELIVERIES';
-- ============================================================
