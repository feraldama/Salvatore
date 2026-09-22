# Despliegue en producción — Caja por cajero + Terminales (migraciones 029 a 033)

> Instrucciones para ejecutar en el **servidor de producción**.
> Leer completo antes de empezar. Hay dos puntos donde el orden equivocado deja
> el sistema sin funcionar; están marcados con ⚠️.

## Qué hace este cambio

El cajero deja de elegir su caja y deja de depender de la sucursal que figura en
su ficha:

- **Cada caja tiene un cajero dueño** (una por cajero y por sucursal). El cajero
  ya no ve un selector con 16 cajas: apertura la suya.
- **Cada PC se registra en una sucursal** ("terminal"). El servidor resuelve con
  eso la bodega donde está parado el cajero, y de ahí sale el depósito del que se
  descuenta el stock — ya no del dato de su ficha.
- El almacén de la venta se deriva en el servidor desde la caja aperturada, en
  vez de aceptarse desde el navegador.

Motivo: se detectaron 113 ventas con la plata entrando a la caja de una sucursal
y el stock descontándose del depósito de otra.

## Antes de empezar

- [ ] Elegir un horario de **poca o nula venta**. Las migraciones toman locks
      sobre la tabla `caja`.
- [ ] Confirmar acceso a `psql` y las credenciales del `.env` del servidor
      (`DB_NAME`, `DB_USER`, `DB_HOST`).
- [ ] Ubicar cómo se reinicia la API en este servidor (pm2, systemd, docker…) y
      cómo se despliega el frontend. **No inventar un método nuevo: usar el que
      ya está en uso.**

---

## Paso 1 — Backup de la base

**Obligatorio. No saltear.** El backup más reciente del repo es de junio y quedó
obsoleto por un cambio de ids.

```bash
pg_dump -U $DB_USER -d $DB_NAME -F c -f ~/backup_pre_029_$(date +%Y%m%d_%H%M).dump
ls -lh ~/backup_pre_029_*.dump
```

⛔ **Si el backup falla o pesa 0 bytes, DETENER TODO.** No continuar sin backup.

---

## Paso 2 — Traer el código (sin activarlo todavía)

```bash
cd <ruta del proyecto en el servidor>
git fetch origin
git log --oneline -3 origin/main
git pull origin main
```

⚠️ **No reiniciar la API todavía.** El código nuevo consulta una columna que aún
no existe; si se reinicia ahora, **nadie puede iniciar sesión**.

---

## Paso 3 — Migraciones 029, 030 y 031 (en este orden)

```bash
cd <proyecto>/api

psql -U $DB_USER -d $DB_NAME -v ON_ERROR_STOP=1 -f migrations/029_caja_usuario.sql
psql -U $DB_USER -d $DB_NAME -v ON_ERROR_STOP=1 -f migrations/030_terminal.sql
psql -U $DB_USER -d $DB_NAME -v ON_ERROR_STOP=1 -f migrations/031_caja_usuario_por_local.sql
psql -U $DB_USER -d $DB_NAME -v ON_ERROR_STOP=1 -f migrations/033_terminal_movil.sql
```

Las cuatro son idempotentes y transaccionales: si fallan, no dejan nada a medias.

**Si alguna falla con `canceling statement due to lock timeout`:** es lo
esperado cuando hay consultas en curso. No es un error del script — significa
que la tabla estaba ocupada. Esperar unos minutos y volver a correr **esa misma
migración**. Es seguro reintentarla.

**Si falla por otro motivo:** detener acá y reportar el error. No seguir al
paso 4.

---

## Paso 4 — Migración 032 (el índice) — se corre SOLA

```bash
psql -U $DB_USER -d $DB_NAME -v ON_ERROR_STOP=1 -f migrations/032_indice_registrodiariocaja_usuario.sql
```

⚠️ Este archivo usa `CREATE INDEX CONCURRENTLY`, que **no puede ejecutarse dentro
de una transacción**. No envolverlo en `BEGIN/COMMIT`, no concatenarlo con otro
archivo, no pasarlo con `-c` junto a otras sentencias.

Puede tardar algunos minutos (500 mil filas) pero **no bloquea la operación**: se
puede seguir vendiendo mientras corre.

Verificar que el índice quedó válido:

```sql
SELECT indisvalid FROM pg_index
 WHERE indexrelid = 'registrodiariocaja_usuario_tipo_idx'::regclass;
```

Si devuelve `f` (inválido), la creación se interrumpió. Borrarlo y repetir:

```sql
DROP INDEX registrodiariocaja_usuario_tipo_idx;
```

Este índice no es opcional: sin él, **cada venta suma hasta 67 ms** de consultas.

---

## Paso 5 — Configurar el flag

En el `.env` de la API del servidor:

```
TERMINAL_OBLIGATORIA=N
```

⛔ **NO poner `S` en este paso.** Con `S` y los equipos todavía sin registrar,
nadie puede vender. Se activa al final, en el paso 9.

Si la variable no existe en el `.env`, agregarla igual (el valor por defecto ya
es `N`, pero conviene que esté explícita).

---

## Paso 6 — Activar el código

```bash
cd <proyecto>/api && npm install --omit=dev   # o pnpm install --prod
cd <proyecto>/client && npm install && npm run build
```

Reiniciar la API con el método que use este servidor y publicar el build del
frontend donde corresponda.

---

## Paso 7 — Verificación automática

```bash
cd <proyecto>/api
node scripts/verificar_terminales.js
```

Es **solo lectura**, no modifica nada.

- Si termina en `=== TODO EN ORDEN ===` → continuar.
- Si aparece cualquier línea `FALLA` → **detener y reportar**. No registrar
  equipos ni activar el flag.

El script además informa (sin bloquear):
- cuántas cajas quedaron con dueño,
- qué cajeros activos no tienen caja propia (van a seguir viendo el selector),
- qué sucursales no tienen ningún equipo registrado.

---

## Paso 8 — Verificación manual

Con un usuario administrador:

1. **Iniciar sesión.** Si el login falla, las migraciones no se aplicaron:
   volver al paso 3.
2. Ir a **Administración → Control de Acceso → Equipos**. Debe abrir la pantalla
   (al principio vacía).
3. En la parte superior debe verse una barra ámbar: *"Este equipo no está
   registrado en ninguna sucursal"*, con el botón **Registrar este equipo**.
4. Ir a **Cajas**: debe aparecer la columna **Cajero** con los dueños asignados.
5. Abrir la pantalla de **apertura/cierre de caja** con un usuario cajero que
   tenga caja propia: debe mostrar su caja como **texto fijo**, sin selector.

---

## Paso 9 — Registrar los equipos

**Desde cada PC**, con sesión de administrador abierta **en esa misma PC**:

1. Entrar al sistema.
2. En la barra ámbar de arriba, clic en **Registrar este equipo**.
3. Poner un nombre descriptivo (ej. `Mostrador 1`) y elegir **la sucursal donde
   está físicamente esa computadora**.
4. Confirmar. La barra pasa a decir *"Estás operando en &lt;SUCURSAL&gt;"*.

Repetir en **todas** las PC desde las que se vende o se mueve caja.

> El registro **solo puede hacerse desde la propia PC**: el identificador lo
> genera el navegador de ese equipo. Un administrador no puede darla de alta a
> distancia.

### Notebooks que se mueven entre bodegas

Para un equipo que no tiene una sucursal fija —típicamente la notebook del
administrador, que un día está en la distribuidora y otro en la bodega central—
marcar la casilla **"Es un equipo móvil"** al registrarlo, en lugar de elegir
una sucursal.

Un equipo móvil toma la sucursal que el administrador tenga elegida en el
selector de sucursal, y la barra superior se la confirma en todo momento
(*"Estás operando en CENTRAL · Notebook admin"*). Cuando se muda de bodega no hay
que registrar nada de nuevo: alcanza con cambiar el selector.

Dos cosas a tener en cuenta:

- El administrador necesita **una caja propia en cada sucursal donde vaya a
  operar** (desde la 031 un cajero puede tener una caja por sucursal). Sin caja
  en esa bodega, el sistema lo frena.
- **Un cajero no puede operar desde un equipo móvil**: no tiene selector de
  sucursal, así que el sistema no sabría dónde está. Los cajeros usan siempre
  equipos fijos.

Controlar la cobertura:

```bash
node scripts/verificar_terminales.js
```

Debe listar los equipos registrados y **no** debe quedar ninguna sucursal
operativa en la línea `ATENCION: sucursales sin ningun equipo registrado`.

---

## Paso 10 — Activar la obligatoriedad (día siguiente, no el mismo día)

Recién cuando **todos** los equipos estén registrados y el sistema haya
funcionado normal al menos una jornada:

```
TERMINAL_OBLIGATORIA=S
```

Reiniciar la API.

A partir de acá, una PC sin registrar **no puede vender ni mover caja**.

⚠️ Antes de activarlo, tener presente: si a una PC se le borran los datos del
navegador (limpiar caché, navegador nuevo, modo incógnito), aparece como no
registrada y **hay que volver a registrarla desde esa misma PC con un
administrador**. Con el flag en `S`, ese puesto no vende hasta que eso ocurra.

---

## Si hay que volver atrás

**El orden importa:**

1. Primero volver el **código** a la versión anterior (o poner
   `TERMINAL_OBLIGATORIA=N` y reiniciar, que suele alcanzar).
2. Solo si es imprescindible revertir el esquema:
   ```bash
   psql -U $DB_USER -d $DB_NAME -f migrations/rollback_029_a_032.sql
   ```

⚠️ **Nunca al revés.** El código nuevo consulta `caja.UsuarioId` en el login: si
se borra esa columna con el código nuevo activo, nadie entra al sistema.

El código viejo funciona sin problemas con el esquema nuevo, así que para
desactivar el comportamiento casi siempre alcanza con volver el código. Revertir
el esquema es opcional.

Ventas, movimientos de caja y montos **nunca son modificados** por estas
migraciones, ni al aplicarlas ni al revertirlas.

---

## Tareas pendientes (no bloquean el despliegue)

- `CAJA ISAAC` (sucursal SUCURSAL) no tiene dueño asignado, y ningún usuario
  activo figura con esa sucursal. Antes de activar el flag del paso 10,
  definir quién trabaja ahí y asignarle una caja de esa sucursal.
- Los cajeros sin caja propia van a seguir viendo el selector de cajas. Para las
  cajas funcionales (`COMPRAS`, `CAJA ADMIN`) eso es lo correcto; para un cajero
  real conviene asignarle la suya desde **Cajas → editar → Cajero dueño**.
- El módulo de **compras** mantiene el comportamiento anterior (la caja y el
  almacén siguen llegando desde el navegador). No fue modificado.
