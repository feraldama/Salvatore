import { useCallback, useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";
import Pagination from "../../components/common/Pagination";
import { LoadingState } from "../../components/common/ui";
import { formatFecha, formatMiles } from "../../utils/utils";
import Combobox, { type OpcionCombo } from "./Combobox";
import {
  eliminarEquivalencia,
  getEquivalencias,
  getProductosDeEmpresa,
  guardarEquivalencia,
  type AlmacenTraslado,
  type Equivalencia,
  type ProductoTraslado,
} from "../../services/traslados.service";

const n = (v: unknown) => Number(v) || 0;
const cc = (v: unknown) => Math.max(1, Number(v) || 1);

// Banda de coherencia de costos. Es la MISMA que usó la migración 026 para
// clasificar la siembra: con FactorCaja=1 el costo por caja de ambos lados
// debería parecerse, y el mayorista salir algo más barato que el minorista.
// Fuera de esta banda el par se marca para revisión humana.
const RATIO_MIN = 0.4;
const RATIO_MAX = 1.15;

// Costo por caja del destino que implica esta equivalencia, comparado con el
// costo que el destino ya tiene cargado. Es la señal que le permite al usuario
// decidir si el factor está bien sin conocer el producto.
function evaluar(e: Equivalencia) {
  const ppOrigen = n(e.ProductoPrecioPromedio);
  const ppDestino = n(e.ProductoDestinoPrecioPromedio);
  const factor = n(e.FactorCaja) || 1;
  // 1 caja origen -> `factor` cajas destino, así que el costo implícito por
  // caja destino es el del origen dividido por el factor.
  const costoImplicito = ppOrigen / factor;
  const ratio = ppDestino > 0 ? costoImplicito / ppDestino : null;
  return {
    ppOrigen,
    ppDestino,
    costoImplicito,
    ratio,
    coherente: ratio !== null && ratio >= RATIO_MIN && ratio <= RATIO_MAX,
    sinCosto: ppOrigen <= 0 || ppDestino <= 0,
  };
}

interface Props {
  almacenes: AlmacenTraslado[];
  puedeEditar: boolean;
  puedeEliminar: boolean;
}

export default function EquivalenciasTab({
  almacenes,
  puedeEditar,
  puedeEliminar,
}: Props) {
  // Las empresas salen de los almacenes ya cargados: no hace falta otra llamada.
  const empresas = useMemo(() => {
    const vistas = new Map<number, { id: number; nombre: string }>();
    almacenes.forEach((a) =>
      vistas.set(a.EmpresaId, { id: a.EmpresaId, nombre: a.EmpresaNombre })
    );
    return [...vistas.values()].sort((a, b) => a.id - b.id);
  }, [almacenes]);

  const [origenEmp, setOrigenEmp] = useState<number | null>(null);
  const [destinoEmp, setDestinoEmp] = useState<number | null>(null);
  const [vista, setVista] = useState<"todas" | "revisar" | "faltantes">("todas");
  const [busqueda, setBusqueda] = useState("");
  const [busquedaAplicada, setBusquedaAplicada] = useState("");

  const [filas, setFilas] = useState<Equivalencia[]>([]);
  const [faltantes, setFaltantes] = useState<ProductoTraslado[]>([]);
  const [cargando, setCargando] = useState(false);
  const [pagina, setPagina] = useState(1);
  const [porPagina, setPorPagina] = useState(25);
  const [totalPaginas, setTotalPaginas] = useState(1);
  const [total, setTotal] = useState(0);

  // Edición del factor: se guarda por fila para no re-render todo al tipear.
  const [editando, setEditando] = useState<number | null>(null);
  const [factorTexto, setFactorTexto] = useState("");

  // Alta de un vínculo nuevo
  const [nuevoOrigen, setNuevoOrigen] = useState<number | null>(null);
  const [nuevoDestino, setNuevoDestino] = useState<number | null>(null);
  const [nuevoFactor, setNuevoFactor] = useState("1");
  const [catalogoDestino, setCatalogoDestino] = useState<ProductoTraslado[]>([]);

  // Por defecto arranca en el par que le interesa al cliente: distribuidora
  // hacia la primera bodega.
  useEffect(() => {
    if (empresas.length >= 2 && origenEmp === null) {
      setOrigenEmp(empresas[0].id);
      setDestinoEmp(empresas[1].id);
    }
  }, [empresas, origenEmp]);

  const cargar = useCallback(async () => {
    if (!origenEmp || !destinoEmp) return;
    setCargando(true);
    try {
      if (vista === "faltantes") {
        const { productos } = await getProductosDeEmpresa(origenEmp, {
          empresaDestinoId: destinoEmp,
          q: busquedaAplicada,
          soloSinEquivalencia: true,
        });
        setFaltantes(productos);
        setTotal(productos.length);
        setTotalPaginas(1);
      } else {
        const res = await getEquivalencias(origenEmp, destinoEmp, {
          q: busquedaAplicada,
          soloRevisar: vista === "revisar",
          page: pagina,
          limit: porPagina,
        });
        setFilas(res.data || []);
        setTotal(res.pagination?.totalItems || 0);
        setTotalPaginas(res.pagination?.totalPages || 1);
      }
    } catch {
      setFilas([]);
      setFaltantes([]);
    } finally {
      setCargando(false);
    }
  }, [origenEmp, destinoEmp, vista, busquedaAplicada, pagina, porPagina]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // El catálogo destino alimenta el selector de alta; se trae una sola vez por
  // empresa destino elegida.
  useEffect(() => {
    if (!destinoEmp) return;
    getProductosDeEmpresa(destinoEmp)
      .then((r) => setCatalogoDestino(r.productos))
      .catch(() => setCatalogoDestino([]));
  }, [destinoEmp]);

  const swapEmpresas = () => {
    setOrigenEmp(destinoEmp);
    setDestinoEmp(origenEmp);
    setPagina(1);
  };

  const guardarFactor = async (e: Equivalencia, factor: number) => {
    try {
      await guardarEquivalencia({
        ProductoOrigenId: e.ProductoOrigenId,
        ProductoDestinoId: e.ProductoDestinoId,
        FactorCaja: factor,
      });
      setEditando(null);
      cargar();
    } catch (err) {
      const x = err as { message?: string };
      Swal.fire({ icon: "error", title: "Error", text: x?.message || "No se pudo guardar" });
    }
  };

  // "Confirmar" = guardar el mismo factor. Eso pasa la confianza de 'R' a 'A'
  // y marca la fila como revisada por una persona.
  const confirmarSinCambios = (e: Equivalencia) =>
    guardarFactor(e, n(e.FactorCaja) || 1);

  const desvincular = async (e: Equivalencia) => {
    const { isConfirmed } = await Swal.fire({
      icon: "warning",
      title: "¿Desvincular?",
      html: `<b>${e.ProductoOrigenNombre}</b> dejará de poder trasladarse a <b>${e.ProductoDestinoNombre}</b>.<br/>Se borran los dos sentidos.`,
      showCancelButton: true,
      confirmButtonText: "Desvincular",
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#dc2626",
    });
    if (!isConfirmed) return;
    try {
      await eliminarEquivalencia(e.ProductoOrigenId, e.ProductoDestinoId);
      cargar();
    } catch (err) {
      const x = err as { message?: string };
      Swal.fire({ icon: "error", title: "Error", text: x?.message || "No se pudo desvincular" });
    }
  };

  const crearVinculo = async () => {
    if (!nuevoOrigen || !nuevoDestino) return;
    const factor = Number(nuevoFactor.replace(",", "."));
    if (!Number.isFinite(factor) || factor <= 0) {
      Swal.fire({ icon: "warning", title: "Factor inválido", text: "Debe ser mayor a cero." });
      return;
    }
    try {
      await guardarEquivalencia({
        ProductoOrigenId: nuevoOrigen,
        ProductoDestinoId: nuevoDestino,
        FactorCaja: factor,
      });
      setNuevoOrigen(null);
      setNuevoDestino(null);
      setNuevoFactor("1");
      Swal.fire({ icon: "success", title: "Vinculado", timer: 1200, showConfirmButton: false });
      cargar();
    } catch (err) {
      const x = err as { message?: string };
      Swal.fire({ icon: "error", title: "No se pudo vincular", text: x?.message || "Error" });
    }
  };

  const opcionesFaltantes: OpcionCombo[] = faltantes.map((p) => ({
    id: p.ProductoId,
    label: `${p.ProductoCodigo ? `${p.ProductoCodigo} - ` : ""}${p.ProductoNombre}`,
    detalle: `Caja de ${cc(p.ProductoCantidadCaja)} · costo ${formatMiles(n(p.ProductoPrecioPromedio))} Gs`,
  }));

  const opcionesDestino: OpcionCombo[] = catalogoDestino.map((p) => ({
    id: p.ProductoId,
    label: `${p.ProductoCodigo ? `${p.ProductoCodigo} - ` : ""}${p.ProductoNombre}`,
    detalle: `Caja de ${cc(p.ProductoCantidadCaja)} · costo ${formatMiles(n(p.ProductoPrecioPromedio))} Gs`,
  }));

  const nombreEmp = (id: number | null) =>
    empresas.find((e) => e.id === id)?.nombre ?? "";

  return (
    <div className="space-y-4">
      {/* Selector de par de catálogos + filtros */}
      <div className="bg-white border border-slate-200 rounded-lg p-4">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr_1fr] gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Catálogo origen
            </label>
            <select
              value={origenEmp ?? ""}
              onChange={(e) => {
                setOrigenEmp(Number(e.target.value));
                setPagina(1);
              }}
              className="w-full px-3 py-1.5 border border-slate-300 rounded-md text-sm"
            >
              {empresas.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nombre}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={swapEmpresas}
            title="Invertir sentido"
            className="px-3 py-1.5 border border-slate-300 rounded-md text-sm hover:bg-slate-50"
          >
            ⇄
          </button>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Catálogo destino
            </label>
            <select
              value={destinoEmp ?? ""}
              onChange={(e) => {
                setDestinoEmp(Number(e.target.value));
                setPagina(1);
              }}
              className="w-full px-3 py-1.5 border border-slate-300 rounded-md text-sm"
            >
              {empresas
                .filter((e) => e.id !== origenEmp)
                .map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nombre}
                  </option>
                ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Buscar producto
            </label>
            <input
              type="text"
              value={busqueda}
              placeholder="Nombre o código…"
              onChange={(e) => setBusqueda(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setBusquedaAplicada(busqueda);
                  setPagina(1);
                }
              }}
              onBlur={() => {
                setBusquedaAplicada(busqueda);
                setPagina(1);
              }}
              className="w-full px-3 py-1.5 border border-slate-300 rounded-md text-sm"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-1 mt-3">
          {(
            [
              ["todas", "Todas"],
              ["revisar", "A revisar"],
              ["faltantes", "Sin vincular"],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              onClick={() => {
                setVista(v);
                setPagina(1);
              }}
              className={`px-3 py-1 text-xs rounded-full border ${
                vista === v
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"
              }`}
            >
              {label}
            </button>
          ))}
          <span className="ml-auto text-xs text-slate-500 self-center">
            {formatMiles(total)} resultado(s)
          </span>
        </div>
      </div>

      {/* Alta de vínculo */}
      {puedeEditar && (
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <h3 className="text-sm font-medium text-slate-700 mb-2">
            Vincular un producto sin equivalencia
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-[2fr_2fr_1fr_auto] gap-3 items-end">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Producto de {nombreEmp(origenEmp)} (sin vincular)
              </label>
              <Combobox
                value={nuevoOrigen}
                opciones={opcionesFaltantes}
                placeholder={
                  vista === "faltantes"
                    ? "Elegí uno de la lista…"
                    : 'Mirá la pestaña "Sin vincular" para cargar la lista'
                }
                vacio={
                  vista === "faltantes"
                    ? "No queda nada sin vincular"
                    : 'Abrí "Sin vincular" primero'
                }
                onSelect={setNuevoOrigen}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Equivale a, en {nombreEmp(destinoEmp)}
              </label>
              <Combobox
                value={nuevoDestino}
                opciones={opcionesDestino}
                placeholder="Buscá el producto equivalente…"
                onSelect={setNuevoDestino}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Cajas destino por caja origen
              </label>
              <input
                type="text"
                value={nuevoFactor}
                onChange={(e) => setNuevoFactor(e.target.value)}
                className="w-full px-3 py-1.5 border border-slate-300 rounded-md text-sm"
              />
            </div>
            <button
              onClick={crearVinculo}
              disabled={!nuevoOrigen || !nuevoDestino}
              className="px-4 py-1.5 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Vincular
            </button>
          </div>
          <p className="text-[11px] text-slate-500 mt-2">
            Normalmente 1: una caja del origen equivale a una del destino, aunque el número
            de unidades por caja sea distinto en cada catálogo. Se guarda en los dos
            sentidos automáticamente.
          </p>
        </div>
      )}

      {/* Resultados */}
      {cargando ? (
        <LoadingState />
      ) : vista === "faltantes" ? (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          {faltantes.length === 0 ? (
            <div className="p-8 text-center text-slate-500">
              No hay productos sin vincular con estos filtros.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">Código</th>
                    <th className="text-left px-3 py-2 font-medium">
                      Producto de {nombreEmp(origenEmp)}
                    </th>
                    <th className="text-right px-3 py-2 font-medium">Caja de</th>
                    <th className="text-right px-3 py-2 font-medium">Costo/caja</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {faltantes.map((p) => (
                    <tr key={p.ProductoId} className="hover:bg-slate-50">
                      <td className="px-3 py-2 text-slate-500">{p.ProductoCodigo || "—"}</td>
                      <td className="px-3 py-2">{p.ProductoNombre}</td>
                      <td className="px-3 py-2 text-right">{cc(p.ProductoCantidadCaja)}</td>
                      <td className="px-3 py-2 text-right">
                        {formatMiles(n(p.ProductoPrecioPromedio))}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {puedeEditar && (
                          <button
                            onClick={() => setNuevoOrigen(p.ProductoId)}
                            className="text-blue-600 hover:text-blue-800 text-xs"
                          >
                            Vincular
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : filas.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-lg p-8 text-center text-slate-500">
          {vista === "revisar"
            ? "No queda ninguna equivalencia marcada para revisar."
            : "No hay equivalencias con estos filtros."}
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">
                    {nombreEmp(origenEmp)}
                  </th>
                  <th className="text-left px-3 py-2 font-medium">
                    {nombreEmp(destinoEmp)}
                  </th>
                  <th className="text-right px-3 py-2 font-medium">Factor</th>
                  <th className="text-left px-3 py-2 font-medium">Costo implícito</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filas.map((e) => {
                  const ev = evaluar(e);
                  const enEdicion = editando === e.ProductoOrigenId;
                  return (
                    <tr key={`${e.ProductoOrigenId}-${e.ProductoDestinoId}`} className="align-top">
                      <td className="px-3 py-2">
                        <div className="text-slate-800">{e.ProductoOrigenNombre}</div>
                        <div className="text-xs text-slate-500">
                          Caja de {cc(e.ProductoCantidadCaja)} · {formatMiles(ev.ppOrigen)} Gs
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="text-slate-800">
                          {e.ProductoDestinoNombre}
                          {e.ProductoDestinoEstado === "I" && (
                            <span className="ml-2 text-[11px] px-1.5 py-0.5 rounded bg-slate-200 text-slate-700">
                              inactivo
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500">
                          Caja de {cc(e.ProductoDestinoCantidadCaja)} ·{" "}
                          {formatMiles(ev.ppDestino)} Gs
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right">
                        {enEdicion ? (
                          <input
                            type="text"
                            autoFocus
                            value={factorTexto}
                            onChange={(ev2) => setFactorTexto(ev2.target.value)}
                            onKeyDown={(ev2) => {
                              if (ev2.key === "Enter") {
                                const f = Number(factorTexto.replace(",", "."));
                                if (Number.isFinite(f) && f > 0) guardarFactor(e, f);
                              } else if (ev2.key === "Escape") {
                                setEditando(null);
                              }
                            }}
                            className="w-20 px-2 py-1 border border-slate-300 rounded text-right"
                          />
                        ) : (
                          <span className="tabular-nums">{n(e.FactorCaja)}</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {ev.sinCosto ? (
                          <span className="text-xs text-amber-700">
                            Falta el costo promedio en algún lado
                          </span>
                        ) : (
                          <div
                            className={`text-xs ${
                              ev.coherente ? "text-emerald-700" : "text-amber-700"
                            }`}
                          >
                            {formatMiles(ev.costoImplicito)} Gs por caja de{" "}
                            {cc(e.ProductoDestinoCantidadCaja)}
                            <div className="text-slate-500">
                              el destino tiene {formatMiles(ev.ppDestino)} Gs
                              {ev.ratio !== null && ` (${ev.ratio.toFixed(2)}×)`}
                            </div>
                          </div>
                        )}
                        {e.EquivalenciaConfianza === "R" && (
                          <span className="inline-block mt-1 text-[11px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                            a revisar
                          </span>
                        )}
                        {e.EquivalenciaOrigen === "M" && (
                          <span className="inline-block mt-1 ml-1 text-[11px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                            revisada {formatFecha(e.EquivalenciaFecha)}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        {puedeEditar &&
                          (enEdicion ? (
                            <>
                              <button
                                onClick={() => {
                                  const f = Number(factorTexto.replace(",", "."));
                                  if (Number.isFinite(f) && f > 0) guardarFactor(e, f);
                                }}
                                className="text-emerald-700 hover:text-emerald-900 text-xs mr-2"
                              >
                                Guardar
                              </button>
                              <button
                                onClick={() => setEditando(null)}
                                className="text-slate-500 hover:text-slate-700 text-xs mr-2"
                              >
                                Cancelar
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => {
                                  setEditando(e.ProductoOrigenId);
                                  setFactorTexto(String(n(e.FactorCaja)));
                                }}
                                className="text-blue-600 hover:text-blue-800 text-xs mr-2"
                              >
                                Editar factor
                              </button>
                              {e.EquivalenciaConfianza === "R" && (
                                <button
                                  onClick={() => confirmarSinCambios(e)}
                                  className="text-emerald-700 hover:text-emerald-900 text-xs mr-2"
                                >
                                  Está bien
                                </button>
                              )}
                            </>
                          ))}
                        {puedeEliminar && !enEdicion && (
                          <button
                            onClick={() => desvincular(e)}
                            className="text-red-600 hover:text-red-800 text-xs"
                          >
                            Desvincular
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination
            currentPage={pagina}
            totalPages={totalPaginas}
            onPageChange={setPagina}
            itemsPerPage={porPagina}
            onItemsPerPageChange={(x) => {
              setPorPagina(x);
              setPagina(1);
            }}
          />
        </div>
      )}
    </div>
  );
}
