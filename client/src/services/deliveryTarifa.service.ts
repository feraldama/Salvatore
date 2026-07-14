import api from "./api";
import type { AxiosError } from "axios";

// Tarifa de delivery (minorista). Claves snake_case tal cual las devuelve el
// backend (tabla delivery_tarifa, fuera de columnMap).
export interface DeliveryTarifa {
  id: number;
  empresa_id: number;
  nombre: string;
  monto: number;
  activo: "S" | "N";
  orden: number;
}

export interface DeliveryTarifaInput {
  nombre: string;
  monto: number;
  activo: "S" | "N";
  orden: number;
}

const fail = (error: unknown, msg: string) => {
  const axiosError = error as AxiosError<{ message?: string }>;
  throw axiosError.response?.data || { message: msg };
};

// Solo tarifas activas (para preseleccionar/elegir en la pantalla de venta).
export const getDeliveryTarifasActivas = async (): Promise<DeliveryTarifa[]> => {
  try {
    const { data } = await api.get("/deliverytarifa/activas");
    return data;
  } catch (error) {
    return fail(error, "Error al obtener las tarifas de delivery");
  }
};

// Todas las tarifas de la empresa (administración).
export const getDeliveryTarifas = async (): Promise<DeliveryTarifa[]> => {
  try {
    const { data } = await api.get("/deliverytarifa");
    return data;
  } catch (error) {
    return fail(error, "Error al obtener las tarifas de delivery");
  }
};

export const createDeliveryTarifa = async (payload: DeliveryTarifaInput) => {
  try {
    const { data } = await api.post("/deliverytarifa", payload);
    return data;
  } catch (error) {
    return fail(error, "Error al crear la tarifa de delivery");
  }
};

export const updateDeliveryTarifa = async (
  id: number,
  payload: DeliveryTarifaInput
) => {
  try {
    const { data } = await api.put(`/deliverytarifa/${id}`, payload);
    return data;
  } catch (error) {
    return fail(error, "Error al actualizar la tarifa de delivery");
  }
};

export const deleteDeliveryTarifa = async (id: number) => {
  try {
    const { data } = await api.delete(`/deliverytarifa/${id}`);
    return data;
  } catch (error) {
    return fail(error, "Error al eliminar la tarifa de delivery");
  }
};
