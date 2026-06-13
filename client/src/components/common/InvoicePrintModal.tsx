import React, { useState, useEffect, useCallback } from "react";
import Swal from "sweetalert2";
import {
  PrinterIcon,
  MagnifyingGlassIcon,
} from "@heroicons/react/24/outline";
import {
  getVentasPaginated,
  searchVentas,
  type Venta,
  getProductosByVentaId,
} from "../../services/venta.service";
import { getClienteById } from "../../services/clientes.service";
import { calcularDV, formatFecha } from "../../utils/utils";
import { Modal, Button, TextInput, LoadingState, EmptyState } from "./ui";

interface VentaProducto {
  VentaId: number;
  VentaProductoId: number;
  ProductoId: number;
  VentaProductoPrecioPromedio: number;
  VentaProductoCantidad: number;
  VentaProductoPrecio: number;
  VentaProductoPrecioTotal: number;
  VentaProductoUnitario: string;
  ProductoNombre?: string;
  ProductoCodigo?: string;
  ProductoPrecioVenta?: number;
  ProductoIVA?: number;
}

interface VentaCompleta extends Venta {
  ClienteRazonSocial?: string;
  ClienteRUC?: string;
  ClienteTelefono?: string;
  ClienteDireccion?: string;
  VentaProductos?: VentaProducto[];
}

interface InvoicePrintModalProps {
  show: boolean;
  onClose: () => void;
}

const InvoicePrintModal: React.FC<InvoicePrintModalProps> = ({
  show,
  onClose,
}) => {
  const [ventas, setVentas] = useState<VentaCompleta[]>([]);
  const [ventaSeleccionada, setVentaSeleccionada] =
    useState<VentaCompleta | null>(null);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const [itemsPerPage] = useState(10);

  const fetchVentas = useCallback(async () => {
    try {
      setLoading(true);
      let data;

      if (searchTerm.trim()) {
        data = await searchVentas(
          searchTerm,
          currentPage,
          itemsPerPage,
          "VentaId",
          "desc"
        );
      } else {
        data = await getVentasPaginated(
          currentPage,
          itemsPerPage,
          "VentaId",
          "desc"
        );
      }

      // Enriquecer las ventas con datos del cliente
      const ventasEnriquecidas = await Promise.all(
        data.data.map(async (venta: Venta) => {
          try {
            const cliente = await getClienteById(venta.ClienteId);
            console.log(
              `Cliente cargado para venta ${venta.VentaId}:`,
              cliente
            );

            const ventaEnriquecida = {
              ...venta,
              ClienteRazonSocial:
                cliente.ClienteRazonSocial ||
                `${cliente.ClienteNombre} ${cliente.ClienteApellido}`.trim(),
              ClienteRUC: cliente.ClienteRUC || "",
              ClienteTelefono: cliente.ClienteTelefono || "",
              ClienteDireccion: cliente.ClienteDireccion || "",
            };

            console.log(
              `Venta enriquecida ${venta.VentaId}:`,
              ventaEnriquecida
            );
            return ventaEnriquecida;
          } catch (error) {
            console.error(`Error al cargar cliente ${venta.ClienteId}:`, error);
            return {
              ...venta,
              ClienteRazonSocial: "Cliente no encontrado",
              ClienteRUC: "",
              ClienteTelefono: "",
              ClienteDireccion: "",
            };
          }
        })
      );

      setVentas(ventasEnriquecidas);
      setTotalPages(data.pagination.totalPages);
    } catch (error) {
      console.error("Error al cargar ventas:", error);
      Swal.fire("Error", "No se pudieron cargar las ventas", "error");
    } finally {
      setLoading(false);
    }
  }, [searchTerm, currentPage, itemsPerPage]);

  // Cargar ventas al abrir el modal
  useEffect(() => {
    if (show) {
      fetchVentas();
      setVentaSeleccionada(null);
    }
  }, [show, currentPage, fetchVentas]);

  const handleSearch = () => {
    setCurrentPage(1);
    fetchVentas();
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  const cargarProductosVenta = async (venta: VentaCompleta) => {
    try {
      console.log("Cargando productos para venta:", venta);
      const productos = await getProductosByVentaId(venta.VentaId);
      console.log("Productos cargados:", productos);

      // Los productos ya vienen con la descripción del JOIN en el backend
      const ventaCompleta = {
        ...venta,
        VentaProductos: productos,
      };

      console.log("Venta completa con productos:", ventaCompleta);
      setVentaSeleccionada(ventaCompleta);
    } catch (error) {
      console.error("Error al cargar productos:", error);
      Swal.fire(
        "Error",
        "No se pudieron cargar los productos de la venta",
        "error"
      );
    }
  };

  const calcularNroFactura = (venta: VentaCompleta) => {
    // Lógica similar a GeneXus
    // Por ahora usamos el ID de la venta como número de factura
    return venta.VentaId;
  };

  const calcularIVA = (total: number) => {
    if (total === undefined || total === null || isNaN(total)) {
      return 0;
    }
    return total / 11; // IVA 10%
  };

  const formatearNumero = (numero: number) => {
    if (numero === undefined || numero === null || isNaN(numero)) {
      return "0";
    }
    // Redondear al entero más cercano
    const numeroRedondeado = Math.round(numero);
    return numeroRedondeado.toLocaleString("es-PY");
  };

  const formatearFecha = (fecha: string) => formatFecha(fecha);

  const imprimirFactura = () => {
    if (!ventaSeleccionada) {
      Swal.fire("Error", "Debe seleccionar una venta", "error");
      return;
    }

    // Debug: mostrar los datos de la venta seleccionada
    console.log("Venta seleccionada para imprimir:", ventaSeleccionada);
    console.log("Productos de la venta:", ventaSeleccionada.VentaProductos);

    // Crear el contenido de la factura
    const contenidoFactura = generarContenidoFactura(ventaSeleccionada);

    // Abrir ventana de impresión
    const ventanaImpresion = window.open("", "_blank");
    if (ventanaImpresion) {
      // Cambiar el título de la página para evitar que aparezca en la impresión
      ventanaImpresion.document.title = "";

      ventanaImpresion.document.write(contenidoFactura);
      ventanaImpresion.document.close();

      // Esperar a que se cargue completamente antes de imprimir
      ventanaImpresion.onload = () => {
        ventanaImpresion.print();
      };

      // Fallback si onload no funciona
      setTimeout(() => {
        if (ventanaImpresion.document.readyState === "complete") {
          ventanaImpresion.print();
        }
      }, 300);
    }
  };

  const generarContenidoFactura = (venta: VentaCompleta) => {
    const nroFactura = calcularNroFactura(venta);

    // Validar que la venta tenga productos
    if (!venta.VentaProductos || venta.VentaProductos.length === 0) {
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
                        /* Ocultar elementos del navegador en impresión */
             @media print {
               body { 
                 margin: 0; 
                 padding: 0; 
               }
               .factura { 
                 page-break-after: avoid; 
               }
               @page { 
                 margin: 0; 
                 size: A4;
               }
               
               /* Ocultar elementos del navegador de forma eficiente */
               body::before,
               body::after,
               *::before,
               *::after {
                 display: none !important;
               }
             }
           
           
           body { 
             font-family: Arial, sans-serif; 
             font-size: 12px; 
             margin: 0; 
             padding: 0; 
           }
                       .factura { 
              margin: 0; 
              padding: 32px 20px 20px 20px; 
            }
           .header { 
             text-align: center; 
             margin-bottom: 20px; 
           }
           .header h2 { 
             margin: 0; 
             font-size: 18px; 
           }
           
                       .cliente-info { 
              margin-bottom: 10px; 
              display: flex; 
              justify-content: space-between; 
              align-items: flex-start;
            }
           .cliente-left { 
             flex: 1;
             margin-right: 20px;
           }
           .cliente-left p { 
             margin: 2px 0; 
             font-size: 11px; 
             text-align: left;
             min-height: 15px;
           }
           .cliente-right { 
             flex: 0 0 auto;
             text-align: right;
           }
           .factura-details p { 
             margin: 2px 0;
             font-size: 10px;
             text-align: right;
           }
           .factura-series {
             font-size: 12px !important;
             margin: 5px 0 !important;
           }
           .factura-number {
             font-size: 16px !important;
             margin: 5px 0 !important;
           }
           
           .productos-lista { 
              margin-bottom: 2px; 
              margin-top: 10px;
            }
           .productos-header {
             display: flex;
             font-weight: bold;
             font-size: 10px;
             border-bottom: 1px solid #ccc;
             padding-bottom: 5px;
             margin-bottom: 10px;
           }
           .producto-item { 
             display: flex; 
             justify-content: space-between; 
             align-items: center;
             margin-bottom: 2px;
             font-size: 10px;
           }
           .col-cantidad { 
             width: 60px; 
             text-align: center; 
             font-weight: bold;
           }
           .col-descripcion { 
             flex: 1; 
             text-align: left; 
             margin: 0 10px;
           }
           .col-precio { 
             width: 80px; 
             text-align: right; 
             margin-right: 10px;
           }
           .col-exentas { 
             width: 60px; 
             text-align: center;
           }
           .col-iva5 { 
             width: 60px; 
             text-align: center;
           }
           .col-iva10 { 
             width: 60px; 
             text-align: center;
           }
           
                       .totales { 
              margin-top: 10px; 
              padding-top: 5px;
              display: flex;
              justify-content: space-between;
            }
           .totales-left {
             flex: 1;
           }
           .totales-right {
             flex: 0 0 auto;
             text-align: right;
           }
           
           .total-letras { 
             font-size: 11px; 
             font-weight: bold; 
             margin-bottom: 0; 
             text-transform: uppercase;
             line-height: 1;
           }
           .liquidacion-iva {
             font-size: 11px;
             margin: 0;
             min-height: 8px;
             line-height: 1;
           }

           .subtotal { 
             text-align: right; 
             font-weight: bold; 
             margin: 0; 
             font-size: 12px;
             line-height: 1;
           }
           .total-iva { 
             text-align: right; 
             margin: 0; 
             font-size: 11px;
             font-weight: bold;
             line-height: 1;
           }
         </style>
      </head>
             <body>
         ${generarHoja(venta, venta.VentaProductos || [])}
       </body>
      </html>
    `;
  };

  const generarHoja = (venta: VentaCompleta, productos: VentaProducto[]) => {
    // Calcular el subtotal sumando todos los productos (sin recargos)
    const subtotalProductos = productos.reduce(
      (sum, p) => sum + (p.VentaProductoPrecioTotal || 0),
      0
    );

    // El total real debe ser el Total de la venta (que incluye recargos por método de pago)
    // Si venta.Total no está disponible, usar el subtotal de productos
    const totalReal = venta.Total || subtotalProductos;

    // Calcular el factor de recargo (ratio entre total real y subtotal)
    // Si no hay diferencia, el factor es 1 (sin recargo)
    const factorRecargo =
      subtotalProductos > 0 ? totalReal / subtotalProductos : 1;

    // Calcular productos con recargo distribuido proporcionalmente
    const productosConRecargo = productos.map((p) => {
      const precioUnitarioOriginal = p.VentaProductoPrecio || 0;

      // Calcular precio unitario con recargo
      const precioUnitarioConRecargo = Math.round(
        precioUnitarioOriginal * factorRecargo
      );

      // Calcular precio total con recargo (cantidad * precio unitario con recargo)
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

    // Recalcular el subtotal con recargo para asegurar que coincida exactamente con totalReal
    const subtotalConRecargo = productosConRecargo.reduce(
      (sum, p) => sum + (p.VentaProductoPrecioTotalConRecargo || 0),
      0
    );

    // Ajustar diferencias de redondeo en el último producto si es necesario
    const diferenciaRedondeo = totalReal - subtotalConRecargo;
    if (diferenciaRedondeo !== 0 && productosConRecargo.length > 0) {
      const ultimoProducto =
        productosConRecargo[productosConRecargo.length - 1];
      // Ajustar el precio total y recalcular el precio unitario
      ultimoProducto.VentaProductoPrecioTotalConRecargo =
        (ultimoProducto.VentaProductoPrecioTotalConRecargo || 0) +
        diferenciaRedondeo;

      // Recalcular precio unitario ajustado
      const cantidadUltimo = ultimoProducto.VentaProductoCantidad || 1;
      ultimoProducto.VentaProductoPrecioConRecargo = Math.round(
        ultimoProducto.VentaProductoPrecioTotalConRecargo / cantidadUltimo
      );
    }

    // Calcular el IVA sobre el total real (no sobre el subtotal de productos)
    const ivaReal = calcularIVA(totalReal);

    const facturaIndividual = `
      <div class="factura">
        <div class="cliente-info">
          <div class="cliente-left">
            <p style="margin-left: 295px;">
              <span>${formatearFecha(venta.VentaFecha)}</span>
              <span style="margin-left: 202px;">Contado</span>
            </p>
            <p style="margin-left: 320px;">${
              venta.ClienteRazonSocial || "N/A"
            }</p>
            <p style="margin-left: 280px;">
              <span>${venta.ClienteRUC ? `${venta.ClienteRUC}-${calcularDV(venta.ClienteRUC)}` : "N/A"}</span>
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
                 p.ProductoNombre ||
                 p.ProductoCodigo ||
                 "Producto sin descripción"
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

    // Separación entre facturas
    const separacion1 = `
      <div style="height: 0px; margin: -15px 0 0 0; padding: 0;"></div>
    `;

    // Separación entre facturas
    const separacion2 = `
      <div style="height: 0px; margin: -14px 0 0 0; padding: 0;"></div>
    `;

    // Retornar la factura triplicada con separación entre facturas
    return (
      facturaIndividual +
      separacion1 +
      facturaIndividual +
      separacion2 +
      facturaIndividual
    );
  };

  // ... existing code ...

  const numeroALetras = (numero: number): string => {
    // Función mejorada para convertir números a letras
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

    // Convertir a entero para simplificar
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

      let resultado = "";
      if (miles === 1) {
        resultado = "MIL";
      } else {
        resultado = numeroALetras(miles) + " MIL";
      }

      if (resto > 0) {
        if (resto < 100) resultado += " ";
        else resultado += " ";
        resultado += numeroALetras(resto);
      }

      return resultado;
    }

    // Para números muy grandes, simplificar
    return numero.toLocaleString("es-PY") + " GUARANÍES";
  };

  return (
    <Modal
      open={show}
      onClose={onClose}
      title="Imprimir Factura"
      size="6xl"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            leftIcon={PrinterIcon}
            onClick={imprimirFactura}
            disabled={!ventaSeleccionada}
          >
            Imprimir Factura
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Panel izquierdo - Búsqueda y lista de ventas */}
        <div className="lg:col-span-2">
          <div className="flex gap-2 mb-4">
            <TextInput
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder="Buscar ventas..."
              aria-label="Buscar ventas"
              leftIcon={MagnifyingGlassIcon}
            />
            <Button variant="outline" onClick={handleSearch}>
              Buscar
            </Button>
          </div>

          <div
            className="space-y-3 max-h-96 overflow-y-auto"
            aria-live="polite"
            aria-busy={loading || undefined}
          >
            {loading ? (
              <LoadingState fullPage={false} message="Cargando ventas..." />
            ) : ventas.length === 0 ? (
              <EmptyState
                fullPage={false}
                title="No se encontraron ventas"
                description="Probá con otro término de búsqueda."
              />
            ) : (
              ventas.map((venta) => {
                const activa = ventaSeleccionada?.VentaId === venta.VentaId;
                return (
                  <button
                    key={venta.VentaId}
                    type="button"
                    onClick={() => cargarProductosVenta(venta)}
                    aria-pressed={activa}
                    className={`w-full text-left p-3 border rounded-lg cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 ${
                      activa
                        ? "border-brand-500 bg-brand-50"
                        : "border-border hover:border-border-strong"
                    }`}
                  >
                    <div className="flex justify-between items-start gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-text">
                          Venta #{venta.VentaId}
                        </p>
                        <p className="text-sm text-text-muted">
                          {formatearFecha(venta.VentaFecha)}
                        </p>
                        <p className="text-sm text-text-muted truncate">
                          Cliente: {venta.ClienteRazonSocial || "N/A"}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-semibold text-success-700 tabular-nums">
                          {formatearNumero(venta.Total || 0)}
                        </p>
                        <p className="text-xs text-text-subtle">
                          {venta.VentaCantidadProductos || 0} productos
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Paginación */}
          {totalPages > 1 && (
            <div className="flex justify-center items-center gap-2 mt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
              >
                Anterior
              </Button>
              <span
                className="px-3 py-1 text-sm text-text-muted"
                aria-live="polite"
              >
                Página {currentPage} de {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setCurrentPage(Math.min(totalPages, currentPage + 1))
                }
                disabled={currentPage === totalPages}
              >
                Siguiente
              </Button>
            </div>
          )}
        </div>

        {/* Panel derecho - Vista previa */}
        <div>
          <h3 className="text-lg font-semibold mb-4 text-text">Vista Previa</h3>
          {ventaSeleccionada ? (
            <div className="border border-border rounded-lg p-4 bg-surface-sunken">
              <div className="space-y-2 text-text">
                <p>
                  <strong>N° Factura:</strong>{" "}
                  {calcularNroFactura(ventaSeleccionada)}
                </p>
                <p>
                  <strong>Fecha:</strong>{" "}
                  {formatearFecha(ventaSeleccionada.VentaFecha)}
                </p>
                <p>
                  <strong>Cliente:</strong>{" "}
                  {ventaSeleccionada.ClienteRazonSocial || "N/A"}
                </p>
                <p>
                  <strong>RUC:</strong> {ventaSeleccionada.ClienteRUC || "N/A"}
                </p>
                <p>
                  <strong>Dirección:</strong>{" "}
                  {ventaSeleccionada.ClienteDireccion ||
                    "Sin dirección registrada"}
                </p>
                <p>
                  <strong>Total:</strong>{" "}
                  <span className="tabular-nums">
                    {formatearNumero(ventaSeleccionada.Total || 0)}
                  </span>
                </p>
                <p>
                  <strong>IVA 10%:</strong>{" "}
                  <span className="tabular-nums">
                    {formatearNumero(calcularIVA(ventaSeleccionada.Total || 0))}
                  </span>
                </p>
                <p>
                  <strong>Productos:</strong>{" "}
                  {ventaSeleccionada.VentaProductos?.length || 0}
                </p>

                {ventaSeleccionada.VentaProductos &&
                  ventaSeleccionada.VentaProductos.length > 0 && (
                    <div className="mt-3">
                      <p className="font-semibold mb-2">Productos:</p>
                      <div className="space-y-1 max-h-32 overflow-y-auto">
                        {ventaSeleccionada.VentaProductos.slice(0, 5).map(
                          (producto, index) => (
                            <div
                              key={index}
                              className="text-sm text-text-muted"
                            >
                              {producto.VentaProductoCantidad}x{" "}
                              {producto.ProductoNombre ||
                                producto.ProductoCodigo}
                            </div>
                          )
                        )}
                        {ventaSeleccionada.VentaProductos.length > 5 && (
                          <p className="text-xs text-text-subtle">
                            ... y {ventaSeleccionada.VentaProductos.length - 5}{" "}
                            productos más
                          </p>
                        )}
                      </div>
                    </div>
                  )}
              </div>
            </div>
          ) : (
            <div className="border border-border rounded-lg p-4 bg-surface-sunken text-center text-text-muted">
              Seleccione una venta para ver la vista previa
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};

export default InvoicePrintModal;
