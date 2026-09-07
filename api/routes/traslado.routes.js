const express = require("express");
const router = express.Router();
const trasladoController = require("../controllers/traslado.controller");
const authMiddleware = require("../middlewares/auth");
const resolveEmpresa = require("../middlewares/resolveEmpresa");

// resolveEmpresa define la empresa ACTIVA, que acá solo sirve para el scope de
// LECTURA (un traslado se ve desde la empresa que envía y desde la que recibe).
// Los almacenes que se mueven vienen explícitos en el body y el controlador
// valida los permisos sobre ellos: un traslado cruza empresas por definición,
// así que no puede quedar encerrado en el scope de una sola.
router.use(authMiddleware);
router.use(resolveEmpresa);

// Las rutas literales van ANTES de /:id o Express matchea "equivalencias"
// como un TrasladoId.
router.get("/equivalencias", trasladoController.getEquivalencias);
router.post("/equivalencias", trasladoController.upsertEquivalencia);
router.delete(
  "/equivalencias/:origenId/:destinoId",
  trasladoController.eliminarEquivalencia
);

// Catálogos que alimentan la pantalla. Van fuera del scope de empresa activa
// a propósito: un traslado cruza empresas por definición.
router.get("/almacenes", trasladoController.getAlmacenes);
router.get("/productos", trasladoController.getProductos);
router.get("/productos-empresa", trasladoController.getProductosEmpresa);
router.get("/resolver", trasladoController.resolver);

router.get("/", trasladoController.getAll);
router.get("/:id", trasladoController.getById);
router.post("/", trasladoController.crear);
// Anular, no borrar: el traslado queda con estado 'A' para no perder la
// auditoría del movimiento.
router.delete("/:id", trasladoController.anular);

module.exports = router;
