import SearchButton from "../common/Input/SearchButton";
import DataTable from "../common/Table/DataTable";
import { Button } from "../common/ui";
import { PlusIcon } from "@heroicons/react/24/outline";
import VendedorFormModal from "../common/VendedorFormModal";
import type { Vendedor } from "../../services/vendedores.service";

interface VendedoresListProps {
  vendedores: Vendedor[];
  onDelete?: (item: Vendedor) => void;
  onEdit?: (item: Vendedor) => void;
  onCreate?: () => void;
  onSearch: (value: string) => void;
  searchTerm: string;
  onKeyPress?: React.KeyboardEventHandler<HTMLInputElement>;
  onSearchSubmit: () => void;
  isModalOpen: boolean;
  onCloseModal: () => void;
  currentVendedor?: Vendedor | null;
  onSubmit: (formData: Vendedor) => void;
  sortKey?: string;
  sortOrder?: "asc" | "desc";
  onSort?: (key: string, order: "asc" | "desc") => void;
}

const columns = [
  { key: "VendedorId", label: "ID" },
  { key: "VendedorNombre", label: "Nombre" },
  { key: "VendedorApellido", label: "Apellido" },
  { key: "VendedorTelefono", label: "Teléfono" },
  { key: "VendedorDireccion", label: "Dirección" },
  { key: "VendedorEstado", label: "Estado" },
];

export default function VendedoresList({
  vendedores,
  onDelete,
  onEdit,
  onCreate,
  onSearch,
  searchTerm,
  onKeyPress,
  onSearchSubmit,
  isModalOpen,
  onCloseModal,
  currentVendedor,
  onSubmit,
  sortKey,
  sortOrder,
  onSort,
}: VendedoresListProps) {
  return (
    <>
      <div className="flex flex-col sm:flex-row gap-4 mb-4">
        <div className="flex-1">
          <SearchButton
            searchTerm={searchTerm}
            onSearch={onSearch}
            onKeyPress={onKeyPress}
            onSearchSubmit={onSearchSubmit}
            placeholder="Buscar vendedores"
          />
        </div>
        <div className="py-4 flex gap-2">
          {onCreate && (
            <Button leftIcon={PlusIcon} onClick={onCreate}>
              Nuevo Vendedor
            </Button>
          )}
        </div>
      </div>
      <div className="flex justify-between items-center mb-4">
        <div className="text-sm text-text-muted">
          {vendedores.length} vendedor{vendedores.length !== 1 ? "es" : ""}
        </div>
      </div>
      <DataTable<Vendedor & { id: string | number }>
        columns={columns}
        data={vendedores.map((v) => ({ ...v, id: v.id || v.VendedorId || "" }))}
        onEdit={onEdit}
        onDelete={onDelete}
        emptyMessage="No se encontraron vendedores"
        sortKey={sortKey}
        sortOrder={sortOrder}
        onSort={onSort}
      />
      <VendedorFormModal
        isOpen={isModalOpen}
        onClose={onCloseModal}
        currentVendedor={currentVendedor}
        onSubmit={onSubmit}
      />
    </>
  );
}
