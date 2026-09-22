import api from "./api";
import type { AxiosError } from "axios";
import { getTerminalId } from "../utils/terminal";

export interface TerminalActual {
  registrada: boolean;
  motivo?: "SIN_ID" | "NO_REGISTRADA" | "DADA_DE_BAJA";
  terminalId?: string;
  nombre?: string;
  movil?: boolean;
  localId?: number;
  localNombre?: string;
  empresaId?: number;
}

export interface Terminal {
  TerminalId: string;
  TerminalNombre: string;
  LocalId: number | null;
  TerminalMovil: "S" | "N";
  LocalNombre?: string;
  EmpresaId?: number | null;
  EmpresaNombre?: string | null;
  TerminalEstado: "A" | "I";
  TerminalRegistradaPor?: string | null;
  TerminalRegistradaEn?: string;
  TerminalUltimoUso?: string | null;
  TerminalUltimaIp?: string | null;
}

// Sucursal elegible para un equipo. Viene de /terminal/sucursales, no de
// /locales: acá hacen falta las de TODAS las empresas (la PC está donde está,
// sin importar qué empresa tenga elegida el administrador en ese momento).
export interface SucursalEquipo {
  LocalId: number;
  LocalNombre: string;
  EmpresaId: number | null;
  EmpresaNombre: string | null;
}

// Qué sabe el servidor de ESTE equipo. Nunca tira error por "no registrada":
// eso es un estado normal que la UI tiene que poder mostrar.
export const getTerminalActual = async (): Promise<TerminalActual> => {
  try {
    const response = await api.get("/terminal/actual");
    return response.data as TerminalActual;
  } catch (error) {
    const axiosError = error as AxiosError<{ message?: string }>;
    throw (
      axiosError.response?.data || { message: "Error al consultar el equipo" }
    );
  }
};

// Registra ESTE equipo en una sucursal. Solo un admin puede hacerlo.
// movil: el equipo no queda atado a una sucursal (notebook que se lleva entre
// bodegas). Su sucursal la define el selector de sucursal del administrador.
export const registrarTerminal = async (
  nombre: string,
  localId: number | null,
  movil = false
) => {
  try {
    const response = await api.post("/terminal", {
      TerminalId: getTerminalId(),
      TerminalNombre: nombre,
      LocalId: movil ? null : localId,
      TerminalMovil: movil ? "S" : "N",
    });
    return response.data;
  } catch (error) {
    const axiosError = error as AxiosError<{ message?: string }>;
    throw (
      axiosError.response?.data || { message: "Error al registrar el equipo" }
    );
  }
};

export const getTerminales = async (): Promise<Terminal[]> => {
  try {
    const response = await api.get("/terminal");
    return (response.data?.data ?? []) as Terminal[];
  } catch (error) {
    const axiosError = error as AxiosError<{ message?: string }>;
    throw (
      axiosError.response?.data || { message: "Error al obtener las terminales" }
    );
  }
};

export const getSucursalesEquipos = async (): Promise<SucursalEquipo[]> => {
  try {
    const response = await api.get("/terminal/sucursales");
    return (response.data?.data ?? []) as SucursalEquipo[];
  } catch (error) {
    const axiosError = error as AxiosError<{ message?: string }>;
    throw (
      axiosError.response?.data || { message: "Error al obtener las sucursales" }
    );
  }
};

export const updateTerminal = async (
  terminalId: string,
  cambios: Partial<
    Pick<Terminal, "TerminalNombre" | "LocalId" | "TerminalEstado" | "TerminalMovil">
  >
) => {
  try {
    const response = await api.put(`/terminal/${terminalId}`, cambios);
    return response.data;
  } catch (error) {
    const axiosError = error as AxiosError<{ message?: string }>;
    throw (
      axiosError.response?.data || { message: "Error al actualizar el equipo" }
    );
  }
};
