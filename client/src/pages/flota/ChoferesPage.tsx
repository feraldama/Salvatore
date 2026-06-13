import { useEffect, useState, useCallback, useMemo } from "react";
import Swal from "sweetalert2";
import { PlusIcon } from "@heroicons/react/24/outline";
import DataTable from "../../components/common/Table/DataTable";
import SearchButton from "../../components/common/Input/SearchButton";
import { Button, LoadingState, ErrorState, PermissionDenied } from "../../components/common/ui";
import ChoferFormModal from "../../components/flota/ChoferFormModal";
import { usePermiso } from "../../hooks/usePermiso";
import {
  getChoferes,
  createChofer,
  updateChofer,
  deleteChofer,
  type Chofer,
  type ChoferInput,
} from "../../services/flota.service";

type Row = Chofer & { id: string; [key: string]: unknown };

export default function ChoferesPage() {
  const [choferes, setChoferes] = useState<Chofer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [applied, setApplied] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [current, setCurrent] = useState<Chofer | null>(null);

  const puedeCrear = usePermiso("CHOFERES", "crear");
  const puedeEditar = usePermiso("CHOFERES", "editar");
  const puedeEliminar = usePermiso("CHOFERES", "eliminar");
  const puedeLeer = usePermiso("CHOFERES", "leer");

  const fetchChoferes = useCallback(async () => {
    try {
      setLoading(true);
      setChoferes(await getChoferes());
      setError(null);
    } catch (err) {
      const e = err as { message?: string };
      setError(e?.message || "Error al cargar choferes");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchChoferes();
  }, [fetchChoferes]);

  const filtrados = useMemo<Row[]>(() => {
    const term = applied.trim().toLowerCase();
    const base = !term
      ? choferes
      : choferes.filter(
          (c) =>
            c.usuario_id.toLowerCase().includes(term) ||
            c.nombre.toLowerCase().includes(term) ||
            (c.apellido || "").toLowerCase().includes(term),
        );
    return base.map((c) => ({ ...c, id: c.usuario_id }));
  }, [choferes, applied]);

  const handleCreate = () => {
    setCurrent(null);
    setModalOpen(true);
  };

  const handleEdit = (row: Row) => {
    setCurrent(row);
    setModalOpen(true);
  };

  const handleDelete = (row: Row) => {
    Swal.fire({
      title: "¿Eliminar chofer?",
      text: `Se eliminará ${row.nombre} ${row.apellido || ""} (${row.usuario_id}).`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#d33",
      confirmButtonText: "Sí, eliminar",
      cancelButtonText: "Cancelar",
    }).then(async (r) => {
      if (!r.isConfirmed) return;
      try {
        await deleteChofer(row.usuario_id);
        setChoferes((prev) => prev.filter((c) => c.usuario_id !== row.usuario_id));
        Swal.fire({ icon: "success", title: "Chofer eliminado", timer: 1300, showConfirmButton: false });
      } catch (err) {
        const e = err as { message?: string };
        Swal.fire({ icon: "warning", title: "No permitido", text: e?.message || "No se pudo eliminar" });
      }
    });
  };

  const handleSubmit = async (data: ChoferInput) => {
    try {
      if (current) {
        await updateChofer(current.usuario_id, data);
      } else {
        await createChofer(data);
      }
      setModalOpen(false);
      fetchChoferes();
      Swal.fire({
        position: "top-end",
        icon: "success",
        title: current ? "Chofer actualizado" : "Chofer creado",
        showConfirmButton: false,
        timer: 1500,
      });
    } catch (err) {
      const e = err as { message?: string };
      Swal.fire({ icon: "error", title: "Error", text: e?.message || "No se pudo guardar" });
    }
  };

  const columns = [
    { key: "usuario_id", label: "Usuario" },
    {
      key: "nombre",
      label: "Nombre",
      render: (c: Row) => `${c.nombre} ${c.apellido || ""}`.trim(),
    },
    { key: "correo", label: "Correo" },
    { key: "local_nombre", label: "Local" },
    {
      key: "vehiculos",
      label: "Vehículos",
      numeric: true,
      render: (c: Row) => String(c.vehiculos ?? 0),
    },
    {
      key: "estado",
      label: "Estado",
      render: (c: Row) => (
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
            c.estado === "A"
              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
              : "bg-slate-100 text-slate-600 border border-slate-200"
          }`}
        >
          {c.estado === "A" ? "Activo" : "Inactivo"}
        </span>
      ),
    },
  ];

  if (!puedeLeer) return <PermissionDenied resource="los choferes" />;
  if (loading) return <LoadingState message="Cargando choferes..." />;
  if (error)
    return <ErrorState message={error} onRetry={() => { setError(null); fetchChoferes(); }} />;

  return (
    <div className="container mx-auto px-4">
      <h1 className="text-2xl font-medium mb-3">Choferes</h1>
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between mb-4">
        <div className="flex-1 max-w-md">
          <SearchButton
            searchTerm={search}
            onSearch={setSearch}
            onSearchSubmit={() => setApplied(search)}
            placeholder="Buscar por usuario, nombre o apellido"
            hideButton
          />
        </div>
        {puedeCrear && (
          <Button leftIcon={PlusIcon} onClick={handleCreate}>
            Nuevo chofer
          </Button>
        )}
      </div>
      <DataTable<Row>
        columns={columns}
        data={filtrados}
        onEdit={puedeEditar ? handleEdit : undefined}
        onDelete={puedeEliminar ? handleDelete : undefined}
        emptyMessage="No hay choferes cargados"
      />
      <ChoferFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        chofer={current}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
