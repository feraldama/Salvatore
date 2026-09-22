// Barra que dice EN QUÉ SUCURSAL está parado este equipo.
//
// Cumple dos funciones. Cuando el equipo está registrado, le recuerda al cajero
// contra qué bodega está vendiendo — el error que originó todo esto era
// invisible hasta que aparecía en un inventario. Cuando no lo está, es el
// cartel que frena la operación y le da al administrador el botón para
// registrarlo en el momento, sin salir de la pantalla.
import { useCallback, useEffect, useState } from "react";
import Swal from "sweetalert2";
import { useAuth } from "../../contexts/useAuth";
import { getTerminalCodigoCorto } from "../../utils/terminal";
import {
  getTerminalActual,
  registrarTerminal,
  type TerminalActual,
} from "../../services/terminal.service";

export default function TerminalAviso() {
  const { user, locales } = useAuth();
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
    const opciones = locales
      .map((l) => `<option value="${l.LocalId}">${l.LocalNombre}</option>`)
      .join("");
    const { value } = await Swal.fire({
      title: "Registrar este equipo",
      html: `
        <p class="text-sm text-left mb-3">
          Elegí la sucursal donde está físicamente esta computadora. Todo lo que
          se venda desde acá va a descontar del depósito de esa sucursal.
        </p>
        <input id="t-nombre" class="swal2-input" placeholder="Nombre del equipo (ej. Mostrador 1)">
        <select id="t-local" class="swal2-select" style="width:80%">
          <option value="">Seleccioná la sucursal</option>
          ${opciones}
        </select>
        <p class="text-xs text-left mt-3 text-gray-500">
          Código de este equipo: <b>${getTerminalCodigoCorto()}</b>
        </p>`,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: "Registrar",
      cancelButtonText: "Cancelar",
      preConfirm: () => {
        const nombre = (
          document.getElementById("t-nombre") as HTMLInputElement
        )?.value?.trim();
        const localId = (
          document.getElementById("t-local") as HTMLSelectElement
        )?.value;
        if (!localId) {
          Swal.showValidationMessage("Elegí la sucursal");
          return false;
        }
        return { nombre: nombre || `Equipo ${getTerminalCodigoCorto()}`, localId };
      },
    });
    if (!value) return;
    try {
      await registrarTerminal(value.nombre, Number(value.localId));
      cargar();
      Swal.fire({
        icon: "success",
        title: "Equipo registrado",
        timer: 1800,
        showConfirmButton: false,
      });
    } catch (e) {
      const msg = (e as { message?: string })?.message || "No se pudo registrar";
      Swal.fire({ icon: "error", title: "Error", text: msg });
    }
  };

  if (!user || !estado) return null;

  if (estado.registrada) {
    return (
      <div className="w-full bg-surface-alt border-b border-border px-4 py-1 text-xs text-text-muted flex items-center gap-2">
        <span aria-hidden="true">📍</span>
        <span>
          Estás operando en{" "}
          <b className="text-text">{estado.localNombre}</b>
          {estado.nombre ? ` · ${estado.nombre}` : ""}
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
