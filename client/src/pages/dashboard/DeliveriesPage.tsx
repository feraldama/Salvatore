import { useEffect, useState, useCallback } from "react";
import Swal from "sweetalert2";
import { EyeIcon } from "@heroicons/react/24/outline";
import DataTable from "../../components/common/Table/DataTable";
import Modal from "../../components/common/Modal/Modal";
import {
  LoadingState,
  ErrorState,
  PermissionDenied,
} from "../../components/common/ui";
import { usePermiso } from "../../hooks/usePermiso";
import { useAuth } from "../../contexts/useAuth";
import {
  getDeliveries,
  updateDeliveryEstado,
  getProductosByVentaId,
  type Delivery,
  type DeliveryEstado,
} from "../../services/venta.service";
import { getEstadoAperturaPorUsuario } from "../../services/registrodiariocaja.service";
import { formatFechaHora, formatMiles } from "../../utils/utils";

// Timestamp ISO local (YYYY-MM-DDTHH:MM:SS) para que el cobro caiga con la hora
// real del cajero (mismo criterio que la confirmación de venta).
const isoLocalAhora = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
};

type Row = Delivery & { id: number; [key: string]: unknown };

// Producto de una venta tal como lo devuelve /ventaproducto/venta/:id
// (vp.* + nombre/código del producto del JOIN).
interface DeliveryProducto {
  VentaProductoId: number;
  ProductoId: number;
  ProductoNombre?: string;
  ProductoCodigo?: string;
  ProductoUnidad?: string; // 'U' | 'C'
  VentaProductoCantidad: number;
  VentaProductoPrecio: number;
  VentaProductoPrecioTotal: number;
}

const ESTADO_LABEL: Record<DeliveryEstado, string> = {
  PENDIENTE: "Pendiente",
  EN_RUTA: "En ruta",
  ENTREGADO: "Entregado",
  CANCELADO: "Cancelado",
};

const ESTADO_BADGE: Record<DeliveryEstado, string> = {
  PENDIENTE: "bg-amber-50 text-amber-700 border-amber-200",
  EN_RUTA: "bg-blue-50 text-blue-700 border-blue-200",
  ENTREGADO: "bg-emerald-50 text-emerald-700 border-emerald-200",
  CANCELADO: "bg-slate-100 text-slate-600 border-slate-200",
};

export default function DeliveriesPage() {
  const puedeLeer = usePermiso("DELIVERIES", "leer");
  const puedeEditar = usePermiso("DELIVERIES", "editar");
  const { user } = useAuth();

  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [estado, setEstado] = useState<DeliveryEstado | "">("");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");

  // Detalle de productos de una venta (modal).
  const [detalle, setDetalle] = useState<Delivery | null>(null);
  const [detalleProductos, setDetalleProductos] = useState<DeliveryProducto[]>(
    []
  );
  const [detalleLoading, setDetalleLoading] = useState(false);

  const verDetalle = async (d: Delivery) => {
    setDetalle(d);
    setDetalleProductos([]);
    setDetalleLoading(true);
    try {
      const productos = (await getProductosByVentaId(
        d.VentaId
      )) as DeliveryProducto[];
      setDetalleProductos(productos);
    } catch (err) {
      const e = err as { message?: string };
      Swal.fire({
        icon: "error",
        title: "Error",
        text: e?.message || "No se pudieron cargar los productos",
      });
      setDetalle(null);
    } finally {
      setDetalleLoading(false);
    }
  };

  const fetchDeliveries = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getDeliveries({
        estado: estado || undefined,
        fechaDesde: fechaDesde || undefined,
        fechaHasta: fechaHasta || undefined,
      });
      setDeliveries(data);
      setError(null);
    } catch (err) {
      const e = err as { message?: string };
      setError(e?.message || "Error al cargar los deliveries");
    } finally {
      setLoading(false);
    }
  }, [estado, fechaDesde, fechaHasta]);

  useEffect(() => {
    fetchDeliveries();
  }, [fetchDeliveries]);

  const cambiarEstado = async (
    d: Delivery,
    nuevo: DeliveryEstado,
    accion: string
  ) => {
    const ventaId = d.VentaId;
    // "Cancelar" solo marca el reparto como cancelado: NO anula la venta (la
    // mercadería ya salió del stock y, si se cobró, la plata sigue cobrada).
    // Para revertir la venta hay que hacer una devolución.
    const esCancelar = nuevo === "CANCELADO";
    // Al ENTREGAR con efectivo pendiente hay que cobrarlo e ingresarlo a la caja
    // abierta del cajero (cobro contra entrega).
    const requiereCobro =
      nuevo === "ENTREGADO" &&
      Number(d.efectivo_pendiente) > 0 &&
      !d.cobrado_en;

    let cobro: { CajaId: number; UsuarioId: string; Fecha: string } | undefined;
    if (requiereCobro) {
      if (!user?.id) {
        Swal.fire({
          icon: "error",
          title: "Sin usuario",
          text: "No se pudo identificar al usuario para registrar el cobro.",
        });
        return;
      }
      let cajaId: number | null = null;
      try {
        const estado = await getEstadoAperturaPorUsuario(user.id);
        if (estado?.cajaId && estado.aperturaId > estado.cierreId) {
          cajaId = Number(estado.cajaId);
        }
      } catch {
        cajaId = null;
      }
      if (!cajaId) {
        Swal.fire({
          icon: "warning",
          title: "Necesitás una caja abierta",
          text: `Para registrar el cobro de Gs. ${formatMiles(
            d.efectivo_pendiente
          )} en efectivo, abrí tu caja primero.`,
          confirmButtonColor: "#3085d6",
        });
        return;
      }
      cobro = {
        CajaId: cajaId,
        UsuarioId: String(user.id),
        Fecha: isoLocalAhora(),
      };
    }

    const confirm = await Swal.fire({
      icon: esCancelar ? "warning" : "question",
      title: `¿${accion}?`,
      html: requiereCobro
        ? `Venta N° ${ventaId}<br/><small>Se ingresará el cobro de <b>Gs. ${formatMiles(
            d.efectivo_pendiente
          )}</b> en efectivo a tu caja.</small>`
        : esCancelar
          ? `Venta N° ${ventaId}<br/><small>Esto cancela solo el <b>reparto</b>. No anula la venta ni devuelve el stock; para eso usá una devolución.</small>`
          : `Venta N° ${ventaId}`,
      showCancelButton: true,
      confirmButtonText: "Sí",
      cancelButtonText: "No",
      confirmButtonColor: esCancelar ? "#e11d48" : "#3085d6",
    });
    if (!confirm.isConfirmed) return;
    try {
      const r = await updateDeliveryEstado(ventaId, nuevo, cobro);
      await fetchDeliveries();
      Swal.fire({
        position: "top-end",
        icon: "success",
        title: r?.cobrado ? "Entregado y cobrado" : "Estado actualizado",
        showConfirmButton: false,
        timer: 1300,
      });
    } catch (err) {
      const e = err as { message?: string };
      Swal.fire({
        icon: "error",
        title: "Error",
        text: e?.message || "No se pudo actualizar el estado",
      });
    }
  };

  const columns = [
    {
      key: "VentaId",
      label: "N° Venta",
      numeric: true,
      render: (d: Row) => (
        <button
          onClick={() => verDetalle(d)}
          className="font-semibold text-brand-700 hover:underline cursor-pointer"
          title="Ver detalle de productos"
        >
          {d.VentaId}
        </button>
      ),
    },
    {
      key: "VentaFecha",
      label: "Fecha",
      render: (d: Row) => formatFechaHora(d.VentaFecha),
    },
    {
      key: "cliente",
      label: "Cliente",
      render: (d: Row) =>
        `${d.ClienteNombre || ""} ${d.ClienteApellido || ""}`.trim() || "-",
    },
    {
      key: "chofer",
      label: "Chofer",
      render: (d: Row) =>
        `${d.chofer_nombre || ""} ${d.chofer_apellido || ""}`.trim() ||
        d.chofer_id,
    },
    {
      key: "Total",
      label: "Total",
      numeric: true,
      render: (d: Row) => `Gs. ${formatMiles(d.Total)}`,
    },
    {
      key: "cobro",
      label: "Cobro",
      render: (d: Row) => {
        const pend = Number(d.efectivo_pendiente) || 0;
        if (pend <= 0) return <span className="text-slate-400">—</span>;
        return d.cobrado_en ? (
          <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
            Cobrado Gs. {formatMiles(pend)}
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
            A cobrar Gs. {formatMiles(pend)}
          </span>
        );
      },
    },
    {
      key: "estado",
      label: "Estado",
      render: (d: Row) => (
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold border ${
            ESTADO_BADGE[d.estado]
          }`}
        >
          {ESTADO_LABEL[d.estado]}
          {d.estado === "ENTREGADO" && d.entregado_en
            ? ` · ${formatFechaHora(d.entregado_en)}`
            : ""}
        </span>
      ),
    },
  ];

  const acciones = (d: Row) => {
    return (
      <div className="flex flex-wrap items-center gap-1">
        <button
          onClick={() => verDetalle(d)}
          className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-200 cursor-pointer"
          title="Ver detalle de productos"
        >
          <EyeIcon className="h-4 w-4" /> Ver
        </button>
        {puedeEditar && d.estado === "PENDIENTE" && (
          <button
            onClick={() => cambiarEstado(d, "EN_RUTA", "Marcar en ruta")}
            className="rounded-md bg-blue-600 px-2 py-1 text-xs font-semibold text-white hover:bg-blue-700 cursor-pointer"
          >
            En ruta
          </button>
        )}
        {puedeEditar && d.estado === "EN_RUTA" && (
          <button
            onClick={() => cambiarEstado(d, "ENTREGADO", "Marcar entregado")}
            className="rounded-md bg-emerald-600 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-700 cursor-pointer"
          >
            Entregado
          </button>
        )}
        {puedeEditar && (d.estado === "PENDIENTE" || d.estado === "EN_RUTA") && (
          <button
            onClick={() => cambiarEstado(d, "CANCELADO", "Cancelar")}
            className="rounded-md bg-rose-600 px-2 py-1 text-xs font-semibold text-white hover:bg-rose-700 cursor-pointer"
          >
            Cancelar
          </button>
        )}
        {puedeEditar && d.estado === "CANCELADO" && (
          <button
            onClick={() => cambiarEstado(d, "PENDIENTE", "Reabrir")}
            className="rounded-md bg-slate-200 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-300 cursor-pointer"
          >
            Reabrir
          </button>
        )}
      </div>
    );
  };

  if (!puedeLeer) return <PermissionDenied resource="los deliveries" />;

  return (
    <div className="container mx-auto px-4">
      <h1 className="text-2xl font-medium mb-3">Deliveries</h1>
      <div className="flex flex-wrap gap-3 items-end mb-4">
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">
            Estado
          </label>
          <select
            value={estado}
            onChange={(e) => setEstado(e.target.value as DeliveryEstado | "")}
            className="rounded-lg border border-border px-3 py-2 text-sm bg-white"
          >
            <option value="">Todos</option>
            <option value="PENDIENTE">Pendiente</option>
            <option value="EN_RUTA">En ruta</option>
            <option value="ENTREGADO">Entregado</option>
            <option value="CANCELADO">Cancelado</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">
            Desde
          </label>
          <input
            type="date"
            value={fechaDesde}
            onChange={(e) => setFechaDesde(e.target.value)}
            className="rounded-lg border border-border px-3 py-2 text-sm bg-white"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">
            Hasta
          </label>
          <input
            type="date"
            value={fechaHasta}
            onChange={(e) => setFechaHasta(e.target.value)}
            className="rounded-lg border border-border px-3 py-2 text-sm bg-white"
          />
        </div>
      </div>

      {loading ? (
        <LoadingState message="Cargando deliveries..." />
      ) : error ? (
        <ErrorState
          message={error}
          onRetry={() => {
            setError(null);
            fetchDeliveries();
          }}
        />
      ) : (
        <DataTable<Row>
          columns={columns}
          data={deliveries.map((d) => ({ ...d, id: d.VentaId }))}
          customActions={acciones}
          emptyMessage="No hay deliveries para los filtros seleccionados"
        />
      )}

      <Modal
        open={detalle !== null}
        onClose={() => setDetalle(null)}
        size="2xl"
        title={detalle ? `Detalle de la venta N° ${detalle.VentaId}` : ""}
      >
        {detalle && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
              <div>
                <span className="text-slate-500">Cliente: </span>
                <span className="font-medium">
                  {`${detalle.ClienteNombre || ""} ${
                    detalle.ClienteApellido || ""
                  }`.trim() || "-"}
                </span>
              </div>
              <div>
                <span className="text-slate-500">Chofer: </span>
                <span className="font-medium">
                  {`${detalle.chofer_nombre || ""} ${
                    detalle.chofer_apellido || ""
                  }`.trim() || detalle.chofer_id}
                </span>
              </div>
              <div>
                <span className="text-slate-500">Fecha: </span>
                <span className="font-medium">
                  {formatFechaHora(detalle.VentaFecha)}
                </span>
              </div>
              <div>
                <span className="text-slate-500">Teléfono: </span>
                <span className="font-medium">
                  {detalle.ClienteTelefono || "-"}
                </span>
              </div>
              <div className="col-span-2">
                <span className="text-slate-500">Dirección de entrega: </span>
                <span className="font-medium">
                  {detalle.ClienteDireccion || "-"}
                </span>
              </div>
              <div>
                <span className="text-slate-500">Estado: </span>
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold border ${
                    ESTADO_BADGE[detalle.estado]
                  }`}
                >
                  {ESTADO_LABEL[detalle.estado]}
                </span>
              </div>
              {Number(detalle.efectivo_pendiente) > 0 && (
                <div>
                  <span className="text-slate-500">Cobro efectivo: </span>
                  <span
                    className={`font-medium ${
                      detalle.cobrado_en ? "text-emerald-700" : "text-amber-700"
                    }`}
                  >
                    {detalle.cobrado_en
                      ? `Cobrado · Gs. ${formatMiles(detalle.efectivo_pendiente)}`
                      : `A cobrar contra entrega · Gs. ${formatMiles(
                          detalle.efectivo_pendiente
                        )}`}
                  </span>
                </div>
              )}
            </div>

            {detalleLoading ? (
              <LoadingState message="Cargando productos..." />
            ) : detalleProductos.length === 0 ? (
              <p className="text-sm text-slate-500 py-4 text-center">
                Esta venta no tiene productos cargados.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-surface-sunken text-left">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Código</th>
                      <th className="px-3 py-2 font-semibold">Producto</th>
                      <th className="px-3 py-2 font-semibold text-right">
                        Cantidad
                      </th>
                      <th className="px-3 py-2 font-semibold text-right">
                        Precio unit.
                      </th>
                      <th className="px-3 py-2 font-semibold text-right">
                        Subtotal
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {detalleProductos.map((p) => (
                      <tr key={p.VentaProductoId} className="border-t border-border">
                        <td className="px-3 py-2">{p.ProductoCodigo || "-"}</td>
                        <td className="px-3 py-2">{p.ProductoNombre || "-"}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatMiles(p.VentaProductoCantidad)}
                          {p.ProductoUnidad === "C" ? " (caja)" : ""}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatMiles(p.VentaProductoPrecio)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatMiles(p.VentaProductoPrecioTotal)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-border bg-surface-sunken font-semibold">
                      <td className="px-3 py-2" colSpan={4}>
                        Total
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        Gs. {formatMiles(detalle.Total)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
