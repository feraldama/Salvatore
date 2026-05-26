const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const router = express.Router();
const flota = require("../controllers/flota.controller");
const authMiddleware = require("../middlewares/auth");

// Fotos de combustible en filesystem local (patrón backend/uploads/...). La DB
// guarda sólo el path.
const uploadDir = path.join(__dirname, "..", "uploads", "flota");
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || ".jpg";
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${file.fieldname}-${unique}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 12 * 1024 * 1024 }, // 12 MB por foto
});

// Todas requieren JWT.
router.use(authMiddleware);

router.get("/config", flota.getConfig);

// Chofer
router.get("/vehiculos/mis", flota.getMisVehiculos);
router.get("/mantenimiento/mis-pendientes", flota.getMisPendientes);
router.get("/viajes/activo", flota.getViajeActivo);
router.post("/viajes/iniciar", flota.iniciarViaje);
router.post("/viajes/terminar", flota.terminarViaje);
router.post("/ubicacion/mobile/batch", flota.reportarUbicacionBatch);
router.post("/ubicacion/mobile", flota.reportarUbicacion);
router.get("/cargas-combustible/mis", flota.getMisCargas);
router.post(
  "/cargas-combustible/mobile",
  upload.fields([
    { name: "tablero", maxCount: 1 },
    { name: "factura", maxCount: 1 },
  ]),
  flota.crearCarga
);

// Gerente de operaciones
router.get("/viajes/activos", flota.getViajesActivos);
router.get("/atencion-requerida", flota.getAtencionRequerida);
router.get("/viajes/detalle/:id", flota.getViajeDetalle);

module.exports = router;
