import { useEffect } from "react";
import {
  Disclosure,
  DisclosureButton,
  DisclosurePanel,
} from "@headlessui/react";
import {
  XMarkIcon,
  ChevronDownIcon,
  HomeIcon,
  KeyIcon,
  UsersIcon,
  PencilSquareIcon,
  BanknotesIcon,
  CurrencyDollarIcon,
  ArchiveBoxIcon,
  RectangleGroupIcon,
  CubeIcon,
  WrenchIcon,
  LockClosedIcon,
  ChartBarIcon,
  ShoppingCartIcon,
  TruckIcon,
  UserGroupIcon,
} from "@heroicons/react/24/outline";
import type { ComponentType } from "react";
import { Link, useLocation } from "react-router-dom";
import type { Dispatch, SetStateAction } from "react";
import { useAuth } from "../../contexts/useAuth";

interface NavigationChild {
  name: string;
  href: string;
  // Nombre del menú en RBAC. Si se define, el ítem solo se muestra si el
  // usuario tiene permiso de lectura sobre ese menú (admin ve todo).
  permiso?: string;
}

interface NavigationItem {
  name: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  children?: NavigationChild[];
  permiso?: string;
  // Tipos de empresa donde aplica este ítem. undefined = todas.
  // 'M' = minorista, 'D' = distribuidora.
  empresaTipos?: string[];
}

interface NavigationSection {
  label: string;
  items: NavigationItem[];
  // Tipos de empresa donde aplica esta sección. undefined = todas.
  // 'M' = minorista, 'D' = distribuidora.
  empresaTipos?: string[];
}

const sections: NavigationSection[] = [
  {
    label: "Operación",
    items: [
      { name: "Dashboard", href: "/dashboard", icon: HomeIcon },
      {
        name: "Apertura/Cierre de Caja",
        href: "/apertura-cierre-caja",
        icon: LockClosedIcon,
        permiso: "APERTURACAJA",
      },
      { name: "Ventas", href: "/ventas", icon: CurrencyDollarIcon, permiso: "NUEVAVENTA" },
      {
        name: "Deliveries",
        href: "/deliveries",
        icon: TruckIcon,
        permiso: "DELIVERIES",
        empresaTipos: ["M"], // delivery es solo de minorista
      },
      { name: "Compras", href: "/compras", icon: ShoppingCartIcon, permiso: "NUEVACOMPRA" },
      {
        name: "Cobro de Créditos",
        href: "/credito-pagos",
        icon: BanknotesIcon,
        permiso: "COBROCREDITO",
      },
    ],
  },
  {
    label: "Catálogo",
    items: [
      { name: "Productos", href: "/products", icon: CubeIcon, permiso: "PRODUCTOS" },
      { name: "Combos", href: "/combos", icon: RectangleGroupIcon, permiso: "COMBOS" },
      { name: "Almacenes", href: "/almacenes", icon: ArchiveBoxIcon, permiso: "ALMACENES" },
      { name: "Clientes", href: "/customers", icon: UsersIcon, permiso: "CLIENTES" },
    ],
  },
  {
    label: "Análisis",
    items: [
      { name: "Reportes", href: "/reportes", icon: ChartBarIcon, permiso: "REPORTES" },
      {
        name: "Registro Diario",
        href: "/movements",
        icon: PencilSquareIcon,
        children: [
          { name: "Cajas", href: "/movements/cajas", permiso: "CAJAS" },
          { name: "Tipos de Gasto", href: "/movements/tiposgasto", permiso: "TIPOSGASTO" },
          { name: "Registro Diario Caja", href: "/movements/summary", permiso: "REGISTRODIARIOCAJA" },
        ],
      },
    ],
  },
  {
    label: "Distribuidora",
    empresaTipos: ["D"], // solo visible cuando la empresa activa es distribuidora
    items: [
      { name: "Vendedores", href: "/vendedores", icon: UserGroupIcon, permiso: "VENDEDORES" },
      { name: "Vehículos", href: "/flota/vehiculos", icon: TruckIcon, permiso: "VEHICULOS" },
      { name: "Choferes", href: "/flota/choferes", icon: UserGroupIcon, permiso: "CHOFERES" },
      { name: "Rutas de Reparto", href: "/rutas", icon: TruckIcon },
    ],
  },
  {
    label: "Administración",
    items: [
      {
        name: "Modificaciones",
        href: "/modifications",
        icon: WrenchIcon,
        children: [
          { name: "Facturas", href: "/facturas", permiso: "FACTURAS" },
          { name: "Ventas", href: "/modifications/ventas", permiso: "VENTAS" },
          { name: "Compras", href: "/modifications/compras", permiso: "COMPRAS" },
          { name: "Inventario", href: "/inventario", permiso: "INVENTARIO" },
        ],
      },
      {
        name: "Control de Acceso",
        href: "/access-control",
        icon: KeyIcon,
        children: [
          { name: "Empresas", href: "/empresas", permiso: "LOCALES" },
          { name: "Locales", href: "/locales", permiso: "LOCALES" },
          { name: "Usuarios", href: "/users", permiso: "USUARIOS" },
          { name: "Perfiles", href: "/perfiles", permiso: "PERFILES" },
          { name: "Menús", href: "/menus", permiso: "MENUS" },
        ],
      },
    ],
  },
];

interface NavItemLeafProps {
  name: string;
  href: string;
  icon?: ComponentType<{ className?: string }>;
  isActive: boolean;
  indent?: boolean;
  onNavigate?: () => void;
}

function NavItemLeaf({
  name,
  href,
  icon: Icon,
  isActive,
  indent = false,
  onNavigate,
}: NavItemLeafProps) {
  return (
    <Link
      to={href}
      onClick={onNavigate}
      aria-current={isActive ? "page" : undefined}
      className={[
        "group relative flex items-center gap-3 rounded-md text-sm font-medium transition-colors duration-150",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/60",
        indent ? "ml-7 pl-3 pr-3 py-1.5" : "px-3 py-2",
        isActive
          ? "bg-sidebar-active text-sidebar-text-active shadow-sm"
          : "text-sidebar-text hover:bg-sidebar-hover hover:text-white",
      ].join(" ")}
    >
      {isActive && !indent && (
        <span
          aria-hidden="true"
          className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r bg-success-200"
        />
      )}
      {Icon && (
        <Icon
          className={`h-5 w-5 shrink-0 ${
            isActive ? "text-white" : "text-sidebar-text/80 group-hover:text-white"
          }`}
        />
      )}
      <span className="truncate">{name}</span>
    </Link>
  );
}

interface NavGroupProps {
  item: NavigationItem;
  onNavigate?: () => void;
}

function NavGroup({ item, onNavigate }: NavGroupProps) {
  const location = useLocation();
  const Icon = item.icon;
  const childActive = !!item.children?.some(
    (c) => location.pathname === c.href || location.pathname.startsWith(c.href + "/")
  );
  const isOpen = childActive;

  return (
    <Disclosure as="div" defaultOpen={isOpen}>
      {({ open }) => (
        <>
          <DisclosureButton
            className={[
              "group flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-150",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/60",
              childActive
                ? "bg-sidebar-hover text-white"
                : "text-sidebar-text hover:bg-sidebar-hover hover:text-white",
            ].join(" ")}
          >
            <Icon
              className={`h-5 w-5 shrink-0 ${
                childActive
                  ? "text-white"
                  : "text-sidebar-text/80 group-hover:text-white"
              }`}
            />
            <span className="flex-1 text-left truncate">{item.name}</span>
            <ChevronDownIcon
              className={`h-4 w-4 transition-transform duration-200 ${
                open ? "rotate-180" : ""
              } text-sidebar-text/70`}
            />
          </DisclosureButton>
          <DisclosurePanel as="ul" className="mt-1 space-y-0.5">
            {item.children?.map((child) => {
              const isActive = location.pathname === child.href;
              return (
                <li key={child.name}>
                  <NavItemLeaf
                    name={child.name}
                    href={child.href}
                    isActive={isActive}
                    indent
                    onNavigate={onNavigate}
                  />
                </li>
              );
            })}
          </DisclosurePanel>
        </>
      )}
    </Disclosure>
  );
}

interface SidebarContentProps {
  onNavigate?: () => void;
}

function SidebarContent({ onNavigate }: SidebarContentProps) {
  const location = useLocation();
  const { empresaActiva, user, permisos } = useAuth();
  const tipoActivo = empresaActiva?.EmpresaTipo;

  // ¿El usuario puede ver un ítem? Sin permiso definido = visible (ej. Dashboard).
  // El admin ve todo. Para el resto se exige permiso de lectura sobre el menú.
  const puedeVer = (permiso?: string) => {
    if (!permiso) return true;
    if (user?.isAdmin === "S") return true;
    return !!permisos?.[permiso]?.leer;
  };

  // Construye las secciones visibles: filtra por tipo de empresa, por permiso,
  // y oculta grupos/secciones que queden sin ítems.
  const seccionesVisibles = sections
    .filter(
      (s) => !s.empresaTipos || (tipoActivo != null && s.empresaTipos.includes(tipoActivo))
    )
    .map((section) => {
      const items = section.items
        .map((item) => {
          // Filtro por tipo de empresa a nivel ítem (ej. Deliveries = solo 'M').
          if (
            item.empresaTipos &&
            !(tipoActivo != null && item.empresaTipos.includes(tipoActivo))
          ) {
            return null;
          }
          if (item.children) {
            const children = item.children.filter((c) => puedeVer(c.permiso));
            return children.length ? { ...item, children } : null;
          }
          return puedeVer(item.permiso) ? item : null;
        })
        .filter((i): i is NavigationItem => i !== null);
      return { ...section, items };
    })
    .filter((section) => section.items.length > 0);

  return (
    <nav className="py-4" aria-label="Navegación principal">
      <div className="px-3 space-y-6">
      {seccionesVisibles.map((section) => (
        <div key={section.label}>
          <div className="px-3 mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-sidebar-section">
            {section.label}
          </div>
          <ul className="space-y-0.5">
            {section.items.map((item) => {
              if (item.children) {
                return (
                  <li key={item.name}>
                    <NavGroup item={item} onNavigate={onNavigate} />
                  </li>
                );
              }
              const isActive =
                location.pathname === item.href ||
                location.pathname.startsWith(item.href + "/");
              return (
                <li key={item.name}>
                  <NavItemLeaf
                    name={item.name}
                    href={item.href}
                    icon={item.icon}
                    isActive={isActive}
                    onNavigate={onNavigate}
                  />
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      </div>
    </nav>
  );
}

interface SidebarProps {
  mobileOpen: boolean;
  setMobileOpen: Dispatch<SetStateAction<boolean>>;
}

export default function Sidebar({ mobileOpen, setMobileOpen }: SidebarProps) {
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [mobileOpen, setMobileOpen]);

  return (
    <>
      {/* Mobile sidebar */}
      <div className="lg:hidden">
        <div
          aria-hidden="true"
          onClick={() => setMobileOpen(false)}
          className={`fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-200 ${
            mobileOpen
              ? "opacity-100"
              : "opacity-0 pointer-events-none"
          }`}
        />
        <aside
          role="dialog"
          aria-modal="true"
          aria-label="Menú de navegación"
          className={`fixed inset-y-0 left-0 z-50 w-72 bg-sidebar transform transition-transform duration-200 ease-out shadow-xl ${
            mobileOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex h-16 shrink-0 items-center justify-between px-5 border-b border-white/10">
            <span className="font-display text-lg font-semibold tracking-wide text-white">
              Salvatore
            </span>
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              aria-label="Cerrar menú"
              className="rounded-md p-1.5 text-sidebar-text hover:text-white hover:bg-sidebar-hover transition-colors duration-150 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/60"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>
          <div className="h-[calc(100%-4rem)] overflow-y-auto">
            <SidebarContent onNavigate={() => setMobileOpen(false)} />
          </div>
        </aside>
      </div>

      {/* Desktop sidebar */}
      <aside
        className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:w-64 lg:flex lg:flex-col bg-sidebar pt-16"
        aria-label="Navegación lateral"
      >
        <div className="flex-1 overflow-y-auto">
          <SidebarContent />
        </div>
      </aside>
    </>
  );
}
