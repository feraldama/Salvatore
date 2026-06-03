-- ============================================================================
-- Schema de reconstrucción — Base de datos: salvatore
-- Basado en: código fuente del proyecto + estructura exacta de BD "technow"
-- Fecha: 2026-06-03
--
-- DIFERENCIAS respecto a technow (tablas que salvatore NO tiene):
--   asistencia, plan, suscripcion, pago  → son del módulo gym, no distribuidora
--
-- DIFERENCIAS respecto a technow (tablas que salvatore SÍ tiene extra):
--   flota_*  → módulo mobile agregado via migración 001_flota.sql
--
-- INSTRUCCIONES:
--   1. Crear la base de datos:
--        CREATE DATABASE salvatore;
--   2. Conectarse y ejecutar este script:
--        \c salvatore
--        \i salvatore_schema.sql
-- ============================================================================

-- ── Tablas base (sin dependencias) ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS local (
  LocalId        SERIAL           PRIMARY KEY,
  LocalNombre    VARCHAR(30)  NOT NULL DEFAULT '',
  LocalTelefono  VARCHAR(20)  NOT NULL DEFAULT '',
  LocalCelular   VARCHAR(20)  NOT NULL DEFAULT '',
  LocalDireccion VARCHAR(1024) NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS almacen (
  AlmacenId     SERIAL       PRIMARY KEY,
  AlmacenNombre VARCHAR(30)  NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS caja (
  CajaId          SERIAL      PRIMARY KEY,
  CajaDescripcion VARCHAR(30) NOT NULL DEFAULT '',
  CajaMonto       BIGINT      NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS proveedor (
  ProveedorId        SERIAL        PRIMARY KEY,
  ProveedorRUC       VARCHAR(20)   NOT NULL DEFAULT '',
  ProveedorNombre    VARCHAR(30)   NOT NULL DEFAULT '',
  ProveedorDireccion VARCHAR(1024) NOT NULL DEFAULT '',
  ProveedorTelefono  VARCHAR(20)   NOT NULL DEFAULT ''
);

-- MenuId es VARCHAR (no SERIAL) — confirmado en technow
CREATE TABLE IF NOT EXISTS menu (
  MenuId     VARCHAR(25) PRIMARY KEY  DEFAULT '',
  MenuNombre VARCHAR(30) NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS perfil (
  PerfilId          SERIAL      PRIMARY KEY,
  PerfilDescripcion VARCHAR(30) NOT NULL DEFAULT ''
);

-- UsuarioId es VARCHAR(25) — confirmado en technow
-- UsuarioIsAdmin y UsuarioEstado son VARCHAR(1), no CHAR/BOOLEAN
CREATE TABLE IF NOT EXISTS usuario (
  UsuarioId         VARCHAR(25)  PRIMARY KEY  DEFAULT '',
  UsuarioContrasena VARCHAR(100) NOT NULL DEFAULT '',
  UsuarioNombre     VARCHAR(30)  NOT NULL DEFAULT '',
  UsuarioApellido   VARCHAR(30)  NOT NULL DEFAULT '',
  UsuarioCorreo     VARCHAR(100) NOT NULL DEFAULT '',
  UsuarioIsAdmin    VARCHAR(1)   NOT NULL DEFAULT '',  -- 'S' | 'N'
  UsuarioEstado     VARCHAR(1)   NOT NULL DEFAULT '',  -- 'A' | 'I'
  LocalId           INTEGER      NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS vendedor (
  VendedorId        SERIAL        PRIMARY KEY,
  VendedorNombre    VARCHAR(30)   NOT NULL DEFAULT '',
  VendedorApellido  VARCHAR(30)   NOT NULL DEFAULT '',
  VendedorTelefono  VARCHAR(20)   NOT NULL DEFAULT '',
  VendedorDireccion VARCHAR(1024) NOT NULL DEFAULT ''
);

-- ── Permisos por perfil ───────────────────────────────────────────────────────
-- MenuId es VARCHAR(25) — igual que en tabla menu
CREATE TABLE IF NOT EXISTS perfilmenu (
  PerfilId      INTEGER     NOT NULL DEFAULT 0,
  MenuId        VARCHAR(25) NOT NULL DEFAULT '',
  puedeCrear    SMALLINT    NOT NULL DEFAULT 0,
  puedeEditar   SMALLINT    NOT NULL DEFAULT 0,
  puedeEliminar SMALLINT    NOT NULL DEFAULT 0,
  puedeLeer     SMALLINT    NOT NULL DEFAULT 0,
  PRIMARY KEY (PerfilId, MenuId)
);

-- ── Asignación usuario ↔ perfil ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS usuarioperfil (
  UsuarioId VARCHAR(25) NOT NULL DEFAULT '',
  PerfilId  INTEGER     NOT NULL DEFAULT 0,
  PRIMARY KEY (UsuarioId, PerfilId)
);

-- ── Clientes ──────────────────────────────────────────────────────────────────
-- Nota: technow tiene ClienteFechaNacimiento — puede existir también en salvatore
CREATE TABLE IF NOT EXISTS clientes (
  ClienteId          SERIAL        PRIMARY KEY,
  ClienteRUC         VARCHAR(20)   NOT NULL DEFAULT '',
  ClienteRazonSocial VARCHAR(61)   NOT NULL DEFAULT '',
  ClienteNombre      VARCHAR(30)   NOT NULL DEFAULT '',
  ClienteApellido    VARCHAR(30)   NOT NULL DEFAULT '',
  ClienteDireccion   VARCHAR(1024) NOT NULL DEFAULT '',
  ClienteTelefono    VARCHAR(20)   NOT NULL DEFAULT '',
  ClienteTipo        VARCHAR(2)    NOT NULL DEFAULT '',
  UsuarioId          VARCHAR(25)   DEFAULT NULL,
  ClienteFechaNacimiento DATE       NOT NULL DEFAULT '1900-01-01'
);

-- ── Tipos de gasto y grupos ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tipogasto (
  TipoGastoId          SERIAL      PRIMARY KEY,
  TipoGastoDescripcion VARCHAR(30) NOT NULL DEFAULT '',
  TipoGastoCantGastos  SMALLINT    NOT NULL DEFAULT 0
);

-- PK compuesta. TipoGastoGrupoId es SMALLINT
CREATE TABLE IF NOT EXISTS tipogastogrupo (
  TipoGastoId               INTEGER     NOT NULL DEFAULT 0,
  TipoGastoGrupoId          SMALLINT    NOT NULL DEFAULT 0,
  TipoGastoGrupoDescripcion VARCHAR(30) NOT NULL DEFAULT '',
  PRIMARY KEY (TipoGastoId, TipoGastoGrupoId)
);

-- ── Facturas (timbrados) ──────────────────────────────────────────────────────
-- FacturaTimbrado es INTEGER en technow (no VARCHAR)
CREATE TABLE IF NOT EXISTS factura (
  FacturaId       SERIAL   PRIMARY KEY,
  FacturaTimbrado INTEGER  NOT NULL DEFAULT 0,
  FacturaDesde    INTEGER  NOT NULL DEFAULT 0,
  FacturaHasta    INTEGER  NOT NULL DEFAULT 0
);

-- ── Crédito de compras ────────────────────────────────────────────────────────
-- Tiene FK a compra (confirmado en technow: campo CompraId)
CREATE TABLE IF NOT EXISTS facturacredito (
  FacturaCreditoId      SERIAL   PRIMARY KEY,
  CompraId              INTEGER  NOT NULL DEFAULT 0,
  FacturaCreditoPagoCant SMALLINT NOT NULL DEFAULT 0
);

-- ── Pagos de crédito de compras ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS facturacreditopago (
  FacturaCreditoId       INTEGER  NOT NULL DEFAULT 0,
  FacturaCreditoPagoId   SMALLINT NOT NULL DEFAULT 0,
  FacturaCreditoPagoFecha DATE    NOT NULL DEFAULT '1900-01-01',
  FacturaCreditoPagoMonto BIGINT  NOT NULL DEFAULT 0,
  PRIMARY KEY (FacturaCreditoId, FacturaCreditoPagoId)
);

-- ── Productos ─────────────────────────────────────────────────────────────────
-- Precios en BIGINT (Guaraníes, sin decimales)
-- ProductoCodigo es BIGINT (no VARCHAR)
-- ProductoImagen: BYTEA con default vacío
CREATE TABLE IF NOT EXISTS producto (
  ProductoId                  SERIAL       PRIMARY KEY,
  ProductoCodigo              BIGINT       NOT NULL DEFAULT 0,
  ProductoNombre              VARCHAR(50)  NOT NULL DEFAULT '',
  ProductoPrecioVenta         BIGINT       NOT NULL DEFAULT 0,
  ProductoPrecioVentaMayorista BIGINT      NOT NULL DEFAULT 0,
  ProductoPrecioUnitario      BIGINT       NOT NULL DEFAULT 0,
  ProductoPrecioPromedio      NUMERIC(11,2) NOT NULL DEFAULT 0,
  ProductoStock               INTEGER      NOT NULL DEFAULT 0,
  ProductoStockUnitario       INTEGER      NOT NULL DEFAULT 0,
  ProductoCantidadCaja        INTEGER      NOT NULL DEFAULT 0,
  ProductoIVA                 SMALLINT     NOT NULL DEFAULT 0,
  ProductoStockMinimo         INTEGER      NOT NULL DEFAULT 0,
  ProductoImagen              BYTEA        NOT NULL DEFAULT '\x',
  ProductoImagen_GXI          VARCHAR(2048)         DEFAULT NULL,
  LocalId                     INTEGER      NOT NULL DEFAULT 0
);

-- ── Stock de producto por almacén ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS productoalmacen (
  ProductoId               INTEGER NOT NULL DEFAULT 0,
  AlmacenId                INTEGER NOT NULL DEFAULT 0,
  ProductoAlmacenStock     INTEGER NOT NULL DEFAULT 0,
  ProductoAlmacenStockUnitario INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (ProductoId, AlmacenId)
);

-- ── Combos ────────────────────────────────────────────────────────────────────
-- ComboCantidad es INTEGER, ComboPrecio es BIGINT
CREATE TABLE IF NOT EXISTS combo (
  ComboId          SERIAL      PRIMARY KEY,
  ComboDescripcion VARCHAR(50) NOT NULL DEFAULT '',
  ProductoId       INTEGER     NOT NULL DEFAULT 0,
  ComboCantidad    INTEGER     NOT NULL DEFAULT 0,
  ComboPrecio      BIGINT      NOT NULL DEFAULT 0
);

-- ── Compras ───────────────────────────────────────────────────────────────────
-- CompraFactura es BIGINT (número de factura del proveedor)
-- CompraPagoCompleto es VARCHAR(1) — 'S'/'N', no boolean
-- CompraEntrega es NUMERIC(11,2)
-- CompracantidadProductos es SMALLINT
CREATE TABLE IF NOT EXISTS compra (
  CompraId               SERIAL        PRIMARY KEY,
  CompraFecha            TIMESTAMP     NOT NULL DEFAULT '1900-01-01 00:00:00',
  ProveedorId            INTEGER       NOT NULL DEFAULT 0,
  UsuarioId              VARCHAR(25)   DEFAULT NULL,
  CompraFactura          BIGINT        NOT NULL DEFAULT 0,
  CompraTipo             VARCHAR(2)    NOT NULL DEFAULT '',  -- 'CO' | 'CR'
  CompraPagoCompleto     VARCHAR(1)    NOT NULL DEFAULT '',  -- 'S' | 'N'
  CompraEntrega          NUMERIC(11,2) NOT NULL DEFAULT 0,
  CompraCantidadProductos SMALLINT     NOT NULL DEFAULT 0
);

-- ── Detalle de productos en compra ────────────────────────────────────────────
-- CompraProductoId es SMALLINT
CREATE TABLE IF NOT EXISTS compraproducto (
  CompraId                     INTEGER      NOT NULL DEFAULT 0,
  CompraProductoId             SMALLINT     NOT NULL DEFAULT 0,
  ProductoId                   INTEGER      NOT NULL DEFAULT 0,
  CompraProductoCantidad       INTEGER      NOT NULL DEFAULT 0,
  CompraProductoCantidadUnidad VARCHAR(1)   NOT NULL DEFAULT '',  -- 'C' | 'U'
  CompraProductoBonificacion   INTEGER      NOT NULL DEFAULT 0,
  CompraProductoPrecio         NUMERIC(11,2) NOT NULL DEFAULT 0,
  AlmacenOrigenId              INTEGER      NOT NULL DEFAULT 0,
  PRIMARY KEY (CompraId, CompraProductoId)
);

-- ── Ventas ────────────────────────────────────────────────────────────────────
-- Total y VentaEntrega son BIGINT (Guaraníes)
-- VentaTimbrado y VentaNroFactura son INTEGER
-- VentaUsuario es VARCHAR(12) en technow
-- VentaId en technow no tiene secuencia; para salvatore usamos SERIAL
CREATE TABLE IF NOT EXISTS venta (
  VentaId               SERIAL      PRIMARY KEY,
  VentaFecha            TIMESTAMP   NOT NULL DEFAULT '1900-01-01 00:00:00',
  ClienteId             INTEGER     NOT NULL DEFAULT 0,
  AlmacenId             INTEGER     NOT NULL DEFAULT 0,
  VentaTipo             VARCHAR(2)  NOT NULL DEFAULT '',  -- 'CO'|'CR'|'PO'|'TR'
  VentaPagoTipo         VARCHAR(1)  NOT NULL DEFAULT '',
  VentaCantidadProductos SMALLINT   NOT NULL DEFAULT 0,
  VentaUsuario          VARCHAR(25) NOT NULL DEFAULT '',  -- FK a usuario
  VentaNroFactura       INTEGER     NOT NULL DEFAULT 0,
  VentaTimbrado         INTEGER     NOT NULL DEFAULT 0,
  Total                 BIGINT      NOT NULL DEFAULT 0,
  VentaEntrega          BIGINT      NOT NULL DEFAULT 0,
  VentaNroPOS           INTEGER     NOT NULL DEFAULT 0
);

-- ── Crédito de venta ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ventacredito (
  VentaCreditoId      SERIAL   PRIMARY KEY,
  VentaId             INTEGER  NOT NULL DEFAULT 0,
  VentaCreditoPagoCant SMALLINT NOT NULL DEFAULT 0
);

-- ── Pagos de crédito de venta ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ventacreditopago (
  VentaCreditoId        INTEGER  NOT NULL DEFAULT 0,
  VentaCreditoPagoId    SMALLINT NOT NULL DEFAULT 0,
  VentaCreditoPagoFecha DATE     NOT NULL DEFAULT '1900-01-01',
  VentaCreditoPagoMonto BIGINT   NOT NULL DEFAULT 0,
  PRIMARY KEY (VentaCreditoId, VentaCreditoPagoId)
);

-- ── Detalle de productos en venta ─────────────────────────────────────────────
-- Precios en BIGINT. VentaProductoId SMALLINT.
CREATE TABLE IF NOT EXISTS ventaproducto (
  VentaId                    INTEGER     NOT NULL DEFAULT 0,
  VentaProductoId            SMALLINT    NOT NULL DEFAULT 0,
  ProductoId                 INTEGER     NOT NULL DEFAULT 0,
  VentaProductoPrecioPromedio BIGINT     NOT NULL DEFAULT 0,
  VentaProductoCantidad      INTEGER     NOT NULL DEFAULT 0,
  VentaProductoPrecio        BIGINT      NOT NULL DEFAULT 0,
  VentaProductoPrecioTotal   BIGINT      NOT NULL DEFAULT 0,
  VentaProductoUnitario      VARCHAR(1)  NOT NULL DEFAULT '',  -- 'C' | 'U'
  PRIMARY KEY (VentaId, VentaProductoId)
);

-- ── Traslados de stock entre almacenes ────────────────────────────────────────
-- TrasladoFecha es DATE (no TIMESTAMP) — confirmado en technow
CREATE TABLE IF NOT EXISTS traslado (
  TrasladoId       SERIAL      PRIMARY KEY,
  TrasladoFecha    DATE        NOT NULL DEFAULT '1900-01-01',
  ProductoId       INTEGER     NOT NULL DEFAULT 0,
  TrasladoCantidad INTEGER     NOT NULL DEFAULT 0,
  AlmacenOrigenId  INTEGER     NOT NULL DEFAULT 0,
  AlmacenDestinoId INTEGER     NOT NULL DEFAULT 0,
  UsuarioId        VARCHAR(25) DEFAULT NULL
);

-- ── Registros diarios de caja ─────────────────────────────────────────────────
-- RegistroDiarioCajaMonto es BIGINT, Detalle VARCHAR(50), GrupoId SMALLINT
CREATE TABLE IF NOT EXISTS registrodiariocaja (
  RegistroDiarioCajaId      SERIAL      PRIMARY KEY,
  CajaId                    INTEGER     NOT NULL DEFAULT 0,
  RegistroDiarioCajaFecha   TIMESTAMP   NOT NULL DEFAULT '1900-01-01 00:00:00',
  TipoGastoId               INTEGER     NOT NULL DEFAULT 0,
  TipoGastoGrupoId          SMALLINT    NOT NULL DEFAULT 0,
  RegistroDiarioCajaDetalle VARCHAR(50) NOT NULL DEFAULT '',
  RegistroDiarioCajaMonto   BIGINT      NOT NULL DEFAULT 0,
  UsuarioId                 VARCHAR(25) DEFAULT NULL
);


-- ============================================================================
-- Tablas de Flota (módulo mobile) — snake_case
-- Solo en salvatore, no en technow
-- ============================================================================

CREATE TABLE IF NOT EXISTS flota_vehiculo (
  id        SERIAL        PRIMARY KEY,
  chapa     VARCHAR(20)   NOT NULL,
  marca     VARCHAR(60),
  modelo    VARCHAR(60),
  km_actual NUMERIC(12,1) NOT NULL DEFAULT 0,
  activo    BOOLEAN       NOT NULL DEFAULT true,
  creado_en TIMESTAMP     NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS flota_asignacion (
  id          SERIAL      PRIMARY KEY,
  vehiculo_id INTEGER     NOT NULL REFERENCES flota_vehiculo(id) ON DELETE CASCADE,
  usuario_id  VARCHAR(25) NOT NULL,
  activo      BOOLEAN     NOT NULL DEFAULT true,
  creado_en   TIMESTAMP   NOT NULL DEFAULT now(),
  UNIQUE (vehiculo_id, usuario_id)
);
CREATE INDEX IF NOT EXISTS idx_flota_asignacion_usuario ON flota_asignacion(usuario_id) WHERE activo;

CREATE TABLE IF NOT EXISTS flota_viaje (
  id            SERIAL      PRIMARY KEY,
  usuario_id    VARCHAR(25) NOT NULL,
  vehiculo_id   INTEGER     NOT NULL REFERENCES flota_vehiculo(id),
  estado        VARCHAR(10) NOT NULL DEFAULT 'ABIERTO',
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
CREATE UNIQUE INDEX IF NOT EXISTS uq_flota_viaje_abierto ON flota_viaje(usuario_id) WHERE estado = 'ABIERTO';
CREATE INDEX IF NOT EXISTS idx_flota_viaje_estado ON flota_viaje(estado);

CREATE TABLE IF NOT EXISTS flota_ubicacion (
  id           SERIAL      PRIMARY KEY,
  viaje_id     INTEGER     REFERENCES flota_viaje(id) ON DELETE CASCADE,
  usuario_id   VARCHAR(25) NOT NULL,
  lat          NUMERIC(10,7) NOT NULL,
  lng          NUMERIC(10,7) NOT NULL,
  acc_m        NUMERIC(8,2),
  capturado_en TIMESTAMP   NOT NULL,
  creado_en    TIMESTAMP   NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_flota_ubicacion_viaje     ON flota_ubicacion(viaje_id);
CREATE INDEX IF NOT EXISTS idx_flota_ubicacion_capturado ON flota_ubicacion(capturado_en);

CREATE TABLE IF NOT EXISTS flota_carga_combustible (
  id                   SERIAL      PRIMARY KEY,
  viaje_id             INTEGER     REFERENCES flota_viaje(id) ON DELETE SET NULL,
  vehiculo_id          INTEGER     NOT NULL REFERENCES flota_vehiculo(id),
  usuario_id           VARCHAR(25) NOT NULL,
  km_odometro          NUMERIC(12,1),
  litros               NUMERIC(10,2),
  monto                NUMERIC(14,2),
  moneda_codigo        INTEGER,
  tablero_path         VARCHAR(255),
  tablero_lat          NUMERIC(10,7),
  tablero_lng          NUMERIC(10,7),
  tablero_acc_m        NUMERIC(8,2),
  tablero_capturado_en TIMESTAMP,
  factura_path         VARCHAR(255),
  factura_lat          NUMERIC(10,7),
  factura_lng          NUMERIC(10,7),
  factura_acc_m        NUMERIC(8,2),
  factura_capturado_en TIMESTAMP,
  creado_en            TIMESTAMP   NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_flota_carga_usuario ON flota_carga_combustible(usuario_id);
CREATE INDEX IF NOT EXISTS idx_flota_carga_viaje   ON flota_carga_combustible(viaje_id);

CREATE TABLE IF NOT EXISTS flota_mantenimiento (
  id            SERIAL       PRIMARY KEY,
  vehiculo_id   INTEGER      NOT NULL REFERENCES flota_vehiculo(id) ON DELETE CASCADE,
  titulo        VARCHAR(120) NOT NULL,
  km_proximo    NUMERIC(12,1),
  fecha_proxima DATE,
  ultimo_km     NUMERIC(12,1),
  ultima_fecha  DATE,
  activo        BOOLEAN      NOT NULL DEFAULT true
);
CREATE INDEX IF NOT EXISTS idx_flota_mant_vehiculo ON flota_mantenimiento(vehiculo_id) WHERE activo;

CREATE TABLE IF NOT EXISTS flota_documento (
  id          SERIAL      PRIMARY KEY,
  vehiculo_id INTEGER     NOT NULL REFERENCES flota_vehiculo(id) ON DELETE CASCADE,
  tipo        VARCHAR(20) NOT NULL,
  vencimiento DATE,
  activo      BOOLEAN     NOT NULL DEFAULT true
);
CREATE INDEX IF NOT EXISTS idx_flota_doc_vehiculo ON flota_documento(vehiculo_id) WHERE activo;

CREATE TABLE IF NOT EXISTS flota_documento_chofer (
  id          SERIAL      PRIMARY KEY,
  usuario_id  VARCHAR(25) NOT NULL,
  tipo        VARCHAR(20) NOT NULL,
  vencimiento DATE,
  activo      BOOLEAN     NOT NULL DEFAULT true
);
CREATE INDEX IF NOT EXISTS idx_flota_docchofer_usuario ON flota_documento_chofer(usuario_id) WHERE activo;

CREATE TABLE IF NOT EXISTS flota_config (
  id                           INTEGER PRIMARY KEY DEFAULT 1,
  permanencia_umbral_minutos   INTEGER NOT NULL DEFAULT 15,
  permanencia_radio_metros     INTEGER NOT NULL DEFAULT 100,
  ubicacion_intervalo_segundos INTEGER NOT NULL DEFAULT 60,
  permanencia_rol_alerta       VARCHAR(40) NOT NULL DEFAULT 'GERENTE_DE_OPERACIONES',
  gps_obligatorio              BOOLEAN NOT NULL DEFAULT true,
  ubicacion_retencion_dias     INTEGER NOT NULL DEFAULT 90,
  CONSTRAINT flota_config_single CHECK (id = 1)
);
INSERT INTO flota_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ── Perfiles requeridos por la app mobile ────────────────────────────────────
INSERT INTO perfil (perfildescripcion)
SELECT 'CHOFER'
WHERE NOT EXISTS (SELECT 1 FROM perfil WHERE upper(perfildescripcion) = 'CHOFER');

INSERT INTO perfil (perfildescripcion)
SELECT 'GERENTE DE OPERACIONES'
WHERE NOT EXISTS (SELECT 1 FROM perfil WHERE upper(perfildescripcion) = 'GERENTE DE OPERACIONES');
