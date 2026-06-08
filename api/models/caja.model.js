const db = require("../config/db");

const Caja = {
  getAll: (empresaId) => {
    return new Promise((resolve, reject) => {
      db.query(
        "SELECT * FROM Caja WHERE EmpresaId = ?",
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
        "SELECT * FROM Caja WHERE CajaId = ? AND EmpresaId = ?",
        [id, empresaId],
        (err, results) => {
          if (err) return reject(err);
          resolve(results.length > 0 ? results[0] : null);
        }
      );
    });
  },

  create: (cajaData) => {
    return new Promise((resolve, reject) => {
      const empresaId = cajaData.EmpresaId || 1;
      const query = `INSERT INTO Caja (CajaDescripcion, CajaMonto, EmpresaId) VALUES (?, ?, ?)`;
      const values = [cajaData.CajaDescripcion, cajaData.CajaMonto, empresaId];
      db.query(query, values, (err, result) => {
        if (err) return reject(err);
        // Obtener la caja recién creada
        Caja.getById(result.insertId, empresaId)
          .then((caja) => resolve(caja))
          .catch((error) => reject(error));
      });
    });
  },

  update: (id, cajaData, empresaId) => {
    return new Promise((resolve, reject) => {
      const query = `UPDATE Caja SET CajaDescripcion = ?, CajaMonto = ? WHERE CajaId = ? AND EmpresaId = ?`;
      const values = [cajaData.CajaDescripcion, cajaData.CajaMonto, id, empresaId];
      db.query(query, values, (err, result) => {
        if (err) return reject(err);
        if (result.affectedRows === 0) return resolve(null);
        Caja.getById(id, empresaId)
          .then((caja) => resolve(caja))
          .catch((error) => reject(error));
      });
    });
  },

  delete: (id, empresaId) => {
    return new Promise((resolve, reject) => {
      db.query(
        "DELETE FROM Caja WHERE CajaId = ? AND EmpresaId = ?",
        [id, empresaId],
        (err, result) => {
          if (err) return reject(err);
          resolve(result.affectedRows > 0);
        }
      );
    });
  },

  getAllPaginated: (
    limit,
    offset,
    sortBy = "CajaId",
    sortOrder = "ASC",
    empresaId
  ) => {
    return new Promise((resolve, reject) => {
      const allowedSortFields = ["CajaId", "CajaDescripcion", "CajaMonto"];
      const allowedSortOrders = ["ASC", "DESC"];
      const sortField = allowedSortFields.includes(sortBy) ? sortBy : "CajaId";
      const order = allowedSortOrders.includes(sortOrder.toUpperCase())
        ? sortOrder.toUpperCase()
        : "ASC";

      db.query(
        `SELECT * FROM Caja WHERE EmpresaId = ? ORDER BY ${sortField} ${order} LIMIT ? OFFSET ?`,
        [empresaId, limit, offset],
        (err, results) => {
          if (err) return reject(err);

          db.query(
            "SELECT COUNT(*) as total FROM Caja WHERE EmpresaId = ?",
            [empresaId],
            (err, countResult) => {
              if (err) return reject(err);

              resolve({
                cajas: results,
                total: countResult[0].total,
              });
            }
          );
        }
      );
    });
  },

  searchCajas: (
    term,
    limit,
    offset,
    sortBy = "CajaId",
    sortOrder = "ASC",
    empresaId
  ) => {
    return new Promise((resolve, reject) => {
      const allowedSortFields = ["CajaId", "CajaDescripcion", "CajaMonto"];
      const allowedSortOrders = ["ASC", "DESC"];
      const sortField = allowedSortFields.includes(sortBy) ? sortBy : "CajaId";
      const order = allowedSortOrders.includes(sortOrder.toUpperCase())
        ? sortOrder.toUpperCase()
        : "ASC";

      const searchQuery = `
        SELECT * FROM Caja
        WHERE EmpresaId = ?
          AND (CajaDescripcion LIKE ?
            OR CAST(CajaMonto AS CHAR) LIKE ?)
        ORDER BY ${sortField} ${order}
        LIMIT ? OFFSET ?
      `;
      const searchValue = `%${term}%`;

      db.query(
        searchQuery,
        [empresaId, searchValue, searchValue, limit, offset],
        (err, results) => {
          if (err) return reject(err);

          const countQuery = `
            SELECT COUNT(*) as total FROM Caja
            WHERE EmpresaId = ?
              AND (CajaDescripcion LIKE ?
                OR CAST(CajaMonto AS CHAR) LIKE ?)
          `;
          db.query(
            countQuery,
            [empresaId, searchValue, searchValue],
            (err, countResult) => {
              if (err) return reject(err);
              resolve({
                cajas: results,
                total: countResult[0]?.total || 0,
              });
            }
          );
        }
      );
    });
  },
};

module.exports = Caja;
