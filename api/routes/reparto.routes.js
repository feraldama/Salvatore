const express = require("express");
const router = express.Router();
const reparto = require("../controllers/reparto.controller");
const authMiddleware = require("../middlewares/auth");
const resolveEmpresa = require("../middlewares/resolveEmpresa");
const verificarPermiso = require("../middlewares/permiso");

// Repartos de la distribuidora (migración 036). Scopeados a la empresa activa.
// Permisos por menú (mismos que chequea el frontend con usePermiso):
//   REPARTOS        -> oficina: armar, editar, asignar ventas, anular
//   CONTROLREPARTOS -> ruteador (tablet): confirmar salida y recepción
//   CORREGIRCOBROENVIO -> cajero: corregir la forma de pago de una venta
// Leer un reparto alcanza con cualquiera de los dos.
router.use(authMiddleware);
router.use(resolveEmpresa);

const leer = verificarPermiso(["REPARTOS", "CONTROLREPARTOS"], "leer");
const oficina = (accion) => verificarPermiso("REPARTOS", accion);
const ruteador = verificarPermiso("CONTROLREPARTOS", "editar");
const cobro = (accion) => verificarPermiso("CORREGIRCOBROENVIO", accion);

// Consulta (oficina y ruteador)
router.get("/", leer, reparto.list);
router.get("/ventas-disponibles", oficina("leer"), reparto.ventasDisponibles);
router.get("/:id", leer, reparto.getById);

// Oficina: armado
router.post("/", oficina("crear"), reparto.create);
router.put("/:id", oficina("editar"), reparto.update);
router.post("/:id/anular", oficina("editar"), reparto.anular);
router.post("/:id/ventas", oficina("editar"), reparto.asignarVentas);
router.delete("/:id/ventas/:ventaId", oficina("editar"), reparto.quitarVenta);

// Ruteador (tablet): control de salida y recepción
router.post("/:id/salida", ruteador, reparto.confirmarSalida);
router.post("/:id/recepcion", ruteador, reparto.confirmarRecepcion);

// Cajero: forma de pago de una venta de envío del reparto
router.get("/:id/ventas/:ventaId/pagos", cobro("leer"), reparto.getPagosEnvio);
router.put("/:id/ventas/:ventaId/pagos", cobro("editar"), reparto.corregirPagosEnvio);

module.exports = router;
