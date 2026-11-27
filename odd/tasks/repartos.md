Objective: repartos (hoja de carga) for the distribuidora — assign envío sales to a trip+vehicle, compute returnable crates per type, and let a new RUTEADOR role control departure and reception from a tablet (web).
Branch: feat/repartos · Delivery: ask-on-risk · Test runner: none in repo (api has no test suite; client has tsc). Checks: `npx tsc -b --noEmit` in client, node scripts against synthetic data inside a rolled-back transaction (never touch real rows).

## Specs

- **S1 — Tipo de caja on products (prerequisite, already built in working tree).** "poder asignarle con un select si el producto es caja cervepar, caja coca, caja 340, caja Munich/polar, caja 710 negro, caja 710  rojo y caja 710  azul), solo los que quiero ponerle ese valor, para todos por defecto es ninguno". Plus list column and filter ("mostrá el tipo de caja en la lista de productos", "agregá un filtro por tipo de caja").
- **S2 — Reparto entity.** "tendríamos que poder asignar las ventas a viajes y vehiculo, eso tambien hay que prepararlo para poder usarlo mas adelante cuando desarrollemos la app". Table `reparto` (empresa, fecha, vehículo, chofer optional, estado ARMADO → EN_RUTA → RECIBIDO, or ANULADO from ARMADO; salida/recepción timestamps + users; `viaje_id` nullable link to flota_viaje for the future app). `venta_envio.reparto_id`. Only distribuidora ("solo distribuidora"). "una venta se entrega en un viaje" → a venta belongs to at most one reparto.
- **S3 — Office: armar reparto.** Create/edit (fecha, vehículo, chofer, observación) while ARMADO; assign/unassign envío sales that are PENDIENTE and not in another reparto; assigning sets the sale's vehículo to the reparto's. Anular only while ARMADO (frees its sales).
- **S4 — Hoja de carga.** "por los productos de la venta se sabe si cuantas cajas tiene que llevar y cuantas tiene que volver a traer". Products to load (sum by product, cajas/unidades) and crates per tipo de caja = sum of `VentaProductoCantidad` of lines with `VentaProductoUnitario='C'` whose product has a tipo de caja ("solo se venden cajas completas"). Printable.
- **S5 — Retorno esperado.** Client answers: "si devuelve vacias", rejected/full crates "se cuentan igual", "no" extra crates. ⇒ expected return per type = crates that left. Unit of control is the crate ("si son cajas llenas de botellas").
- **S6 — Rol RUTEADOR, control de salida.** "crear un rol "ruteador"" … "le vamos a dar una tablet" (web, chosen: "Web en la tablet"). Also controls departure (chosen: "Salida y recepción"): sees the hoja de carga of ARMADO repartos and confirms salida → reparto EN_RUTA, crates per type frozen as `cajas_salida`, its sales' venta_envio → EN_RUTA (chofer copied).
- **S7 — Recepción.** "él tiene que seleccionar el viaje que está llegando y le tiene que mostrar la cantidad de cada caja que tiene que recibir". Lists EN_RUTA repartos; per type shows expected and lets him enter received; difference shown; on difference an observation is mandatory (chosen: "Registrar con observación"). Confirm → RECIBIDO, sales → ENTREGADO.
- **S8 — Protections.** Cannot delete a sale or change its vehicle once its reparto left (EN_RUTA/RECIBIDO); vehicle change also blocked while ARMADO (would desync with the reparto). Salida/recepción transitions are atomic and guarded by state (row lock) so a double tap or two tablets cannot apply twice.
- **S9 — Registration.** Menus `REPARTOS` (office) and `CONTROLREPARTOS` (ruteador) in `menu`; perfil `RUTEADOR` (empresa 1) with CONTROLREPARTOS read+edit; Sidebar items in section Distribuidora (replacing placeholder "Rutas de Reparto"); titles in DocumentTitle.

## Tasks

- [x] T0 — S1 commit tipo de caja (prereq, already implemented and checked) · inline · 0b6a8ea
- [x] T1 — S2,S8,S9 migration 036 (reparto, reparto_caja, venta_envio.reparto_id, menus, perfil RUTEADOR) · inline
- [x] T2 — S2-S8 backend: reparto model/controller/routes + venta protections · inline · (T1+T2 same commit)
- [ ] T3 — S3,S4 office page /repartos (list, armado, hoja de carga print) · inline
- [ ] T4 — S6,S7 ruteador page /repartos/control (tablet) · inline
- [ ] T5 — S9 registration (App routes, Sidebar, DocumentTitle) + final checks · inline

Route evidence: one coherent feature, units depend on each other (backend → pages), no Writer trigger reason → inline. Risk: item 1 (migration on venta_envio), item 4 (state transitions under concurrency) → independent verifier at the end.

## Log

- L1 (2026-11-27, verbatim): "ahora quiero que analices otra cosa, lo que el cliente necesita es poder controlar cuando el vehiculo sale, que ventas está llevando así por los productos de la venta se sabe si cuantas cajas tiene que llevar y cuantas tiene que volver a traer, tendríamos que poder asignar las ventas a viajes y vehiculo, eso tambien hay que prepararlo para poder usarlo mas adelante cuando desarrollemos la app"
- L2 (verbatim): "1. si devuelve vacias, 2. se cuentan igual, 3. solo se venden cajas completas, 4. si son cajas llenas de botellas, 5. no, 6. solo distribuidora, 7. una venta se entrega en un viaje"
- L3 (verbatim): "lo que querríamos es crear un rol "ruteador" que es el usuario que va a verificar cuando vuelva el vehiculo la cantidad de cajas que tiene que devolver, le vamos a dar una tablet y él tiene que seleccionar el viaje que está llegando y le tiene que mostrar la cantidad de cada caja que tiene que recibir"
- L4 (answers): Plataforma="Web en la tablet (Recommended)"; Salida="Salida y recepción"; Diferencias="Registrar con observación"; Implementar="Sí, arrancá".
- L5 decision: states simplified to ARMADO/EN_RUTA/RECIBIDO/ANULADO (no separate CERRADO: reception closes it). Per-stop crate detail deferred to the app phase (additive later). Local DB has no schema_migrations; migrations applied manually with psql.
- L6 T1: migration 036 applied twice on local DB (idempotent). perfil sequence was behind (duplicate key perfilid=5) → setval to MAX before insert.
- L7 T2 evidence: scratch script (scratchpad/test_reparto.js) runs model + venta controller inside one outer transaction rolled back (inner commits → savepoints): 14 checks OK (create validation, ventas disponibles cajas count, all-or-nothing assign, cross-empresa 404, vehicle change blocked in reparto, live hoja de carga 710_ROJO=4/COCA=6 with U lines excluded, salida freezes crates, double salida 409, delete of EN_RUTA venta blocked, recepción validations incl. mandatory observation, RECIBIDO/ENTREGADO, anular frees ventas; regressions: vehicle change without reparto OK, delete in ARMADO reparto OK). Census venta/ventaproducto/venta_envio/reparto/registrodiariocaja/sum stock identical before/after. RED not observed first (tests written after code) — exception noted. Real two-connection concurrency not exercised (single outer connection).
