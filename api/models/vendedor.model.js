const db = require("../config/db");

const Vendedor = {
  getAll: (empresaId) => {
    return new Promise((resolve, reject) => {
      db.query(
        `SELECT v.*, u.UsuarioNombre, u.UsuarioApellido AS UsuarioApellidoLogin
           FROM vendedor v
           LEFT JOIN usuario u ON v.UsuarioId = TRIM(u.UsuarioId)
          WHERE v.EmpresaId = ?
          ORDER BY v.VendedorNombre ASC`,
        [empresaId],
        (err, results) => {
          if (err) return reject(err);
          resolve(results || []);
        }
      );
    });
  },

  getById: (id) => {
    return new Promise((resolve, reject) => {
      db.query(
        `SELECT v.*, u.UsuarioNombre, u.UsuarioApellido AS UsuarioApellidoLogin
           FROM vendedor v
           LEFT JOIN usuario u ON v.UsuarioId = TRIM(u.UsuarioId)
          WHERE v.VendedorId = ?
          LIMIT 1`,
        [id],
        (err, results) => {
          if (err) return reject(err);
          resolve(results.length > 0 ? results[0] : null);
        }
      );
    });
  },

  // Clientes asignados a un vendedor
  getClientes: (vendedorId) => {
    return new Promise((resolve, reject) => {
      db.query(
        `SELECT ClienteId, ClienteNombre, ClienteApellido, ClienteRUC,
                ClienteTelefono, ClienteTipo, EmpresaId
           FROM clientes
          WHERE VendedorId = ?
          ORDER BY ClienteNombre ASC`,
        [vendedorId],
        (err, results) => {
          if (err) return reject(err);
          resolve(results || []);
        }
      );
    });
  },

  create: (data) => {
    return new Promise((resolve, reject) => {
      db.query(
        `INSERT INTO vendedor
           (VendedorNombre, VendedorApellido, VendedorTelefono, VendedorDireccion,
            UsuarioId, EmpresaId, VendedorEstado)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          data.VendedorNombre,
          data.VendedorApellido || "",
          data.VendedorTelefono || "",
          data.VendedorDireccion || "",
          data.UsuarioId || null,
          data.EmpresaId,
          data.VendedorEstado || "A",
        ],
        (err, result) => {
          if (err) return reject(err);
          resolve({ ...data, VendedorId: result.insertId });
        }
      );
    });
  },

  update: (id, data) => {
    return new Promise((resolve, reject) => {
      const campos = [
        "VendedorNombre",
        "VendedorApellido",
        "VendedorTelefono",
        "VendedorDireccion",
        "UsuarioId",
        "VendedorEstado",
      ];
      const sets = [];
      const values = [];
      campos.forEach((c) => {
        if (data[c] !== undefined) {
          sets.push(`${c} = ?`);
          values.push(data[c]);
        }
      });
      if (sets.length === 0) return resolve(null);
      values.push(id);
      db.query(
        `UPDATE vendedor SET ${sets.join(", ")} WHERE VendedorId = ?`,
        values,
        (err, result) => {
          if (err) return reject(err);
          if (result.affectedRows === 0) return resolve(null);
          db.query(
            "SELECT * FROM vendedor WHERE VendedorId = ?",
            [id],
            (err, rows) => {
              if (err) return reject(err);
              resolve(rows.length > 0 ? rows[0] : null);
            }
          );
        }
      );
    });
  },

  // Asignar/desasignar vendedor a un cliente
  asignarCliente: (clienteId, vendedorId) => {
    return new Promise((resolve, reject) => {
      db.query(
        "UPDATE clientes SET VendedorId = ? WHERE ClienteId = ?",
        [vendedorId, clienteId],
        (err, result) => {
          if (err) return reject(err);
          resolve(result.affectedRows > 0);
        }
      );
    });
  },

  delete: (id) => {
    return new Promise((resolve, reject) => {
      db.query(
        "DELETE FROM vendedor WHERE VendedorId = ?",
        [id],
        (err, result) => {
          if (err) return reject(err);
          resolve(result.affectedRows > 0);
        }
      );
    });
  },
};

module.exports = Vendedor;
