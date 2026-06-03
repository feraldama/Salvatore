const express = require("express");
const router = express.Router();
const vendedor = require("../controllers/vendedor.controller");
const auth = require("../middlewares/auth");
const resolveEmpresa = require("../middlewares/resolveEmpresa");

router.use(auth);
router.use(resolveEmpresa);

router.get("/", vendedor.getAll);
router.get("/:id", vendedor.getById);
router.get("/:id/clientes", vendedor.getClientes);
router.post("/", vendedor.create);
router.put("/:id", vendedor.update);
router.post("/:id/clientes", vendedor.asignarCliente);
router.delete("/:id/clientes/:clienteId", vendedor.desasignarCliente);
router.delete("/:id", vendedor.delete);

module.exports = router;
