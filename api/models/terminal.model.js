// Terminales: cada PC registrada contra una sucursal (migración 030).
// La terminal es la única señal del sistema sobre DÓNDE está parado el cajero:
// no se le pregunta y no se deriva de su ficha, se lee del equipo.
const db = require("../config/db");

// Throttle del rastro de uso (ver marcarUso). Se pierde al reiniciar el
// proceso, que es exactamente lo que se quiere: tras un reinicio conviene
// volver a registrar el uso enseguida.
const USO_TTL_MS = 10 * 60 * 1000;
const ultimoUsoEnMemoria = new Map();

const Terminal = {
  // Terminal activa por su id, con el nombre y la empresa de su sucursal.
  // null = no registrada (o dada de baja): no se puede operar desde ahí.
  getActiva: (terminalId) => {
    return new Promise((resolve, reject) => {
      db.query(
        `SELECT t.*, l.LocalNombre, l.EmpresaId
           FROM terminal t
           JOIN local l ON l.LocalId = t.LocalId
          WHERE TRIM(t.TerminalId) = ? AND t.TerminalEstado = 'A'
          LIMIT 1`,
        [String(terminalId || "").trim()],
        (err, results) => {
          if (err) return reject(err);
          resolve(results.length > 0 ? results[0] : null);
        }
      );
    });
  },

  // Incluye las dadas de baja: la pantalla de administración las muestra para
  // poder reactivarlas.
  getById: (terminalId) => {
    return new Promise((resolve, reject) => {
      db.query(
        `SELECT t.*, l.LocalNombre, l.EmpresaId
           FROM terminal t
           LEFT JOIN local l ON l.LocalId = t.LocalId
          WHERE TRIM(t.TerminalId) = ?
          LIMIT 1`,
        [String(terminalId || "").trim()],
        (err, results) => {
          if (err) return reject(err);
          resolve(results.length > 0 ? results[0] : null);
        }
      );
    });
  },

  getAll: () => {
    return new Promise((resolve, reject) => {
      db.query(
        `SELECT t.*, l.LocalNombre
           FROM terminal t
           LEFT JOIN local l ON l.LocalId = t.LocalId
          ORDER BY l.LocalNombre, t.TerminalNombre`,
        [],
        (err, results) => {
          if (err) return reject(err);
          resolve(results || []);
        }
      );
    });
  },

  // Alta o reactivación. Si el equipo ya existía (se dio de baja y vuelve, o se
  // reasignó a otra sucursal), se actualiza en vez de fallar por PK duplicada.
  registrar: ({ terminalId, nombre, localId, registradaPor }) => {
    return new Promise((resolve, reject) => {
      db.query(
        `INSERT INTO terminal
           (TerminalId, TerminalNombre, LocalId, TerminalEstado, TerminalRegistradaPor)
         VALUES (?, ?, ?, 'A', ?)
         ON CONFLICT (TerminalId) DO UPDATE
            SET TerminalNombre = EXCLUDED.TerminalNombre,
                LocalId = EXCLUDED.LocalId,
                TerminalEstado = 'A',
                TerminalRegistradaPor = EXCLUDED.TerminalRegistradaPor,
                TerminalRegistradaEn = now()`,
        [
          String(terminalId).trim(),
          String(nombre || "").trim(),
          Number(localId),
          registradaPor || null,
        ],
        (err) => {
          if (err) return reject(err);
          Terminal.getById(terminalId).then(resolve).catch(reject);
        }
      );
    });
  },

  update: (terminalId, { nombre, localId, estado }) => {
    return new Promise((resolve, reject) => {
      db.query(
        `UPDATE terminal
            SET TerminalNombre = COALESCE(?, TerminalNombre),
                LocalId        = COALESCE(?, LocalId),
                TerminalEstado = COALESCE(?, TerminalEstado)
          WHERE TRIM(TerminalId) = ?`,
        [
          nombre ?? null,
          localId != null ? Number(localId) : null,
          estado ?? null,
          String(terminalId).trim(),
        ],
        (err, result) => {
          if (err) return reject(err);
          if (result.affectedRows === 0) return resolve(null);
          Terminal.getById(terminalId).then(resolve).catch(reject);
        }
      );
    });
  },

  // Rastro de uso: si una PC de una sucursal empieza a aparecer desde la IP de
  // otra, el dato queda para auditarlo.
  //
  // Se llama desde el middleware, o sea en CADA request. Escribir siempre serían
  // miles de UPDATE diarios sobre la misma fila — y todos peleando por el mismo
  // lock — para un dato cuya utilidad es saber "esta PC se usó hoy". Se escribe
  // como mucho una vez cada TTL, y también cuando cambia la IP, que es
  // justamente el evento que interesa no perderse.
  // No se espera el resultado: que falle no puede tumbar una venta.
  marcarUso: (terminalId, ip) => {
    const id = String(terminalId || "").trim();
    const ipCorta = String(ip || "").slice(0, 45);
    const ahora = Date.now();
    const visto = ultimoUsoEnMemoria.get(id);
    if (visto && visto.ip === ipCorta && ahora - visto.ts < USO_TTL_MS) return;
    ultimoUsoEnMemoria.set(id, { ip: ipCorta, ts: ahora });
    db.query(
      `UPDATE terminal
          SET TerminalUltimoUso = now(), TerminalUltimaIp = ?
        WHERE TRIM(TerminalId) = ?`,
      [ipCorta, id],
      (err) => {
        if (err) console.warn("[terminal] no se pudo marcar el uso:", err.message);
      }
    );
  },
};

module.exports = Terminal;
