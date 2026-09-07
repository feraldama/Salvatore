-- ============================================================
-- MIGRACIÓN 026: Traslados de inventario entre almacenes
-- ============================================================
-- Habilita mover stock entre almacenes, incluso CRUZANDO EMPRESAS
-- (Distribuidora=1 <-> Bodega=2), que hoy tienen catálogos separados
-- (producto.EmpresaId): 765 fichas mayorista vs 958 minorista, casi
-- disjuntas. "El mismo producto" son DOS ProductoId distintos, así que
-- un traslado necesita saber a qué ficha del catálogo destino
-- corresponde cada ficha del origen -> tabla producto_equivalencia.
--
-- ------------------------------------------------------------
-- LA UNIDAD DE INTERCAMBIO ES LA CAJA, NO LA UNIDAD
-- ------------------------------------------------------------
-- ProductoCantidadCaja NO es comparable entre los dos catálogos. En el
-- catálogo mayorista vale 1 en la mayoría de las fichas: la distribuidora
-- no fracciona, así que "1 caja" es el bulto físico completo aunque
-- contenga 12 o 24 unidades. En el minorista sí refleja el contenido real.
--
--   BRAHMA LITRO  -> mayorista id 1117 (cc=1,  promedio 75.425 Gs)
--                    minorista id    1 (cc=12, promedio 76.200 Gs)
--
-- Los promedios POR CAJA casi coinciden: 1 caja mayorista = 1 caja
-- minorista (12 botellas), no 1 unidad. Contrastado sobre los 164 pares
-- con costo en ambos lados: bajo la hipótesis "caja<->caja" 84/91 pares
-- con cc distinto caen en una banda de costo sana (0,4-1,15); bajo la
-- hipótesis "unidad<->unidad" solo 11/91 (los demás dan ratios absurdos
-- de 3x, 12x, 23x -- exactamente cc_destino/cc_origen).
--
-- Por eso la equivalencia guarda FactorCaja = cuántas CAJAS del destino
-- equivale 1 CAJA del origen (default 1), y la conversión es:
--
--   cajas_eq_origen  = cajas_origen + sueltas_origen / cc_origen
--   unidades_destino = cajas_eq_origen * FactorCaja * cc_destino
--
-- Convertir por "unidades base" (cajas*cc + sueltas) habría DESTRUIDO
-- stock en los 85 pares con cc_mayorista=1: 5 cajas de BRAHMA LITRO
-- (60 botellas) habrían entrado al minorista como 5 unidades sueltas.
--
-- ------------------------------------------------------------
-- ESTA MIGRACIÓN NO TOCA NINGÚN DATO EXISTENTE
-- ------------------------------------------------------------
-- Es estrictamente aditiva: crea tablas nuevas y siembra filas nuevas.
-- No hay un solo UPDATE ni DELETE sobre producto, productoalmacen,
-- venta, compra, caja ni registrodiariocaja. El historial del cliente
-- queda intacto. En particular NO se corrigen (a propósito):
--
--   * Las 3 filas de productoalmacen del almacén 2 (SALON, empresa 2)
--     que pertenecen a productos de la empresa 1 -- BRAHMITA 340 ML.
--     (1118), LEON VERDE DE 500 (1153) y PILSEN TUBITO (1122), todas
--     con stock -1. Son residuo de la migración mayorista. Borrarlas
--     alteraría producto.ProductoStock, que desde la 009 es la SUMA por
--     almacén, en productos con 2.325 / 1.012 / 3.476 líneas de venta.
--     El validador de traslados las rechaza sin necesidad de tocarlas.
--
--   * La fila de productoalmacen del producto 1313 ('00000000') con
--     StockUnitario=24 y CantidadCaja=1, que rompe la invariante
--     su < cc. La aritmética de traslado normaliza en memoria al leer.
--
--   * El local 4 (SUCURSAL, empresa 2) no tiene almacén, así que hoy no
--     puede recibir traslados. Crearlo haría aparecer un almacén nuevo
--     con stock 0 en toda la pantalla de Inventario, así que queda como
--     decisión aparte:
--       INSERT INTO almacen (AlmacenNombre, LocalId) VALUES ('SUCURSAL', 4);
--       -- EmpresaId lo completa el trigger almacen_hereda_empresa (009)
--
-- Idempotente: se puede correr varias veces sin efecto adicional.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Apartar la tabla `traslado` legacy de GeneXus
-- ------------------------------------------------------------
-- Tiene 0 filas y ningún modelo/controlador/ruta la usa. Sus FKs
-- (itraslado1/itraslado2) apuntan (productoid, almacenorigenid) y
-- (productoid, almacendestinoid) a productoalmacen: fuerzan un ÚNICO
-- ProductoId para origen y destino, justo lo que se rompe al cruzar
-- empresas. Se renombra en vez de borrarse: reversible y no pierde nada.
-- ------------------------------------------------------------
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
              WHERE table_schema = 'public' AND table_name = 'traslado')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
                      WHERE table_schema = 'public' AND table_name = 'traslado'
                        AND column_name = 'trasladoestado')
  THEN
    IF (SELECT count(*) FROM traslado) > 0 THEN
      RAISE EXCEPTION 'La tabla traslado legacy tiene filas; revisar antes de renombrar.';
    END IF;
    ALTER TABLE traslado RENAME TO traslado_gx_legacy;
    RAISE NOTICE 'traslado (legacy GeneXus, 0 filas) renombrada a traslado_gx_legacy';
  END IF;
END
$do$;

-- ------------------------------------------------------------
-- 2. producto_equivalencia: puente entre catálogos
-- ------------------------------------------------------------
-- Direccional (una fila por sentido) para que sirva igual a
-- mayorista->minorista, minorista->mayorista y, el día que exista,
-- CENTRAL->SUCURSAL. Los traslados dentro de una misma empresa NO
-- necesitan fila: el resolvedor devuelve identidad (mismo ProductoId,
-- FactorCaja=1) cuando origen y destino comparten empresa.
--
-- EmpresaDestinoId está desnormalizado (lo mantiene un trigger) solo
-- para poder imponer con un UNIQUE que un producto origen no tenga DOS
-- equivalentes dentro de la misma empresa destino -- la ambigüedad que
-- volvería no determinista al traslado.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS producto_equivalencia (
  ProductoOrigenId      INTEGER       NOT NULL REFERENCES producto(ProductoId),
  ProductoDestinoId     INTEGER       NOT NULL REFERENCES producto(ProductoId),
  EmpresaDestinoId      INTEGER       NOT NULL REFERENCES empresa(EmpresaId),
  -- Cuántas CAJAS del producto destino equivale 1 CAJA del producto origen.
  FactorCaja            NUMERIC(14,6) NOT NULL DEFAULT 1,
  -- A = alta (el costo por caja de ambos lados es coherente)
  -- R = revisar (ratio de costos fuera de banda, o sin costo en algún lado)
  EquivalenciaConfianza VARCHAR(1)    NOT NULL DEFAULT 'A',
  -- S = sembrada por esta migración, M = cargada a mano desde la UI
  EquivalenciaOrigen    VARCHAR(1)    NOT NULL DEFAULT 'M',
  EquivalenciaFecha     TIMESTAMP     NOT NULL DEFAULT now(),
  UsuarioId             VARCHAR(25)            REFERENCES usuario(UsuarioId),
  PRIMARY KEY (ProductoOrigenId, ProductoDestinoId),
  CONSTRAINT uq_equivalencia_destino    UNIQUE (ProductoOrigenId, EmpresaDestinoId),
  CONSTRAINT ck_equivalencia_factor     CHECK (FactorCaja > 0),
  CONSTRAINT ck_equivalencia_distinta   CHECK (ProductoOrigenId <> ProductoDestinoId),
  CONSTRAINT ck_equivalencia_confianza  CHECK (EquivalenciaConfianza IN ('A','R')),
  CONSTRAINT ck_equivalencia_origen     CHECK (EquivalenciaOrigen IN ('S','M'))
);

CREATE INDEX IF NOT EXISTS ix_equivalencia_destino
  ON producto_equivalencia (ProductoDestinoId);

-- EmpresaDestinoId siempre = empresa del producto destino. Mismo patrón
-- que trg_almacen_hereda_empresa (migración 009).
CREATE OR REPLACE FUNCTION trg_equivalencia_hereda_empresa() RETURNS trigger AS $fn$
BEGIN
  SELECT EmpresaId INTO NEW.EmpresaDestinoId
    FROM producto WHERE ProductoId = NEW.ProductoDestinoId;
  IF NEW.EmpresaDestinoId IS NULL THEN
    RAISE EXCEPTION 'Producto destino % inexistente', NEW.ProductoDestinoId;
  END IF;
  RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS equivalencia_hereda_empresa ON producto_equivalencia;
CREATE TRIGGER equivalencia_hereda_empresa
  BEFORE INSERT OR UPDATE ON producto_equivalencia
  FOR EACH ROW EXECUTE FUNCTION trg_equivalencia_hereda_empresa();

-- ------------------------------------------------------------
-- 3. traslado: cabecera del movimiento
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS traslado (
  TrasladoId               SERIAL       PRIMARY KEY,
  TrasladoFecha            TIMESTAMP    NOT NULL DEFAULT now(),
  AlmacenOrigenId          INTEGER      NOT NULL REFERENCES almacen(AlmacenId),
  AlmacenDestinoId         INTEGER      NOT NULL REFERENCES almacen(AlmacenId),
  -- Desnormalizadas (trigger) para poder listar por empresa sin joins.
  EmpresaOrigenId          INTEGER      NOT NULL DEFAULT 0,
  EmpresaDestinoId         INTEGER      NOT NULL DEFAULT 0,
  -- C = Confirmado (aplicado), A = Anulado (revertido).
  -- B = Borrador y E = Enviado quedan previstos para el flujo en dos
  -- pasos con stock en tránsito; la v1 solo emite 'C'.
  TrasladoEstado           VARCHAR(1)   NOT NULL DEFAULT 'C',
  TrasladoObs              VARCHAR(255) NOT NULL DEFAULT '',
  UsuarioId                VARCHAR(25)           REFERENCES usuario(UsuarioId),
  TrasladoAnuladoFecha     TIMESTAMP,
  TrasladoAnuladoUsuarioId VARCHAR(25)           REFERENCES usuario(UsuarioId),
  CONSTRAINT ck_traslado_almacenes CHECK (AlmacenOrigenId <> AlmacenDestinoId),
  CONSTRAINT ck_traslado_estado    CHECK (TrasladoEstado IN ('B','E','C','A'))
);

CREATE INDEX IF NOT EXISTS ix_traslado_fecha   ON traslado (TrasladoFecha DESC);
CREATE INDEX IF NOT EXISTS ix_traslado_origen  ON traslado (EmpresaOrigenId, TrasladoFecha DESC);
CREATE INDEX IF NOT EXISTS ix_traslado_destino ON traslado (EmpresaDestinoId, TrasladoFecha DESC);

CREATE OR REPLACE FUNCTION trg_traslado_hereda_empresa() RETURNS trigger AS $fn$
BEGIN
  SELECT EmpresaId INTO NEW.EmpresaOrigenId  FROM almacen WHERE AlmacenId = NEW.AlmacenOrigenId;
  SELECT EmpresaId INTO NEW.EmpresaDestinoId FROM almacen WHERE AlmacenId = NEW.AlmacenDestinoId;
  RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS traslado_hereda_empresa ON traslado;
CREATE TRIGGER traslado_hereda_empresa
  BEFORE INSERT OR UPDATE ON traslado
  FOR EACH ROW EXECUTE FUNCTION trg_traslado_hereda_empresa();

-- ------------------------------------------------------------
-- 4. trasladoproducto: detalle
-- ------------------------------------------------------------
-- Los campos "congelados" (Cc/Factor/Costo) son deliberados: si mañana
-- alguien edita ProductoCantidadCaja o se recalcula el promedio, la
-- ANULACIÓN tiene que revertir con los números del día del movimiento,
-- no con los actuales. Sin esto, un traslado anulado meses después
-- devolvería una cantidad distinta a la que sacó.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS trasladoproducto (
  TrasladoId              INTEGER       NOT NULL REFERENCES traslado(TrasladoId) ON DELETE CASCADE,
  TrasladoProductoId      INTEGER       NOT NULL,          -- nro de línea (1..n)
  ProductoOrigenId        INTEGER       NOT NULL REFERENCES producto(ProductoId),
  ProductoDestinoId       INTEGER       NOT NULL REFERENCES producto(ProductoId),
  TrasladoCantidadCaja    INTEGER       NOT NULL DEFAULT 0, -- cajas sacadas del origen
  TrasladoCantidadUnidad  INTEGER       NOT NULL DEFAULT 0, -- sueltas sacadas del origen
  TrasladoUnidadesOrigen  INTEGER       NOT NULL DEFAULT 0, -- total en unidades del origen
  TrasladoUnidadesDestino INTEGER       NOT NULL DEFAULT 0, -- total en unidades del destino
  TrasladoFactorCaja      NUMERIC(14,6) NOT NULL DEFAULT 1, -- congelado
  TrasladoCcOrigen        INTEGER       NOT NULL DEFAULT 1, -- congelado
  TrasladoCcDestino       INTEGER       NOT NULL DEFAULT 1, -- congelado
  TrasladoCostoCajaOrigen NUMERIC(14,4) NOT NULL DEFAULT 0, -- ProductoPrecioPromedio del origen, congelado
  PRIMARY KEY (TrasladoId, TrasladoProductoId),
  CONSTRAINT ck_trasladoproducto_cc     CHECK (TrasladoCcOrigen > 0 AND TrasladoCcDestino > 0),
  CONSTRAINT ck_trasladoproducto_factor CHECK (TrasladoFactorCaja > 0),
  CONSTRAINT ck_trasladoproducto_cant   CHECK (TrasladoCantidadCaja >= 0 AND TrasladoCantidadUnidad >= 0)
);

CREATE INDEX IF NOT EXISTS ix_trasladoproducto_origen  ON trasladoproducto (ProductoOrigenId);
CREATE INDEX IF NOT EXISTS ix_trasladoproducto_destino ON trasladoproducto (ProductoDestinoId);

-- ------------------------------------------------------------
-- 5. Siembra de equivalencias mayorista <-> minorista
-- ------------------------------------------------------------
-- Solo pares INEQUÍVOCOS: producto activo en ambos lados, nombre
-- normalizado (mayúsculas, espacios colapsados) idéntico, y ese nombre
-- único dentro de cada catálogo. Se descartan nombres basura (vacíos,
-- puramente numéricos, 'OTRO', <3 caracteres) y los 7 nombres duplicados
-- del catálogo mayorista, que no se pueden desambiguar solos.
-- Resultado: 167 pares -> 334 filas (los dos sentidos).
--
-- FactorCaja=1 (caja<->caja) para todos, que es lo que valida el costo
-- en 153 de los 167. Los 14 restantes entran igual pero marcados con
-- Confianza='R' para que alguien los revise en pantalla antes de usarlos.
-- Sembrar y marcar es mejor que omitir: el usuario ve el producto
-- sugerido y lo corrige, en vez de tener que buscarlo de cero.
-- ------------------------------------------------------------
WITH limpio AS (
  SELECT ProductoId,
         EmpresaId,
         regexp_replace(upper(btrim(ProductoNombre)), '\s+', ' ', 'g') AS nombre,
         greatest(ProductoCantidadCaja, 1) AS cc,
         ProductoPrecioPromedio            AS pp
    FROM producto
   WHERE EmpresaId IN (1, 2)
     AND ProductoEstado = 'A'
     AND btrim(ProductoNombre) <> ''
     AND length(btrim(ProductoNombre)) >= 3
     AND btrim(ProductoNombre) !~ '^[0-9.]+$'
     AND upper(btrim(ProductoNombre)) <> 'OTRO'
), unico AS (           -- nombre único dentro de su propia empresa
  SELECT * FROM limpio l
   WHERE NOT EXISTS (
     SELECT 1 FROM limpio o
      WHERE o.EmpresaId = l.EmpresaId
        AND o.nombre = l.nombre
        AND o.ProductoId <> l.ProductoId)
), par AS (
  SELECT may.ProductoId AS may_id,
         mnr.ProductoId AS min_id,
         CASE
           WHEN may.pp <= 0 OR mnr.pp <= 0            THEN 'R'
           WHEN may.pp / mnr.pp BETWEEN 0.4 AND 1.15  THEN 'A'
           ELSE 'R'
         END AS confianza
    FROM unico may
    JOIN unico mnr ON mnr.nombre = may.nombre
   WHERE may.EmpresaId = 1
     AND mnr.EmpresaId = 2
), ambos_sentidos AS (
  SELECT may_id AS origen, min_id AS destino, confianza FROM par
  UNION ALL
  SELECT min_id, may_id, confianza FROM par   -- recíproco: FactorCaja 1/1 = 1
)
INSERT INTO producto_equivalencia
  (ProductoOrigenId, ProductoDestinoId, EmpresaDestinoId,
   FactorCaja, EquivalenciaConfianza, EquivalenciaOrigen)
SELECT origen, destino, 0, 1, confianza, 'S'   -- EmpresaDestinoId lo pisa el trigger
  FROM ambos_sentidos
ON CONFLICT DO NOTHING;

COMMIT;

-- ============================================================
-- VERIFICACIÓN
-- ============================================================
-- Equivalencias sembradas por sentido y confianza:
--   SELECT e.EmpresaDestinoId, e.EquivalenciaConfianza, COUNT(*)
--     FROM producto_equivalencia e GROUP BY 1,2 ORDER BY 1,2;
--   -- esperado: (1,'A') 153, (1,'R') 14, (2,'A') 153, (2,'R') 14
--
-- Ningún producto con dos equivalentes en la misma empresa destino
-- (lo garantiza uq_equivalencia_destino, esto debe dar 0 filas):
--   SELECT ProductoOrigenId, EmpresaDestinoId, COUNT(*)
--     FROM producto_equivalencia GROUP BY 1,2 HAVING COUNT(*) > 1;
--
-- Los 14 pares a revisar:
--   SELECT po.ProductoNombre origen, pd.ProductoNombre destino,
--          po.ProductoPrecioPromedio pp_origen, pd.ProductoPrecioPromedio pp_destino
--     FROM producto_equivalencia e
--     JOIN producto po ON po.ProductoId = e.ProductoOrigenId
--     JOIN producto pd ON pd.ProductoId = e.ProductoDestinoId
--    WHERE e.EquivalenciaConfianza = 'R' AND e.EmpresaDestinoId = 2
--    ORDER BY 1;
--
-- ROLLBACK completo (esta migración es 100% aditiva):
--   DROP TABLE IF EXISTS trasladoproducto;
--   DROP TABLE IF EXISTS traslado;
--   DROP TABLE IF EXISTS producto_equivalencia;
--   DROP FUNCTION IF EXISTS trg_traslado_hereda_empresa();
--   DROP FUNCTION IF EXISTS trg_equivalencia_hereda_empresa();
--   ALTER TABLE traslado_gx_legacy RENAME TO traslado;
-- ============================================================
