const express = require("express");
const router = express.Router();
const genAuth = require("../controllers/genauth.controller");
const authMiddleware = require("../middlewares/auth");

// Contrato de la app Mobile (JWF). Montado en /api/gen/auth.
router.post("/login", genAuth.login);
router.get("/me", authMiddleware, genAuth.me);

module.exports = router;
