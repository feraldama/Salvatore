import api from "./api";
import type { AxiosError } from "axios";

export interface Empresa {
  EmpresaId: number;
  EmpresaNombre: string;
  EmpresaRUC?: string;
  EmpresaTipo: string; // 'M' = Minorista, 'D' = Distribuidora
  EmpresaEstado?: string;
  [key: string]: unknown;
}

// Empresas a las que el usuario logueado tiene acceso.
export const getEmpresasAccesibles = async (): Promise<Empresa[]> => {
  try {
    const response = await api.get("/empresas");
    return response.data.data || [];
  } catch (error) {
    const axiosError = error as AxiosError<{ message?: string }>;
    throw axiosError.response?.data || { message: "Error al obtener empresas" };
  }
};

export const createEmpresa = async (data: Record<string, unknown>) => {
  try {
    const response = await api.post("/empresas", data);
    return response.data;
  } catch (error) {
    const axiosError = error as AxiosError<{ message?: string }>;
    throw axiosError.response?.data || { message: "Error al crear empresa" };
  }
};

export const updateEmpresa = async (id: string | number, data: Record<string, unknown>) => {
  try {
    const response = await api.put(`/empresas/${id}`, data);
    return response.data;
  } catch (error) {
    const axiosError = error as AxiosError<{ message?: string }>;
    throw axiosError.response?.data || { message: "Error al actualizar empresa" };
  }
};

export const deleteEmpresa = async (id: string | number) => {
  try {
    const response = await api.delete(`/empresas/${id}`);
    return response.data;
  } catch (error) {
    const axiosError = error as AxiosError<{ message?: string }>;
    throw axiosError.response?.data || { message: "Error al eliminar empresa" };
  }
};
