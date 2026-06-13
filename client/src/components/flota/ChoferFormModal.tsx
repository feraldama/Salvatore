import { useEffect, useState, useCallback } from "react";
import { Modal, Button, TextInput } from "../common/ui";
import DocumentosSection from "./DocumentosSection";
import { getLocalesAccesibles, type LocalSucursal } from "../../services/locales.service";
import {
  getDocsChofer,
  createDocChofer,
  deleteDocChofer,
  type Chofer,
  type ChoferInput,
  type DocumentoFlota,
} from "../../services/flota.service";

// Tipos de documento del chofer (ver CHECK en flota_documento_chofer).
const TIPOS_DOC_CHOFER = ["LICENCIA", "CURSO_DEFENSIVO", "HABILITACION", "OTRO"];

interface ChoferFormModalProps {
  open: boolean;
  onClose: () => void;
  chofer: Chofer | null; // null = alta
  onSubmit: (data: ChoferInput) => Promise<void>;
}

const emptyForm = (): ChoferInput => ({
  UsuarioId: "",
  UsuarioNombre: "",
  UsuarioApellido: "",
  UsuarioCorreo: "",
  UsuarioContrasena: "",
  UsuarioEstado: "A",
  LocalId: 0,
});

export default function ChoferFormModal({
  open,
  onClose,
  chofer,
  onSubmit,
}: ChoferFormModalProps) {
  const [form, setForm] = useState<ChoferInput>(emptyForm());
  const [locales, setLocales] = useState<LocalSucursal[]>([]);
  const [docs, setDocs] = useState<DocumentoFlota[]>([]);
  const [saving, setSaving] = useState(false);

  const esEdicion = chofer != null;

  useEffect(() => {
    if (!open) return;
    setForm(
      chofer
        ? {
            UsuarioId: chofer.usuario_id,
            UsuarioNombre: chofer.nombre,
            UsuarioApellido: chofer.apellido ?? "",
            UsuarioCorreo: chofer.correo ?? "",
            UsuarioContrasena: "",
            UsuarioEstado: chofer.estado || "A",
            LocalId: chofer.local_id ?? 0,
          }
        : emptyForm(),
    );
    getLocalesAccesibles()
      .then(setLocales)
      .catch(() => setLocales([]));
    if (chofer) {
      getDocsChofer(chofer.usuario_id)
        .then(setDocs)
        .catch(() => setDocs([]));
    } else {
      setDocs([]);
    }
  }, [open, chofer]);

  const recargarDocs = useCallback(() => {
    if (chofer) getDocsChofer(chofer.usuario_id).then(setDocs).catch(() => {});
  }, [chofer]);

  const handleAddDoc = async (tipo: string, vencimiento: string | null) => {
    if (!chofer) return;
    await createDocChofer(chofer.usuario_id, { tipo, vencimiento });
    recargarDocs();
  };

  const handleDeleteDoc = async (docId: number) => {
    await deleteDocChofer(docId);
    recargarDocs();
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSubmit(form);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="2xl"
      title={
        esEdicion ? `Editar chofer: ${chofer.nombre}` : "Nuevo chofer"
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" form="chofer-form" loading={saving}>
            {esEdicion ? "Guardar cambios" : "Crear chofer"}
          </Button>
        </>
      }
    >
      <form id="chofer-form" onSubmit={handleSubmit} className="space-y-5">
        <p className="text-sm text-text-muted">
          Un chofer es un usuario con perfil <strong>CHOFER</strong>: con su
          usuario y contraseña inicia sesión en la app mobile de flota.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <TextInput
            label="Usuario (ID de login)"
            value={form.UsuarioId}
            onChange={(e) =>
              setForm((f) => ({ ...f, UsuarioId: e.target.value.trim() }))
            }
            required
            disabled={esEdicion}
            helperText={esEdicion ? "No editable" : "Ej: jperez"}
          />
          <TextInput
            label={esEdicion ? "Nueva contraseña (opcional)" : "Contraseña"}
            type="password"
            value={form.UsuarioContrasena ?? ""}
            onChange={(e) =>
              setForm((f) => ({ ...f, UsuarioContrasena: e.target.value }))
            }
            required={!esEdicion}
            helperText={esEdicion ? "Dejá vacío para no cambiarla" : undefined}
          />
          <TextInput
            label="Nombre"
            value={form.UsuarioNombre}
            onChange={(e) =>
              setForm((f) => ({ ...f, UsuarioNombre: e.target.value }))
            }
            required
          />
          <TextInput
            label="Apellido"
            value={form.UsuarioApellido ?? ""}
            onChange={(e) =>
              setForm((f) => ({ ...f, UsuarioApellido: e.target.value }))
            }
          />
          <TextInput
            label="Correo"
            type="email"
            value={form.UsuarioCorreo ?? ""}
            onChange={(e) =>
              setForm((f) => ({ ...f, UsuarioCorreo: e.target.value }))
            }
          />
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1">
              Local <span className="text-danger-600">*</span>
            </label>
            <select
              value={form.LocalId || ""}
              onChange={(e) =>
                setForm((f) => ({ ...f, LocalId: Number(e.target.value) }))
              }
              required
              className="w-full bg-surface border border-border rounded-md text-sm text-text px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-600/30 focus:border-brand-600"
            >
              <option value="">— Seleccionar local —</option>
              {locales.map((l) => (
                <option key={l.LocalId} value={l.LocalId}>
                  {l.LocalNombre}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1">
              Estado
            </label>
            <select
              value={form.UsuarioEstado || "A"}
              onChange={(e) =>
                setForm((f) => ({ ...f, UsuarioEstado: e.target.value }))
              }
              className="w-full bg-surface border border-border rounded-md text-sm text-text px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-600/30 focus:border-brand-600"
            >
              <option value="A">Activo</option>
              <option value="I">Inactivo</option>
            </select>
          </div>
        </div>

        {/* Documentos del chofer */}
        <div>
          <h3 className="text-sm font-semibold text-text mb-2">
            Documentos (licencia, curso defensivo…)
          </h3>
          <DocumentosSection
            docs={docs}
            tipos={TIPOS_DOC_CHOFER}
            onAdd={handleAddDoc}
            onDelete={handleDeleteDoc}
            disabled={!esEdicion}
            disabledHint="Creá el chofer y luego editalo para cargar documentos."
          />
        </div>
      </form>
    </Modal>
  );
}
