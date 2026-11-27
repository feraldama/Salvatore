// Pruebas de repartos (migraciones 035/036/037): modelo, permisos de la API y
// protecciones de ventas.
//
//   node scripts/verificar_repartos.js
//
// SIN RIESGO PARA LOS DATOS: todo corre dentro de UNA transacción que se
// revierte al final (las transacciones internas del modelo pasan a ser
// savepoints). Crea ventas, productos con tipo de caja y repartos sintéticos,
// los usa y los descarta. Se puede correr contra la base real o el servidor.
// Sale con código 1 si alguna prueba falla.
//
// OJO en producción: mientras corre (unos segundos) tiene bloqueadas algunas
// filas de producto y el próximo VentaId; una venta real en ese momento
// espera hasta que termine. Correrlo fuera del horario de atención.
require("dotenv").config();
const assert = require("assert");
const db = require("../config/db");

(async () => {
  const outer = await db.promise().getConnection();
  await outer.query("BEGIN");

  // Todo acceso a la base pasa por la conexión externa: promise API,
  // conexiones "nuevas" (savepoints) y la API de callbacks de los modelos
  // viejos. Así nada escapa de la transacción que se revierte.
  let sp = 0;
  const pe = db.promise();
  pe.getConnection = async () => {
    const name = "sp" + ++sp;
    return {
      query: (s, p) => outer.query(s, p),
      beginTransaction: () => outer.query("SAVEPOINT " + name),
      commit: () => outer.query("RELEASE SAVEPOINT " + name),
      rollback: () => outer.query("ROLLBACK TO SAVEPOINT " + name),
      release: () => {},
    };
  };
  pe.query = (s, p) => outer.query(s, p);
  db.query = (sql, paramsOrCb, maybeCb) => {
    const cb = typeof paramsOrCb === "function" ? paramsOrCb : maybeCb;
    const params = typeof paramsOrCb === "function" ? [] : paramsOrCb || [];
    outer.query(sql, params).then(
      ([r]) => cb && cb(null, r),
      (err) => cb && cb(err)
    );
  };

  const R = require("../models/reparto.model");
  const Venta = require("../models/venta.model");
  const PerfilMenu = require("../models/perfilmenu.model");
  const ventaCtrl = require("../controllers/venta.controller");
  const ventaProductoCtrl = require("../controllers/ventaproducto.controller");
  const repartoRoutes = require("../routes/reparto.routes");

  const q = async (s, p) => (await outer.query(s, p))[0];
  let ok = 0;
  let fallos = 0;
  const t = async (name, fn) => {
    try {
      await fn();
      ok++;
      console.log("  OK    ", name);
    } catch (e) {
      fallos++;
      console.log("  FALLA ", name, "\n        ", e.message);
    }
  };
  const expectErr = async (p, status, re) => {
    try {
      await p;
    } catch (e) {
      assert.strictEqual(e.status, status, JSON.stringify(e) + " " + (e.stack || ""));
      if (re) assert.match(e.message, re);
      return e;
    }
    assert.fail("esperaba error " + status);
  };
  // Respuesta express falsa: guarda status y body.
  const fakeRes = () => {
    const res = {
      statusCode: 200,
      body: undefined,
      status(s) {
        res.statusCode = s;
        return res;
      },
      json(b) {
        res.body = b;
        return res;
      },
    };
    return res;
  };
  // Corre los middlewares de una ruta de /api/repartos (sin el handler final)
  // y dice si dejaron pasar. Prueba el cableado real del router.
  const pasaPermiso = async (method, path, user) => {
    const layer = repartoRoutes.stack.find(
      (l) => l.route && l.route.path === path && l.route.methods[method]
    );
    assert(layer, `ruta ${method} ${path} no existe`);
    const mws = layer.route.stack.slice(0, -1);
    const res = fakeRes();
    for (const mw of mws) {
      let siguio = false;
      await mw.handle({ user, params: {} }, res, () => {
        siguio = true;
      });
      if (!siguio) return { pasa: false, status: res.statusCode };
    }
    return { pasa: true, status: res.statusCode };
  };

  try {
    const EMP = 1;
    const veh = await q("SELECT id FROM flota_vehiculo WHERE activo ORDER BY id LIMIT 2");
    assert(veh.length >= 1, "no hay vehículos activos");
    const v1 = veh[0].id;
    const v2 = (veh[1] || veh[0]).id;
    const prods = await q(
      "SELECT ProductoId AS pid FROM producto WHERE EmpresaId=? ORDER BY ProductoId LIMIT 3",
      [EMP]
    );
    const [pA, pB, pC] = prods.map((p) => p.pid);
    await q("UPDATE producto SET ProductoTipoCaja='COCA' WHERE ProductoId=?", [pA]);
    await q("UPDATE producto SET ProductoTipoCaja='710_ROJO' WHERE ProductoId=?", [pB]);
    await q("UPDATE producto SET ProductoTipoCaja=NULL WHERE ProductoId=?", [pC]);
    const cli = (await q("SELECT ClienteId AS cid FROM clientes LIMIT 1"))[0].cid;
    const alm = (await q("SELECT AlmacenId AS aid FROM almacen LIMIT 1"))[0].aid;
    const mkVenta = async (lines) => {
      const r = await q(
        `INSERT INTO venta (VentaId, VentaFecha, ClienteId, AlmacenId, VentaTipo, Total, EmpresaId, EsEnvio)
         VALUES ((SELECT MAX(VentaId) + 1 FROM venta), CURRENT_DATE, ?, ?, 'CO', 1000, ?, 'S') RETURNING ventaid AS vid`,
        [cli, alm, EMP]
      );
      const id = r[0].vid;
      let i = 1;
      for (const [pid, cant, uni] of lines) {
        await q(
          `INSERT INTO ventaproducto (VentaId, VentaProductoId, ProductoId, VentaProductoCantidad, VentaProductoPrecio, VentaProductoPrecioTotal, VentaProductoUnitario, VentaProductoPrecioPromedio)
           VALUES (?, ?, ?, ?, 1, 1, ?, 0)`,
          [id, i++, pid, cant, uni]
        );
      }
      await q("INSERT INTO venta_envio (venta_id, vehiculo_id) VALUES (?, ?)", [id, v1]);
      return id;
    };
    const ven1 = await mkVenta([[pA, 5, "C"], [pA, 3, "U"], [pC, 2, "C"]]);
    const ven2 = await mkVenta([[pB, 4, "C"], [pA, 1, "C"]]);
    const ven3 = await mkVenta([[pB, 7, "C"]]);

    console.log("Repartos: armado y salida");
    let rid;
    await t("create valida vehículo y chofer", async () => {
      await expectErr(R.create(EMP, {}, "x"), 400, /vehículo/);
      await expectErr(R.create(EMP, { vehiculo_id: 999999 }, "x"), 400, /inexistente/);
      await expectErr(R.create(EMP, { vehiculo_id: v1, chofer_id: "noexiste__" }, "x"), 400, /Chofer/);
      rid = await R.create(EMP, { vehiculo_id: v2, observacion: " obs " }, "admin");
      assert(rid > 0);
    });
    await t("ventas disponibles incluye las sintéticas con sus cajas", async () => {
      const d = await R.ventasDisponibles(EMP, {});
      const m = d.find((x) => x.venta_id === ven1);
      assert(m, "ven1 no está");
      assert.strictEqual(m.cajas, 5);
      assert.strictEqual(d.find((x) => x.venta_id === ven2).cajas, 5);
      const f = await R.ventasDisponibles(EMP, { q: String(ven2) });
      assert(f.some((x) => x.venta_id === ven2));
    });
    await t("salida sin ventas rechazada", async () => {
      await expectErr(R.confirmarSalida(EMP, rid, "rut"), 400, /no tiene ventas/);
    });
    await t("asignar: todo o nada, setea el vehículo del reparto", async () => {
      await expectErr(R.asignarVentas(EMP, rid, []), 400);
      await expectErr(R.asignarVentas(EMP, rid, [ven1, 99999999]), 409);
      assert.strictEqual((await q("SELECT reparto_id FROM venta_envio WHERE venta_id=?", [ven1]))[0].reparto_id, null);
      assert.strictEqual(await R.asignarVentas(EMP, rid, [ven1, ven2, ven3, ven1]), 3);
      const e = await q("SELECT vehiculo_id FROM venta_envio WHERE venta_id=?", [ven1]);
      assert.strictEqual(e[0].vehiculo_id, v2);
      await expectErr(R.asignarVentas(EMP, rid, [ven1]), 409);
    });
    await t("otra empresa no ve el reparto", async () => {
      assert.strictEqual(await R.getById(2, rid), null);
      await expectErr(R.confirmarSalida(2, rid, "x"), 404);
    });
    await t("cambio de vehículo de una venta en reparto bloqueado", async () => {
      const r = await Venta.updateEnvioVehiculo({ ventaId: ven1, vehiculoId: v1, empresaId: EMP });
      assert.strictEqual(r.enReparto, rid);
    });
    await t("quitar venta y hoja de carga en vivo", async () => {
      await R.quitarVenta(EMP, rid, ven3);
      await expectErr(R.quitarVenta(EMP, rid, ven3), 404);
      const g = await R.getById(EMP, rid);
      assert.strictEqual(g.cantidad_ventas, 2);
      assert.deepStrictEqual(g.cajas.map((c) => [c.tipo_caja, c.cajas_salida]), [["710_ROJO", 4], ["COCA", 6]]);
      const pa = g.productos.find((p) => p.producto_id === pA);
      assert.strictEqual(pa.cajas, 6);
      assert.strictEqual(pa.unidades, 3);
      assert.strictEqual(g.observacion, "obs");
      assert.strictEqual(g.ventas.length, 2);
      assert(g.ventas[0].venta_total !== undefined);
    });
    await t("editar líneas de una venta en reparto ARMADO sigue permitido", async () => {
      // La ruta es /:ventaId/:productoId pero el segundo es VentaProductoId
      // (número de línea). Se reescribe la línea 1 de ven1 con sus mismos
      // valores: pasa por el modelo sin cambiar cajas.
      const res = fakeRes();
      await ventaProductoCtrl.update(
        {
          params: { ventaId: String(ven1), productoId: "1" },
          body: {
            ProductoId: pA,
            VentaProductoPrecioPromedio: 0,
            VentaProductoCantidad: 5,
            VentaProductoPrecio: 1,
            VentaProductoPrecioTotal: 1,
            VentaProductoUnitario: "C",
          },
          user: { id: "x" },
        },
        res
      );
      assert.strictEqual(res.statusCode, 200, JSON.stringify(res.body));
      assert(res.body && res.body.data, JSON.stringify(res.body));
    });
    await t("update cambia el vehículo y lo propaga", async () => {
      await R.update(EMP, rid, { vehiculo_id: v1 });
      assert.strictEqual((await q("SELECT vehiculo_id FROM venta_envio WHERE venta_id=?", [ven2]))[0].vehiculo_id, v1);
    });
    await t("confirmar salida congela cajas y pasa ventas a EN_RUTA", async () => {
      await R.confirmarSalida(EMP, rid, "rut");
      await expectErr(R.confirmarSalida(EMP, rid, "rut"), 409);
      await expectErr(R.asignarVentas(EMP, rid, [ven3]), 409);
      await expectErr(R.update(EMP, rid, { vehiculo_id: v1 }), 409);
      await expectErr(R.anular(EMP, rid), 409);
      await q("UPDATE ventaproducto SET VentaProductoCantidad=50 WHERE VentaId=? AND ProductoId=? AND VentaProductoUnitario='C'", [ven2, pB]);
      const g = await R.getById(EMP, rid);
      assert.strictEqual(g.estado, "EN_RUTA");
      assert.strictEqual(g.salida_por, "rut");
      assert.deepStrictEqual(g.cajas.map((c) => [c.tipo_caja, c.cajas_salida, c.cajas_recibidas]), [["710_ROJO", 4, null], ["COCA", 6, null]]);
      const est = await q("SELECT estado FROM venta_envio WHERE reparto_id=?", [rid]);
      assert(est.every((e) => e.estado === "EN_RUTA"));
    });

    console.log("Ventas de un reparto que ya salió");
    await t("borrar venta de reparto en ruta bloqueado", async () => {
      const res = fakeRes();
      await ventaCtrl.delete({ params: { id: String(ven1) }, empresaId: EMP, user: { id: "x" } }, res);
      assert.strictEqual(res.statusCode, 400, JSON.stringify(res.body));
      assert.match(res.body.message, /reparto/);
      assert.strictEqual((await q("SELECT COUNT(*)::int AS n FROM venta WHERE VentaId=?", [ven1]))[0].n, 1);
    });
    await t("editar cabecera de venta en ruta bloqueado (PUT /venta/:id)", async () => {
      const res = fakeRes();
      await ventaCtrl.update({ params: { id: String(ven1) }, body: { Total: 1 }, empresaId: EMP, user: { id: "x" } }, res);
      assert.strictEqual(res.statusCode, 409, JSON.stringify(res.body));
      assert.match(res.body.message, /reparto/);
      assert.strictEqual((await q("SELECT Total AS t FROM venta WHERE VentaId=?", [ven1]))[0].t, 1000);
    });
    await t("agregar, editar y borrar líneas de venta en ruta bloqueado", async () => {
      const antes = (await q("SELECT COUNT(*)::int AS n, SUM(VentaProductoCantidad)::int AS s FROM ventaproducto WHERE VentaId=?", [ven1]))[0];
      const r1 = fakeRes();
      await ventaProductoCtrl.create({ body: { VentaId: ven1, ProductoId: pA, VentaProductoCantidad: 9 }, user: { id: "x" } }, r1);
      assert.strictEqual(r1.statusCode, 409, JSON.stringify(r1.body));
      const r2 = fakeRes();
      await ventaProductoCtrl.update({ params: { ventaId: String(ven1), productoId: "1" }, body: { VentaProductoCantidad: 9 }, user: { id: "x" } }, r2);
      assert.strictEqual(r2.statusCode, 409, JSON.stringify(r2.body));
      const r3 = fakeRes();
      await ventaProductoCtrl.delete({ params: { ventaId: String(ven1), productoId: "1" }, user: { id: "x" } }, r3);
      assert.strictEqual(r3.statusCode, 409, JSON.stringify(r3.body));
      const despues = (await q("SELECT COUNT(*)::int AS n, SUM(VentaProductoCantidad)::int AS s FROM ventaproducto WHERE VentaId=?", [ven1]))[0];
      assert.deepStrictEqual(despues, antes);
    });

    console.log("Recepción");
    await t("recepción: validaciones", async () => {
      await expectErr(R.confirmarRecepcion(EMP, rid, "rut", { cajas: [{ tipo_caja: "COCA", cajas_recibidas: 6 }] }), 400, /Falta/);
      await expectErr(R.confirmarRecepcion(EMP, rid, "rut", { cajas: [{ tipo_caja: "COCA", cajas_recibidas: -1 }, { tipo_caja: "710_ROJO", cajas_recibidas: 4 }] }), 400, /inválida/);
      await expectErr(R.confirmarRecepcion(EMP, rid, "rut", { cajas: [{ tipo_caja: "COCA", cajas_recibidas: 1.5 }, { tipo_caja: "710_ROJO", cajas_recibidas: 4 }] }), 400, /inválida/);
      await expectErr(R.confirmarRecepcion(EMP, rid, "rut", { cajas: [{ tipo_caja: "COCA", cajas_recibidas: 6 }, { tipo_caja: "710_ROJO", cajas_recibidas: 4 }, { tipo_caja: "340", cajas_recibidas: 1 }] }), 400, /no salió/);
      await expectErr(R.confirmarRecepcion(EMP, rid, "rut", { cajas: [{ tipo_caja: "COCA", cajas_recibidas: 5 }, { tipo_caja: "710_ROJO", cajas_recibidas: 4 }], observacion: "   " }), 400, /observación/);
      assert.strictEqual((await R.getById(EMP, rid)).estado, "EN_RUTA");
    });
    const cajasOk = [{ tipo_caja: "COCA", cajas_recibidas: 6 }, { tipo_caja: "710_ROJO", cajas_recibidas: 4 }];
    await t("no entregadas: deben ser ventas del reparto y exigen observación", async () => {
      await expectErr(R.confirmarRecepcion(EMP, rid, "rut", { cajas: cajasOk, no_entregadas: [ven3] }), 400, /no está en este reparto/);
      await expectErr(R.confirmarRecepcion(EMP, rid, "rut", { cajas: cajasOk, no_entregadas: ["abc"] }), 400, /inválida/);
      await expectErr(R.confirmarRecepcion(EMP, rid, "rut", { cajas: cajasOk, no_entregadas: ven2 }), 400, /inválida/);
      await expectErr(R.confirmarRecepcion(EMP, rid, "rut", { cajas: cajasOk, no_entregadas: [ven2] }), 400, /observación/);
      assert.strictEqual((await R.getById(EMP, rid)).estado, "EN_RUTA");
    });
    await t("recepción con diferencia y una venta no entregada", async () => {
      const r = await R.confirmarRecepcion(EMP, rid, "rut2", {
        cajas: [{ tipo_caja: "COCA", cajas_recibidas: 5 }, { tipo_caja: "710_ROJO", cajas_recibidas: 4 }],
        observacion: "falta 1 coca; cliente de la 2 cerrado",
        no_entregadas: [ven2],
      });
      assert.strictEqual(r.hayDiferencia, true);
      assert.strictEqual(r.noEntregadas, 1);
      const g = await R.getById(EMP, rid);
      assert.strictEqual(g.estado, "RECIBIDO");
      assert.strictEqual(g.recepcion_por, "rut2");
      assert.deepStrictEqual(g.cajas.map((c) => [c.tipo_caja, c.cajas_recibidas]), [["710_ROJO", 4], ["COCA", 5]]);
      // la venta entregada queda ENTREGADO en el reparto
      const e1 = (await q("SELECT estado, entregado_en, reparto_id FROM venta_envio WHERE venta_id=?", [ven1]))[0];
      assert.strictEqual(e1.estado, "ENTREGADO");
      assert(e1.entregado_en);
      assert.strictEqual(e1.reparto_id, rid);
      // la no entregada vuelve a PENDIENTE, libre para otro reparto
      const e2 = (await q("SELECT estado, entregado_en, reparto_id FROM venta_envio WHERE venta_id=?", [ven2]))[0];
      assert.strictEqual(e2.estado, "PENDIENTE");
      assert.strictEqual(e2.entregado_en, null);
      assert.strictEqual(e2.reparto_id, null);
      // el reparto la sigue mostrando, marcada como no entregada
      assert.deepStrictEqual(
        g.ventas.map((v) => [v.venta_id, v.no_entregada]),
        [[ven1, false], [ven2, true]]
      );
      assert.strictEqual(g.cantidad_ventas, 1);
      assert.strictEqual(g.ventas_no_entregadas, 1);
      // productos de la hoja de carga: lo que se cargó (ambas ventas)
      assert(g.productos.some((p) => p.producto_id === pB));
      await expectErr(R.confirmarRecepcion(EMP, rid, "rut", { cajas: [] }), 409);
    });
    await t("la venta no entregada se puede asignar a otro reparto", async () => {
      assert((await R.ventasDisponibles(EMP, {})).some((x) => x.venta_id === ven2));
      const r2 = await R.create(EMP, { vehiculo_id: v2 }, "admin");
      assert.strictEqual(await R.asignarVentas(EMP, r2, [ven2]), 1);
      // el primer reparto la sigue mostrando como no entregada
      const g = await R.getById(EMP, rid);
      assert(g.ventas.some((v) => v.venta_id === ven2 && v.no_entregada));
      await R.anular(EMP, r2);
    });
    await t("recepción sin diferencia no exige observación; anular libera ventas", async () => {
      const r2 = await R.create(EMP, { vehiculo_id: v1 }, "admin");
      await R.asignarVentas(EMP, r2, [ven3]);
      await R.confirmarSalida(EMP, r2, "rut");
      const res = await R.confirmarRecepcion(EMP, r2, "rut", { cajas: [{ tipo_caja: "710_ROJO", cajas_recibidas: 7 }] });
      assert.strictEqual(res.hayDiferencia, false);
      assert.strictEqual(res.noEntregadas, 0);
      const ven4 = await mkVenta([[pA, 2, "C"]]);
      const r3 = await R.create(EMP, { vehiculo_id: v1 }, "admin");
      await R.asignarVentas(EMP, r3, [ven4]);
      await R.anular(EMP, r3);
      assert.strictEqual((await q("SELECT reparto_id FROM venta_envio WHERE venta_id=?", [ven4]))[0].reparto_id, null);
      const l = await R.list(EMP, { estado: "ANULADO,RECIBIDO" });
      assert(l.some((x) => x.id === r3 && x.estado === "ANULADO") && l.some((x) => x.id === r2));
      // regresión: una venta sin reparto sigue pudiendo cambiar de vehículo
      const u = await Venta.updateEnvioVehiculo({ ventaId: ven4, vehiculoId: v2, empresaId: EMP });
      assert.strictEqual(u.ok, true, JSON.stringify(u));
    });
    await t("borrar venta de reparto ARMADO sigue permitido", async () => {
      const ven5 = await mkVenta([[pA, 1, "C"]]);
      const r4 = await R.create(EMP, { vehiculo_id: v1 }, "admin");
      await R.asignarVentas(EMP, r4, [ven5]);
      const res = fakeRes();
      await ventaCtrl.delete({ params: { id: String(ven5) }, empresaId: EMP, user: { id: "x" } }, res);
      assert.notStrictEqual(res.statusCode, 400, JSON.stringify(res.body));
      assert.strictEqual((await q("SELECT COUNT(*)::int AS n FROM venta WHERE VentaId=?", [ven5]))[0].n, 0, JSON.stringify(res.body));
      assert.strictEqual((await R.getById(EMP, r4)).cantidad_ventas, 0);
    });
    await t("solo distribuidora, conteo vacío y venta RECIBIDA", async () => {
      await expectErr(R.create(2, { vehiculo_id: v1 }, "x"), 400, /distribuidora/);
      const ven6 = await mkVenta([[pA, 2, "C"]]);
      const r5 = await R.create(EMP, { vehiculo_id: v1 }, "admin");
      await R.asignarVentas(EMP, r5, [ven6]);
      await R.confirmarSalida(EMP, r5, "rut");
      for (const vacio of [null, "", undefined]) {
        await expectErr(R.confirmarRecepcion(EMP, r5, "rut", { cajas: [{ tipo_caja: "COCA", cajas_recibidas: vacio }], observacion: "x" }), 400, /inválida/);
      }
      const up = await q(
        `INSERT INTO venta_envio (venta_id, vehiculo_id) VALUES (?, ?)
         ON CONFLICT (venta_id) DO UPDATE SET vehiculo_id = EXCLUDED.vehiculo_id
          WHERE venta_envio.reparto_id IS NULL`,
        [ven6, v2]
      );
      assert.strictEqual(up.affectedRows, 0);
      await R.confirmarRecepcion(EMP, r5, "rut", { cajas: [{ tipo_caja: "COCA", cajas_recibidas: 2 }] });
      const res = fakeRes();
      await ventaCtrl.delete({ params: { id: String(ven6) }, empresaId: EMP, user: { id: "x" } }, res);
      assert.strictEqual(res.statusCode, 400, JSON.stringify(res.body));
      assert.match(res.body.message, /RECIBIDO/);
      const r2 = fakeRes();
      await ventaProductoCtrl.update({ params: { ventaId: String(ven6), productoId: "1" }, body: {}, user: { id: "x" } }, r2);
      assert.strictEqual(r2.statusCode, 409, JSON.stringify(r2.body));
    });

    console.log("Lista de repartos");
    await t("lista con cajas, diferencias y filtro 'con diferencias'", async () => {
      const l = await R.list(EMP, {});
      const conDif = l.find((x) => x.id === rid);
      assert(conDif, "falta el reparto con diferencia");
      assert.strictEqual(conDif.cajas_salida, 10);
      assert.strictEqual(conDif.cajas_recibidas, 9);
      assert.strictEqual(conDif.con_diferencia, true);
      assert.strictEqual(conDif.ventas_no_entregadas, 1);
      const sinDif = l.find((x) => x.estado === "RECIBIDO" && x.id !== rid && x.cajas_salida === 7);
      assert(sinDif, "falta el reparto sin diferencia");
      assert.strictEqual(sinDif.con_diferencia, false);
      const armado = await R.create(EMP, { vehiculo_id: v1 }, "admin");
      const ven7 = await mkVenta([[pB, 3, "C"]]);
      await R.asignarVentas(EMP, armado, [ven7]);
      const a = (await R.list(EMP, {})).find((x) => x.id === armado);
      assert.strictEqual(a.cajas_salida, 3, "ARMADO muestra las cajas calculadas");
      assert.strictEqual(a.cajas_recibidas, null);
      assert.strictEqual(a.con_diferencia, false);
      const f = await R.list(EMP, { conDiferencia: "1" });
      assert(f.some((x) => x.id === rid));
      assert(f.every((x) => x.con_diferencia), "el filtro trae repartos sin diferencia");
    });

    console.log("Corrección de la forma de pago (envío)");
    // ven1 está ENTREGADA en el reparto rid (RECIBIDO). Pagos sintéticos como
    // los deja la confirmación: 150.000 transferencia (grupo 10) + 100.000
    // efectivo a cobrar al entregar (grupo 7), más un cobro de crédito que la
    // corrección no debe tocar.
    const caja = (await q("SELECT CajaId AS cid FROM caja ORDER BY CajaId LIMIT 1"))[0].cid;
    const usrCaja = (await q("SELECT usuarioid AS u FROM usuario ORDER BY usuarioid LIMIT 1"))[0].u;
    const mkPago = async (ventaId, grupo, detalle, monto) =>
      (await q(
        `INSERT INTO registrodiariocaja (CajaId, RegistroDiarioCajaFecha, TipoGastoId, TipoGastoGrupoId, RegistroDiarioCajaDetalle, RegistroDiarioCajaMonto, UsuarioId)
         VALUES (?, '2026-01-15', 2, ?, ?, ?, ?) RETURNING RegistroDiarioCajaId AS rid`,
        [caja, grupo, detalle, monto, usrCaja]
      ))[0].rid;
    const pagosDe = (ventaId) =>
      q(
        `SELECT RegistroDiarioCajaId AS id, TipoGastoGrupoId AS grupo, RegistroDiarioCajaDetalle AS detalle,
                RegistroDiarioCajaMonto::bigint AS monto, CajaId AS caja, RegistroDiarioCajaFecha::text AS fecha, TRIM(UsuarioId) AS usuario
           FROM registrodiariocaja
          WHERE RegistroDiarioCajaDetalle LIKE ?
          ORDER BY RegistroDiarioCajaId`,
        [`%N°: ${ventaId}%`]
      ).then((rows) => rows.filter((x) => x.id !== idOtraVenta));
    await q("UPDATE venta SET VentaTipo='TR', Total=250000, VentaEntrega=250000 WHERE VentaId=?", [ven1]);
    const idTransf = await mkPago(ven1, 10, `Venta Transferencia N°: ${ven1} (ENVÍO)`, 150000);
    const idEfec = await mkPago(ven1, 7, `Venta N°: ${ven1} (ENVÍO)`, 100000);
    const idCobro = await mkPago(ven1, 3, `Cobro Crédito Efectivo N°: ${ven1}`, 5000);
    // Movimiento de OTRA venta cuyo número empieza igual (ven1 seguido de 0):
    // no debe sumarse ni tocarse.
    const idOtraVenta = await mkPago(ven1, 7, `Venta N°: ${ven1}0 (ENVÍO)`, 777);
    await t("cobro de envío: muestra lo cobrado por forma de pago", async () => {
      const p = await R.getPagosEnvio(EMP, rid, ven1);
      assert.deepStrictEqual(
        [p.efectivo, p.pos, p.voucher, p.transferencia, p.total],
        [100000, 0, 0, 150000, 250000]
      );
      assert.deepStrictEqual(p.correcciones, []);
    });
    await t("cobro de envío: validaciones", async () => {
      await expectErr(R.corregirPagosEnvio(EMP, rid, ven1, "caj", { efectivo: 0, pos: 0, voucher: 0, transferencia: 200000 }), 400, /250\.000/);
      await expectErr(R.corregirPagosEnvio(EMP, rid, ven1, "caj", { efectivo: -1, transferencia: 250001 }), 400, /inválido/);
      await expectErr(R.corregirPagosEnvio(EMP, rid, ven1, "caj", { efectivo: 1.5, transferencia: 249998.5 }), 400, /inválido/);
      await expectErr(R.corregirPagosEnvio(EMP, rid, ven2, "caj", { transferencia: 1 }), 404, /no está en este reparto/);
      await expectErr(R.corregirPagosEnvio(2, rid, ven1, "caj", { transferencia: 250000 }), 404);
      const ven8 = await mkVenta([[pA, 1, "C"]]);
      const r6 = await R.create(EMP, { vehiculo_id: v1 }, "admin");
      await R.asignarVentas(EMP, r6, [ven8]);
      await expectErr(R.corregirPagosEnvio(EMP, r6, ven8, "caj", { efectivo: 0 }), 409, /no tiene pagos/);
      await R.anular(EMP, r6);
      await expectErr(R.getPagosEnvio(EMP, r6, ven8), 409);
      await expectErr(R.corregirPagosEnvio(EMP, rid, ven1, "caj", { efectivo: 100000, transferencia: 150000 }), 400, /No hay cambios/);
      assert.strictEqual((await pagosDe(ven1)).length, 3, "las validaciones no deben tocar la caja");
    });
    await t("cobro de envío: el efectivo pasa a transferencia, queda registrado", async () => {
      const r = await R.corregirPagosEnvio(EMP, rid, ven1, "caj1", { efectivo: 0, pos: 0, voucher: 0, transferencia: 250000, observacion: " transfirió al entregar " });
      assert.deepStrictEqual([r.efectivo, r.transferencia, r.total], [0, 250000, 250000]);
      const rows = await pagosDe(ven1);
      assert.deepStrictEqual(
        rows.map((x) => [x.id, x.grupo, x.monto]),
        [[idTransf, 10, 250000], [idCobro, 3, 5000]],
        "reusa el movimiento de transferencia y borra el de efectivo"
      );
      assert(!rows.some((x) => x.id === idEfec));
      assert.strictEqual(rows[0].detalle, `Venta Transferencia N°: ${ven1} (ENVÍO)`);
      assert.strictEqual(rows[1].detalle, `Cobro Crédito Efectivo N°: ${ven1}`);
      const v = (await q("SELECT VentaTipo AS t, Total::bigint AS tot, VentaEntrega::bigint AS ent FROM venta WHERE VentaId=?", [ven1]))[0];
      assert.deepStrictEqual([v.t, v.tot, v.ent], ["TR", 250000, 250000]);
      const p = await R.getPagosEnvio(EMP, rid, ven1);
      assert.strictEqual(p.correcciones.length, 1);
      const c = p.correcciones[0];
      assert.strictEqual(c.usuario_id, "caj1");
      assert.strictEqual(c.observacion, "transfirió al entregar");
      assert.deepStrictEqual(c.antes, { efectivo: 100000, pos: 0, voucher: 0, transferencia: 150000 });
      assert.deepStrictEqual(c.despues, { efectivo: 0, pos: 0, voucher: 0, transferencia: 250000 });
      assert(c.corregido_en);
    });
    await t("cobro de envío: repartir en más formas agrega movimientos en la misma caja y fecha", async () => {
      await R.corregirPagosEnvio(EMP, rid, ven1, "caj2", { efectivo: 50000, pos: 200000 });
      const rows = (await pagosDe(ven1)).filter((x) => x.id !== idCobro);
      assert.deepStrictEqual(
        rows.map((x) => [x.grupo, x.monto, x.detalle]),
        [
          [7, 50000, `Venta N°: ${ven1} (ENVÍO)`], // reusa el movimiento existente
          [8, 200000, `Venta POS N°: ${ven1} (ENVÍO)`], // nuevo
        ]
      );
      assert(rows.every((x) => x.caja === caja && x.fecha.startsWith("2026-01-15") && x.usuario === usrCaja.trim()));
      assert.strictEqual((await q("SELECT VentaTipo AS t FROM venta WHERE VentaId=?", [ven1]))[0].t, "PO");
      assert.strictEqual((await R.getPagosEnvio(EMP, rid, ven1)).correcciones.length, 2);
    });
    await t("cobro de envío: venta a crédito sigue CR y el efectivo dice 'Venta Crédito'", async () => {
      await q("UPDATE venta SET VentaTipo='CR' WHERE VentaId=?", [ven1]);
      await R.corregirPagosEnvio(EMP, rid, ven1, "caj3", { efectivo: 250000 });
      const rows = (await pagosDe(ven1)).filter((x) => x.id !== idCobro);
      assert.deepStrictEqual(rows.map((x) => [x.grupo, x.monto, x.detalle]), [[7, 250000, `Venta Crédito N°: ${ven1} (ENVÍO)`]]);
      assert.strictEqual((await q("SELECT VentaTipo AS t FROM venta WHERE VentaId=?", [ven1]))[0].t, "CR");
      const otra = (await q("SELECT TipoGastoGrupoId AS g, RegistroDiarioCajaMonto::bigint AS m FROM registrodiariocaja WHERE RegistroDiarioCajaId=?", [idOtraVenta]))[0];
      assert.deepStrictEqual([otra.g, otra.m], [7, 777], "tocó el movimiento de otra venta");
      assert.strictEqual((await q("SELECT COUNT(*)::int AS n FROM venta_pago_correccion WHERE venta_id=?", [ven1]))[0].n, 3);
    });

    console.log("Permisos de la API (/api/repartos)");
    const permisosOriginal = PerfilMenu.getPermisosByUsuarioId;
    const PERMISOS = {
      ruteador: { CONTROLREPARTOS: { crear: false, editar: true, eliminar: false, leer: true } },
      oficina: { REPARTOS: { crear: true, editar: true, eliminar: false, leer: true } },
      consulta: { REPARTOS: { crear: false, editar: false, eliminar: false, leer: true } },
      cajero: {
        REPARTOS: { crear: false, editar: false, eliminar: false, leer: true },
        CORREGIRCOBROENVIO: { crear: false, editar: true, eliminar: false, leer: true },
      },
      nada: {},
    };
    PerfilMenu.getPermisosByUsuarioId = async (id) => PERMISOS[String(id).trim()] || {};
    try {
      const user = (id) => ({ id, isAdmin: "N" });
      await t("admin pasa sin consultar perfiles", async () => {
        for (const [m, p] of [["post", "/:id/salida"], ["post", "/"], ["post", "/:id/anular"]]) {
          assert.strictEqual((await pasaPermiso(m, p, { id: "nada", isAdmin: "S" })).pasa, true, p);
        }
      });
      await t("ruteador: lee y confirma, no arma", async () => {
        const u = user("ruteador");
        assert.strictEqual((await pasaPermiso("get", "/", u)).pasa, true);
        assert.strictEqual((await pasaPermiso("get", "/:id", u)).pasa, true);
        assert.strictEqual((await pasaPermiso("post", "/:id/salida", u)).pasa, true);
        assert.strictEqual((await pasaPermiso("post", "/:id/recepcion", u)).pasa, true);
        for (const [m, p] of [["post", "/"], ["put", "/:id"], ["post", "/:id/anular"], ["post", "/:id/ventas"], ["delete", "/:id/ventas/:ventaId"], ["get", "/ventas-disponibles"]]) {
          const r = await pasaPermiso(m, p, u);
          assert.strictEqual(r.pasa, false, `${m} ${p}`);
          assert.strictEqual(r.status, 403, `${m} ${p}`);
        }
      });
      await t("oficina: arma, no confirma salida ni recepción", async () => {
        const u = user("oficina");
        for (const [m, p] of [["get", "/"], ["get", "/:id"], ["get", "/ventas-disponibles"], ["post", "/"], ["put", "/:id"], ["post", "/:id/anular"], ["post", "/:id/ventas"], ["delete", "/:id/ventas/:ventaId"]]) {
          assert.strictEqual((await pasaPermiso(m, p, u)).pasa, true, `${m} ${p}`);
        }
        assert.strictEqual((await pasaPermiso("post", "/:id/salida", u)).status, 403);
        assert.strictEqual((await pasaPermiso("post", "/:id/recepcion", u)).status, 403);
      });
      await t("solo lectura y sin permisos", async () => {
        assert.strictEqual((await pasaPermiso("get", "/", user("consulta"))).pasa, true);
        assert.strictEqual((await pasaPermiso("post", "/", user("consulta"))).status, 403);
        assert.strictEqual((await pasaPermiso("get", "/", user("nada"))).status, 403);
        assert.strictEqual((await pasaPermiso("get", "/", undefined)).status, 401);
      });
      await t("corregir cobro: solo con el permiso CORREGIRCOBROENVIO", async () => {
        const path = "/:id/ventas/:ventaId/pagos";
        assert.strictEqual((await pasaPermiso("get", path, user("cajero"))).pasa, true);
        assert.strictEqual((await pasaPermiso("put", path, user("cajero"))).pasa, true);
        assert.strictEqual((await pasaPermiso("get", "/:id", user("cajero"))).pasa, true);
        for (const u of ["oficina", "ruteador", "consulta"]) {
          assert.strictEqual((await pasaPermiso("put", path, user(u))).status, 403, u);
          assert.strictEqual((await pasaPermiso("get", path, user(u))).status, 403, u);
        }
      });
    } finally {
      PerfilMenu.getPermisosByUsuarioId = permisosOriginal;
    }
  } catch (e) {
    fallos++;
    console.error("ERROR:", e);
  } finally {
    await outer.query("ROLLBACK");
    outer.release();
    console.log(`\n${ok} OK, ${fallos} FALLA(S) — transacción revertida, no quedó nada escrito`);
    process.exitCode = fallos ? 1 : 0;
    setTimeout(() => process.exit(), 100);
  }
})();
