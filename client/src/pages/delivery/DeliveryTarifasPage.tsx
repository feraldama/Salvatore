import { useCallback, useEffect, useState } from "react";
import Swal from "sweetalert2";
import { usePermiso } from "../../hooks/usePermiso";
import { useAuth } from "../../contexts/useAuth";
import {
  LoadingState,
  ErrorState,
  PermissionDenied,
} from "../../components/common/ui";
import { formatMiles } from "../../utils/utils";
import {
  getDeliveryTarifas,
  createDeliveryTarifa,
  updateDeliveryTarifa,
  deleteDeliveryTarifa,
  type DeliveryTarifa,
} from "../../services/deliveryTarifa.service";

interface FormState {
  nombre: string;
  monto: number;
  orden: number;
  activo: "S" | "N";
}

const emptyForm: FormState = { nombre: "", monto: 0, orden: 0, activo: "S" };

export default function DeliveryTarifasPage() {
  const [tarifas, setTarifas] = useState<DeliveryTarifa[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<DeliveryTarifa | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);

  const { user, empresaActiva } = useAuth();
  const puedeLeer = usePermiso("DELIVERYTARIFAS", "leer");
  const puedeCrear = usePermiso("DELIVERYTARIFAS", "crear");
  const puedeEditar = usePermiso("DELIVERYTARIFAS", "editar");
  const puedeEliminar = usePermiso("DELIVERYTARIFAS", "eliminar");

  // El delivery es solo de minorista. Si la empresa activa es distribuidora, las
  // tarifas no aplican (no se usarían en ninguna venta).
  const tipoEmpresa =
    user?.isAdmin === "S"
      ? empresaActiva?.EmpresaTipo ?? user?.EmpresaTipo
      : user?.EmpresaTipo;
  const esMinorista = tipoEmpresa !== "D";

  const fetchTarifas = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getDeliveryTarifas();
      setTarifas(data);
      setError(null);
    } catch (err) {
      const e = err as { message?: string };
      setError(e?.message || "Error al cargar las tarifas");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTarifas();
  }, [fetchTarifas]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEdit = (t: DeliveryTarifa) => {
    setEditing(t);
    setForm({
      nombre: t.nombre,
      monto: t.monto,
      orden: t.orden,
      activo: t.activo,
    });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    if (!form.nombre.trim()) {
      Swal.fire({ icon: "warning", title: "Falta el nombre de la tarifa" });
      return;
    }
    if (!form.monto || form.monto < 0) {
      Swal.fire({ icon: "warning", title: "Ingresá un monto válido" });
      return;
    }
    try {
      setSaving(true);
      const payload = {
        nombre: form.nombre.trim(),
        monto: form.monto,
        orden: form.orden,
        activo: form.activo,
      };
      if (editing) {
        await updateDeliveryTarifa(editing.id, payload);
      } else {
        await createDeliveryTarifa(payload);
      }
      setModalOpen(false);
      Swal.fire({
        position: "top-end",
        icon: "success",
        title: editing ? "Tarifa actualizada" : "Tarifa creada",
        showConfirmButton: false,
        timer: 1500,
      });
      fetchTarifas();
    } catch (err) {
      const e = err as { message?: string };
      Swal.fire({ icon: "error", title: "Error", text: e?.message });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (t: DeliveryTarifa) => {
    Swal.fire({
      title: "¿Eliminar tarifa?",
      text: `Se eliminará "${t.nombre}".`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#d33",
      confirmButtonText: "Sí, eliminar",
      cancelButtonText: "Cancelar",
    }).then(async (r) => {
      if (!r.isConfirmed) return;
      try {
        await deleteDeliveryTarifa(t.id);
        Swal.fire({
          position: "top-end",
          icon: "success",
          title: "Tarifa eliminada",
          showConfirmButton: false,
          timer: 1500,
        });
        fetchTarifas();
      } catch (err) {
        const e = err as { message?: string };
        Swal.fire({ icon: "error", title: "Error", text: e?.message });
      }
    });
  };

  if (!puedeLeer) return <PermissionDenied resource="las tarifas de delivery" />;
  if (!esMinorista)
    return (
      <div className="container mx-auto px-4">
        <h1 className="text-2xl font-medium mb-3">Tarifas de Delivery</h1>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Las tarifas de delivery solo aplican a empresas minoristas. Cambiá a una
          empresa minorista para administrarlas.
        </div>
      </div>
    );
  if (loading) return <LoadingState message="Cargando tarifas de delivery..." />;
  if (error)
    return (
      <ErrorState
        message={error}
        onRetry={() => {
          setError(null);
          fetchTarifas();
        }}
      />
    );

  return (
    <div className="container mx-auto px-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-medium">Tarifas de Delivery</h1>
        {puedeCrear && (
          <button
            onClick={openCreate}
            className="bg-brand-700 hover:bg-brand-800 text-white font-semibold rounded-lg px-4 py-2 text-sm transition cursor-pointer"
          >
            + Nueva tarifa
          </button>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-surface-muted text-left text-slate-600">
            <tr>
              <th className="px-4 py-2 font-semibold">Nombre</th>
              <th className="px-4 py-2 font-semibold text-right">Monto (Gs.)</th>
              <th className="px-4 py-2 font-semibold text-center">Orden</th>
              <th className="px-4 py-2 font-semibold text-center">Estado</th>
              <th className="px-4 py-2 font-semibold text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {tarifas.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                  No hay tarifas configuradas.
                </td>
              </tr>
            )}
            {tarifas.map((t) => (
              <tr key={t.id} className="border-t border-border">
                <td className="px-4 py-2">{t.nombre}</td>
                <td className="px-4 py-2 text-right font-num">
                  {formatMiles(t.monto)}
                </td>
                <td className="px-4 py-2 text-center">{t.orden}</td>
                <td className="px-4 py-2 text-center">
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${
                      t.activo === "S"
                        ? "bg-success-100 text-success-700"
                        : "bg-slate-200 text-slate-600"
                    }`}
                  >
                    {t.activo === "S" ? "Activa" : "Inactiva"}
                  </span>
                </td>
                <td className="px-4 py-2 text-right space-x-2">
                  {puedeEditar && (
                    <button
                      onClick={() => openEdit(t)}
                      className="text-brand-700 hover:underline cursor-pointer"
                    >
                      Editar
                    </button>
                  )}
                  {puedeEliminar && (
                    <button
                      onClick={() => handleDelete(t)}
                      className="text-danger-600 hover:underline cursor-pointer"
                    >
                      Eliminar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-lg font-semibold">
              {editing ? "Editar tarifa" : "Nueva tarifa"}
            </h2>

            <label className="block text-xs font-semibold text-slate-600 mb-1">
              Nombre
            </label>
            <input
              type="text"
              value={form.nombre}
              onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
              placeholder="Ej. Estándar, Zona lejana…"
              className="w-full rounded-lg border border-border px-3 py-2 text-sm mb-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
            />

            <label className="block text-xs font-semibold text-slate-600 mb-1">
              Monto (Gs.)
            </label>
            <input
              type="text"
              inputMode="numeric"
              value={form.monto ? formatMiles(form.monto) : ""}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  monto: Number(e.target.value.replace(/\D/g, "")),
                }))
              }
              placeholder="10.000"
              className="w-full rounded-lg border border-border px-3 py-2 text-sm mb-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
            />

            <label className="block text-xs font-semibold text-slate-600 mb-1">
              Orden (menor = se preselecciona primero)
            </label>
            <input
              type="text"
              inputMode="numeric"
              value={form.orden}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  orden: Number(e.target.value.replace(/\D/g, "")),
                }))
              }
              className="w-full rounded-lg border border-border px-3 py-2 text-sm mb-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
            />

            <label className="flex items-center gap-2 mb-5 text-sm">
              <input
                type="checkbox"
                checked={form.activo === "S"}
                onChange={(e) =>
                  setForm((f) => ({ ...f, activo: e.target.checked ? "S" : "N" }))
                }
                className="w-4 h-4 cursor-pointer"
              />
              Activa (visible en la pantalla de venta)
            </label>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setModalOpen(false)}
                disabled={saving}
                className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-surface-muted cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleSubmit}
                disabled={saving}
                className="rounded-lg bg-brand-700 hover:bg-brand-800 px-4 py-2 text-sm font-semibold text-white cursor-pointer disabled:opacity-60"
              >
                {saving ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
