import { useEffect, useState, useCallback } from "react";
import { Modal, Button, TextInput } from "../common/ui";
import { formatMiles } from "../../utils/utils";
import DocumentosSection from "./DocumentosSection";
import {
  getChoferes,
  getChoferesDeVehiculo,
  getDocsVehiculo,
  createDocVehiculo,
  deleteDocVehiculo,
  type VehiculoFlotaFull,
  type VehiculoInput,
  type Chofer,
  type DocumentoFlota,
} from "../../services/flota.service";

// Tipos de documento válidos para un vehículo (ver CHECK en flota_documento).
const TIPOS_DOC_VEHICULO = ["SEGURO", "RUA", "PATENTE", "HABILITACION", "OTRO"];

interface VehiculoFormModalProps {
  open: boolean;
  onClose: () => void;
  // null = alta; objeto = edición.
  vehiculo: VehiculoFlotaFull | null;
  // Persiste vehículo + asignación de choferes. Devuelve el id del vehículo
  // (necesario para asociar choferes en el alta).
  onSubmit: (data: VehiculoInput, choferIds: string[]) => Promise<void>;
}

const emptyForm = (): VehiculoInput => ({
  chapa: "",
  marca: "",
  modelo: "",
  km_actual: 0,
  activo: true,
});

export default function VehiculoFormModal({
  open,
  onClose,
  vehiculo,
  onSubmit,
}: VehiculoFormModalProps) {
  const [form, setForm] = useState<VehiculoInput>(emptyForm());
  const [choferes, setChoferes] = useState<Chofer[]>([]);
  const [seleccionados, setSeleccionados] = useState<string[]>([]);
  const [docs, setDocs] = useState<DocumentoFlota[]>([]);
  const [saving, setSaving] = useState(false);

  const esEdicion = vehiculo != null;

  // Reset / carga al abrir.
  useEffect(() => {
    if (!open) return;
    setForm(
      vehiculo
        ? {
            chapa: vehiculo.chapa,
            marca: vehiculo.marca ?? "",
            modelo: vehiculo.modelo ?? "",
            km_actual: vehiculo.km_actual ?? 0,
            activo: vehiculo.activo,
          }
        : emptyForm(),
    );
    // Lista de choferes disponibles (siempre).
    getChoferes()
      .then(setChoferes)
      .catch(() => setChoferes([]));
    // En edición: choferes ya asignados + documentos.
    if (vehiculo) {
      getChoferesDeVehiculo(vehiculo.id)
        .then(setSeleccionados)
        .catch(() => setSeleccionados([]));
      getDocsVehiculo(vehiculo.id)
        .then(setDocs)
        .catch(() => setDocs([]));
    } else {
      setSeleccionados([]);
      setDocs([]);
    }
  }, [open, vehiculo]);

  const toggleChofer = (usuarioId: string) => {
    setSeleccionados((prev) =>
      prev.includes(usuarioId)
        ? prev.filter((id) => id !== usuarioId)
        : [...prev, usuarioId],
    );
  };

  const recargarDocs = useCallback(() => {
    if (vehiculo) getDocsVehiculo(vehiculo.id).then(setDocs).catch(() => {});
  }, [vehiculo]);

  const handleAddDoc = async (tipo: string, vencimiento: string | null) => {
    if (!vehiculo) return;
    await createDocVehiculo(vehiculo.id, { tipo, vencimiento });
    recargarDocs();
  };

  const handleDeleteDoc = async (docId: number) => {
    await deleteDocVehiculo(docId);
    recargarDocs();
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSubmit(form, seleccionados);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="2xl"
      title={esEdicion ? `Editar vehículo: ${vehiculo.chapa}` : "Nuevo vehículo"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" form="vehiculo-form" loading={saving}>
            {esEdicion ? "Guardar cambios" : "Crear vehículo"}
          </Button>
        </>
      }
    >
      <form
        id="vehiculo-form"
        onSubmit={handleSubmit}
        className="space-y-5"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <TextInput
            label="Chapa"
            value={form.chapa}
            onChange={(e) =>
              setForm((f) => ({ ...f, chapa: e.target.value.toUpperCase() }))
            }
            required
          />
          <TextInput
            label="Marca"
            value={form.marca ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, marca: e.target.value }))}
          />
          <TextInput
            label="Modelo"
            value={form.modelo ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, modelo: e.target.value }))}
          />
          <TextInput
            label="Km actual"
            numeric
            inputMode="numeric"
            // Mostrar con separador de miles (15.000). Se parsea a número al
            // tipear quitando todo lo que no sea dígito.
            value={form.km_actual ? formatMiles(form.km_actual) : "0"}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                km_actual: Number(e.target.value.replace(/\D/g, "")) || 0,
              }))
            }
          />
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1">
              Estado
            </label>
            <select
              value={form.activo ? "A" : "I"}
              onChange={(e) =>
                setForm((f) => ({ ...f, activo: e.target.value === "A" }))
              }
              className="w-full bg-surface border border-border rounded-md text-sm text-text px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-600/30 focus:border-brand-600"
            >
              <option value="A">Activo</option>
              <option value="I">Inactivo</option>
            </select>
          </div>
        </div>

        {/* Choferes asignados */}
        <div>
          <h3 className="text-sm font-semibold text-text mb-2">
            Choferes asignados
          </h3>
          {choferes.length === 0 ? (
            <p className="text-sm text-text-muted">
              No hay choferes cargados todavía. Creá choferes en la pantalla
              "Choferes".
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 max-h-40 overflow-y-auto rounded-md border border-border p-2">
              {choferes.map((c) => (
                <label
                  key={c.usuario_id}
                  className="flex items-center gap-2 text-sm py-1 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={seleccionados.includes(c.usuario_id)}
                    onChange={() => toggleChofer(c.usuario_id)}
                    className="w-4 h-4 rounded border-border cursor-pointer"
                  />
                  <span className="text-text">
                    {c.nombre} {c.apellido || ""}
                    <span className="text-text-subtle"> ({c.usuario_id})</span>
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Documentos del vehículo */}
        <div>
          <h3 className="text-sm font-semibold text-text mb-2">
            Documentos (seguro, RUA, patente…)
          </h3>
          <DocumentosSection
            docs={docs}
            tipos={TIPOS_DOC_VEHICULO}
            onAdd={handleAddDoc}
            onDelete={handleDeleteDoc}
            disabled={!esEdicion}
            disabledHint="Creá el vehículo y luego editalo para cargar documentos."
          />
        </div>
      </form>
    </Modal>
  );
}
