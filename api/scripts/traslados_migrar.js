/**
 * Migrador de la funcionalidad de TRASLADOS DE INVENTARIO (migraciones 026 y 027).
 *
 *   node scripts/traslados_migrar.js            -> VERIFICA (dry-run, no escribe nada)
 *   node scripts/traslados_migrar.js --aplicar  -> APLICA de verdad
 *
 * Correr siempre desde la carpeta `api/` (usa api/.env para la conexión).
 *
 * El modo verificación corre las DOS migraciones completas dentro de una
 * transacción y hace ROLLBACK: si algo va a fallar en el servidor del cliente,
 * falla acá sin dejar rastro. También informa cuántas equivalencias se van a
 * sembrar, que depende de los datos de cada base.
 *
 * Ambos modos comparan una huella del historial (ventas, compras, caja, stock,
 * costos) antes y después. Las migraciones son estrictamente aditivas: si algún
 * número se movió, es un bug y hay que frenar.
 */

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

const APLICAR = process.argv.includes("--aplicar");
const DIR = path.join(__dirname, "..", "migrations");
const MIGRACIONES = ["026_traslado_inventario.sql", "027_menu_traslados.sql"];

const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME,
  port: parseInt(process.env.DB_PORT, 10) || 5432,
});

const HUELLA = `SELECT
  (SELECT COUNT(*) FROM venta)                                   AS ventas,
  (SELECT COUNT(*) FROM ventaproducto)                           AS venta_lineas,
  (SELECT COUNT(*) FROM compra)                                  AS compras,
  (SELECT COUNT(*) FROM registrodiariocaja)                      AS registros_caja,
  (SELECT COUNT(*) FROM producto)                                AS productos,
  (SELECT COUNT(*) FROM productoalmacen)                         AS filas_stock,
  (SELECT COALESCE(SUM(ProductoAlmacenStock),0)         FROM productoalmacen) AS cajas_por_almacen,
  (SELECT COALESCE(SUM(ProductoAlmacenStockUnitario),0) FROM productoalmacen) AS sueltas_por_almacen,
  (SELECT COALESCE(SUM(ProductoStock),0)                FROM producto)        AS cajas_global,
  (SELECT COALESCE(SUM(ProductoStockUnitario),0)        FROM producto)        AS sueltas_global,
  (SELECT COALESCE(SUM(ProductoPrecioPromedio),0)       FROM producto)        AS suma_costos`;

// Lo que las migraciones dan por sentado. Si el servidor viene de una copia
// más vieja del sistema, esto lo detecta antes de tocar nada.
const REQUISITOS = [
  ["tabla empresa", "SELECT to_regclass('public.empresa') IS NOT NULL AS ok"],
  ["tabla almacen", "SELECT to_regclass('public.almacen') IS NOT NULL AS ok"],
  ["tabla productoalmacen", "SELECT to_regclass('public.productoalmacen') IS NOT NULL AS ok"],
  ["tabla menu", "SELECT to_regclass('public.menu') IS NOT NULL AS ok"],
  [
    "producto.EmpresaId (migración 002)",
    "SELECT COUNT(*)>0 AS ok FROM information_schema.columns WHERE table_name='producto' AND column_name='empresaid'",
  ],
  [
    "producto.ProductoEstado (migración 024)",
    "SELECT COUNT(*)>0 AS ok FROM information_schema.columns WHERE table_name='producto' AND column_name='productoestado'",
  ],
  [
    "almacen.LocalId (migración 005)",
    "SELECT COUNT(*)>0 AS ok FROM information_schema.columns WHERE table_name='almacen' AND column_name='localid'",
  ],
  [
    "almacen.EmpresaId (migración 002)",
    "SELECT COUNT(*)>0 AS ok FROM information_schema.columns WHERE table_name='almacen' AND column_name='empresaid'",
  ],
];

const fmt = (n) => new Intl.NumberFormat("es-PY").format(n);

async function main() {
  console.log("\n" + "=".repeat(64));
  console.log(
    `  TRASLADOS DE INVENTARIO — ${APLICAR ? "APLICAR" : "VERIFICAR (dry-run)"}`
  );
  console.log(`  Base: ${process.env.DB_NAME} @ ${process.env.DB_HOST}`);
  console.log("=".repeat(64));

  for (const f of MIGRACIONES) {
    if (!fs.existsSync(path.join(DIR, f))) {
      console.error(`\nFALTA el archivo migrations/${f}. ¿Hiciste git pull?`);
      process.exit(1);
    }
  }

  const c = await pool.connect();
  c.on("notice", (nt) => console.log(`     · ${nt.message}`));
  let problemas = 0;

  try {
    // ── 1. Requisitos de esquema ───────────────────────────────────────────
    console.log("\n[1] Requisitos de esquema");
    for (const [nombre, sql] of REQUISITOS) {
      const r = await c.query(sql);
      const ok = r.rows[0].ok;
      console.log(`  ${ok ? "OK  " : "FALTA"}  ${nombre}`);
      if (!ok) problemas++;
    }
    if (problemas) {
      console.error(
        `\n>>> FRENAR: faltan ${problemas} requisito(s). El servidor no tiene ` +
          `aplicadas todas las migraciones anteriores. No se tocó nada.`
      );
      process.exit(1);
    }

    // ── 2. ¿Ya está aplicada? ──────────────────────────────────────────────
    const yaEsta = (
      await c.query(
        "SELECT to_regclass('public.trasladoproducto') IS NOT NULL AS ok"
      )
    ).rows[0].ok;
    console.log(
      `\n[2] Estado: ${yaEsta ? "las migraciones YA están aplicadas (son idempotentes, se puede repetir)" : "sin aplicar"}`
    );

    // ── 3. Huella del historial ────────────────────────────────────────────
    const antes = (await c.query(HUELLA)).rows[0];
    console.log("\n[3] Huella del historial ANTES");
    Object.entries(antes).forEach(([k, v]) =>
      console.log(`  ${k.padEnd(22)} ${fmt(v)}`)
    );

    // ── 4. Ejecutar ────────────────────────────────────────────────────────
    console.log(`\n[4] Ejecutando migraciones`);
    await c.query("BEGIN");
    for (const f of MIGRACIONES) {
      // Las migraciones traen su propio BEGIN/COMMIT; se quitan para poder
      // envolverlas en la transacción de control de este script (y así poder
      // hacer ROLLBACK en el modo verificación).
      const sql = fs
        .readFileSync(path.join(DIR, f), "utf8")
        .replace(/^\s*BEGIN;\s*$/m, "")
        .replace(/^\s*COMMIT;\s*$/m, "");
      await c.query(sql);
      console.log(`  OK    ${f}`);
    }

    // ── 5. Qué quedó ───────────────────────────────────────────────────────
    const res = (
      await c.query(`SELECT
        (SELECT COUNT(*) FROM producto_equivalencia)                                AS equivalencias,
        (SELECT COUNT(*) FROM producto_equivalencia WHERE EquivalenciaConfianza='R') AS a_revisar,
        (SELECT COUNT(*) FROM menu WHERE MenuId='TRASLADOS')                        AS menu_traslados,
        (SELECT COUNT(*) FROM traslado)                                             AS traslados`)
    ).rows[0];
    console.log("\n[5] Resultado");
    console.log(`  equivalencias sembradas   ${fmt(res.equivalencias)}  (los dos sentidos)`);
    console.log(`  marcadas "a revisar"      ${fmt(res.a_revisar)}`);
    console.log(`  menú TRASLADOS            ${res.menu_traslados > 0 ? "creado" : "FALTA"}`);
    console.log(`  traslados existentes      ${fmt(res.traslados)}`);

    // Coherencia: nadie debe tener dos equivalentes en la misma empresa destino.
    const amb = (
      await c.query(`SELECT COUNT(*) AS n FROM (
        SELECT ProductoOrigenId FROM producto_equivalencia
        GROUP BY ProductoOrigenId, EmpresaDestinoId HAVING COUNT(*)>1) x`)
    ).rows[0].n;
    console.log(`  equivalencias ambiguas    ${amb}  ${amb > 0 ? "<<< PROBLEMA" : "(debe ser 0)"}`);
    if (Number(amb) > 0) problemas++;

    // ── 6. El historial no se movió ────────────────────────────────────────
    const despues = (await c.query(HUELLA)).rows[0];
    const dif = Object.keys(antes).filter(
      (k) => String(antes[k]) !== String(despues[k])
    );
    console.log("\n[6] Historial");
    if (dif.length === 0) {
      console.log(
        `  OK    las ${Object.keys(antes).length} métricas dan idéntico: ventas, compras,`
      );
      console.log("        caja, stock y costos quedaron intactos.");
    } else {
      console.log(`  CAMBIÓ en: ${dif.join(", ")}`);
      dif.forEach((k) => console.log(`        ${k}: ${antes[k]} -> ${despues[k]}`));
      problemas++;
    }

    // ── 7. Cerrar ──────────────────────────────────────────────────────────
    if (problemas > 0) {
      await c.query("ROLLBACK");
      console.error(
        `\n>>> ROLLBACK por ${problemas} problema(s). La base quedó como estaba.`
      );
      process.exit(1);
    }
    if (APLICAR) {
      await c.query("COMMIT");
      console.log("\n" + "=".repeat(64));
      console.log("  >>> MIGRACIONES APLICADAS");
      console.log("=".repeat(64));
      console.log("\n  Falta todavía:");
      console.log("   1. Reiniciar la API (hay rutas nuevas en /api/traslados)");
      console.log("   2. Rebuild del frontend (npm run build en client/)");
      console.log("   3. Asignar el permiso TRASLADOS a los perfiles, en Perfiles");
      console.log("      (los admin ya lo ven sin hacer nada)\n");
    } else {
      await c.query("ROLLBACK");
      console.log("\n" + "=".repeat(64));
      console.log("  >>> VERIFICACIÓN OK — no se escribió nada (ROLLBACK)");
      console.log("      Para aplicar de verdad:");
      console.log("      node scripts/traslados_migrar.js --aplicar");
      console.log("=".repeat(64) + "\n");
    }
  } catch (e) {
    try {
      await c.query("ROLLBACK");
    } catch {
      /* la conexión ya puede estar caída */
    }
    console.error(`\n>>> ERROR: ${e.message}`);
    if (e.position) console.error(`    posición ${e.position} del SQL`);
    console.error("    Se hizo ROLLBACK: la base quedó como estaba.");
    process.exit(1);
  } finally {
    c.release();
    await pool.end();
  }
}

main();
