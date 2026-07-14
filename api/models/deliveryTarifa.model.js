const db = require("../config/db");

// Tarifas de delivery (minorista), configurables por empresa. Tabla snake_case
// (migración 022), fuera de columnMap: los resultados vuelven con las claves en
// minúscula tal cual (id, empresa_id, nombre, monto, activo, orden).
const DeliveryTarifa = {
  // Tarifas ACTIVAS de la empresa, ordenadas: la primera (menor orden / menor
  // monto) es la default que la pantalla de venta preselecciona.
  getActivasByEmpresa: (empresaId) => {
    return new Promise((resolve, reject) => {
      db.query(
        `SELECT id, empresa_id, nombre, monto, activo, orden
           FROM delivery_tarifa
          WHERE empresa_id = ? AND activo = 'S'
          ORDER BY orden ASC, monto ASC, id ASC`,
        [empresaId],
        (err, rows) => (err ? reject(err) : resolve(rows))
      );
    });
  },

  // Todas las tarifas (activas e inactivas) para la pantalla de administración.
  getAllByEmpresa: (empresaId) => {
    return new Promise((resolve, reject) => {
      db.query(
        `SELECT id, empresa_id, nombre, monto, activo, orden
           FROM delivery_tarifa
          WHERE empresa_id = ?
          ORDER BY orden ASC, monto ASC, id ASC`,
        [empresaId],
        (err, rows) => (err ? reject(err) : resolve(rows))
      );
    });
  },

  getById: (id) => {
    return new Promise((resolve, reject) => {
      db.query(
        `SELECT id, empresa_id, nombre, monto, activo, orden
           FROM delivery_tarifa WHERE id = ?`,
        [id],
        (err, rows) => (err ? reject(err) : resolve(rows.length ? rows[0] : null))
      );
    });
  },

  create: (data) => {
    return new Promise((resolve, reject) => {
      db.query(
        `INSERT INTO delivery_tarifa (empresa_id, nombre, monto, activo, orden)
         VALUES (?, ?, ?, ?, ?)`,
        [
          data.empresa_id,
          data.nombre,
          data.monto,
          data.activo === "N" ? "N" : "S",
          data.orden ?? 0,
        ],
        (err, result) => {
          if (err) return reject(err);
          DeliveryTarifa.getById(result.insertId).then(resolve).catch(reject);
        }
      );
    });
  },

  // Actualiza solo dentro de la empresa indicada (evita editar tarifas de otra).
  update: (id, data, empresaId) => {
    return new Promise((resolve, reject) => {
      db.query(
        `UPDATE delivery_tarifa
            SET nombre = ?, monto = ?, activo = ?, orden = ?
          WHERE id = ? AND empresa_id = ?`,
        [
          data.nombre,
          data.monto,
          data.activo === "N" ? "N" : "S",
          data.orden ?? 0,
          id,
          empresaId,
        ],
        (err, result) => {
          if (err) return reject(err);
          if (result.affectedRows === 0) return resolve(null);
          DeliveryTarifa.getById(id).then(resolve).catch(reject);
        }
      );
    });
  },

  remove: (id, empresaId) => {
    return new Promise((resolve, reject) => {
      db.query(
        `DELETE FROM delivery_tarifa WHERE id = ? AND empresa_id = ?`,
        [id, empresaId],
        (err, result) => (err ? reject(err) : resolve(result.affectedRows > 0))
      );
    });
  },
};

module.exports = DeliveryTarifa;
