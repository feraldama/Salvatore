const express = require("express");
const router = express.Router();
const productoController = require("../controllers/producto.controller");
const authMiddleware = require("../middlewares/auth");
const resolveEmpresa = require("../middlewares/resolveEmpresa");

// Ruta pública: imagen binaria del producto. Sin auth para que los <img>
// la puedan cargar directamente con el header Authorization del browser.
router.get("/:id/imagen", productoController.getImagen);

// Rutas protegidas (requieren autenticación + empresa activa)
router.get("/", authMiddleware, resolveEmpresa, productoController.getAllProductos);
router.get(
  "/all",
  authMiddleware,
  resolveEmpresa,
  productoController.getAllProductosSinPaginacion
);
router.get(
  "/reporte-stock",
  authMiddleware,
  productoController.getReporteStock
);
router.get(
  "/reporte-movimientos",
  authMiddleware,
  productoController.getReporteMovimientos
);
router.get(
  "/reporte-mas-vendidos",
  authMiddleware,
  productoController.getReporteMasVendidos
);
router.get("/search", authMiddleware, resolveEmpresa, productoController.searchProductos);
router.get("/:id", authMiddleware, productoController.getProductoById);
router.post("/", authMiddleware, resolveEmpresa, productoController.createProducto);
router.put("/:id", authMiddleware, productoController.updateProducto);
router.delete("/:id", authMiddleware, productoController.deleteProducto);

// Ruta pública para traer todos los productos sin paginación

module.exports = router;
