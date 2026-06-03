import { useEffect, useState } from "react";
import SearchButton from "../common/Input/SearchButton";
import DataTable from "../common/Table/DataTable";
import { Modal, Button, TextInput } from "../common/ui";
import { PlusIcon } from "@heroicons/react/24/outline";
import { formatMiles } from "../../utils/utils";
import { getLocales } from "../../services/locales.service";

import type { Almacen, Local } from "../../types";

interface Pagination {
  totalItems: number;
}

interface AlmacenesListProps {
  almacenes: Almacen[];
  onDelete?: (item: Almacen) => void;
  onEdit?: (item: Almacen) => void;
  onCreate?: () => void;
  pagination?: Pagination;
  onSearch: (value: string) => void;
  searchTerm: string;
  onKeyPress?: React.KeyboardEventHandler<HTMLInputElement>;
  onSearchSubmit: () => void;
  isModalOpen: boolean;
  onCloseModal: () => void;
  currentAlmacen?: Almacen | null;
  onSubmit: (formData: Almacen) => void;
  sortKey?: string;
  sortOrder?: "asc" | "desc";
  onSort?: (key: string, order: "asc" | "desc") => void;
}

export default function AlmacenesList({
  almacenes,
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
  currentAlmacen,
  onSubmit,
  sortKey,
  sortOrder,
  onSort,
}: AlmacenesListProps) {
  const [formData, setFormData] = useState({
    id: "",
    AlmacenId: "",
    AlmacenNombre: "",
    LocalId: "",
  });
  const [locales, setLocales] = useState<Local[]>([]);

  useEffect(() => {
    getLocales(1, 100).then((res) => setLocales(res.data || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (currentAlmacen) {
      setFormData({
        id: String(currentAlmacen.id ?? currentAlmacen.AlmacenId),
        AlmacenId: String(currentAlmacen.AlmacenId),
        AlmacenNombre: currentAlmacen.AlmacenNombre,
        LocalId: currentAlmacen.LocalId != null ? String(currentAlmacen.LocalId) : "",
      });
    } else {
      setFormData({
        id: "",
        AlmacenId: "",
        AlmacenNombre: "",
        LocalId: "",
      });
    }
  }, [currentAlmacen]);

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
    onSubmit({
      ...formData,
      LocalId: formData.LocalId ? Number(formData.LocalId) : null,
    } as unknown as Almacen);
  };

  const columns = [
    { key: "AlmacenId", label: "ID" },
    { key: "AlmacenNombre", label: "Nombre" },
    { key: "LocalNombre", label: "Local" },
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
            placeholder="Buscar almacenes"
          />
        </div>
        <div className="py-4">
          {onCreate && (
            <Button leftIcon={PlusIcon} onClick={onCreate}>
              Nuevo Almacén
            </Button>
          )}
        </div>
      </div>
      <div className="flex justify-between items-center mb-4">
        <div className="text-sm text-text-muted">
          Mostrando {formatMiles(almacenes.length)} de{" "}
          {formatMiles(pagination?.totalItems || 0)} almacenes
        </div>
      </div>
      <DataTable<Almacen>
        columns={columns}
        data={almacenes}
        onEdit={onEdit}
        onDelete={onDelete}
        emptyMessage="No se encontraron almacenes"
        sortKey={sortKey}
        sortOrder={sortOrder}
        onSort={onSort}
      />
      <Modal
        open={isModalOpen}
        onClose={onCloseModal}
        size="lg"
        title={
          currentAlmacen
            ? `Editar almacén: ${currentAlmacen.AlmacenId}`
            : "Crear nuevo almacén"
        }
        footer={
          <>
            <Button variant="secondary" onClick={onCloseModal}>
              Cancelar
            </Button>
            <Button type="submit" form="almacen-form">
              {currentAlmacen ? "Actualizar" : "Crear"}
            </Button>
          </>
        }
      >
        <form id="almacen-form" onSubmit={handleSubmit} className="space-y-4">
          <TextInput
            label="Nombre *"
            name="AlmacenNombre"
            value={formData.AlmacenNombre}
            onChange={(e) =>
              handleInputChange({
                target: {
                  name: "AlmacenNombre",
                  value: e.target.value.toUpperCase(),
                },
              } as React.ChangeEvent<HTMLInputElement>)
            }
            className="uppercase"
            required
          />
          <div>
            <label
              htmlFor="LocalId"
              className="block text-xs font-medium text-text-muted mb-1"
            >
              Local *
            </label>
            <select
              name="LocalId"
              id="LocalId"
              value={formData.LocalId}
              onChange={handleInputChange}
              required
              className="w-full bg-surface border border-border rounded-md text-sm text-text px-3 py-2 transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-brand-600/30 focus:border-brand-600 hover:border-border-strong"
            >
              <option value="">— Seleccionar local —</option>
              {locales.map((l) => (
                <option key={l.LocalId} value={l.LocalId}>
                  {l.LocalNombre}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-text-muted">
              Cada local tiene un único almacén. El stock se descuenta de este almacén al vender en el local.
            </p>
          </div>
        </form>
      </Modal>
    </>
  );
}
