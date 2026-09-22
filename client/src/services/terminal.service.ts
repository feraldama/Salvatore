import api from "./api";
import type { AxiosError } from "axios";
import { getTerminalId } from "../utils/terminal";

export interface TerminalActual {
  registrada: boolean;
  motivo?: "SIN_ID" | "NO_REGISTRADA" | "DADA_DE_BAJA";
  terminalId?: string;
  nombre?: string;
  localId?: number;
  localNombre?: string;
  empresaId?: number;
}

export interface Terminal {
  TerminalId: string;
  TerminalNombre: string;
  LocalId: number;
  LocalNombre?: string;
  TerminalEstado: "A" | "I";
  TerminalRegistradaPor?: string | null;
  TerminalRegistradaEn?: string;
  TerminalUltimoUso?: string | null;
  TerminalUltimaIp?: string | null;
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
export const registrarTerminal = async (nombre: string, localId: number) => {
  try {
    const response = await api.post("/terminal", {
      TerminalId: getTerminalId(),
      TerminalNombre: nombre,
      LocalId: localId,
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

export const updateTerminal = async (
  terminalId: string,
  cambios: Partial<Pick<Terminal, "TerminalNombre" | "LocalId" | "TerminalEstado">>
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
