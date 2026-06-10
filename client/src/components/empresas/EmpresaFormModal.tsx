import { useEffect, useState } from "react";
import { Modal, Button, TextInput } from "../common/ui";
import type { Empresa } from "../../services/empresas.service";

interface EmpresaFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentEmpresa?: Empresa | null;
  onSubmit: (data: Empresa) => void;
}

const emptyForm = (): Empresa => ({
  EmpresaId: 0,
  EmpresaNombre: "",
  EmpresaRUC: "",
  EmpresaTipo: "M",
  EmpresaEstado: "A",
});

export default function EmpresaFormModal({
  isOpen,
  onClose,
  currentEmpresa,
  onSubmit,
}: EmpresaFormModalProps) {
  const [formData, setFormData] = useState<Empresa>(emptyForm());

  useEffect(() => {
    setFormData(currentEmpresa ? { ...currentEmpresa } : emptyForm());
  }, [currentEmpresa, isOpen]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      size="lg"
      title={currentEmpresa ? `Editar empresa: ${currentEmpresa.EmpresaNombre}` : "Nueva empresa"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" form="empresa-form">
            {currentEmpresa ? "Actualizar" : "Crear"}
          </Button>
        </>
      }
    >
      <form id="empresa-form" onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <TextInput
          label="Nombre"
          name="EmpresaNombre"
          value={formData.EmpresaNombre}
          onChange={handleChange}
          required
        />
        <TextInput
          label="RUC"
          name="EmpresaRUC"
          value={formData.EmpresaRUC ?? ""}
          onChange={handleChange}
        />
        <div>
          <label htmlFor="EmpresaTipo" className="block text-xs font-medium text-text-muted mb-1">
            Tipo
          </label>
          <select
            name="EmpresaTipo"
            id="EmpresaTipo"
            value={formData.EmpresaTipo}
            onChange={handleChange}
            className="w-full bg-surface border border-border rounded-md text-sm text-text px-3 py-2 transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-brand-600/30 focus:border-brand-600 hover:border-border-strong"
          >
            <option value="M">Minorista</option>
            <option value="D">Distribuidora</option>
          </select>
        </div>
        <div>
          <label htmlFor="EmpresaEstado" className="block text-xs font-medium text-text-muted mb-1">
            Estado
          </label>
          <select
            name="EmpresaEstado"
            id="EmpresaEstado"
            value={formData.EmpresaEstado ?? "A"}
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
