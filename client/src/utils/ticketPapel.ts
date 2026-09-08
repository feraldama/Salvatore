/**
 * Geometría del papel del ticket — Epson TM-U220.
 *
 * La impresora NO es térmica: es matriz de puntos por impacto con cabeza de 9
 * agujas. Con papel de 76 mm su área imprimible real es de 63,4 mm (2,50"),
 * no los 80 mm que se usaban antes.
 *
 * Por qué importa: el ticket se abre en una pestaña del navegador y el visor
 * de PDF de Chrome imprime por defecto con "Ajustar al área de impresión". Si
 * la página del PDF es más ancha que 63,4 mm, Chrome la achica para que entre
 * (80 → 63,4 mm es un factor de 0,79) y todo el texto sale más chico de lo que
 * dice el código: un cuerpo de 9 pt terminaba imprimiéndose a ~7,1 pt.
 * Haciendo la página del ancho exacto del área imprimible, ese "ajuste" queda
 * en 1:1 y deja de achicar, sin tener que tocar nada en el diálogo de
 * impresión de cada caja.
 *
 * Verticalmente la impresora tiene ~72 dpi (9 agujas en 3,1 mm de alto de
 * carácter → 0,353 mm por fila de puntos). Eso deja poco margen para achicar
 * la letra: en helvetica negrita, 9 pt da una altura de x de 4,8 filas de
 * puntos y 8 pt ya son 4,3 filas, que es el piso de lo legible. No bajar de
 * 8 pt el cuerpo del ticket.
 *
 * Fuente: manual técnico TM-U220 (Epson, Rev. H), secciones 1.5 y
 * "Dot width of Printable area".
 */

/**
 * Ancho de la página del PDF, en mm. Igual al área imprimible de la TM-U220
 * para que el "Ajustar al área de impresión" de Chrome no escale nada.
 */
export const ANCHO_PAGINA = 63.4;

/**
 * Ancho útil para dibujar, en mm. Deja ~1,4 mm de resguardo a la derecha para
 * no depender de que el margen izquierdo del papel esté perfectamente
 * calibrado (el carro se puede correr un par de décimas).
 */
export const ANCHO_UTIL = 62;

/** Aire que se deja abajo del último renglón antes de cortar la página. */
export const MARGEN_INFERIOR = 6;
