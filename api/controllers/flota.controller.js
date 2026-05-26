const Flota = require("../models/flota.model");

const num = (v) =>
  v === undefined || v === null || v === "" ? null : Number(v);

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
