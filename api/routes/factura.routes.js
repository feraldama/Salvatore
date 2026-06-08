const express = require("express");
const router = express.Router();
const facturaController = require("../controllers/factura.controller");
const authMiddleware = require("../middlewares/auth");
const resolveEmpresa = require("../middlewares/resolveEmpresa");

// Rutas protegidas (autenticación + empresa activa). Los timbrados/rangos de
// facturación son por empresa (cada unidad de facturación tiene los suyos).
router.use(authMiddleware);
router.use(resolveEmpresa);

router.get("/", authMiddleware, facturaController.getAllFacturas);
router.get(
  "/all",
  authMiddleware,
  facturaController.getAllFacturasSinPaginacion
);
router.get("/search", authMiddleware, facturaController.searchFacturas);

// Rutas específicas ANTES de la paramétrica `/:id` para que no las capture
// (GET /next-number caía en getFacturaById('next-number')).
router.get(
  "/next-number",
  authMiddleware,
  facturaController.getNextAvailableNumber
);
router.get(
  "/current/:numeroFactura",
  authMiddleware,
  facturaController.getCurrentFactura
);

router.get("/:id", authMiddleware, facturaController.getFacturaById);
router.post("/", authMiddleware, facturaController.createFactura);
router.put("/:id", authMiddleware, facturaController.updateFactura);
router.delete("/:id", authMiddleware, facturaController.deleteFactura);

module.exports = router;
