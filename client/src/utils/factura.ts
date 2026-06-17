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

const numeroALetras = (numero: number): string => {
  const unidades = [
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
  ];
  const decenas = [
    "",
    "DIEZ",
    "VEINTE",
    "TREINTA",
    "CUARENTA",
    "CINCUENTA",
    "SESENTA",
    "SETENTA",
    "OCHENTA",
    "NOVENTA",
  ];
  const centenas = [
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

  if (numero === 0) return "CERO";
  const entero = Math.floor(numero);
  if (entero < 10) return unidades[entero];
  if (entero < 100) {
    if (entero < 20) {
      const especiales = [
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
      ];
      return especiales[entero - 10];
    }
    const decena = Math.floor(entero / 10);
    const unidad = entero % 10;
    if (unidad === 0) return decenas[decena];
    return decenas[decena] + " Y " + unidades[unidad];
  }
  if (entero < 1000) {
    const centena = Math.floor(entero / 100);
    const resto = entero % 100;
    if (centena === 1 && resto === 0) return "CIEN";
    if (resto === 0) return centenas[centena];
    return centenas[centena] + " " + numeroALetras(resto);
  }
  if (entero < 1000000) {
    const miles = Math.floor(entero / 1000);
    const resto = entero % 1000;
    let resultado = miles === 1 ? "MIL" : numeroALetras(miles) + " MIL";
    if (resto > 0) resultado += " " + numeroALetras(resto);
    return resultado;
  }
  return numero.toLocaleString("es-PY") + " GUARANÍES";
};

const generarHoja = (venta: FacturaVenta, productos: FacturaProducto[]) => {
  const subtotalProductos = productos.reduce(
    (sum, p) => sum + (p.VentaProductoPrecioTotal || 0),
    0
  );
  const totalReal = venta.Total || subtotalProductos;
  const factorRecargo =
    subtotalProductos > 0 ? totalReal / subtotalProductos : 1;

  const productosConRecargo = productos.map((p) => {
    const precioUnitarioOriginal = p.VentaProductoPrecio || 0;
    const precioUnitarioConRecargo = Math.round(
      precioUnitarioOriginal * factorRecargo
    );
    const cantidad = p.VentaProductoCantidad || 0;
    const precioTotalConRecargo = Math.round(
      precioUnitarioConRecargo * cantidad
    );
    return {
      ...p,
      VentaProductoPrecioConRecargo: precioUnitarioConRecargo,
      VentaProductoPrecioTotalConRecargo: precioTotalConRecargo,
    };
  });

  const subtotalConRecargo = productosConRecargo.reduce(
    (sum, p) => sum + (p.VentaProductoPrecioTotalConRecargo || 0),
    0
  );

  const diferenciaRedondeo = totalReal - subtotalConRecargo;
  if (diferenciaRedondeo !== 0 && productosConRecargo.length > 0) {
    const ultimoProducto = productosConRecargo[productosConRecargo.length - 1];
    ultimoProducto.VentaProductoPrecioTotalConRecargo =
      (ultimoProducto.VentaProductoPrecioTotalConRecargo || 0) +
      diferenciaRedondeo;
    const cantidadUltimo = ultimoProducto.VentaProductoCantidad || 1;
    ultimoProducto.VentaProductoPrecioConRecargo = Math.round(
      ultimoProducto.VentaProductoPrecioTotalConRecargo / cantidadUltimo
    );
  }

  const ivaReal = calcularIVA(totalReal);

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
        ${productosConRecargo
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
          { length: Math.max(0, 16 - productosConRecargo.length) },
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
              totalReal
            )}</span>
          </p>
          <p style="display: flex; justify-content: space-between;">
            <span style="margin-left: 80px;" class="total-letras">${numeroALetras(
              totalReal
            )}</span>
            <span style="margin-right: 30px;" class="subtotal">${formatearNumero(
              totalReal
            )}</span>
          </p>
          <p style="display: flex; justify-content: space-between; margin-top: -5px;">
            <span style="margin-left: 110px;" class="liquidacion-iva">0</span>
            <span style="margin-left: 0px;" class="liquidacion-iva">${formatearNumero(
              ivaReal
            )}</span>
            <span style="margin-right: 320px;" class="total-iva">${formatearNumero(
              ivaReal
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
          .factura { page-break-after: avoid; }
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
      ${generarHoja(venta, productos)}
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
