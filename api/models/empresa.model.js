const db = require("../config/db");

const Empresa = {
  // Todas las empresas activas
  getAll: () => {
    return new Promise((resolve, reject) => {
      db.query(
        `SELECT EmpresaId, EmpresaNombre, EmpresaRUC, EmpresaTipo, EmpresaEstado
           FROM empresa
          WHERE EmpresaEstado = 'A'
          ORDER BY EmpresaId ASC`,
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
        "SELECT * FROM empresa WHERE EmpresaId = ?",
        [id],
        (err, results) => {
          if (err) return reject(err);
          resolve(results.length > 0 ? results[0] : null);
        }
      );
    });
  },

  create: (data) => {
    return new Promise((resolve, reject) => {
      db.query(
        `INSERT INTO empresa (EmpresaNombre, EmpresaRUC, EmpresaTipo, EmpresaEstado)
         VALUES (?, ?, ?, ?)`,
        [
          data.EmpresaNombre,
          data.EmpresaRUC || "",
          data.EmpresaTipo || "M",
          data.EmpresaEstado || "A",
        ],
        (err, result) => {
          if (err) return reject(err);
          Empresa.getById(result.insertId).then(resolve).catch(reject);
        }
      );
    });
  },

  update: (id, data) => {
    return new Promise((resolve, reject) => {
      const campos = ["EmpresaNombre", "EmpresaRUC", "EmpresaTipo", "EmpresaEstado"];
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
        `UPDATE empresa SET ${sets.join(", ")} WHERE EmpresaId = ?`,
        values,
        (err, result) => {
          if (err) return reject(err);
          if (result.affectedRows === 0) return resolve(null);
          Empresa.getById(id).then(resolve).catch(reject);
        }
      );
    });
  },

  delete: (id) => {
    return new Promise((resolve, reject) => {
      db.query("DELETE FROM empresa WHERE EmpresaId = ?", [id], (err, result) => {
        if (err) return reject(err);
        resolve(result.affectedRows > 0);
      });
    });
  },
};

module.exports = Empresa;
