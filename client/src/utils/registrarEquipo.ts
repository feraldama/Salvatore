// Diálogo para registrar ESTE equipo en una sucursal.
//
// Vive acá y no dentro de un componente porque hacen falta dos puertas de
// entrada: la barra de aviso que aparece en cualquier pantalla, y la pantalla de
// Equipos, que es donde un administrador lo va a buscar. Duplicar el diálogo
// llevaba a que uno de los dos quedara viejo.
import Swal from "sweetalert2";
import { getTerminalCodigoCorto } from "./terminal";
import { registrarTerminal } from "../services/terminal.service";

interface LocalOpcion {
  LocalId: number | string;
  LocalNombre: string;
}

// Devuelve true si el equipo quedó registrado.
export async function pedirRegistroDeEquipo(
  locales: LocalOpcion[]
): Promise<boolean> {
  const opciones = locales
    .map((l) => `<option value="${l.LocalId}">${l.LocalNombre}</option>`)
    .join("");

  const { value } = await Swal.fire({
    title: "Registrar este equipo",
    html: `
      <p class="text-sm text-left mb-3">
        Elegí la sucursal donde está físicamente esta computadora. Todo lo que se
        venda desde acá va a descontar del depósito de esa sucursal.
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
  if (!value) return false;

  try {
    await registrarTerminal(value.nombre, Number(value.localId));
    await Swal.fire({
      icon: "success",
      title: "Equipo registrado",
      timer: 1800,
      showConfirmButton: false,
    });
    return true;
  } catch (e) {
    const msg = (e as { message?: string })?.message || "No se pudo registrar";
    await Swal.fire({ icon: "error", title: "Error", text: msg });
    return false;
  }
}
