import api from "./api";
import type { AxiosError } from "axios";

// Repartos de la distribuidora (migración 036). El backend devuelve las
// columnas en snake_case (contrato compartido con la futura app mobile).

const fail = (error: unknown, msg: string) => {
  const axiosError = error as AxiosError<{ message?: string }>;
  return axiosError.response?.data || { message: msg };
};

export type RepartoEstado = "ARMADO" | "EN_RUTA" | "RECIBIDO" | "ANULADO";

export const REPARTO_ESTADO_LABEL: Record<RepartoEstado, string> = {
  ARMADO: "Armado",
  EN_RUTA: "En ruta",
  RECIBIDO: "Recibido",
  ANULADO: "Anulado",
};

export const REPARTO_ESTADO_BADGE: Record<RepartoEstado, string> = {
  ARMADO: "bg-amber-50 text-amber-700 border-amber-200",
  EN_RUTA: "bg-blue-50 text-blue-700 border-blue-200",
  RECIBIDO: "bg-emerald-50 text-emerald-700 border-emerald-200",
  ANULADO: "bg-slate-100 text-slate-600 border-slate-200",
};

export interface Reparto {
  id: number;
  empresa_id: number;
  fecha: string;
  vehiculo_id: number;
  vehiculo_chapa: string;
  chofer_id: string | null;
  chofer_nombre: string | null;
  estado: RepartoEstado;
  observacion: string | null;
  viaje_id: number | null;
  creado_por: string | null;
  creado_en: string;
  salida_en: string | null;
  salida_por: string | null;
  recepcion_en: string | null;
  recepcion_por: string | null;
  recepcion_observacion: string | null;
  cantidad_ventas: number;
  total_ventas: number;
}

export interface RepartoVenta {
  venta_id: number;
  venta_fecha: string;
  venta_total: number;
  cliente: string | null;
  envio_estado: string;
}

export interface RepartoProducto {
  producto_id: number;
  producto_codigo: string;
  producto_nombre: string;
  tipo_caja: string | null;
  cajas: number;
  unidades: number;
}

export interface RepartoCaja {
  tipo_caja: string;
  cajas_salida: number;
  cajas_recibidas: number | null;
}

export interface RepartoDetalle extends Reparto {
  ventas: RepartoVenta[];
  productos: RepartoProducto[];
  cajas: RepartoCaja[];
}

export interface VentaDisponible {
  venta_id: number;
  venta_fecha: string;
  venta_total: number;
  cliente: string | null;
  vehiculo_id: number;
  vehiculo_chapa: string;
  cajas: number;
}

export interface RepartoInput {
  fecha?: string;
  vehiculo_id: number;
  chofer_id?: string | null;
  observacion?: string | null;
}

export const getRepartos = async (filtros: {
  estado?: string;
  desde?: string;
  hasta?: string;
} = {}): Promise<Reparto[]> => {
  try {
    const res = await api.get("/repartos", { params: filtros });
    return res.data.data;
  } catch (error) {
    throw fail(error, "Error al obtener repartos");
  }
};

export const getReparto = async (id: number): Promise<RepartoDetalle> => {
  try {
    const res = await api.get(`/repartos/${id}`);
    return res.data.data;
  } catch (error) {
    throw fail(error, "Error al obtener el reparto");
  }
};

export const getVentasDisponibles = async (filtros: {
  desde?: string;
  hasta?: string;
  q?: string;
}): Promise<VentaDisponible[]> => {
  try {
    const res = await api.get("/repartos/ventas-disponibles", { params: filtros });
    return res.data.data;
  } catch (error) {
    throw fail(error, "Error al obtener ventas de envío");
  }
};

export const createReparto = async (data: RepartoInput): Promise<number> => {
  try {
    const res = await api.post("/repartos", data);
    return res.data.id;
  } catch (error) {
    throw fail(error, "Error al crear el reparto");
  }
};

export const updateReparto = async (id: number, data: RepartoInput) => {
  try {
    await api.put(`/repartos/${id}`, data);
  } catch (error) {
    throw fail(error, "Error al actualizar el reparto");
  }
};

export const anularReparto = async (id: number) => {
  try {
    await api.post(`/repartos/${id}/anular`);
  } catch (error) {
    throw fail(error, "Error al anular el reparto");
  }
};

export const asignarVentas = async (id: number, ventaIds: number[]) => {
  try {
    await api.post(`/repartos/${id}/ventas`, { venta_ids: ventaIds });
  } catch (error) {
    throw fail(error, "Error al asignar ventas");
  }
};

export const quitarVenta = async (id: number, ventaId: number) => {
  try {
    await api.delete(`/repartos/${id}/ventas/${ventaId}`);
  } catch (error) {
    throw fail(error, "Error al quitar la venta");
  }
};

export const confirmarSalida = async (id: number) => {
  try {
    await api.post(`/repartos/${id}/salida`);
  } catch (error) {
    throw fail(error, "Error al confirmar la salida");
  }
};

export const confirmarRecepcion = async (
  id: number,
  cajas: { tipo_caja: string; cajas_recibidas: number }[],
  observacion: string,
): Promise<{ hayDiferencia: boolean }> => {
  try {
    const res = await api.post(`/repartos/${id}/recepcion`, { cajas, observacion });
    return res.data;
  } catch (error) {
    throw fail(error, "Error al registrar la recepción");
  }
};
