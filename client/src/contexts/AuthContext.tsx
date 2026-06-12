import { useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import type { ReactNode } from "react";
import { AuthContext } from "./AuthContextDef";
import { getEmpresasAccesibles, type Empresa } from "../services/empresas.service";
import { getLocalesAccesibles, type LocalSucursal } from "../services/locales.service";

export interface User {
  id: string;
  nombre: string;
  email: string;
  LocalId?: number;
  LocalNombre?: string;
  AlmacenId?: number | null;
  isAdmin?: string;
  EmpresaId?: number;
  // Tipo de empresa del usuario derivado de su local ('M' minorista, 'D' distribuidora).
  EmpresaTipo?: string;
}

interface Credentials {
  email: string;
  password: string;
}

interface PermisosPorMenu {
  [menu: string]: {
    crear: boolean;
    editar: boolean;
    eliminar: boolean;
    leer: boolean;
  };
}

interface AuthContextType {
  user: User | null;
  permisos: PermisosPorMenu;
  empresas: Empresa[];
  empresaActiva: Empresa | null;
  setEmpresaActiva: (empresaId: number) => void;
  // Sucursales de la empresa activa y la sucursal seleccionada (null = todas).
  // Solo aplica a admins; los usuarios regulares quedan fijos a su local.
  locales: LocalSucursal[];
  localActiva: LocalSucursal | null;
  setLocalActiva: (localId: number | null) => void;
  login: (credentials: Credentials) => Promise<void>;
  logout: () => void;
  loading: boolean;
}

interface AuthProviderProps {
  children: ReactNode;
}

// Persiste el id de empresa activa para que el interceptor de axios lo lea.
function persistEmpresaActivaId(id: number | null) {
  if (id == null) {
    localStorage.removeItem("empresaActivaId");
  } else {
    localStorage.setItem("empresaActivaId", String(id));
  }
}

// Persiste la sucursal activa (X-Local-Id). null = todas las sucursales.
function persistLocalActivoId(id: number | null) {
  if (id == null) {
    localStorage.removeItem("localActivoId");
  } else {
    localStorage.setItem("localActivoId", String(id));
  }
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(() => {
    const stored = localStorage.getItem("user");
    return stored ? JSON.parse(stored) : null;
  });
  const [permisos, setPermisos] = useState<PermisosPorMenu>(() => {
    const stored = localStorage.getItem("permisos");
    return stored ? JSON.parse(stored) : {};
  });
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [empresaActivaId, setEmpresaActivaIdState] = useState<number | null>(() => {
    const stored = localStorage.getItem("empresaActivaId");
    return stored ? Number(stored) : null;
  });
  const [locales, setLocales] = useState<LocalSucursal[]>([]);
  const [localActivaId, setLocalActivaIdState] = useState<number | null>(() => {
    const stored = localStorage.getItem("localActivoId");
    return stored ? Number(stored) : null;
  });
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const isAdmin = user?.isAdmin === "S";

  const empresaActiva =
    empresas.find((e) => e.EmpresaId === empresaActivaId) ?? null;
  const localActiva =
    locales.find((l) => l.LocalId === localActivaId) ?? null;

  // Carga las empresas accesibles cuando hay un usuario logueado.
  const cargarEmpresas = useCallback(async (usuario: User | null) => {
    if (!usuario) {
      setEmpresas([]);
      return;
    }
    try {
      const lista = await getEmpresasAccesibles();
      setEmpresas(lista);
      // Resolver empresa activa: la guardada si sigue siendo válida, si no la primera.
      setEmpresaActivaIdState((prev) => {
        const sigueValida = prev != null && lista.some((e) => e.EmpresaId === prev);
        const elegida = sigueValida ? prev : lista[0]?.EmpresaId ?? null;
        persistEmpresaActivaId(elegida);
        return elegida;
      });
    } catch {
      setEmpresas([]);
    }
  }, []);

  // Al montar (sesión persistida), cargar empresas si ya hay usuario.
  useEffect(() => {
    if (user) cargarEmpresas(user);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setEmpresaActiva = useCallback((empresaId: number) => {
    setEmpresaActivaIdState(empresaId);
    persistEmpresaActivaId(empresaId);
    // Al cambiar de empresa, la sucursal seleccionada deja de ser válida.
    setLocalActivaIdState(null);
    persistLocalActivoId(null);
  }, []);

  const setLocalActiva = useCallback((localId: number | null) => {
    setLocalActivaIdState(localId);
    persistLocalActivoId(localId);
  }, []);

  // Carga las sucursales de la empresa activa (solo admins; los usuarios
  // regulares quedan fijos a su local del JWT, sin enviar X-Local-Id).
  useEffect(() => {
    let cancelado = false;
    if (!user || !isAdmin || empresaActivaId == null) {
      setLocales([]);
      persistLocalActivoId(null);
      setLocalActivaIdState(null);
      return;
    }
    (async () => {
      const lista = await getLocalesAccesibles();
      if (cancelado) return;
      setLocales(lista);
      // Si la sucursal guardada ya no pertenece a esta empresa, volver a "todas".
      setLocalActivaIdState((prev) => {
        const sigueValida = prev != null && lista.some((l) => l.LocalId === prev);
        const elegida = sigueValida ? prev : null;
        persistLocalActivoId(elegida);
        return elegida;
      });
    })();
    return () => {
      cancelado = true;
    };
  }, [user, isAdmin, empresaActivaId]);

  const login = async (credentials: Credentials) => {
    setLoading(true);
    try {
      const response = await fetch(
        import.meta.env.VITE_API_URL + "/usuarios/login",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(credentials),
        }
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Error al iniciar sesión");

      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));
      localStorage.setItem("permisos", JSON.stringify(data.permisos || {}));

      setUser(data.user);
      setPermisos(data.permisos || {});
      await cargarEmpresas(data.user);
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem("permisos");
    localStorage.removeItem("empresaActivaId");
    localStorage.removeItem("localActivoId");
    setUser(null);
    setPermisos({});
    setEmpresas([]);
    setEmpresaActivaIdState(null);
    setLocales([]);
    setLocalActivaIdState(null);
    navigate("/login");
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        permisos,
        empresas,
        empresaActiva,
        setEmpresaActiva,
        locales,
        localActiva,
        setLocalActiva,
        login,
        logout,
        loading,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export type { AuthContextType, PermisosPorMenu };
