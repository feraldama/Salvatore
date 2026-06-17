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
import { formatFecha } from "../../utils/utils";
import { imprimirFactura as imprimirFacturaPDF } from "../../utils/factura";
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
    imprimirFacturaPDF(
      ventaSeleccionada,
      ventaSeleccionada.VentaProductos || []
    );
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
