// Administración de equipos (terminales). Un equipo = una PC registrada en una
// sucursal; de ese dato sale el depósito contra el que vende todo el que se
// siente ahí, así que moverlo de sucursal es una decisión de administrador.
import { useCallback, useEffect, useState } from "react";
import Swal from "sweetalert2";
import { useAuth } from "../../contexts/useAuth";
import {
  getTerminales,
  getSucursalesEquipos,
  updateTerminal,
  type Terminal,
  type SucursalEquipo,
} from "../../services/terminal.service";
import { getTerminalId, getTerminalCodigoCorto } from "../../utils/terminal";
import {
  pedirRegistroDeEquipo,
  opcionesDeSucursal,
} from "../../utils/registrarEquipo";
import { formatFechaHora } from "../../utils/utils";
import { LoadingState, ErrorState, PermissionDenied } from "../../components/common/ui";

export default function TerminalesPage() {
  const { user } = useAuth();
  const [terminales, setTerminales] = useState<Terminal[]>([]);
  // Sucursales de TODAS las empresas: un equipo se administra desde acá sin
  // importar qué empresa tenga elegida arriba el administrador.
  const [sucursales, setSucursales] = useState<SucursalEquipo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const esteEquipo = getTerminalId();

  const cargar = useCallback(() => {
    setLoading(true);
    Promise.all([getTerminales(), getSucursalesEquipos()])
      .then(([t, s]) => {
        setTerminales(t);
        setSucursales(s);
        setError(null);
      })
      .catch((e) => setError((e as { message?: string })?.message || "Error"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const cambiarSucursal = async (t: Terminal) => {
    // La opción vacía va primero y queda elegida cuando el equipo es móvil (no
    // tiene sucursal). Sin ella, el navegador mostraba la primera sucursal de la
    // lista como si fuera la actual, y guardar para renombrar movía el equipo de
    // bodega sin que nadie lo pidiera.
    const opciones =
      `<option value="">Sin sucursal (equipo móvil)</option>` +
      opcionesDeSucursal(sucursales, t.LocalId);
    const { value } = await Swal.fire({
      title: t.TerminalNombre,
      html: `
        <p class="text-sm text-left mb-3">
          Cambiá la sucursal solo si la computadora se mudó físicamente.
        </p>
        <input id="t-nombre" class="swal2-input" value="${t.TerminalNombre}" placeholder="Nombre del equipo">
        <select id="t-local" class="swal2-select" style="width:80%">${opciones}</select>
        <label class="flex items-start gap-2 text-left text-sm mt-3" style="padding:0 10%">
          <input type="checkbox" id="t-movil" ${t.TerminalMovil === "S" ? "checked" : ""} style="margin-top:3px">
          <span><b>Es un equipo móvil</b> (notebook que se lleva entre bodegas).
          Usa la sucursal que el administrador tenga seleccionada.</span>
        </label>`,
      showCancelButton: true,
      confirmButtonText: "Guardar",
      cancelButtonText: "Cancelar",
      preConfirm: () => {
        const movil = (document.getElementById("t-movil") as HTMLInputElement)
          ?.checked;
        const localId = (
          document.getElementById("t-local") as HTMLSelectElement
        )?.value;
        // Un equipo fijo sin sucursal no puede guardarse: sin ella no hay
        // depósito contra el cual descontar.
        if (!movil && !localId) {
          Swal.showValidationMessage(
            "Elegí la sucursal, o marcá que es un equipo móvil"
          );
          return false;
        }
        return {
          TerminalNombre: (
            document.getElementById("t-nombre") as HTMLInputElement
          )?.value?.trim(),
          LocalId: movil ? null : Number(localId),
          TerminalMovil: movil ? "S" : "N",
        };
      },
    });
    if (!value) return;
    try {
      await updateTerminal(t.TerminalId, value);
      cargar();
    } catch (e) {
      Swal.fire({
        icon: "error",
        title: "Error",
        text: (e as { message?: string })?.message || "No se pudo actualizar",
      });
    }
  };

  const alternarEstado = async (t: Terminal) => {
    const dandoDeBaja = t.TerminalEstado === "A";
    if (dandoDeBaja) {
      const { isConfirmed } = await Swal.fire({
        icon: "warning",
        title: `¿Dar de baja "${t.TerminalNombre}"?`,
        text: "Desde ese equipo no se va a poder vender ni mover caja hasta reactivarlo.",
        showCancelButton: true,
        confirmButtonText: "Dar de baja",
        cancelButtonText: "Cancelar",
      });
      if (!isConfirmed) return;
    }
    try {
      await updateTerminal(t.TerminalId, {
        TerminalEstado: dandoDeBaja ? "I" : "A",
      });
      cargar();
    } catch (e) {
      Swal.fire({
        icon: "error",
        title: "Error",
        text: (e as { message?: string })?.message || "No se pudo actualizar",
      });
    }
  };

  const registrarEste = async () => {
    if (await pedirRegistroDeEquipo()) cargar();
  };

  if (user?.isAdmin !== "S") return <PermissionDenied />;
  if (loading) return <LoadingState message="Cargando equipos..." />;
  if (error) return <ErrorState message={error} />;

  // Al editar, un equipo móvil no tiene sucursal que cambiar.
  const esteRegistrado = terminales.some(
    (t) => t.TerminalId === esteEquipo && t.TerminalEstado === "A"
  );

  return (
    <div>
      <h1 className="text-xl font-semibold text-text mb-1">Equipos</h1>
      <p className="text-sm text-text-muted mb-4">
        Cada equipo registrado define la sucursal contra la que vende quien lo
        usa. Un cajero que va a cubrir a otra bodega opera bien sin tocar nada:
        alcanza con que la PC de esa bodega esté registrada acá.
      </p>
      <p className="text-sm text-text-muted mb-4">
        La lista muestra los equipos de <b>todas las empresas</b>, sin importar
        cuál tengas seleccionada arriba: una PC está donde está, y si quedó
        asignada a la empresa equivocada este es el lugar para corregirlo.
      </p>

      {/* El alta solo puede hacerse DESDE la PC que se registra: el
          identificador lo genera ese navegador y no viaja de otra forma. Por eso
          el botón aparece acá y no como una fila más de la tabla. */}
      {!esteRegistrado && (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-4">
          <p className="text-sm text-amber-900">
            <b>Esta computadora todavía no está registrada.</b> Registrala para
            que lo que se venda desde acá descuente del depósito correcto.
          </p>
          <p className="mt-1 text-xs text-amber-800">
            Código de este equipo: <b>{getTerminalCodigoCorto()}</b>
          </p>
          <button
            type="button"
            onClick={registrarEste}
            className="mt-3 rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700"
          >
            Registrar esta computadora
          </button>
        </div>
      )}

      <p className="mb-4 rounded-md bg-surface-alt px-3 py-2 text-xs text-text-muted">
        Para dar de alta otra PC hay que abrir esta pantalla <b>desde esa
        misma PC</b>, con un usuario administrador. No se puede registrar a
        distancia.
      </p>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="min-w-full text-sm">
          <thead className="bg-surface-alt text-text-muted">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Equipo</th>
              <th className="px-4 py-2 text-left font-medium">Empresa</th>
              <th className="px-4 py-2 text-left font-medium">Sucursal</th>
              <th className="px-4 py-2 text-left font-medium">Último uso</th>
              <th className="px-4 py-2 text-left font-medium">Última IP</th>
              <th className="px-4 py-2 text-left font-medium">Estado</th>
              <th className="px-4 py-2 text-right font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {terminales.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-text-muted">
                  Todavía no hay equipos registrados.
                </td>
              </tr>
            )}
            {terminales.map((t) => {
              const esEste = t.TerminalId === esteEquipo;
              return (
                <tr key={t.TerminalId} className="border-t border-border">
                  <td className="px-4 py-2">
                    {t.TerminalNombre}
                    {esEste && (
                      <span className="ml-2 rounded bg-brand-100 px-1.5 py-0.5 text-xs text-brand-700">
                        este equipo
                      </span>
                    )}
                    <div className="text-xs text-text-muted">
                      {t.TerminalId.slice(0, 8).toUpperCase()}
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    {t.TerminalMovil === "S" ? (
                      <span className="text-text-muted">—</span>
                    ) : (
                      t.EmpresaNombre || (
                        <span className="text-danger-600">Sin empresa</span>
                      )
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {t.TerminalMovil === "S" ? (
                      <span className="text-text-muted">
                        Móvil — según la sucursal elegida
                      </span>
                    ) : (
                      t.LocalNombre
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {t.TerminalUltimoUso ? formatFechaHora(t.TerminalUltimoUso) : "—"}
                  </td>
                  <td className="px-4 py-2 text-text-muted">
                    {t.TerminalUltimaIp || "—"}
                  </td>
                  <td className="px-4 py-2">
                    {t.TerminalEstado === "A" ? (
                      <span className="text-success-700">Activo</span>
                    ) : (
                      <span className="text-text-muted">Dado de baja</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => cambiarSucursal(t)}
                      className="text-brand-700 hover:underline mr-3"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => alternarEstado(t)}
                      className="text-text-muted hover:underline"
                    >
                      {t.TerminalEstado === "A" ? "Dar de baja" : "Reactivar"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
