const db = require("../config/db");

const Factura = {
  getAll: (empresaId) => {
    return new Promise((resolve, reject) => {
      db.query(
        "SELECT * FROM factura WHERE EmpresaId = ? ORDER BY FacturaId DESC",
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
        "SELECT * FROM factura WHERE FacturaId = ? AND EmpresaId = ?",
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
    sortBy = "FacturaId",
    sortOrder = "DESC",
    empresaId
  ) => {
    return new Promise((resolve, reject) => {
      const allowedSortFields = [
        "FacturaId",
        "FacturaTimbrado",
        "FacturaDesde",
        "FacturaHasta",
      ];
      const allowedSortOrders = ["ASC", "DESC"];
      const sortField = allowedSortFields.includes(sortBy)
        ? sortBy
        : "FacturaId";
      const order = allowedSortOrders.includes(sortOrder.toUpperCase())
        ? sortOrder.toUpperCase()
        : "DESC";

      db.query(
        `SELECT * FROM factura WHERE EmpresaId = ? ORDER BY ${sortField} ${order} LIMIT ? OFFSET ?`,
        [empresaId, limit, offset],
        (err, results) => {
          if (err) return reject(err);

          db.query(
            "SELECT COUNT(*) as total FROM factura WHERE EmpresaId = ?",
            [empresaId],
            (err, countResult) => {
              if (err) return reject(err);

              resolve({
                facturas: results,
                total: countResult[0].total,
              });
            }
          );
        }
      );
    });
  },

  search: (
    term,
    limit,
    offset,
    sortBy = "FacturaId",
    sortOrder = "DESC",
    empresaId
  ) => {
    return new Promise((resolve, reject) => {
      const allowedSortFields = [
        "FacturaId",
        "FacturaTimbrado",
        "FacturaDesde",
        "FacturaHasta",
      ];
      const allowedSortOrders = ["ASC", "DESC"];
      const sortField = allowedSortFields.includes(sortBy)
        ? sortBy
        : "FacturaId";
      const order = allowedSortOrders.includes(sortOrder.toUpperCase())
        ? sortOrder.toUpperCase()
        : "DESC";

      const searchQuery = `
        SELECT * FROM factura
        WHERE EmpresaId = ?
          AND (FacturaId LIKE ?
          OR FacturaTimbrado LIKE ?
          OR FacturaDesde LIKE ?
          OR FacturaHasta LIKE ?)
        ORDER BY ${sortField} ${order}
        LIMIT ? OFFSET ?
      `;
      const searchTerm = `%${term}%`;

      db.query(
        searchQuery,
        [empresaId, searchTerm, searchTerm, searchTerm, searchTerm, limit, offset],
        (err, results) => {
          if (err) return reject(err);

          const countQuery = `
            SELECT COUNT(*) as total FROM factura
            WHERE EmpresaId = ?
              AND (FacturaId LIKE ?
              OR FacturaTimbrado LIKE ?
              OR FacturaDesde LIKE ?
              OR FacturaHasta LIKE ?)
          `;

          db.query(
            countQuery,
            [empresaId, searchTerm, searchTerm, searchTerm, searchTerm],
            (err, countResult) => {
              if (err) return reject(err);

              resolve({
                facturas: results,
                total: countResult[0].total,
              });
            }
          );
        }
      );
    });
  },

  create: (facturaData) => {
    return new Promise((resolve, reject) => {
      const { FacturaTimbrado, FacturaDesde, FacturaHasta } = facturaData;
      const empresaId = facturaData.EmpresaId || 1;

      // Validaciones
      if (!FacturaTimbrado || FacturaTimbrado.toString().length > 8) {
        return reject(
          new Error("FacturaTimbrado no puede tener más de 8 dígitos")
        );
      }

      if (!FacturaDesde || FacturaDesde.toString().length > 7) {
        return reject(
          new Error("FacturaDesde no puede tener más de 7 dígitos")
        );
      }

      if (!FacturaHasta || FacturaHasta.toString().length > 7) {
        return reject(
          new Error("FacturaHasta no puede tener más de 7 dígitos")
        );
      }

      if (parseInt(FacturaDesde) >= parseInt(FacturaHasta)) {
        return reject(
          new Error("FacturaDesde debe ser menor que FacturaHasta")
        );
      }

      // Unicidad de timbrado y superposición de rangos se evalúan DENTRO de la
      // empresa: dos empresas (RUCs distintos) pueden tener timbrados/rangos
      // independientes que para el fisco no colisionan.
      db.query(
        "SELECT COUNT(*) as count FROM factura WHERE FacturaTimbrado = ? AND EmpresaId = ?",
        [FacturaTimbrado, empresaId],
        (err, results) => {
          if (err) return reject(err);
          if (results[0].count > 0) {
            return reject(new Error("Ya existe una factura con este timbrado"));
          }

          // Verificar si hay superposición de rangos (dentro de la empresa)
          db.query(
            `SELECT COUNT(*) as count FROM factura
             WHERE EmpresaId = ?
             AND ((FacturaDesde <= ? AND FacturaHasta >= ?)
             OR (FacturaDesde <= ? AND FacturaHasta >= ?)
             OR (FacturaDesde >= ? AND FacturaHasta <= ?))`,
            [
              empresaId,
              FacturaDesde,
              FacturaDesde,
              FacturaHasta,
              FacturaHasta,
              FacturaDesde,
              FacturaHasta,
            ],
            (err, results) => {
              if (err) return reject(err);
              if (results[0].count > 0) {
                return reject(
                  new Error("Existe superposición con el rango de facturas")
                );
              }

              // Insertar la nueva factura
              db.query(
                "INSERT INTO factura (FacturaTimbrado, FacturaDesde, FacturaHasta, EmpresaId) VALUES (?, ?, ?, ?)",
                [FacturaTimbrado, FacturaDesde, FacturaHasta, empresaId],
                (err, result) => {
                  if (err) return reject(err);
                  resolve(result.insertId);
                }
              );
            }
          );
        }
      );
    });
  },

  update: (id, facturaData, empresaId) => {
    return new Promise((resolve, reject) => {
      const { FacturaTimbrado, FacturaDesde, FacturaHasta } = facturaData;

      // Validaciones
      if (!FacturaTimbrado || FacturaTimbrado.toString().length > 8) {
        return reject(
          new Error("FacturaTimbrado no puede tener más de 8 dígitos")
        );
      }

      if (!FacturaDesde || FacturaDesde.toString().length > 7) {
        return reject(
          new Error("FacturaDesde no puede tener más de 7 dígitos")
        );
      }

      if (!FacturaHasta || FacturaHasta.toString().length > 7) {
        return reject(
          new Error("FacturaHasta no puede tener más de 7 dígitos")
        );
      }

      if (parseInt(FacturaDesde) >= parseInt(FacturaHasta)) {
        return reject(
          new Error("FacturaDesde debe ser menor que FacturaHasta")
        );
      }

      // Unicidad/superposición dentro de la empresa, excluyendo la fila actual.
      db.query(
        "SELECT COUNT(*) as count FROM factura WHERE FacturaTimbrado = ? AND EmpresaId = ? AND FacturaId != ?",
        [FacturaTimbrado, empresaId, id],
        (err, results) => {
          if (err) return reject(err);
          if (results[0].count > 0) {
            return reject(new Error("Ya existe una factura con este timbrado"));
          }

          // Verificar si hay superposición de rangos (excluyendo la actual)
          db.query(
            `SELECT COUNT(*) as count FROM factura
             WHERE EmpresaId = ? AND FacturaId != ?
             AND ((FacturaDesde <= ? AND FacturaHasta >= ?)
             OR (FacturaDesde <= ? AND FacturaHasta >= ?)
             OR (FacturaDesde >= ? AND FacturaHasta <= ?))`,
            [
              empresaId,
              id,
              FacturaDesde,
              FacturaDesde,
              FacturaHasta,
              FacturaHasta,
              FacturaDesde,
              FacturaHasta,
            ],
            (err, results) => {
              if (err) return reject(err);
              if (results[0].count > 0) {
                return reject(
                  new Error("Existe superposición con el rango de facturas")
                );
              }

              // Actualizar la factura (scopeada por empresa)
              db.query(
                "UPDATE factura SET FacturaTimbrado = ?, FacturaDesde = ?, FacturaHasta = ? WHERE FacturaId = ? AND EmpresaId = ?",
                [FacturaTimbrado, FacturaDesde, FacturaHasta, id, empresaId],
                (err, result) => {
                  if (err) return reject(err);
                  if (result.affectedRows === 0) {
                    return reject(new Error("Factura no encontrada"));
                  }
                  resolve(result);
                }
              );
            }
          );
        }
      );
    });
  },

  delete: (id, empresaId) => {
    return new Promise((resolve, reject) => {
      db.query(
        "DELETE FROM factura WHERE FacturaId = ? AND EmpresaId = ?",
        [id, empresaId],
        (err, result) => {
          if (err) return reject(err);
          if (result.affectedRows === 0) {
            return reject(new Error("Factura no encontrada"));
          }
          resolve(result);
        }
      );
    });
  },

  getNextAvailableNumber: (empresaId) => {
    return new Promise((resolve, reject) => {
      db.query(
        "SELECT FacturaHasta FROM factura WHERE EmpresaId = ? ORDER BY FacturaHasta DESC LIMIT 1",
        [empresaId],
        (err, results) => {
          if (err) return reject(err);
          if (results.length === 0) {
            // Si no hay facturas, empezar desde 1
            resolve(1);
          } else {
            // Tomar el último número usado y sumar 1
            const lastNumber = parseInt(results[0].FacturaHasta);
            resolve(lastNumber + 1);
          }
        }
      );
    });
  },

  getCurrentFactura: (numeroFactura, empresaId) => {
    return new Promise((resolve, reject) => {
      db.query(
        "SELECT * FROM factura WHERE FacturaDesde <= ? AND FacturaHasta >= ? AND EmpresaId = ?",
        [numeroFactura, numeroFactura, empresaId],
        (err, results) => {
          if (err) return reject(err);
          resolve(results.length > 0 ? results[0] : null);
        }
      );
    });
  },
};

module.exports = Factura;
