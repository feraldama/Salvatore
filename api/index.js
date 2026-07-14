require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const path = require("path");
const { loginLimiter, apiLimiter } = require("./middlewares/rateLimit");

// Fail-fast: sin JWT_SECRET el login y la verificación de tokens son inseguros
// (jwt firmaría/verificaría con `undefined`). Mejor no arrancar.
if (!process.env.JWT_SECRET) {
  console.error(
    "FATAL: falta la variable de entorno JWT_SECRET. Defínala en api/.env antes de iniciar."
  );
  process.exit(1);
}

// Importar rutas
const usuarioRoutes = require("./routes/usuario.routes");
const registroDiarioCajaRoutes = require("./routes/registrodiariocaja.routes");
const cajaRoutes = require("./routes/caja.routes");
const tipoGastoRoutes = require("./routes/tipogasto.routes");
const clienteRoutes = require("./routes/cliente.routes");
const tipogastoGrupoRoutes = require("./routes/tipogastogrupo.routes");
const productoRoutes = require("./routes/producto.routes");
const localRoutes = require("./routes/local.routes");
const almacenRoutes = require("./routes/almacen.routes");
const comboRoutes = require("./routes/combo.routes");
const perfilRoutes = require("./routes/perfil.routes");
const menuRoutes = require("./routes/menu.routes");
const perfilMenuRoutes = require("./routes/perfilmenu.routes");
const usuarioPerfilRoutes = require("./routes/usuarioperfil.routes");
const ventaProductoRoutes = require("./routes/ventaproducto.routes");
const ventaRoutes = require("./routes/venta.routes");
const ventaCreditoRoutes = require("./routes/ventacredito.routes");
const ventaCreditoPagoRoutes = require("./routes/ventacreditopago.routes");
const facturaRoutes = require("./routes/factura.routes");
const compraRoutes = require("./routes/compra.routes");
const proveedorRoutes = require("./routes/proveedor.routes");
const vendedorRoutes = require("./routes/vendedor.routes");
const empresaRoutes = require("./routes/empresa.routes");
const dashboardRoutes = require("./routes/dashboard.routes");
const genAuthRoutes = require("./routes/genauth.routes");
const flotaRoutes = require("./routes/flota.routes");
const deliveryTarifaRoutes = require("./routes/deliveryTarifa.routes");

const app = express();

const defaultOrigins = [
  "http://localhost:3024",
  "http://127.0.0.1:3024",
  "http://192.168.0.17:3024",
];
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);
const corsOrigins = allowedOrigins.length ? allowedOrigins : defaultOrigins;
const allowAny = corsOrigins.includes("*");

const corsOptions = {
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (allowAny) return cb(null, true);
    if (corsOrigins.includes(origin)) return cb(null, true);
    return cb(new Error(`Origin ${origin} no permitido por CORS`));
  },
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Empresa-Id", "X-Local-Id"],
  credentials: true,
  maxAge: 86400,
};

// helmet: cabeceras de seguridad. crossOriginResourcePolicy en cross-origin
// para que /uploads (imágenes de flota) siga sirviéndose al frontend en otro origen.
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);
app.use(cors(corsOptions));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));

// Rate limiting: techo general para toda la API.
app.use("/api", apiLimiter);

// Rutas
// Limitador estricto antes del login (anti fuerza bruta).
app.use("/api/gen/auth/login", loginLimiter);
app.use("/api/usuarios", usuarioRoutes);
app.use("/api/registrodiariocaja", registroDiarioCajaRoutes);
app.use("/api/caja", cajaRoutes);
app.use("/api/tipogasto", tipoGastoRoutes);
app.use("/api/clientes", clienteRoutes);
app.use("/api/tipogastogrupo", tipogastoGrupoRoutes);
app.use("/api/productos", productoRoutes);
app.use("/api/locales", localRoutes);
app.use("/api/almacen", almacenRoutes);
app.use("/api/combo", comboRoutes);
app.use("/api/perfiles", perfilRoutes);
app.use("/api/menus", menuRoutes);
app.use("/api/perfilmenu", perfilMenuRoutes);
app.use("/api/usuarioperfil", usuarioPerfilRoutes);
app.use("/api/ventaproducto", ventaProductoRoutes);
app.use("/api/venta", ventaRoutes);
app.use("/api/ventacredito", ventaCreditoRoutes);
app.use("/api/ventacreditopago", ventaCreditoPagoRoutes);
app.use("/api/factura", facturaRoutes);
app.use("/api/compras", compraRoutes);
app.use("/api/proveedores", proveedorRoutes);
app.use("/api/vendedores", vendedorRoutes);
app.use("/api/empresas", empresaRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/gen/auth", genAuthRoutes);
app.use("/api/gen/flota", flotaRoutes);
app.use("/api/deliverytarifa", deliveryTarifaRoutes);
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.get("/", (req, res) => res.send("API funcionando"));

// 404 para rutas de API no encontradas (respuesta JSON consistente).
app.use("/api", (req, res) => {
  res.status(404).json({ success: false, message: "Recurso no encontrado" });
});

// Manejador de errores central. No filtra el stack al cliente; lo registra en
// el servidor con contexto (método + ruta) para diagnóstico.
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);

  // Origen rechazado por CORS.
  if (err && /no permitido por CORS/.test(err.message || "")) {
    return res.status(403).json({ success: false, message: "Origen no permitido" });
  }
  // JSON malformado en el body.
  if (err && err.type === "entity.parse.failed") {
    return res.status(400).json({ success: false, message: "JSON inválido en la solicitud" });
  }

  console.error(`[${req.method} ${req.originalUrl}]`, err.stack || err);
  res.status(500).json({ success: false, message: "Error interno del servidor" });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Servidor backend corriendo en puerto ${PORT}`);
});
