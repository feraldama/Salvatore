const db = require("../config/db");

// Repartos (migración 036): agrupan ventas de envío que salen juntas en un
// vehículo. La oficina los arma (ARMADO); el ruteador confirma la salida
// (EN_RUTA, congela las cajas por tipo) y la recepción (RECIBIDO, cajas
// contadas). Las columnas viajan en snake_case, igual que flota_* y
// venta_envio: es el contrato que va a consumir la app mobile.
//
// Errores de negocio: se lanzan como objetos planos { status, message } para
// que sendError los devuelva tal cual (ver utils/errors.isSafeMessage).

const ESTADOS = ["ARMADO", "EN_RUTA", "RECIBIDO", "ANULADO"];

function negocio(status, message) {
  return { status, message };
}

const CAB_SELECT = `
  SELECT r.id, r.empresa_id, r.fecha, r.vehiculo_id, fv.chapa AS vehiculo_chapa,
         TRIM(r.chofer_id) AS chofer_id,
         NULLIF(TRIM(COALESCE(u.usuarionombre, '') || ' ' || COALESCE(u.usuarioapellido, '')), '') AS chofer_nombre,
         r.estado, r.observacion, r.viaje_id,
         TRIM(r.creado_por) AS creado_por, r.creado_en,
         r.salida_en, TRIM(r.salida_por) AS salida_por,
         r.recepcion_en, TRIM(r.recepcion_por) AS recepcion_por, r.recepcion_observacion,
         (SELECT COUNT(*) FROM venta_envio e WHERE e.reparto_id = r.id)::int AS cantidad_ventas,
         (SELECT COALESCE(SUM(v.Total), 0) FROM venta_envio e
            JOIN venta v ON v.VentaId = e.venta_id
           WHERE e.reparto_id = r.id)::bigint AS total_ventas
    FROM reparto r
    JOIN flota_vehiculo fv ON fv.id = r.vehiculo_id
    LEFT JOIN usuario u ON u.usuarioid = r.chofer_id`;

// Cajas retornables por tipo según las ventas asignadas (solo líneas por caja
// de productos con tipo de caja). Es el cálculo "en vivo" mientras el reparto
// está ARMADO; al salir se congela en reparto_caja.
const CAJAS_CALCULADAS_SQL = `
  SELECT p.ProductoTipoCaja AS tipo_caja,
         SUM(vp.VentaProductoCantidad)::int AS cajas
    FROM venta_envio e
    JOIN ventaproducto vp ON vp.VentaId = e.venta_id
    JOIN producto p ON p.ProductoId = vp.ProductoId
   WHERE e.reparto_id = ?
     AND vp.VentaProductoUnitario = 'C'
     AND p.ProductoTipoCaja IS NOT NULL
   GROUP BY p.ProductoTipoCaja
   ORDER BY p.ProductoTipoCaja`;

// Usuario por id tolerando el padding de usuarioid (CHAR heredado): devuelve
// el valor exacto almacenado, que es el que exige la FK.
async function resolverUsuarioId(conn, usuarioId) {
  if (usuarioId == null || String(usuarioId).trim() === "") return null;
  const [rows] = await conn.query(
    `SELECT usuarioid AS id FROM usuario WHERE TRIM(usuarioid) = ? LIMIT 1`,
    [String(usuarioId).trim()]
  );
  if (!rows.length) throw negocio(400, "Chofer inexistente");
  return rows[0].id;
}

async function validarVehiculo(conn, vehiculoId) {
  const [rows] = await conn.query(
    `SELECT id FROM flota_vehiculo WHERE id = ? AND activo`,
    [Number(vehiculoId)]
  );
  if (!rows.length) throw negocio(400, "Vehículo inexistente o inactivo");
}

// Bloquea la fila del reparto (FOR UPDATE) dentro de la transacción y valida
// empresa y estado. Toda transición pasa por acá: dos tablets confirmando a la
// vez se serializan y la segunda ve el estado ya cambiado.
async function lockReparto(conn, empresaId, id, estadosPermitidos) {
  const [rows] = await conn.query(
    `SELECT id, estado, vehiculo_id, chofer_id
       FROM reparto WHERE id = ? AND empresa_id = ? FOR UPDATE`,
    [Number(id), Number(empresaId)]
  );
  if (!rows.length) throw negocio(404, "Reparto no encontrado");
  const r = rows[0];
  if (estadosPermitidos && !estadosPermitidos.includes(r.estado)) {
    throw negocio(
      409,
      `El reparto está ${r.estado.replace("_", " ")} y no admite esta operación`
    );
  }
  return r;
}

async function enTransaccion(fn) {
  const conn = await db.promise().getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    try {
      await conn.rollback();
    } catch {
      /* conexión ya rota: el error original es el que importa */
    }
    throw err;
  } finally {
    conn.release();
  }
}

const Reparto = {
  ESTADOS,

  list: async (empresaId, { estado, desde, hasta } = {}) => {
    const cond = ["r.empresa_id = ?"];
    const params = [Number(empresaId)];
    if (estado) {
      const estados = String(estado)
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter((s) => ESTADOS.includes(s));
      if (estados.length) {
        cond.push(`r.estado IN (${estados.map(() => "?").join(", ")})`);
        params.push(...estados);
      }
    }
    if (desde) {
      cond.push("r.fecha >= ?");
      params.push(desde);
    }
    if (hasta) {
      cond.push("r.fecha <= ?");
      params.push(hasta);
    }
    const [rows] = await db
      .promise()
      .query(
        `${CAB_SELECT} WHERE ${cond.join(" AND ")} ORDER BY r.fecha DESC, r.id DESC`,
        params
      );
    return rows;
  },

  // Cabecera + ventas + cajas por tipo + productos (hoja de carga).
  getById: async (empresaId, id) => {
    const pe = db.promise();
    const [cab] = await pe.query(
      `${CAB_SELECT} WHERE r.id = ? AND r.empresa_id = ?`,
      [Number(id), Number(empresaId)]
    );
    if (!cab.length) return null;
    const reparto = cab[0];

    const [ventas] = await pe.query(
      `SELECT v.VentaId AS venta_id, v.VentaFecha AS venta_fecha, v.Total AS venta_total,
              NULLIF(TRIM(COALESCE(c.ClienteNombre, '') || ' ' || COALESCE(c.ClienteApellido, '')), '') AS cliente,
              e.estado AS envio_estado
         FROM venta_envio e
         JOIN venta v ON v.VentaId = e.venta_id
         LEFT JOIN clientes c ON c.ClienteId = v.ClienteId
        WHERE e.reparto_id = ?
        ORDER BY v.VentaId`,
      [reparto.id]
    );

    const [productos] = await pe.query(
      `SELECT p.ProductoId AS producto_id, p.ProductoCodigo AS producto_codigo,
              p.ProductoNombre AS producto_nombre, p.ProductoTipoCaja AS tipo_caja,
              SUM(CASE WHEN vp.VentaProductoUnitario = 'C' THEN vp.VentaProductoCantidad ELSE 0 END)::int AS cajas,
              SUM(CASE WHEN vp.VentaProductoUnitario = 'C' THEN 0 ELSE vp.VentaProductoCantidad END)::int AS unidades
         FROM venta_envio e
         JOIN ventaproducto vp ON vp.VentaId = e.venta_id
         JOIN producto p ON p.ProductoId = vp.ProductoId
        WHERE e.reparto_id = ?
        GROUP BY p.ProductoId, p.ProductoCodigo, p.ProductoNombre, p.ProductoTipoCaja
        ORDER BY p.ProductoNombre`,
      [reparto.id]
    );

    let cajas;
    if (reparto.estado === "ARMADO" || reparto.estado === "ANULADO") {
      const [calc] = await pe.query(CAJAS_CALCULADAS_SQL, [reparto.id]);
      cajas = calc.map((c) => ({
        tipo_caja: c.tipo_caja,
        cajas_salida: c.cajas,
        cajas_recibidas: null,
      }));
    } else {
      const [frozen] = await pe.query(
        `SELECT tipo_caja, cajas_salida, cajas_recibidas
           FROM reparto_caja WHERE reparto_id = ? ORDER BY tipo_caja`,
        [reparto.id]
      );
      cajas = frozen;
    }

    return { ...reparto, ventas, productos, cajas };
  },

  // Ventas de envío que se pueden asignar: PENDIENTE y sin reparto.
  ventasDisponibles: async (empresaId, { desde, hasta, q } = {}) => {
    const cond = [
      "v.EmpresaId = ?",
      "e.estado = 'PENDIENTE'",
      "e.reparto_id IS NULL",
    ];
    const params = [Number(empresaId)];
    if (desde) {
      cond.push("v.VentaFecha >= ?");
      params.push(desde);
    }
    if (hasta) {
      cond.push("v.VentaFecha <= ?");
      params.push(hasta);
    }
    if (q && String(q).trim()) {
      const term = `%${String(q).trim()}%`;
      cond.push(
        `(CAST(v.VentaId AS TEXT) LIKE ? OR c.ClienteNombre LIKE ? OR c.ClienteApellido LIKE ?)`
      );
      params.push(term, term, term);
    }
    const [rows] = await db.promise().query(
      `SELECT v.VentaId AS venta_id, v.VentaFecha AS venta_fecha, v.Total AS venta_total,
              NULLIF(TRIM(COALESCE(c.ClienteNombre, '') || ' ' || COALESCE(c.ClienteApellido, '')), '') AS cliente,
              e.vehiculo_id, fv.chapa AS vehiculo_chapa,
              (SELECT COALESCE(SUM(vp.VentaProductoCantidad), 0)
                 FROM ventaproducto vp
                 JOIN producto p ON p.ProductoId = vp.ProductoId
                WHERE vp.VentaId = v.VentaId
                  AND vp.VentaProductoUnitario = 'C'
                  AND p.ProductoTipoCaja IS NOT NULL)::int AS cajas
         FROM venta_envio e
         JOIN venta v ON v.VentaId = e.venta_id
         JOIN flota_vehiculo fv ON fv.id = e.vehiculo_id
         LEFT JOIN clientes c ON c.ClienteId = v.ClienteId
        WHERE ${cond.join(" AND ")}
        ORDER BY v.VentaFecha DESC, v.VentaId DESC
        LIMIT 500`,
      params
    );
    return rows;
  },

  create: async (empresaId, data, usuarioId) =>
    enTransaccion(async (conn) => {
      // Los repartos son solo de la distribuidora (EmpresaTipo 'D').
      const [emp] = await conn.query(
        `SELECT EmpresaTipo AS tipo FROM empresa WHERE EmpresaId = ?`,
        [Number(empresaId)]
      );
      if (!emp.length || emp[0].tipo !== "D") {
        throw negocio(400, "Los repartos son solo de la distribuidora");
      }
      if (!data.vehiculo_id) throw negocio(400, "Seleccione el vehículo");
      await validarVehiculo(conn, data.vehiculo_id);
      const choferId = await resolverUsuarioId(conn, data.chofer_id);
      const [rows] = await conn.query(
        `INSERT INTO reparto (empresa_id, fecha, vehiculo_id, chofer_id, observacion, creado_por)
         VALUES (?, COALESCE(?::date, CURRENT_DATE), ?, ?, ?, ?)
         RETURNING id`,
        [
          Number(empresaId),
          data.fecha || null,
          Number(data.vehiculo_id),
          choferId,
          data.observacion?.trim() || null,
          usuarioId != null ? String(usuarioId).trim() : null,
        ]
      );
      return rows[0].id;
    }),

  // Solo en ARMADO. Si cambia el vehículo, se propaga a sus ventas para que
  // venta_envio siga diciendo en qué móvil sale cada una.
  update: async (empresaId, id, data) =>
    enTransaccion(async (conn) => {
      const r = await lockReparto(conn, empresaId, id, ["ARMADO"]);
      if (!data.vehiculo_id) throw negocio(400, "Seleccione el vehículo");
      await validarVehiculo(conn, data.vehiculo_id);
      const choferId = await resolverUsuarioId(conn, data.chofer_id);
      await conn.query(
        `UPDATE reparto
            SET fecha = COALESCE(?::date, fecha), vehiculo_id = ?, chofer_id = ?, observacion = ?
          WHERE id = ?`,
        [
          data.fecha || null,
          Number(data.vehiculo_id),
          choferId,
          data.observacion?.trim() || null,
          r.id,
        ]
      );
      if (Number(data.vehiculo_id) !== Number(r.vehiculo_id)) {
        await conn.query(
          `UPDATE venta_envio SET vehiculo_id = ? WHERE reparto_id = ?`,
          [Number(data.vehiculo_id), r.id]
        );
      }
    }),

  // Solo en ARMADO: libera las ventas para que puedan ir en otro reparto.
  anular: async (empresaId, id) =>
    enTransaccion(async (conn) => {
      const r = await lockReparto(conn, empresaId, id, ["ARMADO"]);
      await conn.query(
        `UPDATE venta_envio SET reparto_id = NULL WHERE reparto_id = ?`,
        [r.id]
      );
      await conn.query(`UPDATE reparto SET estado = 'ANULADO' WHERE id = ?`, [
        r.id,
      ]);
    }),

  // Asigna ventas al reparto (ARMADO). Solo toma las que siguen PENDIENTE,
  // sin reparto y de la misma empresa; si alguna no califica se rechaza todo
  // para que la oficina no crea que cargó algo que no entró.
  asignarVentas: async (empresaId, id, ventaIds) =>
    enTransaccion(async (conn) => {
      const ids = [
        ...new Set(
          (Array.isArray(ventaIds) ? ventaIds : [])
            .map((v) => Math.round(Number(v)))
            .filter((v) => v > 0)
        ),
      ];
      if (!ids.length) throw negocio(400, "Seleccione al menos una venta");
      const r = await lockReparto(conn, empresaId, id, ["ARMADO"]);
      const [res] = await conn.query(
        `UPDATE venta_envio e
            SET reparto_id = ?, vehiculo_id = ?
           FROM venta v
          WHERE v.VentaId = e.venta_id
            AND v.EmpresaId = ?
            AND e.venta_id = ANY(?::int[])
            AND e.estado = 'PENDIENTE'
            AND e.reparto_id IS NULL`,
        [r.id, r.vehiculo_id, Number(empresaId), ids]
      );
      if (res.affectedRows !== ids.length) {
        throw negocio(
          409,
          "Alguna de las ventas ya no está disponible (asignada a otro reparto o ya no está pendiente). Actualice la lista."
        );
      }
      return ids.length;
    }),

  quitarVenta: async (empresaId, id, ventaId) =>
    enTransaccion(async (conn) => {
      const r = await lockReparto(conn, empresaId, id, ["ARMADO"]);
      const [res] = await conn.query(
        `UPDATE venta_envio SET reparto_id = NULL
          WHERE reparto_id = ? AND venta_id = ?`,
        [r.id, Number(ventaId)]
      );
      if (!res.affectedRows) throw negocio(404, "La venta no está en este reparto");
    }),

  // Ruteador: confirma la salida. Congela las cajas por tipo y pasa las
  // ventas a EN_RUTA con el chofer del reparto.
  confirmarSalida: async (empresaId, id, usuarioId) =>
    enTransaccion(async (conn) => {
      const r = await lockReparto(conn, empresaId, id, ["ARMADO"]);
      const [cnt] = await conn.query(
        `SELECT COUNT(*)::int AS n FROM venta_envio WHERE reparto_id = ?`,
        [r.id]
      );
      if (!cnt[0].n) throw negocio(400, "El reparto no tiene ventas asignadas");

      const [cajas] = await conn.query(CAJAS_CALCULADAS_SQL, [r.id]);
      await conn.query(`DELETE FROM reparto_caja WHERE reparto_id = ?`, [r.id]);
      for (const c of cajas) {
        await conn.query(
          `INSERT INTO reparto_caja (reparto_id, tipo_caja, cajas_salida) VALUES (?, ?, ?)`,
          [r.id, c.tipo_caja, c.cajas]
        );
      }
      await conn.query(
        `UPDATE reparto SET estado = 'EN_RUTA', salida_en = now(), salida_por = ?
          WHERE id = ?`,
        [usuarioId != null ? String(usuarioId).trim() : null, r.id]
      );
      await conn.query(
        `UPDATE venta_envio SET estado = 'EN_RUTA', chofer_id = COALESCE(?, chofer_id)
          WHERE reparto_id = ?`,
        [r.chofer_id, r.id]
      );
    }),

  // Ruteador: registra las cajas recibidas por tipo. Si alguna no coincide
  // con lo que salió, la observación es obligatoria.
  confirmarRecepcion: async (empresaId, id, usuarioId, { cajas, observacion }) =>
    enTransaccion(async (conn) => {
      const r = await lockReparto(conn, empresaId, id, ["EN_RUTA"]);
      const [esperadas] = await conn.query(
        `SELECT tipo_caja, cajas_salida FROM reparto_caja WHERE reparto_id = ?`,
        [r.id]
      );
      const recibidas = new Map();
      for (const c of Array.isArray(cajas) ? cajas : []) {
        const raw = c?.cajas_recibidas;
        const n = raw === null || raw === undefined || raw === "" ? NaN : Number(raw);
        if (!Number.isInteger(n) || n < 0) {
          throw negocio(400, `Cantidad inválida para ${c?.tipo_caja ?? "una caja"}`);
        }
        recibidas.set(String(c?.tipo_caja), n);
      }
      for (const tipo of recibidas.keys()) {
        if (!esperadas.some((e) => e.tipo_caja === tipo)) {
          throw negocio(400, `El tipo de caja ${tipo} no salió en este reparto`);
        }
      }
      let hayDiferencia = false;
      for (const e of esperadas) {
        if (!recibidas.has(e.tipo_caja)) {
          throw negocio(400, `Falta cargar las cajas recibidas de ${e.tipo_caja}`);
        }
        if (recibidas.get(e.tipo_caja) !== Number(e.cajas_salida)) hayDiferencia = true;
      }
      const obs = observacion ? String(observacion).trim() : "";
      if (hayDiferencia && !obs) {
        throw negocio(
          400,
          "Hay diferencias entre las cajas que salieron y las recibidas: escriba una observación"
        );
      }
      for (const e of esperadas) {
        await conn.query(
          `UPDATE reparto_caja SET cajas_recibidas = ? WHERE reparto_id = ? AND tipo_caja = ?`,
          [recibidas.get(e.tipo_caja), r.id, e.tipo_caja]
        );
      }
      await conn.query(
        `UPDATE reparto
            SET estado = 'RECIBIDO', recepcion_en = now(), recepcion_por = ?,
                recepcion_observacion = ?
          WHERE id = ?`,
        [usuarioId != null ? String(usuarioId).trim() : null, obs || null, r.id]
      );
      await conn.query(
        `UPDATE venta_envio SET estado = 'ENTREGADO', entregado_en = now()
          WHERE reparto_id = ?`,
        [r.id]
      );
      return { hayDiferencia };
    }),
};

module.exports = Reparto;
