import { useEffect, useState } from "react";
import SearchButton from "../common/Input/SearchButton";
import DataTable from "../common/Table/DataTable";
import { Modal, Button, TextInput } from "../common/ui";
import {
  PlusIcon,
  EyeIcon,
  EyeSlashIcon,
  FunnelIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";

const selectClasses =
  "w-full bg-surface border border-border rounded-md text-sm text-text px-3 py-2 transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-brand-600/30 focus:border-brand-600 hover:border-border-strong";
const fieldLabel = "block text-xs font-medium text-text-muted mb-1";
import { getLocales } from "../../services/locales.service";
import { getPerfiles } from "../../services/perfiles.service";
import { getPerfilesByUsuario } from "../../services/usuarioperfil.service";
import type { UsuarioFilters } from "../../services/usuarios.service";
import { formatMiles } from "../../utils/utils";

import type { Usuario } from "../../types";

interface Pagination {
  totalItems: number;
}

interface UsuariosListProps {
  usuarios: Usuario[];
  onDelete?: (item: Usuario) => void;
  onEdit?: (item: Usuario) => void;
  onCreate?: () => void;
  pagination?: Pagination;
  onSearch: (value: string) => void;
  searchTerm: string;
  onKeyPress?: React.KeyboardEventHandler<HTMLInputElement>;
  onSearchSubmit: () => void;
  isModalOpen: boolean;
  onCloseModal: () => void;
  currentUser?: Usuario | null;
  onSubmit: (formData: Usuario) => void;
  editingPassword: boolean;
  setEditingPassword: (value: boolean) => void;
  sortKey?: string;
  sortOrder?: "asc" | "desc";
  onSort?: (key: string, order: "asc" | "desc") => void;
  filters?: UsuarioFilters;
  onFiltersChange?: (filters: UsuarioFilters) => void;
  filterLocales?: { LocalId: number; LocalNombre: string }[];
  showFilters?: boolean;
  onToggleFilters?: () => void;
}

export default function UsuariosList({
  usuarios,
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
  currentUser,
  onSubmit,
  editingPassword,
  setEditingPassword,
  sortKey,
  sortOrder,
  onSort,
  filters,
  onFiltersChange,
  filterLocales = [],
  showFilters = false,
  onToggleFilters,
}: UsuariosListProps) {
  const activeFilters = filters || {};
  const activeFilterCount = Object.values(activeFilters).filter(
    (v) => v !== undefined && v !== "" && v !== null
  ).length;

  const updateFilter = <K extends keyof UsuarioFilters>(
    key: K,
    value: UsuarioFilters[K] | ""
  ) => {
    if (!onFiltersChange) return;
    const next: UsuarioFilters = { ...activeFilters };
    if (value === "" || value === undefined) {
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
  const [formData, setFormData] = useState({
    id: "",
    UsuarioId: "",
    UsuarioContrasena: "",
    UsuarioNombre: "",
    UsuarioApellido: "",
    UsuarioCorreo: "",
    UsuarioIsAdmin: "N" as "S" | "N",
    UsuarioEstado: "A" as "A" | "I",
    LocalId: 1,
  });
  const [showPassword, setShowPassword] = useState(false);
  const [locales, setLocales] = useState<
    { LocalId: number; LocalNombre: string }[]
  >([]);
  const [perfiles, setPerfiles] = useState<
    { PerfilId: number; PerfilDescripcion: string }[]
  >([]);
  const [perfilesSeleccionados, setPerfilesSeleccionados] = useState<number[]>(
    []
  );

  // Inicializar formData cuando currentUser cambia
  useEffect(() => {
    if (currentUser) {
      setFormData({
        id: String(currentUser.id ?? currentUser.UsuarioId),
        UsuarioId: String(currentUser.UsuarioId),
        UsuarioContrasena: "", // No cargamos la contraseña por seguridad
        UsuarioNombre: currentUser.UsuarioNombre,
        UsuarioApellido: currentUser.UsuarioApellido,
        UsuarioCorreo: currentUser.UsuarioCorreo,
        UsuarioIsAdmin: currentUser.UsuarioIsAdmin,
        UsuarioEstado: currentUser.UsuarioEstado,
        LocalId: currentUser.LocalId,
      });
      // setEditingPassword(false); // Resetear estado de edición de contraseña
    } else {
      // Resetear para nuevo usuario
      setFormData({
        id: "",
        UsuarioId: "",
        UsuarioContrasena: "",
        UsuarioNombre: "",
        UsuarioApellido: "",
        UsuarioCorreo: "",
        UsuarioIsAdmin: "N",
        UsuarioEstado: "A",
        LocalId: 1,
      });
    }
    getLocales(1, 200).then((res) => {
      setLocales(res.data || []);
    });
  }, [currentUser, setEditingPassword]);

  useEffect(() => {
    if (isModalOpen) {
      getPerfiles(1, 200).then((res) => setPerfiles(res.data || []));
      if (currentUser) {
        getPerfilesByUsuario(currentUser.UsuarioId).then((res) => {
          const perfilesArray = Array.isArray(res) ? res : res.data;
          setPerfilesSeleccionados(
            Array.isArray(perfilesArray)
              ? perfilesArray.map((p) => p.PerfilId)
              : []
          );
        });
      } else {
        setPerfilesSeleccionados([]);
      }
    }
  }, [isModalOpen, currentUser]);

  // Manejar cambios en el formulario
  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  // Enviar formulario
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    onSubmit({ ...formData, perfilesSeleccionados });
  };

  // Determinar el estado visual
  const getEstadoVisual = (estado: unknown) => {
    return (estado as string) === "A" ? "Activo" : "Inactivo";
  };

  // Determinar el color del estado
  const getEstadoColor = (estado: unknown) => {
    return (estado as string) === "A" ? "bg-success-500" : "bg-danger-500";
  };

  const handlePerfilChange = (perfilId: number) => {
    setPerfilesSeleccionados((prev) =>
      prev.includes(perfilId)
        ? prev.filter((id) => id !== perfilId)
        : [...prev, perfilId]
    );
  };

  // Configuración de columnas para la tabla
  const columns = [
    {
      key: "UsuarioId",
      label: "Usuario",
    },
    {
      key: "UsuarioNombre",
      label: "Nombre",
      render: (item: Usuario) =>
        `${item.UsuarioNombre} ${item.UsuarioApellido}`,
    },
    {
      key: "UsuarioCorreo",
      label: "Email",
      render: (item: Usuario) => item.UsuarioCorreo || "-",
    },
    {
      key: "UsuarioIsAdmin",
      label: "Admin",
      render: (item: Usuario) => (item.UsuarioIsAdmin === "S" ? "Sí" : "No"),
    },
    {
      key: "UsuarioEstado",
      label: "Estado",
      status: true,
    },
    {
      key: "LocalNombre",
      label: "Local",
      render: (item: Usuario) => item.LocalNombre || item.LocalId || "-",
    },
  ];

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
            placeholder="Buscar usuarios"
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
              Nuevo Usuario
            </Button>
          )}
        </div>
      </div>
      {onFiltersChange && showFilters && (
        <div className="bg-surface-sunken border border-border rounded-lg p-4 mb-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className={fieldLabel}>Estado</label>
              <select
                value={activeFilters.estado || ""}
                onChange={(e) =>
                  updateFilter(
                    "estado",
                    (e.target.value as UsuarioFilters["estado"]) || ""
                  )
                }
                className={selectClasses}
              >
                <option value="">Todos</option>
                <option value="A">Activo</option>
                <option value="I">Inactivo</option>
              </select>
            </div>
            <div>
              <label className={fieldLabel}>Administrador</label>
              <select
                value={activeFilters.admin || ""}
                onChange={(e) =>
                  updateFilter(
                    "admin",
                    (e.target.value as UsuarioFilters["admin"]) || ""
                  )
                }
                className={selectClasses}
              >
                <option value="">Todos</option>
                <option value="S">Sí</option>
                <option value="N">No</option>
              </select>
            </div>
            <div>
              <label className={fieldLabel}>Local</label>
              <select
                value={activeFilters.localId ?? ""}
                onChange={(e) => updateFilter("localId", e.target.value || "")}
                className={selectClasses}
              >
                <option value="">Todos</option>
                {filterLocales.map((l) => (
                  <option key={l.LocalId} value={l.LocalId}>
                    {l.LocalNombre}
                  </option>
                ))}
              </select>
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
          Mostrando {formatMiles(usuarios.length)} de{" "}
          {formatMiles(pagination?.totalItems || 0)} usuarios
        </div>
      </div>

      {/* Tabla de usuarios usando el componente DataTable */}
      <DataTable<Usuario>
        columns={columns}
        data={usuarios}
        onEdit={onEdit}
        onDelete={onDelete}
        emptyMessage="No se encontraron usuarios"
        getStatusColor={getEstadoColor}
        getStatusText={getEstadoVisual}
        sortKey={sortKey}
        sortOrder={sortOrder}
        onSort={onSort}
      />

      {/* Modal para crear/editar */}
      <Modal
        open={isModalOpen}
        onClose={onCloseModal}
        size="2xl"
        title={
          currentUser
            ? `Editar usuario: ${currentUser.UsuarioId}`
            : "Crear nuevo usuario"
        }
        footer={
          <>
            <Button variant="secondary" onClick={onCloseModal}>
              Cancelar
            </Button>
            <Button type="submit" form="user-form">
              {currentUser ? "Actualizar" : "Crear"}
            </Button>
          </>
        }
      >
        <form
          id="user-form"
          onSubmit={handleSubmit}
          className="grid grid-cols-1 sm:grid-cols-2 gap-4"
        >
          {!currentUser && (
            <TextInput
              label="ID de Usuario"
              name="UsuarioId"
              value={formData.UsuarioId}
              onChange={handleInputChange}
              required
            />
          )}
          <TextInput
            label="Nombre"
            name="UsuarioNombre"
            value={formData.UsuarioNombre}
            onChange={(e) =>
              handleInputChange({
                target: { name: "UsuarioNombre", value: e.target.value.toUpperCase() },
              } as React.ChangeEvent<HTMLInputElement>)
            }
            className="uppercase"
            required
          />
          <TextInput
            label="Apellido"
            name="UsuarioApellido"
            value={formData.UsuarioApellido}
            onChange={(e) =>
              handleInputChange({
                target: { name: "UsuarioApellido", value: e.target.value.toUpperCase() },
              } as React.ChangeEvent<HTMLInputElement>)
            }
            className="uppercase"
          />
          <TextInput
            label="Email"
            type="email"
            name="UsuarioCorreo"
            value={formData.UsuarioCorreo}
            onChange={handleInputChange}
          />
          <div>
            <label htmlFor="LocalId" className={fieldLabel}>
              Local *
            </label>
            <select
              name="LocalId"
              id="LocalId"
              value={formData.LocalId}
              onChange={handleInputChange}
              className={selectClasses}
              required
            >
              <option value="">Seleccione un local</option>
              {locales.map((local) => (
                <option key={local.LocalId} value={local.LocalId}>
                  {local.LocalNombre}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="UsuarioIsAdmin" className={fieldLabel}>
              ¿Es administrador?
            </label>
            <select
              name="UsuarioIsAdmin"
              id="UsuarioIsAdmin"
              value={formData.UsuarioIsAdmin}
              onChange={handleInputChange}
              className={selectClasses}
            >
              <option value="N">No</option>
              <option value="S">Sí</option>
            </select>
          </div>
          <div>
            <label htmlFor="UsuarioEstado" className={fieldLabel}>
              Estado
            </label>
            <select
              name="UsuarioEstado"
              id="UsuarioEstado"
              value={formData.UsuarioEstado}
              onChange={handleInputChange}
              className={selectClasses}
            >
              <option value="A">Activo</option>
              <option value="I">Inactivo</option>
            </select>
          </div>

          {currentUser && !editingPassword && (
            <div className="flex items-end">
              <button
                type="button"
                onClick={() => setEditingPassword(true)}
                className="text-brand-700 hover:text-brand-800 text-sm font-medium cursor-pointer"
              >
                Cambiar contraseña
              </button>
            </div>
          )}
          {(!currentUser || editingPassword) && (
            <TextInput
              label={
                currentUser
                  ? "Contraseña (dejar en blanco para no cambiar)"
                  : "Contraseña *"
              }
              type={showPassword ? "text" : "password"}
              name="UsuarioContrasena"
              value={formData.UsuarioContrasena}
              onChange={handleInputChange}
              required={!currentUser}
              placeholder={currentUser ? "Nueva contraseña" : "Contraseña"}
              rightSlot={
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={
                    showPassword ? "Ocultar contraseña" : "Mostrar contraseña"
                  }
                  className="p-1 text-text-subtle hover:text-text-muted cursor-pointer"
                >
                  {showPassword ? (
                    <EyeSlashIcon className="h-5 w-5" />
                  ) : (
                    <EyeIcon className="h-5 w-5" />
                  )}
                </button>
              }
            />
          )}
          <div className="sm:col-span-2">
            <label className={fieldLabel}>Perfiles</label>
            <div className="flex flex-col gap-2 mt-1">
              {perfiles.map((perfil) => {
                const checkboxId = `perfil-checkbox-${perfil.PerfilId}`;
                return (
                  <div className="flex items-center" key={perfil.PerfilId}>
                    <input
                      id={checkboxId}
                      type="checkbox"
                      checked={perfilesSeleccionados.includes(perfil.PerfilId)}
                      onChange={() => handlePerfilChange(perfil.PerfilId)}
                      className="w-4 h-4 text-brand-600 bg-surface border-border rounded focus:ring-brand-500 focus:ring-2 cursor-pointer"
                    />
                    <label
                      htmlFor={checkboxId}
                      className="ms-2 text-sm font-medium text-text cursor-pointer"
                    >
                      {perfil.PerfilDescripcion}
                    </label>
                  </div>
                );
              })}
            </div>
          </div>
        </form>
      </Modal>
    </>
  );
}
