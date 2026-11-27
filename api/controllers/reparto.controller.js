const Reparto = require("../models/reparto.model");
const { sendError, isSafeMessage } = require("../utils/errors");

// Los errores de negocio del modelo vienen como { status, message }.
function fail(res, err, contexto) {
  if (isSafeMessage(err)) return sendError(res, err, err.status || 400);
  console.error(`Error en reparto (${contexto}):`, err);
  return sendError(res, err, 500);
}

const usuarioDe = (req) => req.user?.id ?? null;

exports.list = async (req, res) => {
  try {
    const { estado, desde, hasta } = req.query;
    const data = await Reparto.list(req.empresaId, { estado, desde, hasta });
    res.json({ data });
  } catch (err) {
    fail(res, err, "list");
  }
};

exports.getById = async (req, res) => {
  try {
    const data = await Reparto.getById(req.empresaId, req.params.id);
    if (!data) return res.status(404).json({ message: "Reparto no encontrado" });
    res.json({ data });
  } catch (err) {
    fail(res, err, "getById");
  }
};

exports.ventasDisponibles = async (req, res) => {
  try {
    const { desde, hasta, q } = req.query;
    const data = await Reparto.ventasDisponibles(req.empresaId, { desde, hasta, q });
    res.json({ data });
  } catch (err) {
    fail(res, err, "ventasDisponibles");
  }
};

exports.create = async (req, res) => {
  try {
    const id = await Reparto.create(req.empresaId, req.body || {}, usuarioDe(req));
    res.status(201).json({ id, message: "Reparto creado" });
  } catch (err) {
    fail(res, err, "create");
  }
};

exports.update = async (req, res) => {
  try {
    await Reparto.update(req.empresaId, req.params.id, req.body || {});
    res.json({ message: "Reparto actualizado" });
  } catch (err) {
    fail(res, err, "update");
  }
};

exports.anular = async (req, res) => {
  try {
    await Reparto.anular(req.empresaId, req.params.id);
    res.json({ message: "Reparto anulado" });
  } catch (err) {
    fail(res, err, "anular");
  }
};

exports.asignarVentas = async (req, res) => {
  try {
    const n = await Reparto.asignarVentas(
      req.empresaId,
      req.params.id,
      req.body?.venta_ids
    );
    res.json({ message: `${n} venta(s) asignada(s)`, asignadas: n });
  } catch (err) {
    fail(res, err, "asignarVentas");
  }
};

exports.quitarVenta = async (req, res) => {
  try {
    await Reparto.quitarVenta(req.empresaId, req.params.id, req.params.ventaId);
    res.json({ message: "Venta quitada del reparto" });
  } catch (err) {
    fail(res, err, "quitarVenta");
  }
};

exports.confirmarSalida = async (req, res) => {
  try {
    await Reparto.confirmarSalida(req.empresaId, req.params.id, usuarioDe(req));
    console.log(`reparto #${req.params.id}: salida confirmada por ${usuarioDe(req) ?? "?"}`);
    res.json({ message: "Salida confirmada" });
  } catch (err) {
    fail(res, err, "confirmarSalida");
  }
};

exports.confirmarRecepcion = async (req, res) => {
  try {
    const result = await Reparto.confirmarRecepcion(
      req.empresaId,
      req.params.id,
      usuarioDe(req),
      { cajas: req.body?.cajas, observacion: req.body?.observacion }
    );
    console.log(
      `reparto #${req.params.id}: recepción confirmada por ${usuarioDe(req) ?? "?"}${result.hayDiferencia ? " (con diferencias)" : ""}`
    );
    res.json({ message: "Recepción registrada", ...result });
  } catch (err) {
    fail(res, err, "confirmarRecepcion");
  }
};
