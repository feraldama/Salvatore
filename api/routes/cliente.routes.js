const express = require("express");
const router = express.Router();
const clienteController = require("../controllers/cliente.controller");
const authMiddleware = require("../middlewares/auth");
const resolveEmpresa = require("../middlewares/resolveEmpresa");

// Rutas protegidas (requieren autenticación). resolveEmpresa scopea todo a la
// empresa activa: los clientes B2B de la distribuidora no se mezclan con los
// minoristas.
router.use(authMiddleware);
router.use(resolveEmpresa);

router.get("/", authMiddleware, clienteController.getAllClientes);
router.get(
  "/all",
  authMiddleware,
  clienteController.getAllClientesSinPaginacion
);
router.get("/search", authMiddleware, clienteController.searchClientes);
router.get("/:id", authMiddleware, clienteController.getClienteById);
router.post("/", authMiddleware, clienteController.createCliente);
router.put("/:id", authMiddleware, clienteController.updateCliente);
router.delete("/:id", authMiddleware, clienteController.deleteCliente);

module.exports = router;
