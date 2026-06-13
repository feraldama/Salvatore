-- ============================================================
-- MIGRACIÓN 013: Menús RBAC para el ABM de flota
-- ============================================================
-- Registra los menús VEHICULOS y CHOFERES en la tabla `menu` para que se
-- puedan otorgar permisos por perfil (perfilmenu). Los admin (UsuarioIsAdmin
-- = 'S') ven todo sin necesidad de permiso; estos códigos sirven para dar
-- acceso a perfiles no-admin (p. ej. GERENTE DE OPERACIONES).
--
-- El frontend (Sidebar.tsx) usa estos mismos códigos en la prop `permiso`.
--
-- Idempotente.
-- ============================================================

BEGIN;

INSERT INTO menu (MenuId, MenuNombre) VALUES
  ('VEHICULOS', 'VEHICULOS'),
  ('CHOFERES',  'CHOFERES')
ON CONFLICT DO NOTHING;

COMMIT;

-- ============================================================
-- VERIFICACIÓN
-- SELECT * FROM menu WHERE menuid IN ('VEHICULOS','CHOFERES');
-- ============================================================
