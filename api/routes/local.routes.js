const express = require("express");
const router = express.Router();
const localController = require("../controllers/local.controller");
const authMiddleware = require("../middlewares/auth");
const resolveEmpresa = require("../middlewares/resolveEmpresa");

// Rutas protegidas (requieren autenticación + empresa activa). El listado se
// scopea a la empresa activa; el alta/edición respeta el selector de empresa
// del form (admin asigna la empresa al local).
router.use(authMiddleware);
router.use(resolveEmpresa);

router.get("/", authMiddleware, localController.getAllLocales);
router.get("/search", authMiddleware, localController.searchLocales);
router.get("/:id", authMiddleware, localController.getLocalById);
router.post("/", authMiddleware, localController.createLocal);
router.put("/:id", authMiddleware, localController.updateLocal);
router.delete("/:id", authMiddleware, localController.deleteLocal);

module.exports = router;
