import { useCallback, useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";
import {
  PlusIcon,
  PrinterIcon,
  TrashIcon,
  PencilSquareIcon,
  EyeIcon,
  BanknotesIcon,
} from "@heroicons/react/24/outline";
import {
  Button,
  Modal,
  LoadingState,
  ErrorState,
  EmptyState,
  PermissionDenied,
} from "../../components/common/ui";
import { usePermiso } from "../../hooks/usePermiso";
import {
  getRepartos,
  getReparto,
  getVentasDisponibles,
  createReparto,
  updateReparto,
  anularReparto,
  asignarVentas,
  quitarVenta,
  getPagosEnvio,
  corregirPagosEnvio,
  METODOS_PAGO_ENVIO,
  type MontosPagoEnvio,
  type PagosEnvio,
  REPARTO_ESTADO_BADGE,
  REPARTO_ESTADO_LABEL,
  type Reparto,
  type RepartoDetalle,
  type RepartoEstado,
  type VentaDisponible,
} from "../../services/reparto.service";
import {
  getVehiculosActivos,
  getChoferes,
  type VehiculoFlota,
  type Chofer,
} from "../../services/flota.service";
import { formatFecha, formatFechaHora, formatMiles } from "../../utils/utils";
import { labelTipoCaja } from "../../utils/tiposCaja";
import { imprimirHojaDeCarga } from "./hojaDeCarga";

const hoyISO = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const sumarDias = (iso: string, dias: number) => {
  const [y, m, d] = iso.split("-").map(Number);
  const f = new Date(y, m - 1, d + dias);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${f.getFullYear()}-${pad(f.getMonth() + 1)}-${pad(f.getDate())}`;
};
const msg = (e: unknown, fallback: string) =>
  (e as { message?: string })?.message || fallback;

const inputCls =
  "w-full bg-surface border border-border text-text text-sm rounded-md focus:outline-none focus:ring-2 focus:ring-brand-600/30 focus:border-brand-600 p-2";
const labelCls = "block mb-1 text-xs font-medium text-text-muted";

function EstadoBadge({ estado }: { estado: RepartoEstado }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${REPARTO_ESTADO_BADGE[estado]}`}
    >
      {REPARTO_ESTADO_LABEL[estado]}
    </span>
  );
}

// ── Alta / edición de la cabecera ──────────────────────────────────────────
function RepartoFormModal({
  open,
  reparto,
  vehiculos,
  choferes,
  onClose,
  onSaved,
}: {
  open: boolean;
  reparto: Reparto | null;
  vehiculos: VehiculoFlota[];
  choferes: Chofer[];
  onClose: () => void;
  onSaved: (id: number) => void;
}) {
  const [fecha, setFecha] = useState(hoyISO());
  const [vehiculoId, setVehiculoId] = useState<number | "">("");
  const [choferId, setChoferId] = useState("");
  const [observacion, setObservacion] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFecha(reparto?.fecha?.slice(0, 10) || hoyISO());
    setVehiculoId(reparto?.vehiculo_id ?? "");
    setChoferId(reparto?.chofer_id ?? "");
    setObservacion(reparto?.observacion ?? "");
  }, [open, reparto]);

  const guardar = async () => {
    if (!vehiculoId) {
      Swal.fire("Falta el vehículo", "Seleccione el vehículo del reparto", "warning");
      return;
    }
    setSaving(true);
    try {
      const data = {
        fecha,
        vehiculo_id: Number(vehiculoId),
        chofer_id: choferId || null,
        observacion: observacion || null,
      };
      if (reparto) {
        await updateReparto(reparto.id, data);
        onSaved(reparto.id);
      } else {
        onSaved(await createReparto(data));
      }
    } catch (e) {
      Swal.fire("Error", msg(e, "No se pudo guardar el reparto"), "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={reparto ? `Editar reparto #${reparto.id}` : "Nuevo reparto"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={guardar} loading={saving}>
            {reparto ? "Guardar" : "Crear"}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Fecha de salida</label>
          <input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Vehículo</label>
          <select
            value={vehiculoId}
            onChange={(e) => setVehiculoId(e.target.value ? Number(e.target.value) : "")}
            className={inputCls}
          >
            <option value="">Seleccione…</option>
            {vehiculos.map((v) => (
              <option key={v.id} value={v.id}>
                {v.chapa}
                {v.marca ? ` — ${v.marca} ${v.modelo ?? ""}` : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls}>Chofer (opcional)</label>
          <select
            value={choferId}
            onChange={(e) => setChoferId(e.target.value)}
            className={inputCls}
          >
            <option value="">Sin asignar</option>
            {choferes
              .filter((c) => c.estado !== "I" || c.usuario_id === choferId)
              .map((c) => (
                <option key={c.usuario_id} value={c.usuario_id}>
                  {`${c.nombre} ${c.apellido ?? ""}`.trim()}
                </option>
              ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls}>Observación</label>
          <textarea
            value={observacion}
            onChange={(e) => setObservacion(e.target.value)}
            rows={2}
            className={inputCls}
          />
        </div>
      </div>
    </Modal>
  );
}

// ── Selección de ventas de envío para asignar ──────────────────────────────
function AsignarVentasModal({
  open,
  reparto,
  onClose,
  onAsignadas,
}: {
  open: boolean;
  reparto: RepartoDetalle | null;
  onClose: () => void;
  onAsignadas: () => void;
}) {
  const [desde, setDesde] = useState(sumarDias(hoyISO(), -7));
  const [hasta, setHasta] = useState(hoyISO());
  const [q, setQ] = useState("");
  const [ventas, setVentas] = useState<VentaDisponible[]>([]);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      setVentas(await getVentasDisponibles({ desde, hasta, q: q || undefined }));
    } catch (e) {
      Swal.fire("Error", msg(e, "No se pudieron cargar las ventas"), "error");
    } finally {
      setLoading(false);
    }
  }, [desde, hasta, q]);

  useEffect(() => {
    if (open) {
      setSel(new Set());
      cargar();
    }
    // Solo al abrir; los filtros recargan con el botón Buscar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const toggle = (id: number) =>
    setSel((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const todas = ventas.length > 0 && ventas.every((v) => sel.has(v.venta_id));
  const toggleTodas = () =>
    setSel(todas ? new Set() : new Set(ventas.map((v) => v.venta_id)));

  const cajasSel = ventas
    .filter((v) => sel.has(v.venta_id))
    .reduce((acc, v) => acc + v.cajas, 0);

  const asignar = async () => {
    if (!reparto || !sel.size) return;
    setSaving(true);
    try {
      await asignarVentas(reparto.id, [...sel]);
      onAsignadas();
    } catch (e) {
      Swal.fire("No se pudo asignar", msg(e, "Error al asignar ventas"), "error");
      cargar();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="4xl"
      title={`Agregar ventas al reparto #${reparto?.id ?? ""}`}
      description="Ventas de envío pendientes que no están en otro reparto. Al asignarlas pasan al vehículo del reparto."
      footer={
        <>
          <span className="mr-auto text-sm text-text-muted">
            {sel.size} venta(s) · {formatMiles(cajasSel)} caja(s) retornable(s)
          </span>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={asignar} loading={saving} disabled={!sel.size}>
            Asignar
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-3">
        <div>
          <label className={labelCls}>Desde</label>
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Hasta</label>
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>N° de venta o cliente</label>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && cargar()}
            className={inputCls}
          />
        </div>
        <div className="flex items-end">
          <Button variant="outline" onClick={cargar} fullWidth>
            Buscar
          </Button>
        </div>
      </div>
      {loading ? (
        <LoadingState fullPage={false} />
      ) : !ventas.length ? (
        <EmptyState title="Sin ventas de envío pendientes" description="Pruebe con otro rango de fechas." />
      ) : (
        <div className="max-h-[55vh] overflow-auto border border-border rounded-md">
          <table className="w-full text-sm">
            <thead className="bg-surface-sunken sticky top-0">
              <tr className="text-left text-text-muted">
                <th className="p-2 w-10">
                  <input type="checkbox" checked={todas} onChange={toggleTodas} aria-label="Seleccionar todas" />
                </th>
                <th className="p-2">Venta</th>
                <th className="p-2">Fecha</th>
                <th className="p-2">Cliente</th>
                <th className="p-2">Vehículo actual</th>
                <th className="p-2 text-right">Cajas</th>
                <th className="p-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {ventas.map((v) => (
                <tr
                  key={v.venta_id}
                  onClick={() => toggle(v.venta_id)}
                  className="border-t border-border cursor-pointer hover:bg-surface-sunken"
                >
                  <td className="p-2">
                    <input
                      type="checkbox"
                      checked={sel.has(v.venta_id)}
                      onChange={() => toggle(v.venta_id)}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`Seleccionar venta ${v.venta_id}`}
                    />
                  </td>
                  <td className="p-2 font-medium">#{v.venta_id}</td>
                  <td className="p-2">{formatFecha(v.venta_fecha)}</td>
                  <td className="p-2">{v.cliente ?? "—"}</td>
                  <td className="p-2">{v.vehiculo_chapa}</td>
                  <td className="p-2 text-right">{formatMiles(v.cajas)}</td>
                  <td className="p-2 text-right">Gs. {formatMiles(v.venta_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

// ── Detalle del reparto ────────────────────────────────────────────────────
// Diferencia de cajas de un reparto recibido. El neto puede dar 0 aunque un
// tipo sobre y otro falte: en ese caso se avisa "por tipo".
function DiferenciaCajas({ r }: { r: Reparto }) {
  if (r.cajas_recibidas == null) return <span className="text-text-muted">—</span>;
  if (!r.con_diferencia) return <span className="text-success-700 font-medium">OK</span>;
  const neto = r.cajas_recibidas - r.cajas_salida;
  return (
    <span className="text-danger-700 font-semibold whitespace-nowrap">
      {neto === 0 ? "por tipo" : `${neto > 0 ? "+" : "−"}${formatMiles(Math.abs(neto))}`}
    </span>
  );
}

// Corrección de la forma de pago de una venta de envío: el cajero redistribuye
// lo cobrado (p. ej. el efectivo a cobrar al entregar terminó siendo
// transferencia). El total no cambia; cada corrección queda registrada.
function CorregirCobroModal({
  repartoId,
  ventaId,
  onClose,
  onGuardado,
}: {
  repartoId: number;
  ventaId: number | null;
  onClose: () => void;
  onGuardado: () => void;
}) {
  const [pagos, setPagos] = useState<PagosEnvio | null>(null);
  const [montos, setMontos] = useState<MontosPagoEnvio>({ efectivo: 0, pos: 0, voucher: 0, transferencia: 0 });
  const [observacion, setObservacion] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (ventaId == null) {
      setPagos(null);
      return;
    }
    let vigente = true;
    setLoading(true);
    setObservacion("");
    getPagosEnvio(repartoId, ventaId)
      .then((p) => {
        if (!vigente) return;
        setPagos(p);
        setMontos({ efectivo: p.efectivo, pos: p.pos, voucher: p.voucher, transferencia: p.transferencia });
      })
      .catch((e) => {
        if (!vigente) return;
        Swal.fire("Error", msg(e, "No se pudo cargar la forma de pago"), "error");
        onClose();
      })
      .finally(() => vigente && setLoading(false));
    return () => {
      vigente = false;
    };
  }, [repartoId, ventaId, onClose]);

  const suma = METODOS_PAGO_ENVIO.reduce((a, m) => a + montos[m.key], 0);
  const diferencia = pagos ? pagos.total - suma : 0;
  const sinCambios =
    !!pagos && METODOS_PAGO_ENVIO.every((m) => montos[m.key] === pagos[m.key]);
  const sinPagos = !!pagos && pagos.total === 0;

  const guardar = async () => {
    if (!pagos || ventaId == null || diferencia !== 0 || sinCambios) return;
    setSaving(true);
    try {
      await corregirPagosEnvio(repartoId, ventaId, montos, observacion);
      Swal.fire({ icon: "success", title: "Forma de pago corregida", timer: 1500, showConfirmButton: false });
      onGuardado();
    } catch (e) {
      Swal.fire("Error", msg(e, "No se pudo corregir la forma de pago"), "error");
    } finally {
      setSaving(false);
    }
  };

  const resumen = (m: MontosPagoEnvio) =>
    METODOS_PAGO_ENVIO.filter((x) => m[x.key] > 0)
      .map((x) => `${x.label} ${formatMiles(m[x.key])}`)
      .join(" · ") || "—";

  return (
    <Modal
      open={ventaId != null}
      onClose={onClose}
      size="lg"
      title={ventaId != null ? `Forma de pago — Venta #${ventaId}` : "Forma de pago"}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={!pagos || sinPagos || diferencia !== 0 || sinCambios || saving}>
            {saving ? "Guardando..." : "Guardar"}
          </Button>
        </>
      }
    >
      {loading || !pagos ? (
        <LoadingState fullPage={false} />
      ) : sinPagos ? (
        <p className="text-sm text-text-muted">
          Esta venta no tiene pagos de envío registrados (por ejemplo, quedó toda a crédito).
        </p>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-text-muted">
            Reparta lo cobrado según cómo pagó realmente el cliente. El total debe seguir siendo{" "}
            <b className="text-text">Gs. {formatMiles(pagos.total)}</b>.
          </p>
          <div className="grid grid-cols-2 gap-3">
            {METODOS_PAGO_ENVIO.map((m) => (
              <div key={m.key}>
                <label className={labelCls} htmlFor={`pago-${m.key}`}>
                  {m.label}
                </label>
                <input
                  id={`pago-${m.key}`}
                  type="text"
                  inputMode="numeric"
                  className={`${inputCls} text-right`}
                  value={montos[m.key] ? formatMiles(montos[m.key]) : ""}
                  placeholder="0"
                  onChange={(e) =>
                    setMontos((prev) => ({ ...prev, [m.key]: Number(e.target.value.replace(/\D/g, "")) }))
                  }
                />
              </div>
            ))}
          </div>
          <div
            className={`text-sm font-medium ${diferencia === 0 ? "text-success-700" : "text-danger-700"}`}
          >
            Suma Gs. {formatMiles(suma)}
            {diferencia > 0 && ` — faltan Gs. ${formatMiles(diferencia)}`}
            {diferencia < 0 && ` — sobran Gs. ${formatMiles(-diferencia)}`}
          </div>
          <div>
            <label className={labelCls} htmlFor="pago-obs">
              Observación (opcional)
            </label>
            <input
              id="pago-obs"
              type="text"
              className={inputCls}
              value={observacion}
              maxLength={250}
              placeholder="Ej.: transfirió el saldo al recibir"
              onChange={(e) => setObservacion(e.target.value)}
            />
          </div>
          {pagos.correcciones.length > 0 && (
            <section>
              <h4 className="text-xs font-semibold text-text-muted mb-1">Correcciones anteriores</h4>
              <ul className="text-xs space-y-1">
                {pagos.correcciones.map((c) => (
                  <li key={c.id} className="border border-border rounded-md p-2">
                    <div className="text-text-muted">
                      {formatFechaHora(c.corregido_en)} · {c.usuario_id ?? "?"}
                    </div>
                    <div>Antes: {resumen(c.antes)}</div>
                    <div>Después: {resumen(c.despues)}</div>
                    {c.observacion && <div className="text-text-muted">{c.observacion}</div>}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </Modal>
  );
}

function RepartoDetalleModal({
  open,
  repartoId,
  puedeEditar,
  onClose,
  onEditar,
  onCambio,
  version,
}: {
  open: boolean;
  repartoId: number | null;
  puedeEditar: boolean;
  onClose: () => void;
  onEditar: (r: Reparto) => void;
  onCambio: () => void;
  version: number;
}) {
  const [det, setDet] = useState<RepartoDetalle | null>(null);
  const [loading, setLoading] = useState(false);
  const [asignarOpen, setAsignarOpen] = useState(false);
  const [cobroVentaId, setCobroVentaId] = useState<number | null>(null);
  const puedeCorregirCobro = usePermiso("CORREGIRCOBROENVIO", "editar");
  const cerrarCobro = useCallback(() => setCobroVentaId(null), []);

  const cargar = useCallback(async () => {
    if (!repartoId) return;
    setLoading(true);
    try {
      setDet(await getReparto(repartoId));
    } catch (e) {
      Swal.fire("Error", msg(e, "No se pudo cargar el reparto"), "error");
    } finally {
      setLoading(false);
    }
  }, [repartoId]);

  useEffect(() => {
    if (open) cargar();
    else setDet(null);
  }, [open, cargar, version]);

  const editable = puedeEditar && det?.estado === "ARMADO";
  const corregible = puedeCorregirCobro && !!det && det.estado !== "ANULADO";
  const conAcciones = editable || corregible;
  const conCajas = det?.cajas.some((c) => c.cajas_recibidas != null);
  const totalSalida = det?.cajas.reduce((a, c) => a + c.cajas_salida, 0) ?? 0;

  const quitar = async (ventaId: number) => {
    if (!det) return;
    const ok = await Swal.fire({
      title: `¿Quitar la venta #${ventaId} del reparto?`,
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Quitar",
      cancelButtonText: "Cancelar",
    });
    if (!ok.isConfirmed) return;
    try {
      await quitarVenta(det.id, ventaId);
      await cargar();
      onCambio();
    } catch (e) {
      Swal.fire("Error", msg(e, "No se pudo quitar la venta"), "error");
    }
  };

  const anular = async () => {
    if (!det) return;
    const ok = await Swal.fire({
      title: `¿Anular el reparto #${det.id}?`,
      text: "Sus ventas quedan libres para asignarse a otro reparto.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Anular",
      cancelButtonText: "Cancelar",
    });
    if (!ok.isConfirmed) return;
    try {
      await anularReparto(det.id);
      onCambio();
      onClose();
    } catch (e) {
      Swal.fire("Error", msg(e, "No se pudo anular el reparto"), "error");
    }
  };

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        size="6xl"
        title={det ? `Reparto #${det.id}` : "Reparto"}
        footer={
          det && (
            <>
              {editable && (
                <Button variant="danger" leftIcon={TrashIcon} onClick={anular} className="mr-auto">
                  Anular
                </Button>
              )}
              <Button variant="outline" leftIcon={PrinterIcon} onClick={() => imprimirHojaDeCarga(det)}>
                Imprimir hoja de carga
              </Button>
              {editable && (
                <Button variant="secondary" leftIcon={PencilSquareIcon} onClick={() => onEditar(det)}>
                  Editar
                </Button>
              )}
              {editable && (
                <Button leftIcon={PlusIcon} onClick={() => setAsignarOpen(true)}>
                  Agregar ventas
                </Button>
              )}
            </>
          )
        }
      >
        {loading && !det ? (
          <LoadingState fullPage={false} />
        ) : det ? (
          <div className="space-y-5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div>
                <div className={labelCls}>Estado</div>
                <EstadoBadge estado={det.estado} />
              </div>
              <div>
                <div className={labelCls}>Fecha</div>
                {formatFecha(det.fecha)}
              </div>
              <div>
                <div className={labelCls}>Vehículo</div>
                {det.vehiculo_chapa}
              </div>
              <div>
                <div className={labelCls}>Chofer</div>
                {det.chofer_nombre ?? "Sin asignar"}
              </div>
              {det.salida_en && (
                <div>
                  <div className={labelCls}>Salida</div>
                  {formatFechaHora(det.salida_en)} · {det.salida_por}
                </div>
              )}
              {det.recepcion_en && (
                <div>
                  <div className={labelCls}>Recepción</div>
                  {formatFechaHora(det.recepcion_en)} · {det.recepcion_por}
                </div>
              )}
              {det.observacion && (
                <div className="col-span-2">
                  <div className={labelCls}>Observación</div>
                  {det.observacion}
                </div>
              )}
              {det.recepcion_observacion && (
                <div className="col-span-2">
                  <div className={labelCls}>Observación de recepción</div>
                  {det.recepcion_observacion}
                </div>
              )}
            </div>

            <section>
              <h3 className="text-sm font-semibold text-text mb-2">
                Cajas retornables ({formatMiles(totalSalida)})
                {det.estado === "ARMADO" && (
                  <span className="ml-2 font-normal text-text-muted">
                    calculadas con las ventas actuales; se congelan al confirmar la salida
                  </span>
                )}
              </h3>
              {!det.cajas.length ? (
                <p className="text-sm text-text-muted">Ninguna venta lleva productos con tipo de caja.</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
                  {det.cajas.map((c) => {
                    const dif = c.cajas_recibidas != null ? c.cajas_recibidas - c.cajas_salida : 0;
                    return (
                      <div key={c.tipo_caja} className="border border-border rounded-md p-2 bg-surface">
                        <div className="text-xs text-text-muted">{labelTipoCaja(c.tipo_caja)}</div>
                        <div className="text-xl font-semibold text-text">{formatMiles(c.cajas_salida)}</div>
                        {conCajas && (
                          <div className={`text-xs ${dif === 0 ? "text-success-700" : "text-danger-700"}`}>
                            Recibidas {formatMiles(c.cajas_recibidas ?? 0)}
                            {dif !== 0 && ` (${dif > 0 ? "+" : ""}${dif})`}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <section>
              <h3 className="text-sm font-semibold text-text mb-2">Ventas ({det.ventas.length})</h3>
              {!det.ventas.length ? (
                <p className="text-sm text-text-muted">
                  Todavía no tiene ventas. {editable && "Use \"Agregar ventas\"."}
                </p>
              ) : (
                <table className="w-full text-sm border border-border rounded-md">
                  <thead className="bg-surface-sunken text-left text-text-muted">
                    <tr>
                      <th className="p-2">Venta</th>
                      <th className="p-2">Fecha</th>
                      <th className="p-2">Cliente</th>
                      <th className="p-2 text-right">Total</th>
                      {conAcciones && <th className="p-2 w-20" />}
                    </tr>
                  </thead>
                  <tbody>
                    {det.ventas.map((v) => (
                      <tr key={v.venta_id} className={`border-t border-border ${v.no_entregada ? "bg-danger-50" : ""}`}>
                        <td className="p-2 font-medium">#{v.venta_id}</td>
                        <td className="p-2">{formatFecha(v.venta_fecha)}</td>
                        <td className="p-2">
                          {v.cliente ?? "—"}
                          {v.no_entregada && (
                            <span className="ml-2 inline-block rounded border border-danger-600 px-1.5 text-xs font-medium text-danger-700">
                              No entregada
                            </span>
                          )}
                        </td>
                        <td className="p-2 text-right">Gs. {formatMiles(v.venta_total)}</td>
                        {conAcciones && (
                          <td className="p-2 whitespace-nowrap text-right">
                            {corregible && !v.no_entregada && (
                              <button
                                onClick={() => setCobroVentaId(v.venta_id)}
                                title="Corregir forma de pago"
                                aria-label={`Corregir forma de pago de la venta ${v.venta_id}`}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-brand-700 hover:bg-brand-50 cursor-pointer"
                              >
                                <BanknotesIcon className="h-4 w-4" />
                              </button>
                            )}
                            {editable && (
                              <button
                                onClick={() => quitar(v.venta_id)}
                                title="Quitar del reparto"
                                aria-label={`Quitar venta ${v.venta_id}`}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-danger-700 hover:bg-danger-50 cursor-pointer"
                              >
                                <TrashIcon className="h-4 w-4" />
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            {det.productos.length > 0 && (
              <section>
                <h3 className="text-sm font-semibold text-text mb-2">Productos a cargar</h3>
                <table className="w-full text-sm border border-border rounded-md">
                  <thead className="bg-surface-sunken text-left text-text-muted">
                    <tr>
                      <th className="p-2">Código</th>
                      <th className="p-2">Producto</th>
                      <th className="p-2">Tipo de caja</th>
                      <th className="p-2 text-right">Cajas</th>
                      <th className="p-2 text-right">Unidades</th>
                    </tr>
                  </thead>
                  <tbody>
                    {det.productos.map((p) => (
                      <tr key={p.producto_id} className="border-t border-border">
                        <td className="p-2">{p.producto_codigo}</td>
                        <td className="p-2">{p.producto_nombre}</td>
                        <td className="p-2">{p.tipo_caja ? labelTipoCaja(p.tipo_caja) : "—"}</td>
                        <td className="p-2 text-right">{p.cajas ? formatMiles(p.cajas) : ""}</td>
                        <td className="p-2 text-right">{p.unidades ? formatMiles(p.unidades) : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}
          </div>
        ) : null}
      </Modal>
      {det && (
        <CorregirCobroModal
          repartoId={det.id}
          ventaId={cobroVentaId}
          onClose={cerrarCobro}
          onGuardado={cerrarCobro}
        />
      )}
      <AsignarVentasModal
        open={asignarOpen}
        reparto={det}
        onClose={() => setAsignarOpen(false)}
        onAsignadas={async () => {
          setAsignarOpen(false);
          await cargar();
          onCambio();
        }}
      />
    </>
  );
}

// ── Página ─────────────────────────────────────────────────────────────────
export default function RepartosPage() {
  const puedeLeer = usePermiso("REPARTOS", "leer");
  const puedeCrear = usePermiso("REPARTOS", "crear");
  const puedeEditar = usePermiso("REPARTOS", "editar");

  const [repartos, setRepartos] = useState<Reparto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [estado, setEstado] = useState<RepartoEstado | "">("");
  const [desde, setDesde] = useState(sumarDias(hoyISO(), -7));
  const [hasta, setHasta] = useState(sumarDias(hoyISO(), 7));
  const [soloDiferencias, setSoloDiferencias] = useState(false);

  const [vehiculos, setVehiculos] = useState<VehiculoFlota[]>([]);
  const [choferes, setChoferes] = useState<Chofer[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editando, setEditando] = useState<Reparto | null>(null);
  const [detalleId, setDetalleId] = useState<number | null>(null);
  // Fuerza recargar el detalle abierto después de editar la cabecera.
  const [detalleVersion, setDetalleVersion] = useState(0);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRepartos(
        await getRepartos({
          estado: estado || undefined,
          desde: desde || undefined,
          hasta: hasta || undefined,
          conDiferencia: soloDiferencias || undefined,
        }),
      );
    } catch (e) {
      setError(msg(e, "Error al obtener repartos"));
    } finally {
      setLoading(false);
    }
  }, [estado, desde, hasta, soloDiferencias]);

  useEffect(() => {
    if (puedeLeer) cargar();
  }, [puedeLeer, cargar]);

  useEffect(() => {
    if (!puedeLeer) return;
    getVehiculosActivos().then(setVehiculos).catch(() => setVehiculos([]));
    getChoferes().then(setChoferes).catch(() => setChoferes([]));
  }, [puedeLeer]);

  const totales = useMemo(
    () => ({
      armados: repartos.filter((r) => r.estado === "ARMADO").length,
      enRuta: repartos.filter((r) => r.estado === "EN_RUTA").length,
    }),
    [repartos],
  );

  if (!puedeLeer) return <PermissionDenied />;

  return (
    <div className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-semibold text-text">Repartos</h1>
          <p className="text-sm text-text-muted">
            {totales.armados} armado(s) · {totales.enRuta} en ruta
          </p>
        </div>
        {puedeCrear && (
          <Button
            leftIcon={PlusIcon}
            onClick={() => {
              setEditando(null);
              setFormOpen(true);
            }}
          >
            Nuevo reparto
          </Button>
        )}
      </div>

      <div className="bg-surface-sunken border border-border rounded-lg p-4 mb-4 grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div>
          <label className={labelCls}>Estado</label>
          <select value={estado} onChange={(e) => setEstado(e.target.value as RepartoEstado | "")} className={inputCls}>
            <option value="">TODOS</option>
            {(Object.keys(REPARTO_ESTADO_LABEL) as RepartoEstado[]).map((k) => (
              <option key={k} value={k}>
                {REPARTO_ESTADO_LABEL[k]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Fecha desde</label>
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Fecha hasta</label>
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Cajas</label>
          <select
            value={soloDiferencias ? "DIF" : ""}
            onChange={(e) => setSoloDiferencias(e.target.value === "DIF")}
            className={inputCls}
          >
            <option value="">TODOS</option>
            <option value="DIF">Con diferencias</option>
          </select>
        </div>
      </div>

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={cargar} />
      ) : !repartos.length ? (
        <EmptyState title="No hay repartos en el período" />
      ) : (
        <div className="overflow-x-auto border border-border rounded-lg bg-surface">
          <table className="w-full text-sm">
            <thead className="bg-surface-sunken text-left text-text-muted">
              <tr>
                <th className="p-3">N°</th>
                <th className="p-3">Fecha</th>
                <th className="p-3">Vehículo</th>
                <th className="p-3">Chofer</th>
                <th className="p-3 text-right">Ventas</th>
                <th className="p-3 text-right">Total</th>
                <th className="p-3 text-right">Cajas salida</th>
                <th className="p-3 text-right">Recibidas</th>
                <th className="p-3 text-right">Dif.</th>
                <th className="p-3">Estado</th>
                <th className="p-3 w-12" />
              </tr>
            </thead>
            <tbody>
              {repartos.map((r) => (
                <tr
                  key={r.id}
                  className="border-t border-border hover:bg-surface-sunken cursor-pointer"
                  onClick={() => setDetalleId(r.id)}
                >
                  <td className="p-3 font-medium">#{r.id}</td>
                  <td className="p-3">{formatFecha(r.fecha)}</td>
                  <td className="p-3">{r.vehiculo_chapa}</td>
                  <td className="p-3">{r.chofer_nombre ?? "—"}</td>
                  <td className="p-3 text-right">
                    {formatMiles(r.cantidad_ventas)}
                    {r.ventas_no_entregadas > 0 && (
                      <div className="text-xs text-danger-700 whitespace-nowrap">
                        {r.ventas_no_entregadas} no entregada(s)
                      </div>
                    )}
                  </td>
                  <td className="p-3 text-right">Gs. {formatMiles(r.total_ventas)}</td>
                  <td className="p-3 text-right">{formatMiles(r.cajas_salida)}</td>
                  <td className="p-3 text-right">
                    {r.cajas_recibidas != null ? formatMiles(r.cajas_recibidas) : "—"}
                  </td>
                  <td className="p-3 text-right">
                    <DiferenciaCajas r={r} />
                  </td>
                  <td className="p-3">
                    <EstadoBadge estado={r.estado} />
                  </td>
                  <td className="p-3">
                    <EyeIcon className="h-5 w-5 text-text-muted" aria-label="Ver" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <RepartoDetalleModal
        open={detalleId != null}
        repartoId={detalleId}
        puedeEditar={puedeEditar}
        onClose={() => setDetalleId(null)}
        onEditar={(r) => {
          setEditando(r);
          setFormOpen(true);
        }}
        onCambio={cargar}
        version={detalleVersion}
      />
      {/* Después del detalle: el form de edición se abre encima de él. */}
      <RepartoFormModal
        open={formOpen}
        reparto={editando}
        vehiculos={vehiculos}
        choferes={choferes}
        onClose={() => setFormOpen(false)}
        onSaved={(id) => {
          setFormOpen(false);
          cargar();
          setDetalleId(id);
          setDetalleVersion((v) => v + 1);
        }}
      />
    </div>
  );
}
