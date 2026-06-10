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
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";
import { useAuth } from "../../contexts/useAuth";
import { usePermiso } from "../../hooks/usePermiso";
import {
  Button,
  Card,
  StatCard,
  ErrorState,
} from "../../components/common/ui";
import {
  getVentasPaginated,
  getDeudasPendientes,
  getVentasPorDia,
  type DeudaCliente,
  type VentaPorDia,
} from "../../services/venta.service";
import { getClientes } from "../../services/clientes.service";
import {
  getProductosPaginated,
  getProductosStockBajo,
  type ProductoStockBajoRow,
} from "../../services/productos.service";
import { getUsuarios } from "../../services/usuarios.service";
import {
  getResumenEmpresas,
  type ResumenEmpresa,
} from "../../services/dashboard.service";
import { formatMiles } from "../../utils/utils";
import SalesTrendChart from "../../components/dashboard/SalesTrendChart";
import ResumenEmpresas from "../../components/dashboard/ResumenEmpresas";

// Días que abarca la tendencia de ventas del dashboard.
const TREND_DAYS = 30;

// Umbral global de respaldo (en cajas) para productos sin mínimo propio.
// 0 = solo alerta por mínimo cargado o stock negativo (señal más limpia).
// Subilo si querés que el umbral global cubra todo el catálogo.
const UMBRAL_GLOBAL_STOCK = 0;

interface Stats {
  ventasHoy: number;
  clientes: number;
  productos: number;
  usuariosActivos: number;
  totalPorCobrar: number;
  topDeudores: DeudaCliente[];
  stockBajoTotal: number;
  stockBajoTop: ProductoStockBajoRow[];
  ventasPorDia: VentaPorDia[];
}

function toISO(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function todayISO(): string {
  return toISO(new Date());
}

function daysAgoISO(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return toISO(d);
}

// Rellena los días sin ventas con total 0 para una serie continua.
function fillDias(
  rows: VentaPorDia[],
  desde: string,
  hasta: string,
): VentaPorDia[] {
  const byFecha = new Map(rows.map((r) => [r.fecha, r]));
  const out: VentaPorDia[] = [];
  const cur = new Date(desde + "T00:00:00");
  const end = new Date(hasta + "T00:00:00");
  while (cur <= end) {
    const iso = toISO(cur);
    out.push(byFecha.get(iso) ?? { fecha: iso, total: 0, cantidad: 0 });
    cur.setDate(cur.getDate() + 1);
  }
  return out;
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
  const { user, empresas } = useAuth();
  // Reportes/analítica de negocio: solo para roles con permiso (admin siempre).
  // Un vendedor no ve la tendencia de ventas ni el acceso a Reportes.
  const canVerReportes = usePermiso("REPORTES", "leer");
  const navigate = useNavigate();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  // Visión consolidada del dueño: solo se carga cuando el usuario accede a más
  // de una empresa (admin/dueño). Es independiente de la empresa activa.
  const [resumenEmpresas, setResumenEmpresas] = useState<ResumenEmpresa[]>([]);

  useEffect(() => {
    if (empresas.length <= 1) {
      setResumenEmpresas([]);
      return;
    }
    let active = true;
    getResumenEmpresas()
      .then((r) => {
        if (active) setResumenEmpresas(r);
      })
      .catch(() => {
        if (active) setResumenEmpresas([]);
      });
    return () => {
      active = false;
    };
  }, [empresas, reloadKey]);

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
      getDeudasPendientes().catch(() => [] as DeudaCliente[]),
      getProductosStockBajo(UMBRAL_GLOBAL_STOCK).catch(() => ({
        productos: [] as ProductoStockBajoRow[],
        umbralGlobal: UMBRAL_GLOBAL_STOCK,
        total: 0,
      })),
      canVerReportes
        ? getVentasPorDia(daysAgoISO(TREND_DAYS - 1), today).catch(
            () => [] as VentaPorDia[],
          )
        : Promise.resolve([] as VentaPorDia[]),
    ])
      .then(
        ([
          ventas,
          clientes,
          productos,
          usuarios,
          deudas,
          stockBajo,
          ventasDia,
        ]) => {
          if (!active) return;
          const totalPorCobrar = deudas.reduce(
            (acc, d) => acc + Number(d.Saldo || 0),
            0,
          );
          const topDeudores = [...deudas]
            .sort((a, b) => Number(b.Saldo) - Number(a.Saldo))
            .slice(0, 5);
          setStats({
            ventasHoy: totalFrom(ventas),
            clientes: totalFrom(clientes),
            productos: totalFrom(productos),
            usuariosActivos: totalFrom(usuarios),
            totalPorCobrar,
            topDeudores,
            stockBajoTotal: stockBajo.total,
            stockBajoTop: stockBajo.productos.slice(0, 6),
            ventasPorDia: fillDias(
              ventasDia,
              daysAgoISO(TREND_DAYS - 1),
              today,
            ),
          });
        },
      )
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
  }, [reloadKey, canVerReportes]);

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

      {resumenEmpresas.length > 1 && (
        <ResumenEmpresas data={resumenEmpresas} />
      )}

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

      {canVerReportes && !loading && !error && stats && (
        <Card padding="none">
          {(() => {
            const serie = stats.ventasPorDia;
            const totalPeriodo = serie.reduce((a, d) => a + d.total, 0);
            const promedio = serie.length
              ? Math.round(totalPeriodo / serie.length)
              : 0;
            const mejor = serie.reduce<VentaPorDia | null>(
              (best, d) => (!best || d.total > best.total ? d : best),
              null,
            );
            return (
              <>
                <div className="px-5 pt-5 pb-3 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
                  <div>
                    <h3 className="text-lg font-semibold text-text">
                      Tendencia de ventas
                    </h3>
                    <p className="mt-0.5 text-sm text-text-muted">
                      Últimos {TREND_DAYS} días
                    </p>
                  </div>
                  <div className="flex gap-5 text-sm">
                    <div>
                      <p className="text-text-subtle text-xs">Total período</p>
                      <p className="font-semibold text-text tabular-nums">
                        Gs. {formatMiles(totalPeriodo)}
                      </p>
                    </div>
                    <div>
                      <p className="text-text-subtle text-xs">Promedio/día</p>
                      <p className="font-semibold text-text tabular-nums">
                        Gs. {formatMiles(promedio)}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="px-2 pb-3">
                  <SalesTrendChart data={serie} />
                </div>
                {mejor && mejor.total > 0 && (
                  <p className="px-5 pb-4 text-xs text-text-muted">
                    Mejor día: {mejor.fecha.split("-").reverse().join("/")} —{" "}
                    <span className="font-medium text-text">
                      Gs. {formatMiles(mejor.total)}
                    </span>
                  </p>
                )}
              </>
            );
          })()}
        </Card>
      )}

      {!loading &&
        !error &&
        stats &&
        (stats.topDeudores.length > 0 || stats.stockBajoTotal > 0) && (
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {stats.topDeudores.length > 0 && (
              <Card padding="none">
                <div className="px-5 pt-5 pb-4 flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-text">
                      Cuentas por cobrar
                    </h3>
                    <p className="mt-0.5 text-sm text-text-muted">
                      Total pendiente:{" "}
                      <span className="font-semibold text-danger-700 tabular-nums">
                        Gs. {formatMiles(stats.totalPorCobrar)}
                      </span>
                    </p>
                  </div>
                  <Link
                    to="/credito-pagos"
                    className="text-sm font-medium text-brand-700 hover:text-brand-800 hover:underline shrink-0"
                  >
                    Ver todos
                  </Link>
                </div>
                <ul className="border-t border-border divide-y divide-border">
                  {stats.topDeudores.map((d) => (
                    <li
                      key={d.ClienteId}
                      className="flex items-center justify-between gap-3 px-5 py-3"
                    >
                      <span className="text-sm text-text truncate">
                        {d.Cliente}
                      </span>
                      <span className="text-sm font-semibold text-danger-700 tabular-nums shrink-0">
                        Gs. {formatMiles(d.Saldo)}
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            {stats.stockBajoTotal > 0 && (
              <Card padding="none">
                <div className="px-5 pt-5 pb-4 flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2">
                    <ExclamationTriangleIcon className="w-5 h-5 text-warning-600 shrink-0 mt-0.5" />
                    <div>
                      <h3 className="text-lg font-semibold text-text">
                        Stock bajo
                      </h3>
                      <p className="mt-0.5 text-sm text-text-muted">
                        <span className="font-semibold text-warning-700 tabular-nums">
                          {stats.stockBajoTotal}
                        </span>{" "}
                        producto(s) por debajo del mínimo
                      </p>
                    </div>
                  </div>
                  <Link
                    to="/products"
                    className="text-sm font-medium text-brand-700 hover:text-brand-800 hover:underline shrink-0"
                  >
                    Ver productos
                  </Link>
                </div>
                <ul className="border-t border-border divide-y divide-border">
                  {stats.stockBajoTop.map((p) => {
                    const minimo = Number(p.ProductoStockMinimo) || 0;
                    const stock = Number(p.ProductoStock) || 0;
                    const negativo = stock < 0;
                    return (
                      <li
                        key={p.ProductoId}
                        className="flex items-center justify-between gap-3 px-5 py-3"
                      >
                        <span className="text-sm text-text truncate">
                          {p.ProductoNombre}
                        </span>
                        <span className="text-sm shrink-0 tabular-nums">
                          <span
                            className={`font-semibold ${
                              negativo ? "text-danger-700" : "text-warning-700"
                            }`}
                          >
                            {formatMiles(stock)} cj
                          </span>
                          {minimo > 0 && (
                            <span className="text-text-subtle">
                              {" "}
                              / mín {formatMiles(minimo)}
                            </span>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            )}
          </section>
        )}

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
          {canVerReportes && (
            <QuickAction
              icon={ChartBarIcon}
              title="Reportes"
              description="Resumen de ventas y movimientos"
              to="/reportes"
              tone="info"
            />
          )}
        </div>
      </Card>
    </div>
  );
}

export default Dashboard;
