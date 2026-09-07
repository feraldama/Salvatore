/**
 * Ticket de traslado de inventario (papel térmico de 80 mm).
 *
 * Acompaña la mercadería para que en el depósito destino la controlen contra
 * el papel. A pedido del cliente muestra solo lo necesario para contar:
 * nombre del producto, cantidad y si se movió en CAJA o en UNIDAD.
 *
 * Sigue el layout del ticket de venta (utils/ticket.ts): todo en negrita
 * porque el trazo fino sale gris en la térmica, encabezado centrado y un
 * bloque de renglones por ítem.
 *
 * NO muestra costos: es un papel de depósito que circula entre empleados; el
 * costo promedio es información interna y no aporta nada al conteo.
 */
import { loadPdf } from "./lazyPdf";
import { formatFecha, formatMiles } from "./utils";
import type { Traslado } from "../services/traslados.service";

const pad2 = (n: number) => String(n).padStart(2, "0");

// HH:mm de un timestamp. Se leen los componentes del string (igual que
// formatFecha) para no correr la hora por la zona horaria del navegador.
const horaDe = (value: string): string => {
  const m = String(value).match(/[T ](\d{2}):(\d{2})/);
  if (m) return `${m[1]}:${m[2]}`;
  const d = new Date(value);
  return isNaN(d.getTime()) ? "" : `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};

/**
 * Arma el ticket y lo devuelve, sin descargarlo ni abrirlo.
 *
 * Separado de `generarTicketTrasladoPDF` para poder generar el PDF fuera del
 * navegador y revisar el resultado (`doc.save` y `window.open` solo existen
 * en el browser).
 */
export async function construirTicketTraslado(t: Traslado) {
  const { jsPDF } = await loadPdf();
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: [80, 297], // 80mm de ancho; el alto sobrante lo corta la impresora
  });

  const FUENTE = 9;
  const ANCHO = 70; // ancho útil de impresión en mm (papel de 80mm)
  doc.setFontSize(FUENTE);
  doc.setFont("helvetica", "bold");

  let y = 8;
  const LIMITE_Y = 288;
  const saltoSiNoEntra = (alto: number) => {
    if (y + alto <= LIMITE_Y) return;
    doc.addPage();
    y = 10;
  };

  const linea = (
    texto: string,
    opciones: { size?: number; center?: boolean; x?: number } = {}
  ) => {
    const size = opciones.size ?? FUENTE;
    doc.setFontSize(size);
    doc.setFont("helvetica", "bold");
    const x = opciones.x ?? 0;
    const renglones = doc.splitTextToSize(texto, ANCHO - x) as string[];
    renglones.forEach((renglon) => {
      saltoSiNoEntra(size * 0.5);
      if (opciones.center) {
        doc.text(renglon, ANCHO / 2, y, { align: "center" });
      } else {
        doc.text(renglon, x, y);
      }
      y += size * 0.5; // interlineado proporcional al tamaño de fuente
    });
    doc.setFontSize(FUENTE);
  };

  const separador = () => {
    saltoSiNoEntra(3);
    doc.setLineWidth(0.3);
    doc.line(0, y - 1.5, ANCHO, y - 1.5);
    y += 1.5;
  };

  // ── Encabezado ────────────────────────────────────────────────────────────
  linea(`TRASLADO NRO.: ${t.TrasladoId}`, { size: 13, center: true });
  separador();

  // Un traslado anulado no debe usarse para recibir mercadería. Se avisa
  // arriba de todo, por si alguien reimprime uno viejo.
  if (t.TrasladoEstado === "A") {
    linea("*** ANULADO ***", { size: 12, center: true });
    linea("NO RECIBIR MERCADERIA", { size: 11, center: true });
    separador();
  }

  linea(
    `Fecha: ${formatFecha(t.TrasladoFecha)} - Hora: ${horaDe(t.TrasladoFecha)}`,
    { center: true }
  );
  linea(`DESDE: ${t.AlmacenOrigenNombre}`, { center: true });
  linea(`HACIA: ${t.AlmacenDestinoNombre}`, { center: true });
  if (t.UsuarioId) linea(`Despacho: ${t.UsuarioId}`, { center: true });
  if (t.TrasladoObs) linea(t.TrasladoObs, { center: true });
  separador();

  // ── Detalle ───────────────────────────────────────────────────────────────
  // Nombre completo arriba (puede ocupar varios renglones en 70mm) y debajo,
  // indentada y en cuerpo más grande, la cantidad con su unidad.
  //
  // Las cantidades salen tal como se cargaron en el origen: eso es lo que
  // significa "si fue caja o unidad". Una línea puede tener las dos cosas
  // (5 cajas y 3 sueltas), así que cada una va en su propio renglón en vez de
  // mezclarlas en una cuenta sola.
  const lineas = t.productos || [];
  let totalCajas = 0;
  let totalUnidades = 0;

  lineas.forEach((l) => {
    // Se muestra el nombre del catálogo DESTINO porque es el que reconoce
    // quien recibe. Si en el origen se llama distinto, va debajo en cuerpo
    // chico para que el que despacha también pueda cruzarlo con su pantalla.
    const nombreDestino = l.ProductoDestinoNombre || l.ProductoOrigenNombre;
    linea(nombreDestino);
    if (
      l.ProductoOrigenNombre &&
      l.ProductoOrigenNombre.trim().toUpperCase() !==
        (nombreDestino || "").trim().toUpperCase()
    ) {
      linea(`(origen: ${l.ProductoOrigenNombre})`, { size: 8, x: 3 });
    }

    if (l.TrasladoCantidadCaja > 0) {
      totalCajas += l.TrasladoCantidadCaja;
      const plural = l.TrasladoCantidadCaja === 1 ? "" : "S";
      linea(`${formatMiles(l.TrasladoCantidadCaja)}  CAJA${plural}`, {
        size: 11,
        x: 3,
      });
    }
    if (l.TrasladoCantidadUnidad > 0) {
      totalUnidades += l.TrasladoCantidadUnidad;
      const plural = l.TrasladoCantidadUnidad === 1 ? "" : "ES";
      linea(`${formatMiles(l.TrasladoCantidadUnidad)}  UNIDAD${plural}`, {
        size: 11,
        x: 3,
      });
    }
    y += 1;
  });

  separador();

  // ── Totales ───────────────────────────────────────────────────────────────
  linea(`ITEMS: ${formatMiles(lineas.length)}`);
  if (totalCajas > 0) linea(`TOTAL CAJAS: ${formatMiles(totalCajas)}`);
  if (totalUnidades > 0) linea(`TOTAL UNIDADES: ${formatMiles(totalUnidades)}`);
  separador();

  // ── Conformidad ───────────────────────────────────────────────────────────
  // Una sola línea de firma: sin la firma del que recibe, el papel no deja
  // constancia de que alguien contó la mercadería.
  y += 8;
  saltoSiNoEntra(12);
  doc.setLineWidth(0.3);
  doc.line(6, y, ANCHO - 6, y);
  y += 4;
  linea("RECIBI CONFORME", { size: 8, center: true });

  return doc;
}

/**
 * Genera el ticket, lo descarga y lo abre en una pestaña nueva listo para
 * imprimir. Se abre además de descargarse porque el flujo real es "confirmo el
 * traslado y mando a imprimir en el acto"; el archivo queda igual por si hace
 * falta reimprimirlo.
 */
export async function generarTicketTrasladoPDF(t: Traslado): Promise<void> {
  const doc = await construirTicketTraslado(t);
  doc.save(`traslado_${t.TrasladoId}.pdf`);
  const url = URL.createObjectURL(doc.output("blob"));
  window.open(url, "_blank");
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
