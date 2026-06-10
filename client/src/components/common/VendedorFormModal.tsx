import { useEffect, useState } from "react";
import { Modal, Button, TextInput } from "./ui";
import type { Vendedor } from "../../services/vendedores.service";

interface VendedorFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentVendedor?: Vendedor | null;
  onSubmit: (formData: Vendedor) => void;
}

const emptyForm = (): Vendedor => ({
  VendedorNombre: "",
  VendedorApellido: "",
  VendedorTelefono: "",
  VendedorDireccion: "",
  VendedorEstado: "A",
  UsuarioId: null,
});

export default function VendedorFormModal({
  isOpen,
  onClose,
  currentVendedor,
  onSubmit,
}: VendedorFormModalProps) {
  const [formData, setFormData] = useState<Vendedor>(emptyForm());

  useEffect(() => {
    setFormData(currentVendedor ? { ...currentVendedor } : emptyForm());
  }, [currentVendedor, isOpen]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: name === "VendedorNombre" || name === "VendedorApellido"
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
        currentVendedor
          ? `Editar vendedor: ${currentVendedor.VendedorNombre} ${currentVendedor.VendedorApellido}`
          : "Nuevo vendedor"
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="vendedor-form">
            {currentVendedor ? "Actualizar" : "Crear"}
          </Button>
        </>
      }
    >
      <form
        id="vendedor-form"
        onSubmit={handleSubmit}
        className="grid grid-cols-1 sm:grid-cols-2 gap-4"
      >
        <TextInput
          label="Nombre"
          name="VendedorNombre"
          value={formData.VendedorNombre}
          onChange={handleChange}
          className="uppercase"
          required
        />
        <TextInput
          label="Apellido"
          name="VendedorApellido"
          value={formData.VendedorApellido}
          onChange={handleChange}
          className="uppercase"
        />
        <TextInput
          label="Teléfono"
          name="VendedorTelefono"
          value={formData.VendedorTelefono}
          onChange={handleChange}
        />
        <TextInput
          label="Dirección"
          name="VendedorDireccion"
          value={formData.VendedorDireccion}
          onChange={handleChange}
        />
        <TextInput
          label="Usuario del sistema (opcional)"
          name="UsuarioId"
          value={formData.UsuarioId ?? ""}
          onChange={handleChange}
          placeholder="Dejar vacío si no tiene login"
        />
        <div>
          <label
            htmlFor="VendedorEstado"
            className="block text-xs font-medium text-text-muted mb-1"
          >
            Estado
          </label>
          <select
            name="VendedorEstado"
            id="VendedorEstado"
            value={formData.VendedorEstado}
            onChange={handleChange}
            className="w-full bg-surface border border-border rounded-md text-sm text-text px-3 py-2 transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-brand-600/30 focus:border-brand-600 hover:border-border-strong"
          >
            <option value="A">Activo</option>
            <option value="I">Inactivo</option>
          </select>
        </div>
      </form>
    </Modal>
  );
}
