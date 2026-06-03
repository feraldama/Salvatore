import { useEffect, useState, useCallback, useMemo } from "react";
import {
  getVendedores,
  deleteVendedor,
  createVendedor,
  updateVendedor,
  type Vendedor,
} from "../../services/vendedores.service";
import VendedoresList from "../../components/vendedores/VendedoresList";
import Swal from "sweetalert2";
import { usePermiso } from "../../hooks/usePermiso";
import { useAuth } from "../../contexts/useAuth";
import {
  LoadingState,
  ErrorState,
  PermissionDenied,
} from "../../components/common/ui";

export default function VendedoresPage() {
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [appliedSearchTerm, setAppliedSearchTerm] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentVendedor, setCurrentVendedor] = useState<Vendedor | null>(null);
  const [sortKey, setSortKey] = useState<string | undefined>();
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  const { empresaActiva } = useAuth();

  const puedeCrear = usePermiso("VENDEDORES", "crear");
  const puedeEditar = usePermiso("VENDEDORES", "editar");
  const puedeEliminar = usePermiso("VENDEDORES", "eliminar");
  const puedeLeer = usePermiso("VENDEDORES", "leer");

  const fetchVendedores = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getVendedores(empresaActiva?.EmpresaId);
      setVendedores(data.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }, [empresaActiva?.EmpresaId]);

  useEffect(() => {
    fetchVendedores();
  }, [fetchVendedores]);

  const vendedoresFiltrados = useMemo(() => {
    if (!appliedSearchTerm) return vendedores;
    const term = appliedSearchTerm.toLowerCase();
    return vendedores.filter(
      (v) =>
        v.VendedorNombre.toLowerCase().includes(term) ||
        v.VendedorApellido.toLowerCase().includes(term) ||
        (v.VendedorTelefono || "").toLowerCase().includes(term)
    );
  }, [vendedores, appliedSearchTerm]);

  const handleSearch = (term: string) => setSearchTerm(term);

  const applySearch = () => {
    setAppliedSearchTerm(searchTerm);
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") applySearch();
  };

  const handleCreate = () => {
    setCurrentVendedor(null);
    setIsModalOpen(true);
  };

  const handleEdit = (vendedor: Vendedor) => {
    setCurrentVendedor(vendedor);
    setIsModalOpen(true);
  };

  const handleDelete = (vendedor: Vendedor) => {
    if (vendedor.VendedorId == null) return;
    const id = String(vendedor.VendedorId);
    Swal.fire({
      title: "¿Estás seguro?",
      text: `Eliminará a ${vendedor.VendedorNombre} ${vendedor.VendedorApellido}`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#3085d6",
      cancelButtonColor: "#d33",
      confirmButtonText: "Sí, eliminar",
      cancelButtonText: "Cancelar",
    }).then(async (result) => {
      if (!result.isConfirmed) return;
      try {
        await deleteVendedor(id);
        setVendedores((prev) =>
          prev.filter((v) => String(v.VendedorId) !== id)
        );
        Swal.fire({ icon: "success", title: "Vendedor eliminado", timer: 1500, showConfirmButton: false });
      } catch (err) {
        const e = err as { message?: string };
        Swal.fire({ icon: "warning", title: "No permitido", text: e?.message || "No se pudo eliminar el vendedor" });
      }
    });
  };

  const handleSubmit = async (data: Vendedor) => {
    try {
      if (currentVendedor?.VendedorId != null) {
        await updateVendedor(String(currentVendedor.VendedorId), data as Record<string, unknown>);
        Swal.fire({ position: "top-end", icon: "success", title: "Vendedor actualizado", showConfirmButton: false, timer: 2000 });
      } else {
        await createVendedor(data as Record<string, unknown>);
        Swal.fire({ position: "top-end", icon: "success", title: "Vendedor creado", showConfirmButton: false, timer: 2000 });
      }
      setIsModalOpen(false);
      fetchVendedores();
    } catch (err) {
      const e = err as { message?: string };
      setError(e?.message || "Error desconocido");
    }
  };

  if (!puedeLeer) return <PermissionDenied resource="los vendedores" />;
  if (loading) return <LoadingState message="Cargando vendedores..." />;
  if (error)
    return (
      <ErrorState
        message={error}
        onRetry={() => { setError(null); fetchVendedores(); }}
      />
    );

  return (
    <div className="container mx-auto px-4">
      <h1 className="text-2xl font-medium mb-3">Gestión de Vendedores</h1>
      <VendedoresList
        vendedores={vendedoresFiltrados.map((v) => ({ ...v, id: v.VendedorId }))}
        onDelete={puedeEliminar ? handleDelete : undefined}
        onEdit={puedeEditar ? handleEdit : undefined}
        onCreate={puedeCrear ? handleCreate : undefined}
        onSearch={handleSearch}
        searchTerm={searchTerm}
        onKeyPress={handleKeyPress}
        onSearchSubmit={applySearch}
        isModalOpen={isModalOpen}
        onCloseModal={() => setIsModalOpen(false)}
        currentVendedor={currentVendedor ? { ...currentVendedor, id: currentVendedor.VendedorId } : null}
        onSubmit={handleSubmit}
        sortKey={sortKey}
        sortOrder={sortOrder}
        onSort={(key, order) => { setSortKey(key); setSortOrder(order); }}
      />
    </div>
  );
}
