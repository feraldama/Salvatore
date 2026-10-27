import { useEffect, useState } from "react";
import SearchButton from "../common/Input/SearchButton";
import DataTable from "../common/Table/DataTable";
import { Button } from "../common/ui";
import {
  PlusIcon,
  FunnelIcon,
  XMarkIcon,
  NoSymbolIcon,
  ArrowUturnLeftIcon,
} from "@heroicons/react/24/outline";
import { formatMiles } from "../../utils/utils";
import type { ProductoFilters } from "../../services/productos.service";
import ProductoFormModal, {
  type ProductoAlmacenRow,
} from "./ProductoFormModal";

interface Producto {
  ProductoId?: number;
  ProductoCodigo: string;
  ProductoNombre: string;
  ProductoPrecioVenta: number;
  ProductoPrecioVentaMayorista?: number;
  ProductoPrecioUnitario?: number;
  ProductoPrecioPromedio?: number;
  ProductoStock: number;
  ProductoStockUnitario?: number;
  ProductoCantidadCaja?: number;
  ProductoIVA?: number;
  ProductoStockMinimo?: number;
  ProductoImagen?: string;
  ProductoImagen_GXI?: string;
  LocalId: number;
  /** 'A' = Activo, 'I' = dado de baja (oculto para la venta). */
  ProductoEstado?: string;
  productoAlmacen?: ProductoAlmacenRow[];
  [key: string]: unknown;
}

interface Pagination {
  totalItems: number;
}

interface ProductsListProps {
  productos: Producto[];
  onDelete?: (item: Producto) => void;
  onEdit?: (item: Producto) => void;
  onToggleEstado?: (item: Producto) => void;
  onCreate?: () => void;
  pagination?: Pagination;
  onSearch: (value: string) => void;
  searchTerm: string;
  onKeyPress?: React.KeyboardEventHandler<HTMLInputElement>;
  onSearchSubmit: () => void;
  isModalOpen: boolean;
  onCloseModal: () => void;
  currentProduct?: Producto | null;
  onSubmit: (
    formData: Producto & { productoAlmacen?: ProductoAlmacenRow[] },
  ) => void;
  sortKey?: string;
  sortOrder?: "asc" | "desc";
  onSort?: (key: string, order: "asc" | "desc") => void;
  filters?: ProductoFilters;
  onFiltersChange?: (filters: ProductoFilters) => void;
  showFilters?: boolean;
  onToggleFilters?: () => void;
}

export default function ProductsList({
  productos,
  onDelete,
  onEdit,
  onToggleEstado,
  onCreate,
  pagination,
  onSearch,
  searchTerm,
  onKeyPress,
  onSearchSubmit,
  isModalOpen,
  onCloseModal,
  currentProduct,
  onSubmit,
  sortKey,
  sortOrder,
  onSort,
  filters,
  onFiltersChange,
  showFilters = false,
  onToggleFilters,
}: ProductsListProps) {
  const activeFilters = filters || {};
  const activeFilterCount = Object.values(activeFilters).filter(
    (v) => v !== undefined && v !== "" && v !== null,
  ).length;

  const updateFilter = <K extends keyof ProductoFilters>(
    key: K,
    value: ProductoFilters[K] | "",
  ) => {
    if (!onFiltersChange) return;
    const next: ProductoFilters = { ...activeFilters };
    if (value === "" || value === undefined || value === null) {
      delete next[key];
    } else {
      next[key] = value;
    }
    onFiltersChange(next);
  };

  const clearFilters = () => {
    if (!onFiltersChange) return;
    onFiltersChange({});
  };

  // Estado local para inputs numéricos — sólo sincronizan con el filtro en blur
  // o Enter, para evitar un fetch por cada dígito tipeado.
  const [stockMinLocal, setStockMinLocal] = useState(
    activeFilters.stockMin?.toString() || "",
  );
  const [stockMaxLocal, setStockMaxLocal] = useState(
    activeFilters.stockMax?.toString() || "",
  );
  const [precioMinLocal, setPrecioMinLocal] = useState(
    activeFilters.precioMin?.toString() || "",
  );
  const [precioMaxLocal, setPrecioMaxLocal] = useState(
    activeFilters.precioMax?.toString() || "",
  );
  useEffect(() => {
    setStockMinLocal(activeFilters.stockMin?.toString() || "");
  }, [activeFilters.stockMin]);
  useEffect(() => {
    setStockMaxLocal(activeFilters.stockMax?.toString() || "");
  }, [activeFilters.stockMax]);
  useEffect(() => {
    setPrecioMinLocal(activeFilters.precioMin?.toString() || "");
  }, [activeFilters.precioMin]);
  useEffect(() => {
    setPrecioMaxLocal(activeFilters.precioMax?.toString() || "");
  }, [activeFilters.precioMax]);

  // Configuración de columnas para la tabla
  const columns = [
    {
      key: "ProductoCodigo",
      label: "Código",
    },
    {
      key: "ProductoNombre",
      label: "Nombre",
    },
    {
      key: "ProductoPrecioVenta",
      label: "Precio Venta",
      numeric: true,
      render: (item: Producto) =>
        `Gs. ${item.ProductoPrecioVenta?.toLocaleString("es-PY")}`,
    },
    {
      key: "ProductoStock",
      label: "Stock",
      numeric: true,
    },
    {
      key: "ProductoStockUnitario",
      label: "Stock Unitario",
      numeric: true,
    },
    {
      key: "ProductoEstado",
      label: "Estado",
      sortable: false,
      render: (item: Producto) =>
        item.ProductoEstado === "I" ? (
          <span className="inline-flex items-center rounded-full bg-danger-50 px-2.5 py-0.5 text-xs font-medium text-danger-700">
            Dado de baja
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full bg-success-50 px-2.5 py-0.5 text-xs font-medium text-success-700">
            Activo
          </span>
        ),
    },
  ];

  // Botón de dar de baja / reactivar, insertado en el grupo de acciones.
  const renderEstadoAction = onToggleEstado
    ? (item: Producto) =>
        item.ProductoEstado === "I" ? (
          <button
            onClick={() => onToggleEstado(item)}
            aria-label="Reactivar producto"
            title="Reactivar (volver a mostrar en la venta)"
            className="inline-flex items-center justify-center h-9 w-9 rounded-md text-success-700 hover:bg-success-50 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-success-600/40"
          >
            <ArrowUturnLeftIcon className="h-5 w-5" />
          </button>
        ) : (
          <button
            onClick={() => onToggleEstado(item)}
            aria-label="Dar de baja producto"
            title="Dar de baja (ocultar de la venta)"
            className="inline-flex items-center justify-center h-9 w-9 rounded-md text-warning-700 hover:bg-warning-50 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-warning-600/40"
          >
            <NoSymbolIcon className="h-5 w-5" />
          </button>
        )
    : undefined;

  return (
    <>
      {/* Barra superior de búsqueda y acciones */}
      <div className="flex flex-col sm:flex-row gap-4 mb-4">
        <div className="flex-1">
          <SearchButton
            searchTerm={searchTerm}
            onSearch={onSearch}
            onKeyPress={onKeyPress}
            onSearchSubmit={onSearchSubmit}
            placeholder="Buscar productos"
          />
        </div>
        <div className="py-4 flex gap-2">
          {onFiltersChange && onToggleFilters && (
            <Button
              variant="outline"
              leftIcon={FunnelIcon}
              onClick={onToggleFilters}
            >
              Filtros
              {activeFilterCount > 0 && (
                <span className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 text-xs font-semibold text-white bg-brand-600 rounded-full">
                  {activeFilterCount}
                </span>
              )}
            </Button>
          )}
          {onCreate && (
            <Button leftIcon={PlusIcon} onClick={onCreate}>
              Nuevo Producto
            </Button>
          )}
        </div>
      </div>
      {onFiltersChange && showFilters && (
        <div className="bg-surface-sunken border border-border rounded-lg p-4 mb-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block mb-1 text-xs font-medium text-text-muted">
                Stock mín.
              </label>
              <input
                type="number"
                min={0}
                value={stockMinLocal}
                onChange={(e) => setStockMinLocal(e.target.value)}
                onBlur={(e) => {
                  const value = e.target.value;
                  if (
                    value &&
                    stockMaxLocal &&
                    Number(value) > Number(stockMaxLocal)
                  ) {
                    setStockMinLocal(activeFilters.stockMin?.toString() || "");
                    return;
                  }
                  if (value !== (activeFilters.stockMin?.toString() || "")) {
                    updateFilter("stockMin", value);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    (e.target as HTMLInputElement).blur();
                  }
                }}
                className="w-full bg-surface border border-border text-text text-sm rounded-md focus:ring-brand-500/30 focus:border-brand-600 p-2"
              />
            </div>
            <div>
              <label className="block mb-1 text-xs font-medium text-text-muted">
                Stock máx.
              </label>
              <input
                type="number"
                min={0}
                value={stockMaxLocal}
                onChange={(e) => setStockMaxLocal(e.target.value)}
                onBlur={(e) => {
                  const value = e.target.value;
                  if (
                    value &&
                    stockMinLocal &&
                    Number(value) < Number(stockMinLocal)
                  ) {
                    setStockMaxLocal(activeFilters.stockMax?.toString() || "");
                    return;
                  }
                  if (value !== (activeFilters.stockMax?.toString() || "")) {
                    updateFilter("stockMax", value);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    (e.target as HTMLInputElement).blur();
                  }
                }}
                className="w-full bg-surface border border-border text-text text-sm rounded-md focus:ring-brand-500/30 focus:border-brand-600 p-2"
              />
            </div>
            <div>
              <label className="block mb-1 text-xs font-medium text-text-muted">
                Precio mín.
              </label>
              <input
                type="number"
                min={0}
                value={precioMinLocal}
                onChange={(e) => setPrecioMinLocal(e.target.value)}
                onBlur={(e) => {
                  const value = e.target.value;
                  if (
                    value &&
                    precioMaxLocal &&
                    Number(value) > Number(precioMaxLocal)
                  ) {
                    setPrecioMinLocal(
                      activeFilters.precioMin?.toString() || "",
                    );
                    return;
                  }
                  if (value !== (activeFilters.precioMin?.toString() || "")) {
                    updateFilter("precioMin", value);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    (e.target as HTMLInputElement).blur();
                  }
                }}
                className="w-full bg-surface border border-border text-text text-sm rounded-md focus:ring-brand-500/30 focus:border-brand-600 p-2"
              />
            </div>
            <div>
              <label className="block mb-1 text-xs font-medium text-text-muted">
                Precio máx.
              </label>
              <input
                type="number"
                min={0}
                value={precioMaxLocal}
                onChange={(e) => setPrecioMaxLocal(e.target.value)}
                onBlur={(e) => {
                  const value = e.target.value;
                  if (
                    value &&
                    precioMinLocal &&
                    Number(value) < Number(precioMinLocal)
                  ) {
                    setPrecioMaxLocal(
                      activeFilters.precioMax?.toString() || "",
                    );
                    return;
                  }
                  if (value !== (activeFilters.precioMax?.toString() || "")) {
                    updateFilter("precioMax", value);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    (e.target as HTMLInputElement).blur();
                  }
                }}
                className="w-full bg-surface border border-border text-text text-sm rounded-md focus:ring-brand-500/30 focus:border-brand-600 p-2"
              />
            </div>
          </div>
          {activeFilterCount > 0 && (
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-text-muted hover:text-text cursor-pointer"
              >
                <XMarkIcon className="w-4 h-4" />
                Limpiar filtros
              </button>
            </div>
          )}
        </div>
      )}

      <div className="flex justify-between items-center mb-4">
        <div className="text-sm text-text-muted">
          Mostrando {formatMiles(productos.length)} de{" "}
          {formatMiles(pagination?.totalItems || 0)} productos
        </div>
      </div>

      {/* Tabla de productos usando el componente DataTable */}
      <DataTable<Producto & { id: number }>
        columns={columns}
        data={productos.map((p) => ({ ...p, id: p.ProductoId ?? 0 }))}
        onEdit={onEdit}
        onDelete={onDelete}
        extraActions={renderEstadoAction}
        emptyMessage="No se encontraron productos"
        sortKey={sortKey}
        sortOrder={sortOrder}
        onSort={onSort}
      />

      {/* Modal para crear/editar */}
      <ProductoFormModal
        isOpen={isModalOpen}
        onClose={onCloseModal}
        currentProduct={currentProduct}
        onSubmit={onSubmit}
      />
    </>
  );
}
