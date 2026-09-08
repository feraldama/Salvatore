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

/**
 * Paso vertical de una fila de puntos de la TM-U220, en mm.
 *
 * La cabeza tiene 9 agujas repartidas en los 3,1 mm de alto de carácter, o sea
 * ~72 dpi: 25,4/72 = 0,3528 mm por fila. Es la unidad mínima en la que la
 * impresora puede poner tinta a lo alto.
 */
export const FILA_PUNTOS = 25.4 / 72;

/**
 * Interlineado (paso de un renglón al siguiente) para un cuerpo de `size`
 * puntos, en mm.
 *
 * Antes era `size * 0.5`, que para 9 pt son 4,5 mm de paso para un glifo que
 * mide 3,02 mm de alto (acentos incluidos): 1,49x, o sea un 33% de aire
 * vertical puro. Para texto denso lo sano va de 1,15x a 1,25x, así que se pasó
 * a `size * 0.4` (1,19x). El ticket se acorta ~24% y la letra no cambia: son
 * los mismos glifos, solo más cerca.
 *
 * El resultado se redondea a un número entero de filas de puntos. Si el paso no
 * es múltiplo de FILA_PUNTOS, cada renglón cae en un punto distinto de la grilla
 * de 72 dpi y el driver los redondea distinto, así que el espacio entre líneas
 * alterna entre 12 y 13 filas. Redondeando, todos los renglones quedan a la
 * misma distancia real sobre el papel.
 */
export const interlineado = (size: number) =>
  Math.round((size * 0.4) / FILA_PUNTOS) * FILA_PUNTOS;

/**
 * Cuerpo del renglón del nombre del producto, en puntos.
 *
 * Va un punto más chico que el resto del ticket (9 pt) y aun así se lee mejor,
 * porque el nombre se imprime SIEMPRE EN MAYÚSCULAS. Las mayúsculas se leen por
 * la altura de caja (0,718 em) y no por la altura de x (0,532 em), así que sobre
 * la grilla de 72 dpi de la impresora:
 *
 *   - cuerpo de 9 pt en minúsculas → 4,8 filas de puntos (la referencia)
 *   - nombre de 8 pt en MAYÚSCULAS → 5,7 filas de puntos
 *
 * De ahí que el nombre en 8 pt no sea un retroceso: tiene casi una fila entera
 * de puntos más que el texto que ya se venía leyendo bien. Es lo que permite
 * ganar largo de ticket sin recortar nombres, que era la alternativa.
 *
 * El piso es 7 pt (5,0 filas, todavía por encima de la referencia); a 6,5 pt las
 * mayúsculas caen a 4,7 y ahí sí se empieza a perder. Y el nombre tiene que ir
 * en mayúsculas de verdad (se fuerza con `toUpperCase`, no se confía en cómo
 * esté cargado el producto): en minúsculas, 8 pt da 4,3 filas y queda al límite.
 */
export const NOMBRE_PT = 8;

/**
 * Cuerpo de la cantidad, en puntos.
 *
 * Va más grande que el resto para que se lea de un saltazo. Estuvo en 13 pt y se
 * bajó a 10: era ella la que marcaba el alto de la fila de números y costaba
 * 1,3 mm por ítem. A 10 pt los dígitos siguen dando 7,2 filas de puntos, por
 * encima de las 6,5 de los importes en 9 pt, así que sigue destacando.
 */
export const CANTIDAD_PT = 10;

/** Aire entre el bloque de un ítem y el siguiente, en mm. */
export const AIRE_ITEM = 1;

/**
 * Alto máximo de una página del ticket, en mm. Pasado esto se pagina.
 *
 * Hace falta un techo porque el "Ajustar al área de impresión" del navegador
 * escala por `min(ancho_pagina / ancho_imprimible, alto_pagina / alto_imprimible)`.
 * El ancho ya está clavado en 1,00 con ANCHO_PAGINA, pero si la página es MÁS
 * ALTA que el largo de formulario que declara el driver, manda el factor del
 * alto y se achica todo igual. Con tickets de pocos ítems no se nota; con
 * muchos productos la página se va a 400-700 mm y el ticket sale ilegible.
 *
 * De dónde sale el número: con el layout viejo de 80 x 297 mm el factor
 * observado era 0,79, que es exactamente el del ancho (63,4 / 80). Para que el
 * ancho sea el que manda, el del alto tiene que haber sido mayor, o sea que el
 * alto imprimible del driver es de al menos 0,79 x 297 = 235 mm. 200 mm deja
 * un resguardo cómodo por debajo de ese piso.
 *
 * Si en la impresora se configura la escala en "Tamaño real" / 100% en lugar de
 * "Ajustar al área de impresión", este techo deja de hacer falta y el ticket
 * puede salir en una sola página continua sin cortes.
 */
export const ALTO_MAXIMO_PAGINA = 200;
