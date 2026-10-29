#!/usr/bin/env bash
# Deploy de origin/main en el servidor de desarrollo. Lo ejecutan:
#   - salvatore-deploy.timer cada minuto (--auto): solo actua si hay commits nuevos.
#   - deploy-dev.ps1 desde Windows (sin --auto), mostrando la salida.
# Opciones: --auto  |  --force (rebuild + reinicio aunque no haya commits nuevos)
#
# Orden: pull -> backup + migraciones -> pnpm install -> build del client en
# dist_new -> reinicio de la API -> swap de dist. Si algo falla antes del swap,
# el codigo vuelve al commit anterior (la API y el client siguen con la version
# vieja) y --auto no reintenta ese commit hasta que llegue otro.
#
# Estado en ~/deploy: status (ultimo resultado, lo lee deploy-notify.ps1),
# logs/, backups/ (pg_dump previo a cada tanda de migraciones) y failed_commit.
set -uo pipefail

REPO="$HOME/Salvatore"
STATE="$HOME/deploy"
PSQL="/usr/pgsql-17/bin/psql -X"
PG_DUMP=/usr/pgsql-17/bin/pg_dump
API_PORT=3023
CLIENT_PORT=3024
KEEP_LOGS=50
KEEP_BACKUPS=10

AUTO=0; FORCE=0
for a in "$@"; do
  case "$a" in
    --auto) AUTO=1 ;;
    --force) FORCE=1 ;;
  esac
done

mkdir -p "$STATE/logs" "$STATE/backups"

# El pull reemplaza este archivo: se ejecuta desde una copia.
if [ "${DEPLOY_COPY:-0}" != 1 ]; then
  cp "$0" "$STATE/.deploy-run.sh"
  DEPLOY_COPY=1 exec bash "$STATE/.deploy-run.sh" "$@"
fi

exec 9>"$STATE/deploy.lock"
if [ $AUTO = 1 ]; then flock -n 9 || exit 0; else flock 9; fi

. "$REPO/deploy/env.sh"
cd "$REPO" || exit 1

if ! git fetch -q origin; then
  [ $AUTO = 1 ] && exit 0   # sin red: se reintenta en el proximo minuto
  echo "ERROR: fallo git fetch"; exit 1
fi

OLD=$(git rev-parse HEAD)
TARGET=$(git rev-parse origin/main)

if [ "$OLD" = "$TARGET" ] && [ $FORCE = 0 ]; then
  [ $AUTO = 1 ] && exit 0
  echo "El servidor ya esta en $(git log --oneline -1)."
  LAST_LOG=$(sed -n 's/^log=//p' "$STATE/status" 2>/dev/null)
  if [ -n "$LAST_LOG" ] && [ -f "$LAST_LOG" ]; then
    echo "Ultimo deploy ($LAST_LOG):"; sed 's/^/  | /' "$LAST_LOG"
  fi
  exit 0
fi
if [ $AUTO = 1 ] && [ "$TARGET" = "$(cat "$STATE/failed_commit" 2>/dev/null)" ]; then
  exit 0
fi

STAMP=$(date +%Y%m%d-%H%M%S)
LOG="$STATE/logs/deploy-$STAMP.log"
exec > >(tee -a "$LOG") 2>&1
TRIGGER=$([ $AUTO = 1 ] && echo automatico || echo manual)
echo "=== Deploy $TRIGGER $(date '+%d/%m/%Y %H:%M:%S') -> $(git log --oneline -1 "$TARGET")"

ROLLBACK=0; API_RESTARTED=0; API_DEPS=0; NEW_DIST=0; UNITS=0; BACKUP=""; MIGRATED=""

write_status() { # $1=OK|FAIL  $2=mensaje
  {
    echo "id=$STAMP"
    echo "result=$1"
    echo "commit=$(git log -1 --format=%h "$TARGET")"
    echo "subject=$(git log -1 --format=%s "$TARGET")"
    echo "trigger=$TRIGGER"
    echo "time=$(date '+%d/%m/%Y %H:%M')"
    echo "message=$2"
    echo "log=$LOG"
  } > "$STATE/status.tmp" && mv "$STATE/status.tmp" "$STATE/status"
}

fail() {
  echo "ERROR: $1"
  if [ $ROLLBACK = 1 ]; then
    echo "==> vuelvo el codigo a $(git log --oneline -1 "$OLD")"
    git reset -q --hard "$OLD"
    rm -rf "$REPO/client/dist_new"
    [ $API_DEPS = 1 ] && (cd "$REPO/api" && pnpm install --frozen-lockfile)
    [ $API_RESTARTED = 1 ] && systemctl --user restart salvatore-api
  fi
  echo "$TARGET" > "$STATE/failed_commit"
  write_status FAIL "$1"
  exit 1
}

wait_port() { # $1=puerto  $2=segundos
  local i
  for i in $(seq 1 "$2"); do
    ss -ltn | grep -q ":$1 " && return 0
    sleep 1
  done
  return 1
}

# --- codigo -------------------------------------------------------------------
echo "==> git pull"
# Cambios locales del servidor identicos a origin/main se descartan; otros abortan.
DIRTY=""
for f in $(git diff --name-only); do
  if git show "$TARGET:$f" 2>/dev/null | cmp -s - "$f"; then
    git checkout -q -- "$f"
  else
    echo "cambio local sin commitear en el servidor: $f"; DIRTY=1
  fi
done
[ -n "$DIRTY" ] && fail "hay cambios locales en el servidor"
git merge -q --ff-only "$TARGET" || fail "git merge --ff-only fallo"
ROLLBACK=1

if [ $FORCE = 1 ]; then
  CHANGED=$(printf 'api/\nclient/\n')
else
  CHANGED=$(git diff --name-only "$OLD" "$TARGET")
  echo "Commits nuevos:"; git log --oneline "$OLD..$TARGET" | sed 's/^/  /'
fi
changed() { echo "$CHANGED" | grep -qE "$1"; }

if changed '^deploy/systemd/'; then
  echo "==> actualizo servicios systemd"
  cp deploy/systemd/* "$HOME/.config/systemd/user/" && systemctl --user daemon-reload || fail "no se pudieron instalar los servicios"
  UNITS=1
fi

# --- migraciones --------------------------------------------------------------
dbenv() { grep -E "^$1=" api/.env | tail -1 | cut -d= -f2- | tr -d '\r' | sed -E "s/^[\"'](.*)[\"']$/\1/"; }
export PGHOST=$(dbenv DB_HOST) PGUSER=$(dbenv DB_USER) PGPASSWORD=$(dbenv DB_PASSWORD) PGDATABASE=$(dbenv DB_NAME)
export PGPORT=$(dbenv DB_PORT); PGPORT=${PGPORT:-5432}

APPLIED=$($PSQL -At -c "select filename from schema_migrations" 2>&1) \
  || fail "no se pudo leer schema_migrations: $APPLIED"
PENDING=""
for f in $(ls api/migrations | grep -E '^[0-9]{3}_.*\.sql$' | sort); do
  echo "$APPLIED" | grep -qxF "$f" || PENDING="$PENDING $f"
done

if [ -n "$PENDING" ]; then
  BACKUP="$STATE/backups/$PGDATABASE-$STAMP.dump"
  echo "==> backup de la base: $BACKUP"
  $PG_DUMP -Fc -f "$BACKUP" || { rm -f "$BACKUP"; fail "fallo el backup (no se aplico ninguna migracion)"; }
  ls -1t "$STATE"/backups/*.dump | tail -n +$((KEEP_BACKUPS + 1)) | xargs -r rm -f
  for f in $PENDING; do
    echo "==> migracion $f"
    $PSQL -v ON_ERROR_STOP=1 -f "api/migrations/$f" || fail "fallo la migracion $f (backup previo: $BACKUP)"
    $PSQL -q -v ON_ERROR_STOP=1 -c "insert into schema_migrations (filename, commit) values ('$f', '$(git rev-parse --short HEAD)')" \
      || fail "$f se aplico pero no se pudo registrar en schema_migrations"
    MIGRATED="$MIGRATED $f"
  done
fi

# --- dependencias y build -----------------------------------------------------
if changed '^api/(package\.json|pnpm-lock\.yaml)$'; then
  echo "==> pnpm install (api)"
  API_DEPS=1
  (cd api && pnpm install --frozen-lockfile) || fail "fallo pnpm install en api"
fi
if changed '^client/(package\.json|pnpm-lock\.yaml)$'; then
  echo "==> pnpm install (client)"
  (cd client && pnpm install --frozen-lockfile) || fail "fallo pnpm install en client"
fi
if changed '^client/'; then
  echo "==> build client"
  # Se compila aparte: vite preview sigue sirviendo dist hasta el swap.
  (cd client && pnpm exec tsc -b && pnpm exec vite build --outDir dist_new --emptyOutDir) \
    || fail "fallo el build del client"
  NEW_DIST=1
fi

# --- reinicio -----------------------------------------------------------------
if changed '^api/' || [ $UNITS = 1 ]; then
  echo "==> reinicio API"
  API_RESTARTED=1
  systemctl --user restart salvatore-api
  sleep 2
  wait_port $API_PORT 30 && sleep 3 && systemctl --user is-active -q salvatore-api \
    || fail "la API no levanto en :$API_PORT (ver: journalctl --user -u salvatore-api)"
  echo "API escuchando en :$API_PORT"
fi

if [ $NEW_DIST = 1 ]; then
  echo "==> publico client"
  (cd client && rm -rf dist_old && mv dist dist_old && mv dist_new dist && rm -rf dist_old)
fi
if [ $UNITS = 1 ]; then
  systemctl --user restart salvatore-client
  wait_port $CLIENT_PORT 30 || echo "AVISO: el client no levanto en :$CLIENT_PORT"
fi

# --- fin ----------------------------------------------------------------------
rm -f "$STATE/failed_commit"
MSG="OK"
[ -n "$MIGRATED" ] && MSG="migraciones aplicadas:$MIGRATED"
write_status OK "$MSG"
ls -1t "$STATE"/logs/*.log | tail -n +$((KEEP_LOGS + 1)) | xargs -r rm -f
echo "=== OK: servidor en $(git log --oneline -1) ($MSG)"
