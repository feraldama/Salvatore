const express = require("express");
const router = express.Router();
const compraController = require("../controllers/compra.controller");
const authMiddleware = require("../middlewares/auth");
const resolveEmpresa = require("../middlewares/resolveEmpresa");

// Rutas protegidas (requieren autenticación + empresa activa). Las compras de
// la distribuidora no se mezclan con las de la minorista.
router.use(authMiddleware);
router.use(resolveEmpresa);

router.get("/", authMiddleware, compraController.getAllCompras);
router.get("/all", authMiddleware, compraController.getAllComprasSinPaginacion);
router.get("/search", authMiddleware, compraController.searchCompras);
router.post("/confirmar", authMiddleware, compraController.confirmar);
router.get("/:id", authMiddleware, compraController.getCompraById);
router.get(
  "/:id/productos",
  authMiddleware,
  compraController.getProductosByCompraId
);
router.post("/", authMiddleware, compraController.createCompra);
router.put("/:id", authMiddleware, compraController.updateCompra);
router.delete("/:id", authMiddleware, compraController.deleteCompra);

module.exports = router;
