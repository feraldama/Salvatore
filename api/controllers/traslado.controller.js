const Traslado = require("../models/traslado.model");
const { sendError } = require("../utils/errors");
const db = require("../config/db");
const {
  aUnidades,
  aCajas,
  convertir,
  promedioDestino,
  costoUnitarioOrigen,
} = require("../utils/trasladoStock");

// pg devuelve NUMERIC como string (solo BIGINT tiene parser propio en db.js),
// así que ProductoPrecioPromedio y FactorCaja llegan como "75425.51" / "1.000000".
const num = (v) => Number(v) || 0;

// Un traslado cruza empresas, así que NO puede confiar en req.empresaId: los
// dos almacenes vienen explícitos en el body y se validan acá.
//
// Regla: un admin mueve stock entre cualquier par de almacenes; un usuario
// regular solo puede SACAR del almacén de su propio local (hacia donde sea —
// está sacando de su depósito, que es lo que tiene autorizado).
async function verificarPermisoOrigen(req, conn, almacenOrigenId) {
  if (req.user?.isAdmin === "S") return;
  const localId = Number(req.user?.LocalId) || 0;
  if (!localId) {
    throw { message: "Tu usuario no tiene un local asignado para trasladar stock" };
  }
  const [rows] = await conn.query(
    "SELECT AlmacenId FROM almacen WHERE LocalId = ? LIMIT 1",
    [localId]
  );
  if (!rows.length || Number(rows[0].AlmacenId) !== Number(almacenOrigenId)) {
    throw {
      message: "Solo podés trasladar stock desde el almacén de tu propio local",
    };
  }
}

exports.getAll = async (req, res) => {
  const limit = parseInt(req.query.limit, 10) || 10;
  const page = parseInt(req.query.page, 10) || 1;
  try {
    const { traslados, total } = await Traslado.getAllPaginated(
      req.empresaId,
      {
        almacenOrigenId: req.query.almacenOrigenId,
        almacenDestinoId: req.query.almacenDestinoId,
        estado: req.query.estado,
        desde: req.query.desde,
        hasta: req.query.hasta,
      },
      limit,
      (page - 1) * limit
    );
    res.json({
      data: traslados,
      pagination: {
        totalItems: total,
        totalPages: Math.ceil(total / limit),
        currentPage: page,
        itemsPerPage: limit,
      },
    });
  } catch (error) {
    sendError(res, error, 500);
  }
};

exports.getById = async (req, res) => {
  try {
    const traslado = await Traslado.getById(req.params.id, req.empresaId);
    if (!traslado) return res.status(404).json({ message: "Traslado no encontrado" });
    res.json(traslado);
  } catch (error) {
    sendError(res, error, 500);
  }
};

// Almacenes de TODAS las empresas: la pantalla de traslados necesita elegir
// origen y destino cruzando empresas, cosa que /api/almacen no permite porque
// está scopeado a la empresa activa.
exports.getAlmacenes = async (req, res) => {
  try {
    res.json({ data: await Traslado.getAlmacenesParaTraslado() });
  } catch (error) {
    sendError(res, error, 500);
  }
};

// Productos con stock en un almacén, ya con su equivalencia hacia el destino
// resuelta. Alimenta el combobox de producto de la pantalla.
exports.getProductos = async (req, res) => {
  try {
    const almacenId = Number(req.query.almacenId);
    if (!almacenId) return res.status(400).json({ message: "Falta almacenId" });

    let empresaDestinoId = Number(req.query.empresaDestinoId) || null;
    if (!empresaDestinoId && req.query.almacenDestinoId) {
      const [rows] = await db
        .promise()
        .query("SELECT EmpresaId FROM almacen WHERE AlmacenId = ?", [
          Number(req.query.almacenDestinoId),
        ]);
      empresaDestinoId = rows.length ? Number(rows[0].EmpresaId) : null;
    }

    // `truncado` viaja al front para poder avisar que la lista quedó cortada.
    // Truncar en silencio es lo que hacía que un producto existente pareciera
    // no existir, que es el peor modo de fallar para un buscador.
    const { productos, truncado } = await Traslado.getProductosDeAlmacen({
      almacenId,
      empresaDestinoId,
      busqueda: req.query.q || "",
      limit: Math.min(parseInt(req.query.limit, 10) || 1000, 3000),
    });
    res.json({ data: productos, truncado });
  } catch (error) {
    sendError(res, error, 500);
  }
};

// Productos de un catálogo completo (por empresa, sin almacén). Lo usa la
// pantalla de equivalencias, que trabaja entre catálogos y no entre depósitos.
exports.getProductosEmpresa = async (req, res) => {
  try {
    const empresaId = Number(req.query.empresaId);
    if (!empresaId) return res.status(400).json({ message: "Falta empresaId" });
    const { productos, truncado } = await Traslado.getProductosDeEmpresa({
      empresaId,
      empresaDestinoId: Number(req.query.empresaDestinoId) || null,
      busqueda: req.query.q || "",
      soloSinEquivalencia: req.query.soloSinEquivalencia === "true",
      limit: Math.min(parseInt(req.query.limit, 10) || 1000, 3000),
    });
    res.json({ data: productos, truncado });
  } catch (error) {
    sendError(res, error, 500);
  }
};

// Vista previa de una línea: qué producto destino resuelve, cuánto stock hay
// en el origen y en cuántas cajas/unidades entra al destino. La pantalla la
// usa para mostrar "5 cajas (60 un.) -> 5 cajas de 12" ANTES de confirmar.
exports.resolver = async (req, res) => {
  try {
    const productoOrigenId = Number(req.query.productoOrigenId);
    const almacenOrigenId = Number(req.query.almacenOrigenId);
    const almacenDestinoId = Number(req.query.almacenDestinoId);
    if (!productoOrigenId || !almacenOrigenId || !almacenDestinoId) {
      return res.status(400).json({
        message: "Faltan productoOrigenId, almacenOrigenId o almacenDestinoId",
      });
    }

    const [almacenes] = await db
      .promise()
      .query("SELECT AlmacenId, AlmacenNombre, EmpresaId FROM almacen WHERE AlmacenId IN (?, ?)",
        [almacenOrigenId, almacenDestinoId]);
    const destino = almacenes.find((a) => Number(a.AlmacenId) === almacenDestinoId);
    if (!destino) return res.status(404).json({ message: "Almacén destino no encontrado" });

    const eq = await Traslado.resolverDestino(productoOrigenId, destino.EmpresaId);

    const [prodRows] = await db.promise().query(
      `SELECT p.ProductoId, p.ProductoNombre, p.ProductoCantidadCaja,
              p.ProductoPrecioPromedio, p.EmpresaId,
              COALESCE(pa.ProductoAlmacenStock, 0)         AS ProductoAlmacenStock,
              COALESCE(pa.ProductoAlmacenStockUnitario, 0) AS ProductoAlmacenStockUnitario
         FROM producto p
         LEFT JOIN productoalmacen pa
           ON pa.ProductoId = p.ProductoId AND pa.AlmacenId = ?
        WHERE p.ProductoId = ?`,
      [almacenOrigenId, productoOrigenId]
    );
    if (!prodRows.length) return res.status(404).json({ message: "Producto no encontrado" });
    const origen = prodRows[0];
    const ccOrigen = Math.max(1, Number(origen.ProductoCantidadCaja) || 1);
    const disponibleUnidades = aUnidades(
      origen.ProductoAlmacenStock,
      origen.ProductoAlmacenStockUnitario,
      ccOrigen
    );

    const respuesta = {
      ProductoOrigenId: origen.ProductoId,
      ProductoOrigenNombre: origen.ProductoNombre,
      ProductoCcOrigen: ccOrigen,
      DisponibleCajas: aCajas(disponibleUnidades, ccOrigen).cajas,
      DisponibleUnidades: disponibleUnidades,
      Equivalencia: eq,
    };

    // Si además vino una cantidad, se devuelve la conversión ya calculada.
    const cajas = Number(req.query.cajas) || 0;
    const unidades = Number(req.query.unidades) || 0;
    if (eq && (cajas > 0 || unidades > 0)) {
      const ccDestino = Math.max(1, Number(eq.ProductoDestinoCantidadCaja) || 1);
      try {
        const conv = convertir({
          cajasOrigen: cajas,
          sueltasOrigen: unidades,
          ccOrigen,
          ccDestino,
          factorCaja: num(eq.FactorCaja),
        });
        respuesta.Conversion = {
          ...conv,
          CcDestino: ccDestino,
          ...aCajas(conv.unidadesDestino, ccDestino),
          Suficiente: conv.unidadesOrigen <= disponibleUnidades,
        };
      } catch (e) {
        respuesta.Conversion = { Error: e.message };
      }
    }

    res.json(respuesta);
  } catch (error) {
    sendError(res, error, 500);
  }
};

// Confirma un traslado de forma atómica: cabecera + líneas + stock por almacén
// + stock global + promedio del destino. Todo o nada.
//
// NO toca ventas, compras ni caja: un traslado mueve inventario, no plata.
// Si el cliente confirma que Distribuidora y Bodega se facturan entre sí,
// eso se suma después como documentos aparte, sin cambiar esto.
exports.crear = async (req, res) => {
  const {
    AlmacenOrigenId,
    AlmacenDestinoId,
    TrasladoObs = "",
    Productos = [],
  } = req.body || {};

  const almOrigen = Number(AlmacenOrigenId);
  const almDestino = Number(AlmacenDestinoId);
  if (!almOrigen || !almDestino) {
    return res.status(400).json({ message: "Faltan el almacén origen y/o destino" });
  }
  if (almOrigen === almDestino) {
    return res.status(400).json({ message: "El almacén origen y el destino deben ser distintos" });
  }
  if (!Array.isArray(Productos) || Productos.length === 0) {
    return res.status(400).json({ message: "Se requiere al menos un producto" });
  }
  const ids = Productos.map((p) => Number(p.ProductoOrigenId));
  if (ids.some((id) => !id)) {
    return res.status(400).json({ message: "Hay líneas sin ProductoOrigenId" });
  }
  if (new Set(ids).size !== ids.length) {
    return res.status(400).json({
      message: "Hay un producto repetido en el detalle; juntalo en una sola línea",
    });
  }

  // Se procesa ordenado por ProductoId para que dos traslados simultáneos
  // tomen los locks en el mismo orden y no se traben entre sí.
  const lineas = [...Productos].sort(
    (a, b) => Number(a.ProductoOrigenId) - Number(b.ProductoOrigenId)
  );

  const usuarioId = req.user?.id || null;
  const conn = await db.promise().getConnection();
  try {
    await conn.beginTransaction();

    const [almacenes] = await conn.query(
      "SELECT AlmacenId, AlmacenNombre, EmpresaId FROM almacen WHERE AlmacenId IN (?, ?)",
      [almOrigen, almDestino]
    );
    const aOrigen = almacenes.find((a) => Number(a.AlmacenId) === almOrigen);
    const aDestino = almacenes.find((a) => Number(a.AlmacenId) === almDestino);
    if (!aOrigen) throw { message: "El almacén origen no existe" };
    if (!aDestino) throw { message: "El almacén destino no existe" };

    await verificarPermisoOrigen(req, conn, almOrigen);

    const [cab] = await conn.query(
      `INSERT INTO traslado (AlmacenOrigenId, AlmacenDestinoId, TrasladoEstado,
                             TrasladoObs, UsuarioId)
       VALUES (?, ?, 'C', ?, ?)`,
      [almOrigen, almDestino, String(TrasladoObs).slice(0, 255), usuarioId]
    );
    const trasladoId = cab.insertId;

    let nroLinea = 0;
    const resumen = [];

    for (const linea of lineas) {
      nroLinea += 1;
      const productoOrigenId = Number(linea.ProductoOrigenId);
      const cajas = Number(linea.CantidadCaja) || 0;
      const sueltas = Number(linea.CantidadUnidad) || 0;

      // ── Producto origen (bloqueado para el update del stock global) ──
      const [poRows] = await conn.query(
        `SELECT ProductoId, ProductoNombre, ProductoCantidadCaja, ProductoEstado,
                ProductoStock, ProductoStockUnitario, ProductoPrecioPromedio, EmpresaId
           FROM producto WHERE ProductoId = ? FOR UPDATE`,
        [productoOrigenId]
      );
      if (!poRows.length) throw { message: `El producto ${productoOrigenId} no existe` };
      const pOrigen = poRows[0];
      if (Number(pOrigen.EmpresaId) !== Number(aOrigen.EmpresaId)) {
        throw {
          message: `"${pOrigen.ProductoNombre}" no pertenece al catálogo del almacén origen`,
        };
      }
      const ccOrigen = Math.max(1, Number(pOrigen.ProductoCantidadCaja) || 1);

      // ── Producto destino vía equivalencia (o identidad en misma empresa) ──
      const eq = await Traslado.resolverDestino(productoOrigenId, aDestino.EmpresaId);
      if (!eq) {
        throw {
          message:
            `"${pOrigen.ProductoNombre}" no tiene equivalencia cargada en el ` +
            `catálogo de ${aDestino.AlmacenNombre}. Vinculalo antes de trasladarlo.`,
        };
      }
      if (eq.ProductoDestinoEstado === "I") {
        throw {
          message: `El producto destino "${eq.ProductoDestinoNombre}" está inactivo`,
        };
      }
      const productoDestinoId = Number(eq.ProductoDestinoId);
      const ccDestino = Math.max(1, Number(eq.ProductoDestinoCantidadCaja) || 1);
      const factorCaja = num(eq.FactorCaja) || 1;

      const { unidadesOrigen, unidadesDestino } = convertir({
        cajasOrigen: cajas,
        sueltasOrigen: sueltas,
        ccOrigen,
        ccDestino,
        factorCaja,
      });

      // ── Stock del ORIGEN por almacén (bloqueado) ──
      const [paOrigen] = await conn.query(
        `SELECT ProductoAlmacenStock, ProductoAlmacenStockUnitario
           FROM productoalmacen
          WHERE ProductoId = ? AND AlmacenId = ? FOR UPDATE`,
        [productoOrigenId, almOrigen]
      );
      if (!paOrigen.length) {
        throw {
          message: `"${pOrigen.ProductoNombre}" no tiene stock en ${aOrigen.AlmacenNombre}`,
        };
      }
      const dispUnidades = aUnidades(
        paOrigen[0].ProductoAlmacenStock,
        paOrigen[0].ProductoAlmacenStockUnitario,
        ccOrigen
      );
      if (dispUnidades < unidadesOrigen) {
        throw {
          message:
            `Stock insuficiente de "${pOrigen.ProductoNombre}" en ` +
            `${aOrigen.AlmacenNombre}: hay ${dispUnidades} y se piden ${unidadesOrigen} unidades`,
        };
      }

      const nuevoOrigen = aCajas(dispUnidades - unidadesOrigen, ccOrigen);
      await conn.query(
        `UPDATE productoalmacen
            SET ProductoAlmacenStock = ?, ProductoAlmacenStockUnitario = ?
          WHERE ProductoId = ? AND AlmacenId = ?`,
        [nuevoOrigen.cajas, nuevoOrigen.sueltas, productoOrigenId, almOrigen]
      );

      // Stock global del producto origen. Se ajusta por DELTA (no se recalcula
      // como SUM por almacén) para no "corregir" de paso las divergencias que
      // ya trae la base: eso sería modificar datos históricos.
      const globalOrigen = aCajas(
        aUnidades(pOrigen.ProductoStock, pOrigen.ProductoStockUnitario, ccOrigen) -
          unidadesOrigen,
        ccOrigen
      );
      await conn.query(
        `UPDATE producto SET ProductoStock = ?, ProductoStockUnitario = ?
          WHERE ProductoId = ?`,
        [globalOrigen.cajas, globalOrigen.sueltas, productoOrigenId]
      );

      // ── Producto destino (bloqueado) ──
      const [pdRows] = await conn.query(
        `SELECT ProductoId, ProductoNombre, ProductoStock, ProductoStockUnitario,
                ProductoPrecioPromedio, EmpresaId
           FROM producto WHERE ProductoId = ? FOR UPDATE`,
        [productoDestinoId]
      );
      if (!pdRows.length) throw { message: "El producto destino no existe" };
      const pDestino = pdRows[0];
      if (Number(pDestino.EmpresaId) !== Number(aDestino.EmpresaId)) {
        throw {
          message: `"${pDestino.ProductoNombre}" no pertenece al catálogo del almacén destino`,
        };
      }

      // ── Stock del DESTINO por almacén (upsert: puede no existir la fila) ──
      const [paDestino] = await conn.query(
        `SELECT ProductoAlmacenStock, ProductoAlmacenStockUnitario
           FROM productoalmacen
          WHERE ProductoId = ? AND AlmacenId = ? FOR UPDATE`,
        [productoDestinoId, almDestino]
      );
      const destinoActual = paDestino.length
        ? aUnidades(
            paDestino[0].ProductoAlmacenStock,
            paDestino[0].ProductoAlmacenStockUnitario,
            ccDestino
          )
        : 0;
      const nuevoDestino = aCajas(destinoActual + unidadesDestino, ccDestino);
      await conn.query(
        `INSERT INTO productoalmacen
           (ProductoId, AlmacenId, ProductoAlmacenStock, ProductoAlmacenStockUnitario)
         VALUES (?, ?, ?, ?)
         ON CONFLICT (ProductoId, AlmacenId) DO UPDATE
           SET ProductoAlmacenStock = EXCLUDED.ProductoAlmacenStock,
               ProductoAlmacenStockUnitario = EXCLUDED.ProductoAlmacenStockUnitario`,
        [productoDestinoId, almDestino, nuevoDestino.cajas, nuevoDestino.sueltas]
      );

      // ── Stock global + promedio ponderado del destino ──
      const globalDestinoUnidades = aUnidades(
        pDestino.ProductoStock,
        pDestino.ProductoStockUnitario,
        ccDestino
      );
      const globalDestino = aCajas(globalDestinoUnidades + unidadesDestino, ccDestino);
      const costoCajaOrigen = num(pOrigen.ProductoPrecioPromedio);
      const costoUnitEntrante =
        (costoUnitarioOrigen(costoCajaOrigen, ccOrigen) * unidadesOrigen) /
        unidadesDestino;
      const nuevoPromedio = promedioDestino({
        unidadesActuales: globalDestinoUnidades,
        promedioActualPorCaja: num(pDestino.ProductoPrecioPromedio),
        unidadesEntrantes: unidadesDestino,
        costoUnitarioEntrante: costoUnitEntrante,
        ccDestino,
      });
      await conn.query(
        `UPDATE producto
            SET ProductoStock = ?, ProductoStockUnitario = ?, ProductoPrecioPromedio = ?
          WHERE ProductoId = ?`,
        [globalDestino.cajas, globalDestino.sueltas, nuevoPromedio, productoDestinoId]
      );

      // ── Línea del detalle, con Cc/Factor/Costo congelados ──
      await conn.query(
        `INSERT INTO trasladoproducto (
           TrasladoId, TrasladoProductoId, ProductoOrigenId, ProductoDestinoId,
           TrasladoCantidadCaja, TrasladoCantidadUnidad,
           TrasladoUnidadesOrigen, TrasladoUnidadesDestino,
           TrasladoFactorCaja, TrasladoCcOrigen, TrasladoCcDestino,
           TrasladoCostoCajaOrigen
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          trasladoId,
          nroLinea,
          productoOrigenId,
          productoDestinoId,
          cajas,
          sueltas,
          unidadesOrigen,
          unidadesDestino,
          factorCaja,
          ccOrigen,
          ccDestino,
          costoCajaOrigen,
        ]
      );

      resumen.push({
        ProductoOrigenNombre: pOrigen.ProductoNombre,
        ProductoDestinoNombre: eq.ProductoDestinoNombre,
        UnidadesOrigen: unidadesOrigen,
        UnidadesDestino: unidadesDestino,
        CajasDestino: nuevoDestino.cajas - aCajas(destinoActual, ccDestino).cajas,
      });
    }

    await conn.commit();
    return res.status(201).json({
      success: true,
      message: "Traslado confirmado",
      data: { TrasladoId: trasladoId, Productos: resumen },
    });
  } catch (err) {
    try {
      await conn.rollback();
    } catch (rbErr) {
      console.error("Rollback falló:", rbErr);
    }
    console.error("Error confirmando traslado:", err);
    return res.status(400).json({
      success: false,
      message: err && err.message ? err.message : "Error confirmando el traslado",
    });
  } finally {
    conn.release();
  }
};

// Anula un traslado devolviendo el stock. NO borra la fila: queda con
// TrasladoEstado='A' para que el movimiento siga siendo auditable.
//
// La reversión usa los valores CONGELADOS en trasladoproducto (unidades, Cc),
// no los actuales del producto: si alguien editó ProductoCantidadCaja después
// del traslado, devolver con el cc nuevo dejaría una cantidad distinta a la
// que se sacó.
//
// El promedio del destino NO se revierte, igual que en las compras: es un
// valor histórico acumulado y recalcularlo hacia atrás distorsionaría el
// costeo de todo lo que pasó en el medio.
exports.anular = async (req, res) => {
  const trasladoId = Number(req.params.id);
  if (!trasladoId) return res.status(400).json({ message: "TrasladoId inválido" });

  const conn = await db.promise().getConnection();
  try {
    await conn.beginTransaction();

    const [cabRows] = await conn.query(
      `SELECT TrasladoId, AlmacenOrigenId, AlmacenDestinoId, TrasladoEstado,
              EmpresaOrigenId, EmpresaDestinoId
         FROM traslado WHERE TrasladoId = ? FOR UPDATE`,
      [trasladoId]
    );
    if (!cabRows.length) throw { message: "Traslado no encontrado" };
    const cab = cabRows[0];
    if (cab.TrasladoEstado === "A") throw { message: "El traslado ya está anulado" };
    if (cab.TrasladoEstado !== "C") {
      throw { message: "Solo se pueden anular traslados confirmados" };
    }
    const empresaId = Number(req.empresaId);
    if (
      Number(cab.EmpresaOrigenId) !== empresaId &&
      Number(cab.EmpresaDestinoId) !== empresaId
    ) {
      throw { message: "El traslado no pertenece a la empresa activa" };
    }
    await verificarPermisoOrigen(req, conn, cab.AlmacenOrigenId);

    const [lineas] = await conn.query(
      `SELECT ProductoOrigenId, ProductoDestinoId, TrasladoUnidadesOrigen,
              TrasladoUnidadesDestino, TrasladoCcOrigen, TrasladoCcDestino
         FROM trasladoproducto WHERE TrasladoId = ?
        ORDER BY ProductoOrigenId`,
      [trasladoId]
    );

    for (const l of lineas) {
      const ccO = Math.max(1, Number(l.TrasladoCcOrigen) || 1);
      const ccD = Math.max(1, Number(l.TrasladoCcDestino) || 1);
      const uO = Number(l.TrasladoUnidadesOrigen) || 0;
      const uD = Number(l.TrasladoUnidadesDestino) || 0;

      // Devolver al origen (por almacén + global).
      const [paO] = await conn.query(
        `SELECT ProductoAlmacenStock, ProductoAlmacenStockUnitario
           FROM productoalmacen WHERE ProductoId = ? AND AlmacenId = ? FOR UPDATE`,
        [l.ProductoOrigenId, cab.AlmacenOrigenId]
      );
      const baseO = paO.length
        ? aUnidades(paO[0].ProductoAlmacenStock, paO[0].ProductoAlmacenStockUnitario, ccO)
        : 0;
      const nuevoO = aCajas(baseO + uO, ccO);
      await conn.query(
        `INSERT INTO productoalmacen
           (ProductoId, AlmacenId, ProductoAlmacenStock, ProductoAlmacenStockUnitario)
         VALUES (?, ?, ?, ?)
         ON CONFLICT (ProductoId, AlmacenId) DO UPDATE
           SET ProductoAlmacenStock = EXCLUDED.ProductoAlmacenStock,
               ProductoAlmacenStockUnitario = EXCLUDED.ProductoAlmacenStockUnitario`,
        [l.ProductoOrigenId, cab.AlmacenOrigenId, nuevoO.cajas, nuevoO.sueltas]
      );

      const [pgO] = await conn.query(
        `SELECT ProductoStock, ProductoStockUnitario FROM producto
          WHERE ProductoId = ? FOR UPDATE`,
        [l.ProductoOrigenId]
      );
      const gO = aCajas(
        aUnidades(pgO[0].ProductoStock, pgO[0].ProductoStockUnitario, ccO) + uO,
        ccO
      );
      await conn.query(
        `UPDATE producto SET ProductoStock = ?, ProductoStockUnitario = ?
          WHERE ProductoId = ?`,
        [gO.cajas, gO.sueltas, l.ProductoOrigenId]
      );

      // Quitar del destino (por almacén + global).
      const [paD] = await conn.query(
        `SELECT ProductoAlmacenStock, ProductoAlmacenStockUnitario
           FROM productoalmacen WHERE ProductoId = ? AND AlmacenId = ? FOR UPDATE`,
        [l.ProductoDestinoId, cab.AlmacenDestinoId]
      );
      const baseD = paD.length
        ? aUnidades(paD[0].ProductoAlmacenStock, paD[0].ProductoAlmacenStockUnitario, ccD)
        : 0;
      const nuevoD = aCajas(baseD - uD, ccD);
      await conn.query(
        `INSERT INTO productoalmacen
           (ProductoId, AlmacenId, ProductoAlmacenStock, ProductoAlmacenStockUnitario)
         VALUES (?, ?, ?, ?)
         ON CONFLICT (ProductoId, AlmacenId) DO UPDATE
           SET ProductoAlmacenStock = EXCLUDED.ProductoAlmacenStock,
               ProductoAlmacenStockUnitario = EXCLUDED.ProductoAlmacenStockUnitario`,
        [l.ProductoDestinoId, cab.AlmacenDestinoId, nuevoD.cajas, nuevoD.sueltas]
      );

      const [pgD] = await conn.query(
        `SELECT ProductoStock, ProductoStockUnitario FROM producto
          WHERE ProductoId = ? FOR UPDATE`,
        [l.ProductoDestinoId]
      );
      const gD = aCajas(
        aUnidades(pgD[0].ProductoStock, pgD[0].ProductoStockUnitario, ccD) - uD,
        ccD
      );
      await conn.query(
        `UPDATE producto SET ProductoStock = ?, ProductoStockUnitario = ?
          WHERE ProductoId = ?`,
        [gD.cajas, gD.sueltas, l.ProductoDestinoId]
      );
    }

    await conn.query(
      `UPDATE traslado
          SET TrasladoEstado = 'A', TrasladoAnuladoFecha = now(),
              TrasladoAnuladoUsuarioId = ?
        WHERE TrasladoId = ?`,
      [req.user?.id || null, trasladoId]
    );

    await conn.commit();
    return res.json({ success: true, message: "Traslado anulado y stock devuelto" });
  } catch (err) {
    try {
      await conn.rollback();
    } catch (rbErr) {
      console.error("Rollback falló:", rbErr);
    }
    console.error("Error anulando traslado:", err);
    return res.status(400).json({
      success: false,
      message: err && err.message ? err.message : "Error anulando el traslado",
    });
  } finally {
    conn.release();
  }
};

// ── Equivalencias ───────────────────────────────────────────────────────────

exports.getEquivalencias = async (req, res) => {
  const limit = parseInt(req.query.limit, 10) || 50;
  const page = parseInt(req.query.page, 10) || 1;
  try {
    const { equivalencias, total } = await Traslado.getEquivalencias({
      empresaOrigenId: Number(req.query.empresaOrigenId) || req.empresaId,
      empresaDestinoId: Number(req.query.empresaDestinoId),
      busqueda: req.query.q || "",
      soloRevisar: req.query.soloRevisar === "true",
      limit,
      offset: (page - 1) * limit,
    });
    res.json({
      data: equivalencias,
      pagination: {
        totalItems: total,
        totalPages: Math.ceil(total / limit),
        currentPage: page,
        itemsPerPage: limit,
      },
    });
  } catch (error) {
    sendError(res, error, 500);
  }
};

exports.upsertEquivalencia = async (req, res) => {
  try {
    const result = await Traslado.upsertEquivalencia({
      ...req.body,
      UsuarioId: req.user?.id || null,
    });
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    sendError(res, error, 400, "No se pudo guardar la equivalencia");
  }
};

exports.eliminarEquivalencia = async (req, res) => {
  try {
    const n = await Traslado.eliminarEquivalencia(
      req.params.origenId,
      req.params.destinoId
    );
    if (!n) return res.status(404).json({ message: "Equivalencia no encontrada" });
    res.json({ success: true, message: "Equivalencia eliminada" });
  } catch (error) {
    sendError(res, error, 500);
  }
};
