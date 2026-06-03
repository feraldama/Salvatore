const Vendedor = require("../models/vendedor.model");

exports.getAll = async (req, res) => {
  try {
    const empresaId = req.empresaId;
    const vendedores = await Vendedor.getAll(empresaId);
    res.json({ data: vendedores });
  } catch (error) {
    console.error("Error en getAll vendedores:", error);
    res.status(500).json({ success: false, message: "Error al obtener vendedores" });
  }
};

exports.getById = async (req, res) => {
  try {
    const vendedor = await Vendedor.getById(req.params.id);
    if (!vendedor) {
      return res.status(404).json({ success: false, message: "Vendedor no encontrado" });
    }
    res.json(vendedor);
  } catch (error) {
    console.error("Error en getById vendedor:", error);
    res.status(500).json({ success: false, message: "Error al obtener vendedor" });
  }
};

exports.getClientes = async (req, res) => {
  try {
    const clientes = await Vendedor.getClientes(req.params.id);
    res.json({ data: clientes });
  } catch (error) {
    console.error("Error en getClientes vendedor:", error);
    res.status(500).json({ success: false, message: "Error al obtener clientes del vendedor" });
  }
};

exports.create = async (req, res) => {
  try {
    if (!req.body.VendedorNombre) {
      return res.status(400).json({ success: false, message: "VendedorNombre es requerido" });
    }
    const nuevoVendedor = await Vendedor.create({ ...req.body, EmpresaId: req.empresaId });
    res.status(201).json({ success: true, data: nuevoVendedor, message: "Vendedor creado exitosamente" });
  } catch (error) {
    console.error("Error al crear vendedor:", error);
    res.status(500).json({ success: false, message: "Error al crear vendedor" });
  }
};

exports.update = async (req, res) => {
  try {
    const updated = await Vendedor.update(req.params.id, req.body);
    if (!updated) {
      return res.status(404).json({ success: false, message: "Vendedor no encontrado" });
    }
    res.json({ success: true, data: updated, message: "Vendedor actualizado exitosamente" });
  } catch (error) {
    console.error("Error al actualizar vendedor:", error);
    res.status(500).json({ success: false, message: "Error al actualizar vendedor" });
  }
};

exports.asignarCliente = async (req, res) => {
  try {
    const { clienteId } = req.body;
    const { id: vendedorId } = req.params;
    if (!clienteId) {
      return res.status(400).json({ success: false, message: "clienteId es requerido" });
    }
    const ok = await Vendedor.asignarCliente(clienteId, vendedorId);
    if (!ok) {
      return res.status(404).json({ success: false, message: "Cliente no encontrado" });
    }
    res.json({ success: true, message: "Cliente asignado al vendedor exitosamente" });
  } catch (error) {
    console.error("Error al asignar cliente:", error);
    res.status(500).json({ success: false, message: "Error al asignar cliente" });
  }
};

exports.desasignarCliente = async (req, res) => {
  try {
    const { clienteId } = req.params;
    const ok = await Vendedor.asignarCliente(clienteId, null);
    if (!ok) {
      return res.status(404).json({ success: false, message: "Cliente no encontrado" });
    }
    res.json({ success: true, message: "Cliente desasignado exitosamente" });
  } catch (error) {
    console.error("Error al desasignar cliente:", error);
    res.status(500).json({ success: false, message: "Error al desasignar cliente" });
  }
};

exports.delete = async (req, res) => {
  try {
    const deleted = await Vendedor.delete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ success: false, message: "Vendedor no encontrado" });
    }
    res.json({ success: true, message: "Vendedor eliminado exitosamente" });
  } catch (error) {
    console.error("Error al eliminar vendedor:", error);
    if (error?.message?.includes("foreign key")) {
      return res.status(400).json({
        success: false,
        message: "No se puede eliminar el vendedor porque tiene clientes o ventas asociadas.",
      });
    }
    res.status(500).json({ success: false, message: "Error al eliminar vendedor" });
  }
};
