# JWF Mobile

App móvil de operaciones de campo para JWF Signage. Cuatro módulos en una sola app, separados por rol: asistencias técnicas a pantallas DOOH, carga de facturas de caja chica, control de km de vehículos y registro GPS auditado en horario laboral.

**Stack:** Expo SDK 54 + React Native 0.81 + TypeScript + Expo Router 6 + TanStack Query.

## Quick start

```bash
git clone <url> D:\Repos\Mobile
cd D:\Repos\Mobile
npm install
copy .env.example .env
```

Editá `.env` y poné la IP de la máquina donde corre el ERP (no `localhost` si vas a probar en celular).

```bash
npm run android   # AVD de Android Studio (recomendado: Pixel 8, API 34)
npm run start     # device físico — escaneá el QR con Expo Go
```

## Más info

- **`ONBOARDING.md`** — visión, fases, decisiones cerradas, cómo conecta con ERP y CMS, qué hacer como dev nuevo.
- **`CLAUDE.md`** — reglas del repo (auth, gating por rol, convenciones, naming, commits). Lo lee Claude Code automáticamente.

## Repos relacionados

| Repo | Rol |
|---|---|
| `D:\Repos\ERP` | Auth (JWT), facturas, vehículos, GPS. Backend en `:3001`. |
| `D:\Repos\CMS` | Asistencias técnicas a pantallas. Backend en `:4000`. |

Ambos backends comparten el mismo `JWT_SECRET` y validan el token que emite el ERP.

## Rama y commits

- Trabajo en `develop`. `main` queda para producción.
- Mensajes de commit en español, imperativo o descriptivo breve.
