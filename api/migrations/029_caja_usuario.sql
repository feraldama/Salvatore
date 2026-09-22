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

-- No colgarse esperando un lock: ALTER TABLE necesita ACCESS EXCLUSIVE sobre la
-- tabla y, con la bodega vendiendo, una consulta en curso puede hacerlo esperar
-- indefinidamente mientras BLOQUEA a todos los que llegan detrás. Con esto la
-- migración falla rápido y se reintenta en un momento tranquilo, en vez de
-- frenar las cajas. (Pasó en desarrollo: un SELECT olvidado tuvo la migración
-- esperando 7 minutos.)
SET LOCAL lock_timeout = '10s';

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
-- Cada asignación exige que coincidan el id Y LA DESCRIPCIÓN de la caja. Los
-- ids salieron de un snapshot de producción, y si en producción la caja 5 ya no
-- es "CAJA MARLIS" (se renombró, se borró y se recreó con otro id), asignar por
-- id a secas le daría la caja de otra persona a un cajero. Con la descripción
-- como segunda llave, una caja que no coincide simplemente no se toca y queda
-- para asignarla a mano desde la pantalla de cajas.
UPDATE caja c SET UsuarioId = v.usuario
  FROM (VALUES
    -- CajaId, descripción exacta,    cajero,        evidencia
    (1,  'CAJA YENNIFER',  'YENNIFER'),   -- historial + nombre
    (5,  'CAJA MARLIS',    'marlis'),     -- 893 aperturas
    (9,  'CAJA IGNACIO',   'ignaruiz'),   -- 187 aperturas
    (10, 'CAJA  PABLO',    'pablogonza'), -- historial + nombre (ojo: doble espacio)
    (12, 'CAJA MATIAS',    'matia'),      -- 42 aperturas (el usuario "matias" quedó inactivo)
    (16, 'LUCAS',          'lucas'),      -- historial + nombre
    (17, 'RICARDO',        'ricardo'),    -- historial + nombre
    (20, 'SMARLIS',        'smarlis'),    -- 242 aperturas
    (22, 'TOBIAS',         'tobigonza')   -- solo nombre — confianza MEDIA, revisar
  ) AS v(cajaid, descripcion, usuario)
 WHERE c.CajaId = v.cajaid
   AND c.UsuarioId IS NULL
   AND c.CajaDescripcion = v.descripcion
   AND EXISTS (
     SELECT 1 FROM usuario u
      WHERE TRIM(u.UsuarioId) = v.usuario AND u.UsuarioEstado = 'A'
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
