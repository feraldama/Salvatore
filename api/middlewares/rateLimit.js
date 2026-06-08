const rateLimit = require("express-rate-limit");

// Limitador estricto para el login: frena ataques de fuerza bruta sobre
// /api/gen/auth/login. Cuenta solo intentos fallidos (los exitosos no penalizan).
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  limit: 10, // 10 intentos fallidos por IP por ventana
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: {
    success: false,
    message: "Demasiados intentos de inicio de sesión. Intente nuevamente en unos minutos.",
  },
});

// Limitador general para toda la API: techo de seguridad contra abuso.
// Holgado para no molestar el uso normal del ERP (varias pantallas en paralelo).
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minuto
  limit: 300, // 300 requests por IP por minuto
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    success: false,
    message: "Demasiadas solicitudes. Espere un momento e intente de nuevo.",
  },
});

module.exports = { loginLimiter, apiLimiter };
