import { useCallback, useEffect, useState } from "react";
import Swal from "sweetalert2";
import {
  ArrowLeftIcon,
  ArrowPathIcon,
  MinusIcon,
  PlusIcon,
  TruckIcon,
} from "@heroicons/react/24/outline";
import {
  Button,
  LoadingState,
  ErrorState,
  EmptyState,
  PermissionDenied,
} from "../../components/common/ui";
import { usePermiso } from "../../hooks/usePermiso";
import {
  getRepartos,
  getReparto,
  confirmarSalida,
  confirmarRecepcion,
  type Reparto,
  type RepartoDetalle,
} from "../../services/reparto.service";
import { formatFecha, formatFechaHora, formatMiles } from "../../utils/utils";
import { labelTipoCaja } from "../../utils/tiposCaja";

// Pantalla del RUTEADOR (pensada para tablet): controla la SALIDA de los
// repartos armados y la RECEPCIÓN de los que vuelven, contando las cajas
// retornables por tipo. Botones y números grandes para uso táctil.

type Modo = "salida" | "recepcion";
const msg = (e: unknown, fallback: string) =>
  (e as { message?: string })?.message || fallback;
const REFRESCO_MS = 30000;

function TarjetaReparto({ r, onClick }: { r: Reparto; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="text-left w-full rounded-xl border-2 border-border bg-surface p-5 shadow-sm hover:border-brand-600 active:bg-surface-sunken transition-colors cursor-pointer"
    >
      <div className="flex items-center gap-3">
        <TruckIcon className="h-9 w-9 text-brand-700 shrink-0" />
        <div className="min-w-0">
          <div className="text-2xl font-bold text-text">{r.vehiculo_chapa}</div>
          <div className="text-base text-text-muted truncate">{r.chofer_nombre ?? "Sin chofer asignado"}</div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-text-muted">
        <span>Reparto #{r.id}</span>
        <span>{formatFecha(r.fecha)}</span>
        <span>{r.cantidad_ventas} venta(s)</span>
        {r.salida_en && <span>Salió {formatFechaHora(r.salida_en)}</span>}
      </div>
    </button>
  );
}

// ── Detalle: salida ────────────────────────────────────────────────────────
function DetalleSalida({ det, onHecho }: { det: RepartoDetalle; onHecho: () => void }) {
  const [saving, setSaving] = useState(false);
  const total = det.cajas.reduce((a, c) => a + c.cajas_salida, 0);

  const confirmar = async () => {
    const ok = await Swal.fire({
      title: `¿Confirmar la salida de ${det.vehiculo_chapa}?`,
      html: `Salen <b>${formatMiles(total)}</b> caja(s) retornable(s) y ${det.ventas.length} venta(s).`,
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Confirmar salida",
      cancelButtonText: "Cancelar",
    });
    if (!ok.isConfirmed) return;
    setSaving(true);
    try {
      await confirmarSalida(det.id);
      await Swal.fire({ icon: "success", title: "Salida confirmada", timer: 1500, showConfirmButton: false });
      onHecho();
    } catch (e) {
      Swal.fire("No se pudo confirmar", msg(e, "Error al confirmar la salida"), "error");
      onHecho();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-lg font-semibold text-text mb-3">Cajas que tiene que llevar</h2>
        {!det.cajas.length ? (
          <p className="text-text-muted">Este reparto no lleva cajas retornables.</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {det.cajas.map((c) => (
              <div key={c.tipo_caja} className="rounded-xl border border-border bg-surface p-4">
                <div className="text-base text-text-muted">{labelTipoCaja(c.tipo_caja)}</div>
                <div className="text-4xl font-bold text-text">{formatMiles(c.cajas_salida)}</div>
              </div>
            ))}
          </div>
        )}
      </section>
      <section>
        <h2 className="text-lg font-semibold text-text mb-3">Productos</h2>
        <div className="rounded-xl border border-border bg-surface divide-y divide-border">
          {det.productos.map((p) => (
            <div key={p.producto_id} className="flex items-center justify-between gap-3 p-3 text-base">
              <span className="text-text">{p.producto_nombre}</span>
              <span className="font-semibold text-text whitespace-nowrap">
                {p.cajas ? `${formatMiles(p.cajas)} caja(s)` : ""}
                {p.cajas && p.unidades ? " + " : ""}
                {p.unidades ? `${formatMiles(p.unidades)} unid.` : ""}
              </span>
            </div>
          ))}
        </div>
      </section>
      <Button size="lg" variant="success" fullWidth loading={saving} onClick={confirmar} className="py-4! text-lg!">
        Confirmar salida
      </Button>
    </div>
  );
}

// ── Detalle: recepción ─────────────────────────────────────────────────────
function DetalleRecepcion({ det, onHecho }: { det: RepartoDetalle; onHecho: () => void }) {
  // Arranca vacío: el ruteador tiene que contar, no aceptar lo esperado.
  const [recibidas, setRecibidas] = useState<Record<string, number | "">>(() =>
    Object.fromEntries(det.cajas.map((c) => [c.tipo_caja, ""])),
  );
  const [observacion, setObservacion] = useState("");
  // Ventas que volvieron sin entregar: quedan pendientes para otro reparto.
  const [noEntregadas, setNoEntregadas] = useState<Set<number>>(() => new Set());
  const [saving, setSaving] = useState(false);

  const set = (tipo: string, v: number | "") =>
    setRecibidas((prev) => ({ ...prev, [tipo]: v === "" ? "" : Math.max(0, v) }));

  const toggleEntrega = (ventaId: number) =>
    setNoEntregadas((prev) => {
      const next = new Set(prev);
      if (next.has(ventaId)) next.delete(ventaId);
      else next.add(ventaId);
      return next;
    });

  const faltanCargar = det.cajas.some((c) => recibidas[c.tipo_caja] === "");
  const hayDiferencia = det.cajas.some(
    (c) => recibidas[c.tipo_caja] !== "" && recibidas[c.tipo_caja] !== c.cajas_salida,
  );
  const obsObligatoria = hayDiferencia || noEntregadas.size > 0;
  const obsFaltante = obsObligatoria && !observacion.trim();
  const motivoObs = [
    hayDiferencia && "hay diferencias",
    noEntregadas.size > 0 && "hay ventas no entregadas",
  ]
    .filter(Boolean)
    .join(" y ");

  const confirmar = async () => {
    if (faltanCargar || obsFaltante) return;
    const avisos = [
      hayDiferencia ? "Las cajas tienen diferencias." : "Las cajas coinciden.",
      noEntregadas.size > 0 &&
        `${noEntregadas.size} venta(s) no entregada(s) vuelven a pendientes para otro reparto.`,
    ].filter(Boolean);
    const ok = await Swal.fire({
      title: `¿Confirmar la recepción de ${det.vehiculo_chapa}?`,
      text: avisos.join(" "),
      icon: obsObligatoria ? "warning" : "question",
      showCancelButton: true,
      confirmButtonText: "Confirmar",
      cancelButtonText: "Cancelar",
    });
    if (!ok.isConfirmed) return;
    setSaving(true);
    try {
      await confirmarRecepcion(
        det.id,
        det.cajas.map((c) => ({ tipo_caja: c.tipo_caja, cajas_recibidas: Number(recibidas[c.tipo_caja]) })),
        observacion,
        [...noEntregadas],
      );
      await Swal.fire({ icon: "success", title: "Recepción registrada", timer: 1500, showConfirmButton: false });
      onHecho();
    } catch (e) {
      Swal.fire("No se pudo registrar", msg(e, "Error al registrar la recepción"), "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-lg font-semibold text-text mb-3">Cajas que tiene que recibir</h2>
        {!det.cajas.length ? (
          <p className="text-text-muted">Este reparto no llevó cajas retornables.</p>
        ) : (
          <div className="space-y-3">
            {det.cajas.map((c) => {
              const v = recibidas[c.tipo_caja];
              const dif = v === "" ? null : v - c.cajas_salida;
              return (
                <div
                  key={c.tipo_caja}
                  className={`rounded-xl border-2 bg-surface p-4 flex flex-wrap items-center gap-4 ${
                    dif == null ? "border-border" : dif === 0 ? "border-success-600" : "border-danger-600"
                  }`}
                >
                  <div className="flex-1 min-w-40">
                    <div className="text-lg font-semibold text-text">{labelTipoCaja(c.tipo_caja)}</div>
                    <div className="text-base text-text-muted">
                      Tiene que recibir: <span className="text-2xl font-bold text-text">{formatMiles(c.cajas_salida)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => set(c.tipo_caja, v === "" ? 0 : v - 1)}
                      aria-label={`Restar ${labelTipoCaja(c.tipo_caja)}`}
                      className="h-14 w-14 rounded-xl border border-border bg-surface-sunken flex items-center justify-center active:bg-border cursor-pointer"
                    >
                      <MinusIcon className="h-7 w-7" />
                    </button>
                    <input
                      inputMode="numeric"
                      value={v === "" ? "" : formatMiles(v)}
                      onChange={(e) => {
                        const d = e.target.value.replace(/\D/g, "");
                        set(c.tipo_caja, d === "" ? "" : Number(d));
                      }}
                      placeholder="—"
                      aria-label={`Recibidas ${labelTipoCaja(c.tipo_caja)}`}
                      className="h-14 w-24 text-center text-3xl font-bold bg-surface border border-border rounded-xl text-text focus:outline-none focus:ring-2 focus:ring-brand-600/30"
                    />
                    <button
                      type="button"
                      onClick={() => set(c.tipo_caja, v === "" ? 1 : v + 1)}
                      aria-label={`Sumar ${labelTipoCaja(c.tipo_caja)}`}
                      className="h-14 w-14 rounded-xl border border-border bg-surface-sunken flex items-center justify-center active:bg-border cursor-pointer"
                    >
                      <PlusIcon className="h-7 w-7" />
                    </button>
                  </div>
                  <div className="w-full sm:w-32 text-right text-lg font-semibold">
                    {dif == null ? (
                      <span className="text-text-muted">Sin contar</span>
                    ) : dif === 0 ? (
                      <span className="text-success-700">Completo</span>
                    ) : dif < 0 ? (
                      <span className="text-danger-700">Faltan {formatMiles(-dif)}</span>
                    ) : (
                      <span className="text-danger-700">Sobran {formatMiles(dif)}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
      <section>
        <h2 className="text-lg font-semibold text-text mb-1">Ventas</h2>
        <p className="text-base text-text-muted mb-3">
          Marque las que volvieron sin entregar: quedan pendientes para otro reparto.
        </p>
        <div className="space-y-2">
          {det.ventas.map((v) => {
            const noEntregada = noEntregadas.has(v.venta_id);
            return (
              <div
                key={v.venta_id}
                className={`rounded-xl border-2 bg-surface p-3 flex flex-wrap items-center gap-3 ${
                  noEntregada ? "border-danger-600" : "border-border"
                }`}
              >
                <div className="flex-1 min-w-40">
                  <div className="text-lg font-semibold text-text">{v.cliente ?? "Sin cliente"}</div>
                  <div className="text-base text-text-muted">
                    Venta #{v.venta_id} · Gs. {formatMiles(v.venta_total)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => toggleEntrega(v.venta_id)}
                  aria-pressed={noEntregada}
                  className={`h-14 px-5 rounded-xl text-lg font-semibold border-2 cursor-pointer ${
                    noEntregada
                      ? "bg-danger-50 text-danger-700 border-danger-600"
                      : "bg-success-50 text-success-700 border-success-600"
                  }`}
                >
                  {noEntregada ? "No entregada" : "Entregada"}
                </button>
              </div>
            );
          })}
        </div>
      </section>
      <section>
        <label className="block text-lg font-semibold text-text mb-2">
          Observación {obsObligatoria && <span className="text-danger-700">(obligatoria: {motivoObs})</span>}
        </label>
        <textarea
          value={observacion}
          onChange={(e) => setObservacion(e.target.value)}
          rows={3}
          className={`w-full text-base bg-surface border rounded-xl p-3 text-text focus:outline-none focus:ring-2 focus:ring-brand-600/30 ${
            obsFaltante ? "border-danger-600" : "border-border"
          }`}
        />
      </section>
      <Button
        size="lg"
        variant="success"
        fullWidth
        loading={saving}
        disabled={faltanCargar || obsFaltante}
        onClick={confirmar}
        className="py-4! text-lg!"
      >
        {faltanCargar ? "Cargue todas las cajas recibidas" : obsFaltante ? "Escriba la observación" : "Confirmar recepción"}
      </Button>
    </div>
  );
}

// ── Página ─────────────────────────────────────────────────────────────────
export default function ControlRepartosPage() {
  const puedeLeer = usePermiso("CONTROLREPARTOS", "leer");
  const puedeEditar = usePermiso("CONTROLREPARTOS", "editar");

  const [modo, setModo] = useState<Modo>("recepcion");
  const [repartos, setRepartos] = useState<Reparto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [det, setDet] = useState<RepartoDetalle | null>(null);
  const [cargandoDet, setCargandoDet] = useState(false);

  const cargar = useCallback(async (silencioso = false) => {
    if (!silencioso) setLoading(true);
    setError(null);
    try {
      setRepartos(await getRepartos({ estado: modo === "salida" ? "ARMADO" : "EN_RUTA" }));
    } catch (e) {
      setError(msg(e, "Error al obtener repartos"));
    } finally {
      setLoading(false);
    }
  }, [modo]);

  useEffect(() => {
    if (!puedeLeer || det) return;
    cargar();
    const t = window.setInterval(() => cargar(true), REFRESCO_MS);
    return () => window.clearInterval(t);
  }, [puedeLeer, det, cargar]);

  const abrir = async (r: Reparto) => {
    setCargandoDet(true);
    try {
      setDet(await getReparto(r.id));
    } catch (e) {
      Swal.fire("Error", msg(e, "No se pudo abrir el reparto"), "error");
    } finally {
      setCargandoDet(false);
    }
  };

  if (!puedeLeer) return <PermissionDenied />;

  if (det) {
    const esSalida = det.estado === "ARMADO";
    return (
      <div className="p-4 max-w-4xl mx-auto">
        <button
          onClick={() => setDet(null)}
          className="mb-4 inline-flex items-center gap-2 text-lg text-brand-700 font-medium py-2 cursor-pointer"
        >
          <ArrowLeftIcon className="h-6 w-6" /> Volver
        </button>
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-text">{det.vehiculo_chapa}</h1>
          <p className="text-lg text-text-muted">
            {det.chofer_nombre ?? "Sin chofer asignado"} · Reparto #{det.id} · {formatFecha(det.fecha)} ·{" "}
            {det.ventas.length} venta(s)
          </p>
        </div>
        {!puedeEditar ? (
          <p className="text-text-muted">No tiene permiso para confirmar.</p>
        ) : esSalida ? (
          <DetalleSalida det={det} onHecho={() => setDet(null)} />
        ) : det.estado === "EN_RUTA" ? (
          <DetalleRecepcion det={det} onHecho={() => setDet(null)} />
        ) : (
          <p className="text-text-muted">Este reparto ya está {det.estado.toLowerCase()}.</p>
        )}
      </div>
    );
  }

  return (
    <div className="p-4 max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h1 className="text-2xl font-bold text-text">Control de vehículos</h1>
        <button
          onClick={() => cargar()}
          aria-label="Actualizar"
          className="h-12 w-12 rounded-xl border border-border bg-surface flex items-center justify-center cursor-pointer"
        >
          <ArrowPathIcon className="h-6 w-6 text-text-muted" />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2 mb-5 rounded-xl bg-surface-sunken p-1.5">
        {(
          [
            ["recepcion", "Llegan (recepción)"],
            ["salida", "Salen (carga)"],
          ] as [Modo, string][]
        ).map(([m, label]) => (
          <button
            key={m}
            onClick={() => setModo(m)}
            className={`py-3 rounded-lg text-lg font-semibold cursor-pointer ${
              modo === m ? "bg-surface text-brand-700 shadow-sm" : "text-text-muted"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {loading || cargandoDet ? (
        <LoadingState fullPage={false} />
      ) : error ? (
        <ErrorState message={error} onRetry={() => cargar()} />
      ) : !repartos.length ? (
        <EmptyState
          title={modo === "salida" ? "No hay repartos listos para salir" : "No hay vehículos en ruta"}
          description="La lista se actualiza sola cada 30 segundos."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {repartos.map((r) => (
            <TarjetaReparto key={r.id} r={r} onClick={() => abrir(r)} />
          ))}
        </div>
      )}
    </div>
  );
}
