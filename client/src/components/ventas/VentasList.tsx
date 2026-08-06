import { useEffect, useState } from "react";
import DataTable from "../common/Table/DataTable";
import type {
  Venta,
  VentaCreditoPago,
  VentaFilters,
} from "../../services/venta.service";
import { formatCurrency, formatMiles, formatFechaHora } from "../../utils/utils";
import { getAlmacenById } from "../../services/almacenes.service";
import SearchButton from "../common/Input/SearchButton";
import { Button, Modal } from "../common/ui";
import { PlusIcon, FunnelIcon, XMarkIcon } from "@heroicons/react/24/outline";
import Swal from "sweetalert2";
import {
  getVentaCreditoByVentaId,
  getPagosByVentaCreditoId,
  updateEnvioVehiculo,
} from "../../services/venta.service";
import {
  getVehiculosActivos,
  type VehiculoFlota,
} from "../../services/flota.service";
import { usePermiso } from "../../hooks/usePermiso";

interface VentasListProps {
  ventas: Venta[];
  onSort?: (key: string, order: "asc" | "desc") => void;
  sortKey?: string;
  sortOrder?: "asc" | "desc";
  onViewDetails?: (venta: Venta) => void;
  onCreate?: () => void;
  onDelete?: (venta: Venta) => void;
  onSearch: (value: string) => void;
  searchTerm: string;
  onKeyPress?: React.KeyboardEventHandler<HTMLInputElement>;
  onSearchSubmit: () => void;
  pagination?: {
    totalItems: number;
  };
  filters?: VentaFilters;
  onFiltersChange?: (filters: VentaFilters) => void;
  almacenes?: { AlmacenId: number; AlmacenNombre: string }[];
  showFilters?: boolean;
  onToggleFilters?: () => void;
}

interface VentaWithId extends Venta {
  id: number;
  AlmacenNombre?: string;
  Saldo?: number;
  // null: los campos envio_* del listado vienen en null cuando no aplican.
  [key: string]: string | number | null | undefined;
}

const VentasList = ({
  ventas,
  onSort,
  sortKey,
  sortOrder,
  onViewDetails,
  onCreate,
  onDelete,
  onSearch,
  searchTerm,
  onKeyPress,
  onSearchSubmit,
  pagination,
  filters,
  onFiltersChange,
  almacenes = [],
  showFilters = false,
  onToggleFilters,
}: VentasListProps) => {
  const [ventasWithAlmacen, setVentasWithAlmacen] = useState<VentaWithId[]>([]);

  // Cambio de vehículo de un envío (ej. se rompió el camión): se reasigna el
  // móvil en venta_envio sin tocar la venta ni el ticket.
  const puedeEditarEnvio = usePermiso("VENTAS", "editar");
  const [envioEdit, setEnvioEdit] = useState<VentaWithId | null>(null);
  const [vehiculos, setVehiculos] = useState<VehiculoFlota[]>([]);
  const [vehiculoSel, setVehiculoSel] = useState<number | "">("");
  const [guardandoVehiculo, setGuardandoVehiculo] = useState(false);

  const abrirCambioVehiculo = async (venta: VentaWithId) => {
    setVehiculoSel(venta.envio_vehiculo_id || "");
    setEnvioEdit(venta);
    if (vehiculos.length === 0) {
      try {
        setVehiculos(await getVehiculosActivos());
      } catch (error) {
        console.error("Error al cargar vehículos de flota:", error);
      }
    }
  };

  const guardarVehiculoEnvio = async () => {
    if (!envioEdit || vehiculoSel === "") return;
    setGuardandoVehiculo(true);
    try {
      const res = await updateEnvioVehiculo(envioEdit.VentaId, vehiculoSel);
      // Reflejar el cambio en la tabla sin recargar todo el listado.
      setVentasWithAlmacen((prev) =>
        prev.map((v) =>
          v.VentaId === envioEdit.VentaId
            ? { ...v, envio_vehiculo_id: vehiculoSel, envio_chapa: res.chapa }
            : v
        )
      );
      setEnvioEdit(null);
      Swal.fire({
        title: "Vehículo actualizado",
        text: `La venta #${envioEdit.VentaId} ahora sale con ${res.chapa}`,
        icon: "success",
        timer: 2500,
        showConfirmButton: false,
      });
    } catch (error) {
      Swal.fire({
        title: "Error",
        text:
          (error as { message?: string }).message ||
          "No se pudo cambiar el vehículo del envío",
        icon: "error",
      });
    } finally {
      setGuardandoVehiculo(false);
    }
  };

  const activeFilters = filters || {};

  // Estado local para inputs de fecha: `type="date"` emite onChange en cada
  // dígito del año (0001→0002→…→2026), y cada cambio dispararía un fetch
  // que desmonta la vista. Sincronizamos al padre sólo en blur / Enter.
  const [fechaDesdeLocal, setFechaDesdeLocal] = useState(
    activeFilters.fechaDesde || ""
  );
  const [fechaHastaLocal, setFechaHastaLocal] = useState(
    activeFilters.fechaHasta || ""
  );
  useEffect(() => {
    setFechaDesdeLocal(activeFilters.fechaDesde || "");
  }, [activeFilters.fechaDesde]);
  useEffect(() => {
    setFechaHastaLocal(activeFilters.fechaHasta || "");
  }, [activeFilters.fechaHasta]);
  const activeFilterCount = Object.values(activeFilters).filter(
    (v) => v !== undefined && v !== "" && v !== null
  ).length;

  const updateFilter = <K extends keyof VentaFilters>(
    key: K,
    value: VentaFilters[K] | ""
  ) => {
    if (!onFiltersChange) return;
    const next: VentaFilters = { ...activeFilters };
    if (value === "" || value === undefined) {
      delete next[key];
    } else {
      next[key] = value;
    }
    onFiltersChange(next);
  };

  const clearFilters = () => {
    if (!onFiltersChange) return;
    onFiltersChange({});
  };

  useEffect(() => {
    const loadAlmacenesData = async () => {
      const ventasData = ventas.map((venta) => ({
        ...venta,
        id: venta.VentaId,
        Saldo: venta.Total - Number(venta.VentaEntrega || 0),
      }));

      try {
        const ventasWithAlmacenData = await Promise.all(
          ventasData.map(async (venta) => {
            try {
              const almacen = await getAlmacenById(venta.AlmacenId);
              return {
                ...venta,
                AlmacenNombre: almacen.AlmacenNombre,
              };
            } catch (error) {
              console.error(
                `Error al cargar almacén ${venta.AlmacenId}:`,
                error
              );
              return venta;
            }
          })
        );
        setVentasWithAlmacen(ventasWithAlmacenData);
      } catch (error) {
        console.error("Error al cargar datos de almacenes:", error);
        setVentasWithAlmacen(ventasData);
      }
    };

    loadAlmacenesData();
  }, [ventas]);

  const handleViewCreditDetails = async (venta: VentaWithId) => {
    try {
      // Obtener los detalles del crédito
      const ventaCredito = await getVentaCreditoByVentaId(venta.VentaId);
      if (!ventaCredito) {
        Swal.fire({
          title: "Error",
          text: "No se encontraron detalles del crédito",
          icon: "error",
        });
        return;
      }

      // Obtener los pagos del crédito
      const pagos = await getPagosByVentaCreditoId(ventaCredito.VentaCreditoId);

      // Calcular el total pagado y el saldo pendiente
      const totalPagado = pagos.reduce(
        (sum: number, pago: VentaCreditoPago) =>
          sum + pago.VentaCreditoPagoMonto,
        0
      );
      const saldoPendiente = venta.Total - totalPagado;

      // Crear la tabla HTML de pagos
      const pagosTable = `
        <table class="w-full mt-4">
          <thead>
            <tr class="bg-surface-muted">
              <th class="text-left py-2 px-4">ID Pago</th>
              <th class="text-left py-2 px-4">Fecha</th>
              <th class="text-right py-2 px-4">Monto</th>
            </tr>
          </thead>
          <tbody>
            ${pagos
              .map(
                (pago: VentaCreditoPago) => `
              <tr class="border-b hover:bg-surface-sunken">
                <td class="py-2 px-4">${pago.VentaCreditoPagoId}</td>
                <td class="py-2 px-4">${formatFechaHora(
                  pago.VentaCreditoPagoFecha
                )}</td>
                <td class="text-right py-2 px-4">${formatCurrency(
                  pago.VentaCreditoPagoMonto
                )}</td>
              </tr>
            `
              )
              .join("")}
          </tbody>
        </table>
      `;

      Swal.fire({
        title: `Detalles del Crédito - Venta #${venta.VentaId}`,
        html: `
          <div class="text-left">
            <p><strong>Cliente:</strong> ${
              venta.ClienteNombre
                ? `${venta.ClienteNombre} ${venta.ClienteApellido}`
                : `Cliente #${venta.ClienteId}`
            }</p>
            <p><strong>Fecha de Venta:</strong> ${formatFechaHora(
              venta.VentaFecha
            )}</p>
            <p><strong>Monto Total:</strong> ${formatCurrency(venta.Total)}</p>
            <p><strong>Cantidad de Pagos:</strong> ${
              ventaCredito.VentaCreditoPagoCant
            }</p>
            <p><strong>Total Pagado:</strong> ${formatCurrency(totalPagado)}</p>
            <p><strong>Saldo Pendiente:</strong> ${formatCurrency(
              saldoPendiente
            )}</p>
            <div class="mt-4">
              <h3 class="font-bold mb-2">Historial de Pagos</h3>
              ${pagosTable}
            </div>
          </div>
        `,
        width: "800px",
        icon: "info",
        confirmButtonText: "Cerrar",
      });
    } catch (error) {
      console.error("Error al cargar los detalles del crédito:", error);
      Swal.fire({
        title: "Error",
        text: "No se pudieron cargar los detalles del crédito",
        icon: "error",
      });
    }
  };

  const getTipoVentaText = (tipo: string) => {
    switch (tipo) {
      case "CO":
        return "Contado";
      case "CR":
        return "Crédito";
      case "PO":
        return "POS";
      case "TR":
        return "Transfer";
      default:
        return tipo;
    }
  };

  const columns = [
    {
      key: "VentaId",
      label: "ID",
    },
    {
      key: "VentaFecha",
      label: "Fecha",
      render: (venta: VentaWithId) => formatFechaHora(venta.VentaFecha),
    },
    {
      key: "Cliente",
      label: "Cliente",
      render: (venta: VentaWithId) =>
        venta.ClienteNombre
          ? `${venta.ClienteNombre} ${venta.ClienteApellido}`
          : `Cliente #${venta.ClienteId}`,
    },
    {
      key: "AlmacenNombre",
      label: "Almacén",
      render: (venta: VentaWithId) =>
        venta.AlmacenNombre || `Almacén #${venta.AlmacenId}`,
    },
    {
      key: "VentaTipo",
      label: "Tipo",
      render: (venta: VentaWithId) => getTipoVentaText(venta.VentaTipo),
    },
    {
      key: "EsEnvio",
      label: "Envío",
      render: (venta: VentaWithId) => {
        if (venta.EsEnvio !== "S")
          return <span className="text-text-subtle">—</span>;
        const chip = (
          <>🚚 {venta.envio_chapa || "Envío"}</>
        );
        // ENTREGADO/CANCELADO ya rindió con su móvil: no se cambia.
        const editable =
          puedeEditarEnvio &&
          venta.envio_estado !== "ENTREGADO" &&
          venta.envio_estado !== "CANCELADO";
        if (!editable) {
          return (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
              {chip}
            </span>
          );
        }
        return (
          <button
            type="button"
            onClick={() => abrirCambioVehiculo(venta)}
            title="Cambiar vehículo del envío"
            className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 cursor-pointer hover:bg-amber-100 hover:border-amber-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40"
          >
            {chip}
            <span aria-hidden="true">✎</span>
          </button>
        );
      },
    },
    {
      key: "VentaNroPOS",
      label: "Nro. POS",
      render: (venta: VentaWithId) =>
        venta.VentaNroPOS != null && String(venta.VentaNroPOS).trim() !== ""
          ? venta.VentaNroPOS
          : "-",
    },
    {
      key: "Total",
      label: "Total",
      numeric: true,
      render: (venta: VentaWithId) => formatCurrency(venta.Total),
    },
    {
      key: "VentaEntrega",
      label: "Entrega",
      numeric: true,
      render: (venta: VentaWithId) =>
        venta.VentaEntrega ? formatCurrency(Number(venta.VentaEntrega)) : "-",
    },
    {
      key: "Saldo",
      label: "Saldo",
      numeric: true,
      render: (venta: VentaWithId) => formatCurrency(venta.Saldo || 0),
    },
    {
      key: "VentaUsuario",
      label: "Usuario",
    },
  ];

  const getStatusColor = (status: unknown) => {
    switch (status) {
      case "P":
        return "bg-warning-500"; // Pendiente
      case "C":
        return "bg-success-500"; // Completado
      case "A":
        return "bg-danger-600"; // Anulado
      default:
        return "bg-text-subtle";
    }
  };

  const getStatusText = (status: unknown) => {
    switch (status) {
      case "P":
        return "Pendiente";
      case "C":
        return "Completado";
      case "A":
        return "Anulado";
      default:
        return "Desconocido";
    }
  };

  return (
    <>
      <div className="flex flex-col sm:flex-row gap-4 mb-4">
        <div className="flex-1">
          <SearchButton
            searchTerm={searchTerm}
            onSearch={onSearch}
            onKeyPress={onKeyPress}
            onSearchSubmit={onSearchSubmit}
            placeholder="Buscar ventas..."
          />
        </div>
        <div className="py-4 flex gap-2">
          {onFiltersChange && onToggleFilters && (
            <button
              type="button"
              onClick={onToggleFilters}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-text-muted bg-surface border border-border rounded-md hover:bg-surface-sunken focus:outline-none focus:ring-2 focus:ring-brand-500 cursor-pointer"
            >
              <FunnelIcon className="w-4 h-4" />
              Filtros
              {activeFilterCount > 0 && (
                <span className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 text-xs font-semibold text-white bg-brand-600 rounded-full">
                  {activeFilterCount}
                </span>
              )}
            </button>
          )}
          {onCreate && (
            <Button leftIcon={PlusIcon} onClick={onCreate}>
              Nueva Venta
            </Button>
          )}
        </div>
      </div>
      {onFiltersChange && showFilters && (
        <div className="bg-surface-sunken border border-border rounded-lg p-4 mb-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <div>
              <label className="block mb-1 text-xs font-medium text-text-muted">
                Tipo
              </label>
              <select
                value={activeFilters.tipo || ""}
                onChange={(e) =>
                  updateFilter(
                    "tipo",
                    (e.target.value as VentaFilters["tipo"]) || ""
                  )
                }
                className="w-full bg-surface border border-border text-text text-sm rounded-md focus:ring-brand-500 focus:border-brand-600 p-2"
              >
                <option value="">Todos</option>
                <option value="CO">Contado</option>
                <option value="CR">Crédito</option>
                <option value="PO">POS</option>
                <option value="TR">Transfer</option>
              </select>
            </div>
            <div>
              <label className="block mb-1 text-xs font-medium text-text-muted">
                Almacén
              </label>
              <select
                value={activeFilters.almacenId ?? ""}
                onChange={(e) =>
                  updateFilter("almacenId", e.target.value || "")
                }
                className="w-full bg-surface border border-border text-text text-sm rounded-md focus:ring-brand-500 focus:border-brand-600 p-2"
              >
                <option value="">Todos</option>
                {almacenes.map((a) => (
                  <option key={a.AlmacenId} value={a.AlmacenId}>
                    {a.AlmacenNombre}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block mb-1 text-xs font-medium text-text-muted">
                Desde
              </label>
              <input
                type="date"
                value={fechaDesdeLocal}
                max={fechaHastaLocal || undefined}
                onChange={(e) => setFechaDesdeLocal(e.target.value)}
                onBlur={(e) => {
                  const value = e.target.value;
                  // Si Desde es mayor a Hasta, revertir al valor aplicado.
                  if (value && fechaHastaLocal && value > fechaHastaLocal) {
                    setFechaDesdeLocal(activeFilters.fechaDesde || "");
                    return;
                  }
                  if (value !== (activeFilters.fechaDesde || "")) {
                    updateFilter("fechaDesde", value);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    (e.target as HTMLInputElement).blur();
                  }
                }}
                className="w-full bg-surface border border-border text-text text-sm rounded-md focus:ring-brand-500 focus:border-brand-600 p-2"
              />
            </div>
            <div>
              <label className="block mb-1 text-xs font-medium text-text-muted">
                Hasta
              </label>
              <input
                type="date"
                value={fechaHastaLocal}
                min={fechaDesdeLocal || undefined}
                onChange={(e) => setFechaHastaLocal(e.target.value)}
                onBlur={(e) => {
                  const value = e.target.value;
                  // Si Hasta es menor a Desde, revertir al valor aplicado.
                  if (value && fechaDesdeLocal && value < fechaDesdeLocal) {
                    setFechaHastaLocal(activeFilters.fechaHasta || "");
                    return;
                  }
                  if (value !== (activeFilters.fechaHasta || "")) {
                    updateFilter("fechaHasta", value);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    (e.target as HTMLInputElement).blur();
                  }
                }}
                className="w-full bg-surface border border-border text-text text-sm rounded-md focus:ring-brand-500 focus:border-brand-600 p-2"
              />
            </div>
            <div>
              <label className="block mb-1 text-xs font-medium text-text-muted">
                Estado
              </label>
              <select
                value={activeFilters.estado || ""}
                onChange={(e) =>
                  updateFilter(
                    "estado",
                    (e.target.value as VentaFilters["estado"]) || ""
                  )
                }
                className="w-full bg-surface border border-border text-text text-sm rounded-md focus:ring-brand-500 focus:border-brand-600 p-2"
              >
                <option value="">Todos</option>
                <option value="P">Pendiente</option>
                <option value="C">Completado</option>
              </select>
            </div>
            <div>
              <label className="block mb-1 text-xs font-medium text-text-muted">
                Envío
              </label>
              <select
                value={activeFilters.esEnvio || ""}
                onChange={(e) =>
                  updateFilter(
                    "esEnvio",
                    (e.target.value as VentaFilters["esEnvio"]) || ""
                  )
                }
                className="w-full bg-surface border border-border text-text text-sm rounded-md focus:ring-brand-500 focus:border-brand-600 p-2"
              >
                <option value="">Todas</option>
                <option value="S">Solo envíos</option>
                <option value="N">Sin envío</option>
              </select>
            </div>
          </div>
          {activeFilterCount > 0 && (
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-text-muted hover:text-text cursor-pointer"
              >
                <XMarkIcon className="w-4 h-4" />
                Limpiar filtros
              </button>
            </div>
          )}
        </div>
      )}
      <div className="flex justify-between items-center mb-4">
        <div className="text-sm text-text-muted">
          Mostrando {formatMiles(ventasWithAlmacen.length)} de{" "}
          {formatMiles(pagination?.totalItems || ventasWithAlmacen.length)}{" "}
          ventas
        </div>
      </div>

      <DataTable<VentaWithId>
        columns={columns}
        data={ventasWithAlmacen}
        onEdit={onViewDetails}
        onDelete={onDelete}
        onViewCredit={handleViewCreditDetails}
        emptyMessage="No hay ventas registradas"
        getStatusColor={getStatusColor}
        getStatusText={getStatusText}
        sortKey={sortKey}
        sortOrder={sortOrder}
        onSort={onSort}
      />

      <Modal
        open={envioEdit !== null}
        onClose={() => !guardandoVehiculo && setEnvioEdit(null)}
        title="Cambiar vehículo del envío"
        description={
          envioEdit
            ? `Venta #${envioEdit.VentaId} — ${
                envioEdit.ClienteNombre
                  ? `${envioEdit.ClienteNombre} ${envioEdit.ClienteApellido}`
                  : `Cliente #${envioEdit.ClienteId}`
              }`
            : undefined
        }
        size="md"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setEnvioEdit(null)}
              disabled={guardandoVehiculo}
            >
              Cancelar
            </Button>
            <Button
              onClick={guardarVehiculoEnvio}
              disabled={
                vehiculoSel === "" ||
                vehiculoSel === (envioEdit?.envio_vehiculo_id || "")
              }
              loading={guardandoVehiculo}
            >
              Guardar
            </Button>
          </>
        }
      >
        <label className="block mb-1 text-xs font-medium text-text-muted">
          Vehículo
        </label>
        <select
          value={vehiculoSel}
          onChange={(e) =>
            setVehiculoSel(e.target.value === "" ? "" : Number(e.target.value))
          }
          className="w-full bg-surface border border-border text-text text-sm rounded-md focus:ring-brand-500 focus:border-brand-600 p-2"
        >
          <option value="">— Seleccionar vehículo —</option>
          {vehiculos.map((v) => (
            <option key={v.id} value={v.id}>
              {v.chapa}
              {v.marca || v.modelo
                ? ` · ${[v.marca, v.modelo].filter(Boolean).join(" ")}`
                : ""}
              {v.choferes_nombres ? ` — ${v.choferes_nombres}` : ""}
            </option>
          ))}
        </select>
        {envioEdit?.envio_chapa && (
          <p className="mt-2 text-xs text-text-muted">
            Vehículo actual: {envioEdit.envio_chapa}
          </p>
        )}
      </Modal>
    </>
  );
};

export default VentasList;
