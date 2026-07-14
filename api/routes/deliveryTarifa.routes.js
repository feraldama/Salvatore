const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/deliveryTarifa.controller");
const authMiddleware = require("../middlewares/auth");
const resolveEmpresa = require("../middlewares/resolveEmpresa");

router.use(authMiddleware);
// Las tarifas se scopean a la empresa activa (req.empresaId): admin elige vía
// header X-Empresa-Id, usuario regular hereda la de su JWT.
router.use(resolveEmpresa);

router.get("/activas", ctrl.getActivas);
router.get("/", ctrl.getAll);
router.post("/", ctrl.create);
router.put("/:id", ctrl.update);
router.delete("/:id", ctrl.remove);

module.exports = router;
