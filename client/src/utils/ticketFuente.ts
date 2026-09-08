/**
 * Fuente del ticket: DejaVu Sans Condensed, peso regular, embebida en el PDF.
 *
 * ── Por qué se embebe una fuente ──────────────────────────────────────────────
 *
 * Las tres que trae jsPDF (helvetica, times, courier) son de las "base 14" del
 * estándar PDF, que NO se embeben: el visor las sustituye por una del sistema.
 * En Chrome sobre Windows, helvetica termina dibujándose con Arial, así que lo
 * que sale impreso dependía de qué tuviera instalada cada caja. Embebiendo la
 * fuente, todas imprimen exactamente igual. Además una fuente embebida maneja
 * Unicode de verdad, en vez de la codificación WinAnsi de las base 14.
 *
 * ── Por qué DejaVu Sans CONDENSED ─────────────────────────────────────────────
 *
 * Medido sobre la grilla de 72 dpi de la TM-U220 (ver `ticketPapel.ts`):
 *
 *   fuente                    altura de x   mayúsculas   dígitos   ancho
 *   Helvetica/Arial            0,532 em      0,718 em     0,710 em  100%
 *   DejaVu Sans                0,547 em      0,729 em     0,742 em  110%
 *   DejaVu Sans Condensed      0,547 em      0,729 em     0,742 em   89%
 *
 * La variante Condensed es la única usable: la normal es un 10% más ancha y con
 * ella cuatro líneas del ticket dejan de entrar en un renglón. Los glifos son
 * más altos que los de Arial, y los dígitos —que es lo que más importa en un
 * ticket— un 4,5% más. DejaVu viene de Bitstream Vera, diseñada para pantallas
 * de baja resolución, así que tiene los ojales y aperturas más abiertos.
 *
 * ── Por qué el peso REGULAR y no la negrita ───────────────────────────────────
 *
 * Esto es lo contraintuitivo. El ticket iba todo en negrita desde el principio,
 * con el razonamiento de que "el trazo fino sale gris". Eso vale para una
 * impresora térmica; esta es de impacto, y ahí el problema es el opuesto: la
 * aguja deja un punto de ~0,3 mm de diámetro, así que cada trazo engorda 0,3 mm
 * al imprimirse y cada hueco interno de la letra (el ojal de la a, e, o, 0, 8)
 * se come 0,3 mm. Si el ojal queda por debajo de ~0,15 mm, la letra se rellena
 * y sale como una mancha.
 *
 * Medido a 9 pt, que es el cuerpo del ticket:
 *
 *   peso       trazo     ojal del 0    ojal del 8    ojal del 8 IMPRESO
 *   negrita    0,50 mm   0,71 mm       0,45 mm       0,15 mm  ← se rellena
 *   regular    0,26 mm   0,92 mm       0,81 mm       0,51 mm  ← 3,4x más abierto
 *
 * Y el peso NO afecta las alturas: la regular tiene exactamente la misma altura
 * de x (0,547 em) y de mayúsculas (0,729 em) que la negrita. O sea que bajar el
 * peso no cuesta ni una fila de puntos de legibilidad y abre los ojales 3,4
 * veces. Tampoco se pierde negro: el trazo regular de 0,26 mm es más angosto que
 * el punto de 0,3 mm de la aguja, así que igual se imprime como una columna
 * entera de puntos, maciza.
 *
 * La regular es además ~10% más angosta, así que ninguna línea del ticket se
 * parte en dos renglones.
 *
 * ── Volver a la negrita ───────────────────────────────────────────────────────
 *
 * El subset de la negrita sigue en `assets/fonts/DejaVuSansCondensed-Bold.subset.ttf`.
 * Para volver, hay que regenerar el módulo base64 desde ese .ttf (el comando
 * está en la cabecera de `dejaVuSansCondensedRegular.ts`) y cambiar el import de
 * abajo. Las posiciones de columna del ticket (X_CANT=13, X_PRECIO=37,7) están
 * verificadas para los DOS pesos, así que no hay que recalcularlas: con la
 * negrita la separación mínima entre columnas es de 0,91 mm y con la regular de
 * 2,59 mm.
 */

/** Nombre con el que queda registrada la fuente en jsPDF. */
export const FUENTE_TICKET = "DejaVuSansCondensed";

const ARCHIVO = "DejaVuSansCondensed.ttf";

/** La fuente ya codificada, lista para registrar en un documento. */
export type FuenteTicket = { readonly base64: string };

/**
 * Baja la fuente. El `import()` es dinámico a propósito: son ~22 KB de base64 y
 * así quedan en su propio chunk, que sólo se descarga cuando alguien imprime un
 * ticket, en vez de sumar al bundle inicial de toda la aplicación.
 *
 * El resultado se cachea: el módulo queda en memoria después del primer ticket.
 */
export async function cargarFuenteTicket(): Promise<FuenteTicket> {
  const { DEJAVU_SANS_CONDENSED_REGULAR_BASE64 } = await import(
    "../assets/fonts/dejaVuSansCondensedRegular"
  );
  return { base64: DEJAVU_SANS_CONDENSED_REGULAR_BASE64 };
}

/**
 * Registra la fuente en un documento de jsPDF. Hay que llamarla en CADA
 * documento que se cree, antes del primer `setFont`: jsPDF guarda las fuentes
 * por instancia, no globalmente.
 *
 * El mismo archivo se registra bajo los dos estilos, "normal" y "bold". El
 * ticket llama a `setFont(FUENTE_TICKET, "bold")` en todos lados por herencia
 * del layout viejo, y lo que se dibuja son los contornos del peso regular (que
 * es lo que se quiere, ver arriba). Registrar los dos estilos evita que jsPDF
 * caiga de vuelta en una fuente sustituida del sistema si en algún lado se pide
 * el estilo que no está.
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
