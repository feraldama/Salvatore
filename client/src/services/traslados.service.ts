import api from "./api";
import type { AxiosError } from "axios";

// NUMERIC de Postgres llega como string ("1.000000", "75425.51"): solo BIGINT
// tiene parser propio en el adaptador. Por eso FactorCaja y los promedios se
// tipan como string | number y se normalizan con Number() al usarlos.
type Numerico = string | number;

export interface AlmacenTraslado {
  AlmacenId: number;
  AlmacenNombre: string;
  LocalId: number | null;
  LocalNombre: string | null;
  EmpresaId: number;
  EmpresaNombre: string;
  EmpresaTipo: string;
}

export interface ProductoTraslado {
  ProductoId: number;
  ProductoCodigo: number;
  ProductoNombre: string;
  ProductoCantidadCaja: number;
  ProductoPrecioPromedio: Numerico;
  EmpresaId: number;
  ProductoAlmacenStock: number;
  ProductoAlmacenStockUnitario: number;
  // Equivalencia hacia el almacén destino elegido (null = sin vincular).
  ProductoDestinoId: number | null;
  ProductoDestinoNombre: string | null;
  ProductoDestinoCantidadCaja?: number | null;
  FactorCaja: Numerico | null;
}

export interface TrasladoLinea {
  TrasladoId: number;
  TrasladoProductoId: number;
  ProductoOrigenId: number;
  ProductoDestinoId: number;
  ProductoOrigenNombre: string;
  ProductoDestinoNombre: string;
  TrasladoCantidadCaja: number;
  TrasladoCantidadUnidad: number;
  TrasladoUnidadesOrigen: number;
  TrasladoUnidadesDestino: number;
  TrasladoFactorCaja: Numerico;
  TrasladoCcOrigen: number;
  TrasladoCcDestino: number;
  TrasladoCostoCajaOrigen: Numerico;
}

export interface Traslado {
  TrasladoId: number;
  TrasladoFecha: string;
  TrasladoEstado: "B" | "E" | "C" | "A";
  TrasladoObs: string;
  AlmacenOrigenId: number;
  AlmacenDestinoId: number;
  AlmacenOrigenNombre: string;
  AlmacenDestinoNombre: string;
  EmpresaOrigenNombre: string;
  EmpresaDestinoNombre: string;
  UsuarioId: string | null;
  TrasladoAnuladoFecha: string | null;
  TrasladoAnuladoUsuarioId: string | null;
  TrasladoCantidadProductos?: number;
  productos?: TrasladoLinea[];
}

export interface Equivalencia {
  ProductoOrigenId: number;
  ProductoDestinoId: number;
  ProductoOrigenNombre: string;
  ProductoDestinoNombre: string;
  ProductoCantidadCaja: number;
  ProductoPrecioPromedio: Numerico;
  ProductoDestinoCantidadCaja: number;
  ProductoDestinoPrecioPromedio: Numerico;
  ProductoDestinoEstado: "A" | "I";
  FactorCaja: Numerico;
  EquivalenciaConfianza: "A" | "R";
  EquivalenciaOrigen: "S" | "M";
  EquivalenciaFecha: string;
}

export interface TrasladoFilters {
  almacenOrigenId?: number | string;
  almacenDestinoId?: number | string;
  estado?: string;
  desde?: string;
  hasta?: string;
}

const fallar = (error: unknown, mensaje: string) => {
  const axiosError = error as AxiosError<{ message?: string }>;
  throw axiosError.response?.data || { message: mensaje };
};

export const getAlmacenesTraslado = async (): Promise<AlmacenTraslado[]> => {
  try {
    const { data } = await api.get("/traslados/almacenes");
    return data.data ?? [];
  } catch (error) {
    return fallar(error, "Error al obtener los almacenes");
  }
};

export const getProductosTraslado = async (
  almacenId: number,
  almacenDestinoId?: number,
  q = ""
): Promise<ProductoTraslado[]> => {
  try {
    const { data } = await api.get("/traslados/productos", {
      params: { almacenId, almacenDestinoId, q: q || undefined },
    });
    return data.data ?? [];
  } catch (error) {
    return fallar(error, "Error al obtener los productos del almacén");
  }
};

// Catálogo completo de una empresa (sin almacén). Lo usa la pantalla de
// equivalencias: un vínculo entre catálogos vale para todos los almacenes.
export const getProductosDeEmpresa = async (
  empresaId: number,
  opts: {
    empresaDestinoId?: number;
    q?: string;
    soloSinEquivalencia?: boolean;
  } = {}
): Promise<ProductoTraslado[]> => {
  try {
    const { data } = await api.get("/traslados/productos-empresa", {
      params: {
        empresaId,
        empresaDestinoId: opts.empresaDestinoId,
        q: opts.q || undefined,
        soloSinEquivalencia: opts.soloSinEquivalencia ? "true" : undefined,
      },
    });
    return data.data ?? [];
  } catch (error) {
    return fallar(error, "Error al obtener el catálogo de la empresa");
  }
};

export const getTraslados = async (
  page = 1,
  limit = 10,
  filters: TrasladoFilters = {}
) => {
  try {
    const { data } = await api.get("/traslados", {
      params: { page, limit, ...filters },
    });
    return data;
  } catch (error) {
    return fallar(error, "Error al obtener los traslados");
  }
};

export const getTrasladoById = async (id: number | string): Promise<Traslado> => {
  try {
    const { data } = await api.get(`/traslados/${id}`);
    return data;
  } catch (error) {
    return fallar(error, "Error al obtener el traslado");
  }
};

export const crearTraslado = async (payload: {
  AlmacenOrigenId: number;
  AlmacenDestinoId: number;
  TrasladoObs?: string;
  Productos: {
    ProductoOrigenId: number;
    CantidadCaja: number;
    CantidadUnidad: number;
  }[];
}) => {
  try {
    const { data } = await api.post("/traslados", payload);
    return data;
  } catch (error) {
    return fallar(error, "Error al confirmar el traslado");
  }
};

// Anula (no borra): el traslado queda con estado 'A' y el stock vuelve al
// origen. El promedio del destino NO se revierte.
export const anularTraslado = async (id: number | string) => {
  try {
    const { data } = await api.delete(`/traslados/${id}`);
    return data;
  } catch (error) {
    return fallar(error, "Error al anular el traslado");
  }
};

export const getEquivalencias = async (
  empresaOrigenId: number,
  empresaDestinoId: number,
  opts: { q?: string; soloRevisar?: boolean; page?: number; limit?: number } = {}
) => {
  try {
    const { data } = await api.get("/traslados/equivalencias", {
      params: {
        empresaOrigenId,
        empresaDestinoId,
        q: opts.q || undefined,
        soloRevisar: opts.soloRevisar ? "true" : undefined,
        page: opts.page ?? 1,
        limit: opts.limit ?? 50,
      },
    });
    return data;
  } catch (error) {
    return fallar(error, "Error al obtener las equivalencias");
  }
};

// Guarda el vínculo en LOS DOS sentidos (el backend calcula el factor
// recíproco), así las devoluciones desde el destino también resuelven.
export const guardarEquivalencia = async (payload: {
  ProductoOrigenId: number;
  ProductoDestinoId: number;
  FactorCaja: number;
}) => {
  try {
    const { data } = await api.post("/traslados/equivalencias", payload);
    return data;
  } catch (error) {
    return fallar(error, "Error al guardar la equivalencia");
  }
};

export const eliminarEquivalencia = async (
  origenId: number,
  destinoId: number
) => {
  try {
    const { data } = await api.delete(
      `/traslados/equivalencias/${origenId}/${destinoId}`
    );
    return data;
  } catch (error) {
    return fallar(error, "Error al eliminar la equivalencia");
  }
};
