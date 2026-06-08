import api from "./api";
import type { AxiosError } from "axios";

// KPIs por empresa para la visión consolidada del dueño.
export interface ResumenEmpresa {
  EmpresaId: number;
  EmpresaNombre: string;
  EmpresaTipo: string; // 'M' = Minorista, 'D' = Distribuidora
  ventasHoyCantidad: number;
  ventasHoyMonto: number;
  ventasMesMonto: number;
  clientes: number;
  productos: number;
  totalPorCobrar: number;
}

// GET /dashboard/resumen — admin recibe una fila por empresa; usuario regular
// solo la suya. No depende de la empresa activa (no manda X-Empresa-Id).
export const getResumenEmpresas = async (): Promise<ResumenEmpresa[]> => {
  try {
    const response = await api.get("/dashboard/resumen");
    return response.data.data || [];
  } catch (error) {
    const axiosError = error as AxiosError<{ message?: string }>;
    throw (
      axiosError.response?.data || { message: "Error al obtener el resumen de empresas" }
    );
  }
};
