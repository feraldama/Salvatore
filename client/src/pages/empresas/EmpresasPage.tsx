import { useEffect, useState, useCallback } from "react";
import {
  getEmpresasAccesibles,
  createEmpresa,
  updateEmpresa,
  deleteEmpresa,
  type Empresa,
} from "../../services/empresas.service";
import EmpresaFormModal from "../../components/empresas/EmpresaFormModal";
import DataTable from "../../components/common/Table/DataTable";
import { Button } from "../../components/common/ui";
import { PlusIcon } from "@heroicons/react/24/outline";
import Swal from "sweetalert2";
import { usePermiso } from "../../hooks/usePermiso";
import { LoadingState, ErrorState, PermissionDenied } from "../../components/common/ui";

export default function EmpresasPage() {
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [current, setCurrent] = useState<Empresa | null>(null);

  // Reutilizamos el permiso de control de acceso (LOCALES) para empresas.
  const puedeLeer = usePermiso("LOCALES", "leer");
  const puedeCrear = usePermiso("LOCALES", "crear");
  const puedeEditar = usePermiso("LOCALES", "editar");
  const puedeEliminar = usePermiso("LOCALES", "eliminar");

  const fetch = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getEmpresasAccesibles();
      setEmpresas(data);
    } catch (err) {
      const e = err as { message?: string };
      setError(e?.message || "Error al cargar empresas");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const handleCreate = () => { setCurrent(null); setIsModalOpen(true); };
  const handleEdit = (e: Empresa) => { setCurrent(e); setIsModalOpen(true); };

  const handleDelete = (e: Empresa) => {
    Swal.fire({
      title: "¿Eliminar empresa?",
      text: `${e.EmpresaNombre}`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#3085d6",
      cancelButtonColor: "#d33",
      confirmButtonText: "Sí, eliminar",
      cancelButtonText: "Cancelar",
    }).then(async (r) => {
      if (!r.isConfirmed) return;
      try {
        await deleteEmpresa(e.EmpresaId);
        setEmpresas((prev) => prev.filter((x) => x.EmpresaId !== e.EmpresaId));
        Swal.fire({ icon: "success", title: "Empresa eliminada", timer: 1500, showConfirmButton: false });
      } catch (err) {
        const ex = err as { message?: string };
        Swal.fire({ icon: "warning", title: "No permitido", text: ex?.message || "No se pudo eliminar" });
      }
    });
  };

  const handleSubmit = async (data: Empresa) => {
    try {
      if (current?.EmpresaId) {
        await updateEmpresa(current.EmpresaId, data as unknown as Record<string, unknown>);
      } else {
        await createEmpresa(data as unknown as Record<string, unknown>);
      }
      setIsModalOpen(false);
      Swal.fire({ position: "top-end", icon: "success", title: "Guardado", showConfirmButton: false, timer: 1500 });
      fetch();
    } catch (err) {
      const e = err as { message?: string };
      setError(e?.message || "Error al guardar");
    }
  };

  if (!puedeLeer) return <PermissionDenied resource="las empresas" />;
  if (loading) return <LoadingState message="Cargando empresas..." />;
  if (error) return <ErrorState message={error} onRetry={() => { setError(null); fetch(); }} />;

  const columns = [
    { key: "EmpresaId", label: "ID" },
    { key: "EmpresaNombre", label: "Nombre" },
    { key: "EmpresaRUC", label: "RUC" },
    {
      key: "EmpresaTipo",
      label: "Tipo",
      render: (e: Empresa) => (e.EmpresaTipo === "D" ? "Distribuidora" : "Minorista"),
    },
    {
      key: "EmpresaEstado",
      label: "Estado",
      render: (e: Empresa) => (e.EmpresaEstado === "I" ? "Inactivo" : "Activo"),
    },
  ];

  return (
    <div className="container mx-auto px-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-medium">Gestión de Empresas</h1>
        {puedeCrear && (
          <Button leftIcon={PlusIcon} onClick={handleCreate}>Nueva Empresa</Button>
        )}
      </div>
      <DataTable<Empresa & { id: string | number }>
        columns={columns}
        data={empresas.map((e) => ({ ...e, id: e.EmpresaId }))}
        onEdit={puedeEditar ? handleEdit : undefined}
        onDelete={puedeEliminar ? handleDelete : undefined}
        emptyMessage="No hay empresas"
      />
      <EmpresaFormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        currentEmpresa={current}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
