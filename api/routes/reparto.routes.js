const express = require("express");
const router = express.Router();
const reparto = require("../controllers/reparto.controller");
const authMiddleware = require("../middlewares/auth");
const resolveEmpresa = require("../middlewares/resolveEmpresa");

// Repartos de la distribuidora (migración 036). Scopeados a la empresa activa.
router.use(authMiddleware);
router.use(resolveEmpresa);

// Oficina: armado
router.get("/", reparto.list);
router.get("/ventas-disponibles", reparto.ventasDisponibles);
router.get("/:id", reparto.getById);
router.post("/", reparto.create);
router.put("/:id", reparto.update);
router.post("/:id/anular", reparto.anular);
router.post("/:id/ventas", reparto.asignarVentas);
router.delete("/:id/ventas/:ventaId", reparto.quitarVenta);

// Ruteador (tablet): control de salida y recepción
router.post("/:id/salida", reparto.confirmarSalida);
router.post("/:id/recepcion", reparto.confirmarRecepcion);

module.exports = router;
