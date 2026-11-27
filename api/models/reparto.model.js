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

// Reparto recibido con al menos un tipo de caja que no coincide.
const CON_DIFERENCIA_SQL = `
  SELECT 1 FROM reparto_caja rc
   WHERE rc.reparto_id = r.id
     AND rc.cajas_recibidas IS NOT NULL
     AND rc.cajas_recibidas <> rc.cajas_salida`;

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
           WHERE e.reparto_id = r.id)::bigint AS total_ventas,
         (SELECT COUNT(*) FROM reparto_venta_no_entregada ne
           WHERE ne.reparto_id = r.id)::int AS ventas_no_entregadas,
         (CASE WHEN r.estado IN ('ARMADO', 'ANULADO') THEN
            (SELECT COALESCE(SUM(vp.VentaProductoCantidad), 0)
               FROM venta_envio e
               JOIN ventaproducto vp ON vp.VentaId = e.venta_id
               JOIN producto p ON p.ProductoId = vp.ProductoId
              WHERE e.reparto_id = r.id
                AND vp.VentaProductoUnitario = 'C'
                AND p.ProductoTipoCaja IS NOT NULL)
          ELSE
            (SELECT COALESCE(SUM(rc.cajas_salida), 0)
               FROM reparto_caja rc WHERE rc.reparto_id = r.id)
          END)::int AS cajas_salida,
         (SELECT SUM(rc.cajas_recibidas)
            FROM reparto_caja rc WHERE rc.reparto_id = r.id)::int AS cajas_recibidas,
         EXISTS (${CON_DIFERENCIA_SQL}) AS con_diferencia
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

// ── Cobro de ventas de envío ────────────────────────────────────────────────
// Al confirmar un envío, cada forma de pago queda como un movimiento de caja
// (registrodiariocaja, TipoGastoId 2) en los grupos dedicados 7-10, atado a la
// venta por el "N°: <id>" del detalle (ver Venta.registrarPagosEnCaja). Los
// "Cobro Crédito ..." posteriores no son parte del cobro del envío.
const GRUPO_POR_METODO = { efectivo: 7, pos: 8, voucher: 9, transferencia: 10 };
const METODOS = Object.keys(GRUPO_POR_METODO);
const METODO_POR_GRUPO = Object.fromEntries(
  METODOS.map((m) => [GRUPO_POR_METODO[m], m])
);

const PAGOS_ENVIO_SQL = `
  SELECT RegistroDiarioCajaId AS rdc_id, TipoGastoGrupoId AS grupo,
         RegistroDiarioCajaMonto AS monto, CajaId AS caja_id,
         RegistroDiarioCajaFecha AS fecha, UsuarioId AS usuario_id
    FROM registrodiariocaja
   WHERE TipoGastoId = 2
     AND TipoGastoGrupoId IN (7, 8, 9, 10)
     AND NOT (RegistroDiarioCajaDetalle LIKE 'Cobro Crédito%')
     AND CAST(substring(RegistroDiarioCajaDetalle from 'N°:\\s*([0-9]+)') AS INTEGER) = ?
   ORDER BY RegistroDiarioCajaId`;

const montosVacios = () => ({ efectivo: 0, pos: 0, voucher: 0, transferencia: 0 });

function sumarPorMetodo(rows) {
  const m = montosVacios();
  for (const r of rows) m[METODO_POR_GRUPO[Number(r.grupo)]] += Number(r.monto);
  return m;
}

const totalDe = (m) => METODOS.reduce((a, k) => a + m[k], 0);
const miles = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

function detallePago(metodo, ventaId, esCredito) {
  const base = {
    efectivo: esCredito ? "Venta Crédito" : "Venta",
    pos: "Venta POS",
    voucher: "Venta Voucher",
    transferencia: "Venta Transferencia",
  }[metodo];
  return `${base} N°: ${ventaId} (ENVÍO)`;
}

// La venta tiene que estar hoy en este reparto (las no entregadas ya salieron
// de él y se corrigen desde el reparto donde se entreguen).
async function validarVentaDelReparto(conn, repartoId, ventaId, { lock = false } = {}) {
  const id = Number(ventaId);
  if (!Number.isInteger(id) || id <= 0) throw negocio(400, "Venta inválida");
  const [rows] = await conn.query(
    `SELECT venta_id FROM venta_envio WHERE reparto_id = ? AND venta_id = ?${lock ? " FOR UPDATE" : ""}`,
    [Number(repartoId), id]
  );
  if (!rows.length) throw negocio(404, `La venta #${id} no está en este reparto`);
  return id;
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

  list: async (empresaId, { estado, desde, hasta, conDiferencia } = {}) => {
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
    if (conDiferencia === true || conDiferencia === "1" || conDiferencia === "true") {
      cond.push(`EXISTS (${CON_DIFERENCIA_SQL})`);
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

    // Ventas del reparto: las que siguen en él y las que volvieron sin
    // entregar (migración 037), aunque ya estén en otro reparto.
    const [ventas] = await pe.query(
      `SELECT v.VentaId AS venta_id, v.VentaFecha AS venta_fecha, v.Total AS venta_total,
              NULLIF(TRIM(COALESCE(c.ClienteNombre, '') || ' ' || COALESCE(c.ClienteApellido, '')), '') AS cliente,
              e.estado AS envio_estado, false AS no_entregada
         FROM venta_envio e
         JOIN venta v ON v.VentaId = e.venta_id
         LEFT JOIN clientes c ON c.ClienteId = v.ClienteId
        WHERE e.reparto_id = ?
       UNION ALL
       SELECT v.VentaId, v.VentaFecha, v.Total,
              NULLIF(TRIM(COALESCE(c.ClienteNombre, '') || ' ' || COALESCE(c.ClienteApellido, '')), ''),
              e.estado, true
         FROM reparto_venta_no_entregada ne
         JOIN venta v ON v.VentaId = ne.venta_id
         LEFT JOIN venta_envio e ON e.venta_id = ne.venta_id
         LEFT JOIN clientes c ON c.ClienteId = v.ClienteId
        WHERE ne.reparto_id = ?
        ORDER BY venta_id`,
      [reparto.id, reparto.id]
    );

    const [productos] = await pe.query(
      `SELECT p.ProductoId AS producto_id, p.ProductoCodigo AS producto_codigo,
              p.ProductoNombre AS producto_nombre, p.ProductoTipoCaja AS tipo_caja,
              SUM(CASE WHEN vp.VentaProductoUnitario = 'C' THEN vp.VentaProductoCantidad ELSE 0 END)::int AS cajas,
              SUM(CASE WHEN vp.VentaProductoUnitario = 'C' THEN 0 ELSE vp.VentaProductoCantidad END)::int AS unidades
         FROM ventaproducto vp
         JOIN producto p ON p.ProductoId = vp.ProductoId
        WHERE vp.VentaId IN (
                SELECT venta_id FROM venta_envio WHERE reparto_id = ?
                UNION
                SELECT venta_id FROM reparto_venta_no_entregada WHERE reparto_id = ?)
        GROUP BY p.ProductoId, p.ProductoCodigo, p.ProductoNombre, p.ProductoTipoCaja
        ORDER BY p.ProductoNombre`,
      [reparto.id, reparto.id]
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

  // Ruteador: registra las cajas recibidas por tipo y las ventas que volvieron
  // sin entregar. Si alguna caja no coincide con lo que salió, o hay ventas
  // no entregadas, la observación es obligatoria. Las no entregadas vuelven a
  // PENDIENTE y quedan libres para otro reparto (migración 037); sus cajas
  // no cambian el esperado porque vuelven llenas y cuentan igual.
  confirmarRecepcion: async (
    empresaId,
    id,
    usuarioId,
    { cajas, observacion, no_entregadas }
  ) =>
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

      if (no_entregadas != null && !Array.isArray(no_entregadas)) {
        throw negocio(400, "Lista de ventas no entregadas inválida");
      }
      const noEntregadas = [
        ...new Set(
          (no_entregadas || []).map((v) => {
            const n = v === null || v === "" ? NaN : Number(v);
            if (!Number.isInteger(n) || n <= 0) {
              throw negocio(400, "Venta no entregada inválida");
            }
            return n;
          })
        ),
      ];
      if (noEntregadas.length) {
        // Mismo orden de locks que el resto: reparto (arriba) -> venta_envio.
        const [enReparto] = await conn.query(
          `SELECT venta_id FROM venta_envio
            WHERE reparto_id = ? AND venta_id = ANY(?::int[])
            FOR UPDATE`,
          [r.id, noEntregadas]
        );
        const presentes = new Set(enReparto.map((x) => Number(x.venta_id)));
        const ajena = noEntregadas.find((v) => !presentes.has(v));
        if (ajena) throw negocio(400, `La venta #${ajena} no está en este reparto`);
      }

      const obs = observacion ? String(observacion).trim() : "";
      if (hayDiferencia && !obs) {
        throw negocio(
          400,
          "Hay diferencias entre las cajas que salieron y las recibidas: escriba una observación"
        );
      }
      if (noEntregadas.length && !obs) {
        throw negocio(
          400,
          "Hay ventas no entregadas: escriba una observación con el motivo"
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
      if (noEntregadas.length) {
        await conn.query(
          `INSERT INTO reparto_venta_no_entregada (reparto_id, venta_id)
           SELECT ?, unnest(?::int[])
           ON CONFLICT DO NOTHING`,
          [r.id, noEntregadas]
        );
        await conn.query(
          `UPDATE venta_envio
              SET estado = 'PENDIENTE', reparto_id = NULL, entregado_en = NULL
            WHERE reparto_id = ? AND venta_id = ANY(?::int[])`,
          [r.id, noEntregadas]
        );
      }
      await conn.query(
        `UPDATE venta_envio SET estado = 'ENTREGADO', entregado_en = now()
          WHERE reparto_id = ?`,
        [r.id]
      );
      return { hayDiferencia, noEntregadas: noEntregadas.length };
    }),

  // Una venta que ya salió en un reparto (EN_RUTA / RECIBIDO) no se edita:
  // la hoja de carga, las cajas congeladas y lo que se cobra dejarían de
  // coincidir con lo que llevó el vehículo. Devuelve el mensaje para el
  // usuario, o null si se puede editar (sin reparto o reparto ARMADO).
  bloqueoEdicionVenta: async (ventaId) => {
    const id = Number(ventaId);
    if (!Number.isInteger(id) || id <= 0) return null;
    const [rows] = await db.promise().query(
      `SELECT r.id, r.estado
         FROM venta_envio e
         JOIN reparto r ON r.id = e.reparto_id
        WHERE e.venta_id = ? AND r.estado IN ('EN_RUTA', 'RECIBIDO')`,
      [id]
    );
    if (!rows.length) return null;
    return `La venta #${id} ya salió en el reparto #${rows[0].id} (${rows[0].estado.replace(
      "_",
      " "
    )}): no se puede modificar`;
  },

  // Lo cobrado al confirmar una venta de envío, por forma de pago, y el
  // historial de correcciones.
  getPagosEnvio: async (empresaId, repartoId, ventaId) => {
    const pe = db.promise();
    const [rep] = await pe.query(
      `SELECT estado FROM reparto WHERE id = ? AND empresa_id = ?`,
      [Number(repartoId), Number(empresaId)]
    );
    if (!rep.length) throw negocio(404, "Reparto no encontrado");
    if (rep[0].estado === "ANULADO") throw negocio(409, "El reparto está ANULADO");
    const id = await validarVentaDelReparto(pe, repartoId, ventaId);
    const [rows] = await pe.query(PAGOS_ENVIO_SQL, [id]);
    const montos = sumarPorMetodo(rows);
    const [correcciones] = await pe.query(
      `SELECT id, TRIM(usuario_id) AS usuario_id, corregido_en, antes, despues, observacion
         FROM venta_pago_correccion WHERE venta_id = ? ORDER BY id`,
      [id]
    );
    return { venta_id: id, ...montos, total: totalDe(montos), correcciones };
  },

  // El cajero redistribuye lo cobrado de una venta de envío entre efectivo,
  // POS, voucher y transferencia (p. ej. el efectivo a cobrar al entregar
  // terminó siendo transferencia). El total no cambia. Se reescriben los
  // movimientos de caja de la venta en su lugar (misma caja, fecha y usuario
  // de origen, aunque esa caja ya esté cerrada: los grupos 7-10 no cuentan en
  // el arqueo del cajero) y queda registro en venta_pago_correccion.
  corregirPagosEnvio: async (empresaId, repartoId, ventaId, usuarioId, data = {}) =>
    enTransaccion(async (conn) => {
      const nuevos = montosVacios();
      for (const m of METODOS) {
        const v = data[m];
        if (v === undefined || v === null || v === "") continue;
        const n = Number(v);
        if (!Number.isSafeInteger(n) || n < 0) throw negocio(400, `Monto de ${m} inválido`);
        nuevos[m] = n;
      }

      await lockReparto(conn, empresaId, repartoId, ["ARMADO", "EN_RUTA", "RECIBIDO"]);
      const id = await validarVentaDelReparto(conn, repartoId, ventaId, { lock: true });
      const [ven] = await conn.query(
        `SELECT VentaTipo AS venta_tipo FROM venta WHERE VentaId = ? FOR UPDATE`,
        [id]
      );
      const esCredito = ven[0]?.venta_tipo === "CR";

      const [rows] = await conn.query(`${PAGOS_ENVIO_SQL} FOR UPDATE`, [id]);
      if (!rows.length) {
        throw negocio(409, `La venta #${id} no tiene pagos de envío para corregir`);
      }
      const antes = sumarPorMetodo(rows);
      const total = totalDe(antes);
      if (totalDe(nuevos) !== total) {
        throw negocio(
          400,
          `La suma de las formas de pago debe ser Gs. ${miles(total)} (lo cobrado en la venta)`
        );
      }
      if (METODOS.every((m) => nuevos[m] === antes[m])) {
        throw negocio(400, "No hay cambios en la forma de pago");
      }

      // Cada forma de pago con monto conserva, si existe, el movimiento que ya
      // tenía su grupo; las demás reusan los movimientos sobrantes y, si no
      // alcanzan, se agregan nuevos con la caja, fecha y usuario de origen.
      const destinos = METODOS.filter((m) => nuevos[m] > 0);
      const libres = [...rows];
      const asignados = new Map();
      for (const m of destinos) {
        const i = libres.findIndex((r) => Number(r.grupo) === GRUPO_POR_METODO[m]);
        if (i >= 0) asignados.set(m, libres.splice(i, 1)[0]);
      }
      for (const m of destinos) {
        if (!asignados.has(m) && libres.length) asignados.set(m, libres.shift());
      }
      const origen = rows[0];
      for (const m of destinos) {
        const fila = asignados.get(m);
        const detalle = detallePago(m, id, esCredito);
        if (fila) {
          await conn.query(
            `UPDATE registrodiariocaja
                SET TipoGastoGrupoId = ?, RegistroDiarioCajaDetalle = ?, RegistroDiarioCajaMonto = ?
              WHERE RegistroDiarioCajaId = ?`,
            [GRUPO_POR_METODO[m], detalle, nuevos[m], fila.rdc_id]
          );
        } else {
          await conn.query(
            `INSERT INTO registrodiariocaja (
               CajaId, RegistroDiarioCajaFecha, TipoGastoId, TipoGastoGrupoId,
               RegistroDiarioCajaDetalle, RegistroDiarioCajaMonto, UsuarioId
             ) VALUES (?, ?, 2, ?, ?, ?, ?)`,
            [origen.caja_id, origen.fecha, GRUPO_POR_METODO[m], detalle, nuevos[m], origen.usuario_id]
          );
        }
      }
      for (const r of libres) {
        await conn.query(`DELETE FROM registrodiariocaja WHERE RegistroDiarioCajaId = ?`, [r.rdc_id]);
      }

      // VentaTipo con la misma prioridad que la confirmación (CR > TR > PO > CO).
      if (!esCredito) {
        const tipo = nuevos.transferencia > 0 ? "TR" : nuevos.pos > 0 ? "PO" : "CO";
        await conn.query(`UPDATE venta SET VentaTipo = ? WHERE VentaId = ?`, [tipo, id]);
      }

      const usr = usuarioId == null ? null : String(usuarioId).trim() || null;
      const obs = typeof data.observacion === "string" ? data.observacion.trim() || null : null;
      await conn.query(
        `INSERT INTO venta_pago_correccion (venta_id, reparto_id, usuario_id, antes, despues, observacion)
         VALUES (?, ?, ?, ?::jsonb, ?::jsonb, ?)`,
        [id, Number(repartoId), usr, JSON.stringify(antes), JSON.stringify(nuevos), obs]
      );
      return { venta_id: id, ...nuevos, total };
    }),
};

module.exports = Reparto;
