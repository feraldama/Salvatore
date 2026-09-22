import axios from "axios";
import Swal from "sweetalert2";
import { getTerminalId } from "../utils/terminal";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:3001/api",
  timeout: 30000, // 30 segundos de timeout
});

// Interceptor para añadir token y empresa activa a las peticiones
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  const empresaId = localStorage.getItem("empresaActivaId");
  if (empresaId) {
    config.headers["X-Empresa-Id"] = empresaId;
  }
  // Sucursal activa (solo la usa el backend para admins; los usuarios regulares
  // quedan fijos a su local del JWT). Ausente = todas las sucursales.
  const localId = localStorage.getItem("localActivoId");
  if (localId) {
    config.headers["X-Local-Id"] = localId;
  }
  // Equipo desde el que se opera. El servidor resuelve con esto la sucursal
  // física del cajero, sin preguntársela.
  config.headers["X-Terminal-Id"] = getTerminalId();
  return config;
});

let isSessionExpired = false;

api.interceptors.response.use(
  (response) => response,
  (error) => {
    // sessionInvalid: el backend detectó que la sucursal del usuario cambió en
    // la BD y el token quedó afirmando la vieja. No es una expiración, así que
    // lleva su propio mensaje: el cajero tiene que volver a entrar para tomar
    // la sucursal corregida antes de seguir vendiendo.
    const sessionInvalid = error.response?.data?.sessionInvalid === true;
    if (
      error.response &&
      error.response.status === 401 &&
      error.response.data &&
      (sessionInvalid ||
        error.response.data.message?.toLowerCase().includes("expirado") ||
        error.response.data.message?.toLowerCase().includes("token inválido"))
    ) {
      if (!isSessionExpired) {
        isSessionExpired = true;
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        Swal.fire({
          icon: "warning",
          title: sessionInvalid ? "Sucursal actualizada" : "Sesión expirada",
          text: sessionInvalid
            ? error.response.data.message
            : "Tu sesión ha expirado. Por favor, inicia sesión nuevamente.",
          confirmButtonText: "Ir al login",
          confirmButtonColor: "#3085d6",
        }).then(() => {
          isSessionExpired = false;
          window.location.href = "/login";
        });
      }
    }
    return Promise.reject(error);
  }
);

export default api;
