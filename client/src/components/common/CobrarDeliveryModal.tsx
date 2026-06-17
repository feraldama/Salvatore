import { useEffect, useState, useCallback } from "react";
import Swal from "sweetalert2";
import Modal from "./Modal/Modal";
import {
  getDeliveries,
  updateDeliveryEstado,
  type Delivery,
} from "../../services/venta.service";
import { formatFechaHora, formatMiles } from "../../utils/utils";

interface Props {
  open: boolean;
  onClose: () => void;
  // Caja abierta del vendedor (a la que entra el efectivo cobrado).
  cajaId?: number;
  usuarioId: string;
  // Se llama tras cobrar, por si el padre quiere refrescar algo.
  onCobrado?: () => void;
}

// Timestamp ISO local para que el cobro caiga con la hora real del cajero.
const isoLocalAhora = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
};

export default function CobrarDeliveryModal({
  open,
  onClose,
  cajaId,
  usuarioId,
  onCobrado,
}: Props) {
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [cobrandoId, setCobrandoId] = useState<number | null>(null);

  // Deliveries que están pendientes de cobro en efectivo (efectivo pendiente,
  // todavía no cobrado y no cancelados).
  const fetchDeliveries = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getDeliveries({});
      setDeliveries(
        data.filter(
          (d) =>
            Number(d.efectivo_pendiente) > 0 &&
            !d.cobrado_en &&
            d.estado !== "CANCELADO"
        )
      );
    } catch (err) {
      const e = err as { message?: string };
      Swal.fire({
        icon: "error",
        title: "Error",
        text: e?.message || "No se pudieron cargar los deliveries",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      setBusqueda("");
      fetchDeliveries();
    }
  }, [open, fetchDeliveries]);

  const cobrar = async (d: Delivery) => {
    if (!cajaId) {
      Swal.fire({
        icon: "warning",
        title: "Sin caja abierta",
        text: "Necesitás una caja abierta para registrar el cobro.",
        confirmButtonColor: "#3085d6",
      });
      return;
    }
    const confirm = await Swal.fire({
      icon: "question",
      title: "¿Cobrar delivery?",
      html: `Venta N° ${d.VentaId}<br/><small>Se ingresará <b>Gs. ${formatMiles(
        d.efectivo_pendiente
      )}</b> en efectivo a tu caja y el delivery quedará entregado.</small>`,
      showCancelButton: true,
      confirmButtonText: "Cobrar",
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#16a34a",
    });
    if (!confirm.isConfirmed) return;
    setCobrandoId(d.VentaId);
    try {
      await updateDeliveryEstado(d.VentaId, "ENTREGADO", {
        CajaId: cajaId,
        UsuarioId: usuarioId,
        Fecha: isoLocalAhora(),
      });
      await fetchDeliveries();
      onCobrado?.();
      Swal.fire({
        position: "top-end",
        icon: "success",
        title: "Cobrado",
        showConfirmButton: false,
        timer: 1300,
      });
    } catch (err) {
      const e = err as { message?: string };
      Swal.fire({
        icon: "error",
        title: "Error",
        text: e?.message || "No se pudo registrar el cobro",
      });
    } finally {
      setCobrandoId(null);
    }
  };

  const term = busqueda.trim().toLowerCase();
  const filtrados = !term
    ? deliveries
    : deliveries.filter((d) => {
        const cliente = `${d.ClienteNombre || ""} ${
          d.ClienteApellido || ""
        }`.toLowerCase();
        const chofer = `${d.chofer_nombre || ""} ${
          d.chofer_apellido || ""
        }`.toLowerCase();
        return (
          String(d.VentaId).includes(term) ||
          cliente.includes(term) ||
          chofer.includes(term)
        );
      });

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="2xl"
      title="Cobrar delivery"
      description="Deliveries pendientes de cobro en efectivo"
    >
      <div className="space-y-3">
        <input
          type="text"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por N° venta, cliente o chofer"
          className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
        />

        {loading ? (
          <p className="text-sm text-slate-500 py-6 text-center">Cargando…</p>
        ) : filtrados.length === 0 ? (
          <p className="text-sm text-slate-500 py-6 text-center">
            No hay deliveries pendientes de cobro.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border max-h-[55vh]">
            <table className="w-full text-sm">
              <thead className="bg-surface-sunken text-left sticky top-0">
                <tr>
                  <th className="px-3 py-2 font-semibold">N°</th>
                  <th className="px-3 py-2 font-semibold">Cliente</th>
                  <th className="px-3 py-2 font-semibold">Chofer</th>
                  <th className="px-3 py-2 font-semibold">Fecha</th>
                  <th className="px-3 py-2 font-semibold text-right">
                    A cobrar
                  </th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((d) => (
                  <tr key={d.VentaId} className="border-t border-border">
                    <td className="px-3 py-2 font-semibold">{d.VentaId}</td>
                    <td className="px-3 py-2">
                      {`${d.ClienteNombre || ""} ${
                        d.ClienteApellido || ""
                      }`.trim() || "-"}
                    </td>
                    <td className="px-3 py-2">
                      {`${d.chofer_nombre || ""} ${
                        d.chofer_apellido || ""
                      }`.trim() || d.chofer_id}
                    </td>
                    <td className="px-3 py-2">
                      {formatFechaHora(d.VentaFecha)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold">
                      Gs. {formatMiles(d.efectivo_pendiente)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => cobrar(d)}
                        disabled={cobrandoId === d.VentaId}
                        className="rounded-md bg-emerald-600 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-700 cursor-pointer disabled:opacity-50"
                      >
                        {cobrandoId === d.VentaId ? "Cobrando…" : "Cobrar"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Modal>
  );
}
