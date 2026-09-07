-- ============================================================
-- MIGRACIÓN 027: Menú TRASLADOS (permisos)
-- ============================================================
-- El ítem del menú lateral está hardcodeado en
-- client/src/components/layout/Sidebar.tsx, pero para que un usuario
-- NO-ADMIN pueda verlo, su `permiso` tiene que existir en la tabla `menu`
-- y estar asignado a su perfil en `perfilmenu`. Los admin ven todo.
--
-- Va separada de la 026 porque esa ya se aplicó y conviene no tocar una
-- migración corrida; además esto es configuración de acceso, no modelo.
--
-- Estrictamente aditiva e idempotente: un INSERT con ON CONFLICT.
-- NO asigna el permiso a ningún perfil: eso se hace desde la pantalla
-- Perfiles, para que quede claro quién puede mover stock entre depósitos.
-- ============================================================

BEGIN;

INSERT INTO menu (MenuId, MenuNombre)
VALUES ('TRASLADOS', 'TRASLADOS')
ON CONFLICT (MenuId) DO NOTHING;

COMMIT;

-- ============================================================
-- VERIFICACIÓN
--   SELECT * FROM menu WHERE MenuId = 'TRASLADOS';
--
-- Asignación de permisos (hacerlo desde la pantalla Perfiles, o a mano).
-- Las columnas son SMALLINT 1/0, no 'S'/'N':
--   INSERT INTO perfilmenu (PerfilId, MenuId, PuedeCrear, PuedeLeer, PuedeEditar, PuedeEliminar)
--   VALUES (<PerfilId>, 'TRASLADOS', 1, 1, 1, 0)
--   ON CONFLICT DO NOTHING;
--
-- Qué habilita cada uno en la pantalla de Traslados:
--   PuedeLeer      -> ver la pantalla y el historial
--   PuedeCrear     -> confirmar traslados y crear/editar equivalencias
--   PuedeEliminar  -> anular traslados y desvincular equivalencias
--
-- Recomendación: dejar PuedeEliminar solo a encargados. La anulación devuelve
-- el stock pero deja huella permanente en el costo promedio del destino.
-- ============================================================
