-- ============================================================
-- MIGRACIÓN 010: Distribuidora = id 1; minoristas desde id 2
-- ============================================================
-- Nueva convención de IDs (empresa / local / almacén):
--   id 1      = Distribuidora
--   id >= 2   = Minoristas (bodegas)  -> la bodega actual "SALON" pasa a id 2
-- Se eliminan los pseudo-registros TODOS (local 0 y almacén 0), ya sin uso.
--
-- Estado previo: empresa/local/almacén 1 = bodega SALON (con TODA la data:
-- 929 productos, ~407k ventas, stock, cajas), 2 = Distribuidora (vacía).
-- Esta migración INTERCAMBIA los ids 1<->2 en empresa, local y almacén, y
-- arrastra todas las FKs.
--
-- Técnica: se desactivan los triggers de FK con session_replication_role=replica
-- (requiere superusuario) para poder renumerar PKs y FKs de forma consistente
-- dentro de una sola transacción. El estado final queda íntegro.
--
-- BACKUP previo: backups/salvatore_pre_swap_ids.sql
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 0. Vaciar el pseudo-local/almacén TODOS (0)
--    Los 11 usuarios que cuelgan de local 0 se mueven a SALON (local 1) para
--    que viajen con el swap a la bodega (local 2 = minorista).
-- ------------------------------------------------------------
UPDATE usuario SET localid = 1, empresaid = 1 WHERE localid = 0;

DELETE FROM almacen WHERE almacenid = 0;  -- 0 productoalmacen, 0 ventas
DELETE FROM local   WHERE localid   = 0;  -- sin más referencias

-- ------------------------------------------------------------
-- 1. Desactivar triggers de FK (y el trigger almacen_hereda_empresa) para el
--    renumerado. Las restricciones UNIQUE/PK siguen activas, por eso los PK se
--    renumeran con un id temporal (901) para no chocar durante el swap.
-- ------------------------------------------------------------
SET session_replication_role = replica;

-- El índice único parcial sobre almacen(localid) choca durante el renumerado
-- del PK de almacén; se elimina y se recrea al final del swap.
DROP INDEX IF EXISTS uq_almacen_local;

-- ---- SWAP empresaid 1 <-> 2 (tablas hijas: CASE directo) ----
UPDATE almacen              SET empresaid = CASE empresaid WHEN 1 THEN 2 WHEN 2 THEN 1 END WHERE empresaid IN (1,2);
UPDATE caja                 SET empresaid = CASE empresaid WHEN 1 THEN 2 WHEN 2 THEN 1 END WHERE empresaid IN (1,2);
UPDATE clientes             SET empresaid = CASE empresaid WHEN 1 THEN 2 WHEN 2 THEN 1 END WHERE empresaid IN (1,2);
UPDATE comision_liquidacion SET empresaid = CASE empresaid WHEN 1 THEN 2 WHEN 2 THEN 1 END WHERE empresaid IN (1,2);
UPDATE comision_regla       SET empresaid = CASE empresaid WHEN 1 THEN 2 WHEN 2 THEN 1 END WHERE empresaid IN (1,2);
UPDATE compra               SET empresaid = CASE empresaid WHEN 1 THEN 2 WHEN 2 THEN 1 END WHERE empresaid IN (1,2);
UPDATE factura              SET empresaid = CASE empresaid WHEN 1 THEN 2 WHEN 2 THEN 1 END WHERE empresaid IN (1,2);
UPDATE lista_precio         SET empresaid = CASE empresaid WHEN 1 THEN 2 WHEN 2 THEN 1 END WHERE empresaid IN (1,2);
UPDATE local                SET empresaid = CASE empresaid WHEN 1 THEN 2 WHEN 2 THEN 1 END WHERE empresaid IN (1,2);
UPDATE perfil               SET empresaid = CASE empresaid WHEN 1 THEN 2 WHEN 2 THEN 1 END WHERE empresaid IN (1,2);
UPDATE producto             SET empresaid = CASE empresaid WHEN 1 THEN 2 WHEN 2 THEN 1 END WHERE empresaid IN (1,2);
UPDATE usuario              SET empresaid = CASE empresaid WHEN 1 THEN 2 WHEN 2 THEN 1 END WHERE empresaid IN (1,2);
UPDATE vendedor             SET empresaid = CASE empresaid WHEN 1 THEN 2 WHEN 2 THEN 1 END WHERE empresaid IN (1,2);
UPDATE venta                SET empresaid = CASE empresaid WHEN 1 THEN 2 WHEN 2 THEN 1 END WHERE empresaid IN (1,2);
-- Padre empresa (PK): baile con id temporal.
UPDATE empresa SET empresaid = 901 WHERE empresaid = 1;
UPDATE empresa SET empresaid = 1   WHERE empresaid = 2;
UPDATE empresa SET empresaid = 2   WHERE empresaid = 901;

-- ---- SWAP localid 1 <-> 2 (tablas hijas) ----
UPDATE almacen  SET localid = CASE localid WHEN 1 THEN 2 WHEN 2 THEN 1 END WHERE localid IN (1,2);
UPDATE caja     SET localid = CASE localid WHEN 1 THEN 2 WHEN 2 THEN 1 END WHERE localid IN (1,2);
UPDATE producto SET localid = CASE localid WHEN 1 THEN 2 WHEN 2 THEN 1 END WHERE localid IN (1,2);
UPDATE usuario  SET localid = CASE localid WHEN 1 THEN 2 WHEN 2 THEN 1 END WHERE localid IN (1,2);
-- Padre local (PK): baile con id temporal.
UPDATE local SET localid = 901 WHERE localid = 1;
UPDATE local SET localid = 1   WHERE localid = 2;
UPDATE local SET localid = 2   WHERE localid = 901;

-- ---- SWAP almacenid 1 <-> 2 (tablas hijas) ----
UPDATE productoalmacen SET almacenid = CASE almacenid WHEN 1 THEN 2 WHEN 2 THEN 1 END WHERE almacenid IN (1,2);
UPDATE venta           SET almacenid = CASE almacenid WHEN 1 THEN 2 WHEN 2 THEN 1 END WHERE almacenid IN (1,2);
-- Padre almacen (PK): baile con id temporal.
UPDATE almacen SET almacenid = 901 WHERE almacenid = 1;
UPDATE almacen SET almacenid = 1   WHERE almacenid = 2;
UPDATE almacen SET almacenid = 2   WHERE almacenid = 901;

-- Recrear el índice único (un almacén por local).
CREATE UNIQUE INDEX uq_almacen_local ON almacen(LocalId) WHERE LocalId IS NOT NULL;

-- ------------------------------------------------------------
-- 2. Reactivar triggers y resetear las secuencias al máximo id.
-- ------------------------------------------------------------
SET session_replication_role = DEFAULT;

SELECT setval('empresa_empresaid_seq', (SELECT MAX(empresaid) FROM empresa));
SELECT setval('local_localid_seq',     (SELECT MAX(localid)   FROM local));
SELECT setval('almacen_almacenid_seq', (SELECT MAX(almacenid) FROM almacen));

COMMIT;

-- ============================================================
-- VERIFICACIÓN
-- SELECT empresaid, empresanombre, empresatipo FROM empresa ORDER BY empresaid;
-- SELECT localid, localnombre, empresaid FROM local ORDER BY localid;
-- SELECT almacenid, almacennombre, localid, empresaid FROM almacen ORDER BY almacenid;
-- SELECT empresaid, COUNT(*) FROM producto GROUP BY empresaid;   -- bodega ahora emp 2
-- SELECT almacenid, COUNT(*) FROM venta GROUP BY almacenid;      -- ventas en almacén 2
-- ============================================================
