import type { RepartoDetalle } from "../../services/reparto.service";
import { REPARTO_ESTADO_LABEL } from "../../services/reparto.service";
import { formatFecha, formatFechaHora, formatMiles } from "../../utils/utils";
import { labelTipoCaja } from "../../utils/tiposCaja";

const esc = (v: unknown) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// Hoja de carga imprimible: productos a cargar, cajas retornables por tipo y
// ventas del reparto. Se abre en una ventana aparte y dispara la impresión.
export function imprimirHojaDeCarga(r: RepartoDetalle) {
  const totalCajas = r.cajas.reduce((a, c) => a + c.cajas_salida, 0);
  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<title>Hoja de carga — Reparto #${r.id}</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 12px; color: #111; margin: 16px; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  h2 { font-size: 14px; margin: 16px 0 6px; }
  .meta { display: grid; grid-template-columns: repeat(4, auto); gap: 4px 24px; margin-bottom: 8px; }
  .meta b { display: block; font-size: 10px; color: #555; font-weight: normal; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #999; padding: 4px 6px; text-align: left; }
  th { background: #eee; }
  .r { text-align: right; }
  .firma { margin-top: 48px; display: flex; gap: 48px; }
  .firma div { flex: 1; border-top: 1px solid #111; padding-top: 4px; text-align: center; }
</style></head><body>
<h1>Hoja de carga — Reparto #${r.id}</h1>
<div class="meta">
  <div><b>Fecha</b>${esc(formatFecha(r.fecha))}</div>
  <div><b>Vehículo</b>${esc(r.vehiculo_chapa)}</div>
  <div><b>Chofer</b>${esc(r.chofer_nombre ?? "Sin asignar")}</div>
  <div><b>Estado</b>${esc(REPARTO_ESTADO_LABEL[r.estado])}${r.salida_en ? ` · salida ${esc(formatFechaHora(r.salida_en))}` : ""}</div>
</div>
${r.observacion ? `<p><b>Observación:</b> ${esc(r.observacion)}</p>` : ""}

<h2>Cajas retornables (${formatMiles(totalCajas)})</h2>
${
  r.cajas.length
    ? `<table><thead><tr><th>Tipo de caja</th><th class="r">Salen</th><th class="r">Deben volver</th><th class="r">Volvieron</th></tr></thead><tbody>
${r.cajas
  .map(
    (c) =>
      `<tr><td>${esc(labelTipoCaja(c.tipo_caja))}</td><td class="r">${formatMiles(c.cajas_salida)}</td><td class="r">${formatMiles(c.cajas_salida)}</td><td class="r">${c.cajas_recibidas != null ? formatMiles(c.cajas_recibidas) : ""}</td></tr>`,
  )
  .join("")}
</tbody></table>`
    : "<p>Ninguna venta lleva productos con tipo de caja.</p>"
}

<h2>Productos a cargar</h2>
<table><thead><tr><th>Código</th><th>Producto</th><th>Tipo de caja</th><th class="r">Cajas</th><th class="r">Unidades</th></tr></thead><tbody>
${r.productos
  .map(
    (p) =>
      `<tr><td>${esc(p.producto_codigo)}</td><td>${esc(p.producto_nombre)}</td><td>${esc(p.tipo_caja ? labelTipoCaja(p.tipo_caja) : "")}</td><td class="r">${p.cajas ? formatMiles(p.cajas) : ""}</td><td class="r">${p.unidades ? formatMiles(p.unidades) : ""}</td></tr>`,
  )
  .join("")}
</tbody></table>

<h2>Ventas (${r.ventas.length})</h2>
<table><thead><tr><th>Venta</th><th>Fecha</th><th>Cliente</th><th class="r">Total</th></tr></thead><tbody>
${r.ventas
  .map(
    (v) =>
      `<tr><td>#${v.venta_id}</td><td>${esc(formatFecha(v.venta_fecha))}</td><td>${esc(v.cliente ?? "")}</td><td class="r">Gs. ${formatMiles(v.venta_total)}</td></tr>`,
  )
  .join("")}
</tbody></table>

<div class="firma"><div>Ruteador</div><div>Chofer</div></div>
<script>window.onload = function () { window.print(); };</script>
</body></html>`;

  const w = window.open("", "_blank", "width=900,height=700");
  if (!w) {
    alert("El navegador bloqueó la ventana de impresión. Permita las ventanas emergentes.");
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}
