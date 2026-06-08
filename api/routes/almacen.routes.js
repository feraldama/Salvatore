const express = require("express");
const router = express.Router();
const almacenController = require("../controllers/almacen.controller");
const authMiddleware = require("../middlewares/auth");
const resolveEmpresa = require("../middlewares/resolveEmpresa");

// Aplicar autenticación + empresa activa a todas las rutas. Cada empresa ve
// solo sus almacenes (donde vive su stock físico).
router.use(authMiddleware);
router.use(resolveEmpresa);

// Rutas para Almacen
router.get("/search", authMiddleware, almacenController.searchAlmacenes);
router.get("/by-local/:localId", authMiddleware, almacenController.getByLocal);
router.get("/", authMiddleware, almacenController.getAll);
router.get("/:id", authMiddleware, almacenController.getById);
router.post("/", authMiddleware, almacenController.create);
router.put("/:id", authMiddleware, almacenController.update);
router.delete("/:id", authMiddleware, almacenController.delete);

module.exports = router;
