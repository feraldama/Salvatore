import api from "./api";
import type { AxiosError } from "axios";

export interface Vendedor {
  id?: string | number;
  VendedorId?: string | number;
  VendedorNombre: string;
  VendedorApellido: string;
  VendedorTelefono: string;
  VendedorDireccion: string;
  VendedorEstado: string;
  UsuarioId?: string | null;
  EmpresaId?: number;
  [key: string]: unknown;
}

export const getVendedores = async (empresaId?: number) => {
  const params: Record<string, unknown> = {};
  if (empresaId) params.empresaId = empresaId;
  try {
    const response = await api.get("/vendedores", { params });
    return response.data;
  } catch (error) {
    const axiosError = error as AxiosError<{ message?: string }>;
    throw axiosError.response?.data || { message: "Error al obtener vendedores" };
  }
};

export const getVendedorById = async (id: string | number) => {
  try {
    const response = await api.get(`/vendedores/${id}`);
    return response.data;
  } catch (error) {
    const axiosError = error as AxiosError<{ message?: string }>;
    throw axiosError.response?.data || { message: "Error al obtener vendedor" };
  }
};

export const getClientesDeVendedor = async (vendedorId: string | number) => {
  try {
    const response = await api.get(`/vendedores/${vendedorId}/clientes`);
    return response.data;
  } catch (error) {
    const axiosError = error as AxiosError<{ message?: string }>;
    throw axiosError.response?.data || { message: "Error al obtener clientes del vendedor" };
  }
};

export const createVendedor = async (data: Record<string, unknown>) => {
  try {
    const response = await api.post("/vendedores", data);
    return response.data;
  } catch (error) {
    const axiosError = error as AxiosError<{ message?: string }>;
    throw axiosError.response?.data || { message: "Error al crear vendedor" };
  }
};

export const updateVendedor = async (id: string | number, data: Record<string, unknown>) => {
  try {
    const response = await api.put(`/vendedores/${id}`, data);
    return response.data;
  } catch (error) {
    const axiosError = error as AxiosError<{ message?: string }>;
    throw axiosError.response?.data || { message: "Error al actualizar vendedor" };
  }
};

export const asignarClienteAVendedor = async (vendedorId: string | number, clienteId: string | number) => {
  try {
    const response = await api.post(`/vendedores/${vendedorId}/clientes`, { clienteId });
    return response.data;
  } catch (error) {
    const axiosError = error as AxiosError<{ message?: string }>;
    throw axiosError.response?.data || { message: "Error al asignar cliente" };
  }
};

export const desasignarCliente = async (vendedorId: string | number, clienteId: string | number) => {
  try {
    const response = await api.delete(`/vendedores/${vendedorId}/clientes/${clienteId}`);
    return response.data;
  } catch (error) {
    const axiosError = error as AxiosError<{ message?: string }>;
    throw axiosError.response?.data || { message: "Error al desasignar cliente" };
  }
};

export const deleteVendedor = async (id: string | number) => {
  try {
    const response = await api.delete(`/vendedores/${id}`);
    return response.data;
  } catch (error) {
    const axiosError = error as AxiosError<{ message?: string }>;
    throw axiosError.response?.data || { message: "Error al eliminar vendedor" };
  }
};
