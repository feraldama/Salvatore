# Reglas del Proyecto — JWF Mobile

## Visión

App móvil transversal de JWF Signage. Cuatro módulos operativos en una sola app, separados por rol del usuario logueado:

1. **Asistencias técnicas** a pantallas DOOH (técnico, admin) — contra backend del CMS
2. **Carga de facturas** de caja chica (comercial, admin) — contra ERP, módulo `fin`
3. **Vehículos y km** (chofer, admin) — contra ERP, requiere `gen_vehiculo` y `gen_viaje` (no existen hoy)
4. **Modo trabajo / GPS auditoría** (todos los no-admin) — contra ERP, solo horario laboral

La app **no tiene backend propio**. Habla directo con el ERP (`:3001`) y el backend del CMS (`:4000`). Ambos validan el mismo JWT del ERP (comparten `JWT_SECRET`).

## Arquitectura

- Repo independiente, sin workspaces. `npm install` directo en la raíz.
- Carpeta `lib/` para lógica reutilizable (`api/`, `auth/`, `config.ts`).
- Carpeta `providers/` para context providers globales (Query, Auth).
- Carpeta `app/` con file-based routing de Expo Router 6.
- Frontend NUNCA llama directo a Postgres ni a APIs externas que no sean ERP/CMS. Todo lo que sea integración nueva pasa por endpoints en alguno de esos dos backends.
- NUNCA exponer API keys en el cliente. Las únicas envs públicas son las URLs de ERP y CMS (`EXPO_PUBLIC_*`).

## Stack

- **Expo SDK 54** (managed) + **React Native 0.81** + **React 19.1**
- **TypeScript** strict
- **Expo Router 6** (file-based)
- **TanStack Query 5** (server state)
- **axios** con interceptores (Bearer token + auto-logout en 401/403)
- **expo-secure-store** (JWT en keystore/keychain)
- **EAS Build** + **EAS Update** para distribución

Path alias `@/*` apunta a la raíz del proyecto.

## Integración con ERP y CMS (regla de oro)

**Auth siempre via ERP.** Endpoint: `POST /api/gen/auth/login` con `{ login, password }`. Response `{ token, user{...isAdmin, roles[].rol_codigo, modulos[]} }`. El token va como `Authorization: Bearer <token>` en cada request a ambos backends.

**Endpoints por módulo:**
- Auth, facturas, vehículos, GPS → **ERP** (`erpClient` en `lib/api/client.ts`)
- Asistencias técnicas a pantallas → **CMS** (`cmsClient` en `lib/api/client.ts`)

**Cuando falte un endpoint**, NO se hackea desde la app. Se agrega en el backend correspondiente (ERP en `D:\Repos\ERP\backend\src\modules\<modulo>\` o CMS en `D:\Repos\CMS\backend\src\controllers/`). Para entender los flujos comerciales/fiscales del ERP, leer código en `D:\Repos\ERP` (no asumir).

**Datos del usuario** vienen del JWT y/o `GET /api/gen/auth/me` del ERP. La app no inventa roles ni datos.

## Roles

Los roles los administra el ERP en la tabla `auth.roles` (campo `CODIGO`). La mobile usa los **del ERP** (admin, TECNICO, COMERCIAL, CHOFER, etc.), **distintos** de los del CMS (admin/cliente).

Gating en código: `useRoles()` de `lib/auth/AuthContext.tsx` expone `isAdmin`, `isTecnico`, `isComercial`, `isChofer`, `hasRole(codigo)`. La UI gate-ea por estos helpers, NO por nombres hardcodeados de usuario.

`isAdmin` da acceso a todo. Los demás roles ven solo sus módulos.

## Decisiones cerradas (no re-discutir sin pedir confirmación)

- **GPS solo en horario laboral**, modo trabajo activable por el usuario. No tracking 24/7.
- **Retención ubicaciones:** 90 días en `gen_ubicacion_usuario` del ERP.
- **Asistencias contra CMS**, no contra ERP.
- **Fotos en filesystem local del backend** (patrón `backend/uploads/...`), no S3 ni Cloudinary. La DB guarda solo el path.
- **Sin OCR** de facturas en V1.
- **Android primero**, iOS preparado pero sin publicar.

## Versionado del APK

- **Cada vez que se genera un APK de release, bumpear la versión** (por defecto patch: `1.0.0` → `1.0.1`). Confirmar con el usuario si corresponde minor/major.
- **Tres lugares deben quedar sincronizados** con el mismo `versionName`:
  - `app.json` → `expo.version`
  - `package.json` → `version`
  - `android/app/build.gradle` → `versionName`
- **`android/app/build.gradle` → `versionCode`** se incrementa en `+1` siempre (entero, requerido por Android para reconocer updates).
- La versión se muestra al pie del login (`app/login.tsx`) leyendo `Constants.expoConfig?.version` de `expo-constants`. No hardcodear el string.
- Recordatorio: `.env` no es input de Gradle. Si los cambios fueron solo en `.env`, además del bump hay que borrar el bundle JS (`android/app/build/generated/assets/createBundleReleaseJsAndAssets/`) antes de `assembleRelease` para que se regenere.

## Naming y convenciones

- Archivos de componentes y rutas: **kebab-case** (`asistencia-detalle.tsx`).
- Variables/funciones: **camelCase**.
- Tipos/interfaces/componentes: **PascalCase**.
- Módulos no-componente: **dot.separator** (`auth.context.tsx`, `erp.client.ts`).
- Tablas nuevas en CMS: prefijo `cms_`, snake_case, en español.
- Tablas nuevas en ERP: respetar la convención del ERP (mayúsculas con comillas dobles, ej: `"VEH_PLACA"`).
- Mensajes de UI y commits: **español**.

## Ramas y commits

- Todo el desarrollo va en **`develop`**. `main` queda para producción.
- Commits en **español**, imperativo o descriptivo breve. Ej: «Añade pantalla de detalle de asistencia», «Corrige redirect tras logout».
- Evitar inglés salvo nombres de APIs, librerías o términos técnicos sin traducción clara.

## Código

- **Separadores de miles (OBLIGATORIO)**: todo valor numérico que el chofer ve debe formatearse con locale `es-PY` (`12.345`). Aplica a UI, mensajes de `Alert.alert`, push notifications. **No** a IDs internos, hashes, lat/lng. Patrón: `n.toLocaleString('es-PY', { maximumFractionDigits: 2 })`. Hermes (RN 0.71+) tiene Intl, así que funciona sin polyfill. Para los textos del backend que se muestran en alerts, el backend ya devuelve los números formateados.
- **Inputs numéricos (OBLIGATORIO)**: cualquier `TextInput` que captura un número (km, litros, monto, conteos) debe usar el componente `NumberInput` de `@/components/ui/NumberInput` — formatea con separadores **en vivo** mientras el chofer escribe. Acepta `allowDecimal` cuando corresponda (litros, cantidades fraccionarias). El parent maneja el value como string raw (sin separadores) y al enviar al backend usa `Number(value)` directo. No usar `TextInput` con `keyboardType="numeric"` desnudo cuando se trata de magnitudes — solo OK para IDs cortos / pin codes / códigos de barra.
- **Manejo de errores:** centralizado vía interceptor de axios. Errores de UI se muestran con `Alert.alert` o componente de error específico, no con `console.log` silencioso. Para extraer el `message` real del backend del axios error usar `getApiErrorMessage(err)` de `@/lib/api/errors` — `err.message` directo da el genérico "Request failed with status code 400".
- **Sin abstracciones prematuras.** Tres usos antes de extraer un helper.
- **Sin error handling especulativo** para escenarios que no pueden ocurrir.
- **Validar solo en los límites del sistema** (input del usuario, response de API).
- **Comentarios** solo cuando la lógica no sea evidente. Nada de docblocks que repiten el nombre de la función.
- **Fechas**: si se reciben strings `YYYY-MM-DD` desde el backend, no parsear con `new Date(s)` — la zona horaria de Paraguay (UTC-4) corre el día. Usar parseo explícito local.
- **Offline-first** donde corresponda. Asistencias y proof-of-work del técnico se cargan local primero (cola en `expo-sqlite`) y sincronizan cuando hay red. El usuario no debería esperar al servidor para crear el ticket.
- **Cámara y storage**: comprimir imágenes con `expo-image-manipulator` antes de subir; el backend recibe multipart y guarda en disco con nombre uuid.

## Estructura de carpetas

```
/app                      Rutas (Expo Router)
  /_layout.tsx            QueryProvider + AuthProvider + AuthGate
  /login.tsx              Pantalla de login
  /(tabs)/                Tabs autenticadas
    /_layout.tsx          Tab bar (Inicio, Cuenta y futuras: Asistencias, Vehículos, …)
    /index.tsx            Home con módulos por rol
    /explore.tsx          Cuenta y logout

/lib
  /config.ts              Lectura de env (EXPO_PUBLIC_*)
  /api
    /client.ts            erpClient + cmsClient (axios + interceptores)
    /<modulo>.ts          Una función por endpoint (auth.ts, asistencias.ts, …)
  /auth
    /types.ts             Tipos del JWT/usuario
    /token.ts             SecureStore wrapper
    /AuthContext.tsx      useAuth() + useRoles()
  /<feature>              Helpers específicos por feature

/providers                Context providers globales
/components               UI reutilizable
/hooks                    Hooks reutilizables
```

## Eficiencia de contexto

- No volver a leer archivos ya leídos en esta sesión salvo que hayan cambiado.
- Saltar archivos > 100 KB salvo que sean necesarios para la tarea.
- Sugerir nueva sesión cuando el tema cambia radicalmente (ej: pasar de Fase 1 asistencias a Fase 4 GPS).
- Nada de aperturas aduladoras ni cierres tipo "¡espero que te sirva!".

## Seguridad

- Nunca commitear `.env`, credenciales o API keys (ya está en `.gitignore`).
- Token en `expo-secure-store` (Android keystore / iOS keychain), nunca en `AsyncStorage` ni en archivo plano.
- Logout = borrar token + user del SecureStore + setear user = null en el contexto.
- Permisos de cámara, ubicación y storage: pedir solo cuando se van a usar (no al arranque).
- GPS background: pedir consentimiento explícito en pantalla de onboarding antes de activar `expo-task-manager`.

## Cuando algo no esté claro

- Para el ERP: leer `D:\Repos\ERP\backend\src\modules\<modulo>\` o `D:\Repos\ERP\CLAUDE.md`.
- Para el CMS: leer `D:\Repos\CMS\CLAUDE.md`.
- Para el plan general (fases, estado, decisiones): leer `ONBOARDING.md` de este repo.
