-- ============================================================================
-- Migración 001 — Integración app Mobile (flota): viaje+combustible (chofer) y
-- control de flota (gerente). Reutiliza usuario/perfil existentes de Salvatore.
--
-- Convención de nombres: tablas/columnas en snake_case minúsculas. El adaptador
-- PG de Salvatore (config/db.js) sólo renombra a PascalCase las columnas que
-- figuran en columnMap.js; estas tablas NO están ahí, así que se devuelven tal
-- cual — que es justo el contrato (snake_case) que espera la app Mobile.
--
-- Idempotente: se puede correr varias veces sin romper.
-- ============================================================================

BEGIN;

-- ── Roles vía perfiles existentes ──────────────────────────────────────────
-- La app gatea por rol_codigo (CHOFER, GERENTE_DE_OPERACIONES). Derivamos el
-- código desde PerfilDescripcion (upper + espacios->'_'). Agregamos los dos
-- perfiles que faltan; si ya existen, no se duplican.
INSERT INTO perfil (perfildescripcion)
SELECT 'CHOFER'
WHERE NOT EXISTS (SELECT 1 FROM perfil WHERE upper(perfildescripcion) = 'CHOFER');

INSERT INTO perfil (perfildescripcion)
SELECT 'GERENTE DE OPERACIONES'
WHERE NOT EXISTS (
  SELECT 1 FROM perfil WHERE upper(perfildescripcion) = 'GERENTE DE OPERACIONES'
);

-- ── Vehículos ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS flota_vehiculo (
  id          SERIAL PRIMARY KEY,
  chapa       VARCHAR(20)  NOT NULL,
  marca       VARCHAR(60),
  modelo      VARCHAR(60),
  km_actual   NUMERIC(12,1) NOT NULL DEFAULT 0,
  activo      BOOLEAN      NOT NULL DEFAULT true,
  creado_en   TIMESTAMP    NOT NULL DEFAULT now()
);

-- ── Asignación chofer ↔ vehículo ──────────────────────────────────────────
-- usuario_id es VARCHAR porque la PK de usuario (UsuarioId) lo es.
CREATE TABLE IF NOT EXISTS flota_asignacion (
  id          SERIAL PRIMARY KEY,
  vehiculo_id INTEGER     NOT NULL REFERENCES flota_vehiculo(id) ON DELETE CASCADE,
  usuario_id  VARCHAR(20) NOT NULL REFERENCES usuario(usuarioid) ON DELETE CASCADE,
  activo      BOOLEAN     NOT NULL DEFAULT true,
  creado_en   TIMESTAMP   NOT NULL DEFAULT now(),
  UNIQUE (vehiculo_id, usuario_id)
);
CREATE INDEX IF NOT EXISTS idx_flota_asignacion_usuario ON flota_asignacion(usuario_id) WHERE activo;

-- ── Viajes ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS flota_viaje (
  id            SERIAL PRIMARY KEY,
  usuario_id    VARCHAR(20) NOT NULL REFERENCES usuario(usuarioid),
  vehiculo_id   INTEGER     NOT NULL REFERENCES flota_vehiculo(id),
  estado        VARCHAR(10) NOT NULL DEFAULT 'ABIERTO',  -- ABIERTO | CERRADO
  inicio_en     TIMESTAMP   NOT NULL DEFAULT now(),
  fin_en        TIMESTAMP,
  lat_inicio    NUMERIC(10,7),
  lng_inicio    NUMERIC(10,7),
  acc_inicio_m  NUMERIC(8,2),
  lat_fin       NUMERIC(10,7),
  lng_fin       NUMERIC(10,7),
  acc_fin_m     NUMERIC(8,2),
  km_inicio     NUMERIC(12,1),
  km_fin        NUMERIC(12,1),
  km_recorridos NUMERIC(12,1),
  creado_en     TIMESTAMP   NOT NULL DEFAULT now()
);
-- Un solo viaje ABIERTO por chofer a la vez.
CREATE UNIQUE INDEX IF NOT EXISTS uq_flota_viaje_abierto
  ON flota_viaje(usuario_id) WHERE estado = 'ABIERTO';
CREATE INDEX IF NOT EXISTS idx_flota_viaje_estado ON flota_viaje(estado);

-- ── Ubicaciones GPS (pings de viaje) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS flota_ubicacion (
  id            SERIAL PRIMARY KEY,
  viaje_id      INTEGER     REFERENCES flota_viaje(id) ON DELETE CASCADE,
  usuario_id    VARCHAR(20) NOT NULL REFERENCES usuario(usuarioid),
  lat           NUMERIC(10,7) NOT NULL,
  lng           NUMERIC(10,7) NOT NULL,
  acc_m         NUMERIC(8,2),
  capturado_en  TIMESTAMP   NOT NULL,
  creado_en     TIMESTAMP   NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_flota_ubicacion_viaje ON flota_ubicacion(viaje_id);
CREATE INDEX IF NOT EXISTS idx_flota_ubicacion_capturado ON flota_ubicacion(capturado_en);

-- ── Cargas de combustible (con fotos: tablero + factura) ────────────────────
CREATE TABLE IF NOT EXISTS flota_carga_combustible (
  id                     SERIAL PRIMARY KEY,
  viaje_id               INTEGER     REFERENCES flota_viaje(id) ON DELETE SET NULL,
  vehiculo_id            INTEGER     NOT NULL REFERENCES flota_vehiculo(id),
  usuario_id             VARCHAR(20) NOT NULL REFERENCES usuario(usuarioid),
  km_odometro            NUMERIC(12,1),
  litros                 NUMERIC(10,2),
  monto                  NUMERIC(14,2),
  moneda_codigo          INTEGER,
  tablero_path           VARCHAR(255),
  tablero_lat            NUMERIC(10,7),
  tablero_lng            NUMERIC(10,7),
  tablero_acc_m          NUMERIC(8,2),
  tablero_capturado_en   TIMESTAMP,
  factura_path           VARCHAR(255),
  factura_lat            NUMERIC(10,7),
  factura_lng            NUMERIC(10,7),
  factura_acc_m          NUMERIC(8,2),
  factura_capturado_en   TIMESTAMP,
  creado_en              TIMESTAMP   NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_flota_carga_usuario ON flota_carga_combustible(usuario_id);
CREATE INDEX IF NOT EXISTS idx_flota_carga_viaje ON flota_carga_combustible(viaje_id);

-- ── Mantenimientos programados (para "pendientes" y "atención requerida") ───
CREATE TABLE IF NOT EXISTS flota_mantenimiento (
  id            SERIAL PRIMARY KEY,
  vehiculo_id   INTEGER     NOT NULL REFERENCES flota_vehiculo(id) ON DELETE CASCADE,
  titulo        VARCHAR(120) NOT NULL,
  km_proximo    NUMERIC(12,1),
  fecha_proxima DATE,
  ultimo_km     NUMERIC(12,1),
  ultima_fecha  DATE,
  activo        BOOLEAN     NOT NULL DEFAULT true
);
CREATE INDEX IF NOT EXISTS idx_flota_mant_vehiculo ON flota_mantenimiento(vehiculo_id) WHERE activo;

-- ── Documentos del vehículo (seguro, RUA, patente, habilitación) ────────────
CREATE TABLE IF NOT EXISTS flota_documento (
  id           SERIAL PRIMARY KEY,
  vehiculo_id  INTEGER     NOT NULL REFERENCES flota_vehiculo(id) ON DELETE CASCADE,
  tipo         VARCHAR(20) NOT NULL,  -- SEGURO | RUA | PATENTE | HABILITACION | OTRO
  vencimiento  DATE,
  activo       BOOLEAN     NOT NULL DEFAULT true
);
CREATE INDEX IF NOT EXISTS idx_flota_doc_vehiculo ON flota_documento(vehiculo_id) WHERE activo;

-- ── Documentos del chofer (licencia, curso defensivo, habilitación) ─────────
CREATE TABLE IF NOT EXISTS flota_documento_chofer (
  id           SERIAL PRIMARY KEY,
  usuario_id   VARCHAR(20) NOT NULL REFERENCES usuario(usuarioid) ON DELETE CASCADE,
  tipo         VARCHAR(20) NOT NULL,  -- LICENCIA | CURSO_DEFENSIVO | HABILITACION | OTRO
  vencimiento  DATE,
  activo       BOOLEAN     NOT NULL DEFAULT true
);
CREATE INDEX IF NOT EXISTS idx_flota_docchofer_usuario ON flota_documento_chofer(usuario_id) WHERE activo;

-- ── Configuración del módulo (fila única id=1) ──────────────────────────────
CREATE TABLE IF NOT EXISTS flota_config (
  id                          INTEGER PRIMARY KEY DEFAULT 1,
  permanencia_umbral_minutos  INTEGER NOT NULL DEFAULT 15,
  permanencia_radio_metros    INTEGER NOT NULL DEFAULT 100,
  ubicacion_intervalo_segundos INTEGER NOT NULL DEFAULT 60,
  permanencia_rol_alerta      VARCHAR(40) NOT NULL DEFAULT 'GERENTE_DE_OPERACIONES',
  gps_obligatorio             BOOLEAN NOT NULL DEFAULT true,
  ubicacion_retencion_dias    INTEGER NOT NULL DEFAULT 90,
  CONSTRAINT flota_config_single CHECK (id = 1)
);
INSERT INTO flota_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

COMMIT;
