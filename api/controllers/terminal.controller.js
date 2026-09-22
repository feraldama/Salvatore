// Alta y administración de terminales (migración 030).
//
// El alta la hace un administrador, una sola vez por equipo: elige la sucursal
// donde está físicamente esa PC. A partir de ahí el equipo resuelve solo su
// sucursal en cada request y ningún cajero vuelve a elegirla.
const Terminal = require("../models/terminal.model");
const { sendError } = require("../utils/errors");

function esAdmin(req) {
  return req.user?.isAdmin === "S";
}

// GET /terminal/actual
// Responde qué sabe el servidor del equipo desde el que llega el request.
// Siempre 200: la app necesita distinguir "no registrada" de un error de red
// para poder mostrar la pantalla de alta en vez de un cartel de falla.
exports.actual = async (req, res) => {
  try {
    const terminalId = String(req.headers["x-terminal-id"] || "").trim();
    if (!terminalId) {
      return res.json({ registrada: false, motivo: "SIN_ID" });
    }
    const t = await Terminal.getById(terminalId);
    if (!t) {
      return res.json({ registrada: false, motivo: "NO_REGISTRADA", terminalId });
    }
    if (t.TerminalEstado !== "A") {
      return res.json({ registrada: false, motivo: "DADA_DE_BAJA", terminalId });
    }
    res.json({
      registrada: true,
      terminalId: String(t.TerminalId).trim(),
      nombre: t.TerminalNombre,
      localId: t.LocalId,
      localNombre: t.LocalNombre,
      empresaId: t.EmpresaId,
    });
  } catch (error) {
    console.error("Error resolviendo la terminal actual:", error);
    sendError(res, error, 500);
  }
};

// POST /terminal — registra (o reasigna) el equipo. Solo admins: es la decisión
// de "esta máquina está en esta bodega", y de ella cuelga de qué depósito sale
// la mercadería de todo el que se siente ahí.
exports.registrar = async (req, res) => {
  try {
    if (!esAdmin(req)) {
      return res.status(403).json({
        message:
          "Solo un administrador puede registrar este equipo. Pedile que inicie sesión en esta PC.",
      });
    }
    const { TerminalId, TerminalNombre, LocalId } = req.body || {};
    const terminalId = String(TerminalId || "").trim();
    if (!terminalId) {
      return res.status(400).json({ message: "Falta el identificador del equipo." });
    }
    // El id lo genera el navegador (UUID v4). Se valida el formato acá para que
    // un id mal armado devuelva un mensaje entendible en vez de reventar contra
    // el VARCHAR(36) de la tabla con un "Error interno".
    if (!/^[0-9a-fA-F-]{8,36}$/.test(terminalId)) {
      return res
        .status(400)
        .json({ message: "El identificador del equipo no tiene un formato válido." });
    }
    if (!LocalId) {
      return res
        .status(400)
        .json({ message: "Elegí la sucursal donde está este equipo." });
    }
    const t = await Terminal.registrar({
      terminalId,
      nombre: TerminalNombre || `Equipo ${terminalId.slice(0, 8)}`,
      localId: LocalId,
      registradaPor: req.user?.id || null,
    });
    res.status(201).json({ message: "Equipo registrado", data: t });
  } catch (error) {
    console.error("Error registrando la terminal:", error);
    sendError(res, error, 400);
  }
};

exports.getAll = async (req, res) => {
  try {
    if (!esAdmin(req)) {
      return res.status(403).json({ message: "Solo un administrador puede ver las terminales." });
    }
    res.json({ data: await Terminal.getAll() });
  } catch (error) {
    console.error("Error listando terminales:", error);
    sendError(res, error, 500);
  }
};

// PUT /terminal/:id — renombrar, mover de sucursal o dar de baja.
exports.update = async (req, res) => {
  try {
    if (!esAdmin(req)) {
      return res.status(403).json({ message: "Solo un administrador puede editar terminales." });
    }
    const { TerminalNombre, LocalId, TerminalEstado } = req.body || {};
    if (TerminalEstado && !["A", "I"].includes(TerminalEstado)) {
      return res.status(400).json({ message: "Estado inválido (A o I)." });
    }
    const t = await Terminal.update(req.params.id, {
      nombre: TerminalNombre ?? null,
      localId: LocalId ?? null,
      estado: TerminalEstado ?? null,
    });
    if (!t) return res.status(404).json({ message: "Terminal no encontrada" });
    res.json({ message: "Terminal actualizada", data: t });
  } catch (error) {
    console.error("Error actualizando la terminal:", error);
    sendError(res, error, 400);
  }
};
