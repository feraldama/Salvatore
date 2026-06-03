import { useEffect, useState } from "react";
import SearchButton from "../common/Input/SearchButton";
import DataTable from "../common/Table/DataTable";
import { Modal, Button, TextInput } from "../common/ui";
import { PlusIcon } from "@heroicons/react/24/outline";
import { formatMiles } from "../../utils/utils";

interface Factura {
  id: string | number;
  FacturaId: string | number;
  FacturaTimbrado: string;
  FacturaDesde: string;
  FacturaHasta: string;
  [key: string]: unknown;
}

interface Pagination {
  totalItems: number;
}

interface FacturasListProps {
  facturas: Factura[];
  onDelete?: (item: Factura) => void;
  onEdit?: (item: Factura) => void;
  onCreate?: () => void;
  pagination?: Pagination;
  onSearch: (value: string) => void;
  searchTerm: string;
  onKeyPress?: React.KeyboardEventHandler<HTMLInputElement>;
  onSearchSubmit: () => void;
  isModalOpen: boolean;
  onCloseModal: () => void;
  currentFactura?: Factura | null;
  onSubmit: (formData: Factura) => void;
  sortKey?: string;
  sortOrder?: "asc" | "desc";
  onSort?: (key: string, order: "asc" | "desc") => void;
}

export default function FacturasList({
  facturas,
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
  currentFactura,
  onSubmit,
  sortKey,
  sortOrder,
  onSort,
}: FacturasListProps) {
  const [formData, setFormData] = useState({
    id: "",
    FacturaId: "",
    FacturaTimbrado: "",
    FacturaDesde: "",
    FacturaHasta: "",
  });

  useEffect(() => {
    if (currentFactura) {
      setFormData({
        id: String(currentFactura.id ?? currentFactura.FacturaId),
        FacturaId: String(currentFactura.FacturaId),
        FacturaTimbrado: currentFactura.FacturaTimbrado,
        FacturaDesde: currentFactura.FacturaDesde,
        FacturaHasta: currentFactura.FacturaHasta,
      });
    } else {
      setFormData({
        id: "",
        FacturaId: "",
        FacturaTimbrado: "",
        FacturaDesde: "",
        FacturaHasta: "",
      });
    }
  }, [currentFactura]);

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
    onSubmit(formData as Factura);
  };

  const columns = [
    { key: "FacturaId", label: "ID" },
    { key: "FacturaTimbrado", label: "Timbrado" },
    { key: "FacturaDesde", label: "Desde" },
    { key: "FacturaHasta", label: "Hasta" },
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
            placeholder="Buscar facturas"
          />
        </div>
        <div className="py-4">
          {onCreate && (
            <Button leftIcon={PlusIcon} onClick={onCreate}>
              Nueva Factura
            </Button>
          )}
        </div>
      </div>
      <div className="flex justify-between items-center mb-4">
        <div className="text-sm text-text-muted">
          Mostrando {formatMiles(facturas.length)} de{" "}
          {formatMiles(pagination?.totalItems || 0)} facturas
        </div>
      </div>
      <DataTable<Factura>
        columns={columns}
        data={facturas}
        onEdit={onEdit}
        onDelete={onDelete}
        emptyMessage="No se encontraron facturas"
        sortKey={sortKey}
        sortOrder={sortOrder}
        onSort={onSort}
      />
      <Modal
        open={isModalOpen}
        onClose={onCloseModal}
        size="2xl"
        title={
          currentFactura
            ? `Editar factura: ${currentFactura.FacturaId}`
            : "Crear nueva factura"
        }
        footer={
          <>
            <Button variant="secondary" onClick={onCloseModal}>
              Cancelar
            </Button>
            <Button type="submit" form="factura-form">
              {currentFactura ? "Actualizar" : "Crear"}
            </Button>
          </>
        }
      >
        <form id="factura-form" onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <TextInput
              label="Timbrado (máx. 8 dígitos)"
              name="FacturaTimbrado"
              value={formData.FacturaTimbrado}
              onChange={handleInputChange}
              placeholder="12345678"
              maxLength={8}
              pattern="[0-9]{1,8}"
              required
            />
            <TextInput
              label="Desde (máx. 7 dígitos)"
              name="FacturaDesde"
              value={formData.FacturaDesde}
              onChange={handleInputChange}
              placeholder="1"
              maxLength={7}
              pattern="[0-9]{1,7}"
              required
            />
            <TextInput
              label="Hasta (máx. 7 dígitos)"
              name="FacturaHasta"
              value={formData.FacturaHasta}
              onChange={handleInputChange}
              placeholder="1000"
              maxLength={7}
              pattern="[0-9]{1,7}"
              required
            />
          </div>
          <div className="text-sm text-text-subtle space-y-0.5">
            <p>• El timbrado debe tener máximo 8 dígitos numéricos</p>
            <p>• Los números desde/hasta deben tener máximo 7 dígitos</p>
            <p>• El número "Desde" debe ser menor que "Hasta"</p>
            <p>• No se permiten superposiciones de rangos</p>
          </div>
        </form>
      </Modal>
    </>
  );
}
