const express = require("express");
const router = express.Router();
const cajaController = require("../controllers/caja.controller");
const authMiddleware = require("../middlewares/auth");
const resolveEmpresa = require("../middlewares/resolveEmpresa");

// Aplicar autenticación + empresa activa a todas las rutas. Las cajas de cada
// empresa quedan aisladas.
router.use(authMiddleware);
router.use(resolveEmpresa);

// Rutas para Caja
router.get("/search", authMiddleware, cajaController.searchCajas);
router.get("/", authMiddleware, cajaController.getAll);
router.put("/:id/monto", authMiddleware, cajaController.updateMonto);
router.get("/:id", authMiddleware, cajaController.getById);
router.post("/", authMiddleware, cajaController.create);
router.put("/:id", authMiddleware, cajaController.update);
router.delete("/:id", authMiddleware, cajaController.delete);

module.exports = router;
