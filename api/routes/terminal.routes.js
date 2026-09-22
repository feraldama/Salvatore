const express = require("express");
const router = express.Router();
const terminalController = require("../controllers/terminal.controller");
const authMiddleware = require("../middlewares/auth");

// Sin resolveEmpresa a propósito: estas rutas son las que definen la sucursal
// del equipo, así que no pueden depender de que ya esté resuelta.
router.use(authMiddleware);

router.get("/actual", terminalController.actual);
router.get("/sucursales", terminalController.sucursales);
router.get("/", terminalController.getAll);
router.post("/", terminalController.registrar);
router.put("/:id", terminalController.update);

module.exports = router;
