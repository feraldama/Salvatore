import api from "./api";
import type { AxiosError } from "axios";

// Las tablas flota_* son snake_case (contrato de la app mobile); el backend las
// devuelve sin remapear a PascalCase, por eso las interfaces usan snake_case.

const fail = (error: unknown, msg: string) => {
  const axiosError = error as AxiosError<{ message?: string }>;
  return axiosError.response?.data || { message: msg };
};

// ── Vehículos ───────────────────────────────────────────────────────────────
export interface VehiculoFlota {
  id: number;
  chapa: string;
  marca: string | null;
  modelo: string | null;
}

// Versión completa para el ABM (incluye km, estado y cantidad de choferes).
export interface VehiculoFlotaFull extends VehiculoFlota {
  km_actual: number;
  activo: boolean;
  choferes: number;
}

export interface VehiculoInput {
  chapa: string;
  marca?: string | null;
  modelo?: string | null;
  km_actual?: number;
  activo?: boolean;
}

// Vehículos activos (POS: selector de envío). Versión liviana.
export const getVehiculosActivos = async (): Promise<VehiculoFlota[]> => {
  try {
    const response = await api.get("/gen/flota/vehiculos");
    return response.data;
  } catch (error) {
    throw fail(error, "Error al obtener vehículos");
  }
};

// Todos los vehículos (ABM dashboard, incluye inactivos).
export const getVehiculosAdmin = async (): Promise<VehiculoFlotaFull[]> => {
  try {
    const response = await api.get("/gen/flota/vehiculos", {
      params: { all: 1 },
    });
    return response.data;
  } catch (error) {
    throw fail(error, "Error al obtener vehículos");
  }
};

export const createVehiculo = async (data: VehiculoInput) => {
  try {
    const response = await api.post("/gen/flota/vehiculos", data);
    return response.data;
  } catch (error) {
    throw fail(error, "Error al crear vehículo");
  }
};

export const updateVehiculo = async (id: number, data: VehiculoInput) => {
  try {
    const response = await api.put(`/gen/flota/vehiculos/${id}`, data);
    return response.data;
  } catch (error) {
    throw fail(error, "Error al actualizar vehículo");
  }
};

export const deleteVehiculo = async (id: number) => {
  try {
    const response = await api.delete(`/gen/flota/vehiculos/${id}`);
    return response.data;
  } catch (error) {
    throw fail(error, "Error al eliminar vehículo");
  }
};

// ── Asignación de choferes al vehículo ──────────────────────────────────────
export const getChoferesDeVehiculo = async (
  vehiculoId: number,
): Promise<string[]> => {
  try {
    const response = await api.get(
      `/gen/flota/vehiculos/${vehiculoId}/choferes`,
    );
    return response.data;
  } catch (error) {
    throw fail(error, "Error al obtener choferes del vehículo");
  }
};

export const setChoferesDeVehiculo = async (
  vehiculoId: number,
  choferIds: string[],
) => {
  try {
    const response = await api.put(
      `/gen/flota/vehiculos/${vehiculoId}/choferes`,
      { choferIds },
    );
    return response.data;
  } catch (error) {
    throw fail(error, "Error al asignar choferes");
  }
};

// ── Documentos ──────────────────────────────────────────────────────────────
export interface DocumentoFlota {
  id: number;
  tipo: string;
  vencimiento: string | null;
  activo: boolean;
}

export interface DocumentoInput {
  tipo: string;
  vencimiento?: string | null;
}

export const getDocsVehiculo = async (
  vehiculoId: number,
): Promise<DocumentoFlota[]> => {
  try {
    const response = await api.get(
      `/gen/flota/vehiculos/${vehiculoId}/documentos`,
    );
    return response.data;
  } catch (error) {
    throw fail(error, "Error al obtener documentos");
  }
};

export const createDocVehiculo = async (
  vehiculoId: number,
  data: DocumentoInput,
) => {
  try {
    const response = await api.post(
      `/gen/flota/vehiculos/${vehiculoId}/documentos`,
      data,
    );
    return response.data;
  } catch (error) {
    throw fail(error, "Error al crear documento");
  }
};

export const deleteDocVehiculo = async (docId: number) => {
  try {
    const response = await api.delete(`/gen/flota/documentos-vehiculo/${docId}`);
    return response.data;
  } catch (error) {
    throw fail(error, "Error al eliminar documento");
  }
};

export const getDocsChofer = async (
  usuarioId: string,
): Promise<DocumentoFlota[]> => {
  try {
    const response = await api.get(
      `/gen/flota/choferes/${encodeURIComponent(usuarioId)}/documentos`,
    );
    return response.data;
  } catch (error) {
    throw fail(error, "Error al obtener documentos");
  }
};

export const createDocChofer = async (
  usuarioId: string,
  data: DocumentoInput,
) => {
  try {
    const response = await api.post(
      `/gen/flota/choferes/${encodeURIComponent(usuarioId)}/documentos`,
      data,
    );
    return response.data;
  } catch (error) {
    throw fail(error, "Error al crear documento");
  }
};

export const deleteDocChofer = async (docId: number) => {
  try {
    const response = await api.delete(`/gen/flota/documentos-chofer/${docId}`);
    return response.data;
  } catch (error) {
    throw fail(error, "Error al eliminar documento");
  }
};

// ── Choferes (usuarios con perfil CHOFER) ───────────────────────────────────
export interface Chofer {
  usuario_id: string;
  nombre: string;
  apellido: string | null;
  correo: string | null;
  estado: string; // 'A' | 'I'
  local_id: number | null;
  local_nombre: string | null;
  vehiculos: number;
}

export interface ChoferInput {
  UsuarioId: string;
  UsuarioNombre: string;
  UsuarioApellido?: string;
  UsuarioCorreo?: string;
  UsuarioContrasena?: string;
  UsuarioEstado?: string; // 'A' | 'I'
  LocalId: number;
}

export const getChoferes = async (): Promise<Chofer[]> => {
  try {
    const response = await api.get("/gen/flota/choferes");
    return response.data;
  } catch (error) {
    throw fail(error, "Error al obtener choferes");
  }
};

export const createChofer = async (data: ChoferInput) => {
  try {
    const response = await api.post("/gen/flota/choferes", data);
    return response.data;
  } catch (error) {
    throw fail(error, "Error al crear chofer");
  }
};

export const updateChofer = async (usuarioId: string, data: ChoferInput) => {
  try {
    const response = await api.put(
      `/gen/flota/choferes/${encodeURIComponent(usuarioId)}`,
      data,
    );
    return response.data;
  } catch (error) {
    throw fail(error, "Error al actualizar chofer");
  }
};

export const deleteChofer = async (usuarioId: string) => {
  try {
    const response = await api.delete(
      `/gen/flota/choferes/${encodeURIComponent(usuarioId)}`,
    );
    return response.data;
  } catch (error) {
    throw fail(error, "Error al eliminar chofer");
  }
};
