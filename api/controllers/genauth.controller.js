// Auth para la app Mobile (contrato JWF). La app pega a /api/gen/auth/login y
// /api/gen/auth/me esperando { token, user{...roles[],modulos[]...} }. Reutiliza
// la tabla usuario y los perfiles existentes de Salvatore: el rol_codigo se
// deriva de PerfilDescripcion (UPPER + espacios->'_'), así "GERENTE DE
// OPERACIONES" -> "GERENTE_DE_OPERACIONES" y "CHOFER" -> "CHOFER", que son los
// códigos que la Mobile usa para gatear módulos.
const db = require("../config/db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

function rolCodigo(descripcion) {
  return String(descripcion || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");
}

// Trae los perfiles del usuario como roles con el shape que espera la app.
function getRolesByUsuario(usuarioId) {
  return new Promise((resolve, reject) => {
    db.query(
      `SELECT p.PerfilId, p.PerfilDescripcion
         FROM usuarioperfil up
         JOIN perfil p ON up.PerfilId = p.PerfilId
        WHERE TRIM(up.UsuarioId) = ?`,
      [String(usuarioId).trim()],
      (err, rows) => {
        if (err) return reject(err);
        const roles = (rows || []).map((r) => ({
          rol_id: r.PerfilId,
          rol_nombre: r.PerfilDescripcion,
          rol_codigo: rolCodigo(r.PerfilDescripcion),
          ES_ADMIN: rolCodigo(r.PerfilDescripcion) === "ADMINISTRADOR",
        }));
        resolve(roles);
      }
    );
  });
}

// Construye el objeto `user` del contrato Mobile a partir de la fila usuario.
async function buildUserPayload(usuario) {
  const roles = await getRolesByUsuario(usuario.UsuarioId);
  const nombreCompleto = [usuario.UsuarioNombre, usuario.UsuarioApellido]
    .filter(Boolean)
    .join(" ")
    .trim();
  return {
    id: usuario.UsuarioId,
    nombre: nombreCompleto || usuario.UsuarioNombre || usuario.UsuarioId,
    email: usuario.UsuarioCorreo || null,
    isAdmin: usuario.UsuarioIsAdmin === "S",
    empresa: usuario.EmpresaId ?? 1,
    empresaNombre: usuario.EmpresaNombre ?? null,
    empresaTipo: usuario.EmpresaTipo ?? 'M',
    sucursal: usuario.LocalId ?? null,
    sucursalNombre: usuario.LocalNombre ?? null,
    departamentoId: null,
    cargo: roles[0]?.rol_nombre ?? null,
    avatarUrl: null,
    roles,
    modulos: [],
    codigo: usuario.UsuarioId,
    login: usuario.UsuarioId,
  };
}

function getUsuarioConLocal(login) {
  return new Promise((resolve, reject) => {
    db.query(
      `SELECT u.*, l.LocalNombre, e.EmpresaNombre, e.EmpresaTipo
         FROM usuario u
         LEFT JOIN local l ON u.LocalId = l.LocalId
         LEFT JOIN empresa e ON u.EmpresaId = e.EmpresaId
        WHERE TRIM(u.UsuarioId) = ?
        LIMIT 1`,
      [String(login).trim()],
      (err, rows) => {
        if (err) return reject(err);
        resolve(rows && rows.length ? rows[0] : null);
      }
    );
  });
}

exports.login = async (req, res) => {
  try {
    const { login, password } = req.body;
    if (!login || !password) {
      return res
        .status(400)
        .json({ success: false, message: "login y password son requeridos" });
    }

    const usuario = await getUsuarioConLocal(login);
    if (!usuario) {
      return res
        .status(401)
        .json({ success: false, message: "Credenciales inválidas" });
    }
    if (usuario.UsuarioEstado === "I") {
      return res
        .status(403)
        .json({ success: false, message: "Su usuario está inactivo." });
    }

    const ok = await bcrypt.compare(password, usuario.UsuarioContrasena);
    if (!ok) {
      return res
        .status(401)
        .json({ success: false, message: "Credenciales inválidas" });
    }

    // Payload del JWT compatible con el middleware existente (auth.js):
    // expone req.user.id = UsuarioId, que usan los endpoints de flota.
    const token = jwt.sign(
      {
        id: usuario.UsuarioId,
        email: usuario.UsuarioCorreo,
        isAdmin: usuario.UsuarioIsAdmin,
        estado: usuario.UsuarioEstado,
        LocalId: usuario.LocalId,
        EmpresaId: usuario.EmpresaId || 1,
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
    );

    const user = await buildUserPayload(usuario);
    res.json({ token, user });
  } catch (error) {
    console.error("Error en gen/auth/login:", error);
    res.status(500).json({ success: false, message: "Error en el servidor" });
  }
};

exports.me = async (req, res) => {
  try {
    const usuario = await getUsuarioConLocal(req.user.id);
    if (!usuario) {
      return res
        .status(404)
        .json({ success: false, message: "Usuario no encontrado" });
    }
    const user = await buildUserPayload(usuario);
    res.json(user);
  } catch (error) {
    console.error("Error en gen/auth/me:", error);
    res.status(500).json({ success: false, message: "Error en el servidor" });
  }
};
