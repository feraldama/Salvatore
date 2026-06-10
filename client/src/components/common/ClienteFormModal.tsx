import { useEffect, useState } from "react";
import { useAuth } from "../../contexts/useAuth";
import { Modal, Button, TextInput } from "./ui";
import { calcularDV } from "../../utils/utils";
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

  const { empresaActiva } = useAuth();

  useEffect(() => {
    // Carga vendedores de la empresa activa (el header X-Empresa-Id lo envía el interceptor)
    getVendedores(empresaActiva?.EmpresaId).then((res) => setVendedores(res.data || [])).catch(() => {});
  }, [empresaActiva?.EmpresaId]);

  useEffect(() => {
    if (currentCliente) {
      setFormData({ ...currentCliente });
    } else {
      const userId = currentUserId || (user?.id ? String(user.id).trim() : "");
      setFormData(emptyForm(userId));
    }
  }, [currentCliente, currentUserId, user]);

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]:
        name === "ClienteNombre" || name === "ClienteApellido"
          ? value.toUpperCase()
          : value,
    }));
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    onSubmit(formData);
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
            <div className="w-14 text-center bg-surface-sunken border border-border rounded-md px-2 py-2 text-sm font-semibold text-text">
              {calcularDV(formData.ClienteRUC) || <span className="text-text-muted font-normal">DV</span>}
            </div>
          </div>
          {formData.ClienteRUC && calcularDV(formData.ClienteRUC) && (
            <p className="mt-1 text-xs text-text-muted">
              RUC completo: {formData.ClienteRUC}-{calcularDV(formData.ClienteRUC)}
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
