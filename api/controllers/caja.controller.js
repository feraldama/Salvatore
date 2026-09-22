const Caja = require("../models/caja.model");
const { sendError } = require("../utils/errors");
const db = require("../config/db");

exports.getAll = async (req, res) => {
  const limit = parseInt(req.query.limit) || 10;
  const page = parseInt(req.query.page) || 1;
  const offset = (page - 1) * limit;
  const sortBy = req.query.sortBy || "CajaId";
  const sortOrder = req.query.sortOrder || "ASC";
  // ?paraOperar=1 -> solo las cajas de la sucursal donde está el equipo. Lo usa
  // la pantalla de apertura: ofrecer cajas de otra sucursal es ofrecer algo que
  // la validación de terminal va a rechazar después, y el cajero no tiene cómo
  // saber cuál sirve. La administración de cajas sigue viendo las del switcher.
  const paraOperar = req.query.paraOperar === "1";
  const localFiltro =
    paraOperar && req.localOperativoId != null
      ? req.localOperativoId
      : req.localId;
  try {
    const result = await Caja.getAllPaginated(
      limit,
      offset,
      sortBy,
      sortOrder,
      req.empresaId,
      localFiltro
    );
    res.json({
      data: result.cajas,
      pagination: {
        totalItems: result.total,
        totalPages: Math.ceil(result.total / limit),
        currentPage: page,
        itemsPerPage: limit,
      },
    });
  } catch (error) {
    console.error(error);
    sendError(res, error, 500);
  }
};

// Valida el dueño que se le quiere poner a una caja: tiene que ser un usuario
// activo y no tener ya otra caja EN ESA MISMA SUCURSAL (migración 031).
//
// A propósito NO se exige que el cajero sea de la sucursal de la caja: darle una
// caja en la bodega donde va a cubrir es justamente el mecanismo previsto para
// que pueda trabajar ahí. Lo que no puede es tener dos cajas en el mismo lugar,
// porque entonces "mi caja" vuelve a ser ambiguo y habría que preguntarle.
async function validarDueno(usuarioId, localId, cajaIdActual) {
  if (!usuarioId) return null; // sin dueño es válido: se elige al aperturar
  const [uRows] = await db
    .promise()
    .query(
      "SELECT UsuarioId, UsuarioEstado, LocalId FROM usuario WHERE TRIM(UsuarioId) = ?",
      [String(usuarioId).trim()]
    );
  if (!uRows.length) return "El cajero seleccionado no existe.";
  if (uRows[0].UsuarioEstado === "I")
    return "El cajero seleccionado está inactivo.";
  if (localId == null) {
    return "Elegí primero la sucursal de la caja.";
  }
  const [cRows] = await db
    .promise()
    .query(
      "SELECT CajaId, CajaDescripcion FROM caja WHERE TRIM(UsuarioId) = ? AND LocalId = ?",
      [String(usuarioId).trim(), Number(localId)]
    );
  if (cRows.length && Number(cRows[0].CajaId) !== Number(cajaIdActual)) {
    return `Ese cajero ya tiene la caja "${cRows[0].CajaDescripcion}" en esta sucursal. Un cajero tiene una sola caja por sucursal.`;
  }
  return null;
}

// GET /caja/mia -> la caja del usuario EN LA SUCURSAL DONDE ESTÁ (031).
// El frontend la usa para no mostrarle un selector de 16 cajas al cajero.
// 204 = no tiene caja acá, y entonces elige de la lista (que el backend acota a
// las cajas de esta sucursal al aperturar).
exports.getMia = async (req, res) => {
  try {
    const caja = await Caja.getByUsuario(req.user?.id, req.localOperativoId ?? null);
    if (!caja) return res.status(204).end();
    res.json(caja);
  } catch (error) {
    console.error("Error obteniendo la caja del usuario:", error);
    sendError(res, error, 500);
  }
};

exports.getById = async (req, res) => {
  try {
    const caja = await Caja.getById(req.params.id, req.empresaId);
    if (!caja) {
      return res.status(404).json({ message: "Caja no encontrada" });
    }
    res.json(caja);
  } catch (error) {
    console.error(error);
    sendError(res, error, 500);
  }
};

exports.create = async (req, res) => {
  try {
    const localId = req.body.LocalId ?? req.localId ?? null;
    const errDueno = await validarDueno(req.body.UsuarioId, localId, null);
    if (errDueno) return res.status(400).json({ message: errDueno });
    const caja = await Caja.create({
      ...req.body,
      EmpresaId: req.empresaId,
      // La sucursal elegida en el modal (body) manda; si no viene, se usa la
      // sucursal activa del header (X-Local-Id) y, en última instancia, null.
      LocalId: req.body.LocalId ?? req.localId ?? null,
      UsuarioId: req.body.UsuarioId || null,
    });
    res.status(201).json({ message: "Caja creada exitosamente", data: caja });
  } catch (error) {
    console.error(error);
    sendError(res, error, 400);
  }
};

exports.update = async (req, res) => {
  try {
    // La sucursal de referencia es la que trae el update; si no la trae, la que
    // ya tiene la caja.
    const actual = await Caja.getById(req.params.id, req.empresaId);
    const localId = req.body.LocalId ?? actual?.LocalId ?? null;
    const errDueno = await validarDueno(
      req.body.UsuarioId,
      localId,
      req.params.id
    );
    if (errDueno) return res.status(400).json({ message: errDueno });
    const caja = await Caja.update(req.params.id, req.body, req.empresaId);
    if (!caja) {
      return res.status(404).json({ message: "Caja no encontrada" });
    }
    res.json({ message: "Caja actualizada exitosamente", data: caja });
  } catch (error) {
    console.error(error);
    sendError(res, error, 400);
  }
};

exports.delete = async (req, res) => {
  try {
    const success = await Caja.delete(req.params.id, req.empresaId);
    if (!success) {
      return res.status(404).json({ message: "Caja no encontrada" });
    }
    res.json({ message: "Caja eliminada exitosamente" });
  } catch (error) {
    console.error(error);
    if (
      error &&
      error.message &&
      error.message.includes("a foreign key constraint fails")
    ) {
      return res.status(400).json({
        message:
          "No se puede eliminar la caja porque tiene movimientos asociados.",
      });
    }
    sendError(res, error, 500);
  }
};

exports.searchCajas = async (req, res) => {
  try {
    const { q: searchTerm } = req.query;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    const sortBy = req.query.sortBy || "CajaId";
    const sortOrder = req.query.sortOrder || "ASC";

    if (!searchTerm || searchTerm.trim() === "") {
      return res
        .status(400)
        .json({ error: "El término de búsqueda no puede estar vacío" });
    }

    const result = await Caja.searchCajas(
      searchTerm,
      limit,
      offset,
      sortBy,
      sortOrder,
      req.empresaId,
      req.localId
    );

    res.json({
      data: result.cajas,
      pagination: {
        totalItems: result.total,
        totalPages: Math.ceil(result.total / limit),
        currentPage: page,
        itemsPerPage: limit,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al buscar cajas" });
  }
};

exports.updateMonto = async (req, res) => {
  try {
    const id = req.params.id;
    const { CajaMonto } = req.body;
    if (typeof CajaMonto !== "number") {
      return res.status(400).json({ message: "Monto inválido" });
    }
    const pe = db.promise();
    await pe.query(
      "UPDATE Caja SET CajaMonto = ? WHERE CajaId = ? AND EmpresaId = ?",
      [CajaMonto, id, req.empresaId]
    );
    const [updatedCaja] = await pe.query(
      "SELECT * FROM Caja WHERE CajaId = ? AND EmpresaId = ?",
      [id, req.empresaId]
    );
    if (!updatedCaja || updatedCaja.length === 0) {
      return res.status(404).json({ message: "Caja no encontrada" });
    }
    res.json(updatedCaja[0]);
  } catch (error) {
    console.error(error);
    sendError(res, error, 500);
  }
};
