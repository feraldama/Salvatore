import { useEffect, useState } from "react";
import SearchButton from "../common/Input/SearchButton";
import DataTable from "../common/Table/DataTable";
import { Modal, Button, TextInput } from "../common/ui";
import { PlusIcon } from "@heroicons/react/24/outline";
import { formatMiles } from "../../utils/utils";
import { useAuth } from "../../contexts/useAuth";

import type { Caja } from "../../types";

interface Pagination {
  totalItems: number;
}

interface CajasListProps {
  cajas: Caja[];
  onDelete?: (item: Caja) => void;
  onEdit?: (item: Caja) => void;
  onCreate?: () => void;
  pagination?: Pagination;
  onSearch: (value: string) => void;
  searchTerm: string;
  onKeyPress?: React.KeyboardEventHandler<HTMLInputElement>;
  onSearchSubmit: () => void;
  isModalOpen: boolean;
  onCloseModal: () => void;
  currentCaja?: Caja | null;
  onSubmit: (formData: Caja) => void;
  sortKey?: string;
  sortOrder?: "asc" | "desc";
  onSort?: (key: string, order: "asc" | "desc") => void;
}

export default function CajasList({
  cajas,
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
  currentCaja,
  onSubmit,
  sortKey,
  sortOrder,
  onSort,
}: CajasListProps) {
  const { locales, localActiva } = useAuth();
  const [formData, setFormData] = useState<{
    id: string;
    CajaId: string;
    CajaDescripcion: string;
    CajaMonto: number;
    LocalId: number | "";
  }>({
    id: "",
    CajaId: "",
    CajaDescripcion: "",
    CajaMonto: 0,
    LocalId: "",
  });

  useEffect(() => {
    if (currentCaja) {
      setFormData({
        id: String(currentCaja.id ?? currentCaja.CajaId),
        CajaId: String(currentCaja.CajaId),
        CajaDescripcion: currentCaja.CajaDescripcion,
        CajaMonto: currentCaja.CajaMonto,
        LocalId: (currentCaja.LocalId as number) ?? "",
      });
    } else {
      setFormData({
        id: "",
        CajaId: "",
        CajaDescripcion: "",
        CajaMonto: 0,
        // Preselecciona la sucursal activa (si hay una elegida); si está en
        // "Todas", queda vacío y el usuario debe elegir.
        LocalId: localActiva?.LocalId ?? "",
      });
    }
  }, [currentCaja, localActiva]);

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: name === "CajaMonto" ? Number(value) : value,
    }));
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    onSubmit(formData);
  };

  const columns = [
    { key: "CajaId", label: "ID" },
    { key: "CajaDescripcion", label: "Descripción" },
    {
      key: "CajaMonto",
      label: "Monto",
      numeric: true,
      render: (caja: Caja) => `Gs. ${formatMiles(caja.CajaMonto)}`,
    },
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
            placeholder="Buscar cajas"
          />
        </div>
        <div className="py-4">
          {onCreate && (
            <Button leftIcon={PlusIcon} onClick={onCreate}>
              Nueva Caja
            </Button>
          )}
        </div>
      </div>
      <div className="flex justify-between items-center mb-4">
        <div className="text-sm text-text-muted">
          Mostrando {formatMiles(cajas.length)} de{" "}
          {formatMiles(pagination?.totalItems || 0)} cajas
        </div>
      </div>
      <DataTable<Caja>
        columns={columns}
        data={cajas}
        onEdit={onEdit}
        onDelete={onDelete}
        emptyMessage="No se encontraron cajas"
        sortKey={sortKey}
        sortOrder={sortOrder}
        onSort={onSort}
      />
      <Modal
        open={isModalOpen}
        onClose={onCloseModal}
        size="lg"
        title={
          currentCaja
            ? `Editar caja: ${currentCaja.CajaId}`
            : "Crear nueva caja"
        }
        footer={
          <>
            <Button variant="secondary" onClick={onCloseModal}>
              Cancelar
            </Button>
            <Button type="submit" form="caja-form">
              {currentCaja ? "Actualizar" : "Crear"}
            </Button>
          </>
        }
      >
        <form
          id="caja-form"
          onSubmit={handleSubmit}
          className="grid grid-cols-1 sm:grid-cols-2 gap-4"
        >
          <TextInput
            label="Descripción"
            name="CajaDescripcion"
            value={formData.CajaDescripcion}
            onChange={(e) =>
              handleInputChange({
                target: {
                  name: "CajaDescripcion",
                  value: e.target.value.toUpperCase(),
                },
              } as React.ChangeEvent<HTMLInputElement>)
            }
            className="uppercase"
            required
          />
          <TextInput
            label="Monto"
            name="CajaMonto"
            numeric
            value={formData.CajaMonto ? formatMiles(formData.CajaMonto) : "0"}
            onChange={(e) => {
              const raw = e.target.value.replace(/\./g, "").replace(/\s/g, "");
              const num = Number(raw);
              if (!isNaN(num)) {
                setFormData((prev) => ({ ...prev, CajaMonto: num }));
              }
            }}
            required
          />
          <div className="sm:col-span-2">
            <label className="block mb-1.5 text-sm font-medium text-text">
              Sucursal <span className="text-danger-600">*</span>
            </label>
            <select
              name="LocalId"
              value={formData.LocalId}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  LocalId: e.target.value === "" ? "" : Number(e.target.value),
                }))
              }
              required
              className="w-full bg-surface border border-border text-text text-sm rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-brand-600/30 focus:border-brand-600 p-2.5"
            >
              <option value="">Seleccione una sucursal</option>
              {locales.map((l) => (
                <option key={l.LocalId} value={l.LocalId}>
                  {l.LocalNombre}
                </option>
              ))}
            </select>
          </div>
        </form>
      </Modal>
    </>
  );
}
