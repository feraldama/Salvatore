const db = require("../config/db");
const Empresa = require("../models/empresa.model");
const { sendError } = require("../utils/errors");

// Fecha local (servidor) en formato YYYY-MM-DD. Evita el corrimiento de día
// que produce toISOString() al pasar a UTC (Paraguay es UTC-3/-4).
function hoyLocalISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

// Primer día del mes actual (local) en YYYY-MM-DD.
function inicioMesLocalISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
}

// GET /api/dashboard/resumen
// Devuelve KPIs por empresa para la visión consolidada del dueño:
// - Admin: una fila por cada empresa accesible (Minorista, Distribuidora, ...).
// - Usuario regular: solo su empresa.
// Las métricas se calculan con GROUP BY EmpresaId en una sola tirada por
// métrica (no una query por empresa), y luego se ensamblan por empresa.
exports.getResumenEmpresas = async (req, res) => {
  try {
    const todas = await Empresa.getAll();
    const accesibles =
      req.user?.isAdmin === "S"
        ? todas
        : todas.filter((e) => e.EmpresaId === (req.user?.EmpresaId || 1));

    if (accesibles.length === 0) {
      return res.json({ data: [] });
    }

    const hoy = hoyLocalISO();
    const inicioMes = inicioMesLocalISO();

    const conn = db.promise();

    // Saldo crédito = Total - VentaEntrega (fórmula establecida del sistema).
    // "Por cobrar" suma solo el saldo de los clientes que deben (saldo > 0 por
    // cliente), igual que getDeudasPendientesPorCliente — así el total coincide
    // con la tarjeta "Cuentas por cobrar" del dashboard y no se compensan
    // saldos negativos (ventas sobre-entregadas) con deudas reales.
    const [
      [ventasHoy],
      [ventasMes],
      [clientes],
      [productos],
      [porCobrar],
    ] = await Promise.all([
      conn.query(
        `SELECT EmpresaId, COUNT(*) AS Cantidad, COALESCE(SUM(Total), 0) AS Monto
           FROM venta WHERE DATE(VentaFecha) = ? GROUP BY EmpresaId`,
        [hoy]
      ),
      conn.query(
        `SELECT EmpresaId, COALESCE(SUM(Total), 0) AS Monto
           FROM venta WHERE DATE(VentaFecha) >= ? GROUP BY EmpresaId`,
        [inicioMes]
      ),
      conn.query(
        `SELECT EmpresaId, COUNT(*) AS Cantidad FROM clientes GROUP BY EmpresaId`
      ),
      conn.query(
        `SELECT EmpresaId, COUNT(*) AS Cantidad FROM producto GROUP BY EmpresaId`
      ),
      conn.query(
        `SELECT EmpresaId, COALESCE(SUM(saldo), 0) AS Saldo FROM (
           SELECT v.EmpresaId, v.ClienteId,
                  SUM(v.Total - COALESCE(v.VentaEntrega, 0)) AS saldo
             FROM venta v WHERE v.VentaTipo = 'CR'
            GROUP BY v.EmpresaId, v.ClienteId
           HAVING SUM(v.Total - COALESCE(v.VentaEntrega, 0)) > 0
         ) t GROUP BY EmpresaId`
      ),
    ]);

    // Indexar cada métrica por EmpresaId para ensamblar O(1).
    const idx = (rows, field) => {
      const m = new Map();
      for (const r of rows) m.set(Number(r.EmpresaId), Number(r[field]) || 0);
      return m;
    };

    const ventasHoyCant = idx(ventasHoy, "Cantidad");
    const ventasHoyMonto = idx(ventasHoy, "Monto");
    const ventasMesMonto = idx(ventasMes, "Monto");
    const clientesCant = idx(clientes, "Cantidad");
    const productosCant = idx(productos, "Cantidad");
    const porCobrarSaldo = idx(porCobrar, "Saldo");

    const data = accesibles.map((e) => {
      const id = Number(e.EmpresaId);
      return {
        EmpresaId: id,
        EmpresaNombre: e.EmpresaNombre,
        EmpresaTipo: e.EmpresaTipo, // 'M' minorista / 'D' distribuidora
        ventasHoyCantidad: ventasHoyCant.get(id) || 0,
        ventasHoyMonto: ventasHoyMonto.get(id) || 0,
        ventasMesMonto: ventasMesMonto.get(id) || 0,
        clientes: clientesCant.get(id) || 0,
        productos: productosCant.get(id) || 0,
        totalPorCobrar: porCobrarSaldo.get(id) || 0,
      };
    });

    res.json({ data });
  } catch (error) {
    console.error("Error en getResumenEmpresas:", error);
    sendError(res, error, 500);
  }
};
