# Deploy del servidor de desarrollo

Servidor: AlmaLinux, `desarrollo@172.16.10.21` (solo con VPN), repo en `~/Salvatore`.
Acceso: `ssh desarrollo@172.16.10.21` (clave SSH, sin contraseña).

## Cómo funciona

| Qué | Dónde | Cuándo |
|---|---|---|
| API (`node index.js`, :3023) | servicio `salvatore-api` | siempre; se reinicia sola si se cae |
| Client (`vite preview` de `client/dist`, :3024) | servicio `salvatore-client` | siempre |
| Deploy de `origin/main` | `salvatore-deploy.timer` → `server-deploy.sh --auto` | cada minuto, si hay commits nuevos |
| Backup de la base | `salvatore-backup.timer` → `backup-diario.sh` | todos los días a las 03:00 (guarda 14) |
| Avisos en Windows (deploys, servicios caídos, backup atrasado) | tarea "Salvatore deploy notify" → `windows/deploy-notify.ps1` | cada minuto, en la PC, mientras haya VPN |

Son servicios systemd **de usuario** (`systemctl --user ...`, sin sudo), con *linger*
activo: arrancan con el equipo aunque nadie inicie sesión. **No levantar la API ni el
client a mano** en una terminal del servidor: chocan los puertos.

### Qué hace un deploy (`server-deploy.sh`)
1. `git pull` de `origin/main`.
2. Si hay migraciones nuevas en `api/migrations` (`NNN_nombre.sql`): backup en
   `~/deploy/backups/migraciones/` y después las aplica en orden (`migrar.sh`), cada una
   registrada en la tabla `schema_migrations`.
3. `pnpm install` si cambió algún `package.json` o lockfile.
4. Si cambió `client/`: build en `dist_new` y, al final, swap con `dist`.
5. Si cambió `api/`: reinicia `salvatore-api` y verifica que responda.

Si algo falla, el código vuelve al commit anterior y la app sigue con la versión vieja.
Ese commit no se reintenta solo hasta que llegue otro push (ver "Reintentar").

## Flujo de trabajo en la PC

1. Al empezar a trabajar (con la VPN conectada): `deploy\windows\traer-db.ps1`. Trae una
   copia de la base del servidor a la base local (la de `api/.env`), aplica las migraciones
   locales pendientes y deja la base anterior como `salvatore_anterior`. Es la única vez que
   la base viaja a la PC: los backups diarios quedan en el servidor.
2. Programar y probar en local contra esa copia. Si se agrega una migración, volver a
   correr `traer-db.ps1` para probarla sobre datos frescos del servidor.
3. `git push` a `main`. El hook `.githooks/pre-push` verifica que el client compile (`tsc`),
   la sintaxis de los `.js` de la API y que las migraciones nuevas estén aplicadas en la
   base local. Emergencia: `git push --no-verify`.
4. En menos de un minuto el servidor despliega y llega la notificación "Deploy OK" o "Deploy FALLO".

Para ver la salida en vivo en vez de esperar: `.\deploy-dev.ps1` (hace push y deploy).

Migraciones: escribirlas dentro de `BEGIN; ... COMMIT;` e idempotentes (`IF NOT EXISTS`,
`UPDATE ... WHERE` por valor viejo), como las existentes. Se aplican solas al hacer push.

## Operación

**Ver el último deploy y su log**
```bash
cat ~/deploy/status
ls -t ~/deploy/logs | head          # logs de deploys (guarda 50)
```

**Logs de la API / client** (`journalctl --user` no los muestra en este servidor)
```bash
journalctl _SYSTEMD_USER_UNIT=salvatore-api.service -n 100 -f
journalctl _SYSTEMD_USER_UNIT=salvatore-client.service -n 100
```

**Reiniciar / estado**
```bash
systemctl --user restart salvatore-api salvatore-client
systemctl --user status salvatore-api
systemctl --user list-timers
```

**Reintentar un deploy fallido** (por ejemplo, si falló por algo pasajero, como npm)
```powershell
.\deploy-dev.ps1 -NoPush           # desde Windows; -Force para rebuild completo
```

**Volver a una versión anterior del código**: hacer `git revert <commit>` y push (el
servidor despliega el revert). No hacer `reset` ni `push --force` sobre `main`.

**Restaurar un backup de la base** (borra los datos actuales: confirmar antes)
```bash
ls -t ~/deploy/backups/diarios ~/deploy/backups/migraciones
systemctl --user stop salvatore-api
cd ~/Salvatore && . deploy/db.sh && cargar_db ~/Salvatore
/usr/pgsql-17/bin/pg_restore --clean --if-exists --no-owner -d "$PGDATABASE" <archivo.dump>
systemctl --user start salvatore-api
```
En la PC, `D:\Sistemas\Salvatore - Backups` guarda los últimos 5 dumps que trajo
`traer-db.ps1` (`servidor-*.dump`).

## Instalación (ya hecha; para reinstalar o en otro servidor)

- Servidor: `bash ~/Salvatore/deploy/install-server.sh` (idempotente). Si la API o el client
  corren en una terminal, cerrarlos y `systemctl --user start salvatore-api salvatore-client`.
- PC: `deploy\windows\install-notify.ps1` (tarea programada) y, una vez por clon,
  `git config core.hooksPath .githooks`.
- Clave SSH: `ssh-keygen -t ed25519` y agregar `~/.ssh/id_ed25519.pub` a
  `~/.ssh/authorized_keys` del servidor (`restorecon -Rv ~/.ssh` por SELinux).
