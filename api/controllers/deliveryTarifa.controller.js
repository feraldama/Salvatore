const DeliveryTarifa = require("../models/deliveryTarifa.model");
const { sendError } = require("../utils/errors");

// Normaliza y valida el body de una tarifa. Devuelve { error } o { data }.
function parseBody(body) {
  const nombre = String(body?.nombre ?? "").trim();
  const monto = Math.round(Number(body?.monto));
  const orden = Math.round(Number(body?.orden ?? 0));
  const activo = body?.activo === "N" ? "N" : "S";
  if (!nombre) return { error: "El nombre de la tarifa es obligatorio" };
  if (!Number.isFinite(monto) || monto < 0)
    return { error: "El monto debe ser un número mayor o igual a 0" };
  return {
    data: {
      nombre,
      monto,
      activo,
      orden: Number.isFinite(orden) ? orden : 0,
    },
  };
}

// Tarifas activas (para la pantalla de venta). Scopeadas a la empresa activa.
exports.getActivas = async (req, res) => {
  try {
    const tarifas = await DeliveryTarifa.getActivasByEmpresa(req.empresaId);
    res.json(tarifas);
  } catch (error) {
    console.error(error);
    sendError(res, error, 500);
  }
};

// Todas las tarifas de la empresa (para administración).
exports.getAll = async (req, res) => {
  try {
    const tarifas = await DeliveryTarifa.getAllByEmpresa(req.empresaId);
    res.json(tarifas);
  } catch (error) {
    console.error(error);
    sendError(res, error, 500);
  }
};

exports.create = async (req, res) => {
  try {
    const { error, data } = parseBody(req.body);
    if (error) return res.status(400).json({ message: error });
    const tarifa = await DeliveryTarifa.create({
      ...data,
      empresa_id: req.empresaId,
    });
    res.status(201).json({ message: "Tarifa creada", data: tarifa });
  } catch (error) {
    console.error(error);
    sendError(res, error, 400);
  }
};

exports.update = async (req, res) => {
  try {
    const { error, data } = parseBody(req.body);
    if (error) return res.status(400).json({ message: error });
    const tarifa = await DeliveryTarifa.update(
      req.params.id,
      data,
      req.empresaId
    );
    if (!tarifa) return res.status(404).json({ message: "Tarifa no encontrada" });
    res.json({ message: "Tarifa actualizada", data: tarifa });
  } catch (error) {
    console.error(error);
    sendError(res, error, 400);
  }
};

exports.remove = async (req, res) => {
  try {
    const ok = await DeliveryTarifa.remove(req.params.id, req.empresaId);
    if (!ok) return res.status(404).json({ message: "Tarifa no encontrada" });
    res.json({ message: "Tarifa eliminada" });
  } catch (error) {
    console.error(error);
    sendError(res, error, 500);
  }
};
