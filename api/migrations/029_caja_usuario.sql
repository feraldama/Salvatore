-- ============================================================
-- MIGRACIÓN 029: DUEÑO DE CAJA (caja.UsuarioId)
-- ============================================================
-- Problema: las cajas ya estaban modeladas de hecho por PERSONA ("CAJA MARLIS",
-- "CAJA ISAAC", "LUCAS"...), pero ese vínculo vivía solo en el texto de la
-- descripción. El cajero elegía su caja de una lista de 16 en un <select>, y
-- elegir mal es la falla que el cliente reporta como cotidiana: el dinero entra
-- al arqueo de otra persona y, si la caja elegida es de otra sucursal, el stock
-- se descuenta del depósito equivocado (medido: 113 ventas entre 2025 y 2026
-- con la caja en el local 4 y el stock saliendo del local 2).
--
-- Con el dueño en la BD, la caja deja de elegirse: se deriva del usuario.
--
-- Las cajas SIN dueño (las de gente que ya no trabaja y las funcionales como
-- COMPRAS o CAJA ADMIN) quedan en NULL y se siguen eligiendo a mano: no se
-- rompe ningún flujo existente.
-- Idempotente.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Columna
-- ------------------------------------------------------------
ALTER TABLE caja
  ADD COLUMN IF NOT EXISTS UsuarioId VARCHAR(25) REFERENCES usuario(UsuarioId);

-- Un usuario no puede ser dueño de dos cajas: si lo fuera, "la caja del
-- usuario" volvería a ser ambigua y habría que preguntar de nuevo.
CREATE UNIQUE INDEX IF NOT EXISTS caja_usuarioid_uniq
  ON caja (UsuarioId) WHERE UsuarioId IS NOT NULL;

-- ------------------------------------------------------------
-- 2. Backfill
-- ------------------------------------------------------------
-- Asignaciones derivadas del historial real de aperturas (registrodiariocaja,
-- TipoGastoId=2 / grupo 2) cruzado con la coincidencia de nombre. Se listan una
-- por una en vez de resolverlas con una heurística en SQL: así queda auditable
-- qué se asignó y por qué, y revertir es borrar una línea.
--
-- Solo se tocan cajas cuyo dueño quedó fuera de duda. Cada UPDATE exige que la
-- caja siga sin dueño y que el usuario siga activo, así que correr la migración
-- dos veces no pisa una asignación hecha a mano después.
UPDATE caja c SET UsuarioId = u.UsuarioId
  FROM usuario u
 WHERE c.UsuarioId IS NULL AND u.UsuarioEstado = 'A'
   AND (c.CajaId, TRIM(u.UsuarioId)) IN (
     -- CajaId, UsuarioId          descripción        evidencia
     (1,  'YENNIFER'),   -- CAJA YENNIFER   historial + nombre
     (5,  'marlis'),     -- CAJA MARLIS     893 aperturas
     (9,  'ignaruiz'),   -- CAJA IGNACIO    187 aperturas
     (10, 'pablogonza'), -- CAJA  PABLO     historial + nombre
     (12, 'matia'),      -- CAJA MATIAS     42 aperturas (el usuario "matias" quedó inactivo)
     (16, 'lucas'),      -- LUCAS           historial + nombre
     (17, 'ricardo'),    -- RICARDO         historial + nombre
     (20, 'smarlis'),    -- SMARLIS         242 aperturas
     (22, 'tobigonza')   -- TOBIAS          solo nombre — confianza MEDIA, revisar
   );

-- ------------------------------------------------------------
-- 3. Coherencia dueño <-> sucursal
-- ------------------------------------------------------------
-- La caja de un usuario tiene que estar en la sucursal de ese usuario; si no,
-- asignarle "su" caja lo haría vender contra el depósito de otro local — el
-- error que esta migración viene a cerrar. Se deshace cualquier asignación
-- incoherente en vez de dejarla pasar.
UPDATE caja c SET UsuarioId = NULL
  FROM usuario u
 WHERE TRIM(c.UsuarioId) = TRIM(u.UsuarioId)
   AND u.LocalId IS NOT NULL
   AND c.LocalId IS NOT NULL
   AND u.LocalId <> c.LocalId;

COMMIT;

-- ============================================================
-- VERIFICACIÓN
-- Cajas con dueño y su sucursal:
--   SELECT c.cajaid, c.cajadescripcion, c.localid, c.usuarioid, u.localid AS local_usuario
--     FROM caja c LEFT JOIN usuario u ON TRIM(u.usuarioid)=TRIM(c.usuarioid)
--    ORDER BY c.cajaid;
-- Cajas sin dueño (se siguen eligiendo a mano):
--   SELECT cajaid, cajadescripcion, localid FROM caja WHERE usuarioid IS NULL;
-- Usuarios activos sin caja propia (van a seguir viendo el selector):
--   SELECT trim(u.usuarioid), u.localid FROM usuario u
--    WHERE u.usuarioestado='A'
--      AND NOT EXISTS (SELECT 1 FROM caja c WHERE TRIM(c.usuarioid)=TRIM(u.usuarioid));
-- ============================================================
