/**
 * Fuente del ticket, embebida en el PDF.
 *
 * Para cambiar de fuente hay UNA sola línea que tocar: `FUENTE_ACTIVA`, al final
 * de este archivo. Las posiciones de las columnas de importes viajan junto a
 * cada fuente, porque dependen del ancho de sus dígitos, así que se ajustan
 * solas al cambiar.
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
 * ── Qué hace legible una fuente en ESTA impresora ─────────────────────────────
 *
 * La TM-U220 es de impacto, con ~72 dpi verticales (0,353 mm por fila de puntos,
 * ver `ticketPapel.ts`) y una aguja que deja un punto de ~0,3 mm de diámetro.
 * De ahí salen dos criterios, y hay que cumplir los dos:
 *
 *   1. ALTURA. Cuanto más alta la letra respecto del cuerpo, más filas de puntos
 *      la dibujan. El piso práctico son ~4,8 filas para minúsculas a 9 pt.
 *
 *   2. OJALES ABIERTOS. Cada trazo engorda 0,3 mm al imprimirse, así que cada
 *      hueco interno de la letra (el de la a, e, o, 0, 8) se come 0,3 mm. Si
 *      queda por debajo de ~0,15 mm, la letra se rellena y sale como mancha.
 *      Esto castiga a las negritas: son justo las que tienen los ojales chicos.
 *
 * Medido sobre los contornos reales de los glifos, a 9 pt. El "peor ojal" es el
 * más cerrado de la 'e', la 'o' y el '0', ya con los 0,3 mm de la aguja
 * descontados: por debajo de 0,15 mm la letra se rellena.
 *
 *   fuente                          altura x   filas   peor ojal   ancho
 *   ── sans ──────────────────────────────────────────────────────────────
 *   Helvetica/Arial (la original)   0,532 em   4,8     —           95%
 *   DejaVu Cond. Regular            0,547 em   4,9     0,21 mm ✓   100%
 *   DejaVu Cond. Bold               0,547 em   4,9     0,15 mm ✗   112%
 *   Atkinson Hyperlegible Regular   0,496 em   4,5     0,07 mm ✗   103%
 *   Atkinson Hyperlegible Bold      0,496 em   4,5    −0,44 mm ✗✗  109%
 *   ── serif y slab ──────────────────────────────────────────────────────
 *   Noto Serif Regular              0,536 em   4,8     0,26 mm ✓   106%
 *   Bitter Regular (slab)           0,532 em   4,8     0,70 mm ✓   103%
 *   PT Serif Regular                0,500 em   4,5     0,25 mm ✓   103%
 *   Charis SIL Bold                 0,488 em   4,4     0,13 mm ✗   109%
 *   Charis SIL Regular              0,482 em   4,3     0,14 mm ✗   105%
 *   Gentium (Plus / Book Plus)      0,454 em   4,1     0,40 mm     90%
 *   Zilla Slab Regular              0,445 em   4,0     0,14 mm ✗   100%
 *   Times New Roman                 0,447 em   4,0     0,08 mm ✗   109%
 *
 * Las que no están en el registro de abajo se descartaron por quedar debajo de
 * la actual en las dos columnas que importan. Times además tiene un problema
 * propio: sus serifas miden 0,057 mm, la sexta parte de una fila de puntos, así
 * que ni se pueden dibujar.
 *
 * El peso NO cambia las alturas: la DejaVu regular tiene exactamente la misma
 * altura de x y de mayúsculas que su negrita. O sea que bajar el peso no cuesta
 * ni una fila de puntos y abre los ojales 3,4 veces. Tampoco se pierde negro: un
 * trazo de 0,26 mm es más angosto que el punto de 0,3 mm de la aguja, así que se
 * imprime igual como una columna entera de puntos, maciza. La idea de que el
 * ticket tenía que ir en negrita venía de suponer que la impresora era térmica.
 */

/** Una fuente candidata, con todo lo que el ticket necesita para usarla. */
export type OpcionFuente = {
  /** Nombre con el que se registra en jsPDF. */
  readonly nombre: string;
  /** Nombre del archivo dentro del sistema de archivos virtual de jsPDF. */
  readonly archivo: string;
  /** Trae el base64. Es `import()` dinámico: ver `cargarFuenteTicket`. */
  readonly cargarBase64: () => Promise<string>;
  /**
   * Posiciones de las columnas de importes, en mm, calculadas para el ancho de
   * los dígitos de ESTA fuente. `X_CANT` es el centro de la columna de cantidad;
   * `X_PRECIO` es el borde derecho de la de precio unitario (el de la columna
   * Total es siempre `ANCHO_UTIL`).
   *
   * Verificadas con el peor caso simultáneo: cantidad de 5 dígitos en 10 pt,
   * precio de 8 dígitos y total de 10 dígitos en 9 pt, más la fila de rótulos
   * en 8 pt.
   */
  readonly columnas: { readonly X_CANT: number; readonly X_PRECIO: number };
};

/**
 * DejaVu Sans Condensed, peso regular.
 *
 * Es la que mejor mide de todas las probadas: la altura más grande (0,547 em de
 * altura de x, contra 0,532 de Arial) y los ojales más abiertos (0,51 mm
 * impresos). Viene de Bitstream Vera, diseñada para pantallas de baja
 * resolución, así que tiene las aperturas más abiertas que Helvetica. La
 * variante Condensed es la que se usa porque la normal es un 10% más ancha y con
 * ella cuatro líneas del ticket dejan de entrar en un renglón.
 *
 * Separación mínima entre columnas en el peor caso: 2,59 mm.
 */
const DEJAVU_SANS_CONDENSED: OpcionFuente = {
  nombre: "DejaVuSansCondensed",
  archivo: "DejaVuSansCondensed.ttf",
  cargarBase64: async () =>
    (await import("../assets/fonts/dejaVuSansCondensedRegular"))
      .DEJAVU_SANS_CONDENSED_REGULAR_BASE64,
  columnas: { X_CANT: 13, X_PRECIO: 37.7 },
};

/**
 * Atkinson Hyperlegible Regular (Braille Institute).
 *
 * ⚠ Preparada para probar, pero las mediciones dicen que en ESTA impresora va a
 * salir peor que la DejaVu, no mejor. Está diseñada para máxima distinción de
 * caracteres (0/O, 1/l/I inconfundibles) leyendo en papel o pantalla a
 * resolución normal, y para eso es excelente. Pero acá pierde por los dos
 * criterios de arriba:
 *
 *   - altura de x 0,496 em contra 0,547 de la DejaVu: un 9% más chica, o sea
 *     4,5 filas de puntos en lugar de 4,9;
 *   - trazo de 0,49 mm — casi tan pesado como la DejaVu NEGRITA (0,50 mm) que el
 *     cliente ya rechazó por manchada. El ojal del 8 queda en 0,07 mm impresos,
 *     todavía menos que los 0,15 mm de esa negrita.
 *
 * O sea que es esperable que rellene los dígitos más que lo que ya se descartó.
 * Subirle el cuerpo no alcanza: para que el ojal del 8 llegue a 0,3 mm impresos
 * habría que imprimirla a ~14,6 pt, que no entra en el papel.
 *
 * La variante Bold no se preparó a propósito: su ojal del 8 da −0,44 mm, o sea
 * que el hueco desaparece por completo y el 8 sale como un bloque.
 *
 * Separación mínima entre columnas en el peor caso: 1,58 mm.
 */
const ATKINSON_HYPERLEGIBLE: OpcionFuente = {
  nombre: "AtkinsonHyperlegible",
  archivo: "AtkinsonHyperlegible.ttf",
  cargarBase64: async () =>
    (await import("../assets/fonts/atkinsonHyperlegibleRegular"))
      .ATKINSON_HYPERLEGIBLE_REGULAR_BASE64,
  columnas: { X_CANT: 18.1, X_PRECIO: 40.4 },
};

/**
 * Charis SIL Regular (SIL International).
 *
 * La opción serif, para cuando se pide "algo parecido a Times New Roman". De las
 * serif es la mejor candidata para esta impresora y no por casualidad: viene de
 * Bitstream Charter, que Matthew Carter diseñó en 1987 pensando en impresoras de
 * baja resolución — láser de 300 dpi y matriz de puntos. Sus serifas son gruesas
 * a propósito, en vez de los pelos de Times, justamente para sobrevivir a una
 * grilla gruesa.
 *
 * Igual es un paso atrás respecto de la DejaVu, y conviene tenerlo claro:
 *
 *   fuente               altura x   filas 9pt   ojal 'e' impreso   ancho
 *   DejaVu Cond. Reg.    0,547 em   4,9         0,21 mm            100%
 *   Charis SIL Regular   0,482 em   4,3         0,14 mm            107%
 *   Times New Roman      0,447 em   4,0         0,08 mm            109%
 *
 * O sea: mejor que Times en las dos cosas, pero por debajo de la sans. A 9 pt da
 * 4,3 filas de puntos contra las 4,9 de la DejaVu, y el ojal de la 'e' queda en
 * 0,14 mm impresos, justo en el borde de rellenarse.
 *
 * Ese riesgo está acotado a las minúsculas, que en el ticket sólo aparecen en el
 * encabezado ("Distribuidora Salvatore", "Teléfono", "Fecha", "Cliente:"). Los
 * nombres de producto van todos en MAYÚSCULAS (ver NOMBRE_PT en ticketPapel.ts)
 * y las mayúsculas no tienen ojales tan cerrados como la 'e'.
 *
 * Si el cliente la elige y le parece chica, la compensación es subir el cuerpo de
 * 9 a 10 pt (a 10 pt da 4,8 filas, igual que la DejaVu a 9). Eso alarga el ticket
 * ~10%, así que es una decisión a tomar con él y no de entrada: conviene mostrar
 * primero la fuente sola, sin cambiar tamaños, para que se vea qué cambió.
 *
 * Separación mínima entre columnas en el peor caso: 1,56 mm.
 */
const CHARIS_SIL: OpcionFuente = {
  nombre: "CharisSIL",
  archivo: "CharisSIL.ttf",
  cargarBase64: async () =>
    (await import("../assets/fonts/charisSilRegular")).CHARIS_SIL_REGULAR_BASE64,
  columnas: { X_CANT: 17.3, X_PRECIO: 39.9 },
};

/**
 * Noto Serif Regular (proyecto Noto).
 *
 * La mejor serif medida, y por márgenes claros sobre Charis: 4,8 filas de puntos
 * contra 4,3 (la letra es un 11% más alta) y el ojal más cerrado queda en
 * 0,26 mm impresos contra 0,14 (casi el doble de abierto). Sólo es un 6% más
 * ancha y ninguna línea del ticket se parte.
 *
 * Viene de la familia Droid Serif, que Steve Matteson diseñó para pantallas de
 * baja resolución, así que las serifas son robustas y no pelos como las de
 * Times. Es la candidata a mostrarle al cliente si le gustó Charis: mismo aire
 * de serif, mejor en las dos métricas que importan acá.
 *
 * Separación mínima entre columnas en el peor caso: 1,77 mm.
 */
const NOTO_SERIF: OpcionFuente = {
  nombre: "NotoSerif",
  archivo: "NotoSerif.ttf",
  cargarBase64: async () =>
    (await import("../assets/fonts/notoSerifRegular")).NOTO_SERIF_REGULAR_BASE64,
  columnas: { X_CANT: 17.6, X_PRECIO: 40.1 },
};

/**
 * Bitter Regular (slab serif).
 *
 * La opción de serifa gruesa. Empata con Noto Serif en altura (4,8 filas) y
 * tiene los ojales MÁS ABIERTOS de todas las candidatas, sans incluidas:
 * 0,70 mm impresos, más del triple que la actual. Es slab, o sea que las
 * serifas son bloques rectangulares en vez de remates finos — justo la forma
 * que mejor sobrevive a una grilla de puntos gruesa.
 *
 * Fue diseñada específicamente para leerse en pantallas de baja resolución, que
 * es casi exactamente el problema de esta impresora.
 *
 * Se ve más mecánica que Noto Serif, tipo máquina de escribir con serifas
 * cuadradas. Si al cliente le gusta ese carácter, es la más robusta de todas.
 *
 * Separación mínima entre columnas en el peor caso: 1,75 mm.
 */
const BITTER: OpcionFuente = {
  nombre: "Bitter",
  archivo: "Bitter.ttf",
  cargarBase64: async () =>
    (await import("../assets/fonts/bitterRegular")).BITTER_REGULAR_BASE64,
  columnas: { X_CANT: 18.6, X_PRECIO: 40.6 },
};

/** Las fuentes preparadas para el ticket. Sólo se descarga la activa. */
export const FUENTES = {
  DEJAVU_SANS_CONDENSED,
  NOTO_SERIF,
  BITTER,
  CHARIS_SIL,
  ATKINSON_HYPERLEGIBLE,
} as const;

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  LA FUENTE DEL TICKET. Cambiar esta línea y listo: el nombre y las       │
 * │  columnas de importes se ajustan solos.                                  │
 * │                                                                          │
 * │    FUENTES.DEJAVU_SANS_CONDENSED   sans, la que mejor mide (4,9 filas)   │
 * │    FUENTES.NOTO_SERIF              serif, la mejor de las serif (4,8)    │
 * │    FUENTES.BITTER                  slab, los ojales más abiertos (4,8)   │
 * │    FUENTES.CHARIS_SIL              serif tipo Times (4,3, ojal justo)    │
 * │    FUENTES.ATKINSON_HYPERLEGIBLE   preparada, pero va a manchar          │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export const FUENTE_ACTIVA: OpcionFuente = FUENTES.NOTO_SERIF;

/** Nombre de la fuente activa, para los `setFont` del ticket. */
export const FUENTE_TICKET = FUENTE_ACTIVA.nombre;

/** Columnas de importes de la fuente activa. */
export const COLUMNAS_TICKET = FUENTE_ACTIVA.columnas;

/** La fuente ya codificada, lista para registrar en un documento. */
export type FuenteTicket = { readonly base64: string };

/**
 * Baja la fuente activa. El `import()` es dinámico a propósito: son ~22 KB de
 * base64 y así quedan en su propio chunk, que sólo se descarga cuando alguien
 * imprime un ticket, en vez de sumar al bundle inicial de toda la aplicación.
 * Las fuentes que no están activas no se descargan nunca.
 *
 * El resultado se cachea: el módulo queda en memoria después del primer ticket.
 */
export async function cargarFuenteTicket(): Promise<FuenteTicket> {
  return { base64: await FUENTE_ACTIVA.cargarBase64() };
}

/**
 * Registra la fuente en un documento de jsPDF. Hay que llamarla en CADA
 * documento que se cree, antes del primer `setFont`: jsPDF guarda las fuentes
 * por instancia, no globalmente.
 *
 * El mismo archivo se registra bajo los dos estilos, "normal" y "bold". El
 * ticket llama a `setFont(FUENTE_TICKET, "bold")` en todos lados por herencia
 * del layout viejo, y lo que se dibuja son los contornos del archivo que haya
 * (peso regular, que es lo que se quiere: ver arriba). Registrar los dos estilos
 * evita que jsPDF caiga de vuelta en una fuente sustituida del sistema si en
 * algún lado se pide el estilo que no está.
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
  doc.addFileToVFS(FUENTE_ACTIVA.archivo, fuente.base64);
  doc.addFont(FUENTE_ACTIVA.archivo, FUENTE_ACTIVA.nombre, "bold");
  doc.addFont(FUENTE_ACTIVA.archivo, FUENTE_ACTIVA.nombre, "normal");
}
