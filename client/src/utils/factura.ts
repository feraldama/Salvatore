// Generación e impresión de la FACTURA fiscal (formato triplicado, preimpreso).
// Extraído de InvoicePrintModal para poder reutilizarlo: imprimir la factura al
// DESPACHAR un delivery (para que el chofer la lleve) y/o al cobrarlo, además de
// la impresión por búsqueda de ventas. La factura NO muestra desglose de método
// de pago, así que sirve igual antes o después de registrar el cobro.

import { calcularDV, formatFecha } from "./utils";

export interface FacturaVenta {
  VentaId: number;
  VentaFecha: string;
  Total?: number;
  ClienteRazonSocial?: string;
  ClienteRUC?: string;
  ClienteTelefono?: string;
  ClienteDireccion?: string;
}

export interface FacturaProducto {
  VentaProductoCantidad?: number;
  VentaProductoPrecio?: number;
  VentaProductoPrecioTotal?: number;
  ProductoNombre?: string;
  ProductoCodigo?: string;
}

const calcularNroFactura = (venta: FacturaVenta) => venta.VentaId;

const calcularIVA = (total: number) => {
  if (total === undefined || total === null || isNaN(total)) return 0;
  return total / 11; // IVA 10%
};

const formatearNumero = (numero: number) => {
  if (numero === undefined || numero === null || isNaN(numero)) return "0";
  return Math.round(numero).toLocaleString("es-PY");
};

// Monto en letras para el "TOTAL A PAGAR" del formulario. Cubre hasta el orden
// de los millones: la versión anterior solo llegaba a 999.999 y todo monto
// mayor caía a un fallback que imprimía los DÍGITOS ("1.262.200 GUARANÍES"),
// justamente lo que no se quiere en una factura.
const UNIDADES = [
  "",
  "UNO",
  "DOS",
  "TRES",
  "CUATRO",
  "CINCO",
  "SEIS",
  "SIETE",
  "OCHO",
  "NUEVE",
  "DIEZ",
  "ONCE",
  "DOCE",
  "TRECE",
  "CATORCE",
  "QUINCE",
  "DIECISÉIS",
  "DIECISIETE",
  "DIECIOCHO",
  "DIECINUEVE",
  "VEINTE",
  "VEINTIUNO",
  "VEINTIDÓS",
  "VEINTITRÉS",
  "VEINTICUATRO",
  "VEINTICINCO",
  "VEINTISÉIS",
  "VEINTISIETE",
  "VEINTIOCHO",
  "VEINTINUEVE",
];

const DECENAS = [
  "",
  "",
  "VEINTE",
  "TREINTA",
  "CUARENTA",
  "CINCUENTA",
  "SESENTA",
  "SETENTA",
  "OCHENTA",
  "NOVENTA",
];

const CENTENAS = [
  "",
  "CIENTO",
  "DOSCIENTOS",
  "TRESCIENTOS",
  "CUATROCIENTOS",
  "QUINIENTOS",
  "SEISCIENTOS",
  "SETECIENTOS",
  "OCHOCIENTOS",
  "NOVECIENTOS",
];

// Convierte 1..999. `apocope` = el tramo va seguido de MIL o MILLONES, donde
// "UNO" se acorta a "UN" y "VEINTIUNO" a "VEINTIÚN" (ej. VEINTIÚN MIL).
const tramoALetras = (n: number, apocope: boolean): string => {
  if (n <= 0) return "";
  if (n === 100) return "CIEN";

  const centena = Math.floor(n / 100);
  const resto = n % 100;
  const partes: string[] = [];

  if (centena > 0) partes.push(CENTENAS[centena]);

  if (resto > 0) {
    if (resto < 30) {
      if (apocope && resto === 1) partes.push("UN");
      else if (apocope && resto === 21) partes.push("VEINTIÚN");
      else partes.push(UNIDADES[resto]);
    } else {
      const decena = Math.floor(resto / 10);
      const unidad = resto % 10;
      if (unidad === 0) partes.push(DECENAS[decena]);
      else if (apocope && unidad === 1) partes.push(`${DECENAS[decena]} Y UN`);
      else partes.push(`${DECENAS[decena]} Y ${UNIDADES[unidad]}`);
    }
  }

  return partes.join(" ");
};

// Convierte 1..999.999 (el bloque que se repite antes de MILLONES).
const bloqueALetras = (n: number, apocope: boolean): string => {
  const miles = Math.floor(n / 1000);
  const resto = n % 1000;
  const partes: string[] = [];

  if (miles === 1) partes.push("MIL");
  else if (miles > 1) partes.push(`${tramoALetras(miles, true)} MIL`);

  if (resto > 0) partes.push(tramoALetras(resto, apocope));

  return partes.join(" ");
};

const numeroALetras = (numero: number): string => {
  if (!Number.isFinite(numero)) return "CERO";
  const entero = Math.floor(Math.abs(numero));
  if (entero === 0) return "CERO";

  const millones = Math.floor(entero / 1000000);
  const resto = entero % 1000000;
  const partes: string[] = [];

  if (millones === 1) partes.push("UN MILLÓN");
  else if (millones > 1) partes.push(`${bloqueALetras(millones, true)} MILLONES`);

  if (resto > 0) partes.push(bloqueALetras(resto, false));

  return partes.join(" ");
};

// El formulario preimpreso tiene lugar para 16 líneas de ítems. Si la venta
// tiene más, NO se comprime nada: se continúa en hojas adicionales (cada hoja
// es un formulario, con su propio número preimpreso) y cada una liquida el
// total de los ítems que entraron en ELLA. La suma de los totales de todas las
// hojas da el Total de la venta.
export const FILAS_POR_HOJA = 16;

// Cuántos formularios preimpresos consume la factura de esta venta. Lo usa la
// UI para avisar al operador cuántas hojas cargar en la impresora.
export const cantidadHojasFactura = (cantidadItems: number) =>
  Math.max(1, Math.ceil((cantidadItems || 0) / FILAS_POR_HOJA));

type LineaFactura = FacturaProducto & {
  VentaProductoPrecioConRecargo: number;
  VentaProductoPrecioTotalConRecargo: number;
};

// Aplica el recargo (Total de la venta vs. suma de los ítems) y absorbe la
// diferencia de redondeo en el último ítem, para que la suma de las líneas dé
// exactamente el Total. Se calcula sobre TODOS los ítems ANTES de repartirlos
// en hojas: así el corte por hoja no altera ningún importe.
const calcularLineas = (
  venta: FacturaVenta,
  productos: FacturaProducto[]
): LineaFactura[] => {
  const subtotalProductos = productos.reduce(
    (sum, p) => sum + (p.VentaProductoPrecioTotal || 0),
    0
  );
  const totalReal = venta.Total || subtotalProductos;
  const factorRecargo =
    subtotalProductos > 0 ? totalReal / subtotalProductos : 1;

  const lineas: LineaFactura[] = productos.map((p) => {
    const precioUnitarioConRecargo = Math.round(
      (p.VentaProductoPrecio || 0) * factorRecargo
    );
    const cantidad = p.VentaProductoCantidad || 0;
    return {
      ...p,
      VentaProductoPrecioConRecargo: precioUnitarioConRecargo,
      VentaProductoPrecioTotalConRecargo: Math.round(
        precioUnitarioConRecargo * cantidad
      ),
    };
  });

  const subtotalConRecargo = lineas.reduce(
    (sum, p) => sum + p.VentaProductoPrecioTotalConRecargo,
    0
  );
  const diferenciaRedondeo = totalReal - subtotalConRecargo;
  if (diferenciaRedondeo !== 0 && lineas.length > 0) {
    const ultimaLinea = lineas[lineas.length - 1];
    ultimaLinea.VentaProductoPrecioTotalConRecargo += diferenciaRedondeo;
    const cantidadUltimo = ultimaLinea.VentaProductoCantidad || 1;
    ultimaLinea.VentaProductoPrecioConRecargo = Math.round(
      ultimaLinea.VentaProductoPrecioTotalConRecargo / cantidadUltimo
    );
  }

  return lineas;
};

// Reparte las líneas en hojas de FILAS_POR_HOJA ítems.
const repartirEnHojas = (lineas: LineaFactura[]): LineaFactura[][] => {
  const hojas: LineaFactura[][] = [];
  for (let i = 0; i < lineas.length; i += FILAS_POR_HOJA) {
    hojas.push(lineas.slice(i, i + FILAS_POR_HOJA));
  }
  return hojas.length > 0 ? hojas : [[]];
};

// Una hoja = un formulario preimpreso completo: las 3 copias (original,
// duplicado, triplicado) del mismo contenido en una A4.
const generarHoja = (venta: FacturaVenta, lineas: LineaFactura[]) => {
  const totalHoja = lineas.reduce(
    (sum, p) => sum + p.VentaProductoPrecioTotalConRecargo,
    0
  );
  const ivaHoja = calcularIVA(totalHoja);

  const facturaIndividual = `
    <div class="factura">
      <div class="cliente-info">
        <div class="cliente-left">
          <p style="margin-left: 295px;">
            <span>${formatFecha(venta.VentaFecha)}</span>
            <span style="margin-left: 202px;">Contado</span>
          </p>
          <p style="margin-left: 320px;">${
            venta.ClienteRazonSocial || "N/A"
          }</p>
          <p style="margin-left: 280px;">
            <span>${
              venta.ClienteRUC
                ? `${venta.ClienteRUC}-${calcularDV(venta.ClienteRUC)}`
                : "N/A"
            }</span>
            <span style="margin-left: 75px;">${
              venta.ClienteTelefono || ""
            }</span>
          </p>
          <p style="margin-left: 300px; margin-bottom: 15px;">${
            venta.ClienteDireccion || "Sin dirección registrada"
          }</p>
        </div>
      </div>

      <div class="productos-lista">
        ${lineas
          .map(
            (p) => `
          <div class="producto-item">
            <span class="col-cantidad">${p.VentaProductoCantidad || 0}</span>
            <span class="col-descripcion">${
              p.ProductoNombre || p.ProductoCodigo || "Producto sin descripción"
            }</span>
            <span class="col-precio">${formatearNumero(
              p.VentaProductoPrecioConRecargo || p.VentaProductoPrecio || 0
            )}</span>
            <span class="col-exentas">0</span>
            <span class="col-iva5">0</span>
            <span style="margin-right: 30px;" class="col-iva10">${formatearNumero(
              p.VentaProductoPrecioTotalConRecargo ||
                p.VentaProductoPrecioTotal ||
                0
            )}</span>
          </div>
        `
          )
          .join("")}

        ${Array.from(
          { length: Math.max(0, FILAS_POR_HOJA - lineas.length) },
          () => `
          <div class="producto-item">
            <span class="col-cantidad">&nbsp;</span>
            <span class="col-descripcion">&nbsp;</span>
            <span class="col-precio">&nbsp;</span>
            <span class="col-exentas">&nbsp;</span>
            <span class="col-iva5">&nbsp;</span>
            <span class="col-iva10">&nbsp;</span>
          </div>
        `
        ).join("")}
      </div>

      <div class="totales" style="margin-top: -9px;">
        <div class="totales-left">
          <p style="display: flex; justify-content: flex-end;">
            <span style="margin-right: 30px;" class="subtotal">${formatearNumero(
              totalHoja
            )}</span>
          </p>
          <p style="display: flex; justify-content: space-between;">
            <span style="margin-left: 80px;" class="total-letras">${numeroALetras(
              totalHoja
            )}</span>
            <span style="margin-right: 30px;" class="subtotal">${formatearNumero(
              totalHoja
            )}</span>
          </p>
          <p style="display: flex; justify-content: space-between; margin-top: -5px;">
            <span style="margin-left: 110px;" class="liquidacion-iva">0</span>
            <span style="margin-left: 0px;" class="liquidacion-iva">${formatearNumero(
              ivaHoja
            )}</span>
            <span style="margin-right: 320px;" class="total-iva">${formatearNumero(
              ivaHoja
            )}</span>
          </p>
        </div>
      </div>
    </div>
  `;

  const separacion1 = `<div style="height: 0px; margin: -15px 0 0 0; padding: 0;"></div>`;
  const separacion2 = `<div style="height: 0px; margin: -14px 0 0 0; padding: 0;"></div>`;

  return (
    facturaIndividual + separacion1 + facturaIndividual + separacion2 + facturaIndividual
  );
};

export const generarContenidoFactura = (
  venta: FacturaVenta,
  productos: FacturaProducto[]
) => {
  const nroFactura = calcularNroFactura(venta);

  if (!productos || productos.length === 0) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Error - Factura ${nroFactura}</title>
        <style>
          body { font-family: Arial, sans-serif; font-size: 14px; text-align: center; padding: 50px; }
          .error { color: red; }
        </style>
      </head>
      <body>
        <h1 class="error">Error al generar factura</h1>
        <p>La venta seleccionada no tiene productos asociados.</p>
        <p>Venta ID: ${nroFactura}</p>
      </body>
      </html>
    `;
  }

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Factura ${nroFactura}</title>
      <style>
        @media print {
          body { margin: 0; padding: 0; }
          /* Las 3 copias de una hoja no se separan; la última copia queda sin
             'avoid' para que no compita con el salto de hoja siguiente. */
          .factura:not(:last-child) { page-break-after: avoid; }
          .hoja + .hoja { page-break-before: always; break-before: page; }
          @page { margin: 0; size: A4; }
          body::before, body::after, *::before, *::after { display: none !important; }
        }
        body { font-family: Arial, sans-serif; font-size: 12px; margin: 0; padding: 0; }
        .factura { margin: 0; padding: 32px 20px 20px 20px; }
        .header { text-align: center; margin-bottom: 20px; }
        .header h2 { margin: 0; font-size: 18px; }
        .cliente-info { margin-bottom: 10px; display: flex; justify-content: space-between; align-items: flex-start; }
        .cliente-left { flex: 1; margin-right: 20px; }
        .cliente-left p { margin: 2px 0; font-size: 11px; text-align: left; min-height: 15px; }
        .cliente-right { flex: 0 0 auto; text-align: right; }
        .factura-details p { margin: 2px 0; font-size: 10px; text-align: right; }
        .factura-series { font-size: 12px !important; margin: 5px 0 !important; }
        .factura-number { font-size: 16px !important; margin: 5px 0 !important; }
        .productos-lista { margin-bottom: 2px; margin-top: 10px; }
        .productos-header { display: flex; font-weight: bold; font-size: 10px; border-bottom: 1px solid #ccc; padding-bottom: 5px; margin-bottom: 10px; }
        .producto-item { display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px; font-size: 10px; }
        .col-cantidad { width: 60px; text-align: center; font-weight: bold; }
        .col-descripcion { flex: 1; text-align: left; margin: 0 10px; }
        .col-precio { width: 80px; text-align: right; margin-right: 10px; }
        .col-exentas { width: 60px; text-align: center; }
        .col-iva5 { width: 60px; text-align: center; }
        .col-iva10 { width: 60px; text-align: center; }
        .totales { margin-top: 10px; padding-top: 5px; display: flex; justify-content: space-between; }
        .totales-left { flex: 1; }
        .totales-right { flex: 0 0 auto; text-align: right; }
        .total-letras { font-size: 11px; font-weight: bold; margin-bottom: 0; text-transform: uppercase; line-height: 1; }
        .liquidacion-iva { font-size: 11px; margin: 0; min-height: 8px; line-height: 1; }
        .subtotal { text-align: right; font-weight: bold; margin: 0; font-size: 12px; line-height: 1; }
        .total-iva { text-align: right; margin: 0; font-size: 11px; font-weight: bold; line-height: 1; }
      </style>
    </head>
    <body>
      ${repartirEnHojas(calcularLineas(venta, productos))
        .map((lineas) => `<div class="hoja">${generarHoja(venta, lineas)}</div>`)
        .join("")}
    </body>
    </html>
  `;
};

// Abre una ventana de impresión con la factura de la venta indicada.
export const imprimirFactura = (
  venta: FacturaVenta,
  productos: FacturaProducto[]
) => {
  const contenido = generarContenidoFactura(venta, productos);
  const ventana = window.open("", "_blank");
  if (!ventana) return;
  ventana.document.title = "";
  ventana.document.write(contenido);
  ventana.document.close();
  ventana.onload = () => ventana.print();
  setTimeout(() => {
    if (ventana.document.readyState === "complete") ventana.print();
  }, 300);
};
