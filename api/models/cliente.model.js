const db = require("../config/db");

function buildClienteFiltersWhere(filters = {}) {
  const conditions = [];
  const params = [];

  // Scope por empresa: clientes minoristas (1) vs B2B de la distribuidora (2).
  if (filters.empresaId) {
    conditions.push("EmpresaId = ?");
    params.push(Number(filters.empresaId));
  }
  if (filters.tipo) {
    conditions.push("ClienteTipo = ?");
    params.push(filters.tipo);
  }

  return { conditions, params };
}

const Cliente = {
  getAll: (empresaId) => {
    return new Promise((resolve, reject) => {
      db.query(
        "SELECT * FROM clientes WHERE EmpresaId = ?",
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
        "SELECT * FROM clientes WHERE ClienteId = ? AND EmpresaId = ?",
        [id, empresaId],
        (err, results) => {
          if (err) return reject(err);
          resolve(results.length > 0 ? results[0] : null);
        }
      );
    });
  },

  getAllPaginated: (
    limit,
    offset,
    sortBy = "ClienteId",
    sortOrder = "ASC",
    filters = {}
  ) => {
    return new Promise((resolve, reject) => {
      const allowedSortFields = [
        "ClienteId",
        "ClienteRUC",
        "ClienteNombre",
        "ClienteApellido",
        "ClienteDireccion",
        "ClienteTelefono",
        "ClienteTipo",
        "UsuarioId",
      ];
      const allowedSortOrders = ["ASC", "DESC"];
      const sortField = allowedSortFields.includes(sortBy)
        ? sortBy
        : "ClienteId";
      const order = allowedSortOrders.includes(sortOrder.toUpperCase())
        ? sortOrder.toUpperCase()
        : "ASC";

      const { conditions, params: filterParams } =
        buildClienteFiltersWhere(filters);
      const whereSql = conditions.length
        ? `WHERE ${conditions.join(" AND ")}`
        : "";

      db.query(
        `SELECT * FROM clientes ${whereSql} ORDER BY ${sortField} ${order} LIMIT ? OFFSET ?`,
        [...filterParams, limit, offset],
        (err, results) => {
          if (err) return reject(err);

          const countQuery = `SELECT COUNT(*) as total FROM clientes ${whereSql}`;

          db.query(countQuery, filterParams, (err, countResult) => {
            if (err) return reject(err);

            resolve({
              clientes: results,
              total: countResult[0].total,
            });
          });
        }
      );
    });
  },

  search: (
    term,
    limit,
    offset,
    sortBy = "ClienteId",
    sortOrder = "ASC",
    filters = {}
  ) => {
    return new Promise((resolve, reject) => {
      const allowedSortFields = [
        "ClienteId",
        "ClienteRUC",
        "ClienteNombre",
        "ClienteApellido",
        "ClienteDireccion",
        "ClienteTelefono",
        "ClienteTipo",
        "UsuarioId",
      ];
      const allowedSortOrders = ["ASC", "DESC"];
      const sortField = allowedSortFields.includes(sortBy)
        ? sortBy
        : "ClienteId";
      const order = allowedSortOrders.includes(sortOrder.toUpperCase())
        ? sortOrder.toUpperCase()
        : "ASC";

      const { conditions: filterConditions, params: filterParams } =
        buildClienteFiltersWhere(filters);
      const filtersAndClause = filterConditions.length
        ? ` AND ${filterConditions.join(" AND ")}`
        : "";

      const searchQuery = `
        SELECT * FROM clientes
        WHERE (CONCAT(ClienteNombre, ' ', ClienteApellido) LIKE ?
          OR ClienteRUC LIKE ?
          OR ClienteId LIKE ?)${filtersAndClause}
        ORDER BY ${sortField} ${order}
        LIMIT ? OFFSET ?
      `;
      const searchValue = `%${term}%`;
      const searchParams = [searchValue, searchValue, searchValue];

      db.query(
        searchQuery,
        [...searchParams, ...filterParams, limit, offset],
        (err, results) => {
          if (err) return reject(err);

          const countQuery = `
            SELECT COUNT(*) as total FROM clientes
            WHERE (CONCAT(ClienteNombre, ' ', ClienteApellido) LIKE ?
              OR ClienteRUC LIKE ?
              OR ClienteId LIKE ?)${filtersAndClause}
          `;

          db.query(
            countQuery,
            [...searchParams, ...filterParams],
            (err, countResult) => {
              if (err) return reject(err);

              resolve({
                clientes: results,
                total: countResult[0]?.total || 0,
              });
            }
          );
        }
      );
    });
  },

  create: (clienteData) => {
    return new Promise((resolve, reject) => {
      const query = `
        INSERT INTO clientes (
          ClienteRUC,
          ClienteNombre,
          ClienteApellido,
          ClienteDireccion,
          ClienteTelefono,
          ClienteTipo,
          UsuarioId,
          EmpresaId,
          VendedorId
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      const values = [
        clienteData.ClienteRUC || "",
        clienteData.ClienteNombre,
        clienteData.ClienteApellido || "",
        clienteData.ClienteDireccion || "",
        clienteData.ClienteTelefono || "",
        clienteData.ClienteTipo || "",
        clienteData.UsuarioId ? String(clienteData.UsuarioId).trim() : "",
        clienteData.EmpresaId || 1,
        clienteData.VendedorId || null,
      ];
      db.query(query, values, (err, result) => {
        if (err) return reject(err);
        resolve({ ...clienteData, ClienteId: result.insertId });
      });
    });
  },

  update: (id, clienteData, empresaId) => {
    return new Promise((resolve, reject) => {
      let updateFields = [];
      let values = [];
      const camposActualizables = [
        "ClienteRUC",
        "ClienteNombre",
        "ClienteApellido",
        "ClienteDireccion",
        "ClienteTelefono",
        "ClienteTipo",
        "UsuarioId",
        "EmpresaId",
        "VendedorId",
      ];
      camposActualizables.forEach((campo) => {
        if (clienteData[campo] !== undefined) {
          updateFields.push(`${campo} = ?`);
          // Aplicar trim solo al UsuarioId si es string
          if (campo === "UsuarioId" && typeof clienteData[campo] === "string") {
            values.push(clienteData[campo].trim());
          } else {
            values.push(clienteData[campo]);
          }
        }
      });
      if (updateFields.length === 0) {
        return resolve(null);
      }
      values.push(id, empresaId);
      const query = `
        UPDATE clientes
        SET ${updateFields.join(", ")}
        WHERE ClienteId = ? AND EmpresaId = ?
      `;
      db.query(query, values, async (err, result) => {
        if (err) return reject(err);
        if (result.affectedRows === 0) {
          return resolve(null);
        }
        db.query(
          "SELECT * FROM clientes WHERE ClienteId = ?",
          [id],
          (err, results) => {
            if (err) return reject(err);
            resolve(results.length > 0 ? results[0] : null);
          }
        );
      });
    });
  },

  delete: (id, empresaId) => {
    return new Promise((resolve, reject) => {
      db.query(
        "DELETE FROM clientes WHERE ClienteId = ? AND EmpresaId = ?",
        [id, empresaId],
        (err, result) => {
          if (err) return reject(err);
          resolve(result.affectedRows > 0);
        }
      );
    });
  },
};

module.exports = Cliente;
