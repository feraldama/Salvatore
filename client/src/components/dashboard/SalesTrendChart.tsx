import { useEffect, useMemo, useRef, useState } from "react";
import type { VentaPorDia } from "../../services/venta.service";
import { formatMiles } from "../../utils/utils";

/**
 * Gráfico de tendencia de ventas — SVG liviano, sin dependencias externas.
 * Renderiza un área + línea de los totales diarios. Mide su ancho con
 * ResizeObserver para dibujar a pixeles reales (texto nítido, sin distorsión).
 */

interface SalesTrendChartProps {
  data: VentaPorDia[];
  height?: number;
}

// Abrevia montos grandes para los ejes: 1.2M, 350K, etc.
function abreviar(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(Math.round(n));
}

function formatFechaCorta(iso: string): string {
  // iso = YYYY-MM-DD -> DD/MM
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

const PAD = { top: 12, right: 12, bottom: 24, left: 48 };

export default function SalesTrendChart({
  data,
  height = 240,
}: SalesTrendChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const maxTotal = useMemo(
    () => Math.max(1, ...data.map((d) => d.total)),
    [data],
  );

  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = Math.max(0, height - PAD.top - PAD.bottom);

  // X uniforme; con 1 solo punto lo centramos.
  const xAt = (i: number) =>
    PAD.left +
    (data.length <= 1 ? plotW / 2 : (plotW * i) / (data.length - 1));
  const yAt = (v: number) => PAD.top + plotH - (plotH * v) / maxTotal;

  const linePath = useMemo(() => {
    if (!width || data.length === 0) return "";
    return data
      .map((d, i) => `${i === 0 ? "M" : "L"}${xAt(i)},${yAt(d.total)}`)
      .join(" ");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, width, maxTotal, plotW, plotH]);

  const areaPath = useMemo(() => {
    if (!linePath || data.length === 0) return "";
    const x0 = xAt(0);
    const xN = xAt(data.length - 1);
    const baseY = PAD.top + plotH;
    return `${linePath} L${xN},${baseY} L${x0},${baseY} Z`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linePath, data, width, plotW, plotH]);

  // Líneas de grilla horizontales (4 tramos).
  const gridLines = useMemo(() => {
    const n = 4;
    return Array.from({ length: n + 1 }, (_, k) => {
      const v = (maxTotal * k) / n;
      return { v, y: yAt(v) };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maxTotal, plotH, height]);

  // Etiquetas de X: primera, última y un par intermedias, sin amontonar.
  const xLabelIdxs = useMemo(() => {
    if (data.length <= 1) return data.map((_, i) => i);
    const step = Math.max(1, Math.ceil(data.length / 6));
    const idxs = [];
    for (let i = 0; i < data.length; i += step) idxs.push(i);
    if (idxs[idxs.length - 1] !== data.length - 1) idxs.push(data.length - 1);
    return idxs;
  }, [data]);

  if (data.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-sm text-text-muted"
        style={{ height }}
      >
        Sin ventas en el período.
      </div>
    );
  }

  const hovered = hoverIdx != null ? data[hoverIdx] : null;

  return (
    <div ref={containerRef} className="relative w-full" style={{ height }}>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={`Tendencia de ventas diarias de los últimos ${data.length} días`}
        >
          {/* Grilla + etiquetas Y */}
          {gridLines.map((g, i) => (
            <g key={i}>
              <line
                x1={PAD.left}
                y1={g.y}
                x2={width - PAD.right}
                y2={g.y}
                className="stroke-border"
                strokeWidth={1}
              />
              <text
                x={PAD.left - 6}
                y={g.y}
                textAnchor="end"
                dominantBaseline="middle"
                className="fill-text-subtle"
                fontSize={10}
              >
                {abreviar(g.v)}
              </text>
            </g>
          ))}

          {/* Área + línea */}
          <path d={areaPath} className="fill-brand-500/10" />
          <path
            d={linePath}
            fill="none"
            className="stroke-brand-600"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {/* Etiquetas X */}
          {xLabelIdxs.map((i) => (
            <text
              key={i}
              x={xAt(i)}
              y={height - 6}
              textAnchor="middle"
              className="fill-text-subtle"
              fontSize={10}
            >
              {formatFechaCorta(data[i].fecha)}
            </text>
          ))}

          {/* Guía + punto del día bajo el cursor */}
          {hovered && hoverIdx != null && (
            <>
              <line
                x1={xAt(hoverIdx)}
                y1={PAD.top}
                x2={xAt(hoverIdx)}
                y2={PAD.top + plotH}
                className="stroke-brand-400"
                strokeWidth={1}
                strokeDasharray="3 3"
              />
              <circle
                cx={xAt(hoverIdx)}
                cy={yAt(hovered.total)}
                r={4}
                className="fill-brand-600 stroke-surface"
                strokeWidth={2}
              />
            </>
          )}

          {/* Capa transparente para capturar hover por día */}
          {data.map((_, i) => {
            const bandW =
              data.length <= 1 ? plotW : plotW / (data.length - 1 || 1);
            return (
              <rect
                key={i}
                x={xAt(i) - bandW / 2}
                y={PAD.top}
                width={bandW}
                height={plotH}
                fill="transparent"
                onMouseEnter={() => setHoverIdx(i)}
                onMouseLeave={() => setHoverIdx(null)}
              />
            );
          })}
        </svg>
      )}

      {/* Fallback accesible: tabla de datos para lectores de pantalla.
          El SVG es decorativo para AT; esta tabla expone los valores reales. */}
      <table className="sr-only">
        <caption>Ventas diarias de los últimos {data.length} días</caption>
        <thead>
          <tr>
            <th scope="col">Fecha</th>
            <th scope="col">Total (Gs.)</th>
            <th scope="col">Ventas</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.fecha}>
              <th scope="row">{formatFechaCorta(d.fecha)}</th>
              <td>{formatMiles(d.total)}</td>
              <td>{d.cantidad}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Tooltip (HTML, posicionado sobre el punto) */}
      {hovered && hoverIdx != null && width > 0 && (
        <div
          className="pointer-events-none absolute z-10 rounded-md border border-border bg-surface px-3 py-2 shadow-md"
          style={{
            left: Math.min(
              Math.max(xAt(hoverIdx) - 70, 0),
              Math.max(0, width - 140),
            ),
            top: 4,
            width: 140,
          }}
        >
          <p className="text-xs font-medium text-text">
            {formatFechaCorta(hovered.fecha)}
          </p>
          <p className="text-sm font-semibold text-brand-700 tabular-nums">
            Gs. {formatMiles(hovered.total)}
          </p>
          <p className="text-xs text-text-muted tabular-nums">
            {hovered.cantidad} venta(s)
          </p>
        </div>
      )}
    </div>
  );
}
