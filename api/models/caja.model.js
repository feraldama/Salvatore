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
      // La caja pertenece a la sucursal activa. Si no se resuelve local (admin
      // sin sucursal elegida), queda NULL = caja a nivel empresa.
      const localId = cajaData.LocalId != null ? cajaData.LocalId : null;
      const query = `INSERT INTO Caja (CajaDescripcion, CajaMonto, EmpresaId, LocalId) VALUES (?, ?, ?, ?)`;
      const values = [cajaData.CajaDescripcion, cajaData.CajaMonto, empresaId, localId];
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
      // COALESCE: solo cambia LocalId si el update lo trae; si viene null/undefined
      // se preserva la sucursal actual de la caja.
      const query = `UPDATE Caja SET CajaDescripcion = ?, CajaMonto = ?, LocalId = COALESCE(?, LocalId) WHERE CajaId = ? AND EmpresaId = ?`;
      const values = [
        cajaData.CajaDescripcion,
        cajaData.CajaMonto,
        cajaData.LocalId ?? null,
        id,
        empresaId,
      ];
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
    empresaId,
    localId = null
  ) => {
    return new Promise((resolve, reject) => {
      const allowedSortFields = ["CajaId", "CajaDescripcion", "CajaMonto"];
      const allowedSortOrders = ["ASC", "DESC"];
      const sortField = allowedSortFields.includes(sortBy) ? sortBy : "CajaId";
      const order = allowedSortOrders.includes(sortOrder.toUpperCase())
        ? sortOrder.toUpperCase()
        : "ASC";

      // Scope por sucursal: si hay local activo, solo sus cajas. null = todas
      // las cajas de la empresa (admin con vista agregada).
      const localSql = localId != null ? " AND LocalId = ?" : "";
      const localParam = localId != null ? [localId] : [];

      db.query(
        `SELECT * FROM Caja WHERE EmpresaId = ?${localSql} ORDER BY ${sortField} ${order} LIMIT ? OFFSET ?`,
        [empresaId, ...localParam, limit, offset],
        (err, results) => {
          if (err) return reject(err);

          db.query(
            `SELECT COUNT(*) as total FROM Caja WHERE EmpresaId = ?${localSql}`,
            [empresaId, ...localParam],
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
    empresaId,
    localId = null
  ) => {
    return new Promise((resolve, reject) => {
      const allowedSortFields = ["CajaId", "CajaDescripcion", "CajaMonto"];
      const allowedSortOrders = ["ASC", "DESC"];
      const sortField = allowedSortFields.includes(sortBy) ? sortBy : "CajaId";
      const order = allowedSortOrders.includes(sortOrder.toUpperCase())
        ? sortOrder.toUpperCase()
        : "ASC";

      const localSql = localId != null ? " AND LocalId = ?" : "";
      const localParam = localId != null ? [localId] : [];

      const searchQuery = `
        SELECT * FROM Caja
        WHERE EmpresaId = ?${localSql}
          AND (CajaDescripcion LIKE ?
            OR CAST(CajaMonto AS CHAR) LIKE ?)
        ORDER BY ${sortField} ${order}
        LIMIT ? OFFSET ?
      `;
      const searchValue = `%${term}%`;

      db.query(
        searchQuery,
        [empresaId, ...localParam, searchValue, searchValue, limit, offset],
        (err, results) => {
          if (err) return reject(err);

          const countQuery = `
            SELECT COUNT(*) as total FROM Caja
            WHERE EmpresaId = ?${localSql}
              AND (CajaDescripcion LIKE ?
                OR CAST(CajaMonto AS CHAR) LIKE ?)
          `;
          db.query(
            countQuery,
            [empresaId, ...localParam, searchValue, searchValue],
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
