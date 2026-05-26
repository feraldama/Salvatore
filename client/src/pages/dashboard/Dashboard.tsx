import { useEffect, useState } from "react";
import type { ComponentType } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  CurrencyDollarIcon,
  UsersIcon,
  CubeIcon,
  UserGroupIcon,
  PlusIcon,
  BanknotesIcon,
  LockClosedIcon,
  ChartBarIcon,
} from "@heroicons/react/24/outline";
import { useAuth } from "../../contexts/useAuth";
import {
  Button,
  Card,
  StatCard,
  ErrorState,
} from "../../components/common/ui";
import { getVentasPaginated } from "../../services/venta.service";
import { getClientes } from "../../services/clientes.service";
import { getProductosPaginated } from "../../services/productos.service";
import { getUsuarios } from "../../services/usuarios.service";

interface Stats {
  ventasHoy: number;
  clientes: number;
  productos: number;
  usuariosActivos: number;
}

function todayISO(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

interface PaginatedLike {
  pagination?: { totalItems?: number };
}

function totalFrom(resp: PaginatedLike | undefined): number {
  return resp?.pagination?.totalItems ?? 0;
}

interface QuickActionProps {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description: string;
  to: string;
  tone?: "brand" | "success" | "warning" | "info";
}

function QuickAction({
  icon: Icon,
  title,
  description,
  to,
  tone = "brand",
}: QuickActionProps) {
  const toneClasses = {
    brand: "bg-brand-50 text-brand-700",
    success: "bg-success-50 text-success-700",
    warning: "bg-warning-50 text-warning-700",
    info: "bg-info-50 text-info-700",
  }[tone];

  return (
    <Link
      to={to}
      className="group flex items-center gap-3 px-5 py-4 transition-colors hover:bg-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:bg-surface-muted"
    >
      <span
        className={`flex items-center justify-center w-10 h-10 rounded-md shrink-0 ${toneClasses}`}
      >
        <Icon className="w-5 h-5" />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-medium text-text truncate group-hover:text-brand-700 transition-colors">
          {title}
        </p>
        <p className="text-xs text-text-muted truncate">{description}</p>
      </div>
    </Link>
  );
}

function StatSkeleton() {
  return (
    <div className="relative bg-surface rounded-lg border border-border overflow-hidden p-5 animate-pulse">
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-0 w-1 bg-surface-muted"
      />
      <div className="space-y-3">
        <div className="h-3 w-24 bg-surface-muted rounded" />
        <div className="h-8 w-16 bg-surface-muted rounded" />
        <div className="h-3 w-32 bg-surface-muted rounded" />
      </div>
    </div>
  );
}

function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    const today = todayISO();

    setLoading(true);
    setError(null);

    Promise.all([
      getVentasPaginated(1, 1, undefined, undefined, {
        fechaDesde: today,
        fechaHasta: today,
      }),
      getClientes(1, 1),
      getProductosPaginated(1, 1),
      getUsuarios(1, 1, undefined, undefined, { estado: "A" }),
    ])
      .then(([ventas, clientes, productos, usuarios]) => {
        if (!active) return;
        setStats({
          ventasHoy: totalFrom(ventas),
          clientes: totalFrom(clientes),
          productos: totalFrom(productos),
          usuariosActivos: totalFrom(usuarios),
        });
      })
      .catch((err) => {
        if (!active) return;
        const message =
          (err as { message?: string })?.message ??
          "No se pudieron cargar las estadísticas";
        setError(message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [reloadKey]);

  const handleRetry = () => setReloadKey((k) => k + 1);

  return (
    <div className="space-y-6">
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-text">
            Panel de Control
          </h1>
          {user && (
            <p className="text-sm text-text-muted mt-1">
              Hola,{" "}
              <span className="font-medium text-text">{user.nombre}</span>.
              Resumen de actividad del día.
            </p>
          )}
        </div>
        <Button leftIcon={PlusIcon} onClick={() => navigate("/ventas")}>
          Nueva venta
        </Button>
      </header>

      <section
        aria-label="Resumen de métricas"
        className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4"
      >
        {loading && (
          <>
            <StatSkeleton />
            <StatSkeleton />
            <StatSkeleton />
            <StatSkeleton />
          </>
        )}

        {!loading && error && (
          <div className="sm:col-span-2 xl:col-span-4">
            <ErrorState
              title="No pudimos cargar las estadísticas"
              message={error}
              onRetry={handleRetry}
            />
          </div>
        )}

        {!loading && !error && stats && (
          <>
            <StatCard
              label="Ventas hoy"
              value={stats.ventasHoy}
              tone="success"
              icon={CurrencyDollarIcon}
              hint="ventas registradas"
              onClick={() => navigate("/ventas")}
            />
            <StatCard
              label="Clientes"
              value={stats.clientes}
              tone="brand"
              icon={UsersIcon}
              hint="en el sistema"
              onClick={() => navigate("/customers")}
            />
            <StatCard
              label="Productos"
              value={stats.productos}
              tone="info"
              icon={CubeIcon}
              hint="en catálogo"
              onClick={() => navigate("/products")}
            />
            <StatCard
              label="Usuarios activos"
              value={stats.usuariosActivos}
              tone="warning"
              icon={UserGroupIcon}
              hint="con acceso al sistema"
              onClick={() => navigate("/users")}
            />
          </>
        )}
      </section>

      <Card padding="none">
        <div className="px-5 pt-5 pb-4">
          <h3 className="text-lg font-semibold text-text">Acceso rápido</h3>
          <p className="mt-0.5 text-sm text-text-muted">
            Las acciones más frecuentes del día a día
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-border border-t border-border">
          <QuickAction
            icon={PlusIcon}
            title="Nueva venta"
            description="Registrar una venta de mostrador"
            to="/ventas"
            tone="success"
          />
          <QuickAction
            icon={BanknotesIcon}
            title="Cobrar crédito"
            description="Recibir pago de cuenta corriente"
            to="/credito-pagos"
            tone="brand"
          />
          <QuickAction
            icon={LockClosedIcon}
            title="Apertura / Cierre"
            description="Operar caja del local"
            to="/apertura-cierre-caja"
            tone="warning"
          />
          <QuickAction
            icon={ChartBarIcon}
            title="Reportes"
            description="Resumen de ventas y movimientos"
            to="/reportes"
            tone="info"
          />
        </div>
      </Card>
    </div>
  );
}

export default Dashboard;
