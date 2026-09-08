/**
 * Ticket de venta en PDF (papel de 76 mm, Epson TM-U220).
 *
 * Se usa para REIMPRIMIR el ticket de una venta ya confirmada: los datos no
 * salen del carrito de la pantalla de venta sino de la BD (endpoint
 * `GET /venta/:id/ticket`), así el ticket se puede volver a sacar días después
 * y sigue mostrando lo que realmente se vendió y cómo se pagó.
 *
 * El layout replica el del ticket que se imprime al confirmar la venta en la
 * pantalla mayorista: todo en negrita, encabezado centrado y un bloque de dos
 * renglones por ítem.
 *
 * La geometría del papel sale de `ticketPapel.ts`: ahí está explicado por qué
 * la página mide 63,4 mm de ancho y no 80.
 */
import type { jsPDF as JsPdf } from "jspdf";
import { loadPdf } from "./lazyPdf";
import { ANCHO_PAGINA, ANCHO_UTIL, MARGEN_INFERIOR } from "./ticketPapel";
import { formatFecha, formatMiles } from "./utils";

export interface TicketProducto {
  nombre: string;
  cantidad: number;
  /** 'C' = caja, 'U' = unidad. Define la etiqueta que acompaña al nombre. */
  unidad: "C" | "U";
  precioUnitario: number;
  total: number;
}

export interface TicketPagos {
  efectivo: number;
  pos: number;
  voucher: number;
  transferencia: number;
  cuentaCliente: number;
}

export interface TicketCliente {
  nombre?: string | null;
  apellido?: string | null;
  ruc?: string | null;
  direccion?: string | null;
}

export interface TicketVenta {
  ventaId: number;
  /** Fecha/hora en que se hizo la venta (ISO). */
  fecha: string;
  tipo: "CONTADO" | "ENVIO" | "DELIVERY";
  cliente: TicketCliente;
  productos: TicketProducto[];
  pagos: TicketPagos;
  /** Costo del reparto (solo delivery). Sale como una línea más. */
  costoDelivery: number;
  total: number;
}

const ETIQUETA_TIPO: Record<TicketVenta["tipo"], string> = {
  CONTADO: "Contado",
  ENVIO: "Envio",
  DELIVERY: "Delivery",
};

const pad2 = (n: number) => String(n).padStart(2, "0");

// HH:mm:ss de un timestamp ISO. Se leen los componentes del string (igual que
// formatFecha) para no correr la hora por la zona horaria del navegador.
const horaDe = (value: string): string => {
  const m = String(value).match(/[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (m) return `${m[1]}:${m[2]}:${m[3] ?? "00"}`;
  const d = new Date(value);
  if (isNaN(d.getTime())) return "";
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
};

/**
 * Genera el PDF del ticket: lo descarga y además lo abre en una pestaña nueva
 * para poder mandarlo a la impresora en el acto.
 *
 * @param venta Datos de la venta ya confirmada.
 * @param opts.reimpresion Marca el ticket como copia y agrega la fecha/hora en
 *   que se reimprimió, para que no se confunda con el original.
 */
export async function generarTicketVentaPDF(
  venta: TicketVenta,
  opts: { reimpresion?: boolean } = {},
): Promise<void> {
  const { jsPDF } = await loadPdf();

  const FUENTE = 9; // tamaño base del texto del ticket
  const ANCHO = ANCHO_UTIL; // ancho útil de impresión en mm

  // Sello de la reimpresión. Se calcula una sola vez, fuera de `dibujar`,
  // porque el ticket se dibuja dos veces y las dos pasadas tienen que dar el
  // mismo alto: si cambiara de minuto entre una y otra, el texto sería
  // distinto y la medición dejaría de servir.
  const ahora = new Date();
  const selloReimpresion = `Reimpreso: ${formatFecha(ahora)} ${pad2(
    ahora.getHours(),
  )}:${pad2(ahora.getMinutes())}`;

  const items = venta.productos.map((p) => ({
    // La unidad de venta va entre paréntesis porque el precio cambia según eso.
    nombre: `${p.nombre} (${p.unidad === "U" ? "Unidad" : "Caja"})`,
    cantidad: p.cantidad,
    precio: p.precioUnitario,
    total: p.total,
  }));

  // El reparto se cobra como una línea más del ticket (igual que en la venta).
  if (venta.costoDelivery > 0) {
    items.push({
      nombre: "DELIVERY (Envio)",
      cantidad: 1,
      precio: venta.costoDelivery,
      total: venta.costoDelivery,
    });
  }

  /** Dibuja el ticket completo y devuelve el alto que ocupó, en mm. */
  const dibujar = (doc: JsPdf): number => {
    doc.setFontSize(FUENTE);
    doc.setFont("helvetica", "bold");

    // Cursor vertical: cada línea puede ocupar más de un renglón si no entra en
    // el ancho del papel, así que se avanza según lo que se imprimió.
    let y = 8;

    const linea = (
      texto: string,
      opciones: { bold?: boolean; size?: number; center?: boolean } = {},
    ) => {
      const size = opciones.size ?? FUENTE;
      doc.setFontSize(size);
      doc.setFont("helvetica", opciones.bold === false ? "normal" : "bold");
      const renglones = doc.splitTextToSize(texto, ANCHO) as string[];
      renglones.forEach((renglon) => {
        if (opciones.center) {
          doc.text(renglon, ANCHO / 2, y, { align: "center" });
        } else {
          doc.text(renglon, 0, y);
        }
        y += size * 0.5; // interlineado proporcional al tamaño de fuente
      });
      doc.setFontSize(FUENTE);
      doc.setFont("helvetica", "bold");
    };
    const separador = () => {
      doc.setLineWidth(0.3);
      doc.line(0, y - 1.5, ANCHO, y - 1.5);
      y += 1.5;
    };

    /**
     * El tamaño más grande, desde `size` para abajo, con el que `texto` entra
     * en un solo renglón. Se usa para el total: es la línea que más se mira del
     * ticket y partida en dos queda ilegible, así que con importes de 10 dígitos
     * (más de mil millones) es preferible achicarla un punto que envolverla.
     */
    const sizeQueEntra = (texto: string, size: number, minimo = 9) => {
      doc.setFont("helvetica", "bold");
      for (let s = size; s > minimo; s -= 0.5) {
        doc.setFontSize(s);
        if (doc.getTextWidth(texto) <= ANCHO) return s;
      }
      return minimo;
    };

    // Nro. de venta arriba de todo.
    linea(`VENTA NRO.: ${venta.ventaId}`, { size: 13, center: true });
    separador();

    // Encabezado del comercio. La dirección va un punto más chica porque en
    // 62 mm de ancho no entra en un renglón y partida en dos queda fea.
    linea("Distribuidora Salvatore", { size: 11, center: true });
    linea("COMERCIAL & BODEGA", { size: 11, center: true });
    linea("Martin Ledezma e/ Niños Martires, Capiatá", {
      size: 8,
      center: true,
    });
    linea("Teléfono: +595 985 374240", { center: true });

    // Fecha de la VENTA (no la de hoy): el ticket se puede reimprimir semanas
    // después y la que importa es la del comprobante original.
    linea(`Fecha: ${formatFecha(venta.fecha)} - Hora: ${horaDe(venta.fecha)}`, {
      center: true,
    });
    linea(`Venta Tipo: ${ETIQUETA_TIPO[venta.tipo]}`, { center: true });

    // Marca de copia: evita que una reimpresión se confunda con el original.
    if (opts.reimpresion) {
      linea("*** REIMPRESION ***", { size: 11, center: true });
      linea(selloReimpresion, { center: true });
    }

    // Métodos de pago de esta venta (solo los que tienen monto). Débito y
    // crédito van juntos como POS: la caja los registra en un único grupo.
    const metodosPago: [string, number][] = [
      ["Efectivo", venta.pagos.efectivo],
      ["Transferencia", venta.pagos.transferencia],
      ["Tarjeta (POS)", venta.pagos.pos],
      ["Voucher", venta.pagos.voucher],
      ["Credito (cta. cte.)", venta.pagos.cuentaCliente],
    ];
    const metodosUsados = metodosPago.filter(([, monto]) => monto > 0);
    if (metodosUsados.length === 0) {
      linea("Forma de Pago: -", { center: true });
    } else {
      metodosUsados.forEach(([nombre, monto]) => {
        linea(`${nombre}: ${formatMiles(monto)}`, { center: true });
      });
    }

    linea(venta.cliente.ruc ? `RUC: ${venta.cliente.ruc}` : "RUC: SIN RUC");
    linea(
      "Cliente: " +
        [venta.cliente.nombre, venta.cliente.apellido]
          .filter(Boolean)
          .join(" ")
          .trim(),
    );
    if (venta.cliente.direccion) {
      linea(`Direccion: ${venta.cliente.direccion}`);
    }

    // Encabezados de las columnas. X_CANT es el centro de la columna de
    // cantidad; X_PRECIO y X_TOTAL son los bordes derechos (importes a la
    // derecha). Están calculados para el peor caso de cada columna sin que se
    // pisen entre sí: cantidad de 5 dígitos en 13pt (12,6 mm), precio de 8
    // dígitos y total de 10 dígitos en 9pt (15,7 y 20,1 mm). El layout de 70 mm
    // se pisaba con totales de 9 dígitos o más, y ahí hay importes reales.
    // "Precio Unitario" se abrevió para que el rótulo entre en su columna.
    const X_CANT = 16;
    const X_PRECIO = 40;
    const X_TOTAL = ANCHO;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text("Desc.", 0, y);
    doc.text("Cant.", X_CANT, y, { align: "center" });
    doc.text("Precio Unit.", X_PRECIO, y, { align: "right" });
    doc.text("Total", X_TOTAL, y, { align: "right" });
    doc.setFontSize(FUENTE);
    y += 3.5;
    separador();
    y += 2.5;

    // Un ítem por bloque de dos renglones: arriba los números alineados en sus
    // columnas y abajo el nombre del producto ocupando todo el ancho.
    items.forEach((item) => {
      // Renglón de números. La cantidad va en 13pt, más grande que el resto.
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.text(String(item.cantidad), X_CANT, y, { align: "center" });
      doc.setFontSize(FUENTE);
      doc.text(formatMiles(item.precio), X_PRECIO, y, { align: "right" });
      doc.text(formatMiles(item.total), X_TOTAL, y, { align: "right" });
      y += 5;

      linea(item.nombre);
      y += 1.5;
    });

    y += 1;
    separador();
    y += 3;

    // Total bien grande: es el dato que más se mira del ticket.
    const textoTotal = `Total a Pagar Gs. ${formatMiles(venta.total)}`;
    linea(textoTotal, { size: sizeQueEntra(textoTotal, 12) });

    y += 3;
    linea("--GRACIAS POR SU PREFERENCIA--");

    return y;
  };

  // El ticket se dibuja dos veces: la primera sobre un documento descartable,
  // solo para medir cuánto ocupa a lo alto; la segunda sobre el definitivo, ya
  // con una página de ese alto exacto. El papel es un rollo continuo, así que
  // una sola página del alto del contenido es lo correcto: el paginado fijo
  // cada 297 mm que había antes partía los tickets largos en varias hojas y
  // hacía avanzar papel en blanco en cada corte. Y con la página del alto justo
  // el "Ajustar al área de impresión" del navegador no tiene nada que achicar.
  const nuevoDoc = (alto: number) =>
    new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: [ANCHO_PAGINA, alto],
    });

  const alto = dibujar(nuevoDoc(297)) + MARGEN_INFERIOR;
  const doc = nuevoDoc(alto);
  dibujar(doc);

  // Se descarga Y se abre en una pestaña nueva, para poder mandarlo a la
  // impresora en el acto sin tener que buscar el archivo bajado. Mismo patrón
  // que el cierre de caja y los reportes.
  const pdfUrl = URL.createObjectURL(doc.output("blob"));
  const nombre = `ticket_venta_${venta.ventaId}.pdf`;

  const descarga = document.createElement("a");
  descarga.href = pdfUrl;
  descarga.download = nombre;
  document.body.appendChild(descarga);
  descarga.click();
  document.body.removeChild(descarga);

  const apertura = document.createElement("a");
  apertura.href = pdfUrl;
  apertura.target = "_blank";
  apertura.rel = "noopener";
  document.body.appendChild(apertura);
  apertura.click();
  document.body.removeChild(apertura);

  // La pestaña ya tomó el blob; se libera para no dejar el PDF en memoria.
  setTimeout(() => URL.revokeObjectURL(pdfUrl), 2000);
}
