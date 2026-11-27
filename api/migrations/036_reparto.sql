-- ============================================================
-- MIGRACIÓN 036: Repartos (hoja de carga + control de cajas)
-- ============================================================
-- Un REPARTO agrupa ventas de envío (venta_envio) que salen juntas en un
-- vehículo. Sirve para:
--   - la hoja de carga: productos y cajas retornables por tipo
--     (producto.ProductoTipoCaja, migración 035) que lleva el vehículo;
--   - el control del RUTEADOR (tablet): confirma la salida y, cuando vuelve
--     el vehículo, cuenta las cajas recibidas contra las que salieron.
--
-- Ciclo de vida:
--   ARMADO  -> la oficina lo arma y le asigna ventas
--   EN_RUTA -> el ruteador confirmó la salida (cajas_salida queda congelado)
--   RECIBIDO-> el ruteador contó las cajas al volver
--   ANULADO -> solo desde ARMADO; libera sus ventas
--
-- Retorno esperado = cajas que salieron: el cliente devuelve las vacías en
-- canje y las de ventas no entregadas vuelven llenas; ambas cuentan igual.
--
-- Convención snake_case como flota_* / venta_envio (contrato de la app
-- mobile; el adaptador PG no las remapea). viaje_id queda para enlazar el
-- viaje que el chofer inicie desde la app (fase futura).
--
-- Idempotente: se puede correr varias veces sin romper.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS reparto (
  id                     SERIAL       PRIMARY KEY,
  empresa_id             INTEGER      NOT NULL REFERENCES empresa(empresaid),
  fecha                  DATE         NOT NULL DEFAULT CURRENT_DATE,
  vehiculo_id            INTEGER      NOT NULL REFERENCES flota_vehiculo(id),
  chofer_id              VARCHAR(20)  REFERENCES usuario(usuarioid),
  estado                 VARCHAR(10)  NOT NULL DEFAULT 'ARMADO',
  observacion            TEXT,
  viaje_id               INTEGER      REFERENCES flota_viaje(id) ON DELETE SET NULL,
  creado_por             VARCHAR(20),
  creado_en              TIMESTAMP    NOT NULL DEFAULT now(),
  salida_en              TIMESTAMP,
  salida_por             VARCHAR(20),
  recepcion_en           TIMESTAMP,
  recepcion_por          VARCHAR(20),
  recepcion_observacion  TEXT,
  CONSTRAINT chk_reparto_estado
    CHECK (estado IN ('ARMADO', 'EN_RUTA', 'RECIBIDO', 'ANULADO'))
);

CREATE INDEX IF NOT EXISTS idx_reparto_empresa_estado
  ON reparto(empresa_id, estado);
CREATE INDEX IF NOT EXISTS idx_reparto_empresa_fecha
  ON reparto(empresa_id, fecha);

-- Cajas por tipo: se congelan al confirmar la salida; cajas_recibidas se
-- completa en la recepción (NULL = todavía no recibido).
CREATE TABLE IF NOT EXISTS reparto_caja (
  reparto_id       INTEGER     NOT NULL REFERENCES reparto(id) ON DELETE CASCADE,
  tipo_caja        VARCHAR(20) NOT NULL,
  cajas_salida     INTEGER     NOT NULL CHECK (cajas_salida >= 0),
  cajas_recibidas  INTEGER     CHECK (cajas_recibidas >= 0),
  PRIMARY KEY (reparto_id, tipo_caja)
);

-- Una venta va en un solo reparto.
ALTER TABLE venta_envio
  ADD COLUMN IF NOT EXISTS reparto_id INTEGER REFERENCES reparto(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_venta_envio_reparto ON venta_envio(reparto_id);

-- ------------------------------------------------------------
-- Permisos: REPARTOS (oficina) y CONTROLREPARTOS (ruteador)
-- ------------------------------------------------------------
INSERT INTO menu (MenuId, MenuNombre) VALUES
  ('REPARTOS',        'REPARTOS'),
  ('CONTROLREPARTOS', 'CONTROLREPARTOS')
ON CONFLICT (MenuId) DO NOTHING;

-- Perfil RUTEADOR (distribuidora = empresa 1).
-- La secuencia de perfil puede estar atrasada (datos venidos del snapshot de
-- technow con ids explícitos): se alinea al máximo antes de insertar.
SELECT setval(pg_get_serial_sequence('perfil', 'perfilid'),
              (SELECT MAX(perfilid) FROM perfil));
INSERT INTO perfil (PerfilDescripcion, EmpresaId)
SELECT 'RUTEADOR', 1
WHERE NOT EXISTS (
  SELECT 1 FROM perfil WHERE PerfilDescripcion = 'RUTEADOR' AND EmpresaId = 1
);

DELETE FROM perfilmenu
WHERE PerfilId = (SELECT MIN(PerfilId) FROM perfil WHERE PerfilDescripcion = 'RUTEADOR' AND EmpresaId = 1)
  AND MenuId = 'CONTROLREPARTOS';

INSERT INTO perfilmenu (PerfilId, MenuId, puedeCrear, puedeEditar, puedeEliminar, puedeLeer)
SELECT
  (SELECT MIN(PerfilId) FROM perfil WHERE PerfilDescripcion = 'RUTEADOR' AND EmpresaId = 1),
  'CONTROLREPARTOS',
  0,  -- crear
  1,  -- editar (confirmar salida / recepción)
  0,  -- eliminar
  1;  -- leer

COMMIT;

-- ============================================================
-- VERIFICACIÓN
-- SELECT * FROM reparto ORDER BY id DESC LIMIT 10;
-- SELECT p.PerfilDescripcion, pm.MenuId FROM perfilmenu pm
--   JOIN perfil p ON p.PerfilId = pm.PerfilId WHERE pm.MenuId LIKE '%REPARTOS';
-- ============================================================
