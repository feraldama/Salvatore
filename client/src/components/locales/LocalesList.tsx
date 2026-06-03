import { useEffect, useState } from "react";
import SearchButton from "../common/Input/SearchButton";
import DataTable from "../common/Table/DataTable";
import { Modal, Button, TextInput } from "../common/ui";
import { PlusIcon } from "@heroicons/react/24/outline";
import { formatMiles } from "../../utils/utils";
import { getEmpresasAccesibles, type Empresa } from "../../services/empresas.service";

import type { Local } from "../../types";

interface Pagination {
  totalItems: number;
}

interface LocalesListProps {
  locales: Local[];
  onDelete?: (item: Local) => void;
  onEdit?: (item: Local) => void;
  onCreate?: () => void;
  pagination?: Pagination;
  onSearch: (value: string) => void;
  searchTerm: string;
  onKeyPress?: React.KeyboardEventHandler<HTMLInputElement>;
  onSearchSubmit: () => void;
  isModalOpen: boolean;
  onCloseModal: () => void;
  currentLocal?: Local | null;
  onSubmit: (formData: Local) => void;
  sortKey?: string;
  sortOrder?: "asc" | "desc";
  onSort?: (key: string, order: "asc" | "desc") => void;
}

export default function LocalesList({
  locales,
  onDelete,
  onEdit,
  onCreate,
  pagination,
  onSearch,
  searchTerm,
  onKeyPress,
  onSearchSubmit,
  isModalOpen,
  onCloseModal,
  currentLocal,
  onSubmit,
  sortKey,
  sortOrder,
  onSort,
}: LocalesListProps) {
  const [formData, setFormData] = useState<Local>({
    id: "",
    LocalId: "",
    LocalNombre: "",
    LocalTelefono: "",
    LocalCelular: "",
    LocalDireccion: "",
    EmpresaId: 1,
  });
  const [empresas, setEmpresas] = useState<Empresa[]>([]);

  useEffect(() => {
    getEmpresasAccesibles().then(setEmpresas).catch(() => {});
  }, []);

  useEffect(() => {
    if (currentLocal) {
      setFormData({
        id: String(currentLocal.id ?? currentLocal.LocalId),
        LocalId: String(currentLocal.LocalId),
        LocalNombre: currentLocal.LocalNombre,
        LocalTelefono: currentLocal.LocalTelefono || "",
        LocalCelular: currentLocal.LocalCelular || "",
        LocalDireccion: currentLocal.LocalDireccion || "",
        EmpresaId: (currentLocal.EmpresaId as number) || 1,
      });
    } else {
      setFormData({
        id: "",
        LocalId: "",
        LocalNombre: "",
        LocalTelefono: "",
        LocalCelular: "",
        LocalDireccion: "",
        EmpresaId: 1,
      });
    }
  }, [currentLocal]);

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    onSubmit(formData);
  };

  const columns = [
    { key: "LocalId", label: "ID" },
    { key: "LocalNombre", label: "Nombre" },
    { key: "EmpresaNombre", label: "Empresa" },
    { key: "LocalTelefono", label: "Teléfono" },
    { key: "LocalCelular", label: "Celular" },
    { key: "LocalDireccion", label: "Dirección" },
  ];

  return (
    <>
      <div className="flex flex-col sm:flex-row gap-4 mb-4">
        <div className="flex-1">
          <SearchButton
            searchTerm={searchTerm}
            onSearch={onSearch}
            onKeyPress={onKeyPress}
            onSearchSubmit={onSearchSubmit}
            placeholder="Buscar locales"
          />
        </div>
        <div className="py-4">
          <Button leftIcon={PlusIcon} onClick={onCreate}>
            Nuevo Local
          </Button>
        </div>
      </div>
      <div className="flex justify-between items-center mb-4">
        <div className="text-sm text-text-muted">
          Mostrando {formatMiles(locales.length)} de{" "}
          {formatMiles(pagination?.totalItems || 0)} locales
        </div>
      </div>
      <DataTable<Local>
        columns={columns}
        data={locales}
        onEdit={onEdit}
        onDelete={onDelete}
        emptyMessage="No se encontraron locales"
        sortKey={sortKey}
        sortOrder={sortOrder}
        onSort={onSort}
      />
      <Modal
        open={isModalOpen}
        onClose={onCloseModal}
        size="2xl"
        title={
          currentLocal
            ? `Editar local: ${currentLocal.LocalId}`
            : "Crear nuevo local"
        }
        footer={
          <>
            <Button variant="secondary" onClick={onCloseModal}>
              Cancelar
            </Button>
            <Button type="submit" form="local-form">
              {currentLocal ? "Actualizar" : "Crear"}
            </Button>
          </>
        }
      >
        <form
          id="local-form"
          onSubmit={handleSubmit}
          className="grid grid-cols-1 sm:grid-cols-2 gap-4"
        >
          <TextInput
            label="Nombre *"
            name="LocalNombre"
            value={formData.LocalNombre}
            onChange={(e) =>
              handleInputChange({
                target: {
                  name: "LocalNombre",
                  value: e.target.value.toUpperCase(),
                },
              } as React.ChangeEvent<HTMLInputElement>)
            }
            className="uppercase"
            required
          />
          <TextInput
            label="Teléfono"
            name="LocalTelefono"
            value={formData.LocalTelefono}
            onChange={handleInputChange}
          />
          <TextInput
            label="Celular"
            name="LocalCelular"
            value={formData.LocalCelular}
            onChange={handleInputChange}
          />
          <div>
            <label
              htmlFor="EmpresaId"
              className="block text-xs font-medium text-text-muted mb-1"
            >
              Empresa *
            </label>
            <select
              name="EmpresaId"
              id="EmpresaId"
              value={String(formData.EmpresaId ?? "")}
              onChange={handleInputChange}
              required
              className="w-full bg-surface border border-border rounded-md text-sm text-text px-3 py-2 transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-brand-600/30 focus:border-brand-600 hover:border-border-strong"
            >
              {empresas.map((e) => (
                <option key={e.EmpresaId} value={e.EmpresaId}>
                  {e.EmpresaNombre}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-text-muted">
              Los usuarios de este local pertenecen a esta empresa.
            </p>
          </div>
          <div className="sm:col-span-2">
            <TextInput
              label="Dirección"
              name="LocalDireccion"
              value={formData.LocalDireccion}
              onChange={handleInputChange}
            />
          </div>
        </form>
      </Modal>
    </>
  );
}
