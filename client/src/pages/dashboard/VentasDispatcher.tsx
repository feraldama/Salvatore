import { useAuth } from "../../contexts/useAuth";
import Sales from "./Sales";
import SalesMayorista from "./SalesMayorista";

/**
 * Decide qué pantalla de venta mostrar según el tipo de empresa:
 *  - 'D' (distribuidora) -> pantalla mayorista
 *  - 'M' (minorista) u otro -> pantalla minorista (por defecto)
 *
 * La pantalla se resuelve por la empresa a la que pertenece el usuario:
 *  - Vendedor / usuario regular: queda fijo a su empresa (user.EmpresaTipo,
 *    derivado de su local en el login). Disponible al instante, sin parpadeo.
 *  - Admin: sigue a la empresa activa seleccionada en el switcher; si todavía
 *    no resolvió, cae a la empresa de su propio local.
 */
export default function VentasDispatcher() {
  const { user, empresaActiva } = useAuth();
  const esAdmin = user?.isAdmin === "S";

  const tipo = esAdmin
    ? empresaActiva?.EmpresaTipo ?? user?.EmpresaTipo
    : user?.EmpresaTipo;

  return tipo === "D" ? <SalesMayorista /> : <Sales />;
}
