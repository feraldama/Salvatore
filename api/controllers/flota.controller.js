const Flota = require("../models/flota.model");
const Usuario = require("../models/usuario.model");

const num = (v) =>
  v === undefined || v === null || v === "" ? null : Number(v);

// ¿El error de PG es por violación de llave foránea? (vehículo/chofer con
// envíos, viajes, etc. asociados). code 23503 = foreign_key_violation.
const esFkViolation = (e) => e && (e.code === "23503" || /foreign key/i.test(e.message || ""));

// ── Config ──────────────────────────────────────────────────────────────────
exports.getConfig = async (req, res) => {
  try {
    const cfg = await Flota.getConfig();
    res.json({
      permanencia_umbral_minutos: cfg.permanencia_umbral_minutos,
      permanencia_radio_metros: cfg.permanencia_radio_metros,
      ubicacion_intervalo_segundos: cfg.ubicacion_intervalo_segundos,
      permanencia_rol_alerta: cfg.permanencia_rol_alerta,
      gps_obligatorio: !!cfg.gps_obligatorio,
      ubicacion_retencion_dias: cfg.ubicacion_retencion_dias,
    });
  } catch (e) {
    console.error("flota/config", e);
    res.status(500).json({ message: "Error al obtener config de flota" });
  }
};

// ── Vehículos activos (selector de envío en el POS mayorista) ───────────────
// ?all=1 → listado completo (incluye inactivos + km + cantidad de choferes)
// para el ABM del dashboard. Sin parámetro → versión liviana para el POS.
exports.getVehiculosActivos = async (req, res) => {
  try {
    if (req.query.all === "1" || req.query.all === "true") {
      return res.json(await Flota.listVehiculos(true));
    }
    res.json(await Flota.getVehiculosActivos());
  } catch (e) {
    console.error("flota/vehiculos", e);
    res.status(500).json({ message: "Error al obtener vehículos" });
  }
};

// ── Chofer: vehículos y pendientes ────────────────────────────────────────
exports.getMisVehiculos = async (req, res) => {
  try {
    res.json(await Flota.getMisVehiculos(req.user.id));
  } catch (e) {
    console.error("flota/vehiculos/mis", e);
    res.status(500).json({ message: "Error al obtener vehículos" });
  }
};

exports.getMisPendientes = async (req, res) => {
  try {
    res.json(await Flota.getMisPendientes(req.user.id));
  } catch (e) {
    console.error("flota/mantenimiento/mis-pendientes", e);
    res.status(500).json({ message: "Error al obtener pendientes" });
  }
};

// ── Chofer: viaje ───────────────────────────────────────────────────────────
exports.getViajeActivo = async (req, res) => {
  try {
    res.json({ viaje: await Flota.getViajeActivo(req.user.id) });
  } catch (e) {
    console.error("flota/viajes/activo", e);
    res.status(500).json({ message: "Error al obtener viaje activo" });
  }
};

exports.iniciarViaje = async (req, res) => {
  try {
    const vehiculoId = num(req.body.vehiculo_id);
    const lat = num(req.body.lat);
    const lng = num(req.body.lng);
    if (!vehiculoId || lat === null || lng === null) {
      return res
        .status(400)
        .json({ message: "vehiculo_id, lat y lng son requeridos" });
    }
    const asignado = await Flota.vehiculoAsignado(req.user.id, vehiculoId);
    if (!asignado) {
      return res
        .status(403)
        .json({ message: "El vehículo no está asignado a este chofer" });
    }
    const activo = await Flota.getViajeActivo(req.user.id);
    if (activo) {
      return res.status(409).json({ message: "Ya tenés un viaje en curso" });
    }
    const viaje = await Flota.iniciarViaje(req.user.id, {
      vehiculo_id: vehiculoId,
      lat,
      lng,
      accuracy: num(req.body.accuracy),
    });
    res.json(viaje);
  } catch (e) {
    console.error("flota/viajes/iniciar", e);
    res.status(500).json({ message: "Error al iniciar viaje" });
  }
};

exports.terminarViaje = async (req, res) => {
  try {
    const viaje = await Flota.terminarViaje(req.user.id, {
      lat: num(req.body.lat),
      lng: num(req.body.lng),
      accuracy: num(req.body.accuracy),
      capturado_en: req.body.capturado_en || null,
    });
    if (!viaje) {
      return res.status(409).json({ message: "No hay viaje en curso" });
    }
    res.json(viaje);
  } catch (e) {
    console.error("flota/viajes/terminar", e);
    res.status(500).json({ message: "Error al terminar viaje" });
  }
};

// ── Chofer: ubicación ───────────────────────────────────────────────────────
exports.reportarUbicacion = async (req, res) => {
  try {
    const activo = await Flota.getViajeActivo(req.user.id);
    if (!activo) return res.status(200).json({ ok: true, insertados: 0 });
    await Flota.insertUbicaciones(req.user.id, activo.id, [
      {
        lat: num(req.body.lat),
        lng: num(req.body.lng),
        accuracy: num(req.body.accuracy),
        capturado_en: req.body.capturado_en || null,
      },
    ]);
    res.json({ ok: true, insertados: 1 });
  } catch (e) {
    console.error("flota/ubicacion/mobile", e);
    res.status(500).json({ message: "Error al reportar ubicación" });
  }
};

exports.reportarUbicacionBatch = async (req, res) => {
  try {
    const puntos = Array.isArray(req.body.puntos) ? req.body.puntos : [];
    const activo = await Flota.getViajeActivo(req.user.id);
    if (!activo) return res.status(200).json({ ok: true, insertados: 0 });
    const limpios = puntos
      .map((p) => ({
        lat: num(p.lat),
        lng: num(p.lng),
        accuracy: num(p.accuracy),
        capturado_en: p.capturado_en || null,
      }))
      .filter((p) => p.lat !== null && p.lng !== null);
    const insertados = await Flota.insertUbicaciones(
      req.user.id,
      activo.id,
      limpios
    );
    res.json({ ok: true, insertados });
  } catch (e) {
    console.error("flota/ubicacion/mobile/batch", e);
    res.status(500).json({ message: "Error al reportar ubicaciones" });
  }
};

// ── Chofer: combustible ─────────────────────────────────────────────────────
exports.getMisCargas = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const { data, total } = await Flota.getMisCargas(req.user.id, limit, offset);
    res.json({
      data,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (e) {
    console.error("flota/cargas-combustible/mis", e);
    res.status(500).json({ message: "Error al obtener cargas" });
  }
};

exports.crearCarga = async (req, res) => {
  try {
    const vehiculoId = num(req.body.vehiculo_id);
    if (!vehiculoId) {
      return res.status(400).json({ message: "vehiculo_id es requerido" });
    }
    const asignado = await Flota.vehiculoAsignado(req.user.id, vehiculoId);
    if (!asignado) {
      return res
        .status(403)
        .json({ message: "El vehículo no está asignado a este chofer" });
    }
    const files = req.files || {};
    const tableroPath = files.tablero?.[0]
      ? `/uploads/flota/${files.tablero[0].filename}`
      : null;
    const facturaPath = files.factura?.[0]
      ? `/uploads/flota/${files.factura[0].filename}`
      : null;

    const activo = await Flota.getViajeActivo(req.user.id);

    const carga = await Flota.insertCarga(req.user.id, {
      viaje_id: activo ? activo.id : null,
      vehiculo_id: vehiculoId,
      km_odometro: num(req.body.km_odometro),
      litros: num(req.body.litros),
      monto: num(req.body.monto),
      moneda_codigo: num(req.body.moneda_codigo),
      tablero_path: tableroPath,
      tablero_lat: num(req.body.tablero_lat),
      tablero_lng: num(req.body.tablero_lng),
      tablero_acc_m: num(req.body.tablero_accuracy),
      tablero_capturado_en: req.body.tablero_capturado_en || null,
      factura_path: facturaPath,
      factura_lat: num(req.body.factura_lat),
      factura_lng: num(req.body.factura_lng),
      factura_acc_m: num(req.body.factura_accuracy),
      factura_capturado_en: req.body.factura_capturado_en || null,
    });
    res.json({ id: carga.id, viaje_id: carga.viaje_id });
  } catch (e) {
    console.error("flota/cargas-combustible/mobile", e);
    res.status(500).json({ message: "Error al registrar carga" });
  }
};

// ── Gerente: control de flota ───────────────────────────────────────────────
exports.getViajesActivos = async (req, res) => {
  try {
    res.json({ viajes: await Flota.getViajesActivos() });
  } catch (e) {
    console.error("flota/viajes/activos", e);
    res.status(500).json({ message: "Error al obtener viajes activos" });
  }
};

exports.getAtencionRequerida = async (req, res) => {
  try {
    res.json(await Flota.getAtencionRequerida());
  } catch (e) {
    console.error("flota/atencion-requerida", e);
    res.status(500).json({ message: "Error al obtener atención requerida" });
  }
};

exports.getViajeDetalle = async (req, res) => {
  try {
    const detalle = await Flota.getViajeDetalle(req.params.id);
    if (!detalle) return res.status(404).json({ message: "Viaje no encontrado" });
    res.json(detalle);
  } catch (e) {
    console.error("flota/viajes/detalle", e);
    res.status(500).json({ message: "Error al obtener detalle de viaje" });
  }
};

// ══════════════════════════════════════════════════════════════════════════
// ABM de flota (dashboard admin): vehículos, asignación y documentos.
// ══════════════════════════════════════════════════════════════════════════

// ── Vehículos ─────────────────────────────────────────────────────────────
exports.crearVehiculo = async (req, res) => {
  try {
    const chapa = String(req.body.chapa || "").trim();
    if (!chapa) return res.status(400).json({ message: "La chapa es requerida" });
    const veh = await Flota.createVehiculo({
      chapa,
      marca: req.body.marca ? String(req.body.marca).trim() : null,
      modelo: req.body.modelo ? String(req.body.modelo).trim() : null,
      km_actual: num(req.body.km_actual) ?? 0,
      activo: req.body.activo !== false && req.body.activo !== "N",
    });
    res.status(201).json(veh);
  } catch (e) {
    console.error("flota/vehiculos POST", e);
    res.status(500).json({ message: "Error al crear vehículo" });
  }
};

exports.actualizarVehiculo = async (req, res) => {
  try {
    const chapa = String(req.body.chapa || "").trim();
    if (!chapa) return res.status(400).json({ message: "La chapa es requerida" });
    const veh = await Flota.updateVehiculo(req.params.id, {
      chapa,
      marca: req.body.marca ? String(req.body.marca).trim() : null,
      modelo: req.body.modelo ? String(req.body.modelo).trim() : null,
      km_actual: num(req.body.km_actual) ?? 0,
      activo: req.body.activo !== false && req.body.activo !== "N",
    });
    if (!veh) return res.status(404).json({ message: "Vehículo no encontrado" });
    res.json(veh);
  } catch (e) {
    console.error("flota/vehiculos PUT", e);
    res.status(500).json({ message: "Error al actualizar vehículo" });
  }
};

exports.eliminarVehiculo = async (req, res) => {
  try {
    await Flota.deleteVehiculo(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    if (esFkViolation(e)) {
      return res.status(409).json({
        message:
          "No se puede eliminar: el vehículo tiene envíos o viajes asociados. Desactivalo en su lugar.",
      });
    }
    console.error("flota/vehiculos DELETE", e);
    res.status(500).json({ message: "Error al eliminar vehículo" });
  }
};

// ── Asignación de choferes al vehículo ──────────────────────────────────────
exports.getChoferesDeVehiculo = async (req, res) => {
  try {
    const rows = await Flota.getChoferesDeVehiculo(req.params.id);
    res.json(rows.map((r) => r.usuario_id));
  } catch (e) {
    console.error("flota/vehiculos/:id/choferes GET", e);
    res.status(500).json({ message: "Error al obtener choferes del vehículo" });
  }
};

exports.setChoferesDeVehiculo = async (req, res) => {
  try {
    const ids = Array.isArray(req.body.choferIds) ? req.body.choferIds : [];
    await Flota.setChoferesDeVehiculo(req.params.id, ids);
    res.json({ ok: true });
  } catch (e) {
    console.error("flota/vehiculos/:id/choferes PUT", e);
    res.status(500).json({ message: "Error al asignar choferes" });
  }
};

// ── Documentos de vehículo ──────────────────────────────────────────────────
exports.getDocsVehiculo = async (req, res) => {
  try {
    res.json(await Flota.listDocsVehiculo(req.params.id));
  } catch (e) {
    console.error("flota/vehiculos/:id/documentos GET", e);
    res.status(500).json({ message: "Error al obtener documentos" });
  }
};

exports.crearDocVehiculo = async (req, res) => {
  try {
    const tipo = String(req.body.tipo || "").trim().toUpperCase();
    if (!tipo) return res.status(400).json({ message: "El tipo es requerido" });
    const doc = await Flota.createDocVehiculo(req.params.id, {
      tipo,
      vencimiento: req.body.vencimiento || null,
    });
    res.status(201).json(doc);
  } catch (e) {
    console.error("flota/vehiculos/:id/documentos POST", e);
    res.status(500).json({ message: "Error al crear documento" });
  }
};

exports.eliminarDocVehiculo = async (req, res) => {
  try {
    await Flota.deleteDocVehiculo(req.params.docId);
    res.json({ ok: true });
  } catch (e) {
    console.error("flota/documentos-vehiculo DELETE", e);
    res.status(500).json({ message: "Error al eliminar documento" });
  }
};

// ── Documentos de chofer ────────────────────────────────────────────────────
exports.getDocsChofer = async (req, res) => {
  try {
    res.json(await Flota.listDocsChofer(req.params.id));
  } catch (e) {
    console.error("flota/choferes/:id/documentos GET", e);
    res.status(500).json({ message: "Error al obtener documentos" });
  }
};

exports.crearDocChofer = async (req, res) => {
  try {
    const tipo = String(req.body.tipo || "").trim().toUpperCase();
    if (!tipo) return res.status(400).json({ message: "El tipo es requerido" });
    const doc = await Flota.createDocChofer(req.params.id, {
      tipo,
      vencimiento: req.body.vencimiento || null,
    });
    res.status(201).json(doc);
  } catch (e) {
    console.error("flota/choferes/:id/documentos POST", e);
    res.status(500).json({ message: "Error al crear documento" });
  }
};

exports.eliminarDocChofer = async (req, res) => {
  try {
    await Flota.deleteDocChofer(req.params.docId);
    res.json({ ok: true });
  } catch (e) {
    console.error("flota/documentos-chofer DELETE", e);
    res.status(500).json({ message: "Error al eliminar documento" });
  }
};

// ── Choferes (usuarios con perfil CHOFER) ───────────────────────────────────
exports.listChoferes = async (req, res) => {
  try {
    res.json(await Flota.listChoferes());
  } catch (e) {
    console.error("flota/choferes GET", e);
    res.status(500).json({ message: "Error al obtener choferes" });
  }
};

exports.crearChofer = async (req, res) => {
  try {
    const usuarioId = String(req.body.UsuarioId || "").trim();
    const nombre = String(req.body.UsuarioNombre || "").trim();
    const password = req.body.UsuarioContrasena;
    const localId = num(req.body.LocalId);
    if (!usuarioId || !nombre || !password || !localId) {
      return res.status(400).json({
        message: "UsuarioId, UsuarioNombre, contraseña y LocalId son requeridos",
      });
    }
    if (await Flota.existeUsuario(usuarioId)) {
      return res
        .status(409)
        .json({ message: `Ya existe un usuario con el ID '${usuarioId}'` });
    }
    // Reutiliza el alta de usuario (hashea la contraseña) y le asigna el perfil
    // CHOFER para que pueda autenticarse en la app mobile de flota.
    await Usuario.create({
      UsuarioId: usuarioId,
      UsuarioNombre: nombre,
      UsuarioApellido: req.body.UsuarioApellido ?? "",
      UsuarioCorreo: req.body.UsuarioCorreo ?? "",
      UsuarioContrasena: password,
      UsuarioIsAdmin: "N",
      UsuarioEstado: req.body.UsuarioEstado === "I" ? "I" : "A",
      LocalId: localId,
    });
    await Flota.asignarPerfilChofer(usuarioId);
    res.status(201).json({ UsuarioId: usuarioId });
  } catch (e) {
    console.error("flota/choferes POST", e);
    res.status(500).json({ message: "Error al crear chofer" });
  }
};

exports.actualizarChofer = async (req, res) => {
  try {
    const data = {
      UsuarioNombre: req.body.UsuarioNombre,
      UsuarioApellido: req.body.UsuarioApellido,
      UsuarioCorreo: req.body.UsuarioCorreo,
      UsuarioEstado: req.body.UsuarioEstado,
      LocalId: num(req.body.LocalId),
    };
    if (req.body.UsuarioContrasena) {
      data.UsuarioContrasena = req.body.UsuarioContrasena;
    }
    const updated = await Usuario.update(req.params.id, data);
    if (!updated) return res.status(404).json({ message: "Chofer no encontrado" });
    // Por si se editó un usuario que aún no tenía el perfil (idempotente).
    await Flota.asignarPerfilChofer(req.params.id);
    res.json({ UsuarioId: req.params.id });
  } catch (e) {
    console.error("flota/choferes PUT", e);
    res.status(500).json({ message: "Error al actualizar chofer" });
  }
};

exports.eliminarChofer = async (req, res) => {
  try {
    // usuarioperfil no cascadea: hay que quitar los perfiles antes de borrar el
    // usuario. flota_asignacion y flota_documento_chofer sí cascadean. Si el
    // chofer tiene viajes/envíos, el DELETE siguiente fallará por FK (guard).
    await Flota.quitarPerfilesUsuario(req.params.id);
    await Usuario.delete(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    if (esFkViolation(e)) {
      return res.status(409).json({
        message:
          "No se puede eliminar: el chofer tiene viajes o ventas asociadas. Desactivalo (estado Inactivo) en su lugar.",
      });
    }
    console.error("flota/choferes DELETE", e);
    res.status(500).json({ message: "Error al eliminar chofer" });
  }
};
