-- ============================================================
-- MIGRACIÓN 038: Corrección de la forma de pago de ventas de envío
-- ============================================================
-- Caso: un envío se confirma con 150.000 en transferencia y 100.000 en
-- efectivo "a cobrar al entregar" (grupo 7). Si al entregar el cliente
-- transfiere esos 100.000, el movimiento sigue diciendo efectivo y el chofer
-- aparece con faltante. El cajero corrige la forma de pago desde el detalle
-- del reparto: redistribuye lo cobrado entre efectivo / POS / voucher /
-- transferencia (grupos 7-10) sin cambiar el total.
--
-- Esta tabla guarda cada corrección: quién, cuándo, cómo estaba y cómo quedó.
-- Permiso nuevo (menú): CORREGIRCOBROENVIO, se asigna por perfil.
--
-- Idempotente: se puede correr varias veces sin romper.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS venta_pago_correccion (
  id            SERIAL     PRIMARY KEY,
  venta_id      INTEGER    NOT NULL REFERENCES venta(ventaid) ON DELETE CASCADE,
  reparto_id    INTEGER    REFERENCES reparto(id) ON DELETE SET NULL,
  usuario_id    VARCHAR(50),
  corregido_en  TIMESTAMP  NOT NULL DEFAULT now(),
  antes         JSONB      NOT NULL,
  despues       JSONB      NOT NULL,
  observacion   TEXT
);

CREATE INDEX IF NOT EXISTS idx_venta_pago_correccion_venta
  ON venta_pago_correccion(venta_id);

INSERT INTO menu (MenuId, MenuNombre) VALUES
  ('CORREGIRCOBROENVIO', 'CORREGIRCOBROENVIO')
ON CONFLICT (MenuId) DO NOTHING;

COMMIT;

-- ============================================================
-- VERIFICACIÓN
-- SELECT * FROM venta_pago_correccion ORDER BY corregido_en DESC LIMIT 10;
-- ============================================================
