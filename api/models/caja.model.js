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
      // UsuarioId: dueño de la caja (migración 029). Con dueño, el cajero no
      // elige caja al aperturar: es la suya.
      const usuarioId = cajaData.UsuarioId || null;
      const query = `INSERT INTO Caja (CajaDescripcion, CajaMonto, EmpresaId, LocalId, UsuarioId) VALUES (?, ?, ?, ?, ?)`;
      const values = [cajaData.CajaDescripcion, cajaData.CajaMonto, empresaId, localId, usuarioId];
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
      // UsuarioId (dueño): idem, pero cadena vacía significa "sacarle el dueño",
      // que es distinto de "no lo toques" — por eso no alcanza con COALESCE.
      const tocaDueno = cajaData.UsuarioId !== undefined;
      const dueno = cajaData.UsuarioId ? cajaData.UsuarioId : null;
      const query = `UPDATE Caja SET CajaDescripcion = ?, CajaMonto = ?, LocalId = COALESCE(?, LocalId)${
        tocaDueno ? ", UsuarioId = ?" : ""
      } WHERE CajaId = ? AND EmpresaId = ?`;
      const values = [
        cajaData.CajaDescripcion,
        cajaData.CajaMonto,
        cajaData.LocalId ?? null,
        ...(tocaDueno ? [dueno] : []),
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

  // "Mi caja" DONDE ESTOY PARADO (migración 031). Un cajero puede tener una
  // caja por sucursal: la de su bodega habitual y la de la bodega donde cubre.
  // El localId sale de la terminal, así que el cajero nunca elige.
  //
  // localId null (no hay terminal registrada todavía, o es una consulta suelta):
  // se devuelve su caja solo si tiene UNA sola en todo el sistema. Con varias no
  // se adivina — devolver cualquiera sería justamente elegir por él y errarle.
  getByUsuario: (usuarioId, localId = null) => {
    return new Promise((resolve, reject) => {
      const id = String(usuarioId || "").trim();
      const porLocal = localId != null;
      db.query(
        `SELECT c.*, l.LocalNombre
           FROM Caja c
           LEFT JOIN local l ON l.LocalId = c.LocalId
          WHERE TRIM(c.UsuarioId) = ?${porLocal ? " AND c.LocalId = ?" : ""}`,
        porLocal ? [id, Number(localId)] : [id],
        (err, results) => {
          if (err) return reject(err);
          const filas = results || [];
          if (porLocal) return resolve(filas.length > 0 ? filas[0] : null);
          resolve(filas.length === 1 ? filas[0] : null);
        }
      );
    });
  },

  // Todas las cajas de un cajero (una por sucursal como mucho). La usan las
  // validaciones y la pantalla de cajas para mostrar dónde puede trabajar.
  getAllByUsuario: (usuarioId) => {
    return new Promise((resolve, reject) => {
      db.query(
        `SELECT c.*, l.LocalNombre
           FROM Caja c
           LEFT JOIN local l ON l.LocalId = c.LocalId
          WHERE TRIM(c.UsuarioId) = ?
          ORDER BY l.LocalNombre`,
        [String(usuarioId || "").trim()],
        (err, results) => {
          if (err) return reject(err);
          resolve(results || []);
        }
      );
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

      // Se trae el nombre del dueño para que la pantalla de cajas muestre de
      // quién es cada una sin tener que cruzarlo a mano.
      db.query(
        `SELECT c.*, TRIM(u.UsuarioNombre) AS DuenoNombre
           FROM Caja c
           LEFT JOIN usuario u ON TRIM(u.UsuarioId) = TRIM(c.UsuarioId)
          WHERE c.EmpresaId = ?${localSql.replace(" AND LocalId", " AND c.LocalId")}
          ORDER BY c.${sortField} ${order} LIMIT ? OFFSET ?`,
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
