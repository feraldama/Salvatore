import { useEffect, useState } from "react";
import { useAuth } from "../../contexts/useAuth";
import { Modal, Button, TextInput } from "./ui";
import { calcularDV, separarRUC } from "../../utils/utils";
import { getVendedores, type Vendedor } from "../../services/vendedores.service";

export interface Cliente {
  id?: string | number;
  ClienteId?: string | number;
  ClienteRUC: string;
  ClienteNombre: string;
  ClienteApellido: string;
  ClienteDireccion: string;
  ClienteTelefono: string;
  ClienteTipo: string;
  UsuarioId: string;
  VendedorId?: number | null;
  [key: string]: unknown;
}

interface ClienteFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentCliente?: Cliente | null;
  onSubmit: (formData: Cliente) => void;
  currentUserId?: string;
}

const emptyForm = (userId: string): Cliente => ({
  ClienteRUC: "",
  ClienteNombre: "",
  ClienteApellido: "",
  ClienteDireccion: "",
  ClienteTelefono: "",
  ClienteTipo: "MI",
  UsuarioId: userId,
});

export default function ClienteFormModal({
  isOpen,
  onClose,
  currentCliente,
  onSubmit,
  currentUserId,
}: ClienteFormModalProps) {
  const { user } = useAuth();
  const [formData, setFormData] = useState<Cliente>(emptyForm(""));
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  // El DV se guarda dentro de ClienteRUC ("1234567-8"). En el form se maneja
  // aparte: se sugiere el calculado, pero el usuario puede pisarlo a mano.
  const [dv, setDv] = useState("");
  const [dvManual, setDvManual] = useState(false);

  const { empresaActiva } = useAuth();

  useEffect(() => {
    // Carga vendedores de la empresa activa (el header X-Empresa-Id lo envía el interceptor)
    getVendedores(empresaActiva?.EmpresaId).then((res) => setVendedores(res.data || [])).catch(() => {});
  }, [empresaActiva?.EmpresaId]);

  useEffect(() => {
    if (currentCliente) {
      const { base, dv: dvGuardado } = separarRUC(currentCliente.ClienteRUC);
      setFormData({ ...currentCliente, ClienteRUC: base });
      setDv(dvGuardado || calcularDV(base));
      // Sólo se considera manual si el DV guardado difiere del calculado; si
      // coincide se sigue recalculando al cambiar la base.
      setDvManual(!!dvGuardado && dvGuardado !== calcularDV(base));
    } else {
      const userId = currentUserId || (user?.id ? String(user.id).trim() : "");
      setFormData(emptyForm(userId));
      setDv("");
      setDvManual(false);
    }
  }, [currentCliente, currentUserId, user]);

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    // Mientras el DV no se haya tocado a mano, sigue al RUC.
    if (name === "ClienteRUC" && !dvManual) setDv(calcularDV(value));
    setFormData((prev) => ({
      ...prev,
      [name]:
        name === "ClienteNombre" || name === "ClienteApellido"
          ? value.toUpperCase()
          : value,
    }));
  };

  const handleDvChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, "").slice(0, 1);
    if (!value) {
      // Vaciarlo devuelve el campo al DV sugerido.
      setDvManual(false);
      setDv(calcularDV(formData.ClienteRUC));
      return;
    }
    setDvManual(true);
    setDv(value);
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const base = formData.ClienteRUC.trim();
    onSubmit({ ...formData, ClienteRUC: base && dv ? `${base}-${dv}` : base });
  };

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      size="2xl"
      title={
        currentCliente
          ? `Editar cliente: ${currentCliente.ClienteId || ""}`
          : "Crear nuevo cliente"
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="cliente-form">
            {currentCliente ? "Actualizar" : "Crear"}
          </Button>
        </>
      }
    >
      <form
        id="cliente-form"
        onSubmit={handleSubmit}
        className="grid grid-cols-1 sm:grid-cols-2 gap-4"
      >
        <div>
          <label className="block text-xs font-medium text-text-muted mb-1">
            Cédula / RUC
          </label>
          <div className="flex gap-2 items-center">
            <input
              name="ClienteRUC"
              value={formData.ClienteRUC}
              onChange={handleInputChange}
              placeholder="Ej: 1234567"
              className="flex-1 bg-surface border border-border rounded-md text-sm text-text px-3 py-2 transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-brand-600/30 focus:border-brand-600 hover:border-border-strong"
            />
            <span className="text-text-muted text-sm select-none">-</span>
            <input
              name="ClienteDV"
              value={dv}
              onChange={handleDvChange}
              inputMode="numeric"
              maxLength={1}
              placeholder="DV"
              title="Dígito verificador. Se sugiere el calculado, pero se puede editar."
              className="w-14 text-center bg-surface border border-border rounded-md px-2 py-2 text-sm font-semibold text-text transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-brand-600/30 focus:border-brand-600 hover:border-border-strong"
            />
          </div>
          {formData.ClienteRUC && dv && (
            <p className="mt-1 text-xs text-text-muted">
              RUC completo: {formData.ClienteRUC}-{dv}
            </p>
          )}
          {formData.ClienteRUC && dv && dv !== calcularDV(formData.ClienteRUC) && (
            <p className="mt-1 text-xs text-amber-700">
              DV editado a mano (el calculado es{" "}
              {calcularDV(formData.ClienteRUC) || "—"}).
            </p>
          )}
        </div>
        <TextInput
          label="Nombre"
          name="ClienteNombre"
          value={formData.ClienteNombre}
          onChange={handleInputChange}
          className="uppercase"
          required
        />
        <TextInput
          label="Apellido"
          name="ClienteApellido"
          value={formData.ClienteApellido}
          onChange={handleInputChange}
          className="uppercase"
        />
        <TextInput
          label="Dirección"
          name="ClienteDireccion"
          value={formData.ClienteDireccion}
          onChange={handleInputChange}
        />
        <TextInput
          label="Teléfono"
          name="ClienteTelefono"
          value={formData.ClienteTelefono}
          onChange={handleInputChange}
        />
        <div>
          <label
            htmlFor="ClienteTipo"
            className="block text-xs font-medium text-text-muted mb-1"
          >
            Tipo
          </label>
          <select
            name="ClienteTipo"
            id="ClienteTipo"
            value={formData.ClienteTipo}
            onChange={handleInputChange}
            required
            className="w-full bg-surface border border-border rounded-md text-sm text-text px-3 py-2 transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-brand-600/30 focus:border-brand-600 hover:border-border-strong"
          >
            <option value="MI">Minorista</option>
            <option value="MA">Mayorista</option>
          </select>
        </div>
        {formData.ClienteTipo === "MA" && (
          <div>
            <label
              htmlFor="VendedorId"
              className="block text-xs font-medium text-text-muted mb-1"
            >
              Vendedor asignado
            </label>
            <select
              name="VendedorId"
              id="VendedorId"
              value={formData.VendedorId ?? ""}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  VendedorId: e.target.value ? Number(e.target.value) : null,
                }))
              }
              className="w-full bg-surface border border-border rounded-md text-sm text-text px-3 py-2 transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-brand-600/30 focus:border-brand-600 hover:border-border-strong"
            >
              <option value="">— Sin vendedor —</option>
              {vendedores.map((v) => (
                <option key={v.VendedorId} value={v.VendedorId}>
                  {v.VendedorNombre} {v.VendedorApellido}
                </option>
              ))}
            </select>
          </div>
        )}
        <TextInput
          label="Usuario ID"
          name="UsuarioId"
          value={formData.UsuarioId}
          readOnly
          disabled
        />
      </form>
    </Modal>
  );
}
