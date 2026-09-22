// Verificación de las migraciones 029/030/031 (caja por cajero + terminales).
// SOLO LECTURA: no escribe nada, se puede correr en producción sin riesgo.
//
//   node scripts/verificar_terminales.js
//
// Correr DESPUÉS de aplicar las migraciones y ANTES de poner
// TERMINAL_OBLIGATORIA=S. Si algo sale FALLA, no prender el flag: con equipos
// sin registrar y el flag prendido, nadie puede vender.
require("dotenv").config();
const db = require("../config/db");

// OJO: config/db mapea las columnas de vuelta a PascalCase (CajaDescripcion,
// LocalNombre...). Los alias inventados (AS u, AS n) sí vuelven como se
// escribieron, porque no están en ese mapa.
let fallos = 0;
const check = (nombre, ok, detalle) => {
  console.log(`  ${ok ? "OK   " : "FALLA"} ${nombre}${detalle ? ` (${detalle})` : ""}`);
  if (!ok) fallos++;
};
const q = async (sql, params = []) => (await db.promise().query(sql, params))[0];

(async () => {
  console.log("ESQUEMA");
  const cols = await q(
    `SELECT table_name, column_name FROM information_schema.columns
      WHERE table_name IN ('caja','terminal')`
  );
  const tiene = (t, c) =>
    cols.some((x) => x.table_name === t && x.column_name === c);
  check("caja.usuarioid (029)", tiene("caja", "usuarioid"));
  check("tabla terminal (030)", cols.some((x) => x.table_name === "terminal"));
  ["terminalid", "localid", "terminalestado", "terminalultimouso", "terminalultimaip"]
    .forEach((c) => check(`terminal.${c}`, tiene("terminal", c)));

  const idx = await q(
    `SELECT indexname FROM pg_indexes WHERE tablename='caja' AND indexname LIKE 'caja_usuario%'`
  );
  const nombres = idx.map((r) => r.indexname);
  check("indice caja_usuario_local_uniq (031)", nombres.includes("caja_usuario_local_uniq"));
  check("indice viejo caja_usuarioid_uniq eliminado", !nombres.includes("caja_usuarioid_uniq"));

  console.log("\nCONSISTENCIA DE DATOS");
  const dup = await q(
    `SELECT trim(usuarioid) AS u, localid, count(*) AS n FROM caja
      WHERE usuarioid IS NOT NULL GROUP BY trim(usuarioid), localid HAVING count(*) > 1`
  );
  check("ningun cajero con 2 cajas en la misma sucursal", dup.length === 0,
    dup.map((r) => `${r.u}@${r.LocalId}`).join(", "));

  const sinLocal = await q(`SELECT cajaid, cajadescripcion FROM caja WHERE localid IS NULL`);
  check("todas las cajas tienen sucursal", sinLocal.length === 0,
    sinLocal.map((r) => r.CajaDescripcion).join(", "));

  const sinDeposito = await q(
    `SELECT l.localid, l.localnombre FROM local l
      WHERE NOT EXISTS (SELECT 1 FROM almacen a WHERE a.localid = l.localid)`
  );
  check("toda sucursal tiene deposito", sinDeposito.length === 0,
    sinDeposito.map((r) => r.LocalNombre).join(", "));

  const inactivos = await q(
    `SELECT c.cajadescripcion, trim(c.usuarioid) AS u FROM caja c
       JOIN usuario u ON trim(u.usuarioid) = trim(c.usuarioid)
      WHERE u.usuarioestado = 'I'`
  );
  check("ninguna caja tiene de dueño a un usuario inactivo", inactivos.length === 0,
    inactivos.map((r) => `${r.CajaDescripcion}->${r.u}`).join(", "));

  console.log("\nCOBERTURA (informativo, no bloquea)");
  const cajas = await q(`SELECT count(*) AS n FROM caja`);
  const conDueno = await q(`SELECT count(*) AS n FROM caja WHERE usuarioid IS NOT NULL`);
  console.log(`  Cajas con dueño: ${conDueno[0].n} de ${cajas[0].n}`);
  const sinCaja = await q(
    `SELECT trim(u.usuarioid) AS u, u.localid FROM usuario u
      WHERE u.usuarioestado='A' AND u.usuarioisadmin='N'
        AND NOT EXISTS (SELECT 1 FROM caja c WHERE trim(c.usuarioid) = trim(u.usuarioid))`
  );
  console.log(`  Cajeros activos SIN caja propia (van a ver el selector): ${
    sinCaja.map((r) => r.u).join(", ") || "ninguno"}`);

  const terminales = await q(
    `SELECT t.terminalnombre, l.localnombre, t.terminalestado, t.terminalultimaip
       FROM terminal t LEFT JOIN local l ON l.localid = t.localid ORDER BY l.localnombre`
  );
  console.log(`  Equipos registrados: ${terminales.length}`);
  terminales.forEach((t) =>
    console.log(`    - ${t.TerminalNombre} @ ${t.LocalNombre} [${t.TerminalEstado}] ${t.TerminalUltimaIp || ""}`)
  );

  const localesSinTerminal = await q(
    `SELECT l.localnombre FROM local l
      WHERE NOT EXISTS (SELECT 1 FROM terminal t WHERE t.localid = l.localid AND t.terminalestado='A')`
  );
  if (localesSinTerminal.length) {
    console.log(`  ATENCION: sucursales sin ningun equipo registrado: ${
      localesSinTerminal.map((r) => r.LocalNombre).join(", ")}`);
    console.log("  Con TERMINAL_OBLIGATORIA=S nadie podria vender ahi.");
  }

  const flag = String(process.env.TERMINAL_OBLIGATORIA || "N").toUpperCase();
  console.log(`\n  TERMINAL_OBLIGATORIA = ${flag}`);

  console.log(`\n=== ${fallos === 0 ? "TODO EN ORDEN" : fallos + " PROBLEMAS"} ===`);
  process.exit(fallos ? 1 : 0);
})().catch((e) => {
  console.error("ERR:", e.message);
  process.exit(1);
});
