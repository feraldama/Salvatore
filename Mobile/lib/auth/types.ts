export interface UsuarioRol {
  rol_id: number;
  rol_nombre: string;
  rol_codigo: string;
  ES_ADMIN: boolean;
}

export interface Usuario {
  id: number;
  nombre: string;
  email: string;
  isAdmin: boolean;
  empresa: number | null;
  empresaNombre: string | null;
  sucursal: number | null;
  sucursalNombre: string | null;
  departamentoId: number | null;
  cargo: string | null;
  avatarUrl?: string | null;
  roles: UsuarioRol[];
  modulos: string[];
  codigo: string | null;
  login: string | null;
}

export interface LoginInput {
  loginOrEmail: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: Usuario;
}
