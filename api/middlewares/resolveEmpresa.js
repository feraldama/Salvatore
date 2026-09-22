// Resuelve el SCOPE del request: empresa activa + local (sucursal) activo.
//
// Empresa (req.empresaId):
//   - Admin (UsuarioIsAdmin=S): usa X-Empresa-Id del header (elegida en el frontend).
//   - Usuario regular: usa EmpresaId del JWT.
//
// Local / sucursal — DOS scopes distintos:
//
// req.localOperativoId = dónde está FÍSICAMENTE el usuario, según la terminal
//   registrada (X-Terminal-Id, migración 030). Manda para operar: vender,
//   devolver, abrir y cerrar caja. Vale para todos, admins incluidos. null = no
//   hay terminal registrada en este equipo.
//
// req.localId = qué sucursal MIRA (listados y reportes):
//   - Usuario regular con terminal: la de la terminal — no tiene switcher y lo
//     que le interesa ver es la bodega donde está trabajando.
//   - Admin: X-Local-Id del header; null = TODAS las sucursales de la empresa
//     activa (vista agregada). Mirar otra sucursal es legítimo; operar contra
//     otra sucursal desde este equipo, no.
//   - Usuario regular sin terminal: su LocalId del JWT es fijo. LocalId 0
//     ("TODOS") se trata como null = sin restricción (datos viejos).
//
// Almacén (req.almacenId):
//   - Admin: el almacén de la sucursal activa (X-Local-Id) dentro de la empresa
//     activa. NO se usa el AlmacenId del JWT: es fijo y puede ser de OTRA
//     empresa — leer stock de ese almacén mostraba 0 en todo el catálogo de la
//     otra empresa. Sin sucursal elegida queda null = stock global de producto.
//   - Usuario regular: su almacén del JWT (uno por local).
//
// Diseño: un único middleware en vez de uno por scope para no tocar las ~20
// rutas que ya montan resolveEmpresa.

const Almacen = require("../models/almacen.model");
const Terminal = require("../models/terminal.model");
const db = require("../config/db");

// El LocalId viaja dentro del JWT, que dura lo que diga JWT_EXPIRES_IN (1 día
// por defecto). Cuando un admin corrige la sucursal de un usuario, el token
// viejo sigue afirmando la sucursal vieja hasta que expire: el cajero sigue
// vendiendo y descontando stock del local equivocado durante todo ese rato,
// justo después de que alguien se dio cuenta del error y lo corrigió.
// Acá se contrasta el LocalId del token contra el de la BD en cada request y se
// corta la sesión si cambió. Caché corto para no pegarle a la BD en cada uno.
const TTL_CACHE_MS = 30000;
const cacheLocalUsuario = new Map();

async function getLocalActualUsuario(usuarioId) {
  const key = String(usuarioId);
  const hit = cacheLocalUsuario.get(key);
  if (hit && Date.now() - hit.ts < TTL_CACHE_MS) return hit.localId;
  const [rows] = await db
    .promise()
    .query("SELECT LocalId FROM usuario WHERE TRIM(UsuarioId) = ? LIMIT 1", [
      key.trim(),
    ]);
  const localId = rows.length ? toIntOrNull(rows[0].LocalId) : null;
  cacheLocalUsuario.set(key, { localId, ts: Date.now() });
  return localId;
}

function toIntOrNull(value) {
  if (value == null || value === "") return null;
  const n = parseInt(value, 10);
  return Number.isNaN(n) ? null : n;
}

module.exports = async (req, res, next) => {
  const isAdmin = req.user?.isAdmin === "S";

  // TERMINAL (migración 030): si el request llega desde un equipo registrado, su
  // sucursal manda sobre la de la ficha del usuario. Es la única señal que dice
  // dónde está parado el cajero, y no se la inventa nadie: la PC no se mueve.
  // Un cajero que va a cubrir a otra bodega vende contra esa bodega sin elegir
  // nada y sin que se le pueda olvidar.
  req.terminal = null;
  const terminalId = String(req.headers["x-terminal-id"] || "").trim();
  if (terminalId) {
    try {
      const t = await Terminal.getActiva(terminalId);
      if (t) {
        req.terminal = {
          id: String(t.TerminalId).trim(),
          nombre: t.TerminalNombre,
          localId: toIntOrNull(t.LocalId),
          localNombre: t.LocalNombre,
          empresaId: toIntOrNull(t.EmpresaId),
        };
        Terminal.marcarUso(req.terminal.id, req.ip);
      }
    } catch {
      // Una falla al resolver la terminal no puede tumbar el request: se sigue
      // con el scope del usuario, y las operaciones que exigen terminal
      // (vender, mover caja) la piden por su cuenta más adelante.
    }
  }

  // SUCURSAL OPERATIVA vs. SUCURSAL DE LECTURA. Son dos cosas distintas y hasta
  // acá estaban mezcladas en req.localId:
  //   - req.localOperativoId = DÓNDE ESTÁ el usuario (la terminal). Manda para
  //     vender, devolver y mover caja. Vale para todos, admins incluidos: un
  //     admin sentado en CENTRAL está en CENTRAL aunque su switcher diga otra
  //     cosa, y su venta tiene que descontar de CENTRAL.
  //   - req.localId = QUÉ MIRA (el switcher del admin). Sigue siendo libre para
  //     reportes y consultas: ver las ventas de otra sucursal es legítimo,
  //     vender contra otra sucursal desde acá no.
  // Sin esta separación, el admin en la PC de CENTRAL con el switcher en
  // SUCURSAL recibía "aperturá una caja de SUCURSAL" — pidiéndole exactamente
  // lo incorrecto para donde está parado.
  req.localOperativoId = req.terminal ? req.terminal.localId : null;

  // Para el usuario regular la terminal define además lo que ve: no tiene
  // switcher, y su scope de lectura es la bodega donde está trabajando.
  if (req.terminal && !isAdmin) {
    req.empresaId = req.terminal.empresaId || 1;
    req.localId = req.terminal.localId;
    try {
      const almacen = await Almacen.getByLocal(req.localId, req.empresaId);
      req.almacenId = toIntOrNull(almacen?.AlmacenId);
    } catch {
      req.almacenId = null;
    }
    // Aun con terminal, un cambio de sucursal en la ficha del usuario invalida
    // la sesión: el token viejo sigue afirmando cosas que ya no son ciertas.
    if (req.user?.id) {
      try {
        const localBD = await getLocalActualUsuario(req.user.id);
        const localToken = toIntOrNull(req.user?.LocalId);
        if (localBD != null && localBD !== localToken) {
          return res.status(401).json({
            success: false,
            sessionInvalid: true,
            message:
              "Tu sucursal fue modificada. Volvé a iniciar sesión para seguir operando.",
          });
        }
      } catch {
        // BD momentáneamente caída: el token vale hasta su expiración normal.
      }
    }
    return next();
  }

  if (isAdmin) {
    req.empresaId = toIntOrNull(req.headers["x-empresa-id"]) ?? 1;
    req.localId = toIntOrNull(req.headers["x-local-id"]); // null = todas las sucursales
    req.almacenId = null;
    if (req.localId != null) {
      try {
        const almacen = await Almacen.getByLocal(req.localId, req.empresaId);
        req.almacenId = toIntOrNull(almacen?.AlmacenId);
      } catch {
        // Sin almacén resoluble se sigue con la vista agregada (stock global);
        // no vale la pena tumbar el request por esto.
        req.almacenId = null;
      }
    }
  } else {
    // La sucursal del token tiene que seguir siendo la que dice la BD.
    if (req.user?.id) {
      try {
        const localBD = await getLocalActualUsuario(req.user.id);
        const localToken = toIntOrNull(req.user?.LocalId);
        if (localBD != null && localBD !== localToken) {
          return res.status(401).json({
            success: false,
            sessionInvalid: true,
            message:
              "Tu sucursal fue modificada. Volvé a iniciar sesión para seguir operando.",
          });
        }
      } catch {
        // Si la verificación falla (BD momentáneamente caída), no se tumba el
        // request: el token sigue siendo válido hasta su expiración normal.
      }
    }

    req.empresaId = req.user?.EmpresaId || 1;
    const lid = toIntOrNull(req.user?.LocalId);
    req.localId = lid && lid !== 0 ? lid : null; // 0 = TODOS = sin restricción
    req.almacenId = toIntOrNull(req.user?.AlmacenId);
  }

  next();
};
