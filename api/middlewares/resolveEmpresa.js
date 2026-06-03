// Resuelve la empresa activa para el request.
// - Admin (UsuarioIsAdmin=S): usa X-Empresa-Id del header (elegida en el frontend)
// - Usuario regular: usa EmpresaId del JWT
// El resultado queda en req.empresaId para todos los controllers.

module.exports = (req, res, next) => {
  if (req.user?.isAdmin === "S") {
    const headerEmpresa = req.headers["x-empresa-id"];
    req.empresaId = headerEmpresa ? parseInt(headerEmpresa, 10) : 1;
  } else {
    req.empresaId = req.user?.EmpresaId || 1;
  }
  next();
};
