# Vendedores — Page Overrides

> **PROJECT:** Salvatore Distribuidora
> **Page Type:** Dashboard / Data View (lista de vendedores + comisiones)

> ⚠️ Rules here **override** [the Master file](../MASTER.md). Only deviations are documented; for everything else use the Master (Data-Dense Dashboard).

---

## Page-Specific Rules

### Layout

- Data table as the primary surface: alternating rows (`surface` / `surface-sunken`), sticky header.
- Filters/search row above the table; KPI cards (total vendedores, comisiones del período) on top.
- Max content width follows the app shell; table scrolls horizontally on < 768px (or switches to card rows).

### Color

- Row hover highlight: `surface-sunken`.
- Comisiones / amounts: `.font-num` (tabular), `text-strong` for totals.
- Estados de cobro: `success` (al día) / `warning` (pendiente) / `danger` (vencido) — never color-only, pair with label/icon.

### Components

- Use the shared `StatCard`, `Badge`, `Card`, table primitives — do not introduce page-local color/spacing.
- Avoid: wide tables breaking the layout, arbitrary large z-index (use the app z-index scale 10/20/40/100).

## Recommendations

- Effects: row highlight on hover, metric updates, status-change highlights (150–300ms, respect reduced-motion).
- Responsive: horizontal scroll or card layout for the table on small screens.
