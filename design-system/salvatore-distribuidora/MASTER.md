# Design System Master File

> **LOGIC:** When building a specific page, first check `design-system/salvatore-distribuidora/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, strictly follow the rules below.

---

**Project:** Salvatore Distribuidora
**Category:** Admin Panel / POS / Operations (wholesale distribution, sales & inventory management)
**Source:** ui-ux-pro-max skill — `--design-system "admin panel dashboard data table management saas business"`

---

## Pattern — Real-Time / Operations

- **Focus:** operational tool for ops/sales/inventory. Data-dense but scannable. Status colors (green/amber/red).
- **Primary action per screen:** a single primary CTA (e.g. *Nueva venta*, *Registrar cobro*); the rest is secondary/outline/ghost.

## Style — Data-Dense Dashboard

- KPI cards, data tables, multiple widgets, minimal padding, grid layout, space-efficient, maximum data visibility.
- **Light ✓ Full · Dark ✓ Full** · Performance ⚡ Excellent · WCAG AA.
- **Avoid:** ornate design, decorative gradients/glow, complex shadows, 3D effects, missing filtering.

---

## Global Rules

### Color Palette

| Role | Hex | Token (Tailwind `@theme`) |
|------|-----|---------------------------|
| Primary | `#1E40AF` | `brand-800` (default action `brand-700` `#1d4ed8`) |
| Secondary | `#3B82F6` | `brand-500` |
| Accent / CTA / highlight | `#D97706` | `warning-600` (amber) |
| Background (page) | `#F8FAFC` | `surface-alt` |
| Surface (cards/modals) | `#FFFFFF` | `surface` |
| Foreground | `#1E3A8A` / `#0f172a` | `text-strong` / `text` |
| Muted | `#E9EEF6` | `surface-muted` |
| Border | `#DBEAFE` / `#d6dee9` | `border` |
| Destructive | `#DC2626` | `danger-600` (default `danger-700`) |
| Ring / focus | `#1d4ed8` | `brand-700` |

**Notes:** Blue data + amber highlights. Status semantics use `success` (emerald), `warning` (amber), `danger` (red), `info` (sky). Never use raw hex in components — always semantic tokens.

### Typography

- **Heading:** Fira Code (`font-display`) — headings, brand name, large sale totals.
- **Body:** Fira Sans (`font-ui`) — body, tables, forms, dense data.
- **Numeric:** Fira Code + `tabular-nums` (`.font-num`) — amounts, quantities, totals (columns align).
- **Mood:** dashboard, data, analytics, technical, precise.
- **Google Fonts:** `Fira Code` + `Fira Sans` (loaded in `client/index.html`).

```css
@import url('https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500;600;700&family=Fira+Sans:wght@300;400;500;600;700&display=swap');
```

### Key Effects

- Hover tooltips, row highlighting on hover, smooth filter animations, chart zoom on click, data loading spinners/skeletons.
- Transitions 150–300ms; respect `prefers-reduced-motion`.

---

## Pre-Delivery Checklist

- [ ] No emojis as icons (use SVG: Heroicons/Lucide)
- [ ] `cursor-pointer` on all clickable elements
- [ ] Hover states with smooth transitions (150–300ms)
- [ ] Light mode: text contrast ≥ 4.5:1
- [ ] Focus states visible for keyboard nav (`brand-700` ring)
- [ ] `prefers-reduced-motion` respected
- [ ] Responsive: 375 / 768 / 1024 / 1440
- [ ] Money/quantities use `.font-num` (tabular)
- [ ] One primary CTA per screen; destructive actions use `danger`

> Tokens live in [client/src/App.css](../../client/src/App.css) (`@theme` block) and are exposed as Tailwind utilities (`bg-*`, `text-*`, `border-*`).
