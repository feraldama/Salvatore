import { useEffect, useState, useCallback } from "react";
import {
  getProductosPaginated,
  getProductoById,
  deleteProducto,
  searchProductos,
  createProducto,
  updateProducto,
  setProductoEstado,
  type ProductoFilters,
} from "../../services/productos.service";
import ProductsList from "../../components/products/ProductsList";
import Pagination from "../../components/common/Pagination";
import {
  LoadingState,
  ErrorState,
  PermissionDenied,
} from "../../components/common/ui";
import Swal from "sweetalert2";
import { usePermiso } from "../../hooks/usePermiso";

// Stock por almacén (tabla productoalmacen)
export interface ProductoAlmacenItem {
  AlmacenId: number;
  AlmacenNombre?: string;
  ProductoAlmacenStock: number;
  ProductoAlmacenStockUnitario: number;
}

// Tipos auxiliares
interface Producto {
  ProductoId: number;
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
  LocalNombre: string;
  ProductoEstado?: string;
  productoAlmacen?: ProductoAlmacenItem[];
  [key: string]: unknown;
}

interface Pagination {
  totalItems: number;
  totalPages: number;
  [key: string]: unknown;
}

type ProductoForm = Partial<Producto>;

export default function ProductsPage() {
  const [productosData, setProductosData] = useState<{
    productos: Producto[];
    pagination: Pagination;
  }>({ productos: [], pagination: { totalItems: 0, totalPages: 1 } });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const [appliedSearchTerm, setAppliedSearchTerm] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentProduct, setCurrentProduct] = useState<Producto | null>(null);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [sortKey, setSortKey] = useState<string | undefined>();
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [filters, setFilters] = useState<ProductoFilters>({});
  const [showFilters, setShowFilters] = useState(false);

  const puedeCrear = usePermiso("PRODUCTOS", "crear");
  const puedeEditar = usePermiso("PRODUCTOS", "editar");
  const puedeEliminar = usePermiso("PRODUCTOS", "eliminar");
  const puedeLeer = usePermiso("PRODUCTOS", "leer");

  const fetchProductos = useCallback(async () => {
    try {
      setLoading(true);
      // La gestión de productos ve también los dados de baja (para reactivarlos);
      // el POS no envía este flag, así que solo ve los activos.
      const fetchFilters = { ...filters, incluirInactivos: true };
      let data;
      if (appliedSearchTerm) {
        data = await searchProductos(
          appliedSearchTerm,
          currentPage,
          itemsPerPage,
          sortKey,
          sortOrder,
          fetchFilters
        );
      } else {
        data = await getProductosPaginated(
          currentPage,
          itemsPerPage,
          sortKey,
          sortOrder,
          fetchFilters
        );
      }
      setProductosData({
        productos: data.data,
        pagination: data.pagination,
      });
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Error desconocido");
      }
    } finally {
      setLoading(false);
    }
  }, [
    currentPage,
    appliedSearchTerm,
    itemsPerPage,
    sortKey,
    sortOrder,
    filters,
  ]);

  const handleFiltersChange = (newFilters: ProductoFilters) => {
    setFilters(newFilters);
    setCurrentPage(1);
  };

  useEffect(() => {
    fetchProductos();
  }, [fetchProductos]);

  const handleSearch = (term: string) => {
    setSearchTerm(term);
  };

  const applySearch = () => {
    setAppliedSearchTerm(searchTerm);
    setCurrentPage(1);
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      applySearch();
    }
  };

  const handleDelete = async (id: number) => {
    Swal.fire({
      title: "¿Estás seguro?",
      text: "¡No podrás revertir esto!",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#3085d6",
      cancelButtonColor: "#d33",
      confirmButtonText: "Sí, eliminar!",
      cancelButtonText: "Cancelar",
    }).then(async (result) => {
      if (result.isConfirmed) {
        try {
          await deleteProducto(id);
          Swal.fire({
            icon: "success",
            title: "Producto eliminado exitosamente",
          });
          setProductosData((prev) => ({
            ...prev,
            productos: prev.productos.filter(
              (producto) => Number(producto.ProductoId) !== id
            ),
          }));
        } catch (error: unknown) {
          const err = error as { message?: string };
          const msg = err?.message || "No se pudo eliminar el producto";
          Swal.fire({
            icon: "warning",
            title: "No permitido",
            text: msg,
          });
        }
      }
    });
  };

  const handleToggleEstado = async (product: Producto) => {
    const darDeBaja = product.ProductoEstado !== "I";
    const result = await Swal.fire({
      title: darDeBaja ? "¿Dar de baja el producto?" : "¿Reactivar el producto?",
      text: darDeBaja
        ? `"${product.ProductoNombre}" dejará de aparecer en la venta. Podés reactivarlo cuando quieras.`
        : `"${product.ProductoNombre}" volverá a aparecer en la venta.`,
      icon: "question",
      showCancelButton: true,
      confirmButtonColor: darDeBaja ? "#d97706" : "#059669",
      cancelButtonColor: "#6b7280",
      confirmButtonText: darDeBaja ? "Sí, dar de baja" : "Sí, reactivar",
      cancelButtonText: "Cancelar",
    });
    if (!result.isConfirmed) return;
    try {
      await setProductoEstado(product.ProductoId, darDeBaja ? "I" : "A");
      Swal.fire({
        position: "top-end",
        icon: "success",
        title: darDeBaja ? "Producto dado de baja" : "Producto reactivado",
        showConfirmButton: false,
        timer: 2000,
      });
      fetchProductos();
    } catch (error: unknown) {
      const err = error as { message?: string };
      Swal.fire({
        icon: "error",
        title: "Error",
        text: err?.message || "No se pudo cambiar el estado del producto",
      });
    }
  };

  const handleCreate = () => {
    setCurrentProduct(null); // Indica que es un nuevo producto
    setIsModalOpen(true);
  };

  const handleEdit = async (product: Producto) => {
    try {
      const fullProduct = await getProductoById(product.ProductoId);
      setCurrentProduct({
        ...fullProduct,
        ProductoId: Number(fullProduct.ProductoId),
        productoAlmacen: fullProduct.productoAlmacen ?? [],
      });
      setIsModalOpen(true);
    } catch {
      setError("No se pudo cargar el producto para editar");
    }
  };

  const handleSubmit = async (productData: ProductoForm) => {
    let mensaje = "";
    try {
      if (currentProduct) {
        await updateProducto(currentProduct.ProductoId, productData);
        mensaje = "Producto actualizado exitosamente";
      } else {
        const response = await createProducto(productData);
        mensaje = response.message || "Producto creado exitosamente";
      }
      setIsModalOpen(false);
      Swal.fire({
        position: "top-end",
        icon: "success",
        title: mensaje,
        showConfirmButton: false,
        timer: 2000,
      });
      fetchProductos();
    } catch (error) {
      if (error instanceof Error) {
        setError(error.message);
      } else {
        setError("Error desconocido");
      }
    }
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const handleItemsPerPageChange = (newItemsPerPage: number) => {
    setItemsPerPage(newItemsPerPage);
    setCurrentPage(1);
  };

  if (!puedeLeer) return <PermissionDenied resource="los productos" />;
  if (loading) return <LoadingState message="Cargando productos..." />;
  if (error)
    return (
      <ErrorState
        message={error}
        onRetry={() => {
          setError(null);
          fetchProductos();
        }}
      />
    );

  return (
    <div className="container mx-auto px-4">
      <h1 className="text-2xl font-medium mb-3">Gestión de Productos</h1>
      <ProductsList
        productos={productosData.productos.map((p) => ({
          ...p,
          ProductoId: Number(p.ProductoId),
          LocalNombre: typeof p.LocalNombre === "string" ? p.LocalNombre : "",
        }))}
        onDelete={
          puedeEliminar ? (p) => handleDelete(Number(p.ProductoId)) : undefined
        }
        onEdit={
          puedeEditar
            ? (p) =>
                handleEdit({
                  ...p,
                  ProductoId: Number(p.ProductoId),
                  LocalNombre:
                    typeof p.LocalNombre === "string" ? p.LocalNombre : "",
                })
            : undefined
        }
        onToggleEstado={puedeEditar ? handleToggleEstado : undefined}
        onCreate={puedeCrear ? handleCreate : undefined}
        pagination={productosData.pagination}
        onSearch={handleSearch}
        searchTerm={searchTerm}
        onKeyPress={handleKeyPress}
        onSearchSubmit={applySearch}
        isModalOpen={isModalOpen}
        onCloseModal={() => setIsModalOpen(false)}
        currentProduct={currentProduct}
        onSubmit={handleSubmit}
        sortKey={sortKey}
        sortOrder={sortOrder}
        onSort={(key: string, order: "asc" | "desc") => {
          setSortKey(key);
          setSortOrder(order);
          setCurrentPage(1);
        }}
        filters={filters}
        onFiltersChange={handleFiltersChange}
        showFilters={showFilters}
        onToggleFilters={() => setShowFilters((v) => !v)}
      />
      <Pagination
        currentPage={currentPage}
        totalPages={productosData.pagination.totalPages}
        onPageChange={handlePageChange}
        itemsPerPage={itemsPerPage}
        onItemsPerPageChange={handleItemsPerPageChange}
      />
    </div>
  );
}
