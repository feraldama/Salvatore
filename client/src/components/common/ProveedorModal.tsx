import React, { useState, useRef, useEffect } from "react";
import { PlusIcon, MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import type { Proveedor } from "../../types";
import { Modal, Button, TextInput } from "./ui";

interface CreateProveedorData {
  ProveedorRUC: string;
  ProveedorNombre: string;
  ProveedorDireccion?: string;
  ProveedorTelefono?: string;
}

interface ProveedorModalProps {
  show: boolean;
  onClose: () => void;
  proveedores: Proveedor[];
  onSelect: (proveedor: Proveedor) => void;
  onCreateProveedor: (proveedorData: CreateProveedorData) => Promise<void>;
}

const emptyForm: CreateProveedorData = {
  ProveedorRUC: "",
  ProveedorNombre: "",
  ProveedorDireccion: "",
  ProveedorTelefono: "",
};

const ProveedorModal: React.FC<ProveedorModalProps> = ({
  show,
  onClose,
  proveedores,
  onSelect,
  onCreateProveedor,
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [newProveedor, setNewProveedor] = useState<CreateProveedorData>(emptyForm);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const filteredProveedores = proveedores.filter(
    (p) =>
      p.ProveedorNombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.ProveedorRUC.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleCreateProveedor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProveedor.ProveedorNombre.trim()) return;
    setSubmitting(true);
    try {
      await onCreateProveedor(newProveedor);
      setNewProveedor(emptyForm);
      setShowCreateForm(false);
    } catch (error) {
      console.error("Error al crear proveedor:", error);
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    if (!show) {
      setShowCreateForm(false);
      setSearchTerm("");
    }
  }, [show]);

  return (
    <Modal
      open={show}
      onClose={onClose}
      size="4xl"
      title={showCreateForm ? "Nuevo proveedor" : "Seleccionar proveedor"}
      initialFocusRef={!showCreateForm ? searchInputRef : undefined}
      footer={
        !showCreateForm ? (
          <Button
            variant="primary"
            leftIcon={PlusIcon}
            onClick={() => setShowCreateForm(true)}
          >
            Crear nuevo proveedor
          </Button>
        ) : (
          <>
            <Button
              variant="secondary"
              onClick={() => setShowCreateForm(false)}
              disabled={submitting}
            >
              Cancelar
            </Button>
            <Button
              variant="success"
              onClick={handleCreateProveedor}
              loading={submitting}
              disabled={!newProveedor.ProveedorNombre.trim()}
            >
              Crear
            </Button>
          </>
        )
      }
    >
      {!showCreateForm ? (
        <>
          <TextInput
            ref={searchInputRef}
            leftIcon={MagnifyingGlassIcon}
            placeholder="Buscar proveedor por nombre o RUC..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            aria-label="Buscar proveedor"
          />
          <div className="mt-4 space-y-2">
            {filteredProveedores.length === 0 ? (
              <p className="py-8 text-center text-sm text-text-muted">
                No se encontraron proveedores
              </p>
            ) : (
              filteredProveedores.map((proveedor) => (
                <button
                  key={proveedor.ProveedorId}
                  type="button"
                  onClick={() => onSelect(proveedor)}
                  className="w-full text-left p-3 border border-border rounded-lg hover:bg-surface-muted hover:border-border-strong transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
                >
                  <div className="font-medium text-text">
                    {proveedor.ProveedorNombre}
                  </div>
                  <div className="text-sm text-text-muted">
                    RUC: {proveedor.ProveedorRUC || "Sin RUC"}
                  </div>
                  {proveedor.ProveedorTelefono && (
                    <div className="text-sm text-text-muted">
                      Tel: {proveedor.ProveedorTelefono}
                    </div>
                  )}
                </button>
              ))
            )}
          </div>
        </>
      ) : (
        <form
          id="proveedor-form"
          onSubmit={handleCreateProveedor}
          className="space-y-4"
        >
          <TextInput
            label="Nombre"
            value={newProveedor.ProveedorNombre}
            onChange={(e) =>
              setNewProveedor({
                ...newProveedor,
                ProveedorNombre: e.target.value,
              })
            }
            required
          />
          <TextInput
            label="RUC"
            value={newProveedor.ProveedorRUC}
            onChange={(e) =>
              setNewProveedor({ ...newProveedor, ProveedorRUC: e.target.value })
            }
          />
          <TextInput
            label="Dirección"
            value={newProveedor.ProveedorDireccion}
            onChange={(e) =>
              setNewProveedor({
                ...newProveedor,
                ProveedorDireccion: e.target.value,
              })
            }
          />
          <TextInput
            label="Teléfono"
            value={newProveedor.ProveedorTelefono}
            onChange={(e) =>
              setNewProveedor({
                ...newProveedor,
                ProveedorTelefono: e.target.value,
              })
            }
          />
        </form>
      )}
    </Modal>
  );
};

export default ProveedorModal;
