const db = require("../config/db");

/**
 * Normaliza VentaFecha para que siempre incluya fecha y hora.
 * - Si no se proporciona valor: usa fecha/hora actual
 * - Si es solo fecha (YYYY-MM-DD): usa esa fecha con la hora actual del momento del registro
 * - Si es datetime completo: lo usa tal cual
 */
/**
 * Construye la cláusula WHERE para filtros de ventas.
 * Asume que la query incluye el JOIN a `vcp_sum` (suma de pagos por crédito)
 * para poder evaluar el estado pendiente/completado con la fórmula:
 *   Saldo = Total - VentaEntrega - SUM(VentaCreditoPagoMonto)
 * - Pendiente (P): solo aplica a ventas CR con Saldo > 0
 * - Completado (C): no-CR siempre, o CR con Saldo <= 0
 */
function buildVentaFiltersWhere(filters = {}) {
  const conditions = [];
  const params = [];

  // Scope por empresa: minorista (1) vs distribuidora (2). Si no se pasa
  // empresaId la query no se filtra — los controllers SIEMPRE deben pasarlo.
  if (filters.empresaId) {
    conditions.push("v.EmpresaId = ?");
    params.push(Number(filters.empresaId));
  }
  if (filters.tipo) {
    conditions.push("v.VentaTipo = ?");
    params.push(filters.tipo);
  }
  if (filters.almacenId) {
    conditions.push("v.AlmacenId = ?");
    params.push(Number(filters.almacenId));
  }
  // Scope por sucursal: las ventas del local son las de sus almacenes. null =
  // todas las sucursales de la empresa (admin con vista agregada).
  if (filters.localId) {
    conditions.push(
      "v.AlmacenId IN (SELECT a.AlmacenId FROM almacen a WHERE a.LocalId = ?)"
    );
    params.push(Number(filters.localId));
  }
  if (filters.fechaDesde) {
    conditions.push("DATE(v.VentaFecha) >= ?");
    params.push(filters.fechaDesde);
  }
  if (filters.fechaHasta) {
    conditions.push("DATE(v.VentaFecha) <= ?");
    params.push(filters.fechaHasta);
  }
  // Filtro por tipo de entrega: 'S' = solo envíos, 'N' = solo ventas normales.
  if (filters.esEnvio === "S" || filters.esEnvio === "N") {
    conditions.push("v.EsEnvio = ?");
    params.push(filters.esEnvio);
  }
  if (filters.estado === "P") {
    conditions.push(
      "v.VentaTipo = 'CR' AND (v.Total - COALESCE(v.VentaEntrega, 0) - COALESCE(vcp_sum.totalpagos, 0)) > 0"
    );
  } else if (filters.estado === "C") {
    conditions.push(
      "(v.VentaTipo <> 'CR' OR (v.Total - COALESCE(v.VentaEntrega, 0) - COALESCE(vcp_sum.totalpagos, 0)) <= 0)"
    );
  }

  const whereSql = conditions.length
    ? `WHERE ${conditions.join(" AND ")}`
    : "";
  return { whereSql, params };
}

function normalizeVentaFecha(value) {
  if (!value) return new Date();
  const str = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const now = new Date();
    const [y, m, d] = str.split("-").map(Number);
    return new Date(
      y,
      m - 1,
      d,
      now.getHours(),
      now.getMinutes(),
      now.getSeconds(),
      now.getMilliseconds()
    );
  }
  const d = value instanceof Date ? value : new Date(value);
  return isNaN(d.getTime()) ? new Date() : d;
}

const Venta = {
  getAll: (empresaId) => {
    return new Promise((resolve, reject) => {
      db.query(
        "SELECT * FROM venta WHERE EmpresaId = ?",
        [empresaId],
        (err, results) => {
          if (err) reject(err);
          resolve(results);
        }
      );
    });
  },

  getById: (id, empresaId) => {
    return new Promise((resolve, reject) => {
      db.query(
        `SELECT v.*,
          c.ClienteNombre, c.ClienteApellido,
          a.AlmacenNombre,
          u.UsuarioNombre
        FROM venta v
        LEFT JOIN clientes c ON v.ClienteId = c.ClienteId
        LEFT JOIN almacen a ON v.AlmacenId = a.AlmacenId
        LEFT JOIN usuario u ON v.VentaUsuario = u.UsuarioId
        WHERE v.VentaId = ? AND v.EmpresaId = ?`,
        [id, empresaId],
        (err, results) => {
          if (err) return reject(err);
          resolve(results.length > 0 ? results[0] : null);
        }
      );
    });
  },

  create: (data) => {
    return new Promise((resolve, reject) => {
      const empresaId = data.EmpresaId || 1;
      const query = `INSERT INTO venta (
        VentaFecha,
        ClienteId,
        AlmacenId,
        VentaTipo,
        VentaPagoTipo,
        VentaCantidadProductos,
        VentaUsuario,
        Total,
        VentaEntrega,
        EmpresaId
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

      const values = [
        normalizeVentaFecha(data.VentaFecha),
        data.ClienteId,
        data.AlmacenId,
        data.VentaTipo,
        data.VentaPagoTipo,
        data.VentaCantidadProductos,
        data.VentaUsuario,
        data.Total,
        data.VentaEntrega,
        empresaId,
      ];

      db.query(query, values, (err, result) => {
        if (err) return reject(err);
        Venta.getById(result.insertId, empresaId)
          .then((venta) => resolve(venta))
          .catch((error) => reject(error));
      });
    });
  },

  update: (id, data, empresaId) => {
    return new Promise((resolve, reject) => {
      const query = `UPDATE venta SET
        VentaFecha = ?,
        ClienteId = ?,
        AlmacenId = ?,
        VentaTipo = ?,
        VentaPagoTipo = ?,
        VentaCantidadProductos = ?,
        VentaUsuario = ?,
        Total = ?,
        VentaEntrega = ?
        WHERE VentaId = ? AND EmpresaId = ?`;

      const values = [
        normalizeVentaFecha(data.VentaFecha),
        data.ClienteId,
        data.AlmacenId,
        data.VentaTipo,
        data.VentaPagoTipo,
        data.VentaCantidadProductos,
        data.VentaUsuario,
        data.Total,
        data.VentaEntrega,
        id,
        empresaId,
      ];

      db.query(query, values, (err, result) => {
        if (err) return reject(err);
        if (result.affectedRows === 0) return resolve(null);
        Venta.getById(id, empresaId)
          .then((venta) => resolve(venta))
          .catch((error) => reject(error));
      });
    });
  },

  delete: (id) => {
    return new Promise((resolve, reject) => {
      // Primero eliminar registros asociados en orden correcto
      const deleteQueries = [
        // 1. Eliminar pagos de crédito (ventacreditopago)
        "DELETE vcp FROM ventacreditopago vcp INNER JOIN ventacredito vc ON vcp.VentaCreditoId = vc.VentaCreditoId WHERE vc.VentaId = ?",
        // 2. Eliminar registros de crédito (ventacredito)
        "DELETE FROM ventacredito WHERE VentaId = ?",
        // 3. Eliminar productos de la venta (ventaproducto)
        "DELETE FROM ventaproducto WHERE VentaId = ?",
        // 4. Finalmente eliminar la venta
        "DELETE FROM venta WHERE VentaId = ?",
      ];

      // Ejecutar las consultas en secuencia
      const executeQueries = async () => {
        try {
          for (const query of deleteQueries) {
            await new Promise((resolveQuery, rejectQuery) => {
              db.query(query, [id], (err, result) => {
                if (err) return rejectQuery(err);
                resolveQuery(result);
              });
            });
          }
          resolve(true);
        } catch (error) {
          reject(error);
        }
      };

      executeQueries();
    });
  },

  getAllPaginated: (
    limit,
    offset,
    sortBy = "VentaId",
    sortOrder = "ASC",
    filters = {}
  ) => {
    return new Promise((resolve, reject) => {
      const allowedSortFields = [
        "VentaId",
        "VentaFecha",
        "ClienteId",
        "AlmacenId",
        "VentaTipo",
        "VentaPagoTipo",
        "VentaCantidadProductos",
        "VentaUsuario",
        "Total",
        "VentaEntrega",
      ];

      const allowedSortOrders = ["ASC", "DESC"];
      const sortField = allowedSortFields.includes(sortBy) ? sortBy : "VentaId";
      const order = allowedSortOrders.includes(sortOrder.toUpperCase())
        ? sortOrder.toUpperCase()
        : "ASC";

      const { whereSql, params: filterParams } = buildVentaFiltersWhere(filters);

      const query = `
        SELECT v.*,
          c.ClienteNombre, c.ClienteApellido,
          a.AlmacenNombre,
          u.UsuarioNombre
        FROM venta v
        LEFT JOIN clientes c ON v.ClienteId = c.ClienteId
        LEFT JOIN almacen a ON v.AlmacenId = a.AlmacenId
        LEFT JOIN usuario u ON v.VentaUsuario = u.UsuarioId
        LEFT JOIN ventacredito vc ON vc.VentaId = v.VentaId
        LEFT JOIN (
          SELECT VentaCreditoId, SUM(VentaCreditoPagoMonto) AS totalpagos
          FROM ventacreditopago
          GROUP BY VentaCreditoId
        ) vcp_sum ON vcp_sum.VentaCreditoId = vc.VentaCreditoId
        ${whereSql}
        ORDER BY v.${sortField} ${order}
        LIMIT ? OFFSET ?`;

      db.query(query, [...filterParams, limit, offset], (err, results) => {
        if (err) return reject(err);

        const countQuery = `
          SELECT COUNT(*) as total
          FROM venta v
          LEFT JOIN ventacredito vc ON vc.VentaId = v.VentaId
          LEFT JOIN (
            SELECT VentaCreditoId, SUM(VentaCreditoPagoMonto) AS totalpagos
            FROM ventacreditopago
            GROUP BY VentaCreditoId
          ) vcp_sum ON vcp_sum.VentaCreditoId = vc.VentaCreditoId
          ${whereSql}`;

        db.query(countQuery, filterParams, (err, countResult) => {
          if (err) return reject(err);

          resolve({
            ventas: results,
            total: countResult[0].total,
          });
        });
      });
    });
  },

  searchVentas: (
    term,
    limit,
    offset,
    sortBy = "VentaId",
    sortOrder = "ASC",
    filters = {}
  ) => {
    return new Promise((resolve, reject) => {
      const allowedSortFields = [
        "VentaId",
        "VentaFecha",
        "ClienteId",
        "AlmacenId",
        "VentaTipo",
        "VentaPagoTipo",
        "VentaCantidadProductos",
        "VentaUsuario",
        "Total",
        "VentaEntrega",
      ];

      const allowedSortOrders = ["ASC", "DESC"];
      const sortField = allowedSortFields.includes(sortBy) ? sortBy : "VentaId";
      const order = allowedSortOrders.includes(sortOrder.toUpperCase())
        ? sortOrder.toUpperCase()
        : "ASC";

      // Mapear términos comunes a códigos de tipo de venta
      let tipoVentaSearch = term.toLowerCase();
      switch (tipoVentaSearch) {
        case "contado":
          tipoVentaSearch = "CO";
          break;
        case "credito":
        case "crédito":
          tipoVentaSearch = "CR";
          break;
        case "pos":
          tipoVentaSearch = "PO";
          break;
        case "transfer":
        case "transferencia":
          tipoVentaSearch = "TR";
          break;
        default:
          // Si no es ninguno de los tipos conocidos, mantener el término original
          break;
      }

      const { whereSql: filtersWhereSql, params: filterParams } =
        buildVentaFiltersWhere(filters);
      // filtersWhereSql viene con "WHERE ..." o "" — para AND-combinar con la
      // búsqueda convertimos a cláusula AND y quitamos el prefijo.
      const filtersAndClause = filtersWhereSql
        ? ` AND ${filtersWhereSql.replace(/^WHERE\s+/, "")}`
        : "";

      const searchQuery = `
        SELECT v.*,
          c.ClienteNombre, c.ClienteApellido,
          a.AlmacenNombre,
          u.UsuarioNombre
        FROM venta v
        LEFT JOIN clientes c ON v.ClienteId = c.ClienteId
        LEFT JOIN almacen a ON v.AlmacenId = a.AlmacenId
        LEFT JOIN usuario u ON v.VentaUsuario = u.UsuarioId
        LEFT JOIN ventacredito vc ON vc.VentaId = v.VentaId
        LEFT JOIN (
          SELECT VentaCreditoId, SUM(VentaCreditoPagoMonto) AS totalpagos
          FROM ventacreditopago
          GROUP BY VentaCreditoId
        ) vcp_sum ON vcp_sum.VentaCreditoId = vc.VentaCreditoId
        WHERE (
          CAST(v.VentaId AS CHAR) = ?
          OR TO_CHAR(v.VentaFecha, 'YYYY-MM-DD HH24:MI:SS') LIKE ?
          OR LOWER(CONCAT(COALESCE(c.ClienteNombre, ''), ' ', COALESCE(c.ClienteApellido, ''))) LIKE LOWER(?)
          OR LOWER(COALESCE(a.AlmacenNombre, '')) LIKE LOWER(?)
          OR v.VentaTipo = ?
          OR LOWER(
            CASE v.VentaTipo
              WHEN 'CO' THEN 'contado'
              WHEN 'CR' THEN 'credito'
              WHEN 'PO' THEN 'pos'
              WHEN 'TR' THEN 'transfer'
            END
          ) LIKE LOWER(?)
          OR LOWER(v.VentaPagoTipo) LIKE LOWER(?)
          OR CAST(v.VentaCantidadProductos AS CHAR) = ?
          OR LOWER(COALESCE(u.UsuarioNombre, '')) LIKE LOWER(?)
          OR CAST(v.Total AS CHAR) = ?
          OR LOWER(COALESCE(CAST(v.VentaEntrega AS TEXT), '')) LIKE LOWER(?)
        )${filtersAndClause}
        ORDER BY v.${sortField} ${order}
        LIMIT ? OFFSET ?
      `;

      // Para búsqueda exacta de números
      const exactValue = term;
      // Para búsqueda parcial de texto
      const likeValue = `%${term}%`;

      const searchParams = [
        exactValue, // VentaId
        likeValue, // VentaFecha
        likeValue, // Cliente nombre completo
        likeValue, // AlmacenNombre
        tipoVentaSearch, // VentaTipo (código exacto)
        likeValue, // VentaTipo (nombre descriptivo)
        likeValue, // VentaPagoTipo
        exactValue, // VentaCantidadProductos
        likeValue, // UsuarioNombre
        exactValue, // Total
        likeValue, // VentaEntrega
      ];

      const values = [...searchParams, ...filterParams, limit, offset];

      db.query(searchQuery, values, (err, results) => {
        if (err) {
          console.error("Error en la consulta de búsqueda:", err);
          return reject(err);
        }

        const countQuery = `
          SELECT COUNT(*) as total
          FROM venta v
          LEFT JOIN clientes c ON v.ClienteId = c.ClienteId
          LEFT JOIN almacen a ON v.AlmacenId = a.AlmacenId
          LEFT JOIN usuario u ON v.VentaUsuario = u.UsuarioId
          LEFT JOIN ventacredito vc ON vc.VentaId = v.VentaId
          LEFT JOIN (
            SELECT VentaCreditoId, SUM(VentaCreditoPagoMonto) AS totalpagos
            FROM ventacreditopago
            GROUP BY VentaCreditoId
          ) vcp_sum ON vcp_sum.VentaCreditoId = vc.VentaCreditoId
          WHERE (
            CAST(v.VentaId AS CHAR) = ?
            OR TO_CHAR(v.VentaFecha, 'YYYY-MM-DD HH24:MI:SS') LIKE ?
            OR LOWER(CONCAT(COALESCE(c.ClienteNombre, ''), ' ', COALESCE(c.ClienteApellido, ''))) LIKE LOWER(?)
            OR LOWER(COALESCE(a.AlmacenNombre, '')) LIKE LOWER(?)
            OR v.VentaTipo = ?
            OR LOWER(
              CASE v.VentaTipo
                WHEN 'CO' THEN 'contado'
                WHEN 'CR' THEN 'credito'
                WHEN 'PO' THEN 'pos'
                WHEN 'TR' THEN 'transfer'
              END
            ) LIKE LOWER(?)
            OR LOWER(v.VentaPagoTipo) LIKE LOWER(?)
            OR CAST(v.VentaCantidadProductos AS CHAR) = ?
            OR LOWER(COALESCE(u.UsuarioNombre, '')) LIKE LOWER(?)
            OR CAST(v.Total AS CHAR) = ?
            OR LOWER(COALESCE(CAST(v.VentaEntrega AS TEXT), '')) LIKE LOWER(?)
          )${filtersAndClause}
        `;

        const countValues = [...searchParams, ...filterParams];

        db.query(countQuery, countValues, (err, countResult) => {
          if (err) {
            console.error("Error en la consulta de conteo:", err);
            return reject(err);
          }
          resolve({
            ventas: results,
            total: countResult[0]?.total || 0,
          });
        });
      });
    });
  },

  // Obtener ventas pendientes por cliente
  getVentasPendientesPorCliente: (clienteId, localId, empresaId) => {
    return new Promise((resolve, reject) => {
      let query = `
        SELECT
          v.VentaId,
          v.VentaFecha,
          CAST(v.Total AS DECIMAL(10,2)) as Total,
          CAST(COALESCE(v.VentaEntrega, 0) AS DECIMAL(10,2)) as VentaEntrega,
          CAST((v.Total - COALESCE(v.VentaEntrega, 0)) AS DECIMAL(10,2)) as Saldo
        FROM venta v
        JOIN usuario u ON v.VentaUsuario = u.UsuarioId
        WHERE v.ClienteId = ?
        AND v.VentaTipo = 'CR'
        AND v.EmpresaId = ?
      `;

      const params = [clienteId, empresaId];

      // Si se proporciona localId, filtrar por el local del usuario que realizó la venta
      if (localId) {
        query += ` AND u.LocalId = ?`;
        params.push(localId);
      }

      // Sin GROUP BY: el saldo es un filtro de fila, va en WHERE (PG no
      // admite alias del SELECT en HAVING, y aquí HAVING no corresponde).
      query += ` AND (v.Total - COALESCE(v.VentaEntrega, 0)) > 0 ORDER BY v.VentaFecha ASC`;

      db.query(query, params, (err, results) => {
        if (err) {
          console.error("Error en getVentasPendientesPorCliente:", err);
          return reject(err);
        }
        // Convertir explícitamente los valores a número
        const processedResults = results.map((row) => ({
          ...row,
          Total: Number(row.Total),
          VentaEntrega: Number(row.VentaEntrega),
          Saldo: Number(row.Saldo),
        }));
        resolve(processedResults);
      });
    });
  },

  // Obtener deudas pendientes agrupadas por cliente
  getDeudasPendientesPorCliente: (empresaId) => {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT
          c.ClienteId,
          CONCAT(TRIM(c.ClienteNombre), ' ', TRIM(c.ClienteApellido)) AS Cliente,
          SUM(v.Total) AS TotalVentas,
          SUM(COALESCE(v.VentaEntrega,0)) AS TotalEntregado,
          SUM(v.Total - COALESCE(v.VentaEntrega,0)) AS Saldo
        FROM venta v
        JOIN clientes c ON v.ClienteId = c.ClienteId
        WHERE v.VentaTipo = 'CR'
        AND v.EmpresaId = ?
        GROUP BY c.ClienteId, c.ClienteNombre, c.ClienteApellido
        HAVING SUM(v.Total - COALESCE(v.VentaEntrega, 0)) > 0
        ORDER BY CONCAT(TRIM(c.ClienteNombre), ' ', TRIM(c.ClienteApellido))
      `;
      db.query(query, [empresaId], (err, results) => {
        if (err) return reject(err);
        resolve(results);
      });
    });
  },

  // Totales de venta agrupados por día (para la tendencia del dashboard).
  // Suma el Total facturado y cuenta las ventas por fecha. Devuelve solo los
  // días con ventas; el frontend rellena los días sin movimiento en 0.
  getVentasPorDia: (fechaDesde, fechaHasta, empresaId) => {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT TO_CHAR(DATE(v.VentaFecha), 'YYYY-MM-DD') AS Fecha,
               COALESCE(SUM(v.Total), 0) AS Total,
               COUNT(*) AS Cantidad
        FROM venta v
        WHERE DATE(v.VentaFecha) BETWEEN ? AND ?
        AND v.EmpresaId = ?
        GROUP BY DATE(v.VentaFecha)
        ORDER BY DATE(v.VentaFecha) ASC
      `;
      db.query(sql, [fechaDesde, fechaHasta, empresaId], (err, rows) => {
        if (err) return reject(err);
        resolve(rows || []);
      });
    });
  },

  // Obtener reporte de ventas por cliente y rango de fechas
  // Si clienteId es "TODOS", devuelve ventas de todos los clientes
  getReporteVentasPorCliente: (clienteId, fechaDesde, fechaHasta, empresaId) => {
    return new Promise((resolve, reject) => {
      const esTodos = String(clienteId).toUpperCase() === "TODOS";

      const ejecutarVentas = (cliente) => {
        const ventasQuery = `
          SELECT
            v.*,
            c.ClienteNombre,
            c.ClienteApellido,
            c.ClienteRUC,
            a.AlmacenNombre,
            u.UsuarioNombre,
            v.VentaUsuario AS UsuarioId
          FROM venta v
          LEFT JOIN clientes c ON v.ClienteId = c.ClienteId
          LEFT JOIN almacen a ON v.AlmacenId = a.AlmacenId
          LEFT JOIN usuario u ON v.VentaUsuario = u.UsuarioId
          WHERE DATE(v.VentaFecha) BETWEEN ? AND ?
          AND v.EmpresaId = ?
          ${esTodos ? "" : "AND v.ClienteId = ?"}
          ORDER BY v.VentaFecha ASC, v.VentaId ASC
        `;

        const ventasParams = esTodos
          ? [fechaDesde, fechaHasta, empresaId]
          : [fechaDesde, fechaHasta, empresaId, clienteId];

        db.query(ventasQuery, ventasParams, (err, ventasResults) => {
          if (err) return reject(err);

          // Sin ventas: devolver vacío sin más queries.
          if (ventasResults.length === 0) {
            return resolve({
              cliente: {
                ClienteId: cliente.ClienteId,
                ClienteNombre: cliente.ClienteNombre,
                ClienteApellido: cliente.ClienteApellido,
                ClienteRUC: cliente.ClienteRUC,
              },
              fechaDesde,
              fechaHasta,
              ventas: ventasResults.map((v) => ({
                ...v,
                SaldoPendiente: 0,
                Pagos: [],
              })),
            });
          }

          // IDs de ventas a crédito (único set que va a tener ventacredito).
          const creditoVentaIds = ventasResults
            .filter((v) => v.VentaTipo === "CR")
            .map((v) => v.VentaId);

          const finalize = (creditosByVentaId, pagosByCreditoId) => {
            const ventasConDetalle = ventasResults.map((venta) => {
              const base = { ...venta, SaldoPendiente: 0, Pagos: [] };
              if (venta.VentaTipo !== "CR") return base;

              const total = Number(venta.Total) || 0;
              const entrega = Number(venta.VentaEntrega) || 0;
              base.SaldoPendiente = total - entrega;

              const credito = creditosByVentaId.get(venta.VentaId);
              if (credito) {
                base.Pagos = pagosByCreditoId.get(credito.VentaCreditoId) || [];
              }
              return base;
            });

            resolve({
              cliente: {
                ClienteId: cliente.ClienteId,
                ClienteNombre: cliente.ClienteNombre,
                ClienteApellido: cliente.ClienteApellido,
                ClienteRUC: cliente.ClienteRUC,
              },
              fechaDesde,
              fechaHasta,
              ventas: ventasConDetalle,
            });
          };

          // Sin ventas a crédito: no hacen falta las otras 2 queries.
          if (creditoVentaIds.length === 0) {
            return finalize(new Map(), new Map());
          }

          // Query #2: todos los ventacredito del set en una sola tirada.
          db.query(
            `SELECT * FROM ventacredito WHERE VentaId IN (?)`,
            [creditoVentaIds],
            (err, creditosResults) => {
              if (err) return reject(err);

              const creditosByVentaId = new Map(
                creditosResults.map((c) => [c.VentaId, c])
              );
              const creditoIds = creditosResults.map((c) => c.VentaCreditoId);

              if (creditoIds.length === 0) {
                return finalize(creditosByVentaId, new Map());
              }

              // Query #3: todos los pagos del set, ordenados y agrupados en memoria.
              db.query(
                `SELECT * FROM ventacreditopago
                 WHERE VentaCreditoId IN (?)
                 ORDER BY VentaCreditoPagoFecha ASC, VentaCreditoPagoId ASC`,
                [creditoIds],
                (err, pagosResults) => {
                  if (err) return reject(err);

                  const pagosByCreditoId = new Map();
                  for (const pago of pagosResults) {
                    const arr = pagosByCreditoId.get(pago.VentaCreditoId);
                    if (arr) arr.push(pago);
                    else pagosByCreditoId.set(pago.VentaCreditoId, [pago]);
                  }

                  finalize(creditosByVentaId, pagosByCreditoId);
                }
              );
            }
          );
        });
      };

      if (esTodos) {
        ejecutarVentas({
          ClienteId: 0,
          ClienteNombre: "TODOS",
          ClienteApellido: "",
          ClienteRUC: "",
        });
      } else {
        const clienteQuery = "SELECT * FROM clientes WHERE ClienteId = ?";
        db.query(clienteQuery, [clienteId], (err, clienteResults) => {
          if (err) return reject(err);
          if (clienteResults.length === 0) {
            return reject(new Error("Cliente no encontrado"));
          }
          ejecutarVentas(clienteResults[0]);
        });
      }
    });
  },

  // Reporte de envíos: detalle de ventas marcadas EsEnvio en un rango, más los
  // totales por forma de pago. Los métodos cobrados ahora (efectivo/POS/voucher/
  // transferencia) salen de registrodiariocaja (grupos de envío 11-14, atados a
  // la venta por el N° del detalle); el crédito (paga al recibir) = Total -
  // VentaEntrega. Scope por empresa siempre; fecha y vendedor opcionales.
  getEnviosResumen: async ({ empresaId, fechaDesde, fechaHasta, vendedorId }) => {
    const pe = db.promise();
    const cond = ["v.EsEnvio = 'S'", "v.EmpresaId = ?"];
    const params = [Number(empresaId)];
    if (fechaDesde) {
      cond.push("DATE(v.VentaFecha) >= ?");
      params.push(fechaDesde);
    }
    if (fechaHasta) {
      cond.push("DATE(v.VentaFecha) <= ?");
      params.push(fechaHasta);
    }
    if (vendedorId) {
      cond.push("c.VendedorId = ?");
      params.push(Number(vendedorId));
    }
    const where = cond.join(" AND ");

    // Detalle de ventas envío.
    const [ventas] = await pe.query(
      `SELECT v.VentaId, v.VentaFecha, v.VentaTipo, v.Total, v.VentaEntrega,
              (v.Total - v.VentaEntrega) AS Pendiente,
              c.ClienteNombre, c.ClienteApellido,
              ve.VendedorId, ve.VendedorNombre, ve.VendedorApellido
         FROM venta v
         LEFT JOIN clientes c ON c.ClienteId = v.ClienteId
         LEFT JOIN vendedor ve ON ve.VendedorId = c.VendedorId
        WHERE ${where}
        ORDER BY v.VentaFecha DESC, v.VentaId DESC`,
      params
    );

    // Totales por método cobrado al confirmar (grupos de envío en caja),
    // atados a las ventas del filtro por el N° que figura en el detalle.
    const [metodos] = await pe.query(
      `SELECT r.TipoGastoGrupoId AS grupo,
              COALESCE(SUM(r.RegistroDiarioCajaMonto), 0) AS total
         FROM registrodiariocaja r
         JOIN venta v
           ON v.VentaId = CAST(
                substring(r.RegistroDiarioCajaDetalle from 'N°:\\s*([0-9]+)') AS INTEGER
              )
         LEFT JOIN clientes c ON c.ClienteId = v.ClienteId
        WHERE r.TipoGastoId = 2
          AND r.TipoGastoGrupoId IN (7, 8, 9, 10)
          AND ${where}
        GROUP BY r.TipoGastoGrupoId`,
      params
    );

    const porMetodo = {
      efectivo: 0,
      pos: 0,
      voucher: 0,
      transferencia: 0,
      credito: 0,
    };
    // Grupos de cobro de envío: 7=efectivo, 8=POS, 9=voucher, 10=transferencia
    // (los inserta la confirmación de venta; el grupo 11 es cuenta corriente y
    // NO es dinero recibido, por eso no se cuenta acá).
    for (const m of metodos) {
      const g = Number(m.grupo);
      if (g === 7) porMetodo.efectivo = Number(m.total);
      else if (g === 8) porMetodo.pos = Number(m.total);
      else if (g === 9) porMetodo.voucher = Number(m.total);
      else if (g === 10) porMetodo.transferencia = Number(m.total);
    }
    porMetodo.credito = ventas.reduce(
      (a, v) => a + Number(v.Pendiente || 0),
      0
    );

    const totalEnviado = ventas.reduce((a, v) => a + Number(v.Total || 0), 0);
    return { porMetodo, totalEnviado, cantidad: ventas.length, ventas };
  },

  // Reporte de envíos AGRUPADO POR MÓVIL (vehículo de flota). Mismo criterio que
  // getEnviosResumen (ventas EsEnvio de la empresa, métodos cobrados de los grupos
  // de caja 11-14, crédito = Total - VentaEntrega), pero separado por el vehículo
  // asignado en venta_envio. Las ventas sin móvil asignado caen en un grupo aparte
  // (vehiculo_id = null). Scope por empresa siempre; fechas opcionales.
  getEnviosPorVehiculo: async ({ empresaId, fechaDesde, fechaHasta }) => {
    const pe = db.promise();
    const cond = ["v.EsEnvio = 'S'", "v.EmpresaId = ?"];
    const params = [Number(empresaId)];
    if (fechaDesde) {
      cond.push("DATE(v.VentaFecha) >= ?");
      params.push(fechaDesde);
    }
    if (fechaHasta) {
      cond.push("DATE(v.VentaFecha) <= ?");
      params.push(fechaHasta);
    }
    const where = cond.join(" AND ");

    // Detalle de ventas envío con el móvil asignado. Los alias de flota van en
    // snake_case (chapa/marca/modelo) tal como vienen de flota_vehiculo.
    const [ventas] = await pe.query(
      `SELECT v.VentaId, v.VentaFecha, v.VentaTipo, v.Total, v.VentaEntrega,
              (v.Total - v.VentaEntrega) AS Pendiente,
              c.ClienteNombre, c.ClienteApellido,
              env.vehiculo_id AS vehiculo_id,
              fv.chapa AS chapa, fv.marca AS marca, fv.modelo AS modelo
         FROM venta v
         LEFT JOIN venta_envio env ON env.venta_id = v.VentaId
         LEFT JOIN flota_vehiculo fv ON fv.id = env.vehiculo_id
         LEFT JOIN clientes c ON c.ClienteId = v.ClienteId
        WHERE ${where}
        ORDER BY fv.chapa ASC NULLS LAST, v.VentaFecha DESC, v.VentaId DESC`,
      params
    );

    // Totales por método cobrado (grupos de envío en caja), por vehículo.
    const [metodos] = await pe.query(
      `SELECT env.vehiculo_id AS vehiculo_id,
              r.TipoGastoGrupoId AS grupo,
              COALESCE(SUM(r.RegistroDiarioCajaMonto), 0) AS total
         FROM registrodiariocaja r
         JOIN venta v
           ON v.VentaId = CAST(
                substring(r.RegistroDiarioCajaDetalle from 'N°:\\s*([0-9]+)') AS INTEGER
              )
         LEFT JOIN venta_envio env ON env.venta_id = v.VentaId
        WHERE r.TipoGastoId = 2
          AND r.TipoGastoGrupoId IN (7, 8, 9, 10)
          AND ${where}
        GROUP BY env.vehiculo_id, r.TipoGastoGrupoId`,
      params
    );

    // Método de cobro POR VENTA (para mostrar la forma de pago en cada renglón).
    // Misma fuente que los totales (grupos 11-14 atados por el N° del detalle).
    const [metodosVenta] = await pe.query(
      `SELECT CAST(
                substring(r.RegistroDiarioCajaDetalle from 'N°:\\s*([0-9]+)') AS INTEGER
              ) AS venta_id,
              r.TipoGastoGrupoId AS grupo,
              COALESCE(SUM(r.RegistroDiarioCajaMonto), 0) AS total
         FROM registrodiariocaja r
         JOIN venta v
           ON v.VentaId = CAST(
                substring(r.RegistroDiarioCajaDetalle from 'N°:\\s*([0-9]+)') AS INTEGER
              )
        WHERE r.TipoGastoId = 2
          AND r.TipoGastoGrupoId IN (7, 8, 9, 10)
          AND ${where}
        GROUP BY venta_id, r.TipoGastoGrupoId`,
      params
    );

    // Mapa ventaId -> etiquetas de método cobrado (efectivo/POS/voucher/transfer).
    // Grupos de envío: 7=efectivo, 8=POS, 9=voucher, 10=transferencia.
    const ETIQUETA_GRUPO = {
      7: "Efectivo",
      8: "POS",
      9: "Voucher",
      10: "Transferencia",
    };
    const metodosPorVenta = new Map();
    for (const m of metodosVenta) {
      if (Number(m.total) === 0) continue;
      const id = Number(m.venta_id);
      if (!metodosPorVenta.has(id)) metodosPorVenta.set(id, []);
      const etiqueta = ETIQUETA_GRUPO[Number(m.grupo)];
      if (etiqueta) metodosPorVenta.get(id).push(etiqueta);
    }
    // Construye la etiqueta de forma de pago de una venta: los métodos cobrados
    // más "Crédito" si quedó saldo pendiente. Si no hubo cobro, es "Crédito".
    const formaPagoDe = (v) => {
      const partes = metodosPorVenta.get(Number(v.VentaId)) || [];
      if (Number(v.Pendiente || 0) > 0) partes.push("Crédito");
      return partes.length ? Array.from(new Set(partes)).join(" + ") : "-";
    };

    // Agrupar ventas por vehículo. Clave: vehiculo_id (o "SIN" si no tiene móvil).
    const grupos = new Map();
    const nuevoMetodo = () => ({
      efectivo: 0,
      pos: 0,
      voucher: 0,
      transferencia: 0,
      credito: 0,
    });
    const claveVehiculo = (id) => (id == null ? "SIN" : String(id));
    const obtenerGrupo = (row) => {
      const key = claveVehiculo(row.vehiculo_id);
      if (!grupos.has(key)) {
        grupos.set(key, {
          vehiculoId: row.vehiculo_id ?? null,
          chapa: row.chapa ?? null,
          marca: row.marca ?? null,
          modelo: row.modelo ?? null,
          totalEnviado: 0,
          cantidad: 0,
          porMetodo: nuevoMetodo(),
          ventas: [],
        });
      }
      return grupos.get(key);
    };

    for (const v of ventas) {
      const g = obtenerGrupo(v);
      g.ventas.push({ ...v, formaPago: formaPagoDe(v) });
      g.cantidad += 1;
      g.totalEnviado += Number(v.Total || 0);
      g.porMetodo.credito += Number(v.Pendiente || 0);
    }

    for (const m of metodos) {
      // Asegura el grupo aunque no tenga filas de venta listadas (defensivo).
      const key = claveVehiculo(m.vehiculo_id);
      if (!grupos.has(key)) {
        grupos.set(key, {
          vehiculoId: m.vehiculo_id ?? null,
          chapa: null,
          marca: null,
          modelo: null,
          totalEnviado: 0,
          cantidad: 0,
          porMetodo: nuevoMetodo(),
          ventas: [],
        });
      }
      const g = grupos.get(key);
      const grupo = Number(m.grupo);
      if (grupo === 7) g.porMetodo.efectivo += Number(m.total);
      else if (grupo === 8) g.porMetodo.pos += Number(m.total);
      else if (grupo === 9) g.porMetodo.voucher += Number(m.total);
      else if (grupo === 10) g.porMetodo.transferencia += Number(m.total);
    }

    // Ordenar: móviles con chapa primero (alfabético), "Sin móvil" al final.
    const vehiculos = Array.from(grupos.values()).sort((a, b) => {
      if (a.vehiculoId == null) return 1;
      if (b.vehiculoId == null) return -1;
      return String(a.chapa || "").localeCompare(String(b.chapa || ""));
    });

    // Totales generales.
    const totales = {
      totalEnviado: vehiculos.reduce((a, g) => a + g.totalEnviado, 0),
      cantidad: vehiculos.reduce((a, g) => a + g.cantidad, 0),
      porMetodo: nuevoMetodo(),
    };
    for (const g of vehiculos) {
      totales.porMetodo.efectivo += g.porMetodo.efectivo;
      totales.porMetodo.pos += g.porMetodo.pos;
      totales.porMetodo.voucher += g.porMetodo.voucher;
      totales.porMetodo.transferencia += g.porMetodo.transferencia;
      totales.porMetodo.credito += g.porMetodo.credito;
    }

    return { vehiculos, totales };
  },

  // Reporte de ventas agrupadas POR VENDEDOR, para liquidar comisiones. El
  // vendedor se resuelve por la venta (VentaVendedorId) y, si no está cargado,
  // por el cliente (clientes.VendedorId) — hoy las ventas se atribuyen siempre
  // vía cliente. Las ventas sin vendedor caen en un grupo aparte (id null). El
  // porcentaje de comisión NO se calcula acá: el reporte lo aplica con un % que
  // ingresa el usuario sobre el total vendido. Scope por empresa; fechas opc.
  getVentasPorVendedor: async ({ empresaId, fechaDesde, fechaHasta }) => {
    const pe = db.promise();
    const cond = ["v.EmpresaId = ?"];
    const params = [Number(empresaId)];
    if (fechaDesde) {
      cond.push("DATE(v.VentaFecha) >= ?");
      params.push(fechaDesde);
    }
    if (fechaHasta) {
      cond.push("DATE(v.VentaFecha) <= ?");
      params.push(fechaHasta);
    }
    const where = cond.join(" AND ");

    // Detalle de TODAS las ventas del período con su vendedor resuelto. El
    // agrupado por vendedor se arma en JS para devolver también el detalle.
    const [rows] = await pe.query(
      `SELECT v.VentaId, v.VentaFecha, v.VentaTipo, v.Total, v.VentaEntrega,
              (v.Total - v.VentaEntrega) AS Pendiente,
              c.ClienteNombre, c.ClienteApellido,
              COALESCE(v.VentaVendedorId, c.VendedorId) AS vendedor_id,
              ve.VendedorNombre, ve.VendedorApellido
         FROM venta v
         LEFT JOIN clientes c ON c.ClienteId = v.ClienteId
         LEFT JOIN vendedor ve
                ON ve.VendedorId = COALESCE(v.VentaVendedorId, c.VendedorId)
        WHERE ${where}
        ORDER BY ve.VendedorNombre ASC NULLS LAST, v.VentaFecha DESC, v.VentaId DESC`,
      params
    );

    // Agrupar por vendedor (clave: vendedor_id o "SIN" si no tiene vendedor).
    const grupos = new Map();
    const claveVendedor = (id) => (id == null ? "SIN" : String(id));
    for (const r of rows) {
      const key = claveVendedor(r.vendedor_id);
      if (!grupos.has(key)) {
        grupos.set(key, {
          vendedorId: r.vendedor_id ?? null,
          nombre: r.VendedorNombre ?? null,
          apellido: r.VendedorApellido ?? null,
          cantidad: 0,
          totalVendido: 0,
          totalEntregado: 0,
          totalPendiente: 0,
          ventas: [],
        });
      }
      const g = grupos.get(key);
      g.ventas.push({
        VentaId: r.VentaId,
        VentaFecha: r.VentaFecha,
        VentaTipo: r.VentaTipo,
        Total: Number(r.Total) || 0,
        VentaEntrega: Number(r.VentaEntrega) || 0,
        Pendiente: Number(r.Pendiente) || 0,
        ClienteNombre: r.ClienteNombre ?? null,
        ClienteApellido: r.ClienteApellido ?? null,
      });
      g.cantidad += 1;
      g.totalVendido += Number(r.Total) || 0;
      g.totalEntregado += Number(r.VentaEntrega) || 0;
      g.totalPendiente += Number(r.Pendiente) || 0;
    }

    // Vendedores con ventas primero (mayor total), "Sin vendedor" al final.
    const vendedores = Array.from(grupos.values()).sort((a, b) => {
      if (a.vendedorId == null) return 1;
      if (b.vendedorId == null) return -1;
      return b.totalVendido - a.totalVendido;
    });

    const totales = vendedores.reduce(
      (acc, v) => ({
        cantidad: acc.cantidad + v.cantidad,
        totalVendido: acc.totalVendido + v.totalVendido,
        totalEntregado: acc.totalEntregado + v.totalEntregado,
        totalPendiente: acc.totalPendiente + v.totalPendiente,
      }),
      { cantidad: 0, totalVendido: 0, totalEntregado: 0, totalPendiente: 0 }
    );

    return { vendedores, totales };
  },
};

module.exports = Venta;
