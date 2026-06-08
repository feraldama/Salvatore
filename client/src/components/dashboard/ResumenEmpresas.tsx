import {
  BuildingStorefrontIcon,
  TruckIcon,
  BuildingOffice2Icon,
} from "@heroicons/react/24/outline";
import type { ComponentType } from "react";
import { Card } from "../common/ui";
import { formatMiles } from "../../utils/utils";
import type { ResumenEmpresa } from "../../services/dashboard.service";

/**
 * Visión consolidada del dueño: una tarjeta por empresa (Minorista vs
 * Distribuidora) con sus KPIs lado a lado, para comparar de un vistazo sin
 * tener que cambiar la empresa activa. Solo se muestra a quien accede a más
 * de una empresa (típicamente el admin/dueño).
 */

interface ResumenEmpresasProps {
  data: ResumenEmpresa[];
}

interface TipoMeta {
  etiqueta: string;
  icon: ComponentType<{ className?: string }>;
  // Acento de color por tipo de empresa.
  acento: string;
  chip: string;
}

function tipoMeta(tipo: string): TipoMeta {
  if (tipo === "D") {
    return {
      etiqueta: "Distribuidora · Mayorista",
      icon: TruckIcon,
      acento: "bg-info-500",
      chip: "bg-info-50 text-info-700",
    };
  }
  if (tipo === "M") {
    return {
      etiqueta: "Minorista",
      icon: BuildingStorefrontIcon,
      acento: "bg-brand-500",
      chip: "bg-brand-50 text-brand-700",
    };
  }
  return {
    etiqueta: "Empresa",
    icon: BuildingOffice2Icon,
    acento: "bg-surface-muted",
    chip: "bg-surface-muted text-text-muted",
  };
}

function Metric({
  label,
  value,
  hint,
  danger = false,
}: {
  label: string;
  value: string;
  hint?: string;
  danger?: boolean;
}) {
  return (
    <div>
      <p className="text-xs text-text-subtle">{label}</p>
      <p
        className={`text-lg font-semibold tabular-nums ${
          danger ? "text-danger-700" : "text-text"
        }`}
      >
        {value}
      </p>
      {hint && <p className="text-xs text-text-muted">{hint}</p>}
    </div>
  );
}

function EmpresaPanel({ e }: { e: ResumenEmpresa }) {
  const meta = tipoMeta(e.EmpresaTipo);
  const Icon = meta.icon;
  return (
    <div className="relative bg-surface rounded-lg border border-border overflow-hidden">
      <span aria-hidden="true" className={`absolute inset-y-0 left-0 w-1 ${meta.acento}`} />
      <div className="p-5 pl-6">
        <div className="flex items-center gap-3 mb-4">
          <span className={`flex items-center justify-center w-10 h-10 rounded-md shrink-0 ${meta.chip}`}>
            <Icon className="w-5 h-5" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-text truncate">
              {e.EmpresaNombre}
            </p>
            <p className="text-xs text-text-muted">{meta.etiqueta}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-4">
          <Metric
            label="Ventas hoy"
            value={`Gs. ${formatMiles(e.ventasHoyMonto)}`}
            hint={`${e.ventasHoyCantidad} venta(s)`}
          />
          <Metric
            label="Ventas del mes"
            value={`Gs. ${formatMiles(e.ventasMesMonto)}`}
          />
          <Metric label="Clientes" value={formatMiles(e.clientes)} />
          <Metric label="Productos" value={formatMiles(e.productos)} />
          <Metric
            label="Por cobrar"
            value={`Gs. ${formatMiles(e.totalPorCobrar)}`}
            danger={e.totalPorCobrar > 0}
          />
        </div>
      </div>
    </div>
  );
}

export default function ResumenEmpresas({ data }: ResumenEmpresasProps) {
  if (!data || data.length === 0) return null;

  return (
    <Card padding="none">
      <div className="px-5 pt-5 pb-4">
        <h3 className="text-lg font-semibold text-text">Visión por empresa</h3>
        <p className="mt-0.5 text-sm text-text-muted">
          Resumen consolidado de cada empresa del grupo
        </p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 px-5 pb-5 border-t border-border pt-5">
        {data.map((e) => (
          <EmpresaPanel key={e.EmpresaId} e={e} />
        ))}
      </div>
    </Card>
  );
}
