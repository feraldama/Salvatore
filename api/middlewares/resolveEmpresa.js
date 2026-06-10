// Resuelve el SCOPE del request: empresa activa + local (sucursal) activo.
//
// Empresa (req.empresaId):
//   - Admin (UsuarioIsAdmin=S): usa X-Empresa-Id del header (elegida en el frontend).
//   - Usuario regular: usa EmpresaId del JWT.
//
// Local / sucursal (req.localId):
//   - Admin: usa X-Local-Id del header si viene; si no, null = TODAS las sucursales
//     de la empresa activa (vista agregada).
//   - Usuario regular: su LocalId del JWT es fijo. LocalId 0 ("TODOS") se trata
//     como null = sin restricción de sucursal (compatibilidad con datos viejos).
//
// Almacén (req.almacenId):
//   - Almacén del usuario (uno por local). Se usa para mostrar/mover stock de la
//     sucursal activa. null = sin almacén fijo (admin agregado).
//
// Diseño: un único middleware en vez de uno por scope para no tocar las ~20
// rutas que ya montan resolveEmpresa.

function toIntOrNull(value) {
  if (value == null || value === "") return null;
  const n = parseInt(value, 10);
  return Number.isNaN(n) ? null : n;
}

module.exports = (req, res, next) => {
  const isAdmin = req.user?.isAdmin === "S";

  if (isAdmin) {
    req.empresaId = toIntOrNull(req.headers["x-empresa-id"]) ?? 1;
    req.localId = toIntOrNull(req.headers["x-local-id"]); // null = todas las sucursales
  } else {
    req.empresaId = req.user?.EmpresaId || 1;
    const lid = toIntOrNull(req.user?.LocalId);
    req.localId = lid && lid !== 0 ? lid : null; // 0 = TODOS = sin restricción
  }

  req.almacenId = toIntOrNull(req.user?.AlmacenId);
  next();
};
