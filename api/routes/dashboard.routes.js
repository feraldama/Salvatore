const express = require("express");
const router = express.Router();
const dashboardController = require("../controllers/dashboard.controller");
const authMiddleware = require("../middlewares/auth");

// El resumen consolidado decide su propio scope (admin = todas las empresas,
// regular = la suya) a partir de req.user, por eso NO usa resolveEmpresa.
router.use(authMiddleware);

router.get("/resumen", dashboardController.getResumenEmpresas);

module.exports = router;
