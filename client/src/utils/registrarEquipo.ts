// Diálogo para registrar ESTE equipo en una sucursal.
//
// Vive acá y no dentro de un componente porque hacen falta dos puertas de
// entrada: la barra de aviso que aparece en cualquier pantalla, y la pantalla de
// Equipos, que es donde un administrador lo va a buscar. Duplicar el diálogo
// llevaba a que uno de los dos quedara viejo.
import Swal from "sweetalert2";
import { getTerminalCodigoCorto } from "./terminal";
import {
  registrarTerminal,
  getSucursalesEquipos,
  type SucursalEquipo,
} from "../services/terminal.service";

// <option> de todas las sucursales, agrupadas por empresa.
//
// Agrupadas y no una lista plana porque hay nombres que solo se distinguen por
// la empresa, y porque el error que esto previene es elegir la sucursal de la
// empresa equivocada: el equipo queda operando contra el depósito de otra
// empresa y no se nota hasta el inventario.
export function opcionesDeSucursal(
  sucursales: SucursalEquipo[],
  seleccionada?: number | null
): string {
  const porEmpresa = new Map<string, SucursalEquipo[]>();
  for (const s of sucursales) {
    const empresa = s.EmpresaNombre || "Sin empresa";
    const lista = porEmpresa.get(empresa) || [];
    lista.push(s);
    porEmpresa.set(empresa, lista);
  }
  return [...porEmpresa.entries()]
    .map(([empresa, lista]) => {
      const opts = lista
        .map(
          (l) =>
            `<option value="${l.LocalId}" ${
              seleccionada != null && Number(l.LocalId) === Number(seleccionada)
                ? "selected"
                : ""
            }>${l.LocalNombre}</option>`
        )
        .join("");
      return `<optgroup label="${empresa}">${opts}</optgroup>`;
    })
    .join("");
}

// Devuelve true si el equipo quedó registrado.
export async function pedirRegistroDeEquipo(): Promise<boolean> {
  // Las sucursales se piden acá y no se reciben del AuthContext: ahí están solo
  // las de la empresa activa, y esta PC puede estar físicamente en una bodega de
  // la otra empresa. Ofrecer solo las de la empresa elegida era lo que terminaba
  // registrando equipos de la bodega contra la distribuidora.
  let sucursales: SucursalEquipo[] = [];
  try {
    sucursales = await getSucursalesEquipos();
  } catch (e) {
    await Swal.fire({
      icon: "error",
      title: "Error",
      text:
        (e as { message?: string })?.message ||
        "No se pudieron cargar las sucursales",
    });
    return false;
  }
  const opciones = opcionesDeSucursal(sucursales);

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
      <label class="flex items-start gap-2 text-left text-sm mt-3" style="padding:0 10%">
        <input type="checkbox" id="t-movil" style="margin-top:3px">
        <span>
          <b>Es un equipo móvil</b> (una notebook que se lleva entre bodegas).
          No queda atado a una sucursal: se usa la que esté seleccionada arriba
          en cada momento. Solo sirve para administradores.
        </span>
      </label>
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
      const movil = (document.getElementById("t-movil") as HTMLInputElement)
        ?.checked;
      // Un equipo móvil no lleva sucursal: la elige el admin en cada momento.
      if (!movil && !localId) {
        Swal.showValidationMessage("Elegí la sucursal, o marcá que es un equipo móvil");
        return false;
      }
      return { nombre: nombre || `Equipo ${getTerminalCodigoCorto()}`, localId, movil };
    },
  });
  if (!value) return false;

  try {
    await registrarTerminal(
      value.nombre,
      value.localId ? Number(value.localId) : null,
      value.movil
    );
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
