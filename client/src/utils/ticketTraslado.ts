/**
 * Ticket de traslado de inventario (papel de 76 mm, Epson TM-U220).
 *
 * Acompaña la mercadería para que en el depósito destino la controlen contra
 * el papel. A pedido del cliente muestra solo lo necesario para contar:
 * nombre del producto, cantidad y si se movió en CAJA o en UNIDAD.
 *
 * Sigue el mismo formato que el ticket de venta (`utils/ticket.ts`), a pedido
 * del cliente: misma geometría de papel y misma fuente embebida (las dos salen
 * de `ticketPapel.ts` y `ticketFuente.ts`), mismo interlineado, y el mismo
 * bloque de dos renglones por ítem — arriba la cantidad alineada en su columna
 * y abajo el nombre del producto en mayúsculas ocupando todo el ancho.
 *
 * La diferencia es que acá NO hay columnas de importes. Donde el ticket de venta
 * pone "Precio Unit." y "Total", este pone la unidad de traslado (CAJAS /
 * UNIDADES). No muestra costos a propósito: es un papel de depósito que circula
 * entre empleados, y el costo promedio es información interna que no aporta
 * nada al conteo.
 */
import type { jsPDF as JsPdf } from "jspdf";
import { loadPdf } from "./lazyPdf";
import {
  cargarFuenteTicket,
  COLUMNAS_TICKET,
  FUENTE_TICKET,
  registrarFuenteTicket,
} from "./ticketFuente";
import {
  AIRE_ITEM,
  ALTO_MAXIMO_PAGINA,
  ANCHO_PAGINA,
  ANCHO_UTIL,
  CANTIDAD_PT,
  interlineado,
  MARGEN_INFERIOR,
  NOMBRE_PT,
} from "./ticketPapel";
import { formatFecha, formatMiles } from "./utils";
import type { Traslado } from "../services/traslados.service";

const pad2 = (n: number) => String(n).padStart(2, "0");

// HH:mm de un timestamp. Se leen los componentes del string (igual que
// formatFecha) para no correr la hora por la zona horaria del navegador.
const horaDe = (value: string): string => {
  const m = String(value).match(/[T ](\d{2}):(\d{2})/);
  if (m) return `${m[1]}:${m[2]}`;
  const d = new Date(value);
  return isNaN(d.getTime())
    ? ""
    : `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};

/** Una fila del detalle: cantidad + unidad, ya resuelta para dibujar. */
type FilaCantidad = { cantidad: number; unidad: string };

/** Un ítem del traslado: sus filas de cantidad y el nombre que va debajo. */
type ItemTraslado = {
  filas: FilaCantidad[];
  nombre: string;
  /** Nombre en el catálogo origen, sólo si difiere del de destino. */
  nombreOrigen: string | null;
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
  // La fuente viene en su propio chunk (ver ticketFuente.ts).
  const fuente = await cargarFuenteTicket();

  const FUENTE = 9; // tamaño base del texto del ticket
  const ANCHO = ANCHO_UTIL; // ancho útil de impresión en mm

  // Los ítems se resuelven ANTES de dibujar porque el ticket se dibuja dos
  // veces (una para medir el alto y otra la definitiva) y las dos pasadas
  // tienen que dar exactamente lo mismo.
  //
  // Las cantidades salen tal como se cargaron en el origen: eso es lo que
  // significa "si fue caja o unidad". Una línea puede tener las dos cosas
  // (5 cajas y 3 sueltas), así que cada una va en su propio renglón en vez de
  // mezclarlas en una cuenta sola.
  const lineas = t.productos || [];
  let totalCajas = 0;
  let totalUnidades = 0;

  const items: ItemTraslado[] = lineas.map((l) => {
    const filas: FilaCantidad[] = [];
    if (l.TrasladoCantidadCaja > 0) {
      totalCajas += l.TrasladoCantidadCaja;
      filas.push({
        cantidad: l.TrasladoCantidadCaja,
        unidad: l.TrasladoCantidadCaja === 1 ? "CAJA" : "CAJAS",
      });
    }
    if (l.TrasladoCantidadUnidad > 0) {
      totalUnidades += l.TrasladoCantidadUnidad;
      filas.push({
        cantidad: l.TrasladoCantidadUnidad,
        unidad: l.TrasladoCantidadUnidad === 1 ? "UNIDAD" : "UNIDADES",
      });
    }

    // Se muestra el nombre del catálogo DESTINO porque es el que reconoce
    // quien recibe. Si en el origen se llama distinto, va debajo en cuerpo
    // chico para que el que despacha también pueda cruzarlo con su pantalla.
    //
    // Todo en mayúsculas: es lo que permite imprimir el nombre en NOMBRE_PT sin
    // perder legibilidad (ver ticketPapel.ts).
    const nombre = (
      l.ProductoDestinoNombre ||
      l.ProductoOrigenNombre ||
      ""
    ).toUpperCase();
    const origen = (l.ProductoOrigenNombre || "").toUpperCase();

    return {
      filas,
      nombre,
      nombreOrigen: origen && origen.trim() !== nombre.trim() ? origen : null,
    };
  });

  /**
   * Dibuja el ticket completo y devuelve el alto que ocupó, en mm.
   *
   * @param limiteY Y a partir del cual se pasa a una hoja nueva. `Infinity`
   *   para dibujar de corrido, sin paginar (se usa en la pasada de medición y
   *   cuando el ticket entra entero en una sola página).
   */
  const dibujar = (doc: JsPdf, limiteY: number): number => {
    doc.setFontSize(FUENTE);
    doc.setFont(FUENTE_TICKET, "bold");

    // Cursor vertical: cada línea puede ocupar más de un renglón si no entra en
    // el ancho del papel, así que se avanza según lo que se imprimió.
    let y = 8;

    // Corta la hoja cuando el bloque que sigue ya no entra (el dibujado es
    // manual, no hay paginado automático).
    const saltoSiNoEntra = (alto: number) => {
      if (y + alto <= limiteY) return;
      doc.addPage();
      y = 8;
    };

    const linea = (
      texto: string,
      opciones: { size?: number; center?: boolean; x?: number } = {},
    ) => {
      const size = opciones.size ?? FUENTE;
      doc.setFontSize(size);
      doc.setFont(FUENTE_TICKET, "bold");
      const x = opciones.x ?? 0;
      const renglones = doc.splitTextToSize(texto, ANCHO - x) as string[];
      renglones.forEach((renglon) => {
        saltoSiNoEntra(interlineado(size));
        if (opciones.center) {
          doc.text(renglon, ANCHO / 2, y, { align: "center" });
        } else {
          doc.text(renglon, x, y);
        }
        y += interlineado(size);
      });
      doc.setFontSize(FUENTE);
      doc.setFont(FUENTE_TICKET, "bold");
    };

    const separador = () => {
      doc.setLineWidth(0.3);
      doc.line(0, y - 1.5, ANCHO, y - 1.5);
      y += 1.5;
    };

    // ── Encabezado ──────────────────────────────────────────────────────────
    linea(`TRASLADO NRO.: ${t.TrasladoId}`, { size: 13, center: true });
    separador();

    // Mismo encabezado de comercio que el ticket de venta, para que los dos
    // papeles se reconozcan como del mismo sistema. Sin dirección ni teléfono:
    // este papel no sale del local, así que esos datos no aportan nada y
    // costarían dos renglones.
    linea("Distribuidora Salvatore", { size: 11, center: true });
    linea("COMERCIAL & BODEGA", { size: 11, center: true });

    // Un traslado anulado no debe usarse para recibir mercadería. Se avisa
    // arriba de todo, por si alguien reimprime uno viejo.
    if (t.TrasladoEstado === "A") {
      linea("*** ANULADO ***", { size: 12, center: true });
      linea("NO RECIBIR MERCADERIA", { size: 11, center: true });
    }

    linea(
      `Fecha: ${formatFecha(t.TrasladoFecha)} - Hora: ${horaDe(
        t.TrasladoFecha,
      )}`,
      { center: true },
    );
    linea(`DESDE: ${t.AlmacenOrigenNombre}`, { center: true });
    linea(`HACIA: ${t.AlmacenDestinoNombre}`, { center: true });
    if (t.UsuarioId) linea(`Despacho: ${t.UsuarioId}`, { center: true });
    if (t.TrasladoObs) linea(t.TrasladoObs, { center: true });

    // ── Encabezados de columna ──────────────────────────────────────────────
    // Mismo esquema que el ticket de venta: X_CANT es el centro de la columna
    // de cantidad y sale de la fuente activa, porque depende del ancho de sus
    // dígitos (ver `columnas` en ticketFuente.ts). Donde la venta pone
    // "Precio Unit." y "Total", acá va la unidad, alineada a la derecha.
    const { X_CANT } = COLUMNAS_TICKET;
    const X_UNIDAD = ANCHO;
    doc.setFont(FUENTE_TICKET, "bold");
    doc.setFontSize(8);
    doc.text("Desc.", 0, y);
    doc.text("Cant.", X_CANT, y, { align: "center" });
    doc.text("Unidad", X_UNIDAD, y, { align: "right" });
    doc.setFontSize(FUENTE);
    y += 3.5;
    separador();
    y += 2;

    // ── Detalle ─────────────────────────────────────────────────────────────
    // Un ítem por bloque: arriba una fila por unidad de traslado (cajas y/o
    // unidades) con la cantidad en su columna, y abajo el nombre del producto
    // ocupando todo el ancho.
    items.forEach((item) => {
      // El bloque completo (cantidades + nombre) no se parte entre dos hojas.
      const alto =
        item.filas.length * interlineado(CANTIDAD_PT) +
        interlineado(NOMBRE_PT) +
        (item.nombreOrigen ? interlineado(NOMBRE_PT - 1) : 0) +
        AIRE_ITEM;
      saltoSiNoEntra(alto);

      item.filas.forEach((fila) => {
        doc.setFont(FUENTE_TICKET, "bold");
        doc.setFontSize(CANTIDAD_PT);
        doc.text(formatMiles(fila.cantidad), X_CANT, y, { align: "center" });
        doc.setFontSize(FUENTE);
        doc.text(fila.unidad, X_UNIDAD, y, { align: "right" });
        y += interlineado(CANTIDAD_PT);
      });

      linea(item.nombre, { size: NOMBRE_PT });
      if (item.nombreOrigen) {
        linea(`(ORIGEN: ${item.nombreOrigen})`, {
          size: NOMBRE_PT - 1,
          x: 3,
        });
      }
      y += AIRE_ITEM;
    });

    // ── Totales ─────────────────────────────────────────────────────────────
    // El cierre (totales + firma) tampoco se parte entre dos hojas.
    saltoSiNoEntra(30);
    y += 1;
    separador();
    y += 2;

    linea(`ITEMS: ${formatMiles(lineas.length)}`);
    if (totalCajas > 0) linea(`TOTAL CAJAS: ${formatMiles(totalCajas)}`);
    if (totalUnidades > 0) {
      linea(`TOTAL UNIDADES: ${formatMiles(totalUnidades)}`);
    }

    // ── Conformidad ─────────────────────────────────────────────────────────
    // Una sola línea de firma: sin la firma del que recibe, el papel no deja
    // constancia de que alguien contó la mercadería.
    y += 8;
    doc.setLineWidth(0.3);
    doc.line(6, y, ANCHO - 6, y);
    y += 4;
    linea("RECIBI CONFORME", { size: 8, center: true });

    return y;
  };

  // La fuente se registra en cada documento que se crea: jsPDF la guarda
  // por instancia, no globalmente.
  const nuevoDoc = (alto: number) => {
    const d = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: [ANCHO_PAGINA, alto],
    });
    registrarFuenteTicket(d, fuente);
    return d;
  };

  // El ticket se dibuja dos veces: la primera sobre un documento descartable y
  // sin paginar, solo para saber cuánto ocupa a lo alto; la segunda sobre el
  // definitivo, ya con la página del tamaño que corresponde.
  //
  // Si entra en ALTO_MAXIMO_PAGINA va en una sola página del alto exacto del
  // contenido, que es lo ideal para un rollo continuo: sin cortes y sin papel
  // en blanco. Si no entra, se pagina a ese alto fijo — NO se puede dejar
  // crecer la página, porque una página más alta que el largo de formulario del
  // driver hace que el navegador escale por el alto y el ticket salga chico
  // (ver ALTO_MAXIMO_PAGINA en ticketPapel.ts).
  const medido = dibujar(nuevoDoc(297), Infinity) + MARGEN_INFERIOR;
  const unaSolaPagina = medido <= ALTO_MAXIMO_PAGINA;
  const alto = unaSolaPagina ? medido : ALTO_MAXIMO_PAGINA;

  const doc = nuevoDoc(alto);
  dibujar(doc, unaSolaPagina ? Infinity : alto - MARGEN_INFERIOR);

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
