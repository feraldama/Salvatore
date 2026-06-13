import { useEffect, useState, useCallback, useMemo } from "react";
import Swal from "sweetalert2";
import { PlusIcon } from "@heroicons/react/24/outline";
import DataTable from "../../components/common/Table/DataTable";
import SearchButton from "../../components/common/Input/SearchButton";
import { Button, LoadingState, ErrorState, PermissionDenied } from "../../components/common/ui";
import VehiculoFormModal from "../../components/flota/VehiculoFormModal";
import { usePermiso } from "../../hooks/usePermiso";
import {
  getVehiculosAdmin,
  createVehiculo,
  updateVehiculo,
  deleteVehiculo,
  setChoferesDeVehiculo,
  type VehiculoFlotaFull,
  type VehiculoInput,
} from "../../services/flota.service";

type Row = VehiculoFlotaFull & { id: number; [key: string]: unknown };

export default function VehiculosPage() {
  const [vehiculos, setVehiculos] = useState<VehiculoFlotaFull[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [applied, setApplied] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [current, setCurrent] = useState<VehiculoFlotaFull | null>(null);

  const puedeCrear = usePermiso("VEHICULOS", "crear");
  const puedeEditar = usePermiso("VEHICULOS", "editar");
  const puedeEliminar = usePermiso("VEHICULOS", "eliminar");
  const puedeLeer = usePermiso("VEHICULOS", "leer");

  const fetchVehiculos = useCallback(async () => {
    try {
      setLoading(true);
      setVehiculos(await getVehiculosAdmin());
      setError(null);
    } catch (err) {
      const e = err as { message?: string };
      setError(e?.message || "Error al cargar vehículos");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchVehiculos();
  }, [fetchVehiculos]);

  const filtrados = useMemo<Row[]>(() => {
    const term = applied.trim().toLowerCase();
    const base = !term
      ? vehiculos
      : vehiculos.filter(
          (v) =>
            v.chapa.toLowerCase().includes(term) ||
            (v.marca || "").toLowerCase().includes(term) ||
            (v.modelo || "").toLowerCase().includes(term),
        );
    return base.map((v) => ({ ...v, id: v.id }));
  }, [vehiculos, applied]);

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
      title: "¿Eliminar vehículo?",
      text: `Se eliminará ${row.chapa}.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#d33",
      confirmButtonText: "Sí, eliminar",
      cancelButtonText: "Cancelar",
    }).then(async (r) => {
      if (!r.isConfirmed) return;
      try {
        await deleteVehiculo(row.id);
        setVehiculos((prev) => prev.filter((v) => v.id !== row.id));
        Swal.fire({ icon: "success", title: "Vehículo eliminado", timer: 1300, showConfirmButton: false });
      } catch (err) {
        const e = err as { message?: string };
        Swal.fire({ icon: "warning", title: "No permitido", text: e?.message || "No se pudo eliminar" });
      }
    });
  };

  const handleSubmit = async (data: VehiculoInput, choferIds: string[]) => {
    try {
      let vehiculoId: number;
      if (current) {
        await updateVehiculo(current.id, data);
        vehiculoId = current.id;
      } else {
        const creado = await createVehiculo(data);
        vehiculoId = creado.id;
      }
      await setChoferesDeVehiculo(vehiculoId, choferIds);
      setModalOpen(false);
      fetchVehiculos();
      Swal.fire({
        position: "top-end",
        icon: "success",
        title: current ? "Vehículo actualizado" : "Vehículo creado",
        showConfirmButton: false,
        timer: 1500,
      });
    } catch (err) {
      const e = err as { message?: string };
      Swal.fire({ icon: "error", title: "Error", text: e?.message || "No se pudo guardar" });
    }
  };

  const columns = [
    { key: "chapa", label: "Chapa" },
    { key: "marca", label: "Marca" },
    { key: "modelo", label: "Modelo" },
    { key: "km_actual", label: "Km", numeric: true },
    {
      key: "choferes",
      label: "Choferes",
      numeric: true,
      render: (v: Row) => String(v.choferes ?? 0),
    },
    {
      key: "activo",
      label: "Estado",
      render: (v: Row) => (
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
            v.activo
              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
              : "bg-slate-100 text-slate-600 border border-slate-200"
          }`}
        >
          {v.activo ? "Activo" : "Inactivo"}
        </span>
      ),
    },
  ];

  if (!puedeLeer) return <PermissionDenied resource="los vehículos de flota" />;
  if (loading) return <LoadingState message="Cargando vehículos..." />;
  if (error)
    return <ErrorState message={error} onRetry={() => { setError(null); fetchVehiculos(); }} />;

  return (
    <div className="container mx-auto px-4">
      <h1 className="text-2xl font-medium mb-3">Vehículos de Flota</h1>
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between mb-4">
        <div className="flex-1 max-w-md">
          <SearchButton
            searchTerm={search}
            onSearch={setSearch}
            onSearchSubmit={() => setApplied(search)}
            placeholder="Buscar por chapa, marca o modelo"
            hideButton
          />
        </div>
        {puedeCrear && (
          <Button leftIcon={PlusIcon} onClick={handleCreate}>
            Nuevo vehículo
          </Button>
        )}
      </div>
      <DataTable<Row>
        columns={columns}
        data={filtrados}
        onEdit={puedeEditar ? handleEdit : undefined}
        onDelete={puedeEliminar ? handleDelete : undefined}
        emptyMessage="No hay vehículos cargados"
      />
      <VehiculoFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        vehiculo={current}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
