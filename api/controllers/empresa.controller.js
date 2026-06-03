const Empresa = require("../models/empresa.model");

// Devuelve las empresas a las que el usuario tiene acceso.
// - Admin: todas las empresas activas (puede operar en cualquiera).
// - Usuario regular: solo su propia empresa.
exports.getAccesibles = async (req, res) => {
  try {
    const todas = await Empresa.getAll();
    if (req.user?.isAdmin === "S") {
      return res.json({ data: todas });
    }
    const propia = todas.filter((e) => e.EmpresaId === (req.user?.EmpresaId || 1));
    res.json({ data: propia });
  } catch (error) {
    console.error("Error en getAccesibles empresas:", error);
    res.status(500).json({ success: false, message: "Error al obtener empresas" });
  }
};

exports.getById = async (req, res) => {
  try {
    const empresa = await Empresa.getById(req.params.id);
    if (!empresa) return res.status(404).json({ message: "Empresa no encontrada" });
    res.json(empresa);
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Error al obtener empresa" });
  }
};

exports.create = async (req, res) => {
  try {
    if (!req.body.EmpresaNombre) {
      return res.status(400).json({ success: false, message: "EmpresaNombre es requerido" });
    }
    const empresa = await Empresa.create(req.body);
    res.status(201).json({ success: true, data: empresa, message: "Empresa creada exitosamente" });
  } catch (error) {
    console.error("Error al crear empresa:", error);
    res.status(500).json({ success: false, message: "Error al crear empresa" });
  }
};

exports.update = async (req, res) => {
  try {
    const empresa = await Empresa.update(req.params.id, req.body);
    if (!empresa) return res.status(404).json({ success: false, message: "Empresa no encontrada" });
    res.json({ success: true, data: empresa, message: "Empresa actualizada exitosamente" });
  } catch (error) {
    console.error("Error al actualizar empresa:", error);
    res.status(500).json({ success: false, message: "Error al actualizar empresa" });
  }
};

exports.delete = async (req, res) => {
  try {
    const ok = await Empresa.delete(req.params.id);
    if (!ok) return res.status(404).json({ success: false, message: "Empresa no encontrada" });
    res.json({ success: true, message: "Empresa eliminada exitosamente" });
  } catch (error) {
    console.error("Error al eliminar empresa:", error);
    if (error?.code === "23503") {
      return res.status(400).json({
        success: false,
        message: "No se puede eliminar: la empresa tiene locales, productos u otros datos asociados.",
      });
    }
    res.status(500).json({ success: false, message: "Error al eliminar empresa" });
  }
};
