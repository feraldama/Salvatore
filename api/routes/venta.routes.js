const express = require("express");
const router = express.Router();
const ventaController = require("../controllers/venta.controller");
const authMiddleware = require("../middlewares/auth");
const resolveEmpresa = require("../middlewares/resolveEmpresa");

router.use(authMiddleware);
// Toda venta queda scopeada a la empresa activa (req.empresaId): admin elige
// vía header X-Empresa-Id, usuario regular hereda la de su JWT.
router.use(resolveEmpresa);

router.get(
  "/pendientes/:clienteId",
  authMiddleware,
  ventaController.getVentasPendientesPorCliente
);
router.get(
  "/pendientes",
  authMiddleware,
  ventaController.getDeudasPendientesPorCliente
);
router.get(
  "/reporte",
  authMiddleware,
  ventaController.getReporteVentasPorCliente
);
router.get(
  "/ventas-por-dia",
  authMiddleware,
  ventaController.getVentasPorDia
);
router.post("/confirmar", authMiddleware, ventaController.confirmar);
router.post("/devolucion", authMiddleware, ventaController.devolucion);
router.get("/search", authMiddleware, ventaController.searchVentas);
router.get("/", authMiddleware, ventaController.getAll);
router.get("/paginated", authMiddleware, ventaController.getAllPaginated);
router.get("/:id", authMiddleware, ventaController.getById);
router.post("/", authMiddleware, ventaController.create);
router.put("/:id", authMiddleware, ventaController.update);
router.delete("/:id", authMiddleware, ventaController.delete);

module.exports = router;
