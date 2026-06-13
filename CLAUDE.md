# Reglas del proyecto — Salvatore Distribuidora

Sistema unificado minorista + distribuidora. Backend Node/Express + PostgreSQL en `api/`, frontend React + TypeScript + Vite en `client/`.

## Fechas
- **Mostrar siempre las fechas en formato `dd/mm/aaaa`** en toda la UI (y `dd/mm/aaaa HH:mm` cuando se necesita la hora). Internamente / en la API se manejan en ISO (`aaaa-mm-dd`), pero al renderizar se convierten.
- Usar los helpers centralizados de `client/src/utils/utils.ts`: **`formatFecha(value)`** (dd/mm/aaaa) y **`formatFechaHora(value)`** (dd/mm/aaaa HH:mm). Aceptan string ISO, Date o epoch. NO usar `toLocaleDateString`/`toLocaleString` sueltos para mostrar fechas.
- Los helpers parsean los componentes del string ISO (no `new Date(...)`), así evitan el desfase por zona horaria (UTC-4 en PY).
- Año siempre de 4 dígitos (nunca `yy`).

## Inputs numéricos
- **Todo input de números (montos, cantidades, km, etc.) debe mostrar separador de miles** (ej. `15.000`). Patrón: input de texto con `value={valor ? formatMiles(valor) : ""}` y `onChange` que parsea con `Number(e.target.value.replace(/\D/g, ""))`. Usar `formatMiles` de `utils.ts`. No usar `<input type="number">` crudo para estos campos (no soporta separador de miles).

## Páginas / rutas nuevas
- **Cada vez que se agrega una ruta/página nueva hay que registrar su título en `client/src/components/common/DocumentTitle/DocumentTitle.tsx`** (mapa `ROUTE_TITLES`). Si no se agrega, la pestaña del navegador muestra "Página no encontrada". Es un olvido recurrente con componentes nuevos.
- El menú lateral está hardcodeado en `client/src/components/layout/Sidebar.tsx` (no viene de la DB). Para que un ítem sea visible a usuarios no-admin, su `permiso` debe existir en la tabla `menu` (los admin ven todo).

## Git
- No hacer commits salvo pedido explícito (regla global del usuario).
