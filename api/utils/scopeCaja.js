// Resuelve el scope FÍSICO de una operación de caja (venta, devolución, cobro).
//
// Hasta acá el dinero y el stock viajaban por ejes separados: CajaId movía la
// plata (registrodiariocaja + caja.CajaMonto) y AlmacenOrigenId movía el stock
// (productoalmacen), los dos sueltos en el body y sin nada que los atara.
// Mientras el listado de cajas estuvo limitado al local del JWT los dos caían
// en la misma sucursal por accidente; en cuanto un cajero pueda operar en más
// de un local, la MISMA venta puede dejar la plata en la caja de una sucursal y
// descontar el stock del depósito de otra.
//
// Acá el almacén deja de ser un dato que manda el cliente: se deriva del local
// de la caja que el usuario tiene REALMENTE aperturada. El cajero puede seguir
// equivocándose de caja (eso lo cierra la terminal por puesto), pero el error
// ya no se parte en dos: plata y mercadería salen siempre del mismo local.
const db = require("../config/db");
const Almacen = require("../models/almacen.model");
const RegistroDiarioCaja = require("../models/registrodiariocaja.model");

// Exigir terminal registrada para poder operar. Se arranca APAGADO: el día del
// deploy ninguna PC está dada de alta todavía y prender esto de entrada dejaría
// a todo el mundo sin vender. Se registran los equipos con el sistema andando y
// recién cuando están todos se pone TERMINAL_OBLIGATORIA=S en el .env.
//
// Apagado no significa sin control: una terminal registrada SIEMPRE manda,
// prendido o apagado. El flag solo decide qué pasa con las PC que todavía no
// figuran — dejarlas operar como hasta ahora, o frenarlas.
const terminalObligatoria = () =>
  String(process.env.TERMINAL_OBLIGATORIA || "N").toUpperCase() === "S";

// Contrasta la caja contra el equipo desde el que llega la operación.
// Devuelve null si está todo bien, o el rechazo listo para responder.
function validarContraTerminal(terminal, caja) {
  if (!terminal) {
    if (!terminalObligatoria()) return null;
    return {
      ok: false,
      status: 400,
      needTerminal: true,
      message:
        "Este equipo no está registrado en ninguna sucursal. Pedile a un administrador que lo registre antes de operar.",
    };
  }
  if (
    terminal.localId != null &&
    Number(terminal.localId) !== Number(caja.LocalId)
  ) {
    return {
      ok: false,
      status: 400,
      needCaja: true,
      message: `Estás en ${terminal.localNombre} y tu caja ("${caja.CajaDescripcion}") es de otra sucursal. Pedile a un administrador una caja de ${terminal.localNombre} para poder trabajar acá.`,
    };
  }
  return null;
}

// Devuelve { ok: true, cajaId, localId, almacenId, cajaDescripcion }
// o { ok: false, status, message, needCaja? } listo para responder.
//
// localActivoId: sucursal elegida en el switcher (solo la mandan los admins).
// Si viene y no coincide con la sucursal de la caja aperturada, se corta con un
// mensaje explícito en vez de resolver callado: el admin cree estar vendiendo de
// una sucursal y la plata iría a la caja de otra.
//
// terminal: el equipo desde el que llega la operación (migración 030). Si está
// registrado, su sucursal es la verdad sobre dónde está parado el cajero, y la
// caja tiene que ser de esa misma sucursal.
async function resolverScopeCaja({
  cajaId,
  usuarioId,
  empresaId,
  localActivoId,
  terminal,
}) {
  const idCaja = Math.round(Number(cajaId) || 0);
  const idUsuario = String(usuarioId || "").trim();

  if (!idCaja) {
    return {
      ok: false,
      status: 400,
      message: "Falta la caja de la operación.",
      needCaja: true,
    };
  }
  if (!idUsuario) {
    return { ok: false, status: 400, message: "Falta el usuario de la operación." };
  }

  // 1. La caja existe y es de la empresa activa.
  const [cajaRows] = await db
    .promise()
    .query(
      "SELECT CajaId, CajaDescripcion, EmpresaId, LocalId FROM caja WHERE CajaId = ?",
      [idCaja]
    );
  if (!cajaRows.length) {
    return { ok: false, status: 400, message: `La caja ${idCaja} no existe.` };
  }
  const caja = cajaRows[0];
  if (Number(caja.EmpresaId) !== Number(empresaId || 1)) {
    return {
      ok: false,
      status: 400,
      message: "La caja no pertenece a la empresa activa.",
    };
  }

  // 2. Esa caja es la que el usuario tiene aperturada AHORA. Sin este check, el
  //    CajaId del body es una afirmación del cliente que nadie contrasta.
  const estado = await RegistroDiarioCaja.getEstadoAperturaPorUsuario(idUsuario);
  const tieneAbierta = estado && estado.aperturaId > estado.cierreId;
  if (!tieneAbierta) {
    return {
      ok: false,
      status: 400,
      message: "No tenés una caja aperturada. Aperturá caja antes de operar.",
      needCaja: true,
    };
  }
  if (Number(estado.cajaId) !== idCaja) {
    return {
      ok: false,
      status: 400,
      message:
        "La caja enviada no es la que tenés aperturada. Cerrá la caja abierta o volvé a entrar a la pantalla de ventas.",
      needCaja: true,
    };
  }

  // 3. Sucursal de la caja -> almacén de esa sucursal. Una caja sin LocalId es
  //    un dato incompleto de configuración: no se puede saber de qué depósito
  //    sale la mercadería, así que no se adivina.
  if (caja.LocalId == null) {
    return {
      ok: false,
      status: 400,
      message: `La caja "${caja.CajaDescripcion}" no tiene sucursal asignada. Avisá al administrador para corregirla antes de operar.`,
    };
  }
  const almacen = await Almacen.getByLocal(caja.LocalId, Number(empresaId || 1));
  if (!almacen) {
    return {
      ok: false,
      status: 400,
      message: `La sucursal de la caja "${caja.CajaDescripcion}" no tiene un depósito asociado. Avisá al administrador.`,
    };
  }

  // 4. Si el usuario tiene caja EN LA SUCURSAL DONDE ESTÁ (migración 031), tiene
  //    que ser ESA. El frontend ya no le ofrece elegir, pero el backend no puede
  //    confiar en eso: una pantalla vieja en caché o un request armado a mano
  //    seguirían pudiendo mandar la caja de un compañero.
  //    Se filtra por la sucursal de la caja enviada — que el paso 5 obliga a ser
  //    la de la terminal —, así el cajero que cubre en otra bodega y tiene caja
  //    propia allá opera con esa, y no se le reclama la de su bodega habitual.
  const [propiaRows] = await db
    .promise()
    .query(
      "SELECT CajaId, CajaDescripcion FROM caja WHERE TRIM(UsuarioId) = ? AND LocalId = ?",
      [idUsuario, caja.LocalId]
    );
  if (propiaRows.length && Number(propiaRows[0].CajaId) !== idCaja) {
    return {
      ok: false,
      status: 400,
      message: `Tu caja acá es "${propiaRows[0].CajaDescripcion}" y la operación vino contra otra ("${caja.CajaDescripcion}"). Cerrá la caja que tenés abierta y aperturá la tuya.`,
      needCaja: true,
    };
  }

  // 5. La caja tiene que ser de la sucursal donde está el equipo. Acá se corta
  //    el caso que abrió todo esto: el cajero de SUCURSAL que va a cubrir a
  //    CENTRAL. Si tiene caja propia en CENTRAL, opera con esa sin hacer nada;
  //    si no la tiene, no lo dejamos vender contra el depósito equivocado.
  const errTerminal = validarContraTerminal(terminal, caja);
  if (errTerminal) return errTerminal;

  // 6. Coherencia con el switcher de sucursal (admins) SOLO cuando no hay
  //    terminal registrada. Con terminal, el equipo ya dijo dónde está el
  //    usuario y el switcher es apenas una vista de lectura: hacerlo mandar acá
  //    le pedía al admin parado en CENTRAL que aperturara una caja de SUCURSAL.
  const localActivo = terminal ? 0 : Math.round(Number(localActivoId) || 0);
  if (localActivo && localActivo !== Number(caja.LocalId)) {
    const [locRows] = await db
      .promise()
      .query(
        "SELECT LocalId, LocalNombre FROM local WHERE LocalId IN (?, ?)",
        [localActivo, caja.LocalId]
      );
    const nombre = (id) =>
      locRows.find((l) => Number(l.LocalId) === Number(id))?.LocalNombre ||
      `sucursal ${id}`;
    return {
      ok: false,
      status: 400,
      message: `Tenés activa la sucursal ${nombre(
        localActivo
      )} pero la caja aperturada ("${caja.CajaDescripcion}") es de ${nombre(
        caja.LocalId
      )}. Aperturá una caja de la sucursal en la que estás vendiendo.`,
      needCaja: true,
    };
  }

  return {
    ok: true,
    cajaId: idCaja,
    localId: Number(caja.LocalId),
    almacenId: Number(almacen.AlmacenId),
    cajaDescripcion: caja.CajaDescripcion,
  };
}

// El cliente sigue mandando AlmacenOrigenId (lo hará hasta que la terminal por
// puesto lo vuelva innecesario). No se bloquea por la discrepancia — el valor
// bueno ya es el derivado —, pero se deja rastro: si aparece en los logs es que
// el frontend está resolviendo el almacén por un camino distinto al de la caja.
function avisarAlmacenDiscrepante({ recibido, derivado, cajaId, usuarioId }) {
  const rec = Math.round(Number(recibido) || 0);
  if (rec && rec !== Number(derivado)) {
    console.warn(
      `[scopeCaja] AlmacenOrigenId del body (${rec}) != almacén de la caja ${cajaId} (${derivado}). Usuario: ${usuarioId}. Se usa el de la caja.`
    );
  }
}

module.exports = {
  resolverScopeCaja,
  avisarAlmacenDiscrepante,
  validarContraTerminal,
};
