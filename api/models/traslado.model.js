const db = require("../config/db");

// Lecturas de traslados y ABM de equivalencias entre catálogos.
// La ESCRITURA del traslado (que mueve stock) vive en el controlador, dentro
// de una transacción explícita, igual que compra.controller.confirmar.

const CAB_COLS = `
  t.TrasladoId, t.TrasladoFecha, t.TrasladoEstado, t.TrasladoObs,
  t.AlmacenOrigenId, t.AlmacenDestinoId, t.EmpresaOrigenId, t.EmpresaDestinoId,
  t.UsuarioId, t.TrasladoAnuladoFecha, t.TrasladoAnuladoUsuarioId,
  ao.AlmacenNombre AS AlmacenOrigenNombre,
  ad.AlmacenNombre AS AlmacenDestinoNombre,
  eo.EmpresaNombre AS EmpresaOrigenNombre,
  ed.EmpresaNombre AS EmpresaDestinoNombre`;

const CAB_JOINS = `
  FROM traslado t
  LEFT JOIN almacen ao ON ao.AlmacenId = t.AlmacenOrigenId
  LEFT JOIN almacen ad ON ad.AlmacenId = t.AlmacenDestinoId
  LEFT JOIN empresa eo ON eo.EmpresaId = t.EmpresaOrigenId
  LEFT JOIN empresa ed ON ed.EmpresaId = t.EmpresaDestinoId`;

// Factor inverso para el sentido contrario de una equivalencia.
//
// FactorCaja es NUMERIC(14,6), así que un factor de 1/6 se guarda como
// 0.166667 y su inverso crudo da 5.999988 en vez de 6. Con ese valor, un
// traslado de vuelta rechazaría cantidades perfectamente válidas por no dar
// un entero exacto. Cuando el inverso cae a menos de 1e-4 de un entero se
// asume que esa era la intención y se guarda el entero limpio; si no, se
// redondea a los 6 decimales que admite la columna.
function reciproco(factor) {
  const inv = 1 / factor;
  const entero = Math.round(inv);
  if (entero > 0 && Math.abs(inv - entero) < 1e-4) return entero;
  return Math.round(inv * 1e6) / 1e6;
}

const Traslado = {
  // Un traslado es visible desde las DOS empresas que toca: la que envía y la
  // que recibe. Por eso el scope es OR y no `EmpresaId = ?` como en el resto
  // de los modelos.
  getAllPaginated: (empresaId, filtros = {}, limit = 10, offset = 0) => {
    return new Promise((resolve, reject) => {
      const cond = ["(t.EmpresaOrigenId = ? OR t.EmpresaDestinoId = ?)"];
      const params = [empresaId, empresaId];

      if (filtros.almacenOrigenId) {
        cond.push("t.AlmacenOrigenId = ?");
        params.push(filtros.almacenOrigenId);
      }
      if (filtros.almacenDestinoId) {
        cond.push("t.AlmacenDestinoId = ?");
        params.push(filtros.almacenDestinoId);
      }
      if (filtros.estado) {
        cond.push("t.TrasladoEstado = ?");
        params.push(filtros.estado);
      }
      if (filtros.desde) {
        cond.push("t.TrasladoFecha >= ?");
        params.push(`${filtros.desde} 00:00:00`);
      }
      if (filtros.hasta) {
        cond.push("t.TrasladoFecha <= ?");
        params.push(`${filtros.hasta} 23:59:59`);
      }
      const where = `WHERE ${cond.join(" AND ")}`;

      db.query(
        `SELECT COUNT(*) AS total FROM traslado t ${where}`,
        params,
        (err, countRows) => {
          if (err) return reject(err);
          const total = Number(countRows[0]?.total) || 0;
          db.query(
            `SELECT ${CAB_COLS},
                    (SELECT COUNT(*) FROM trasladoproducto tp
                      WHERE tp.TrasladoId = t.TrasladoId) AS TrasladoCantidadProductos
             ${CAB_JOINS} ${where}
             ORDER BY t.TrasladoFecha DESC, t.TrasladoId DESC
             LIMIT ? OFFSET ?`,
            [...params, limit, offset],
            (err2, rows) => {
              if (err2) return reject(err2);
              resolve({ traslados: rows, total });
            }
          );
        }
      );
    });
  },

  getById: (id, empresaId) => {
    return new Promise((resolve, reject) => {
      db.query(
        `SELECT ${CAB_COLS} ${CAB_JOINS}
          WHERE t.TrasladoId = ?
            AND (t.EmpresaOrigenId = ? OR t.EmpresaDestinoId = ?)`,
        [id, empresaId, empresaId],
        (err, rows) => {
          if (err) return reject(err);
          if (!rows.length) return resolve(null);
          const cab = rows[0];
          db.query(
            `SELECT tp.TrasladoId, tp.TrasladoProductoId,
                    tp.ProductoOrigenId, tp.ProductoDestinoId,
                    tp.TrasladoCantidadCaja, tp.TrasladoCantidadUnidad,
                    tp.TrasladoUnidadesOrigen, tp.TrasladoUnidadesDestino,
                    tp.TrasladoFactorCaja, tp.TrasladoCcOrigen, tp.TrasladoCcDestino,
                    tp.TrasladoCostoCajaOrigen,
                    po.ProductoNombre AS ProductoOrigenNombre,
                    pd.ProductoNombre AS ProductoDestinoNombre
               FROM trasladoproducto tp
               LEFT JOIN producto po ON po.ProductoId = tp.ProductoOrigenId
               LEFT JOIN producto pd ON pd.ProductoId = tp.ProductoDestinoId
              WHERE tp.TrasladoId = ?
              ORDER BY tp.TrasladoProductoId`,
            [id],
            (err2, det) => {
              if (err2) return reject(err2);
              cab.productos = det || [];
              resolve(cab);
            }
          );
        }
      );
    });
  },

  // TODOS los almacenes, de todas las empresas, con su local y empresa.
  //
  // La pantalla de traslados es la única que necesita ver más allá de la
  // empresa activa: elegir origen y destino ES cruzar empresas. El resto del
  // sistema usa /api/almacen, que sí está scopeado.
  getAlmacenesParaTraslado: () => {
    return new Promise((resolve, reject) => {
      db.query(
        `SELECT a.AlmacenId, a.AlmacenNombre, a.LocalId, a.EmpresaId,
                l.LocalNombre, e.EmpresaNombre, e.EmpresaTipo
           FROM almacen a
           LEFT JOIN local l   ON l.LocalId   = a.LocalId
           LEFT JOIN empresa e ON e.EmpresaId = a.EmpresaId
          WHERE e.EmpresaEstado = 'A'
          ORDER BY e.EmpresaNombre, a.AlmacenNombre`,
        [],
        (err, rows) => (err ? reject(err) : resolve(rows))
      );
    });
  },

  // Productos que se pueden SACAR de un almacén.
  //
  // Se devuelve todo junto (y no reusando /api/productos) porque el combobox
  // necesita las tres cosas a la vez: nombre, stock en ESE almacén y si el
  // producto se puede trasladar al destino elegido. Con el endpoint genérico
  // harían falta N+1 llamadas.
  //
  // Devuelve TODO el catálogo activo de la empresa del almacén, con el stock
  // que cada producto tiene en ese depósito (0 si no tiene fila) y su
  // equivalencia hacia el destino elegido.
  //
  // El stock NO se usa como filtro a propósito. Filtrar por `stock > 0` dejaba
  // fuera 386 de los 752 productos activos de la distribuidora, y el buscador
  // respondía "Sin resultados" sin manera de distinguir "no existe" de "no hay
  // stock" -- que es justo lo que el usuario necesita saber. La pantalla los
  // muestra marcados y no deja agregarlos; el backend igual rechaza por stock
  // insuficiente al confirmar.
  //
  // El WHERE por empresa del almacén (en vez del JOIN contra productoalmacen
  // que había antes) también deja fuera las filas cruzadas de productoalmacen
  // que arrastra la base -- productos de una empresa con stock en el almacén
  // de la otra.
  //
  // Se pide una fila de más que el límite para poder avisar si la lista quedó
  // cortada, en lugar de truncar en silencio.
  getProductosDeAlmacen: ({ almacenId, empresaDestinoId, busqueda = "", limit = 1000 }) => {
    return new Promise((resolve, reject) => {
      // El orden de los parámetros sigue el orden de aparición de los `?`.
      const params = [almacenId];

      let equivSelect = `NULL AS ProductoDestinoId, NULL AS ProductoDestinoNombre,
                         NULL AS FactorCaja, NULL AS ProductoDestinoCantidadCaja`;
      let equivJoin = "";
      if (empresaDestinoId) {
        equivSelect = `eq.ProductoDestinoId, pd.ProductoNombre AS ProductoDestinoNombre,
                       eq.FactorCaja, pd.ProductoCantidadCaja AS ProductoDestinoCantidadCaja`;
        equivJoin = `
          LEFT JOIN producto_equivalencia eq
                 ON eq.ProductoOrigenId = p.ProductoId AND eq.EmpresaDestinoId = ?
          LEFT JOIN producto pd ON pd.ProductoId = eq.ProductoDestinoId`;
        params.push(empresaDestinoId);
      }
      params.push(almacenId);

      let filtro = "";
      if (busqueda) {
        filtro = " AND (p.ProductoNombre LIKE ? OR CAST(p.ProductoCodigo AS CHAR) LIKE ?)";
        params.push(`%${busqueda}%`, `%${busqueda}%`);
      }
      params.push(limit + 1);

      db.query(
        `SELECT p.ProductoId, p.ProductoCodigo, p.ProductoNombre,
                p.ProductoCantidadCaja, p.ProductoPrecioPromedio, p.EmpresaId,
                COALESCE(pa.ProductoAlmacenStock, 0)         AS ProductoAlmacenStock,
                COALESCE(pa.ProductoAlmacenStockUnitario, 0) AS ProductoAlmacenStockUnitario,
                ${equivSelect}
           FROM producto p
           LEFT JOIN productoalmacen pa
                  ON pa.ProductoId = p.ProductoId AND pa.AlmacenId = ?
           ${equivJoin}
          WHERE p.EmpresaId = (SELECT EmpresaId FROM almacen WHERE AlmacenId = ?)
            AND p.ProductoEstado = 'A'
            ${filtro}
          ORDER BY (COALESCE(pa.ProductoAlmacenStock, 0) > 0
                 OR COALESCE(pa.ProductoAlmacenStockUnitario, 0) > 0) DESC,
                   p.ProductoNombre
          LIMIT ?`,
        params,
        (err, rows) => {
          if (err) return reject(err);
          resolve({ productos: rows.slice(0, limit), truncado: rows.length > limit });
        }
      );
    });
  },

  // Productos de un catálogo (empresa), sin depender de un almacén.
  //
  // La pantalla de equivalencias trabaja a nivel EMPRESA, no de almacén: un
  // vínculo entre catálogos vale para todos los almacenes de esas empresas.
  // `soloSinEquivalencia` sirve para listar exactamente lo que falta mapear.
  getProductosDeEmpresa: ({
    empresaId,
    empresaDestinoId = null,
    busqueda = "",
    soloSinEquivalencia = false,
    limit = 1000,
  }) => {
    return new Promise((resolve, reject) => {
      const params = [];
      let equivJoin = "";
      let equivCond = "";
      if (empresaDestinoId) {
        equivJoin = `
          LEFT JOIN producto_equivalencia eq
                 ON eq.ProductoOrigenId = p.ProductoId AND eq.EmpresaDestinoId = ?`;
        params.push(empresaDestinoId);
        if (soloSinEquivalencia) equivCond = " AND eq.ProductoOrigenId IS NULL";
      }
      params.push(empresaId);

      let filtro = "";
      if (busqueda) {
        filtro = " AND (p.ProductoNombre LIKE ? OR CAST(p.ProductoCodigo AS CHAR) LIKE ?)";
        params.push(`%${busqueda}%`, `%${busqueda}%`);
      }
      // Una fila de más para poder avisar si la lista quedó cortada.
      params.push(limit + 1);

      db.query(
        `SELECT p.ProductoId, p.ProductoCodigo, p.ProductoNombre,
                p.ProductoCantidadCaja, p.ProductoPrecioPromedio, p.EmpresaId,
                0 AS ProductoAlmacenStock, 0 AS ProductoAlmacenStockUnitario,
                ${empresaDestinoId ? "eq.ProductoDestinoId" : "NULL AS ProductoDestinoId"}
           FROM producto p
           ${equivJoin}
          WHERE p.EmpresaId = ?
            AND p.ProductoEstado = 'A'
            ${equivCond}
            ${filtro}
          ORDER BY p.ProductoNombre
          LIMIT ?`,
        params,
        (err, rows) => {
          if (err) return reject(err);
          resolve({ productos: rows.slice(0, limit), truncado: rows.length > limit });
        }
      );
    });
  },

  // Resuelve a qué producto del catálogo destino corresponde uno del origen.
  //
  // Dentro de la MISMA empresa el catálogo es compartido, así que la respuesta
  // es la identidad y no hace falta ninguna fila en producto_equivalencia
  // (si no, habría que sembrar ~1.700 filas de un producto contra sí mismo).
  resolverDestino: (productoOrigenId, empresaDestinoId) => {
    return new Promise((resolve, reject) => {
      db.query(
        `SELECT p.ProductoId, p.EmpresaId, p.ProductoNombre,
                p.ProductoCantidadCaja, p.ProductoPrecioPromedio, p.ProductoEstado
           FROM producto p WHERE p.ProductoId = ?`,
        [productoOrigenId],
        (err, rows) => {
          if (err) return reject(err);
          const origen = rows[0];
          if (!origen) return resolve(null);

          if (Number(origen.EmpresaId) === Number(empresaDestinoId)) {
            return resolve({
              ProductoDestinoId: origen.ProductoId,
              ProductoDestinoNombre: origen.ProductoNombre,
              ProductoDestinoCantidadCaja: origen.ProductoCantidadCaja,
              ProductoDestinoEstado: origen.ProductoEstado,
              FactorCaja: 1,
              EquivalenciaConfianza: "A",
              EsIdentidad: true,
            });
          }

          db.query(
            `SELECT e.ProductoDestinoId, e.FactorCaja, e.EquivalenciaConfianza,
                    e.EquivalenciaOrigen,
                    pd.ProductoNombre        AS ProductoDestinoNombre,
                    pd.ProductoCantidadCaja  AS ProductoDestinoCantidadCaja,
                    pd.ProductoEstado        AS ProductoDestinoEstado
               FROM producto_equivalencia e
               JOIN producto pd ON pd.ProductoId = e.ProductoDestinoId
              WHERE e.ProductoOrigenId = ? AND e.EmpresaDestinoId = ?`,
            [productoOrigenId, empresaDestinoId],
            (err2, eq) => {
              if (err2) return reject(err2);
              if (!eq.length) return resolve(null);
              resolve({ ...eq[0], EsIdentidad: false });
            }
          );
        }
      );
    });
  },

  // Alta/edición de una equivalencia. Escribe SIEMPRE los dos sentidos con
  // factores recíprocos: si 1 caja mayorista = 2 cajas minoristas, entonces
  // 1 caja minorista = 0,5 cajas mayoristas. Sin esto, las devoluciones
  // minorista -> mayorista quedarían sin resolver.
  upsertEquivalencia: async ({
    ProductoOrigenId,
    ProductoDestinoId,
    FactorCaja = 1,
    UsuarioId = null,
  }) => {
    const q = (sql, params) =>
      new Promise((res, rej) => db.query(sql, params, (e, r) => (e ? rej(e) : res(r))));

    const factor = Number(FactorCaja);
    if (!Number.isFinite(factor) || factor <= 0) {
      throw { message: "El factor debe ser un número mayor a cero" };
    }
    if (Number(ProductoOrigenId) === Number(ProductoDestinoId)) {
      throw { message: "El producto origen y el destino no pueden ser el mismo" };
    }

    // uq_equivalencia_destino impide que un producto tenga DOS equivalentes en
    // la misma empresa destino. Sin este chequeo previo el usuario recibe el
    // error crudo del constraint, que sendError oculta tras un genérico.
    const choque = await q(
      `SELECT pd.ProductoId, pd.ProductoNombre
         FROM producto_equivalencia e
         JOIN producto pd ON pd.ProductoId = e.ProductoDestinoId
        WHERE e.ProductoOrigenId = ?
          AND e.EmpresaDestinoId = (SELECT EmpresaId FROM producto WHERE ProductoId = ?)
          AND e.ProductoDestinoId <> ?`,
      [ProductoOrigenId, ProductoDestinoId, ProductoDestinoId]
    );
    if (choque.length) {
      throw {
        message:
          `Este producto ya está vinculado a "${choque[0].ProductoNombre}" en el ` +
          `catálogo destino. Quitá esa equivalencia antes de crear otra.`,
      };
    }

    // EmpresaDestinoId lo completa el trigger equivalencia_hereda_empresa.
    const sql = `
      INSERT INTO producto_equivalencia
        (ProductoOrigenId, ProductoDestinoId, EmpresaDestinoId,
         FactorCaja, EquivalenciaConfianza, EquivalenciaOrigen,
         EquivalenciaFecha, UsuarioId)
      VALUES (?, ?, 0, ?, 'A', 'M', now(), ?)
      ON CONFLICT (ProductoOrigenId, ProductoDestinoId) DO UPDATE
        SET FactorCaja = EXCLUDED.FactorCaja,
            EquivalenciaConfianza = 'A',
            EquivalenciaOrigen = 'M',
            EquivalenciaFecha = now(),
            UsuarioId = EXCLUDED.UsuarioId`;

    await q(sql, [ProductoOrigenId, ProductoDestinoId, factor, UsuarioId]);
    await q(sql, [ProductoDestinoId, ProductoOrigenId, reciproco(factor), UsuarioId]);

    return { ProductoOrigenId, ProductoDestinoId, FactorCaja: factor };
  },

  eliminarEquivalencia: (productoOrigenId, productoDestinoId) => {
    return new Promise((resolve, reject) => {
      db.query(
        `DELETE FROM producto_equivalencia
          WHERE (ProductoOrigenId = ? AND ProductoDestinoId = ?)
             OR (ProductoOrigenId = ? AND ProductoDestinoId = ?)`,
        [productoOrigenId, productoDestinoId, productoDestinoId, productoOrigenId],
        (err, result) => {
          if (err) return reject(err);
          resolve(result.affectedRows || 0);
        }
      );
    });
  },

  // Listado de equivalencias de una empresa hacia otra, para la pantalla de
  // mantenimiento. `soloRevisar` filtra las 14 sembradas con confianza baja.
  getEquivalencias: ({
    empresaOrigenId,
    empresaDestinoId,
    busqueda = "",
    soloRevisar = false,
    limit = 50,
    offset = 0,
  }) => {
    return new Promise((resolve, reject) => {
      const cond = ["po.EmpresaId = ?", "e.EmpresaDestinoId = ?"];
      const params = [empresaOrigenId, empresaDestinoId];
      if (busqueda) {
        cond.push("(po.ProductoNombre LIKE ? OR pd.ProductoNombre LIKE ?)");
        params.push(`%${busqueda}%`, `%${busqueda}%`);
      }
      if (soloRevisar) cond.push("e.EquivalenciaConfianza = 'R'");
      const where = `WHERE ${cond.join(" AND ")}`;
      const joins = `
        FROM producto_equivalencia e
        JOIN producto po ON po.ProductoId = e.ProductoOrigenId
        JOIN producto pd ON pd.ProductoId = e.ProductoDestinoId`;

      db.query(`SELECT COUNT(*) AS total ${joins} ${where}`, params, (err, c) => {
        if (err) return reject(err);
        const total = Number(c[0]?.total) || 0;
        db.query(
          `SELECT e.ProductoOrigenId, e.ProductoDestinoId, e.FactorCaja,
                  e.EquivalenciaConfianza, e.EquivalenciaOrigen, e.EquivalenciaFecha,
                  po.ProductoNombre           AS ProductoOrigenNombre,
                  po.ProductoCantidadCaja     AS ProductoCantidadCaja,
                  po.ProductoPrecioPromedio   AS ProductoPrecioPromedio,
                  pd.ProductoNombre           AS ProductoDestinoNombre,
                  pd.ProductoCantidadCaja     AS ProductoDestinoCantidadCaja,
                  pd.ProductoPrecioPromedio   AS ProductoDestinoPrecioPromedio,
                  pd.ProductoEstado           AS ProductoDestinoEstado
           ${joins} ${where}
           ORDER BY e.EquivalenciaConfianza DESC, po.ProductoNombre
           LIMIT ? OFFSET ?`,
          [...params, limit, offset],
          (err2, rows) => {
            if (err2) return reject(err2);
            resolve({ equivalencias: rows, total });
          }
        );
      });
    });
  },
};

module.exports = Traslado;
