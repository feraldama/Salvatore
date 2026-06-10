# Design System Master File

> **LOGIC:** When building a specific page, first check `design-system/salvatore-bebidas/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, strictly follow the rules below.

---

**Project:** Salvatore Bebidas
**Category:** Admin Panel / POS / Operations (same unified internal tool as Salvatore Distribuidora)
**Source:** ui-ux-pro-max skill — `--design-system "admin panel dashboard data table management saas business"`

---

> ⚠️ **Empresa unificada.** El client (`client/`) es **una sola app de administración/operaciones** con switcher de empresa — no una tienda pública. Por eso Salvatore Bebidas usa **el mismo design system** que [Salvatore Distribuidora](../salvatore-distribuidora/MASTER.md): el sistema **Data-Dense Dashboard** del skill. La fuente de verdad de los tokens es [client/src/App.css](../../client/src/App.css).

---

## Style — Data-Dense Dashboard

- KPI cards, data tables, minimal padding, grid layout, space-efficient.
- **Light ✓ Full · Dark ✓ Full** · WCAG AA · **Avoid** ornate design, glow, complex shadows.

## Color Palette

| Role | Hex | Token |
|------|-----|-------|
| Primary | `#1E40AF` | `brand-800` (action `brand-700`) |
| Secondary | `#3B82F6` | `brand-500` |
| Accent / CTA | `#D97706` | `warning-600` (amber) |
| Background | `#F8FAFC` | `surface-alt` |
| Surface | `#FFFFFF` | `surface` |
| Foreground | `#0f172a` | `text` |
| Border | `#d6dee9` | `border` |
| Destructive | `#DC2626` | `danger-600` |

**Notes:** Blue data + amber highlights. Status: `success` / `warning` / `danger` / `info`.

## Typography

- **Heading:** Fira Code (`font-display`) · **Body:** Fira Sans (`font-ui`) · **Numeric:** Fira Code + `tabular-nums` (`.font-num`).

```css
@import url('https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500;600;700&family=Fira+Sans:wght@300;400;500;600;700&display=swap');
```

## Pre-Delivery Checklist

- [ ] No emojis as icons (SVG only) · `cursor-pointer` on clickables
- [ ] Contrast ≥ 4.5:1 · focus ring `brand-700` · `prefers-reduced-motion`
- [ ] Responsive 375 / 768 / 1024 / 1440 · money uses `.font-num`
- [ ] One primary CTA per screen; destructive uses `danger`
