const db = require("../config/db");

const Local = {
  getAll: (empresaId) => {
    return new Promise((resolve, reject) => {
      db.query(
        "SELECT * FROM local WHERE EmpresaId = ?",
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
        "SELECT * FROM local WHERE LocalId = ? AND EmpresaId = ?",
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
    sortBy = "LocalId",
    sortOrder = "ASC",
    empresaId
  ) => {
    return new Promise((resolve, reject) => {
      const allowedSortFields = [
        "LocalId",
        "LocalNombre",
        "LocalTelefono",
        "LocalCelular",
        "LocalDireccion",
      ];
      const allowedSortOrders = ["ASC", "DESC"];
      const sortField = allowedSortFields.includes(sortBy) ? sortBy : "LocalId";
      const order = allowedSortOrders.includes(sortOrder.toUpperCase())
        ? sortOrder.toUpperCase()
        : "ASC";

      db.query(
        `SELECT l.*, e.EmpresaNombre
           FROM local l
           LEFT JOIN empresa e ON l.EmpresaId = e.EmpresaId
          WHERE l.EmpresaId = ?
          ORDER BY l.${sortField} ${order} LIMIT ? OFFSET ?`,
        [empresaId, limit, offset],
        (err, results) => {
          if (err) return reject(err);

          db.query(
            "SELECT COUNT(*) as total FROM local WHERE EmpresaId = ?",
            [empresaId],
            (err, countResult) => {
              if (err) return reject(err);

              resolve({
                locales: results,
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
    sortBy = "LocalId",
    sortOrder = "ASC",
    empresaId
  ) => {
    return new Promise((resolve, reject) => {
      const allowedSortFields = [
        "LocalId",
        "LocalNombre",
        "LocalTelefono",
        "LocalCelular",
        "LocalDireccion",
      ];
      const allowedSortOrders = ["ASC", "DESC"];
      const sortField = allowedSortFields.includes(sortBy) ? sortBy : "LocalId";
      const order = allowedSortOrders.includes(sortOrder.toUpperCase())
        ? sortOrder.toUpperCase()
        : "ASC";

      const searchQuery = `
      SELECT * FROM local
      WHERE EmpresaId = ?
        AND (LocalNombre LIKE ?
        OR LocalTelefono LIKE ?
        OR LocalCelular LIKE ?
        OR LocalDireccion LIKE ?
        OR LocalId LIKE ?)
      ORDER BY ${sortField} ${order}
      LIMIT ? OFFSET ?
    `;
      const searchValue = `%${term}%`;

      db.query(
        searchQuery,
        [
          empresaId,
          searchValue,
          searchValue,
          searchValue,
          searchValue,
          searchValue,
          limit,
          offset,
        ],
        (err, results) => {
          if (err) return reject(err);

          const countQuery = `
          SELECT COUNT(*) as total FROM local
          WHERE EmpresaId = ?
            AND (LocalNombre LIKE ?
            OR LocalTelefono LIKE ?
            OR LocalCelular LIKE ?
            OR LocalDireccion LIKE ?
            OR LocalId LIKE ?)
        `;

          db.query(
            countQuery,
            [
              empresaId,
              searchValue,
              searchValue,
              searchValue,
              searchValue,
              searchValue,
            ],
            (err, countResult) => {
              if (err) return reject(err);

              resolve({
                locales: results,
                total: countResult[0]?.total || 0,
              });
            }
          );
        }
      );
    });
  },

  create: (localData) => {
    return new Promise((resolve, reject) => {
      const query = `
      INSERT INTO local (
        LocalNombre,
        LocalTelefono,
        LocalCelular,
        LocalDireccion,
        EmpresaId
      ) VALUES (?, ?, ?, ?, ?)
    `;
      // Columnas NOT NULL con default ''. Postgres rechaza NULL explícito
      // (a diferencia de MySQL), así que coalesce a cadena vacía.
      const values = [
        localData.LocalNombre,
        localData.LocalTelefono || "",
        localData.LocalCelular || "",
        localData.LocalDireccion || "",
        localData.EmpresaId || 1,
      ];
      db.query(query, values, (err, result) => {
        if (err) return reject(err);
        resolve({
          LocalId: result.insertId,
          ...localData,
        });
      });
    });
  },

  update: (id, localData, empresaId) => {
    return new Promise((resolve, reject) => {
      let updateFields = [];
      let values = [];
      const camposActualizables = [
        "LocalNombre",
        "LocalTelefono",
        "LocalCelular",
        "LocalDireccion",
        "EmpresaId",
      ];
      camposActualizables.forEach((campo) => {
        if (localData[campo] !== undefined) {
          updateFields.push(`${campo} = ?`);
          values.push(localData[campo]);
        }
      });
      if (updateFields.length === 0) {
        return resolve(null);
      }
      values.push(id, empresaId);
      const query = `
        UPDATE local
        SET ${updateFields.join(", ")}
        WHERE LocalId = ? AND EmpresaId = ?
      `;
      db.query(query, values, (err, result) => {
        if (err) return reject(err);
        if (result.affectedRows === 0) {
          return resolve(null);
        }
        // Re-leer por id (el admin pudo reasignar EmpresaId vía el selector,
        // así que no filtramos por empresa en la re-lectura).
        db.query(
          "SELECT * FROM local WHERE LocalId = ?",
          [id],
          (err2, rows) => {
            if (err2) return reject(err2);
            resolve(rows.length > 0 ? rows[0] : null);
          }
        );
      });
    });
  },

  delete: (id, empresaId) => {
    return new Promise((resolve, reject) => {
      db.query(
        "DELETE FROM local WHERE LocalId = ? AND EmpresaId = ?",
        [id, empresaId],
        (err, result) => {
          if (err) return reject(err);
          resolve(result.affectedRows > 0);
        }
      );
    });
  },
};

module.exports = Local;
