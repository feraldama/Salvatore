import { useState } from "react";
import { TrashIcon, PlusIcon } from "@heroicons/react/24/outline";
import { Button } from "../common/ui";
import { formatFecha } from "../../utils/utils";
import type { DocumentoFlota } from "../../services/flota.service";

interface DocumentosSectionProps {
  docs: DocumentoFlota[];
  tipos: string[];
  onAdd: (tipo: string, vencimiento: string | null) => void;
  onDelete: (docId: number) => void;
  // Cuando aún no existe la entidad (alta): no se pueden cargar documentos.
  disabled?: boolean;
  disabledHint?: string;
}

// ¿El documento está vencido? (vencimiento < hoy)
const estaVencido = (venc: string | null): boolean => {
  if (!venc) return false;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  return new Date(`${venc}T00:00:00`) < hoy;
};

export default function DocumentosSection({
  docs,
  tipos,
  onAdd,
  onDelete,
  disabled,
  disabledHint,
}: DocumentosSectionProps) {
  const [tipo, setTipo] = useState(tipos[0] ?? "");
  const [venc, setVenc] = useState("");

  const handleAdd = () => {
    if (!tipo) return;
    onAdd(tipo, venc || null);
    setVenc("");
  };

  if (disabled) {
    return (
      <p className="text-sm text-text-muted italic">
        {disabledHint || "Guardá primero para poder cargar documentos."}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {docs.length === 0 ? (
        <p className="text-sm text-text-muted">Sin documentos cargados.</p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {docs.map((d) => (
            <li
              key={d.id}
              className="flex items-center justify-between px-3 py-2 text-sm"
            >
              <div className="flex items-center gap-3">
                <span className="font-medium text-text">{d.tipo}</span>
                {d.vencimiento ? (
                  <span
                    className={
                      estaVencido(d.vencimiento)
                        ? "text-danger-700 font-semibold"
                        : "text-text-muted"
                    }
                  >
                    vence {formatFecha(d.vencimiento)}
                    {estaVencido(d.vencimiento) ? " (VENCIDO)" : ""}
                  </span>
                ) : (
                  <span className="text-text-subtle">sin vencimiento</span>
                )}
              </div>
              <button
                type="button"
                onClick={() => onDelete(d.id)}
                className="text-danger-600 hover:text-danger-800 transition cursor-pointer"
                title="Eliminar documento"
              >
                <TrashIcon className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <label className="block text-xs font-medium text-text-muted mb-1">
            Tipo
          </label>
          <select
            value={tipo}
            onChange={(e) => setTipo(e.target.value)}
            className="w-full bg-surface border border-border rounded-md text-sm text-text px-2 py-2 focus:outline-none focus:ring-2 focus:ring-brand-600/30 focus:border-brand-600"
          >
            {tipos.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1">
          <label className="block text-xs font-medium text-text-muted mb-1">
            Vencimiento
          </label>
          <input
            type="date"
            value={venc}
            onChange={(e) => setVenc(e.target.value)}
            className="w-full bg-surface border border-border rounded-md text-sm text-text px-2 py-2 focus:outline-none focus:ring-2 focus:ring-brand-600/30 focus:border-brand-600"
          />
        </div>
        <Button type="button" variant="secondary" leftIcon={PlusIcon} onClick={handleAdd}>
          Agregar
        </Button>
      </div>
    </div>
  );
}
