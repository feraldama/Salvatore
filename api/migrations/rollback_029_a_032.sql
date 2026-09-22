-- ============================================================
-- ROLLBACK de las migraciones 029, 030, 031 y 032
-- ============================================================
-- Para usar SOLO si hay que volver atrás el cambio de "caja por cajero +
-- terminales" después de haberlo desplegado.
--
-- ORDEN CORRECTO PARA REVERTIR:
--   1. Volver el CÓDIGO a la versión anterior (o al menos poner
--      TERMINAL_OBLIGATORIA=N y reiniciar la api).
--   2. Recién entonces correr este script.
-- Al revés no: el código nuevo hace JOIN contra caja.UsuarioId en el login, y
-- sin esa columna nadie puede entrar al sistema.
--
-- QUÉ SE PIERDE al revertir:
--   - La asignación de cajas a cajeros (vuelve el selector de cajas).
--   - El registro de equipos y su sucursal.
-- QUÉ NO SE TOCA:
--   - Ventas, movimientos de caja, montos: este cambio nunca los modificó.
--
-- El código viejo funciona sin problemas con el esquema NUEVO, así que si solo
-- hace falta desactivar el comportamiento, alcanza con volver el código y no
-- correr esto. Revertir el esquema es opcional y casi nunca necesario.
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '10s';

-- 031 + 029: dueño de caja
DROP INDEX IF EXISTS caja_usuario_local_uniq;
DROP INDEX IF EXISTS caja_usuarioid_uniq;
ALTER TABLE caja DROP COLUMN IF EXISTS UsuarioId;

-- 030: terminales
DROP TABLE IF EXISTS terminal;

COMMIT;

-- 032: el índice de rendimiento. Se deja para el final y FUERA de la
-- transacción porque conviene borrarlo igual que se creó, sin bloquear.
-- En realidad casi nunca hay que borrarlo: acelera getEstadoAperturaPorUsuario,
-- que existe desde antes de todo este cambio y se sigue usando en la pantalla
-- de apertura/cierre. Borrarlo solo empeora las cosas.
-- DROP INDEX CONCURRENTLY IF EXISTS registrodiariocaja_usuario_tipo_idx;

-- ============================================================
-- VERIFICACIÓN
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name='caja' AND column_name='usuarioid';   -- no debe devolver nada
--   SELECT to_regclass('terminal');                          -- debe devolver NULL
-- ============================================================
