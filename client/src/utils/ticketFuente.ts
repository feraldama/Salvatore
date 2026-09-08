/**
 * Fuente del ticket: DejaVu Sans Condensed Bold, embebida en el PDF.
 *
 * Por qué no se usan las fuentes que trae jsPDF: las tres (helvetica, times,
 * courier) son de las "base 14" del estándar PDF, que NO se embeben — el visor
 * las sustituye por una del sistema. En Chrome sobre Windows, helvetica termina
 * dibujándose con Arial, así que lo que sale impreso depende de qué tenga
 * instalada cada caja. Embebiendo la fuente, todas imprimen exactamente igual.
 *
 * Por qué DejaVu Sans Condensed Bold, medido sobre la grilla de 72 dpi de la
 * TM-U220 (ver `ticketPapel.ts`):
 *
 *   fuente                    altura de x   mayúsculas   dígitos   ancho
 *   Helvetica/Arial Bold      0,532 em      0,718 em     0,710 em  100%
 *   DejaVu Sans Bold          0,547 em      0,729 em     0,742 em  110%
 *   DejaVu Sans Cond. Bold    0,547 em      0,729 em     0,742 em   99%
 *
 * La variante Condensed es la única usable: la normal es un 10% más ancha y con
 * ella cuatro líneas del ticket dejan de entrar en un renglón. La Condensed mide
 * lo mismo que Arial a lo ancho (99%) pero tiene los glifos más altos, y los
 * dígitos —que es lo que más importa en un ticket— un 4,5% más. DejaVu viene de
 * Bitstream Vera, diseñada para pantallas de baja resolución, así que tiene los
 * ojales y aperturas más abiertos que Helvetica: es justo lo que sobrevive al
 * punto de 0,3 mm que deja la aguja de una impresora de impacto.
 *
 * OJO: los dígitos son ~15% más anchos que los de Helvetica, aunque el texto en
 * general mida lo mismo. Las columnas de importes del ticket están calculadas
 * para esta fuente; si se cambia la fuente hay que recalcularlas.
 */

/** Nombre con el que queda registrada la fuente en jsPDF. */
export const FUENTE_TICKET = "DejaVuSansCondensed";

const ARCHIVO = "DejaVuSansCondensed-Bold.ttf";

/** La fuente ya codificada, lista para registrar en un documento. */
export type FuenteTicket = { readonly base64: string };

/**
 * Baja la fuente. El `import()` es dinámico a propósito: son ~20 KB de base64 y
 * así quedan en su propio chunk, que sólo se descarga cuando alguien imprime un
 * ticket, en vez de sumar al bundle inicial de toda la aplicación.
 *
 * El resultado se cachea: el módulo queda en memoria después del primer ticket.
 */
export async function cargarFuenteTicket(): Promise<FuenteTicket> {
  const { DEJAVU_SANS_CONDENSED_BOLD_BASE64 } = await import(
    "../assets/fonts/dejaVuSansCondensedBold"
  );
  return { base64: DEJAVU_SANS_CONDENSED_BOLD_BASE64 };
}

/**
 * Registra la fuente en un documento de jsPDF. Hay que llamarla en CADA
 * documento que se cree, antes del primer `setFont`: jsPDF guarda las fuentes
 * por instancia, no globalmente.
 *
 * Se registra el mismo archivo como "normal" y como "bold" porque el ticket va
 * todo en negrita (la impresora es de impacto: el trazo fino sale gris y cuesta
 * leerlo) y así un `setFont(FUENTE_TICKET, "normal")` no cae de vuelta en la
 * fuente sustituida del sistema.
 *
 * El `doc` va tipado laxo a propósito: el tipo de jsPDF sólo se importa como
 * tipo en los módulos del ticket y no vale la pena arrastrarlo hasta acá.
 */
export function registrarFuenteTicket(
  doc: {
    addFileToVFS: (nombre: string, datos: string) => void;
    addFont: (archivo: string, nombre: string, estilo: string) => void;
  },
  fuente: FuenteTicket,
): void {
  doc.addFileToVFS(ARCHIVO, fuente.base64);
  doc.addFont(ARCHIVO, FUENTE_TICKET, "bold");
  doc.addFont(ARCHIVO, FUENTE_TICKET, "normal");
}
