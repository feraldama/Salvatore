-- ============================================================
-- MIGRACIÓN 003: Poblar RBAC (menús) + Perfil CAJERO
-- ============================================================
-- Las tablas menu y perfilmenu estaban vacías, por lo que el
-- sistema de permisos no funcionaba para usuarios no-admin.
-- Esta migración:
--   1. Puebla la tabla menu con todos los ítems que el frontend
--      referencia en usePermiso() (clave = nombre exacto).
--   2. Crea el perfil CAJERO.
--   3. Asigna al CAJERO solo los permisos que necesita.
-- Idempotente: se puede ejecutar varias veces sin duplicar.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. MENÚS (MenuId = MenuNombre, ambos VARCHAR)
--    Los nombres deben coincidir EXACTO con usePermiso("XXX", ...)
-- ------------------------------------------------------------
INSERT INTO menu (MenuId, MenuNombre) VALUES
  ('NUEVAVENTA',         'NUEVAVENTA'),
  ('VENTAS',             'VENTAS'),
  ('NUEVACOMPRA',        'NUEVACOMPRA'),
  ('COMPRAS',            'COMPRAS'),
  ('INVENTARIO',         'INVENTARIO'),
  ('COBROCREDITO',       'COBROCREDITO'),
  ('FACTURAS',           'FACTURAS'),
  ('VENDEDORES',         'VENDEDORES'),
  ('USUARIOS',           'USUARIOS'),
  ('REPORTES',           'REPORTES'),
  ('TIPOSGASTO',         'TIPOSGASTO'),
  ('REGISTRODIARIOCAJA', 'REGISTRODIARIOCAJA'),
  ('CLIENTES',           'CLIENTES'),
  ('ALMACENES',          'ALMACENES'),
  ('CAJAS',              'CAJAS'),
  ('APERTURACAJA',       'APERTURACAJA'),
  ('PERFILES',           'PERFILES'),
  ('LOCALES',            'LOCALES'),
  ('MENUS',              'MENUS'),
  ('PRODUCTOS',          'PRODUCTOS'),
  ('COMBOS',             'COMBOS')
ON CONFLICT (MenuId) DO NOTHING;

-- ------------------------------------------------------------
-- 2. PERFIL CAJERO (empresa 1 = minorista)
-- ------------------------------------------------------------
INSERT INTO perfil (PerfilDescripcion, EmpresaId)
SELECT 'CAJERO', 1
WHERE NOT EXISTS (SELECT 1 FROM perfil WHERE PerfilDescripcion = 'CAJERO');

-- ------------------------------------------------------------
-- 3. PERMISOS DEL CAJERO
--    Solo lo que necesita para operar el mostrador:
--    - NUEVAVENTA: leer + crear  (vender)
--    - APERTURACAJA: leer + crear (abrir/cerrar caja)
--    - COBROCREDITO: leer + crear (cobrar créditos)
--    - CLIENTES: leer + crear     (alta y consulta de clientes)
--    Nada de admin, inventario, compras, perfiles, etc.
-- ------------------------------------------------------------

-- Limpiar permisos previos del CAJERO (idempotencia)
DELETE FROM perfilmenu
WHERE PerfilId = (SELECT PerfilId FROM perfil WHERE PerfilDescripcion = 'CAJERO');

INSERT INTO perfilmenu (PerfilId, MenuId, puedeCrear, puedeEditar, puedeEliminar, puedeLeer)
SELECT
  (SELECT PerfilId FROM perfil WHERE PerfilDescripcion = 'CAJERO'),
  v.menuid,
  v.crear,
  0,           -- editar
  0,           -- eliminar
  1            -- leer
FROM (VALUES
  ('NUEVAVENTA',   1),
  ('APERTURACAJA', 1),
  ('COBROCREDITO', 1),
  ('CLIENTES',     1)
) AS v(menuid, crear);

COMMIT;

-- ============================================================
-- VERIFICACIÓN
-- ============================================================
-- SELECT * FROM menu ORDER BY MenuId;
-- SELECT p.PerfilDescripcion, pm.MenuId, pm.puedeLeer, pm.puedeCrear
--   FROM perfilmenu pm JOIN perfil p ON pm.PerfilId = p.PerfilId
--  WHERE p.PerfilDescripcion = 'CAJERO';
-- ============================================================
