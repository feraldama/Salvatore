-- ============================================================
-- MIGRACIÓN 030: TERMINALES (puesto de trabajo físico)
-- ============================================================
-- Cierra la mitad que la 029 no cubre. Con la caja por cajero, el cajero ya no
-- elige caja; pero su caja lleva pegada la sucursal donde fue creada, así que
-- cuando va a cubrir a otra bodega sigue vendiendo contra el depósito de la
-- suya. El sistema no tiene forma de saber dónde está parado... salvo por una
-- cosa que no se mueve: la computadora.
--
-- Una terminal es una PC registrada en una sucursal. El navegador guarda un
-- identificador propio y lo manda en cada request (X-Terminal-Id); el servidor
-- resuelve la sucursal y el depósito de la operación desde ahí, no desde el
-- usuario. El cajero no elige, no confirma y no puede equivocarse: se sienta y
-- vende contra la bodega donde está la máquina.
--
-- El alta la hace un administrador, una vez por equipo. Una PC sin registrar
-- deja entrar al sistema pero no deja vender ni mover caja — que era el pedido
-- original: que no pueda operar hasta que la sucursal esté bien puesta.
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

CREATE TABLE IF NOT EXISTS terminal (
  -- Identificador generado por el navegador (UUID v4). No es un secreto: el
  -- control real es que un admin tuvo que darlo de alta contra una sucursal.
  TerminalId            VARCHAR(36)  PRIMARY KEY,
  TerminalNombre        VARCHAR(60)  NOT NULL DEFAULT '',
  LocalId               INTEGER      NOT NULL REFERENCES local(LocalId),
  -- 'A' activa | 'I' dada de baja (PC reemplazada, robada, reasignada).
  TerminalEstado        VARCHAR(1)   NOT NULL DEFAULT 'A',
  TerminalRegistradaPor VARCHAR(25)  REFERENCES usuario(UsuarioId),
  TerminalRegistradaEn  TIMESTAMP    NOT NULL DEFAULT now(),
  -- Rastro de uso: sirve para reconocer equipos que dejaron de aparecer y para
  -- detectar una terminal registrada en la sucursal equivocada (si una PC de
  -- CENTRAL empieza a aparecer desde la IP de SUCURSAL, algo se movió).
  TerminalUltimoUso     TIMESTAMP,
  TerminalUltimaIp      VARCHAR(45)
);

CREATE INDEX IF NOT EXISTS terminal_localid_idx ON terminal (LocalId);

COMMIT;

-- ============================================================
-- VERIFICACIÓN
--   SELECT t.terminalid, t.terminalnombre, l.localnombre, t.terminalestado,
--          t.terminalultimouso, t.terminalultimaip
--     FROM terminal t JOIN local l ON l.localid = t.localid
--    ORDER BY l.localnombre, t.terminalnombre;
-- Terminales que no se usan hace más de 30 días (candidatas a baja):
--   SELECT terminalid, terminalnombre FROM terminal
--    WHERE terminalestado='A'
--      AND (terminalultimouso IS NULL OR terminalultimouso < now() - interval '30 days');
-- ============================================================
