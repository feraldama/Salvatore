const PerfilMenu = require("../models/perfilmenu.model");

// Control de permisos por menú en la API, con la misma regla que usa el
// frontend (usePermiso): los admin (isAdmin 'S') pueden todo; el resto
// necesita la acción en alguno de los menús de su perfil (perfilmenu).
//
//   verificarPermiso("REPARTOS", "crear")
//   verificarPermiso(["REPARTOS", "CONTROLREPARTOS"], "leer") // alcanza uno
//
// Va después de authMiddleware (lee req.user del JWT).
const verificarPermiso = (menus, accion) => {
  const lista = Array.isArray(menus) ? menus : [menus];
  return async (req, res, next) => {
    try {
      const user = req.user;
      if (!user || user.id == null) {
        return res.status(401).json({ message: "Sesión no válida" });
      }
      if (user.isAdmin === "S") return next();
      const permisos = await PerfilMenu.getPermisosByUsuarioId(user.id);
      if (lista.some((m) => permisos[m] && permisos[m][accion])) {
        return next();
      }
      return res
        .status(403)
        .json({ message: "No tiene permiso para esta acción" });
    } catch (err) {
      console.error("Error al verificar permisos:", err);
      return res.status(500).json({ message: "Error al verificar permisos" });
    }
  };
};

module.exports = verificarPermiso;
