-- ============================================================
-- MIGRACIÓN 033: EQUIPOS MÓVILES
-- ============================================================
-- La 030 asume que una PC no se mueve, que es cierto para las de mostrador. No
-- lo es para la notebook del administrador, que un día está en la distribuidora,
-- otro en la bodega central y otro en la sucursal.
--
-- Registrarla la deja clavada a una sucursal: desde cualquier otra bodega el
-- sistema la frena ("estás en CENTRAL y tu caja es de otra sucursal"). Y no
-- registrarla deja de ser opción cuando se prende TERMINAL_OBLIGATORIA.
--
-- Un equipo MÓVIL queda registrado igual —sigue estando declarado y auditado—
-- pero su sucursal no es fija: la define el selector de sucursal que el
-- administrador ya usa, y la barra superior le confirma en todo momento contra
-- cuál está operando.
--
-- Por qué esto no reabre el problema original: la regla de "no preguntar" existe
-- porque el cajero no tiene cómo saber si eligió bien ni cómo detectar el error.
-- El administrador sí: tiene el selector a la vista, ve la sucursal en pantalla,
-- y es quien corrige los descuadres. Además solo puede operar en una sucursal
-- donde tenga caja propia, así que el sistema lo sigue frenando si se equivoca.
--
-- Un equipo móvil NO sirve para cajeros: no tienen selector de sucursal, así que
-- desde uno de estos equipos no pueden operar (se les pide un equipo fijo).
-- Idempotente.
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '10s';

-- 'N' fijo (el caso normal: PC de mostrador) | 'S' móvil (notebook).
ALTER TABLE terminal
  ADD COLUMN IF NOT EXISTS TerminalMovil VARCHAR(1) NOT NULL DEFAULT 'N';

-- LocalId deja de ser obligatorio: en un equipo móvil no significa nada. Se
-- conserva la columna para los equipos fijos, que son la mayoría.
ALTER TABLE terminal ALTER COLUMN LocalId DROP NOT NULL;

COMMIT;

-- ============================================================
-- VERIFICACIÓN
--   SELECT terminalnombre, terminalmovil, localid FROM terminal ORDER BY terminalnombre;
-- Los equipos móviles deben verse con terminalmovil='S'; su localid es
-- irrelevante (puede quedar en NULL).
-- ============================================================
