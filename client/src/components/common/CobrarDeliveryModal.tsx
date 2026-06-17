import { useEffect, useState, useCallback } from "react";
import Swal from "sweetalert2";
import Modal from "./Modal/Modal";
import PaymentModal from "./PaymentModal";
import {
  getDeliveries,
  cobrarDelivery,
  type Delivery,
} from "../../services/venta.service";
import { formatFechaHora, formatMiles } from "../../utils/utils";

interface Props {
  open: boolean;
  onClose: () => void;
  // Caja abierta del cajero (a la que entra lo cobrado).
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

// Monto a cobrar de un delivery: el total diferido (monto_pendiente) o, para
// deliveries del flujo viejo, el efectivo pendiente.
const montoACobrar = (d: Delivery) =>
  Number(d.monto_pendiente) || Number(d.efectivo_pendiente) || 0;

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

  // Delivery elegido para cobrar: al setearlo se abre el PaymentModal con su
  // total pendiente. El cajero carga ahí el desglose de pago real.
  const [cobrando, setCobrando] = useState<Delivery | null>(null);
  const [enviando, setEnviando] = useState(false);

  // Estado del PaymentModal (mismos campos que la venta de mostrador).
  const [totalRest, setTotalRest] = useState(0);
  const [efectivo, setEfectivo] = useState(0);
  const [banco, setBanco] = useState(0);
  const [bancoDebito, setBancoDebito] = useState(0);
  const [bancoCredito, setBancoCredito] = useState(0);
  const [cuentaCliente, setCuentaCliente] = useState(0);
  const [voucher, setVoucher] = useState(0);
  const [ventaNroPOS, setVentaNroPOS] = useState("");
  const [printTicket, setPrintTicket] = useState(false);

  // Deliveries pendientes de cobro (monto pendiente, no cobrados, no cancelados).
  const fetchDeliveries = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getDeliveries({});
      setDeliveries(
        data.filter(
          (d) => montoACobrar(d) > 0 && !d.cobrado_en && d.estado !== "CANCELADO"
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

  const abrirCobro = (d: Delivery) => {
    if (!cajaId) {
      Swal.fire({
        icon: "warning",
        title: "Sin caja abierta",
        text: "Necesitás una caja abierta para registrar el cobro.",
        confirmButtonColor: "#3085d6",
      });
      return;
    }
    // El PaymentModal resetea sus montos en su propio useEffect(show).
    setCobrando(d);
  };

  // "Facturar" del PaymentModal: registra el desglose de pago del delivery. El
  // mapeo de Pagos es idéntico al de la venta de mostrador (Sales.tsx): el
  // efectivo va neto del vuelto y la tarjeta (con recargo) va en Banco.
  const confirmarCobro = async () => {
    if (!cobrando || !cajaId) return;
    setEnviando(true);
    try {
      await cobrarDelivery(cobrando.VentaId, {
        Pagos: {
          Efectivo: Number(efectivo) + Number(totalRest),
          Banco: Number(bancoDebito) + Number(bancoCredito),
          CuentaCliente: Number(cuentaCliente),
          Voucher: Number(voucher),
          Transferencia: Number(banco),
          VentaNroPOS:
            bancoDebito > 0 || bancoCredito > 0
              ? ventaNroPOS.trim() || "0"
              : "0",
        },
        CajaId: cajaId,
        UsuarioId: usuarioId,
        Fecha: isoLocalAhora(),
      });
      setCobrando(null);
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
      setEnviando(false);
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
    <>
      <Modal
        open={open && !cobrando}
        onClose={onClose}
        size="4xl"
        title="Cobrar delivery"
        description="Deliveries pendientes de cobro"
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
                        Gs. {formatMiles(montoACobrar(d))}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          onClick={() => abrirCobro(d)}
                          className="rounded-md bg-emerald-600 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-700 cursor-pointer disabled:opacity-50"
                        >
                          Cobrar
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

      {/* Modal de pago: el cajero carga el desglose con que se pagó el delivery
          al volver el chofer. Total = monto pendiente del delivery. */}
      <PaymentModal
        show={!!cobrando}
        handleClose={() => (enviando ? undefined : setCobrando(null))}
        totalCost={cobrando ? montoACobrar(cobrando) : 0}
        totalRest={totalRest}
        setTotalRest={setTotalRest}
        efectivo={efectivo}
        setEfectivo={setEfectivo}
        banco={banco}
        setBanco={setBanco}
        bancoDebito={bancoDebito}
        setBancoDebito={setBancoDebito}
        bancoCredito={bancoCredito}
        setBancoCredito={setBancoCredito}
        cuentaCliente={cuentaCliente}
        setCuentaCliente={setCuentaCliente}
        sendRequest={confirmarCobro}
        setPrintTicket={setPrintTicket}
        printTicket={printTicket}
        voucher={voucher}
        setVoucher={setVoucher}
        ventaNroPOS={ventaNroPOS}
        setVentaNroPOS={setVentaNroPOS}
        hidePrintTicket
      />
    </>
  );
}
