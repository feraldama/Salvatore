# Onboarding — JWF Mobile

App móvil transversal de JWF Signage para operaciones de campo: asistencias técnicas a pantallas DOOH, carga de facturas de caja chica, control de km de vehículos y registro GPS auditado del personal en horario laboral.

> Si vas a usar Claude Code en este repo, primero leé `CLAUDE.md` (reglas del proyecto). Este documento es el onboarding para humanos.

---

## Visión del producto

Una sola app Android (preparada para iOS más adelante) que cubre 4 flujos operativos de la empresa, separados por rol del usuario logueado:

| Módulo | Rol que lo ve | Qué hace |
|---|---|---|
| Asistencias técnicas | técnico, admin | Tickets de mantenimiento de las 19 pantallas DOOH (abrir, ver, marcar resuelto, fotos) |
| Carga de facturas | comercial, admin | Comprobantes de caja chica con foto del ticket |
| Vehículos y km | chofer, admin | Apertura/cierre de viajes con km inicial/final y foto del odómetro |
| Modo trabajo (GPS) | todos los no-admin | Tracking en background mientras el usuario activa "modo trabajo" durante su jornada |

**No tiene backend propio.** La app habla directamente con dos APIs ya existentes:
- ERP de JWF (`:3001/api/...`) — auth, facturas, vehículos, GPS
- Backend del CMS (`:4000/api/...`) — asistencias técnicas (tablas `cms_asistencias` etc.)

Ambos backends comparten el mismo `JWT_SECRET` y validan el mismo token.

---

## Stack

- **Expo SDK 54** (managed workflow) + **React Native 0.81** + **React 19.1**
- **TypeScript 5.9** estricto
- **Expo Router 6** (file-based, igual modelo mental que Next.js App Router)
- **TanStack Query 5** para server state
- **axios** con interceptores (Bearer token + manejo 401/403)
- **expo-secure-store** para persistir el JWT
- **EAS Build** + **EAS Update** (OTA) para distribución

Path alias `@/*` apunta al root del proyecto (configurado en `tsconfig.json`).

---

## Estructura del repo

```
Mobile/
├── .env / .env.example         URLs de ERP y CMS (gitignoreado)
├── app.json                    config de Expo (plugins, splash, icon)
├── app/                        rutas (file-based)
│   ├── _layout.tsx             root: providers + AuthGate (redirige login/tabs)
│   ├── login.tsx               pantalla de login
│   └── (tabs)/
│       ├── _layout.tsx         tab bar (Inicio + Cuenta)
│       ├── index.tsx           home con módulos visibles según rol
│       └── explore.tsx         datos del usuario + cerrar sesión
├── lib/
│   ├── config.ts               lectura de env vars
│   ├── api/
│   │   ├── client.ts           axios instances (erpClient, cmsClient)
│   │   └── auth.ts             login() y fetchMe() del ERP
│   └── auth/
│       ├── types.ts            Usuario, Rol, LoginInput/Response
│       ├── token.ts            wrapper de SecureStore
│       └── AuthContext.tsx     useAuth() + useRoles()
├── providers/
│   └── QueryProvider.tsx       TanStack Query
├── components/                 (template Expo: ThemedText, IconSymbol, etc.)
└── assets/                     iconos y splash
```

---

## Levantar el entorno de desarrollo

### Requisitos

- Node.js 20+ (probado con 24 LTS)
- npm 10+
- Android Studio con un AVD creado (recomendado: **Pixel 8, API 34**, x86_64, 4 GB RAM)
- App **Expo Go** instalada en el AVD o en un device físico
- Backend del ERP corriendo en `:3001` y backend del CMS en `:4000`, accesibles por la red

### Setup primera vez

```bash
git clone <url> D:\Repos\Mobile
cd D:\Repos\Mobile
npm install
cp .env.example .env
```

Editá `.env` y poné la **IP de la máquina donde corre el ERP**. Si la app va a correr en un device físico (mismo WiFi), usá la IP de la red local (`ipconfig` → IPv4 de la interfaz WiFi). `localhost` solo sirve para el AVD que corre en la misma máquina.

```env
EXPO_PUBLIC_ERP_API_URL=http://10.5.50.74:3001/api
EXPO_PUBLIC_CMS_API_URL=http://10.5.50.74:3003/api
EXPO_PUBLIC_CRM_API_URL=http://10.5.50.74:3005/api
```

### Comandos

| Comando | Qué hace |
|---|---|
| `npm run start` | levanta Metro y muestra QR para Expo Go |
| `npm run android` | bootea el AVD, instala Expo Go si falta y abre la app |
| `npm run web` | corre la app en el navegador (útil para iterar UI rápido) |
| `npm run lint` | ESLint con reglas de Expo |
| `npx tsc --noEmit` | type-check |
| `npx expo export --platform web` | bundle estático (smoke test) |

---

## Auth contra el ERP

La app no hace su propio JWT. Lo emite el ERP:

- **Endpoint:** `POST /api/gen/auth/login`
- **Body:** `{ login: string, password: string }` (también acepta `email`)
- **Response:** `{ token, user }` donde `user` trae `id`, `nombre`, `email`, `isAdmin`, `roles[]`, `modulos[]`, `codigo`, `login`, `empresa`, `sucursal`.

El token vive 24 h por defecto y se guarda en SecureStore (`lib/auth/token.ts`). El interceptor en `lib/api/client.ts` lo agrega como `Authorization: Bearer ...` en cada request. Si una respuesta vuelve 401/403, limpia el token y vuelve a `/login`.

`useAuth()` expone `user`, `isLoading`, `signIn()`, `signOut()`. `useRoles()` expone helpers booleanos: `isAdmin`, `isTecnico`, `isComercial`, `isChofer`, y un `hasRole(codigo)` genérico.

Los roles vienen del ERP (`auth.roles` con campo `CODIGO`). Es responsabilidad del admin del ERP crearlos y asignarlos. La app no hardcodea nombres de roles excepto en los helpers de `useRoles()`.

---

## Plan de fases

| Fase | Estado | Alcance |
|---|---|---|
| **0 — Bootstrap** | ✅ completa (2026-05-05) | Login, JWT, role gating, providers, navegación, AVD probado |
| **1 — Asistencias técnicas** | pendiente | Tablas `cms_asistencias`/`cms_asistencia_fotos`/`cms_asistencia_eventos`, endpoints REST, lista/detalle/crear, cámara, cola offline con `expo-sqlite` |
| **2 — Facturas caja chica** | pendiente | Investigar módulo `fin` del ERP, definir esquema de fondos+rendiciones, endpoint de carga con foto |
| **3 — Vehículos y km** | pendiente | Crear `gen_vehiculo` y `gen_viaje` en ERP (no existen hoy), CRUD admin en frontend Next del ERP, abrir/cerrar viaje en mobile |
| **4 — GPS auditoría** | pendiente | Tabla `gen_ubicacion_usuario`, `expo-location` + `expo-task-manager` background, modo trabajo activable, admin web con mapa de flota |

Decisiones cerradas con el cliente (no volver a discutir):
- GPS **solo en horario laboral** (modo trabajo activable por el usuario), no 24/7. Es para auditar vendedores/choferes.
- Retención de ubicaciones: **90 días**.
- Asistencias van contra el **CMS**, no el ERP.
- Fotos se guardan en **filesystem local del backend** (mismo patrón que `backend/uploads/player-demo/` del player Electron), no en S3/Cloudinary.
- Sin OCR de facturas en V1.
- Android primero. iOS preparado pero sin publicar todavía.

---

## Dependencias con otros repos

Este repo no es autónomo: necesita los servicios de los repos vecinos.

- **`D:\Repos\ERP`** — Node.js + Express + `pg` sin ORM, JWT auth en `:3001`. Para auth, facturas, vehículos, GPS. Para crear endpoints nuevos hay que tocar `backend/src/modules/<gen|fin|fac|...>/`.
- **`D:\Repos\CMS`** — Next.js 14 + Prisma + Postgres en `:4000`. Para asistencias técnicas. Las tablas nuevas se agregan vía migración Prisma en `backend/prisma/`.

ERP y CMS comparten la instancia Postgres `JWFSA` en schemas distintos (`"ERP"` vs `CMS`).

---

## Convenciones

- **Rama de trabajo:** `develop`. `main` queda reservada para producción.
- **Mensajes de commit:** en español, imperativo o descriptivo breve. Ej: «Añade pantalla de detalle de asistencia», «Corrige redirect tras logout».
- **Naming:** kebab-case para archivos de componentes, camelCase para variables/funciones, PascalCase para componentes/tipos. Tablas nuevas en CMS con prefijo `cms_` y en español snake_case.
- **Cursor pointer:** todos los elementos clickeables tienen `cursor: pointer` en web (no aplica en native pero el patrón se mantiene).
- **Comentarios:** solo cuando la lógica no sea evidente. Nada de comentarios que describen el qué.

---

## Próximos pasos para vos como dev nuevo

1. Cloná el repo y seguí la sección "Setup primera vez".
2. Abrí Android Studio, levantá el AVD Pixel 8 API 34.
3. Corré `npm run android` y validá que el login funciona contra un usuario real del ERP.
4. Pasale al equipo cualquier dato faltante para Fase 1 (esquema de `cms_asistencias`, flujo del técnico en campo).
5. Si vas a contribuir endpoints en el ERP o el CMS, leé los `CLAUDE.md` de cada uno (`D:\Repos\ERP\CLAUDE.md` y `D:\Repos\CMS\CLAUDE.md`).
