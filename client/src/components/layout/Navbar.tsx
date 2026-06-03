import {
  Menu,
  MenuButton,
  MenuItem,
  MenuItems,
} from "@headlessui/react";
import {
  Bars3Icon,
  ChevronDownIcon,
  ArrowRightOnRectangleIcon,
  UserCircleIcon,
  Cog6ToothIcon,
  BuildingStorefrontIcon,
  CheckIcon,
} from "@heroicons/react/24/outline";
import { useAuth } from "../../contexts/useAuth";
import { Link, useNavigate } from "react-router-dom";
import type { Dispatch, SetStateAction } from "react";

interface NavbarProps {
  setMobileOpen: Dispatch<SetStateAction<boolean>>;
}

function getInitials(name?: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

// Selector de empresa activa. Se muestra solo si el usuario tiene acceso a más de una.
function EmpresaSwitcher() {
  const { empresas, empresaActiva, setEmpresaActiva } = useAuth();
  if (empresas.length <= 1) {
    // Una sola empresa: mostrar como etiqueta estática, sin dropdown.
    return empresaActiva ? (
      <div className="hidden sm:flex items-center gap-2 rounded-lg border border-border bg-surface-muted px-3 py-1.5">
        <BuildingStorefrontIcon className="h-4 w-4 text-brand-700" />
        <span className="text-sm font-medium text-text">{empresaActiva.EmpresaNombre}</span>
      </div>
    ) : null;
  }

  return (
    <Menu as="div" className="relative">
      <MenuButton className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 hover:bg-surface-muted transition-colors duration-150 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30">
        <BuildingStorefrontIcon className="h-4 w-4 text-brand-700 shrink-0" />
        <span className="text-sm font-medium text-text max-w-[160px] truncate">
          {empresaActiva?.EmpresaNombre ?? "Seleccionar empresa"}
        </span>
        <ChevronDownIcon className="h-4 w-4 text-text-muted shrink-0" />
      </MenuButton>
      <MenuItems
        transition
        anchor="bottom start"
        className="z-50 mt-2 w-64 origin-top-left rounded-lg bg-surface border border-border py-1 shadow-lg focus:outline-none data-closed:scale-95 data-closed:opacity-0 transition duration-150 ease-out"
      >
        <div className="px-3 py-2 border-b border-border">
          <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted">
            Empresa activa
          </p>
        </div>
        {empresas.map((emp) => {
          const isActive = empresaActiva?.EmpresaId === emp.EmpresaId;
          return (
            <MenuItem key={emp.EmpresaId}>
              <button
                onClick={() => setEmpresaActiva(emp.EmpresaId)}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-text data-focus:bg-surface-muted cursor-pointer"
              >
                <BuildingStorefrontIcon className="h-4 w-4 text-text-muted shrink-0" />
                <span className="flex-1 text-left truncate">{emp.EmpresaNombre}</span>
                <span className="text-[10px] uppercase text-text-muted">
                  {emp.EmpresaTipo === "D" ? "Distrib." : "Minor."}
                </span>
                {isActive && <CheckIcon className="h-4 w-4 text-brand-700 shrink-0" />}
              </button>
            </MenuItem>
          );
        })}
      </MenuItems>
    </Menu>
  );
}

export default function Navbar({ setMobileOpen }: NavbarProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const initials = getInitials(user?.nombre);

  return (
    <header
      className="sticky top-0 z-40 bg-surface border-b border-border"
      role="banner"
    >
      <div className="flex h-16 items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Abrir menú"
            className="lg:hidden inline-flex items-center justify-center rounded-md p-2 text-text-muted hover:text-text hover:bg-surface-muted transition-colors duration-150 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30"
          >
            <Bars3Icon className="h-5 w-5" />
          </button>

          <Link
            to="/dashboard"
            className="flex items-center gap-2.5 group"
            aria-label="Ir al inicio"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-700 text-white shadow-sm group-hover:bg-brand-800 transition-colors duration-150">
              <BuildingStorefrontIcon className="h-5 w-5" />
            </span>
            <span className="hidden sm:block">
              <span className="font-display block text-base font-semibold leading-tight text-text">
                Salvatore
              </span>
            </span>
          </Link>

          <div className="ml-2 pl-2 sm:border-l sm:border-border">
            <EmpresaSwitcher />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Menu as="div" className="relative">
            <MenuButton
              className="flex items-center gap-2.5 rounded-full pl-2 pr-1 py-1 hover:bg-surface-muted transition-colors duration-150 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30"
              aria-label="Menú de usuario"
            >
              <div className="hidden sm:flex flex-col items-end leading-tight">
                <span className="text-sm font-medium text-text">
                  {user?.nombre ?? "Usuario"}
                </span>
                {user?.isAdmin === "S" && (
                  <span className="text-[10px] uppercase tracking-wide text-brand-700 font-semibold">
                    Administrador
                  </span>
                )}
              </div>
              <span
                aria-hidden="true"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-brand-700 font-semibold text-sm"
              >
                {initials}
              </span>
              <ChevronDownIcon className="h-4 w-4 text-text-muted hidden sm:block" />
            </MenuButton>

            <MenuItems
              transition
              anchor="bottom end"
              className="z-50 mt-2 w-56 origin-top-right rounded-lg bg-surface border border-border py-1 shadow-lg focus:outline-none data-closed:scale-95 data-closed:opacity-0 transition duration-150 ease-out"
            >
              <div className="px-3 py-2 border-b border-border">
                <p className="text-sm font-medium text-text truncate">
                  {user?.nombre ?? "Usuario"}
                </p>
                {user?.email && (
                  <p className="text-xs text-text-muted truncate">
                    {user.email}
                  </p>
                )}
              </div>

              <MenuItem>
                <Link
                  to="/profile"
                  className="flex items-center gap-2 px-3 py-2 text-sm text-text data-focus:bg-surface-muted data-focus:text-text"
                >
                  <UserCircleIcon className="h-4 w-4 text-text-muted" />
                  Tu perfil
                </Link>
              </MenuItem>
              <MenuItem>
                <Link
                  to="/configuraciones"
                  className="flex items-center gap-2 px-3 py-2 text-sm text-text data-focus:bg-surface-muted data-focus:text-text"
                >
                  <Cog6ToothIcon className="h-4 w-4 text-text-muted" />
                  Configuración
                </Link>
              </MenuItem>

              <div className="my-1 border-t border-border" />

              <MenuItem>
                <button
                  onClick={handleLogout}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-danger-700 data-focus:bg-danger-50 cursor-pointer"
                >
                  <ArrowRightOnRectangleIcon className="h-4 w-4" />
                  Cerrar sesión
                </button>
              </MenuItem>
            </MenuItems>
          </Menu>
        </div>
      </div>
    </header>
  );
}
