const db = require("../config/db");

const Almacen = {
  getAll: (empresaId) => {
    return new Promise((resolve, reject) => {
      db.query(
        "SELECT * FROM Almacen WHERE EmpresaId = ?",
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
        "SELECT * FROM Almacen WHERE AlmacenId = ? AND EmpresaId = ?",
        [id, empresaId],
        (err, results) => {
          if (err) return reject(err);
          resolve(results.length > 0 ? results[0] : null);
        }
      );
    });
  },

  // Almacén del local indicado (un almacén por local).
  getByLocal: (localId, empresaId) => {
    return new Promise((resolve, reject) => {
      db.query(
        "SELECT * FROM Almacen WHERE LocalId = ? AND EmpresaId = ? LIMIT 1",
        [localId, empresaId],
        (err, results) => {
          if (err) return reject(err);
          resolve(results.length > 0 ? results[0] : null);
        }
      );
    });
  },

  create: (almacenData) => {
    return new Promise((resolve, reject) => {
      const empresaId = almacenData.EmpresaId || 1;
      const query = `INSERT INTO Almacen (AlmacenNombre, LocalId, EmpresaId) VALUES (?, ?, ?)`;
      db.query(
        query,
        [almacenData.AlmacenNombre, almacenData.LocalId || null, empresaId],
        (err, result) => {
          if (err) return reject(err);
          Almacen.getById(result.insertId, empresaId)
            .then((almacen) => resolve(almacen))
            .catch((error) => reject(error));
        }
      );
    });
  },

  update: (id, almacenData, empresaId) => {
    return new Promise((resolve, reject) => {
      const query = `UPDATE Almacen SET AlmacenNombre = ?, LocalId = ? WHERE AlmacenId = ? AND EmpresaId = ?`;
      db.query(
        query,
        [almacenData.AlmacenNombre, almacenData.LocalId ?? null, id, empresaId],
        (err, result) => {
          if (err) return reject(err);
          if (result.affectedRows === 0) return resolve(null);
          Almacen.getById(id, empresaId)
            .then((almacen) => resolve(almacen))
            .catch((error) => reject(error));
        }
      );
    });
  },

  delete: (id, empresaId) => {
    return new Promise((resolve, reject) => {
      db.query(
        "DELETE FROM Almacen WHERE AlmacenId = ? AND EmpresaId = ?",
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
    sortBy = "AlmacenId",
    sortOrder = "ASC",
    empresaId
  ) => {
    return new Promise((resolve, reject) => {
      const allowedSortFields = ["AlmacenId", "AlmacenNombre"];
      const allowedSortOrders = ["ASC", "DESC"];
      const sortField = allowedSortFields.includes(sortBy)
        ? sortBy
        : "AlmacenId";
      const order = allowedSortOrders.includes(sortOrder.toUpperCase())
        ? sortOrder.toUpperCase()
        : "ASC";

      db.query(
        `SELECT a.*, l.LocalNombre
           FROM Almacen a
           LEFT JOIN local l ON a.LocalId = l.LocalId
          WHERE a.EmpresaId = ?
          ORDER BY a.${sortField} ${order} LIMIT ? OFFSET ?`,
        [empresaId, limit, offset],
        (err, results) => {
          if (err) return reject(err);

          db.query(
            "SELECT COUNT(*) as total FROM Almacen WHERE EmpresaId = ?",
            [empresaId],
            (err, countResult) => {
              if (err) return reject(err);

              resolve({
                almacenes: results,
                total: countResult[0].total,
              });
            }
          );
        }
      );
    });
  },

  searchAlmacenes: (
    term,
    limit,
    offset,
    sortBy = "AlmacenId",
    sortOrder = "ASC",
    empresaId
  ) => {
    return new Promise((resolve, reject) => {
      const allowedSortFields = ["AlmacenId", "AlmacenNombre"];
      const allowedSortOrders = ["ASC", "DESC"];
      const sortField = allowedSortFields.includes(sortBy)
        ? sortBy
        : "AlmacenId";
      const order = allowedSortOrders.includes(sortOrder.toUpperCase())
        ? sortOrder.toUpperCase()
        : "ASC";

      const searchQuery = `
        SELECT * FROM Almacen
        WHERE EmpresaId = ? AND AlmacenNombre LIKE ?
        ORDER BY ${sortField} ${order}
        LIMIT ? OFFSET ?
      `;
      const searchValue = `%${term}%`;

      db.query(
        searchQuery,
        [empresaId, searchValue, limit, offset],
        (err, results) => {
          if (err) return reject(err);

          const countQuery = `
            SELECT COUNT(*) as total FROM Almacen
            WHERE EmpresaId = ? AND AlmacenNombre LIKE ?
          `;
          db.query(
            countQuery,
            [empresaId, searchValue],
            (err, countResult) => {
              if (err) return reject(err);
              resolve({
                almacenes: results,
                total: countResult[0]?.total || 0,
              });
            }
          );
        }
      );
    });
  },
};

module.exports = Almacen;
