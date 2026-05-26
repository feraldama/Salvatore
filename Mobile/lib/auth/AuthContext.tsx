import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import * as authApi from '@/lib/api/auth';
import { setUnauthorizedHandler } from '@/lib/api/client';
import {
  clearToken,
  clearUser,
  getToken,
  getUser,
  saveToken,
  saveUser,
} from './token';
import type { LoginInput, Usuario } from './types';

// Códigos reales de auth.roles del ERP. Se comparan en MAYÚSCULA contra
// rol_codigo del usuario (que también se uppercaserá). Si en el ERP se crean
// nuevos roles que deban acceder a la app, agregarlos acá.
const ROLES_PERMITIDOS = [
  'TECNICO',
  'EJECUTIVO_COMERCIAL',
  'GERENTE_COMERCIAL',
  'SUPERVISION_COMERCIAL',
  'CHOFER',
  'GERENTE_DE_OPERACIONES',
] as const;

const ROLES_COMERCIAL = ['EJECUTIVO_COMERCIAL', 'GERENTE_COMERCIAL', 'SUPERVISION_COMERCIAL'] as const;

function tienePermisoApp(user: Usuario): boolean {
  if (user.isAdmin) return true;
  const codigos = (user.roles ?? []).map((r) => r.rol_codigo?.toUpperCase());
  return ROLES_PERMITIDOS.some((c) => codigos.includes(c));
}

interface AuthContextValue {
  user: Usuario | null;
  isLoading: boolean;
  signIn: (input: LoginInput) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<Usuario | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setUnauthorizedHandler(async () => {
      // Cuando el server devuelve 401 (JWT expirado o revocado), detenemos
      // el tracking GPS antes de limpiar el estado: si la app está en
      // background, el useEffect del hook puede no re-ejecutarse al instante
      // y el foreground service de Android seguiría consumiendo batería y
      // encolando puntos que no podemos enviar.
      //
      // NO vaciamos la cola — los puntos pendientes quedan etiquetados con
      // el usuario_id que los generó. Si el MISMO chofer vuelve a loguearse,
      // se drenan correctamente. Si se loguea otro, el sender los descarta.
      try {
        const { detenerTracking } = await import('@/lib/flota/tracker');
        await detenerTracking();
      } catch {
        /* no bloquear el limpiado de auth si la limpieza no crítica falla */
      }
      setUser(null);
    });
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const token = await getToken();
        if (!token) return;

        const cached = await getUser<Usuario>();
        if (cached) setUser(cached);

        try {
          const fresh = await authApi.fetchMe();
          if (!tienePermisoApp(fresh)) {
            await clearToken();
            await clearUser();
            setUser(null);
            return;
          }
          setUser(fresh);
          await saveUser(fresh);
        } catch {
          // si /me falla por red dejamos el cached; si fue 401 el interceptor ya limpio
        }
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const signIn = useCallback(async (input: LoginInput) => {
    const { token, user: loggedUser } = await authApi.login(input);
    if (!tienePermisoApp(loggedUser)) {
      throw new Error('Tu usuario no tiene permiso para usar esta app. Contactá al administrador.');
    }
    await saveToken(token);
    await saveUser(loggedUser);
    // Marcar al nuevo user como dueño del tracking. Si había puntos en la
    // cola de otro chofer (su sesión expiró y este es un cambio de turno en
    // el mismo celu), el sender los detectará al drenar y los descartará
    // sin enviarlos con el JWT del actual — evita contaminación cruzada.
    try {
      const { setUsuarioTracking } = await import('@/lib/flota/sesion-tracking');
      await setUsuarioTracking(loggedUser.id);
    } catch {
      /* no bloquear el login si la limpieza no crítica falla */
    }
    setUser(loggedUser);
  }, []);

  const signOut = useCallback(async () => {
    // Detenemos el tracking de viaje y limpiamos las colas offline. Si quedaban
    // puntos GPS o un cierre pendiente del usuario anterior, no queremos
    // dispararlos contra el JWT del próximo login — podrían pegar a un viaje
    // de otra persona.
    try {
      const { detenerTracking } = await import('@/lib/flota/tracker');
      await detenerTracking();
      const { vaciar } = await import('@/lib/flota/ubicacion-queue');
      await vaciar();
      const { limpiar } = await import('@/lib/flota/cierre-pendiente');
      await limpiar();
    } catch {
      /* no bloquear el logout si fallan limpiezas no críticas */
    }
    await clearToken();
    await clearUser();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}

export function useRoles() {
  const { user } = useAuth();
  const codigos = (user?.roles ?? [])
    .map((r) => r.rol_codigo?.toUpperCase())
    .filter(Boolean) as string[];
  const isAdmin = !!user?.isAdmin;
  const has = (codigo: string) => isAdmin || codigos.includes(codigo.toUpperCase());
  // "Comercial" agrupa los tres códigos reales del ERP que conceptualmente
  // tienen el mismo permiso de marcación mobile (ejecutivo, gerente, supervisor).
  const isComercial = isAdmin || ROLES_COMERCIAL.some((c) => codigos.includes(c));

  // El gerente de operaciones tiene visibilidad de toda la flota: live,
  // atención requerida, detalle de viajes (linkable desde push). NO conduce
  // (no es CHOFER) pero monitoreaz.
  const isGerenteFlota = isAdmin || codigos.includes('GERENTE_DE_OPERACIONES');

  return {
    codigos,
    isAdmin,
    hasRole: has,
    isTecnico: has('TECNICO'),
    isComercial,
    isChofer: has('CHOFER'),
    isGerenteFlota,
  };
}
