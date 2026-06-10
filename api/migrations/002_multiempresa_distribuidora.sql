-- ============================================================
-- MIGRACIÓN 002: Multi-Empresa + Distribuidora + Comisiones
-- ============================================================
-- Ejecutar en orden. Todos los ALTER usan DEFAULT para no romper
-- datos existentes. El local/empresa actual queda como EmpresaId=1.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. TABLA EMPRESA
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS empresa (
  EmpresaId     SERIAL PRIMARY KEY,
  EmpresaNombre VARCHAR(100) NOT NULL DEFAULT '',
  EmpresaRUC    VARCHAR(20)  NOT NULL DEFAULT '',
  EmpresaTipo   VARCHAR(1)   NOT NULL DEFAULT 'M', -- 'M'=Minorista, 'D'=Distribuidora
  EmpresaEstado VARCHAR(1)   NOT NULL DEFAULT 'A'  -- 'A'=Activo, 'I'=Inactivo
);

-- Empresa 1 = el local minorista actual (no rompe nada existente)
INSERT INTO empresa (EmpresaId, EmpresaNombre, EmpresaTipo, EmpresaEstado)
VALUES (1, 'Salvatore Bebidas', 'M', 'A')
ON CONFLICT (EmpresaId) DO NOTHING;

-- Empresa 2 = la distribuidora mayorista nueva
INSERT INTO empresa (EmpresaId, EmpresaNombre, EmpresaTipo, EmpresaEstado)
VALUES (2, 'Salvatore Distribuidora', 'D', 'A')
ON CONFLICT (EmpresaId) DO NOTHING;

-- Resetear secuencia para que el próximo INSERT use valores correctos
SELECT setval('empresa_empresaid_seq', 2);


-- ------------------------------------------------------------
-- 2. AGREGAR EmpresaId A TABLAS EXISTENTES
--    DEFAULT 1 = todos los datos actuales quedan en la empresa minorista
-- ------------------------------------------------------------

ALTER TABLE local
  ADD COLUMN IF NOT EXISTS EmpresaId INTEGER NOT NULL DEFAULT 1
    REFERENCES empresa(EmpresaId);

ALTER TABLE almacen
  ADD COLUMN IF NOT EXISTS EmpresaId INTEGER NOT NULL DEFAULT 1
    REFERENCES empresa(EmpresaId);

ALTER TABLE caja
  ADD COLUMN IF NOT EXISTS EmpresaId INTEGER NOT NULL DEFAULT 1
    REFERENCES empresa(EmpresaId);

-- producto pasa a catálogo compartido por empresa (no por sucursal)
-- LocalId en producto queda deprecated — el stock por sucursal ya está en productoalmacen
ALTER TABLE producto
  ADD COLUMN IF NOT EXISTS EmpresaId INTEGER NOT NULL DEFAULT 1
    REFERENCES empresa(EmpresaId);

-- Marcar LocalId como obsoleto en producto (no se elimina para no romper código existente)
COMMENT ON COLUMN producto."localid" IS
  'DEPRECATED: reemplazado por EmpresaId. El stock por sucursal se maneja en productoalmacen.';

ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS EmpresaId INTEGER NOT NULL DEFAULT 1
    REFERENCES empresa(EmpresaId);

ALTER TABLE venta
  ADD COLUMN IF NOT EXISTS EmpresaId INTEGER NOT NULL DEFAULT 1
    REFERENCES empresa(EmpresaId);

ALTER TABLE compra
  ADD COLUMN IF NOT EXISTS EmpresaId INTEGER NOT NULL DEFAULT 1
    REFERENCES empresa(EmpresaId);

ALTER TABLE usuario
  ADD COLUMN IF NOT EXISTS EmpresaId INTEGER NOT NULL DEFAULT 1
    REFERENCES empresa(EmpresaId);

ALTER TABLE perfil
  ADD COLUMN IF NOT EXISTS EmpresaId INTEGER NOT NULL DEFAULT 1
    REFERENCES empresa(EmpresaId);


-- ------------------------------------------------------------
-- 3. MEJORAR TABLA VENDEDOR
--    La tabla ya existe pero está huérfana. La conectamos.
-- ------------------------------------------------------------

-- Vincular vendedor a un usuario del sistema (opcional, para login)
ALTER TABLE vendedor
  ADD COLUMN IF NOT EXISTS UsuarioId    VARCHAR(25) DEFAULT NULL
    REFERENCES usuario(UsuarioId),
  ADD COLUMN IF NOT EXISTS EmpresaId    INTEGER NOT NULL DEFAULT 2
    REFERENCES empresa(EmpresaId),      -- vendedores son de la distribuidora por default
  ADD COLUMN IF NOT EXISTS VendedorEstado VARCHAR(1) NOT NULL DEFAULT 'A'; -- 'A'/'I'


-- ------------------------------------------------------------
-- 4. ASIGNAR VENDEDOR A CLIENTES
--    Un cliente mayorista tiene un vendedor responsable
-- ------------------------------------------------------------

ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS VendedorId INTEGER DEFAULT NULL
    REFERENCES vendedor(VendedorId);

-- Índice para consultas frecuentes: "todos los clientes de un vendedor"
CREATE INDEX IF NOT EXISTS idx_clientes_vendedor
  ON clientes(VendedorId)
  WHERE VendedorId IS NOT NULL;


-- ------------------------------------------------------------
-- 5. REGISTRAR VENDEDOR EN VENTA
--    VentaUsuario = quien cargó la venta al sistema
--    VentaVendedorId = a quién se le acredita la comisión
--    Son distintos: el vendedor puede no tener acceso al sistema
-- ------------------------------------------------------------

ALTER TABLE venta
  ADD COLUMN IF NOT EXISTS VentaVendedorId INTEGER DEFAULT NULL
    REFERENCES vendedor(VendedorId);

-- Índice para liquidaciones mensuales
CREATE INDEX IF NOT EXISTS idx_venta_vendedor_fecha
  ON venta(VentaVendedorId, VentaFecha)
  WHERE VentaVendedorId IS NOT NULL;


-- ------------------------------------------------------------
-- 6. SISTEMA DE COMISIONES
-- ------------------------------------------------------------

-- 6a. Reglas de comisión por vendedor (puede cambiar mes a mes)
CREATE TABLE IF NOT EXISTS comision_regla (
  ReglaId          SERIAL PRIMARY KEY,
  VendedorId       INTEGER NOT NULL REFERENCES vendedor(VendedorId),
  EmpresaId        INTEGER NOT NULL DEFAULT 2 REFERENCES empresa(EmpresaId),
  ReglaPorcentaje  NUMERIC(5,2) NOT NULL DEFAULT 0, -- ej: 2.50 = 2.5%
  ReglaVigenciaDesde DATE NOT NULL,
  ReglaVigenciaHasta DATE DEFAULT NULL,             -- NULL = vigente
  ReglaEstado      VARCHAR(1) NOT NULL DEFAULT 'A'
);

-- 6b. Período de liquidación (un registro por mes cerrado)
CREATE TABLE IF NOT EXISTS comision_liquidacion (
  LiquidacionId    SERIAL PRIMARY KEY,
  VendedorId       INTEGER NOT NULL REFERENCES vendedor(VendedorId),
  EmpresaId        INTEGER NOT NULL DEFAULT 2 REFERENCES empresa(EmpresaId),
  LiquidacionAnio  SMALLINT NOT NULL,
  LiquidacionMes   SMALLINT NOT NULL,              -- 1-12
  TotalVentas      BIGINT   NOT NULL DEFAULT 0,    -- suma de ventas del período
  PorcentajeAplicado NUMERIC(5,2) NOT NULL DEFAULT 0,
  MontoComision    BIGINT   NOT NULL DEFAULT 0,    -- calculado
  LiquidacionEstado VARCHAR(1) NOT NULL DEFAULT 'P', -- 'P'=Pendiente, 'A'=Aprobado, 'L'=Liquidado
  LiquidacionFechaCalculo TIMESTAMP DEFAULT NOW(),
  LiquidacionFechaPago    TIMESTAMP DEFAULT NULL,
  UsuarioAprueba   VARCHAR(25) DEFAULT NULL REFERENCES usuario(UsuarioId),
  UNIQUE (VendedorId, LiquidacionAnio, LiquidacionMes) -- un único registro por vendedor/mes
);

-- 6c. Detalle: qué ventas componen cada liquidación
CREATE TABLE IF NOT EXISTS comision_detalle (
  DetalleId        SERIAL PRIMARY KEY,
  LiquidacionId    INTEGER NOT NULL REFERENCES comision_liquidacion(LiquidacionId) ON DELETE CASCADE,
  VentaId          INTEGER NOT NULL REFERENCES venta(VentaId),
  ClienteId        INTEGER NOT NULL REFERENCES clientes(ClienteId),
  VentaFecha       TIMESTAMP NOT NULL,
  MontoVenta       BIGINT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_comision_detalle_liquidacion
  ON comision_detalle(LiquidacionId);


-- ------------------------------------------------------------
-- 7. CLIENTE TIPO: distinguir minorista vs mayorista
--    ClienteTipo ya existe como VARCHAR(2), redefinimos los valores
--    'MN' = Minorista (consumidor final)
--    'MY' = Mayorista (B2B, tiene vendedor asignado)
--    Los datos existentes quedan con su valor actual
-- ------------------------------------------------------------

COMMENT ON COLUMN clientes."clientetipo" IS
  'MN=Minorista (consumidor final), MY=Mayorista/B2B (tiene vendedor asignado)';


-- ------------------------------------------------------------
-- 8. LISTA DE PRECIOS POR EMPRESA (opcional pero recomendado)
--    producto ya tiene ProductoPrecioVenta y ProductoPrecioVentaMayorista
--    Si en el futuro se necesitan precios por cliente específico,
--    esta tabla lo habilita sin tocar producto.
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS lista_precio (
  ListaId          SERIAL PRIMARY KEY,
  EmpresaId        INTEGER NOT NULL REFERENCES empresa(EmpresaId),
  ListaNombre      VARCHAR(50) NOT NULL DEFAULT '',   -- ej: 'Precio Mayorista Nivel A'
  ListaDescuento   NUMERIC(5,2) NOT NULL DEFAULT 0,  -- % de descuento sobre precio base
  ListaEstado      VARCHAR(1) NOT NULL DEFAULT 'A'
);

-- Asignación de lista de precios a cliente específico
ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS ListaPrecioId INTEGER DEFAULT NULL
    REFERENCES lista_precio(ListaId);


COMMIT;

-- ============================================================
-- VERIFICACIÓN POST-MIGRACIÓN
-- ============================================================
-- Ejecutar estas queries para confirmar que todo quedó bien:
--
-- SELECT * FROM empresa;
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'venta' ORDER BY ordinal_position;
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'clientes' ORDER BY ordinal_position;
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'vendedor' ORDER BY ordinal_position;
-- ============================================================
