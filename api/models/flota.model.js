// Modelo del módulo flota para la app Mobile. Todas las tablas son snake_case
// y NO están en columnMap.js, así que el adaptador PG devuelve las columnas tal
// cual (contrato de la app). Regla: nunca seleccionar en crudo columnas que sí
// estén mapeadas (p.ej. usuario.UsuarioNombre) sin alias snake_case, porque el
// adaptador las renombraría a PascalCase.
const db = require("../config/db");

const q = (sql, params = []) =>
  db
    .promise()
    .query(sql, params)
    .then(([rows]) => rows);

const Flota = {
  getConfig: async () => {
    const rows = await q("SELECT * FROM flota_config WHERE id = 1");
    return (
      rows[0] || {
        permanencia_umbral_minutos: 15,
        permanencia_radio_metros: 100,
        ubicacion_intervalo_segundos: 60,
        permanencia_rol_alerta: "GERENTE_DE_OPERACIONES",
        gps_obligatorio: true,
        ubicacion_retencion_dias: 90,
      }
    );
  },

  // Todos los vehículos activos de la flota. Lo usa el POS mayorista para
  // elegir con qué vehículo sale una venta ENVÍO (no se filtra por chofer:
  // el operador asigna cualquier vehículo disponible).
  getVehiculosActivos: () =>
    q(
      `SELECT id, chapa, marca, modelo
         FROM flota_vehiculo
        WHERE activo
        ORDER BY chapa`
    ),

  getMisVehiculos: (usuarioId) =>
    q(
      `SELECT v.id, v.chapa, v.marca, v.modelo
         FROM flota_asignacion a
         JOIN flota_vehiculo v ON v.id = a.vehiculo_id
        WHERE TRIM(a.usuario_id) = ? AND a.activo AND v.activo
        ORDER BY v.chapa`,
      [String(usuarioId).trim()]
    ),

  vehiculoAsignado: async (usuarioId, vehiculoId) => {
    const rows = await q(
      `SELECT 1 FROM flota_asignacion
        WHERE TRIM(usuario_id) = ? AND vehiculo_id = ? AND activo LIMIT 1`,
      [String(usuarioId).trim(), vehiculoId]
    );
    return rows.length > 0;
  },

  getViajeActivo: async (usuarioId) => {
    const rows = await q(
      `SELECT t.id, t.vehiculo_id, t.inicio_en,
              t.lat_inicio::float8 AS lat_inicio, t.lng_inicio::float8 AS lng_inicio,
              v.chapa, v.marca
         FROM flota_viaje t
         JOIN flota_vehiculo v ON v.id = t.vehiculo_id
        WHERE TRIM(t.usuario_id) = ? AND t.estado = 'ABIERTO'
        ORDER BY t.inicio_en DESC LIMIT 1`,
      [String(usuarioId).trim()]
    );
    return rows[0] || null;
  },

  iniciarViaje: async (usuarioId, { vehiculo_id, lat, lng, accuracy }) => {
    const rows = await q(
      `INSERT INTO flota_viaje
         (usuario_id, vehiculo_id, estado, inicio_en, lat_inicio, lng_inicio, acc_inicio_m)
       VALUES (?, ?, 'ABIERTO', now(), ?, ?, ?)
       RETURNING id, inicio_en`,
      [String(usuarioId).trim(), vehiculo_id, lat, lng, accuracy ?? null]
    );
    return rows[0];
  },

  terminarViaje: async (usuarioId, { lat, lng, accuracy, capturado_en }) => {
    const rows = await q(
      `UPDATE flota_viaje
          SET estado = 'CERRADO',
              fin_en = COALESCE(?::timestamp, now()),
              lat_fin = ?, lng_fin = ?, acc_fin_m = ?
        WHERE TRIM(usuario_id) = ? AND estado = 'ABIERTO'
        RETURNING id, fin_en`,
      [
        capturado_en || null,
        lat,
        lng,
        accuracy ?? null,
        String(usuarioId).trim(),
      ]
    );
    return rows[0] || null;
  },

  insertUbicaciones: async (usuarioId, viajeId, puntos) => {
    // Inserta N puntos en una sola sentencia. puntos: [{lat,lng,accuracy,capturado_en}]
    if (!puntos.length) return 0;
    const valuesSql = [];
    const params = [];
    for (const p of puntos) {
      valuesSql.push("(?, ?, ?, ?, ?, COALESCE(?::timestamp, now()))");
      params.push(
        viajeId,
        String(usuarioId).trim(),
        p.lat,
        p.lng,
        p.accuracy ?? null,
        p.capturado_en || null
      );
    }
    const rows = await q(
      `INSERT INTO flota_ubicacion (viaje_id, usuario_id, lat, lng, acc_m, capturado_en)
       VALUES ${valuesSql.join(", ")} RETURNING id`,
      params
    );
    return rows.length;
  },

  insertCarga: async (usuarioId, data) => {
    const rows = await q(
      `INSERT INTO flota_carga_combustible
        (viaje_id, vehiculo_id, usuario_id, km_odometro, litros, monto, moneda_codigo,
         tablero_path, tablero_lat, tablero_lng, tablero_acc_m, tablero_capturado_en,
         factura_path, factura_lat, factura_lng, factura_acc_m, factura_capturado_en)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?::timestamp, ?, ?, ?, ?, ?::timestamp)
       RETURNING id, viaje_id`,
      [
        data.viaje_id ?? null,
        data.vehiculo_id,
        String(usuarioId).trim(),
        data.km_odometro ?? null,
        data.litros ?? null,
        data.monto ?? null,
        data.moneda_codigo ?? null,
        data.tablero_path ?? null,
        data.tablero_lat ?? null,
        data.tablero_lng ?? null,
        data.tablero_acc_m ?? null,
        data.tablero_capturado_en ?? null,
        data.factura_path ?? null,
        data.factura_lat ?? null,
        data.factura_lng ?? null,
        data.factura_acc_m ?? null,
        data.factura_capturado_en ?? null,
      ]
    );
    // Si vino km_odometro, actualizamos el km del vehículo (best effort).
    if (data.km_odometro != null) {
      await q(
        `UPDATE flota_vehiculo SET km_actual = ? WHERE id = ? AND ? > km_actual`,
        [data.km_odometro, data.vehiculo_id, data.km_odometro]
      );
    }
    return rows[0];
  },

  getMisCargas: async (usuarioId, limit, offset) => {
    const data = await q(
      `SELECT c.id, c.creado_en, c.km_odometro::float8 AS km,
              c.litros::float8 AS litros, c.monto::float8 AS monto, v.chapa
         FROM flota_carga_combustible c
         JOIN flota_vehiculo v ON v.id = c.vehiculo_id
        WHERE TRIM(c.usuario_id) = ?
        ORDER BY c.creado_en DESC
        LIMIT ? OFFSET ?`,
      [String(usuarioId).trim(), limit, offset]
    );
    const cnt = await q(
      `SELECT COUNT(*) AS total FROM flota_carga_combustible WHERE TRIM(usuario_id) = ?`,
      [String(usuarioId).trim()]
    );
    return { data, total: Number(cnt[0]?.total || 0) };
  },

  // ── Pendientes del chofer: mantenimientos y documentos por vencer ─────────
  getMisPendientes: async (usuarioId) => {
    const uid = String(usuarioId).trim();
    const mant = await q(
      `SELECT m.id AS codigo, m.vehiculo_id, v.chapa, v.marca, m.titulo,
              m.km_proximo::float8 AS km_proximo, m.fecha_proxima,
              v.km_actual::float8 AS km_actual
         FROM flota_mantenimiento m
         JOIN flota_vehiculo v ON v.id = m.vehiculo_id
         JOIN flota_asignacion a ON a.vehiculo_id = v.id
        WHERE TRIM(a.usuario_id) = ? AND a.activo AND m.activo
          AND (
            (m.fecha_proxima IS NOT NULL AND m.fecha_proxima <= CURRENT_DATE + INTERVAL '15 day')
            OR (m.km_proximo IS NOT NULL AND v.km_actual >= m.km_proximo - 500)
          )`,
      [uid]
    );
    const docsVeh = await q(
      `SELECT d.id AS codigo, d.vehiculo_id, v.chapa, v.marca, d.tipo AS tipo_doc,
              d.vencimiento
         FROM flota_documento d
         JOIN flota_vehiculo v ON v.id = d.vehiculo_id
         JOIN flota_asignacion a ON a.vehiculo_id = v.id
        WHERE TRIM(a.usuario_id) = ? AND a.activo AND d.activo
          AND d.vencimiento IS NOT NULL
          AND d.vencimiento <= CURRENT_DATE + INTERVAL '30 day'`,
      [uid]
    );
    const docsChofer = await q(
      `SELECT id AS codigo, tipo AS tipo_doc, vencimiento
         FROM flota_documento_chofer
        WHERE TRIM(usuario_id) = ? AND activo
          AND vencimiento IS NOT NULL
          AND vencimiento <= CURRENT_DATE + INTERVAL '30 day'`,
      [uid]
    );
    return [
      ...mant.map((m) => ({
        categoria: "mantenimiento",
        codigo: m.codigo,
        vehiculo_id: m.vehiculo_id,
        chapa: m.chapa,
        marca: m.marca,
        titulo: m.titulo,
        estado: estadoPorFechaKm(m.fecha_proxima, m.km_proximo, m.km_actual),
        km_proximo: m.km_proximo,
        fecha_proxima: m.fecha_proxima,
        km_actual: m.km_actual,
      })),
      ...docsVeh.map((d) => ({
        categoria: "documento",
        codigo: d.codigo,
        vehiculo_id: d.vehiculo_id,
        chapa: d.chapa,
        marca: d.marca,
        titulo: `${d.tipo_doc} ${d.chapa}`,
        estado: estadoPorFecha(d.vencimiento),
        tipo_doc: d.tipo_doc,
        vencimiento: d.vencimiento,
      })),
      ...docsChofer.map((d) => ({
        categoria: "documento_chofer",
        codigo: d.codigo,
        usuario_id: uid,
        titulo: d.tipo_doc,
        estado: estadoPorFecha(d.vencimiento),
        tipo_doc: d.tipo_doc,
        vencimiento: d.vencimiento,
      })),
    ];
  },

  // ── Vista gerente: viajes activos con última ubicación ────────────────────
  getViajesActivos: () =>
    q(
      `SELECT t.id, t.usuario_id, t.inicio_en,
              t.lat_inicio::float8 AS lat_inicio, t.lng_inicio::float8 AS lng_inicio,
              TRIM(COALESCE(u.usuarionombre,'') || ' ' || COALESCE(u.usuarioapellido,'')) AS chofer_nombre,
              t.vehiculo_id, v.chapa, v.marca,
              ult.lat::float8 AS ult_lat, ult.lng::float8 AS ult_lng, ult.acc_m::float8 AS ult_acc_m,
              ult.capturado_en AS ult_visto_en
         FROM flota_viaje t
         JOIN flota_vehiculo v ON v.id = t.vehiculo_id
         JOIN usuario u ON TRIM(u.usuarioid) = TRIM(t.usuario_id)
         LEFT JOIN LATERAL (
           SELECT lat, lng, acc_m, capturado_en
             FROM flota_ubicacion
            WHERE viaje_id = t.id
            ORDER BY capturado_en DESC LIMIT 1
         ) ult ON true
        WHERE t.estado = 'ABIERTO'
        ORDER BY t.inicio_en DESC`
    ),

  getAtencionRequerida: async () => {
    const mant = await q(
      `SELECT m.id AS codigo, m.vehiculo_id, v.chapa, v.marca, m.titulo,
              m.km_proximo::float8 AS km_proximo, m.fecha_proxima,
              v.km_actual::float8 AS km_actual
         FROM flota_mantenimiento m
         JOIN flota_vehiculo v ON v.id = m.vehiculo_id
        WHERE m.activo AND (
            (m.fecha_proxima IS NOT NULL AND m.fecha_proxima <= CURRENT_DATE + INTERVAL '15 day')
            OR (m.km_proximo IS NOT NULL AND v.km_actual >= m.km_proximo - 500)
          )`
    );
    const docsVeh = await q(
      `SELECT d.id AS codigo, d.vehiculo_id, v.chapa, v.marca, d.tipo AS tipo_doc, d.vencimiento
         FROM flota_documento d
         JOIN flota_vehiculo v ON v.id = d.vehiculo_id
        WHERE d.activo AND d.vencimiento IS NOT NULL
          AND d.vencimiento <= CURRENT_DATE + INTERVAL '30 day'`
    );
    const docsChofer = await q(
      `SELECT d.id AS codigo, d.usuario_id,
              TRIM(COALESCE(u.usuarionombre,'') || ' ' || COALESCE(u.usuarioapellido,'')) AS chofer_nombre,
              d.tipo AS tipo_doc, d.vencimiento
         FROM flota_documento_chofer d
         JOIN usuario u ON TRIM(u.usuarioid) = TRIM(d.usuario_id)
        WHERE d.activo AND d.vencimiento IS NOT NULL
          AND d.vencimiento <= CURRENT_DATE + INTERVAL '30 day'`
    );
    return [
      ...mant.map((m) => ({
        categoria: "mantenimiento",
        codigo: m.codigo,
        vehiculo_id: m.vehiculo_id,
        chapa: m.chapa,
        marca: m.marca,
        titulo: m.titulo,
        estado: estadoPorFechaKm(m.fecha_proxima, m.km_proximo, m.km_actual),
        km_proximo: m.km_proximo,
        fecha_proxima: m.fecha_proxima,
        km_actual: m.km_actual,
      })),
      ...docsVeh.map((d) => ({
        categoria: "documento",
        codigo: d.codigo,
        vehiculo_id: d.vehiculo_id,
        chapa: d.chapa,
        marca: d.marca,
        titulo: `${d.tipo_doc} ${d.chapa}`,
        estado: estadoPorFecha(d.vencimiento),
        tipo_doc: d.tipo_doc,
        vencimiento: d.vencimiento,
      })),
      ...docsChofer.map((d) => ({
        categoria: "documento_chofer",
        codigo: d.codigo,
        usuario_id: d.usuario_id,
        chofer_nombre: d.chofer_nombre,
        titulo: d.tipo_doc,
        estado: estadoPorFecha(d.vencimiento),
        tipo_doc: d.tipo_doc,
        vencimiento: d.vencimiento,
      })),
    ];
  },

  getViajeDetalle: async (id) => {
    const rows = await q(
      `SELECT t.id, t.estado, t.inicio_en, t.fin_en, t.usuario_id,
              TRIM(COALESCE(u.usuarionombre,'') || ' ' || COALESCE(u.usuarioapellido,'')) AS chofer_nombre,
              t.vehiculo_id, v.chapa, v.marca,
              t.lat_inicio::float8 AS lat_inicio, t.lng_inicio::float8 AS lng_inicio,
              t.lat_fin::float8 AS lat_fin, t.lng_fin::float8 AS lng_fin,
              t.km_recorridos::float8 AS km_recorridos
         FROM flota_viaje t
         JOIN flota_vehiculo v ON v.id = t.vehiculo_id
         JOIN usuario u ON TRIM(u.usuarioid) = TRIM(t.usuario_id)
        WHERE t.id = ?`,
      [id]
    );
    if (!rows.length) return null;
    const viaje = rows[0];
    const tot = await q(
      `SELECT COUNT(*) AS ubicaciones_total FROM flota_ubicacion WHERE viaje_id = ?`,
      [id]
    );
    const cargas = await q(
      `SELECT id, creado_en, km_odometro::float8 AS km,
              litros::float8 AS litros, monto::float8 AS monto,
              NULL::float8 AS consumo_km_l
         FROM flota_carga_combustible
        WHERE viaje_id = ? ORDER BY creado_en`,
      [id]
    );
    return {
      ...viaje,
      ubicaciones_total: Number(tot[0]?.ubicaciones_total || 0),
      cargas,
      alertas: [],
    };
  },

  // ══════════════════════════════════════════════════════════════════════════
  // ABM de flota desde el dashboard (admin). Vehículos, asignación de choferes
  // y documentos. Choferes = usuarios con perfil CHOFER (ver chofer* abajo).
  // ══════════════════════════════════════════════════════════════════════════

  // ── Vehículos ───────────────────────────────────────────────────────────
  listVehiculos: (incluirInactivos = false) =>
    q(
      `SELECT v.id, v.chapa, v.marca, v.modelo,
              v.km_actual::float8 AS km_actual, v.activo,
              (SELECT COUNT(*) FROM flota_asignacion a
                WHERE a.vehiculo_id = v.id AND a.activo) AS choferes
         FROM flota_vehiculo v
        ${incluirInactivos ? "" : "WHERE v.activo"}
        ORDER BY v.chapa`
    ),

  createVehiculo: async ({ chapa, marca, modelo, km_actual, activo }) => {
    const rows = await q(
      `INSERT INTO flota_vehiculo (chapa, marca, modelo, km_actual, activo)
       VALUES (?, ?, ?, ?, ?) RETURNING id`,
      [chapa, marca ?? null, modelo ?? null, km_actual ?? 0, activo !== false]
    );
    return rows[0];
  },

  updateVehiculo: async (id, { chapa, marca, modelo, km_actual, activo }) => {
    const rows = await q(
      `UPDATE flota_vehiculo
          SET chapa = ?, marca = ?, modelo = ?, km_actual = ?, activo = ?
        WHERE id = ?
        RETURNING id`,
      [chapa, marca ?? null, modelo ?? null, km_actual ?? 0, activo !== false, id]
    );
    return rows[0] || null;
  },

  deleteVehiculo: (id) =>
    q(`DELETE FROM flota_vehiculo WHERE id = ?`, [id]),

  // ── Asignación chofer ↔ vehículo (flota_asignacion) ──────────────────────
  getChoferesDeVehiculo: (vehiculoId) =>
    q(
      `SELECT TRIM(usuario_id) AS usuario_id
         FROM flota_asignacion
        WHERE vehiculo_id = ? AND activo`,
      [vehiculoId]
    ),

  // Reemplaza el set de choferes del vehículo: borra los actuales e inserta los
  // nuevos. La tabla tiene UNIQUE(vehiculo_id, usuario_id), así que un borrado
  // total + alta limpia evita choques.
  setChoferesDeVehiculo: async (vehiculoId, choferIds) => {
    await q(`DELETE FROM flota_asignacion WHERE vehiculo_id = ?`, [vehiculoId]);
    for (const uid of choferIds) {
      await q(
        `INSERT INTO flota_asignacion (vehiculo_id, usuario_id, activo)
         VALUES (?, ?, true)`,
        [vehiculoId, String(uid).trim()]
      );
    }
  },

  // ── Documentos de vehículo (flota_documento) ─────────────────────────────
  listDocsVehiculo: (vehiculoId) =>
    q(
      `SELECT id, tipo, vencimiento, activo
         FROM flota_documento
        WHERE vehiculo_id = ? AND activo
        ORDER BY vencimiento NULLS LAST`,
      [vehiculoId]
    ),

  createDocVehiculo: async (vehiculoId, { tipo, vencimiento }) => {
    const rows = await q(
      `INSERT INTO flota_documento (vehiculo_id, tipo, vencimiento)
       VALUES (?, ?, ?) RETURNING id`,
      [vehiculoId, tipo, vencimiento || null]
    );
    return rows[0];
  },

  deleteDocVehiculo: (docId) =>
    q(`DELETE FROM flota_documento WHERE id = ?`, [docId]),

  // ── Documentos de chofer (flota_documento_chofer) ────────────────────────
  listDocsChofer: (usuarioId) =>
    q(
      `SELECT id, tipo, vencimiento, activo
         FROM flota_documento_chofer
        WHERE TRIM(usuario_id) = ? AND activo
        ORDER BY vencimiento NULLS LAST`,
      [String(usuarioId).trim()]
    ),

  createDocChofer: async (usuarioId, { tipo, vencimiento }) => {
    const rows = await q(
      `INSERT INTO flota_documento_chofer (usuario_id, tipo, vencimiento)
       VALUES (?, ?, ?) RETURNING id`,
      [String(usuarioId).trim(), tipo, vencimiento || null]
    );
    return rows[0];
  },

  deleteDocChofer: (docId) =>
    q(`DELETE FROM flota_documento_chofer WHERE id = ?`, [docId]),

  // ── Choferes (usuarios con perfil CHOFER) ────────────────────────────────
  // PerfilId del perfil CHOFER (creado por la migración 001). Alias snake para
  // que el adaptador PG no lo remapee.
  getPerfilChoferId: async () => {
    const rows = await q(
      `SELECT perfilid AS perfil_id FROM perfil
        WHERE upper(perfildescripcion) = 'CHOFER' LIMIT 1`
    );
    return rows[0]?.perfil_id || null;
  },

  listChoferes: () =>
    q(
      `SELECT TRIM(u.usuarioid) AS usuario_id,
              u.usuarionombre  AS nombre,
              u.usuarioapellido AS apellido,
              u.usuariocorreo  AS correo,
              u.usuarioestado  AS estado,
              u.localid        AS local_id,
              l.localnombre    AS local_nombre,
              (SELECT COUNT(*) FROM flota_asignacion a
                WHERE TRIM(a.usuario_id) = TRIM(u.usuarioid) AND a.activo) AS vehiculos
         FROM usuario u
         JOIN usuarioperfil up ON TRIM(up.usuarioid) = TRIM(u.usuarioid)
         JOIN perfil p ON p.perfilid = up.perfilid
              AND upper(p.perfildescripcion) = 'CHOFER'
         LEFT JOIN local l ON l.localid = u.localid
        ORDER BY u.usuarionombre, u.usuarioapellido`
    ),

  existeUsuario: async (usuarioId) => {
    const rows = await q(
      `SELECT 1 FROM usuario WHERE TRIM(usuarioid) = ? LIMIT 1`,
      [String(usuarioId).trim()]
    );
    return rows.length > 0;
  },

  // Asegura que el usuario tenga el perfil CHOFER (idempotente).
  asignarPerfilChofer: async (usuarioId) => {
    const perfilId = await Flota.getPerfilChoferId();
    if (!perfilId) throw new Error("No existe el perfil CHOFER");
    await q(
      `INSERT INTO usuarioperfil (UsuarioId, PerfilId)
       VALUES (?, ?) ON CONFLICT DO NOTHING`,
      [String(usuarioId).trim(), perfilId]
    );
  },

  // Borra los vínculos usuario↔perfil. usuarioperfil NO tiene ON DELETE CASCADE,
  // así que hay que limpiarlo antes de poder eliminar el usuario. (Las tablas
  // flota_asignacion / flota_documento_chofer sí cascadean al borrar el usuario.)
  quitarPerfilesUsuario: (usuarioId) =>
    q(`DELETE FROM usuarioperfil WHERE TRIM(UsuarioId) = ?`, [
      String(usuarioId).trim(),
    ]),
};

function estadoPorFecha(vencimiento) {
  if (!vencimiento) return "PROXIMO";
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const venc = new Date(`${vencimiento}T00:00:00`);
  return venc < hoy ? "VENCIDO" : "PROXIMO";
}

function estadoPorFechaKm(fechaProxima, kmProximo, kmActual) {
  if (fechaProxima) {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    if (new Date(`${fechaProxima}T00:00:00`) < hoy) return "VENCIDO";
  }
  if (kmProximo != null && kmActual != null && Number(kmActual) >= Number(kmProximo)) {
    return "VENCIDO";
  }
  return "PROXIMO";
}

module.exports = Flota;
