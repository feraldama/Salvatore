import { useCallback, useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";
import Pagination from "../../components/common/Pagination";
import { LoadingState, PermissionDenied } from "../../components/common/ui";
import { usePermiso } from "../../hooks/usePermiso";
import Combobox, { type OpcionCombo } from "./Combobox";
import EquivalenciasTab from "./EquivalenciasTab";
import { formatFechaHora, formatMiles } from "../../utils/utils";
import {
  anularTraslado,
  crearTraslado,
  getAlmacenesTraslado,
  getProductosDeEmpresa,
  getProductosTraslado,
  getTrasladoById,
  getTraslados,
  guardarEquivalencia,
  type AlmacenTraslado,
  type ProductoTraslado,
  type Traslado,
} from "../../services/traslados.service";

// ── Helpers ─────────────────────────────────────────────────────────────────

// pg devuelve NUMERIC como string; todo lo que venga de la API pasa por acá.
const n = (v: unknown) => Number(v) || 0;
const cc = (v: unknown) => Math.max(1, Number(v) || 1);

// Input de cantidad con separador de miles (regla del proyecto: nada de
// <input type="number"> para montos/cantidades, no soporta el separador).
const parseMiles = (s: string) => Number(s.replace(/\D/g, "")) || 0;

// Misma conversión que api/utils/trasladoStock.js, para la vista previa en
// vivo. El backend la recalcula y es el que manda al confirmar; acá solo se
// muestra para que el usuario vea el resultado antes de guardar.
function convertir(
  cajas: number,
  sueltas: number,
  ccOrigen: number,
  ccDestino: number,
  factor: number
) {
  const unidadesOrigen = cajas * ccOrigen + sueltas;
  const exacto = (unidadesOrigen * factor * ccDestino) / ccOrigen;
  const unidadesDestino = Math.round(exacto);
  return {
    unidadesOrigen,
    unidadesDestino,
    entero: Math.abs(exacto - unidadesDestino) < 1e-9,
    cajasDestino: Math.floor(unidadesDestino / ccDestino),
    sueltasDestino: unidadesDestino % ccDestino,
  };
}

const etiquetaAlmacen = (a: AlmacenTraslado) =>
  `${a.EmpresaNombre} · ${a.AlmacenNombre}`;

const etiquetaProducto = (p: ProductoTraslado) =>
  `${p.ProductoCodigo ? `${p.ProductoCodigo} - ` : ""}${p.ProductoNombre}`.trim();

// ── Línea del traslado en edición ───────────────────────────────────────────

interface Linea {
  key: number;
  producto: ProductoTraslado;
  cajas: number;
  unidades: number;
}

// ── Página ──────────────────────────────────────────────────────────────────

export default function TrasladosPage() {
  const puedeLeer = usePermiso("TRASLADOS", "leer");
  const puedeCrear = usePermiso("TRASLADOS", "crear");
  const puedeEliminar = usePermiso("TRASLADOS", "eliminar");

  const [tab, setTab] = useState<"nuevo" | "historial" | "equivalencias">("nuevo");
  const [almacenes, setAlmacenes] = useState<AlmacenTraslado[]>([]);
  const [cargandoAlmacenes, setCargandoAlmacenes] = useState(true);

  // Alta
  const [origenId, setOrigenId] = useState<number | null>(null);
  const [destinoId, setDestinoId] = useState<number | null>(null);
  const [obs, setObs] = useState("");
  const [productos, setProductos] = useState<ProductoTraslado[]>([]);
  const [cargandoProductos, setCargandoProductos] = useState(false);
  const [listaCortada, setListaCortada] = useState(false);
  const [productoElegido, setProductoElegido] = useState<number | null>(null);
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [guardando, setGuardando] = useState(false);

  // Vinculación al vuelo cuando el producto no tiene equivalencia
  const [vinculando, setVinculando] = useState<ProductoTraslado | null>(null);
  const [productosDestino, setProductosDestino] = useState<ProductoTraslado[]>([]);
  const [destinoElegido, setDestinoElegido] = useState<number | null>(null);
  const [factorTexto, setFactorTexto] = useState("1");

  // Historial
  const [historial, setHistorial] = useState<Traslado[]>([]);
  const [cargandoHistorial, setCargandoHistorial] = useState(false);
  const [pagina, setPagina] = useState(1);
  const [porPagina, setPorPagina] = useState(10);
  const [totalPaginas, setTotalPaginas] = useState(1);
  const [filtroEstado, setFiltroEstado] = useState("");
  const [filtroDesde, setFiltroDesde] = useState("");
  const [filtroHasta, setFiltroHasta] = useState("");
  const [detalle, setDetalle] = useState<Traslado | null>(null);

  const almOrigen = almacenes.find((a) => a.AlmacenId === origenId) || null;
  const almDestino = almacenes.find((a) => a.AlmacenId === destinoId) || null;

  useEffect(() => {
    getAlmacenesTraslado()
      .then(setAlmacenes)
      .catch(() => setAlmacenes([]))
      .finally(() => setCargandoAlmacenes(false));
  }, []);

  // Los productos dependen del almacén origen Y del destino: el destino define
  // contra qué catálogo se resuelve la equivalencia de cada producto.
  useEffect(() => {
    if (!origenId) {
      setProductos([]);
      return;
    }
    setCargandoProductos(true);
    getProductosTraslado(origenId, destinoId ?? undefined)
      .then((r) => {
        setProductos(r.productos);
        setListaCortada(r.truncado);
      })
      .catch(() => setProductos([]))
      .finally(() => setCargandoProductos(false));
  }, [origenId, destinoId]);

  // Cambiar de almacén invalida las líneas ya cargadas.
  useEffect(() => {
    setLineas([]);
    setProductoElegido(null);
    setVinculando(null);
  }, [origenId, destinoId]);

  const cargarHistorial = useCallback(async () => {
    setCargandoHistorial(true);
    try {
      const res = await getTraslados(pagina, porPagina, {
        estado: filtroEstado || undefined,
        desde: filtroDesde || undefined,
        hasta: filtroHasta || undefined,
      });
      setHistorial(res.data || []);
      setTotalPaginas(res.pagination?.totalPages || 1);
    } catch {
      setHistorial([]);
    } finally {
      setCargandoHistorial(false);
    }
  }, [pagina, porPagina, filtroEstado, filtroDesde, filtroHasta]);

  useEffect(() => {
    if (tab === "historial") cargarHistorial();
  }, [tab, cargarHistorial]);

  // ── Alta ──────────────────────────────────────────────────────────────────

  const opcionesAlmacenOrigen: OpcionCombo[] = almacenes.map((a) => ({
    id: a.AlmacenId,
    label: etiquetaAlmacen(a),
    detalle: a.LocalNombre ? `Local: ${a.LocalNombre}` : undefined,
  }));

  const opcionesAlmacenDestino: OpcionCombo[] = almacenes
    .filter((a) => a.AlmacenId !== origenId)
    .map((a) => ({
      id: a.AlmacenId,
      label: etiquetaAlmacen(a),
      detalle: a.LocalNombre ? `Local: ${a.LocalNombre}` : undefined,
    }));

  const yaEnLineas = useMemo(
    () => new Set(lineas.map((l) => l.producto.ProductoId)),
    [lineas]
  );

  // Unidades disponibles del producto en el almacén origen.
  const disponibleDe = (p: ProductoTraslado) =>
    p.ProductoAlmacenStock * cc(p.ProductoCantidadCaja) + p.ProductoAlmacenStockUnitario;

  // La lista incluye productos SIN stock, marcados. Esconderlos hacía que un
  // producto existente pareciera no existir: el buscador contestaba "Sin
  // resultados" y no había forma de distinguirlo de un producto inexistente.
  const opcionesProducto: OpcionCombo[] = productos
    .filter((p) => !yaEnLineas.has(p.ProductoId))
    .map((p) => {
      const ccO = cc(p.ProductoCantidadCaja);
      const disp = disponibleDe(p);
      return {
        id: p.ProductoId,
        label: etiquetaProducto(p),
        detalle:
          disp > 0
            ? `Disponible: ${formatMiles(p.ProductoAlmacenStock)} cajas de ${ccO} (${formatMiles(disp)} un.)`
            : `Sin stock en ${almOrigen?.AlmacenNombre ?? "el almacén origen"}`,
        aviso:
          disp <= 0
            ? "sin stock"
            : p.ProductoDestinoId
              ? undefined
              : "sin equivalencia",
      };
    });

  const agregarLinea = (productoId: number | null) => {
    if (!productoId) return;
    const p = productos.find((x) => x.ProductoId === productoId);
    if (!p) return;
    setProductoElegido(null);

    // Sin stock no hay nada que mover. Se avisa explícitamente en vez de
    // agregar una línea que nunca va a poder confirmarse.
    if (disponibleDe(p) <= 0) {
      Swal.fire({
        icon: "info",
        title: "Sin stock",
        html:
          `<b>${p.ProductoNombre}</b> existe en el catálogo, pero no tiene ` +
          `stock en <b>${almOrigen?.AlmacenNombre ?? "el almacén origen"}</b>.`,
      });
      return;
    }

    // Sin equivalencia no se puede trasladar: se ofrece vincular en el momento
    // en vez de mandar al usuario a otra pantalla a buscarlo de cero.
    if (!p.ProductoDestinoId) {
      setVinculando(p);
      setDestinoElegido(null);
      setFactorTexto("1");
      // Catálogo destino COMPLETO por empresa. Antes se pedía por almacén, que
      // filtra por stock: 87 productos activos de la bodega quedaban fuera y no
      // se podían elegir como equivalente. Vincular no depende de tener stock.
      if (almDestino && productosDestino.length === 0) {
        getProductosDeEmpresa(almDestino.EmpresaId)
          .then((r) => setProductosDestino(r.productos))
          .catch(() => setProductosDestino([]));
      }
      return;
    }
    setLineas((prev) => [
      ...prev,
      { key: Date.now() + Math.random(), producto: p, cajas: 0, unidades: 0 },
    ]);
  };

  const actualizarLinea = (key: number, campo: "cajas" | "unidades", valor: number) => {
    setLineas((prev) =>
      prev.map((l) => (l.key === key ? { ...l, [campo]: Math.max(0, valor) } : l))
    );
  };

  const quitarLinea = (key: number) =>
    setLineas((prev) => prev.filter((l) => l.key !== key));

  const calculoLinea = (l: Linea) => {
    const ccO = cc(l.producto.ProductoCantidadCaja);
    const ccD = cc(l.producto.ProductoDestinoCantidadCaja);
    const factor = n(l.producto.FactorCaja) || 1;
    const conv = convertir(l.cajas, l.unidades, ccO, ccD, factor);
    const disponible =
      l.producto.ProductoAlmacenStock * ccO + l.producto.ProductoAlmacenStockUnitario;
    return {
      ...conv,
      ccO,
      ccD,
      disponible,
      suficiente: conv.unidadesOrigen <= disponible,
      valida: conv.unidadesOrigen > 0 && conv.entero && conv.unidadesOrigen <= disponible,
    };
  };

  const lineasValidas = lineas.length > 0 && lineas.every((l) => calculoLinea(l).valida);

  const confirmar = async () => {
    if (!origenId || !destinoId || !lineasValidas) return;
    const { isConfirmed } = await Swal.fire({
      icon: "question",
      title: "¿Confirmar el traslado?",
      html: `Se moverán <b>${lineas.length}</b> producto(s) de <b>${almOrigen?.AlmacenNombre}</b> a <b>${almDestino?.AlmacenNombre}</b>.`,
      showCancelButton: true,
      confirmButtonText: "Confirmar",
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#2563eb",
    });
    if (!isConfirmed) return;

    setGuardando(true);
    try {
      const res = await crearTraslado({
        AlmacenOrigenId: origenId,
        AlmacenDestinoId: destinoId,
        TrasladoObs: obs,
        Productos: lineas.map((l) => ({
          ProductoOrigenId: l.producto.ProductoId,
          CantidadCaja: l.cajas,
          CantidadUnidad: l.unidades,
        })),
      });
      await Swal.fire({
        icon: "success",
        title: "Traslado confirmado",
        text: `N° ${res?.data?.TrasladoId}. El stock ya está actualizado en ambos almacenes.`,
      });
      setLineas([]);
      setObs("");
      // Refrescar el stock disponible de los productos del origen.
      if (origenId) {
        setCargandoProductos(true);
        getProductosTraslado(origenId, destinoId ?? undefined)
          .then((r) => setProductos(r.productos))
          .finally(() => setCargandoProductos(false));
      }
    } catch (e) {
      const err = e as { message?: string };
      Swal.fire({
        icon: "error",
        title: "No se pudo confirmar",
        text: err?.message || "Error al confirmar el traslado",
      });
    } finally {
      setGuardando(false);
    }
  };

  const confirmarVinculo = async () => {
    if (!vinculando || !destinoElegido) return;
    const factor = Number(factorTexto.replace(",", "."));
    if (!Number.isFinite(factor) || factor <= 0) {
      Swal.fire({ icon: "warning", title: "Factor inválido", text: "Debe ser mayor a cero." });
      return;
    }
    try {
      await guardarEquivalencia({
        ProductoOrigenId: vinculando.ProductoId,
        ProductoDestinoId: destinoElegido,
        FactorCaja: factor,
      });
      setVinculando(null);
      // Recargar para que el producto ya venga con su equivalencia resuelta.
      if (origenId) {
        setCargandoProductos(true);
        const frescos = (await getProductosTraslado(origenId, destinoId ?? undefined))
          .productos;
        setProductos(frescos);
        setCargandoProductos(false);
        const p = frescos.find((x) => x.ProductoId === vinculando.ProductoId);
        if (p?.ProductoDestinoId) {
          setLineas((prev) => [
            ...prev,
            { key: Date.now() + Math.random(), producto: p, cajas: 0, unidades: 0 },
          ]);
        }
      }
    } catch (e) {
      const err = e as { message?: string };
      Swal.fire({ icon: "error", title: "Error", text: err?.message || "No se pudo vincular" });
    }
  };

  // ── Historial ─────────────────────────────────────────────────────────────

  const verDetalle = async (id: number) => {
    try {
      setDetalle(await getTrasladoById(id));
    } catch {
      Swal.fire({ icon: "error", title: "Error", text: "No se pudo cargar el detalle" });
    }
  };

  const anular = async (t: Traslado) => {
    const { isConfirmed } = await Swal.fire({
      icon: "warning",
      title: `¿Anular el traslado N° ${t.TrasladoId}?`,
      html:
        "El stock vuelve al almacén de origen.<br/>" +
        "<b>El costo promedio del destino no se revierte</b> (es un acumulado histórico, igual que en las compras).",
      showCancelButton: true,
      confirmButtonText: "Anular",
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#dc2626",
    });
    if (!isConfirmed) return;
    try {
      await anularTraslado(t.TrasladoId);
      Swal.fire({ icon: "success", title: "Traslado anulado", text: "El stock fue devuelto." });
      setDetalle(null);
      cargarHistorial();
    } catch (e) {
      const err = e as { message?: string };
      Swal.fire({ icon: "error", title: "No se pudo anular", text: err?.message || "Error" });
    }
  };

  if (!puedeLeer) return <PermissionDenied />;

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-slate-800">Traslados de inventario</h1>
        <p className="text-sm text-slate-500">
          Mové stock entre almacenes, incluso entre la distribuidora y las bodegas.
        </p>
      </div>

      <div className="flex gap-1 border-b border-slate-200 mb-4">
        {(["nuevo", "historial", "equivalencias"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              tab === t
                ? "border-blue-600 text-blue-700"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {t === "nuevo"
              ? "Nuevo traslado"
              : t === "historial"
                ? "Historial"
                : "Equivalencias"}
          </button>
        ))}
      </div>

      {/* ── NUEVO TRASLADO ─────────────────────────────────────────────── */}
      {tab === "nuevo" && (
        <>
          {!puedeCrear ? (
            <PermissionDenied />
          ) : cargandoAlmacenes ? (
            <LoadingState />
          ) : (
            <div className="space-y-4">
              <div className="bg-white border border-slate-200 rounded-lg p-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Almacén origen
                    </label>
                    <Combobox
                      value={origenId}
                      opciones={opcionesAlmacenOrigen}
                      placeholder="Escribí para buscar…"
                      onSelect={setOrigenId}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Almacén destino
                    </label>
                    <Combobox
                      value={destinoId}
                      opciones={opcionesAlmacenDestino}
                      placeholder={origenId ? "Escribí para buscar…" : "Elegí primero el origen"}
                      disabled={!origenId}
                      onSelect={setDestinoId}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Observación (opcional)
                    </label>
                    <input
                      type="text"
                      value={obs}
                      maxLength={255}
                      onChange={(e) => setObs(e.target.value)}
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>

                {almOrigen && almDestino && almOrigen.EmpresaId !== almDestino.EmpresaId && (
                  <p className="mt-3 text-xs text-blue-800 bg-blue-50 border border-blue-200 rounded px-3 py-2">
                    Traslado entre empresas distintas: cada producto se convierte al equivalente
                    del catálogo de <b>{almDestino.EmpresaNombre}</b>. Mueve inventario y costo,
                    no dinero.
                  </p>
                )}
              </div>

              {origenId && destinoId && (
                <div className="bg-white border border-slate-200 rounded-lg p-4">
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Agregar producto
                  </label>
                  <Combobox
                    value={productoElegido}
                    opciones={opcionesProducto}
                    placeholder="Escribí el nombre o el código…"
                    vacio={cargandoProductos ? "Cargando productos…" : "Sin resultados"}
                    onSelect={agregarLinea}
                  />
                  {listaCortada && (
                    <p className="mt-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                      El catálogo es más grande que la lista cargada, así que puede faltar
                      algún producto. Avisá para subir el tope.
                    </p>
                  )}

                  {vinculando && (
                    <div className="mt-3 border border-amber-300 bg-amber-50 rounded-md p-3">
                      <p className="text-sm text-amber-900 mb-2">
                        <b>{vinculando.ProductoNombre}</b> no tiene equivalencia en el catálogo de{" "}
                        <b>{almDestino?.EmpresaNombre}</b>. Vinculalo para poder trasladarlo.
                      </p>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="md:col-span-2">
                          <label className="block text-xs font-medium text-slate-600 mb-1">
                            Producto equivalente en el destino
                          </label>
                          <Combobox
                            value={destinoElegido}
                            opciones={productosDestino.map((p) => ({
                              id: p.ProductoId,
                              label: etiquetaProducto(p),
                              detalle: `Caja de ${cc(p.ProductoCantidadCaja)}`,
                            }))}
                            placeholder="Buscá el producto en el destino…"
                            onSelect={setDestinoElegido}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">
                            Cajas destino por caja origen
                          </label>
                          <input
                            type="text"
                            value={factorTexto}
                            onChange={(e) => setFactorTexto(e.target.value)}
                            className="w-full px-3 py-1.5 border border-slate-300 rounded-md text-sm"
                          />
                          <p className="text-[11px] text-slate-500 mt-1">
                            Normalmente 1 (una caja del origen = una del destino).
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2 mt-3">
                        <button
                          onClick={confirmarVinculo}
                          disabled={!destinoElegido}
                          className="px-3 py-1.5 text-sm rounded-md bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50"
                        >
                          Vincular y agregar
                        </button>
                        <button
                          onClick={() => setVinculando(null)}
                          className="px-3 py-1.5 text-sm rounded-md border border-slate-300 hover:bg-slate-50"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {lineas.length > 0 && (
                <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-slate-600">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium">Producto origen</th>
                          <th className="text-right px-3 py-2 font-medium">Cajas</th>
                          <th className="text-right px-3 py-2 font-medium">Unidades sueltas</th>
                          <th className="text-left px-3 py-2 font-medium">Entra al destino como</th>
                          <th className="px-3 py-2"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {lineas.map((l) => {
                          const c = calculoLinea(l);
                          return (
                            <tr key={l.key} className="align-top">
                              <td className="px-3 py-2">
                                <div className="font-medium text-slate-800">
                                  {l.producto.ProductoNombre}
                                </div>
                                <div className="text-xs text-slate-500">
                                  Caja de {c.ccO} · disponible {formatMiles(c.disponible)} un.
                                </div>
                              </td>
                              <td className="px-3 py-2 text-right">
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  value={l.cajas ? formatMiles(l.cajas) : ""}
                                  onChange={(e) =>
                                    actualizarLinea(l.key, "cajas", parseMiles(e.target.value))
                                  }
                                  className="w-24 px-2 py-1 border border-slate-300 rounded text-right"
                                />
                              </td>
                              <td className="px-3 py-2 text-right">
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  value={l.unidades ? formatMiles(l.unidades) : ""}
                                  disabled={c.ccO === 1}
                                  title={
                                    c.ccO === 1
                                      ? "Este producto no se fracciona (caja de 1)"
                                      : undefined
                                  }
                                  onChange={(e) =>
                                    actualizarLinea(l.key, "unidades", parseMiles(e.target.value))
                                  }
                                  className="w-24 px-2 py-1 border border-slate-300 rounded text-right disabled:bg-slate-100"
                                />
                              </td>
                              <td className="px-3 py-2">
                                <div className="text-slate-800">
                                  {l.producto.ProductoDestinoNombre}
                                </div>
                                {c.unidadesOrigen === 0 ? (
                                  <div className="text-xs text-slate-400">Indicá una cantidad</div>
                                ) : !c.entero ? (
                                  <div className="text-xs text-red-600">
                                    La cantidad no da un número entero de unidades en el destino
                                  </div>
                                ) : !c.suficiente ? (
                                  <div className="text-xs text-red-600">
                                    Stock insuficiente: hay {formatMiles(c.disponible)} un.
                                  </div>
                                ) : (
                                  <div className="text-xs text-emerald-700">
                                    {formatMiles(c.cajasDestino)} caja(s) de {c.ccD}
                                    {c.sueltasDestino > 0 &&
                                      ` + ${formatMiles(c.sueltasDestino)} un.`}{" "}
                                    ({formatMiles(c.unidadesDestino)} un.)
                                  </div>
                                )}
                              </td>
                              <td className="px-3 py-2 text-right">
                                <button
                                  onClick={() => quitarLinea(l.key)}
                                  className="text-red-600 hover:text-red-800 text-xs"
                                >
                                  Quitar
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex items-center justify-between px-3 py-3 bg-slate-50 border-t border-slate-200">
                    <span className="text-sm text-slate-600">
                      {lineas.length} producto(s) en el traslado
                    </span>
                    <button
                      onClick={confirmar}
                      disabled={!lineasValidas || guardando}
                      className="px-4 py-2 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      {guardando ? "Confirmando…" : "Confirmar traslado"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ── HISTORIAL ──────────────────────────────────────────────────── */}
      {tab === "historial" && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-lg p-4 grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Estado</label>
              <select
                value={filtroEstado}
                onChange={(e) => {
                  setFiltroEstado(e.target.value);
                  setPagina(1);
                }}
                className="w-full px-3 py-1.5 border border-slate-300 rounded-md text-sm"
              >
                <option value="">Todos</option>
                <option value="C">Confirmados</option>
                <option value="A">Anulados</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Desde</label>
              <input
                type="date"
                value={filtroDesde}
                onChange={(e) => {
                  setFiltroDesde(e.target.value);
                  setPagina(1);
                }}
                className="w-full px-3 py-1.5 border border-slate-300 rounded-md text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Hasta</label>
              <input
                type="date"
                value={filtroHasta}
                onChange={(e) => {
                  setFiltroHasta(e.target.value);
                  setPagina(1);
                }}
                className="w-full px-3 py-1.5 border border-slate-300 rounded-md text-sm"
              />
            </div>
          </div>

          {cargandoHistorial ? (
            <LoadingState />
          ) : historial.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-lg p-8 text-center text-slate-500">
              No hay traslados para los filtros elegidos.
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium">N°</th>
                      <th className="text-left px-3 py-2 font-medium">Fecha</th>
                      <th className="text-left px-3 py-2 font-medium">Origen</th>
                      <th className="text-left px-3 py-2 font-medium">Destino</th>
                      <th className="text-right px-3 py-2 font-medium">Productos</th>
                      <th className="text-left px-3 py-2 font-medium">Estado</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {historial.map((t) => (
                      <tr key={t.TrasladoId} className="hover:bg-slate-50">
                        <td className="px-3 py-2 font-medium">{t.TrasladoId}</td>
                        <td className="px-3 py-2">{formatFechaHora(t.TrasladoFecha)}</td>
                        <td className="px-3 py-2">
                          <div>{t.AlmacenOrigenNombre}</div>
                          <div className="text-xs text-slate-500">{t.EmpresaOrigenNombre}</div>
                        </td>
                        <td className="px-3 py-2">
                          <div>{t.AlmacenDestinoNombre}</div>
                          <div className="text-xs text-slate-500">{t.EmpresaDestinoNombre}</div>
                        </td>
                        <td className="px-3 py-2 text-right">{t.TrasladoCantidadProductos}</td>
                        <td className="px-3 py-2">
                          <span
                            className={`text-xs px-2 py-0.5 rounded ${
                              t.TrasladoEstado === "A"
                                ? "bg-red-100 text-red-800"
                                : "bg-emerald-100 text-emerald-800"
                            }`}
                          >
                            {t.TrasladoEstado === "A" ? "Anulado" : "Confirmado"}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button
                            onClick={() => verDetalle(t.TrasladoId)}
                            className="text-blue-600 hover:text-blue-800 text-xs"
                          >
                            Ver detalle
                          </button>
                        </td>
                      </tr>
                    ))}
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
      )}

      {/* ── EQUIVALENCIAS ──────────────────────────────────────────────── */}
      {tab === "equivalencias" && (
        <EquivalenciasTab
          almacenes={almacenes}
          puedeEditar={puedeCrear}
          puedeEliminar={puedeEliminar}
        />
      )}

      {/* ── DETALLE ────────────────────────────────────────────────────── */}
      {detalle && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => setDetalle(null)}
        >
          <div
            className="bg-white rounded-lg max-w-3xl w-full max-h-[85vh] overflow-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-slate-800">
                  Traslado N° {detalle.TrasladoId}
                </h2>
                <p className="text-xs text-slate-500">
                  {formatFechaHora(detalle.TrasladoFecha)} · {detalle.AlmacenOrigenNombre} →{" "}
                  {detalle.AlmacenDestinoNombre}
                  {detalle.UsuarioId ? ` · ${detalle.UsuarioId}` : ""}
                </p>
              </div>
              <button
                onClick={() => setDetalle(null)}
                className="text-slate-400 hover:text-slate-600 text-xl leading-none"
              >
                ×
              </button>
            </div>

            {detalle.TrasladoObs && (
              <p className="px-4 pt-3 text-sm text-slate-600">{detalle.TrasladoObs}</p>
            )}
            {detalle.TrasladoEstado === "A" && (
              <p className="mx-4 mt-3 text-xs text-red-800 bg-red-50 border border-red-200 rounded px-3 py-2">
                Anulado el {formatFechaHora(detalle.TrasladoAnuladoFecha)}
                {detalle.TrasladoAnuladoUsuarioId
                  ? ` por ${detalle.TrasladoAnuladoUsuarioId}`
                  : ""}
                . El stock fue devuelto al origen.
              </p>
            )}

            <div className="p-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">Origen</th>
                    <th className="text-right px-3 py-2 font-medium">Sacado</th>
                    <th className="text-left px-3 py-2 font-medium">Destino</th>
                    <th className="text-right px-3 py-2 font-medium">Ingresado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(detalle.productos || []).map((l) => (
                    <tr key={l.TrasladoProductoId}>
                      <td className="px-3 py-2">{l.ProductoOrigenNombre}</td>
                      <td className="px-3 py-2 text-right">
                        {formatMiles(l.TrasladoCantidadCaja)} caja(s) de {l.TrasladoCcOrigen}
                        {l.TrasladoCantidadUnidad > 0 &&
                          ` + ${formatMiles(l.TrasladoCantidadUnidad)} un.`}
                        <div className="text-xs text-slate-500">
                          {formatMiles(l.TrasladoUnidadesOrigen)} un.
                        </div>
                      </td>
                      <td className="px-3 py-2">{l.ProductoDestinoNombre}</td>
                      <td className="px-3 py-2 text-right">
                        {formatMiles(Math.floor(l.TrasladoUnidadesDestino / cc(l.TrasladoCcDestino)))}{" "}
                        caja(s) de {l.TrasladoCcDestino}
                        <div className="text-xs text-slate-500">
                          {formatMiles(l.TrasladoUnidadesDestino)} un.
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {detalle.TrasladoEstado === "C" && puedeEliminar && (
              <div className="px-4 py-3 border-t border-slate-200 flex justify-end">
                <button
                  onClick={() => anular(detalle)}
                  className="px-4 py-2 text-sm rounded-md bg-red-600 text-white hover:bg-red-700"
                >
                  Anular traslado
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
