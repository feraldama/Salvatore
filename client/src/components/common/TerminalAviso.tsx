// Barra que dice EN QUÉ SUCURSAL está parado este equipo.
//
// Cumple dos funciones. Cuando el equipo está registrado, le recuerda al cajero
// contra qué bodega está vendiendo — el error que originó todo esto era
// invisible hasta que aparecía en un inventario. Cuando no lo está, es el
// cartel que frena la operación y le da al administrador el botón para
// registrarlo en el momento, sin salir de la pantalla.
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../contexts/useAuth";
import { getTerminalCodigoCorto } from "../../utils/terminal";
import { pedirRegistroDeEquipo } from "../../utils/registrarEquipo";
import {
  getTerminalActual,
  type TerminalActual,
} from "../../services/terminal.service";

export default function TerminalAviso() {
  const { user } = useAuth();
  const [estado, setEstado] = useState<TerminalActual | null>(null);
  const esAdmin = user?.isAdmin === "S";

  const cargar = useCallback(() => {
    getTerminalActual()
      .then(setEstado)
      .catch(() => setEstado(null));
  }, []);

  useEffect(() => {
    if (user) cargar();
  }, [user, cargar]);

  const registrar = async () => {
    if (await pedirRegistroDeEquipo()) cargar();
  };

  if (!user || !estado) return null;

  if (estado.registrada) {
    // Equipo móvil sin sucursal elegida: no se puede operar hasta que el admin
    // seleccione dónde está. Se avisa fuerte, porque desde afuera parece que
    // todo está bien — el equipo ESTÁ registrado.
    if (estado.movil && estado.localId == null) {
      return (
        <div className="w-full bg-amber-50 border-b border-amber-300 px-4 py-2 text-sm text-amber-900 flex items-center gap-2">
          <span aria-hidden="true">⚠️</span>
          <span>
            <b>Equipo móvil sin sucursal seleccionada.</b> Elegí arriba la
            sucursal donde estás trabajando para poder vender o mover caja.
          </span>
        </div>
      );
    }
    return (
      <div className="w-full bg-surface-alt border-b border-border px-4 py-1 text-xs text-text-muted flex items-center gap-2">
        <span aria-hidden="true">{estado.movil ? "💻" : "📍"}</span>
        <span>
          Estás operando en{" "}
          <b className="text-text">{estado.localNombre}</b>
          {estado.nombre ? ` · ${estado.nombre}` : ""}
          {estado.movil ? " (equipo móvil)" : ""}
        </span>
      </div>
    );
  }

  return (
    <div className="w-full bg-amber-50 border-b border-amber-300 px-4 py-2 text-sm text-amber-900 flex flex-wrap items-center gap-x-3 gap-y-1">
      <span aria-hidden="true">⚠️</span>
      <span>
        <b>Este equipo no está registrado en ninguna sucursal.</b>{" "}
        {esAdmin
          ? "Registralo para que las ventas descuenten del depósito correcto."
          : `Avisale a un administrador. Código del equipo: ${getTerminalCodigoCorto()}`}
      </span>
      {esAdmin && (
        <button
          type="button"
          onClick={registrar}
          className="ml-auto rounded-md bg-amber-600 px-3 py-1 text-white text-xs font-medium hover:bg-amber-700"
        >
          Registrar este equipo
        </button>
      )}
    </div>
  );
}
