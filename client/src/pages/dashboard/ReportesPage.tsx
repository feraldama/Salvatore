import React, { useMemo, useState, useEffect, useRef } from "react";
import { usePermiso } from "../../hooks/usePermiso";
import { PermissionDenied } from "../../components/common/ui";
import { loadPdf } from "../../utils/lazyPdf";
import api from "../../services/api";
import { formatMiles } from "../../utils/utils";
import { getAllClientesSinPaginacion } from "../../services/clientes.service";
import {
  getReporteMovimientosProductos,
  getReporteMasVendidos,
  getProductosAll,
  type ProductoMovimientoRow,
  type ProductoMasVendidoRow,
} from "../../services/productos.service";
import {
  getRegistrosDiariosCajaPorRango,
  type RegistroDiarioCajaRow,
} from "../../services/registros.service";
import {
  getEnviosPorVehiculo,
  type EnviosPorVehiculo,
  getVentasPorVendedor,
  type VentasPorVendedor,
  getVentasPorTipo,
  type VentasPorTipo,
  getVentasPorProducto,
  type VentasPorProducto,
  getReporteCobrosGanancia,
} from "../../services/venta.service";
import { useAuth } from "../../contexts/useAuth";

interface DeudaCliente {
  ClienteId: number;
  Cliente: string;
  TotalVentas: number;
  TotalEntregado: number;
  Saldo: number;
}

interface Cliente {
  ClienteId: number;
  ClienteNombre: string;
  ClienteApellido: string;
  ClienteRUC: string;
}

interface ProductoOption {
  ProductoId: number;
  ProductoCodigo: string | number;
  ProductoNombre: string;
}

interface Pago {
  VentaCreditoPagoId: number;
  VentaCreditoPagoFecha: string;
  VentaCreditoPagoMonto: number;
}

interface Venta {
  VentaId: number;
  VentaFecha: string;
  VentaTipo: string;
  Total: number;
  MontoCompra: number;
  VentaEntrega: number;
  SaldoPendiente: number;
  Pagos: Pago[];
  AlmacenNombre: string;
  UsuarioNombre: string;
  ClienteNombre?: string;
  ClienteApellido?: string;
  UsuarioId?: string;
  VentaUsuario?: string;
}

interface ReporteData {
  cliente: {
    ClienteId: number;
    ClienteNombre: string;
    ClienteApellido: string;
    ClienteRUC: string;
  };
  fechaDesde: string;
  fechaHasta: string;
  ventas: Venta[];
}

interface ProductoAlmacenStock {
  AlmacenNombre: string;
  ProductoAlmacenStock: number;
  ProductoAlmacenStockUnitario: number;
}

interface ProductoStockReporte {
  ProductoId: number;
  ProductoCodigo: string;
  ProductoNombre: string;
  ProductoCantidadCaja: number;
  ProductoPrecioPromedio: number;
  ProductoPrecioVenta: number;
  ProductoStock: number;
  ProductoStockUnitario: number;
  productoAlmacen: ProductoAlmacenStock[];
}

interface ResumenCierre {
  fechaCierre: string;
  fechaCierreDate: Date;
  cajaId: number;
  cajaDescripcion: string;
  usuarioId: string;
  apertura: number;
  cierre: number;
  egresos: number;
  ingresos: number;
  ingresosPOS: number;
  ingresosVoucher: number;
  ingresosTransfer: number;
  totalIngresos: number;
  diferencia: number;
  sobranteFaltante: number;
  parcial?: boolean;
}

function toLocalDateStr(fechaRegistro: string): string {
  const d = new Date(fechaRegistro);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDateDDMMYYYY(fecha: Date | string): string {
  const d =
    typeof fecha === "string"
      ? new Date(fecha.includes("T") ? fecha : fecha + "T12:00:00")
      : fecha;
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

// Fecha+hora local (dd/mm/aaaa HH:mm) para los timestamps UTC de
// registrodiariocaja (mismo criterio que toLocalDateStr: convertir a hora PY).
function formatFechaHoraLocal(fechaISO: string): string {
  const d = new Date(fechaISO);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${formatDateDDMMYYYY(d)} ${hh}:${mm}`;
}

function getHoyISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function calcularTotalesCiclo(
  registrosCajaUsuario: RegistroDiarioCajaRow[],
  idApertura: number,
  idCierre: number,
) {
  const filtrados = registrosCajaUsuario.filter(
    (r) =>
      r.RegistroDiarioCajaId >= idApertura &&
      r.RegistroDiarioCajaId <= idCierre,
  );
  const aperturaReg = filtrados.find(
    (r) => r.TipoGastoId === 2 && r.TipoGastoGrupoId === 2,
  );
  const cierreReg = filtrados.find(
    (r) => r.TipoGastoId === 1 && r.TipoGastoGrupoId === 2,
  );
  const apertura = aperturaReg?.RegistroDiarioCajaMonto ?? 0;
  const cierre = cierreReg?.RegistroDiarioCajaMonto ?? 0;

  let egresos = 0;
  let ingresos = 0;
  let ingresosPOS = 0;
  let ingresosVoucher = 0;
  let ingresosTransfer = 0;
  for (const reg of filtrados) {
    // Efectivo que entra a la caja física: venta contado (1) y la seña/efectivo
    // de venta a crédito (3). POS(4)/voucher(5)/transferencia(6) no son efectivo,
    // y los grupos de envío (7-10) los cobra el móvil → NO entran a la caja.
    if (
      reg.TipoGastoId === 2 &&
      (reg.TipoGastoGrupoId === 1 || reg.TipoGastoGrupoId === 3)
    ) {
      ingresos += reg.RegistroDiarioCajaMonto;
    }
    if (reg.TipoGastoId === 1 && reg.TipoGastoGrupoId !== 2) {
      egresos += reg.RegistroDiarioCajaMonto;
    }
    if (reg.TipoGastoId === 2 && reg.TipoGastoGrupoId === 4) {
      ingresosPOS += reg.RegistroDiarioCajaMonto;
    }
    if (reg.TipoGastoId === 2 && reg.TipoGastoGrupoId === 5) {
      ingresosVoucher += reg.RegistroDiarioCajaMonto;
    }
    if (reg.TipoGastoId === 2 && reg.TipoGastoGrupoId === 6) {
      ingresosTransfer += reg.RegistroDiarioCajaMonto;
    }
  }
  const totalIngresos =
    ingresos + ingresosPOS + ingresosVoucher + ingresosTransfer;
  const diferencia = totalIngresos - egresos;
  const sobranteFaltante = ingresos + apertura - (cierre + egresos);

  return {
    apertura,
    cierre,
    egresos,
    ingresos,
    ingresosPOS,
    ingresosVoucher,
    ingresosTransfer,
    totalIngresos,
    diferencia,
    sobranteFaltante,
  };
}

function buildResumenesCierre(
  registros: RegistroDiarioCajaRow[],
  fechaDesde: string,
  fechaHasta: string,
): ResumenCierre[] {
  if (registros.length === 0) return [];

  const cierres = registros
    .filter((r) => r.TipoGastoId === 1 && r.TipoGastoGrupoId === 2)
    .sort((a, b) => a.RegistroDiarioCajaId - b.RegistroDiarioCajaId);

  const resumenes: ResumenCierre[] = [];

  for (const cierreReg of cierres) {
    const fechaCierreLocal = toLocalDateStr(cierreReg.RegistroDiarioCajaFecha);
    if (fechaCierreLocal < fechaDesde || fechaCierreLocal > fechaHasta)
      continue;
    const registrosCajaUsuario = registros.filter(
      (r) =>
        r.CajaId === cierreReg.CajaId && r.UsuarioId === cierreReg.UsuarioId,
    );
    const mismosCajaUsuarioHastaCierre = registrosCajaUsuario.filter(
      (r) => r.RegistroDiarioCajaId <= cierreReg.RegistroDiarioCajaId,
    );
    const aperturas = mismosCajaUsuarioHastaCierre
      .filter(
        (r) =>
          r.TipoGastoId === 2 &&
          r.TipoGastoGrupoId === 2 &&
          r.RegistroDiarioCajaId < cierreReg.RegistroDiarioCajaId,
      )
      .sort((a, b) => b.RegistroDiarioCajaId - a.RegistroDiarioCajaId);
    const aperturaReg = aperturas[0];
    if (!aperturaReg) continue;
    if (cierreReg.RegistroDiarioCajaId <= aperturaReg.RegistroDiarioCajaId)
      continue;

    const totals = calcularTotalesCiclo(
      registrosCajaUsuario,
      aperturaReg.RegistroDiarioCajaId,
      cierreReg.RegistroDiarioCajaId,
    );

    const fechaCierreDate = new Date(cierreReg.RegistroDiarioCajaFecha);
    resumenes.push({
      fechaCierre: formatDateDDMMYYYY(fechaCierreDate),
      fechaCierreDate,
      cajaId: cierreReg.CajaId,
      cajaDescripcion: cierreReg.CajaDescripcion ?? `Caja ${cierreReg.CajaId}`,
      usuarioId: cierreReg.UsuarioId,
      ...totals,
    });
  }

  resumenes.sort(
    (a, b) => a.fechaCierreDate.getTime() - b.fechaCierreDate.getTime(),
  );
  return resumenes;
}

// Etiquetas de los grupos del reporte "Ventas por tipo de venta".
const TIPO_VENTA_LABELS: Record<string, string> = {
  ENVIO: "Envío",
  ENVIO_TR: "Transferencia envío",
  CO: "Contado",
  CR: "Crédito",
  PO: "POS",
  TR: "Transferencia",
};
const labelTipoVenta = (tipo: string) => TIPO_VENTA_LABELS[tipo] ?? tipo;

const PAGE_SIZE = 25;

const ReportesPage: React.FC = () => {
  const puedeLeer = usePermiso("REPORTES", "leer");
  const { user, empresaActiva } = useAuth();
  // El reporte de envíos por móvil aplica solo a la empresa mayorista
  // (distribuidora, EmpresaTipo === "D"). Misma resolución que VentasDispatcher:
  // el admin sigue la empresa activa del switcher; el usuario regular, la suya.
  const esMayorista =
    (user?.isAdmin === "S"
      ? empresaActiva?.EmpresaTipo ?? user?.EmpresaTipo
      : user?.EmpresaTipo) === "D";
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [clienteSeleccionado, setClienteSeleccionado] = useState<string>("TODOS");
  // Buscador del selector de cliente: texto escrito + si la lista está abierta +
  // índice resaltado para navegar con las flechas del teclado.
  const [clienteBusqueda, setClienteBusqueda] = useState<string>("TODOS");
  const [clienteListaAbierta, setClienteListaAbierta] = useState(false);
  const [clienteHighlight, setClienteHighlight] = useState(0);
  const clienteHighlightRef = useRef<HTMLLIElement | null>(null);
  const [fechaDesde, setFechaDesde] = useState(() => {
    const hoy = new Date();
    const primerDiaMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    return primerDiaMes.toISOString().split("T")[0];
  });
  const [fechaHasta, setFechaHasta] = useState(() => {
    const hoy = new Date();
    return hoy.toISOString().split("T")[0];
  });

  const [resumenesCierre, setResumenesCierre] = useState<ResumenCierre[]>([]);
  const [paginaCierre, setPaginaCierre] = useState(1);
  const [fechaDesdeCierre, setFechaDesdeCierre] = useState(() => getHoyISO());
  const [fechaHastaCierre, setFechaHastaCierre] = useState(() => getHoyISO());

  // Estado del reporte "Resumen de ingresos y egresos"
  const [fechaDesdeIE, setFechaDesdeIE] = useState(() => {
    const hoy = new Date();
    const primerDiaMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    return primerDiaMes.toISOString().split("T")[0];
  });
  const [fechaHastaIE, setFechaHastaIE] = useState(() => getHoyISO());
  const [registrosIE, setRegistrosIE] = useState<RegistroDiarioCajaRow[]>([]);
  const [resumenIEGenerado, setResumenIEGenerado] = useState(false);

  // Estado del reporte "Ventas por tipo de venta" (solo mayorista).
  // null = todavía no se generó.
  const [fechaDesdeTipoV, setFechaDesdeTipoV] = useState(() => {
    const hoy = new Date();
    const primerDiaMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    return primerDiaMes.toISOString().split("T")[0];
  });
  const [fechaHastaTipoV, setFechaHastaTipoV] = useState(() => getHoyISO());
  const [ventasPorTipo, setVentasPorTipo] = useState<VentasPorTipo | null>(
    null,
  );

  // Estado del reporte "Ventas por producto" (todas las empresas): buscador
  // de producto (mismo patrón que el de "más vendidos", pero sin opción TODOS
  // porque el reporte es de un producto concreto) + rango de fechas.
  const [fechaDesdeVP, setFechaDesdeVP] = useState(() => {
    const hoy = new Date();
    const primerDiaMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    return primerDiaMes.toISOString().split("T")[0];
  });
  const [fechaHastaVP, setFechaHastaVP] = useState(() => getHoyISO());
  const [productoBusquedaVP, setProductoBusquedaVP] = useState("");
  const [productoSeleccionadoVP, setProductoSeleccionadoVP] =
    useState<ProductoOption | null>(null);
  const [productoListaAbiertaVP, setProductoListaAbiertaVP] = useState(false);
  const [productoHighlightVP, setProductoHighlightVP] = useState(0);
  const productoHighlightVPRef = useRef<HTMLLIElement | null>(null);
  const [ventasProducto, setVentasProducto] =
    useState<VentasPorProducto | null>(null);

  // Estado del reporte "Productos vendidos y comprados"
  const [fechaDesdeMov, setFechaDesdeMov] = useState(() => {
    const hoy = new Date();
    const primerDiaMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    return primerDiaMes.toISOString().split("T")[0];
  });
  const [fechaHastaMov, setFechaHastaMov] = useState(() => getHoyISO());

  // Estado del reporte "Productos más vendidos"
  const [fechaDesdeTop, setFechaDesdeTop] = useState(() => {
    const hoy = new Date();
    const primerDiaMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    return primerDiaMes.toISOString().split("T")[0];
  });
  const [fechaHastaTop, setFechaHastaTop] = useState(() => getHoyISO());
  // Buscador del selector de producto del reporte "Productos más vendidos"
  // (mismo patrón que el selector de cliente): lista cargada bajo demanda al
  // abrir el modal, texto buscado, lista abierta e ítem resaltado.
  const [productosTop, setProductosTop] = useState<ProductoOption[]>([]);
  const [productoSeleccionadoTop, setProductoSeleccionadoTop] =
    useState<string>("TODOS");
  const [productoBusquedaTop, setProductoBusquedaTop] =
    useState<string>("TODOS");
  const [productoListaAbiertaTop, setProductoListaAbiertaTop] = useState(false);
  const [productoHighlightTop, setProductoHighlightTop] = useState(0);
  const productoHighlightTopRef = useRef<HTMLLIElement | null>(null);

  // Estado del reporte "Envíos por móvil" (solo mayorista)
  const [fechaDesdeEnvio, setFechaDesdeEnvio] = useState(() => {
    const hoy = new Date();
    const primerDiaMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    return primerDiaMes.toISOString().split("T")[0];
  });
  const [fechaHastaEnvio, setFechaHastaEnvio] = useState(() => getHoyISO());

  // Estado del reporte "Ventas por vendedor" (solo mayorista)
  const [fechaDesdeVend, setFechaDesdeVend] = useState(() => {
    const hoy = new Date();
    const primerDiaMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    return primerDiaMes.toISOString().split("T")[0];
  });
  const [fechaHastaVend, setFechaHastaVend] = useState(() => getHoyISO());
  // Porcentaje de comisión que se aplica al total vendido (texto: admite coma o
  // punto como separador decimal). Se parsea al generar. Default 0,2% editable.
  const [comisionPorcentaje, setComisionPorcentaje] = useState("0,2");

  // Estado del reporte "Cobros y ganancia por día". Default hoy/hoy: el uso
  // típico es el arqueo del día (qué se cobró hoy y cuánta ganancia dejó).
  const [fechaDesdeCobros, setFechaDesdeCobros] = useState(() => getHoyISO());
  const [fechaHastaCobros, setFechaHastaCobros] = useState(() => getHoyISO());

  // Cuál tarjeta de reporte está abierta en modal (slug del reporte) o null
  const [reporteActivo, setReporteActivo] = useState<string | null>(null);
  // Modalidad para el reporte de ventas por cliente (minorista): "" = todas,
  // "N" = solo ventana (mostrador), "S" = solo delivery.
  const [modalidadVentas, setModalidadVentas] = useState<"" | "N" | "S">("");

  // Clientes que matchean el texto del buscador (por nombre, apellido o RUC).
  const clientesFiltrados = useMemo(() => {
    const q = clienteBusqueda.trim().toLowerCase();
    if (!q || q === "todos") return clientes;
    return clientes.filter((c) =>
      `${c.ClienteNombre} ${c.ClienteApellido} ${c.ClienteRUC ?? ""}`
        .toLowerCase()
        .includes(q),
    );
  }, [clientes, clienteBusqueda]);

  // Productos que matchean el texto del buscador (por nombre o código).
  const productosFiltradosTop = useMemo(() => {
    const q = productoBusquedaTop.trim().toLowerCase();
    if (!q || q === "todos") return productosTop;
    return productosTop.filter((p) =>
      `${p.ProductoNombre} ${p.ProductoCodigo ?? ""}`.toLowerCase().includes(q),
    );
  }, [productosTop, productoBusquedaTop]);

  // Ídem para el buscador del reporte "Ventas por producto".
  const productosFiltradosVP = useMemo(() => {
    const q = productoBusquedaVP.trim().toLowerCase();
    if (!q) return productosTop;
    return productosTop.filter((p) =>
      `${p.ProductoNombre} ${p.ProductoCodigo ?? ""}`.toLowerCase().includes(q),
    );
  }, [productosTop, productoBusquedaVP]);

  const totalPaginasCierre = Math.max(
    1,
    Math.ceil(resumenesCierre.length / PAGE_SIZE),
  );
  const resumenesPaginados = useMemo(() => {
    const from = (paginaCierre - 1) * PAGE_SIZE;
    return resumenesCierre.slice(from, from + PAGE_SIZE);
  }, [resumenesCierre, paginaCierre]);

  const totalesGeneralesCierre = useMemo(() => {
    return resumenesCierre.reduce(
      (acc, r) => ({
        apertura: acc.apertura + r.apertura,
        cierre: acc.cierre + r.cierre,
        egresos: acc.egresos + r.egresos,
        ingresos: acc.ingresos + r.ingresos,
        ingresosPOS: acc.ingresosPOS + r.ingresosPOS,
        ingresosVoucher: acc.ingresosVoucher + r.ingresosVoucher,
        ingresosTransfer: acc.ingresosTransfer + r.ingresosTransfer,
        totalIngresos: acc.totalIngresos + r.totalIngresos,
        diferencia: acc.diferencia + r.diferencia,
      }),
      {
        apertura: 0,
        cierre: 0,
        egresos: 0,
        ingresos: 0,
        ingresosPOS: 0,
        ingresosVoucher: 0,
        ingresosTransfer: 0,
        totalIngresos: 0,
        diferencia: 0,
      },
    );
  }, [resumenesCierre]);

  // Resumen de ingresos y egresos: dos grupos (según TipoGastoId) con el
  // detalle de cada registro y el total de cada grupo.
  const ingresosIE = useMemo(
    () => registrosIE.filter((r) => r.TipoGastoId === 2),
    [registrosIE],
  );
  const egresosIE = useMemo(
    () => registrosIE.filter((r) => r.TipoGastoId === 1),
    [registrosIE],
  );
  const totalIngresosIE = useMemo(
    () => ingresosIE.reduce((acc, r) => acc + r.RegistroDiarioCajaMonto, 0),
    [ingresosIE],
  );
  const totalEgresosIE = useMemo(
    () => egresosIE.reduce((acc, r) => acc + r.RegistroDiarioCajaMonto, 0),
    [egresosIE],
  );

  useEffect(() => {
    const cargarClientes = async () => {
      try {
        const response = await getAllClientesSinPaginacion();
        const todosLosClientes = response.data || [];
        const clientesOrdenados = todosLosClientes.sort(
          (a: Cliente, b: Cliente) =>
            a.ClienteNombre.localeCompare(b.ClienteNombre),
        );
        setClientes(clientesOrdenados);
      } catch (error) {
        console.error("Error al cargar clientes:", error);
      }
    };
    cargarClientes();
  }, []);

  // Mantiene visible el item resaltado al navegar con las flechas.
  useEffect(() => {
    clienteHighlightRef.current?.scrollIntoView({ block: "nearest" });
  }, [clienteHighlight]);

  // Carga el catálogo de productos recién cuando algún buscador lo necesita
  // (modal de "más vendidos" o el buscador de "Ventas por producto"), una sola
  // vez, para no traer todo el catálogo al entrar a la página.
  useEffect(() => {
    const necesitaCatalogo =
      reporteActivo === "masvendidos" || productoListaAbiertaVP;
    if (!necesitaCatalogo || productosTop.length > 0) return;
    const cargarProductos = async () => {
      try {
        const response = await getProductosAll();
        const lista: ProductoOption[] = response?.data ?? [];
        lista.sort((a, b) =>
          String(a.ProductoNombre).localeCompare(String(b.ProductoNombre)),
        );
        setProductosTop(lista);
      } catch (error) {
        console.error("Error al cargar productos:", error);
      }
    };
    cargarProductos();
  }, [reporteActivo, productoListaAbiertaVP, productosTop.length]);

  useEffect(() => {
    productoHighlightTopRef.current?.scrollIntoView({ block: "nearest" });
  }, [productoHighlightTop]);

  useEffect(() => {
    productoHighlightVPRef.current?.scrollIntoView({ block: "nearest" });
  }, [productoHighlightVP]);

  if (!puedeLeer) return <PermissionDenied resource="los reportes" />;

  // Función para formatear fecha de aaaa-mm-dd a dd-mm-aaaa
  const formatearFecha = (fecha: string): string => {
    const [año, mes, dia] = fecha.split("-");
    return `${dia}/${mes}/${año}`;
  };

  // Formatea fecha y hora de un datetime ISO para reportes (dd/mm/aaaa HH:mm)
  const formatearFechaHora = (fechaStr: string): string => {
    const d = new Date(fechaStr);
    if (isNaN(d.getTime())) return fechaStr;
    const dia = String(d.getDate()).padStart(2, "0");
    const mes = String(d.getMonth() + 1).padStart(2, "0");
    const año = d.getFullYear();
    const h = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    return `${dia}/${mes}/${año} ${h}:${min}`;
  };

  // Etiqueta visible de un cliente en el buscador (nombre + RUC si tiene).
  const etiquetaCliente = (c: Cliente): string =>
    `${c.ClienteNombre} ${c.ClienteApellido}${c.ClienteRUC ? ` - ${c.ClienteRUC}` : ""}`.trim();

  // Confirma la selección del cliente desde el buscador.
  const seleccionarCliente = (id: string, label: string) => {
    setClienteSeleccionado(id);
    setClienteBusqueda(label);
    setClienteListaAbierta(false);
  };

  // Opciones del buscador: "TODOS" primero + los clientes filtrados. El índice
  // en este array es el que navegan las flechas (clienteHighlight).
  const opcionesCliente: { id: string; label: string }[] = [
    { id: "TODOS", label: "TODOS" },
    ...clientesFiltrados.map((c) => ({
      id: String(c.ClienteId),
      label: etiquetaCliente(c),
    })),
  ];

  // Navegación con teclado en el buscador de cliente.
  const onKeyDownCliente = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setClienteListaAbierta(true);
      setClienteHighlight((h) => Math.min(h + 1, opcionesCliente.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setClienteHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      if (clienteListaAbierta && opcionesCliente[clienteHighlight]) {
        e.preventDefault();
        const op = opcionesCliente[clienteHighlight];
        seleccionarCliente(op.id, op.label);
      }
    } else if (e.key === "Escape") {
      setClienteListaAbierta(false);
    }
  };

  // Etiqueta visible de un producto en el buscador (código + nombre).
  const etiquetaProducto = (p: ProductoOption): string =>
    `${p.ProductoCodigo ? `${p.ProductoCodigo} - ` : ""}${p.ProductoNombre}`.trim();

  // Confirma la selección del producto desde el buscador.
  const seleccionarProducto = (id: string, label: string) => {
    setProductoSeleccionadoTop(id);
    setProductoBusquedaTop(label);
    setProductoListaAbiertaTop(false);
  };

  // Opciones del buscador: "TODOS" primero + los productos filtrados.
  const opcionesProducto: { id: string; label: string }[] = [
    { id: "TODOS", label: "TODOS" },
    ...productosFiltradosTop.map((p) => ({
      id: String(p.ProductoId),
      label: etiquetaProducto(p),
    })),
  ];

  // Navegación con teclado en el buscador de producto.
  const onKeyDownProducto = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setProductoListaAbiertaTop(true);
      setProductoHighlightTop((h) =>
        Math.min(h + 1, opcionesProducto.length - 1),
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setProductoHighlightTop((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      if (productoListaAbiertaTop && opcionesProducto[productoHighlightTop]) {
        e.preventDefault();
        const op = opcionesProducto[productoHighlightTop];
        seleccionarProducto(op.id, op.label);
      }
    } else if (e.key === "Escape") {
      setProductoListaAbiertaTop(false);
    }
  };

  // Buscador de producto del reporte "Ventas por producto".
  const seleccionarProductoVP = (p: ProductoOption) => {
    setProductoSeleccionadoVP(p);
    setProductoBusquedaVP(etiquetaProducto(p));
    setProductoListaAbiertaVP(false);
  };

  const onKeyDownProductoVP = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setProductoListaAbiertaVP(true);
      setProductoHighlightVP((h) =>
        Math.min(h + 1, productosFiltradosVP.length - 1),
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setProductoHighlightVP((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      if (productoListaAbiertaVP && productosFiltradosVP[productoHighlightVP]) {
        e.preventDefault();
        seleccionarProductoVP(productosFiltradosVP[productoHighlightVP]);
      }
    } else if (e.key === "Escape") {
      setProductoListaAbiertaVP(false);
    }
  };

  const handleGenerarPDF = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get("/venta/pendientes");
      const deudas: DeudaCliente[] = res.data.data || [];
      const { jsPDF, autoTable } = await loadPdf();
      const doc = new jsPDF();
      doc.setFontSize(18);
      doc.text("Créditos Pendientes a Cobrar", 14, 18);
      let y = 28;
      let totalGeneral = 0;
      const rows = deudas.map((d) => [
        d.ClienteId,
        d.Cliente,
        formatMiles(d.TotalVentas),
        formatMiles(d.TotalEntregado),
        formatMiles(d.Saldo),
      ]);
      autoTable(doc, {
        head: [["CLIENTE ID", "CLIENTE", "TOTAL", "ENTREGA", "SALDO"]],
        body: rows,
        startY: y,
        theme: "grid",
        headStyles: { fillColor: [22, 163, 74] },
        styles: { fontSize: 11 },
        margin: { left: 14, right: 14 },
      });
      y =
        (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable
          .finalY + 12; // Más espacio
      totalGeneral = deudas.reduce((acc, d) => acc + Number(d.Saldo), 0);
      doc.setFontSize(14);
      doc.text(`TOTAL GENERAL: Gs. ${formatMiles(totalGeneral)}`, 14, y);
      doc.save("creditos_pendientes.pdf");
      const blob = doc.output("blob");
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch {
      setError("Error al generar el PDF de deudas pendientes");
    } finally {
      setLoading(false);
    }
  };

  const handleGenerarReporteVentas = async () => {
    if (!fechaDesde || !fechaHasta) {
      setError("Debes seleccionar ambas fechas");
      return;
    }

    if (new Date(fechaDesde) > new Date(fechaHasta)) {
      setError("La fecha desde no puede ser mayor que la fecha hasta");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await api.get("/venta/reporte", {
        params: {
          clienteId: clienteSeleccionado,
          fechaDesde,
          fechaHasta,
          esDelivery: modalidadVentas || undefined,
        },
      });

      const reporte: ReporteData = res.data.data;
      const esTodos = clienteSeleccionado.toUpperCase() === "TODOS";

      const { jsPDF, autoTable } = await loadPdf();
      const doc = new jsPDF({ orientation: esTodos ? "landscape" : "portrait" });
      let y = 20;

      // Título
      doc.setFontSize(18);
      doc.text("Reporte de Ventas por Cliente", 14, y);
      y += 10;

      // Información del cliente o TODOS
      doc.setFontSize(12);
      doc.text(
        `Cliente: ${reporte.cliente.ClienteNombre} ${reporte.cliente.ClienteApellido}`.trim() || "TODOS",
        14,
        y,
      );
      y += 6;
      if (reporte.cliente.ClienteRUC) {
        doc.text(`RUC: ${reporte.cliente.ClienteRUC}`, 14, y);
        y += 6;
      }
      doc.text(
        `Período: ${formatearFecha(fechaDesde)} al ${formatearFecha(
          fechaHasta,
        )}`,
        14,
        y,
      );
      y += 6;
      if (modalidadVentas) {
        doc.text(
          `Modalidad: ${modalidadVentas === "S" ? "Delivery" : "Ventana"}`,
          14,
          y,
        );
        y += 6;
      }
      y += 4;

      // Totales por tipo de venta
      let totalVentas = 0;
      let totalCompra = 0;
      let totalSaldoPendiente = 0;
      let totalEfectivo = 0;
      let totalPOS = 0;
      let totalTransfer = 0;
      let totalCredito = 0;

      const ventasRows: string[][] = [];

      reporte.ventas.forEach((venta) => {
        const tipoVenta =
          venta.VentaTipo === "CO"
            ? "Contado"
            : venta.VentaTipo === "CR"
              ? "Crédito"
              : venta.VentaTipo === "PO"
                ? "POS"
                : venta.VentaTipo === "TR"
                  ? "Transfer"
                  : venta.VentaTipo;

        const fechaVenta = formatearFechaHora(venta.VentaFecha);
        const clienteNombre = [venta.ClienteNombre, venta.ClienteApellido]
          .filter(Boolean)
          .join(" ")
          .trim() || "-";
        const usuarioId = String(venta.UsuarioId ?? venta.VentaUsuario ?? "").trim() || "-";
        const montoCompra = Number(venta.MontoCompra) || 0;
        const ganancia = Number(venta.Total) - montoCompra;

        totalVentas += Number(venta.Total);
        totalCompra += montoCompra;
        if (venta.VentaTipo === "CO") totalEfectivo += Number(venta.Total);
        else if (venta.VentaTipo === "PO") totalPOS += Number(venta.Total);
        else if (venta.VentaTipo === "TR") totalTransfer += Number(venta.Total);
        else if (venta.VentaTipo === "CR") {
          totalCredito += Number(venta.Total);
          totalSaldoPendiente += Number(venta.SaldoPendiente);
        }

        if (esTodos) {
          ventasRows.push([
            venta.VentaId.toString(),
            clienteNombre,
            fechaVenta,
            tipoVenta,
            formatMiles(venta.Total),
            formatMiles(montoCompra),
            formatMiles(ganancia),
            venta.VentaTipo === "CR" ? formatMiles(venta.SaldoPendiente) : "-",
            usuarioId,
          ]);
        } else {
          ventasRows.push([
            venta.VentaId.toString(),
            fechaVenta,
            tipoVenta,
            formatMiles(venta.Total),
            formatMiles(montoCompra),
            formatMiles(ganancia),
            venta.VentaTipo === "CR" ? formatMiles(venta.SaldoPendiente) : "-",
            usuarioId,
          ]);
        }

        // Si es crédito y tiene pagos, agregar información de pagos
        if (venta.VentaTipo === "CR" && venta.Pagos && venta.Pagos.length > 0) {
          venta.Pagos.forEach((pago) => {
            const fechaPago = formatearFechaHora(pago.VentaCreditoPagoFecha);
            if (esTodos) {
              ventasRows.push(["", "", fechaPago, `  Pago ${pago.VentaCreditoPagoId}`, formatMiles(pago.VentaCreditoPagoMonto), "", "", "", ""]);
            } else {
              ventasRows.push(["", fechaPago, `  Pago ${pago.VentaCreditoPagoId}`, formatMiles(pago.VentaCreditoPagoMonto), "", "", "", ""]);
            }
          });
        }
      });

      const tableHead = esTodos
        ? [["ID", "CLIENTE", "FECHA", "TIPO", "TOTAL", "COMPRA", "GANANCIA", "SALDO PEND.", "USUARIO"]]
        : [["ID", "FECHA", "TIPO", "TOTAL", "COMPRA", "GANANCIA", "SALDO PEND.", "USUARIO"]];

      const columnStyles: Record<number, { cellWidth: number }> = esTodos
        ? {
            0: { cellWidth: 15 },
            1: { cellWidth: 42 },
            2: { cellWidth: 26 },
            3: { cellWidth: 20 },
            4: { cellWidth: 28 },
            5: { cellWidth: 28 },
            6: { cellWidth: 28 },
            7: { cellWidth: 28 },
            8: { cellWidth: 20 },
          }
        : {
            0: { cellWidth: 13 },
            1: { cellWidth: 26 },
            2: { cellWidth: 18 },
            3: { cellWidth: 26 },
            4: { cellWidth: 26 },
            5: { cellWidth: 26 },
            6: { cellWidth: 26 },
            7: { cellWidth: 18 },
          };

      autoTable(doc, {
        head: tableHead,
        body: ventasRows,
        startY: y,
        theme: "grid",
        headStyles: { fillColor: [22, 163, 74] },
        styles: { fontSize: esTodos ? 8 : 9 },
        margin: { left: 14, right: 14 },
        columnStyles,
      });

      y =
        (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable
          .finalY + 10;

      // Totales generales y por tipo (como Reporte de cierre de caja)
      doc.setFontSize(12);
      doc.text("TOTALES", 14, y);
      y += 6;
      doc.setFontSize(10);
      doc.text(`Total Ventas: Gs. ${formatMiles(totalVentas)}`, 14, y);
      y += 6;
      doc.text(`Total Compra: Gs. ${formatMiles(totalCompra)}`, 14, y);
      y += 6;
      doc.text(
        `Ganancia (Ventas - Compra): Gs. ${formatMiles(totalVentas - totalCompra)}`,
        14,
        y,
      );
      y += 6;
      doc.text(
        `Efectivo: ${formatMiles(totalEfectivo)} | POS: ${formatMiles(totalPOS)} | Transfer: ${formatMiles(totalTransfer)} | Crédito: ${formatMiles(totalCredito)}`,
        14,
        y,
      );
      y += 6;
      if (totalSaldoPendiente > 0) {
        doc.text(
          `Total Saldo Pendiente: Gs. ${formatMiles(totalSaldoPendiente)}`,
          14,
          y,
        );
      }

      const nombreArchivo = `reporte_ventas_${esTodos ? "todos" : reporte.cliente.ClienteId}_${fechaDesde}_${fechaHasta}.pdf`;
      doc.save(nombreArchivo);
      const blob = doc.output("blob");
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) {
      const error = err as { response?: { data?: { message?: string } } };
      setError(
        error.response?.data?.message ||
          "Error al generar el reporte de ventas",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleGenerarReporteStock = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get("/productos/reporte-stock");
      const data = res.data?.data;
      const productos: ProductoStockReporte[] = Array.isArray(data?.productos)
        ? data.productos
        : [];

      // Para cada producto calculo:
      //   totalUnidades  = stockCajas * cantCaja + stockUnitario
      //   precioUnitario = precioPromedio / cantCaja (si cantCaja > 0)
      //   valorStock     = stockCajas * precioPromedio +
      //                    stockUnitario * precioUnitario
      // Solo se listan productos con stock > 0, ordenados por valor DESC.
      const enriquecidos = productos
        .map((p) => {
          const cantCaja = Number(p.ProductoCantidadCaja) || 0;
          const stockCajas = Number(p.ProductoStock) || 0;
          const stockUni = Number(p.ProductoStockUnitario) || 0;
          const precioCajaCosto = Number(p.ProductoPrecioPromedio) || 0;
          const precioUniCosto =
            cantCaja > 0 ? precioCajaCosto / cantCaja : 0;
          const totalUnidades = stockCajas * cantCaja + stockUni;
          const valorStock =
            stockCajas * precioCajaCosto + stockUni * precioUniCosto;
          return {
            p,
            cantCaja,
            stockCajas,
            stockUni,
            totalUnidades,
            precioCajaCosto,
            precioUniCosto,
            valorStock,
          };
        })
        .filter((r) => r.totalUnidades > 0)
        .sort((a, b) => b.valorStock - a.valorStock);

      const capitalTotal = enriquecidos.reduce((acc, r) => acc + r.valorStock, 0);
      const totalCajas = enriquecidos.reduce((acc, r) => acc + r.stockCajas, 0);
      const totalUnidadesSueltas = enriquecidos.reduce(
        (acc, r) => acc + r.stockUni,
        0,
      );

      const { jsPDF, autoTable } = await loadPdf();
      const doc = new jsPDF({ orientation: "landscape" });
      let y = 18;

      doc.setFontSize(16);
      doc.text("Reporte de stock valorizado", 14, y);
      y += 7;
      doc.setFontSize(10);
      doc.text(
        `Generado: ${new Date().toLocaleDateString("es-PY")} — ${enriquecidos.length} producto(s) con stock`,
        14,
        y,
      );
      y += 4;

      if (enriquecidos.length === 0) {
        doc.setFontSize(11);
        doc.text("No hay productos con stock.", 14, y + 8);
      } else {
        const tableRows: (string | { content: string; styles?: object })[][] = [];
        enriquecidos.forEach((r, idx) => {
          const { p } = r;
          tableRows.push([
            String(idx + 1),
            String(p.ProductoCodigo ?? ""),
            String(p.ProductoNombre ?? ""),
            r.cantCaja ? String(r.cantCaja) : "-",
            `${formatMiles(r.stockCajas)} cj / ${formatMiles(r.stockUni)} un`,
            formatMiles(r.totalUnidades),
            formatMiles(r.precioCajaCosto),
            formatMiles(r.valorStock),
          ]);
          (p.productoAlmacen || [])
            .filter(
              (pa) =>
                (pa.ProductoAlmacenStock ?? 0) > 0 ||
                (pa.ProductoAlmacenStockUnitario ?? 0) > 0,
            )
            .forEach((pa) => {
              tableRows.push([
                "",
                "",
                {
                  content: `   · ${pa.AlmacenNombre ?? ""}`,
                  styles: { textColor: [90, 90, 90], fontStyle: "italic" },
                },
                "",
                {
                  content: `${formatMiles(pa.ProductoAlmacenStock ?? 0)} cj / ${formatMiles(pa.ProductoAlmacenStockUnitario ?? 0)} un`,
                  styles: { textColor: [90, 90, 90], fontStyle: "italic" },
                },
                "",
                "",
                "",
              ]);
            });
        });

        autoTable(doc, {
          head: [
            [
              "#",
              "Código",
              "Producto",
              "Cant. caja",
              "Stock (cj/un)",
              "Total unid.",
              "P. costo caja",
              "Valor stock",
            ],
          ],
          body: tableRows,
          startY: y + 4,
          theme: "grid",
          headStyles: { fillColor: [29, 78, 216], fontSize: 9 },
          styles: { fontSize: 8 },
          margin: { left: 14, right: 14 },
          columnStyles: {
            0: { cellWidth: 10, halign: "right" },
            1: { cellWidth: 32 },
            2: { cellWidth: "auto" },
            3: { cellWidth: 18, halign: "right" },
            4: { cellWidth: 34, halign: "right" },
            5: { cellWidth: 22, halign: "right" },
            6: { cellWidth: 28, halign: "right" },
            7: { cellWidth: 32, halign: "right" },
          },
        });

        y =
          (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable
            .finalY + 10;

        const pageHeight = doc.internal.pageSize.getHeight();
        if (y > pageHeight - 40) {
          doc.addPage();
          y = 18;
        }

        doc.setFontSize(13);
        doc.text("RESUMEN", 14, y);
        y += 7;
        doc.setFontSize(10);
        doc.text(
          `Productos con stock: ${enriquecidos.length}`,
          14,
          y,
        );
        y += 6;
        doc.text(
          `Total cajas: ${formatMiles(totalCajas)} cj — Total unidades sueltas: ${formatMiles(totalUnidadesSueltas)} un`,
          14,
          y,
        );
        y += 8;
        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.text(
          `CAPITAL INMOVILIZADO EN STOCK: Gs. ${formatMiles(capitalTotal)}`,
          14,
          y,
        );
        doc.setFont("helvetica", "normal");
      }

      const nombreArchivo = `reporte_stock_${new Date()
        .toISOString()
        .slice(0, 10)}.pdf`;
      doc.save(nombreArchivo);
      const blob = doc.output("blob");
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) {
      const error = err as { response?: { data?: { message?: string } } };
      setError(
        error.response?.data?.message || "Error al generar el reporte de stock",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleGenerarReporteMovimientos = async () => {
    if (!fechaDesdeMov || !fechaHastaMov) {
      setError("Debes seleccionar ambas fechas");
      return;
    }
    if (new Date(fechaDesdeMov) > new Date(fechaHastaMov)) {
      setError("La fecha desde no puede ser mayor que la fecha hasta");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await getReporteMovimientosProductos(
        fechaDesdeMov,
        fechaHastaMov,
      );
      const productos: ProductoMovimientoRow[] = data?.productos ?? [];

      const { jsPDF, autoTable } = await loadPdf();
      const doc = new jsPDF({ orientation: "landscape" });
      let y = 18;

      // Título y período
      doc.setFontSize(16);
      doc.text("Reporte de productos vendidos y comprados", 14, y);
      y += 7;
      doc.setFontSize(10);
      doc.text(
        `Período: ${formatearFecha(fechaDesdeMov)} al ${formatearFecha(fechaHastaMov)}`,
        14,
        y,
      );
      y += 6;

      if (productos.length === 0) {
        doc.setFontSize(11);
        doc.text("Sin movimientos en el período seleccionado.", 14, y + 6);
      } else {
        // Formatea "5 cj / 12 un". Si una parte es 0, igual se muestra para
        // mantener alineación visual entre filas.
        const fmtCjUn = (cajas: number, unidades: number) =>
          `${formatMiles(cajas)} cj / ${formatMiles(unidades)} un`;

        // Filas: una por producto
        const rows = productos.map((p) => {
          const ganancia = p.MontoVendido - p.CostoVendido;
          const margen =
            p.MontoVendido > 0 ? (ganancia / p.MontoVendido) * 100 : 0;
          return [
            String(p.ProductoCodigo ?? ""),
            String(p.ProductoNombre ?? ""),
            fmtCjUn(p.CantidadVendidaCajas, p.CantidadVendidaUnidades),
            fmtCjUn(p.CantidadCompradaCajas, p.CantidadCompradaUnidades),
            formatMiles(p.MontoVendido),
            formatMiles(p.CostoVendido),
            formatMiles(ganancia),
            `${margen.toFixed(1)}%`,
          ];
        });

        autoTable(doc, {
          head: [
            [
              "Código",
              "Producto",
              "Cant. vend. (cj/un)",
              "Cant. comp. (cj/un)",
              "Monto venta",
              "Costo venta",
              "Ganancia",
              "Margen",
            ],
          ],
          body: rows,
          startY: y + 2,
          theme: "grid",
          headStyles: { fillColor: [29, 78, 216], fontSize: 9 }, // brand-700
          styles: { fontSize: 8 },
          margin: { left: 14, right: 14 },
          columnStyles: {
            0: { cellWidth: 22 },
            1: { cellWidth: "auto" },
            2: { cellWidth: 32, halign: "right" },
            3: { cellWidth: 32, halign: "right" },
            4: { cellWidth: 28, halign: "right" },
            5: { cellWidth: 28, halign: "right" },
            6: { cellWidth: 28, halign: "right" },
            7: { cellWidth: 18, halign: "right" },
          },
        });

        y =
          (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable
            .finalY + 10;

        // Totales generales
        const totales = productos.reduce(
          (acc, p) => {
            acc.cantidadVendidaCajas += p.CantidadVendidaCajas;
            acc.cantidadVendidaUnidades += p.CantidadVendidaUnidades;
            acc.cantidadCompradaCajas += p.CantidadCompradaCajas;
            acc.cantidadCompradaUnidades += p.CantidadCompradaUnidades;
            acc.montoVendido += p.MontoVendido;
            acc.costoVendido += p.CostoVendido;
            acc.montoComprado += p.MontoComprado;
            return acc;
          },
          {
            cantidadVendidaCajas: 0,
            cantidadVendidaUnidades: 0,
            cantidadCompradaCajas: 0,
            cantidadCompradaUnidades: 0,
            montoVendido: 0,
            costoVendido: 0,
            montoComprado: 0,
          },
        );
        const gananciaTotal = totales.montoVendido - totales.costoVendido;
        const margenPromedio =
          totales.montoVendido > 0
            ? (gananciaTotal / totales.montoVendido) * 100
            : 0;

        // Si no entra el resumen en la página actual, salto a una nueva
        const pageHeight = doc.internal.pageSize.getHeight();
        if (y > pageHeight - 60) {
          doc.addPage();
          y = 18;
        }

        doc.setFontSize(13);
        doc.text("RESUMEN GENERAL", 14, y);
        y += 7;
        doc.setFontSize(10);
        doc.text(
          `Productos con movimiento     : ${productos.length}`,
          14,
          y,
        );
        y += 6;
        doc.text(
          `Cantidad vendida (cj / un)   : ${formatMiles(totales.cantidadVendidaCajas)} cj / ${formatMiles(totales.cantidadVendidaUnidades)} un`,
          14,
          y,
        );
        y += 6;
        doc.text(
          `Cantidad comprada (cj / un)  : ${formatMiles(totales.cantidadCompradaCajas)} cj / ${formatMiles(totales.cantidadCompradaUnidades)} un`,
          14,
          y,
        );
        y += 6;
        doc.text(
          `Monto total ventas       : Gs. ${formatMiles(totales.montoVendido)}`,
          14,
          y,
        );
        y += 6;
        doc.text(
          `Costo total ventas       : Gs. ${formatMiles(totales.costoVendido)}`,
          14,
          y,
        );
        y += 6;
        doc.text(
          `Monto total compras      : Gs. ${formatMiles(totales.montoComprado)}`,
          14,
          y,
        );
        y += 6;
        doc.setFontSize(11);
        doc.text(
          `Ganancia total           : Gs. ${formatMiles(gananciaTotal)}   |   Margen promedio: ${margenPromedio.toFixed(1)}%`,
          14,
          y,
        );
      }

      const nombreArchivo = `reporte_movimientos_productos_${fechaDesdeMov}_${fechaHastaMov}.pdf`;
      doc.save(nombreArchivo);
      const blob = doc.output("blob");
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) {
      const e = err as { message?: string };
      setError(
        e?.message || "Error al generar el reporte de productos vendidos/comprados",
      );
    } finally {
      setLoading(false);
    }
  };

  // Convierte un total de unidades a "cajas + unidades" usando cantidadCaja.
  // Ej: 15 unidades con cantidadCaja=12 → 1 caja y 3 unidades.
  const dividirEnCajasYUnidades = (
    totalUnidades: number,
    cantidadCaja: number,
  ): { cajas: number; unidades: number } => {
    if (!cantidadCaja || cantidadCaja <= 0) {
      return { cajas: 0, unidades: Math.trunc(totalUnidades) };
    }
    const total = Math.trunc(totalUnidades);
    const cajas = Math.trunc(total / cantidadCaja);
    const unidades = total - cajas * cantidadCaja;
    return { cajas, unidades };
  };

  const handleGenerarReporteMasVendidos = async () => {
    if (!fechaDesdeTop || !fechaHastaTop) {
      setError("Debes seleccionar ambas fechas");
      return;
    }
    if (new Date(fechaDesdeTop) > new Date(fechaHastaTop)) {
      setError("La fecha desde no puede ser mayor que la fecha hasta");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const esTodosProductos = productoSeleccionadoTop === "TODOS";
      const data = await getReporteMasVendidos(
        fechaDesdeTop,
        fechaHastaTop,
        esTodosProductos ? undefined : Number(productoSeleccionadoTop),
      );
      const productos: ProductoMasVendidoRow[] = data?.productos ?? [];

      const { jsPDF, autoTable } = await loadPdf();
      const doc = new jsPDF({ orientation: "landscape" });
      let y = 18;

      doc.setFontSize(16);
      doc.text("Reporte de productos más vendidos", 14, y);
      y += 7;
      doc.setFontSize(10);
      doc.text(
        `Período: ${formatearFecha(fechaDesdeTop)} al ${formatearFecha(fechaHastaTop)}`,
        14,
        y,
      );
      y += 6;
      if (!esTodosProductos) {
        doc.text(`Producto: ${productoBusquedaTop}`, 14, y);
        y += 6;
      }

      if (productos.length === 0) {
        doc.setFontSize(11);
        doc.text("Sin ventas en el período seleccionado.", 14, y + 6);
      } else {
        const fmtCjUn = (cajas: number, unidades: number) =>
          `${formatMiles(cajas)} cj / ${formatMiles(unidades)} un`;

        const rows = productos.map((p, idx) => {
          const vendido = dividirEnCajasYUnidades(
            p.CantidadVendidaTotalUnidades,
            p.ProductoCantidadCaja,
          );
          const ganancia = p.MontoVendido - p.CostoVendido;
          return [
            String(idx + 1),
            String(p.ProductoCodigo ?? ""),
            String(p.ProductoNombre ?? ""),
            fmtCjUn(vendido.cajas, vendido.unidades),
            formatMiles(p.ProductoPrecioVenta),
            formatMiles(p.ProductoPrecioPromedio),
            formatMiles(ganancia),
            fmtCjUn(p.ProductoStock, p.ProductoStockUnitario),
          ];
        });

        autoTable(doc, {
          head: [
            [
              "#",
              "Código",
              "Producto",
              "Cant. vendida (cj/un)",
              "Precio venta",
              "Precio costo",
              "Ganancia",
              "Stock actual (cj/un)",
            ],
          ],
          body: rows,
          startY: y + 2,
          theme: "grid",
          headStyles: { fillColor: [29, 78, 216], fontSize: 9 },
          styles: { fontSize: 8 },
          margin: { left: 14, right: 14 },
          columnStyles: {
            0: { cellWidth: 10, halign: "right" },
            1: { cellWidth: 32 },
            2: { cellWidth: "auto" },
            3: { cellWidth: 34, halign: "right" },
            4: { cellWidth: 26, halign: "right" },
            5: { cellWidth: 26, halign: "right" },
            6: { cellWidth: 28, halign: "right" },
            7: { cellWidth: 34, halign: "right" },
          },
        });

        y =
          (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable
            .finalY + 10;

        const totales = productos.reduce(
          (acc, p) => {
            acc.totalUnidades += p.CantidadVendidaTotalUnidades;
            acc.montoVendido += p.MontoVendido;
            acc.costoVendido += p.CostoVendido;
            return acc;
          },
          { totalUnidades: 0, montoVendido: 0, costoVendido: 0 },
        );
        const gananciaTotal = totales.montoVendido - totales.costoVendido;

        const pageHeight = doc.internal.pageSize.getHeight();
        if (y > pageHeight - 40) {
          doc.addPage();
          y = 18;
        }

        doc.setFontSize(13);
        doc.text("RESUMEN", 14, y);
        y += 7;
        doc.setFontSize(10);
        doc.text(`Productos vendidos: ${productos.length}`, 14, y);
        y += 6;
        doc.text(
          `Total unidades vendidas: ${formatMiles(totales.totalUnidades)} un`,
          14,
          y,
        );
        y += 6;
        doc.text(
          `Monto total ventas: Gs. ${formatMiles(totales.montoVendido)}`,
          14,
          y,
        );
        y += 6;
        doc.text(
          `Costo total ventas: Gs. ${formatMiles(totales.costoVendido)}`,
          14,
          y,
        );
        y += 6;
        doc.setFontSize(11);
        doc.text(
          `Ganancia total: Gs. ${formatMiles(gananciaTotal)}`,
          14,
          y,
        );
      }

      const nombreArchivo = `reporte_mas_vendidos_${esTodosProductos ? "todos" : productoSeleccionadoTop}_${fechaDesdeTop}_${fechaHastaTop}.pdf`;
      doc.save(nombreArchivo);
      const blob = doc.output("blob");
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) {
      const e = err as { message?: string };
      setError(
        e?.message || "Error al generar el reporte de productos más vendidos",
      );
    } finally {
      setLoading(false);
    }
  };

  const generarReporteCierre = async () => {
    if (!fechaDesdeCierre || !fechaHastaCierre) {
      setError("Seleccione fecha desde y hasta");
      return;
    }
    if (new Date(fechaDesdeCierre) > new Date(fechaHastaCierre)) {
      setError("La fecha desde no puede ser mayor que la fecha hasta");
      return;
    }
    setLoading(true);
    setError(null);
    setResumenesCierre([]);
    setPaginaCierre(1);
    try {
      const { data } = await getRegistrosDiariosCajaPorRango(
        fechaDesdeCierre,
        fechaHastaCierre,
      );
      const lista = Array.isArray(data) ? data : [];
      const res = buildResumenesCierre(
        lista,
        fechaDesdeCierre,
        fechaHastaCierre,
      );
      setResumenesCierre(res);
    } catch (e) {
      setError(
        (e as { message?: string })?.message ??
          "Error al cargar registros por rango de fechas",
      );
    } finally {
      setLoading(false);
    }
  };


  const exportarCierrePDF = async () => {
    if (resumenesCierre.length === 0) return;
    const { jsPDF, autoTable } = await loadPdf();
    const doc = new jsPDF({ orientation: "landscape", format: "a4" });
    doc.setFontSize(14);
    doc.text(
      `Reporte de cierre de caja - ${formatDateDDMMYYYY(fechaDesdeCierre)} a ${formatDateDDMMYYYY(fechaHastaCierre)}`,
      14,
      14,
    );
    const rows = resumenesCierre.map((r) => [
      r.fechaCierre,
      r.cajaDescripcion,
      r.usuarioId,
      formatMiles(r.apertura),
      formatMiles(r.cierre),
      formatMiles(r.egresos),
      formatMiles(r.ingresos),
      formatMiles(r.ingresosPOS),
      formatMiles(r.ingresosVoucher),
      formatMiles(r.ingresosTransfer),
      formatMiles(r.totalIngresos),
      formatMiles(r.diferencia),
      formatMiles(r.sobranteFaltante),
    ]);
    autoTable(doc, {
      head: [
        [
          "Fecha cierre",
          "Caja",
          "Usuario",
          "Apertura",
          "Cierre",
          "Egresos",
          "Ing.Efect.",
          "POS",
          "Voucher",
          "Transfer",
          "Total ing.",
          "Diferencia",
          "S/F",
        ],
      ],
      body: rows,
      startY: 22,
      theme: "grid",
      headStyles: { fillColor: [37, 99, 235], fontSize: 8 },
      styles: { fontSize: 7 },
      margin: { left: 14, right: 14 },
    });
    let y =
      (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable
        .finalY + 10;
    doc.setFontSize(11);
    doc.text("TOTALES", 14, y);
    y += 5;
    doc.setFontSize(8);
    doc.text("Suma de todos los registros del período", 14, y);
    y += 6;
    doc.setFontSize(10);
    doc.text(
      `Total registros: ${resumenesCierre.length} | Total ingresos: ${formatMiles(
        totalesGeneralesCierre.totalIngresos,
      )} | Total egresos: ${formatMiles(totalesGeneralesCierre.egresos)}`,
      14,
      y,
    );
    y += 6;
    doc.setFontSize(9);
    doc.text(
      `Ing. efectivo: ${formatMiles(
        totalesGeneralesCierre.ingresos,
      )} | POS: ${formatMiles(
        totalesGeneralesCierre.ingresosPOS,
      )} | Voucher: ${formatMiles(
        totalesGeneralesCierre.ingresosVoucher,
      )} | Transfer: ${formatMiles(totalesGeneralesCierre.ingresosTransfer)}`,
      14,
      y,
    );

    const pdfBlob = doc.output("blob");
    const pdfUrl = URL.createObjectURL(pdfBlob);
    const link = document.createElement("a");
    link.href = pdfUrl;
    link.download = `reporte_cierre_caja_${fechaDesdeCierre}_${fechaHastaCierre}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    const openLink = document.createElement("a");
    openLink.href = pdfUrl;
    openLink.target = "_blank";
    document.body.appendChild(openLink);
    openLink.click();
    document.body.removeChild(openLink);
    setTimeout(() => URL.revokeObjectURL(pdfUrl), 2000);
  };

  // Resumen de ingresos y egresos: trae los registros de caja del período y
  // los separa en dos grupos. Excluye aperturas (2/2) y cierres (1/2) de caja,
  // que son movimientos operativos y no ingresos/egresos reales.
  const generarResumenIngresosEgresos = async () => {
    if (!fechaDesdeIE || !fechaHastaIE) {
      setError("Seleccione fecha desde y hasta");
      return;
    }
    if (new Date(fechaDesdeIE) > new Date(fechaHastaIE)) {
      setError("La fecha desde no puede ser mayor que la fecha hasta");
      return;
    }
    setLoading(true);
    setError(null);
    setRegistrosIE([]);
    setResumenIEGenerado(false);
    try {
      // El endpoint /rango amplía ±1 día por el desfase UTC; acá se vuelve a
      // filtrar por la fecha local (hora PY) de cada registro.
      const { data } = await getRegistrosDiariosCajaPorRango(
        fechaDesdeIE,
        fechaHastaIE,
      );
      const lista = Array.isArray(data) ? data : [];
      const filtrados = lista.filter((r) => {
        const fechaLocal = toLocalDateStr(r.RegistroDiarioCajaFecha);
        if (fechaLocal < fechaDesdeIE || fechaLocal > fechaHastaIE)
          return false;
        // Apertura (2/2) y cierre (1/2) de caja no son ingresos/egresos.
        if (r.TipoGastoGrupoId === 2) return false;
        return true;
      });
      filtrados.sort((a, b) =>
        a.RegistroDiarioCajaFecha < b.RegistroDiarioCajaFecha
          ? -1
          : a.RegistroDiarioCajaFecha > b.RegistroDiarioCajaFecha
            ? 1
            : a.RegistroDiarioCajaId - b.RegistroDiarioCajaId,
      );
      setRegistrosIE(filtrados);
      setResumenIEGenerado(true);
    } catch (e) {
      setError(
        (e as { message?: string })?.message ??
          "Error al cargar registros por rango de fechas",
      );
    } finally {
      setLoading(false);
    }
  };

  const exportarResumenIngresosEgresosPDF = async () => {
    if (registrosIE.length === 0) return;
    const { jsPDF, autoTable } = await loadPdf();
    const doc = new jsPDF({ orientation: "portrait", format: "a4" });
    doc.setFontSize(14);
    doc.text(
      `Resumen de ingresos y egresos - ${formatDateDDMMYYYY(fechaDesdeIE)} a ${formatDateDDMMYYYY(fechaHastaIE)}`,
      14,
      14,
    );

    const filaIE = (r: RegistroDiarioCajaRow) => [
      formatFechaHoraLocal(r.RegistroDiarioCajaFecha),
      r.TipoGastoGrupoDescripcion ?? `Grupo ${r.TipoGastoGrupoId}`,
      r.RegistroDiarioCajaDetalle ?? "",
      r.CajaDescripcion ?? String(r.CajaId),
      r.UsuarioId ?? "",
      formatMiles(r.RegistroDiarioCajaMonto),
    ];
    const head = [["Fecha", "Concepto", "Detalle", "Caja", "Usuario", "Monto"]];
    const columnStyles = {
      5: { halign: "right" as const },
    };

    let y = 24;
    doc.setFontSize(12);
    doc.text(`INGRESOS (${ingresosIE.length})`, 14, y);
    autoTable(doc, {
      head,
      body: ingresosIE.map(filaIE),
      foot: [["", "", "", "", "Total ingresos", formatMiles(totalIngresosIE)]],
      startY: y + 3,
      theme: "grid",
      headStyles: { fillColor: [22, 163, 74], fontSize: 8 },
      footStyles: {
        fillColor: [220, 252, 231],
        textColor: [22, 101, 52],
        fontStyle: "bold",
        halign: "right",
      },
      styles: { fontSize: 7 },
      columnStyles,
      margin: { left: 14, right: 14 },
    });

    y =
      (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable
        .finalY + 10;
    if (y > doc.internal.pageSize.getHeight() - 30) {
      doc.addPage();
      y = 14;
    }
    doc.setFontSize(12);
    doc.text(`EGRESOS (${egresosIE.length})`, 14, y);
    autoTable(doc, {
      head,
      body: egresosIE.map(filaIE),
      foot: [["", "", "", "", "Total egresos", formatMiles(totalEgresosIE)]],
      startY: y + 3,
      theme: "grid",
      headStyles: { fillColor: [220, 38, 38], fontSize: 8 },
      footStyles: {
        fillColor: [254, 226, 226],
        textColor: [153, 27, 27],
        fontStyle: "bold",
        halign: "right",
      },
      styles: { fontSize: 7 },
      columnStyles,
      margin: { left: 14, right: 14 },
    });

    y =
      (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable
        .finalY + 10;
    if (y > doc.internal.pageSize.getHeight() - 24) {
      doc.addPage();
      y = 14;
    }
    doc.setFontSize(11);
    doc.text(
      `Total ingresos: ${formatMiles(totalIngresosIE)} | Total egresos: ${formatMiles(
        totalEgresosIE,
      )} | Diferencia: ${formatMiles(totalIngresosIE - totalEgresosIE)}`,
      14,
      y,
    );

    const pdfBlob = doc.output("blob");
    const pdfUrl = URL.createObjectURL(pdfBlob);
    const link = document.createElement("a");
    link.href = pdfUrl;
    link.download = `resumen_ingresos_egresos_${fechaDesdeIE}_${fechaHastaIE}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    const openLink = document.createElement("a");
    openLink.href = pdfUrl;
    openLink.target = "_blank";
    document.body.appendChild(openLink);
    openLink.click();
    document.body.removeChild(openLink);
    setTimeout(() => URL.revokeObjectURL(pdfUrl), 2000);
  };

  // Ventas por tipo de venta (solo mayorista): envío como grupo propio y el
  // resto por forma de venta (contado/crédito/POS/transferencia), cada grupo
  // con el detalle de sus ventas y su total.
  const generarVentasPorTipo = async () => {
    if (!fechaDesdeTipoV || !fechaHastaTipoV) {
      setError("Seleccione fecha desde y hasta");
      return;
    }
    if (new Date(fechaDesdeTipoV) > new Date(fechaHastaTipoV)) {
      setError("La fecha desde no puede ser mayor que la fecha hasta");
      return;
    }
    setLoading(true);
    setError(null);
    setVentasPorTipo(null);
    try {
      const data = await getVentasPorTipo({
        fechaDesde: fechaDesdeTipoV,
        fechaHasta: fechaHastaTipoV,
      });
      setVentasPorTipo(data);
    } catch (e) {
      setError(
        (e as { message?: string })?.message ??
          "Error al obtener las ventas por tipo",
      );
    } finally {
      setLoading(false);
    }
  };

  const exportarVentasPorTipoPDF = async () => {
    if (!ventasPorTipo || ventasPorTipo.grupos.length === 0) return;
    const { jsPDF, autoTable } = await loadPdf();
    const doc = new jsPDF({ orientation: "portrait", format: "a4" });
    doc.setFontSize(14);
    doc.text(
      `Ventas por tipo de venta - ${formatDateDDMMYYYY(fechaDesdeTipoV)} a ${formatDateDDMMYYYY(fechaHastaTipoV)}`,
      14,
      14,
    );

    const head = [["Fecha", "N° venta", "Cliente", "Forma pago", "Total", "Pendiente"]];
    const columnStyles = {
      4: { halign: "right" as const },
      5: { halign: "right" as const },
    };

    let y = 24;
    for (const grupo of ventasPorTipo.grupos) {
      if (y > doc.internal.pageSize.getHeight() - 30) {
        doc.addPage();
        y = 14;
      }
      doc.setFontSize(12);
      doc.text(
        `${labelTipoVenta(grupo.tipo).toUpperCase()} (${grupo.cantidad})`,
        14,
        y,
      );
      autoTable(doc, {
        head,
        body: grupo.ventas.map((v) => [
          formatFechaHoraLocal(v.VentaFecha),
          String(v.VentaId),
          [v.ClienteNombre, v.ClienteApellido].filter(Boolean).join(" ") ||
            "-",
          labelTipoVenta(v.VentaTipo),
          formatMiles(v.Total),
          v.Pendiente > 0 ? formatMiles(v.Pendiente) : "-",
        ]),
        foot: [
          [
            "",
            "",
            "",
            `Total ${labelTipoVenta(grupo.tipo)}`,
            formatMiles(grupo.totalVendido),
            grupo.totalPendiente > 0 ? formatMiles(grupo.totalPendiente) : "-",
          ],
        ],
        startY: y + 3,
        theme: "grid",
        headStyles: { fillColor: [37, 99, 235], fontSize: 8 },
        footStyles: {
          fillColor: [219, 234, 254],
          textColor: [30, 64, 175],
          fontStyle: "bold",
          halign: "right",
        },
        styles: { fontSize: 7 },
        columnStyles,
        margin: { left: 14, right: 14 },
      });
      y =
        (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable
          .finalY + 10;
    }

    if (y > doc.internal.pageSize.getHeight() - 30) {
      doc.addPage();
      y = 14;
    }
    doc.setFontSize(11);
    doc.text("TOTALES", 14, y);
    y += 6;
    doc.setFontSize(9);
    for (const grupo of ventasPorTipo.grupos) {
      doc.text(
        `${labelTipoVenta(grupo.tipo)}: ${formatMiles(grupo.totalVendido)} (${grupo.cantidad} venta(s))`,
        14,
        y,
      );
      y += 5;
    }
    y += 1;
    doc.setFontSize(10);
    doc.text(
      `Total general: ${formatMiles(ventasPorTipo.totales.totalVendido)} | ${ventasPorTipo.totales.cantidad} venta(s) | Pendiente: ${formatMiles(
        ventasPorTipo.totales.totalPendiente,
      )}`,
      14,
      y,
    );

    const pdfBlob = doc.output("blob");
    const pdfUrl = URL.createObjectURL(pdfBlob);
    const link = document.createElement("a");
    link.href = pdfUrl;
    link.download = `ventas_por_tipo_${fechaDesdeTipoV}_${fechaHastaTipoV}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    const openLink = document.createElement("a");
    openLink.href = pdfUrl;
    openLink.target = "_blank";
    document.body.appendChild(openLink);
    openLink.click();
    document.body.removeChild(openLink);
    setTimeout(() => URL.revokeObjectURL(pdfUrl), 2000);
  };

  // Ventas por producto: en qué ventas y a qué cliente se vendió el producto
  // seleccionado dentro del período.
  const generarVentasPorProducto = async () => {
    if (!productoSeleccionadoVP) {
      setError("Seleccioná un producto para generar el reporte");
      return;
    }
    if (!fechaDesdeVP || !fechaHastaVP) {
      setError("Seleccione fecha desde y hasta");
      return;
    }
    if (new Date(fechaDesdeVP) > new Date(fechaHastaVP)) {
      setError("La fecha desde no puede ser mayor que la fecha hasta");
      return;
    }
    setLoading(true);
    setError(null);
    setVentasProducto(null);
    try {
      const data = await getVentasPorProducto({
        productoId: productoSeleccionadoVP.ProductoId,
        fechaDesde: fechaDesdeVP,
        fechaHasta: fechaHastaVP,
      });
      setVentasProducto(data);
    } catch (e) {
      setError(
        (e as { message?: string })?.message ??
          "Error al obtener las ventas del producto",
      );
    } finally {
      setLoading(false);
    }
  };

  const exportarVentasPorProductoPDF = async () => {
    if (
      !ventasProducto ||
      ventasProducto.ventas.length === 0 ||
      !productoSeleccionadoVP
    )
      return;
    const { jsPDF, autoTable } = await loadPdf();
    const doc = new jsPDF({ orientation: "portrait", format: "a4" });
    doc.setFontSize(14);
    doc.text("Ventas por producto", 14, 14);
    doc.setFontSize(10);
    doc.text(`Producto: ${etiquetaProducto(productoSeleccionadoVP)}`, 14, 21);
    doc.text(
      `Período: ${formatDateDDMMYYYY(fechaDesdeVP)} al ${formatDateDDMMYYYY(fechaHastaVP)}`,
      14,
      27,
    );

    autoTable(doc, {
      head: [
        ["Fecha", "N° venta", "Cliente", "Tipo", "Cantidad", "Precio", "Subtotal"],
      ],
      body: ventasProducto.ventas.map((v) => [
        formatFechaHoraLocal(v.VentaFecha),
        String(v.VentaId),
        [v.ClienteNombre, v.ClienteApellido].filter(Boolean).join(" ") || "-",
        `${labelTipoVenta(v.VentaTipo)}${v.EsEnvio === "S" ? " (envío)" : ""}`,
        `${formatMiles(v.Cantidad)} ${v.Unitario === "U" ? "unid." : "cajas"}`,
        formatMiles(v.Precio),
        formatMiles(v.Subtotal),
      ]),
      foot: [
        [
          "",
          "",
          "",
          "TOTAL",
          `${formatMiles(ventasProducto.totales.totalCajas)} cajas / ${formatMiles(
            ventasProducto.totales.totalUnidades,
          )} unid.`,
          "",
          formatMiles(ventasProducto.totales.totalMonto),
        ],
      ],
      startY: 32,
      theme: "grid",
      headStyles: { fillColor: [37, 99, 235], fontSize: 8 },
      footStyles: {
        fillColor: [219, 234, 254],
        textColor: [30, 64, 175],
        fontStyle: "bold",
        halign: "right",
      },
      styles: { fontSize: 7 },
      columnStyles: {
        4: { halign: "right" as const },
        5: { halign: "right" as const },
        6: { halign: "right" as const },
      },
      margin: { left: 14, right: 14 },
    });

    let y =
      (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable
        .finalY + 10;
    if (y > doc.internal.pageSize.getHeight() - 24) {
      doc.addPage();
      y = 14;
    }
    doc.setFontSize(10);
    doc.text(
      `Ventas: ${ventasProducto.totales.cantidadVentas} | Cajas: ${formatMiles(
        ventasProducto.totales.totalCajas,
      )} | Unidades: ${formatMiles(
        ventasProducto.totales.totalUnidades,
      )} | Total vendido: ${formatMiles(ventasProducto.totales.totalMonto)}`,
      14,
      y,
    );

    const pdfBlob = doc.output("blob");
    const pdfUrl = URL.createObjectURL(pdfBlob);
    const link = document.createElement("a");
    link.href = pdfUrl;
    link.download = `ventas_producto_${productoSeleccionadoVP.ProductoId}_${fechaDesdeVP}_${fechaHastaVP}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    const openLink = document.createElement("a");
    openLink.href = pdfUrl;
    openLink.target = "_blank";
    document.body.appendChild(openLink);
    openLink.click();
    document.body.removeChild(openLink);
    setTimeout(() => URL.revokeObjectURL(pdfUrl), 2000);
  };

  // Reporte de envíos separado por móvil (vehículo de flota). Solo mayorista.
  // Genera un PDF con un bloque por móvil: detalle de sus ventas envío + sus
  // subtotales por método de pago, y al final los totales generales.
  const handleGenerarReporteEnviosVehiculo = async () => {
    if (!fechaDesdeEnvio || !fechaHastaEnvio) {
      setError("Debes seleccionar ambas fechas");
      return;
    }
    if (new Date(fechaDesdeEnvio) > new Date(fechaHastaEnvio)) {
      setError("La fecha desde no puede ser mayor que la fecha hasta");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data: EnviosPorVehiculo = await getEnviosPorVehiculo({
        fechaDesde: fechaDesdeEnvio,
        fechaHasta: fechaHastaEnvio,
      });

      const { jsPDF, autoTable } = await loadPdf();
      const doc = new jsPDF({ orientation: "landscape" });
      const anchoPagina = doc.internal.pageSize.getWidth();
      let y = 18;

      doc.setFontSize(18);
      doc.text("Ventas por envío - separadas por móvil", 14, y);
      y += 8;
      doc.setFontSize(11);
      doc.text(
        `Período: ${formatearFecha(fechaDesdeEnvio)} al ${formatearFecha(fechaHastaEnvio)}`,
        14,
        y,
      );
      y += 8;

      if (!data.vehiculos.length) {
        doc.setFontSize(12);
        doc.text("No hay envíos en el período seleccionado.", 14, y + 4);
      }

      const getFinalY = () =>
        (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable
          .finalY;

      const nombreMovil = (g: EnviosPorVehiculo["vehiculos"][number]) => {
        if (g.vehiculoId == null) return "Sin móvil asignado";
        const desc = [g.marca, g.modelo].filter(Boolean).join(" ");
        return `${g.chapa ?? `Móvil ${g.vehiculoId}`}${desc ? ` — ${desc}` : ""}`;
      };

      // Línea de totales por método de cobro. POS y Voucher casi no se usan en
      // envíos: se muestran solo si tienen monto, para no ensuciar el reporte.
      const lineaMetodos = (m: EnviosPorVehiculo["totales"]["porMetodo"]) => {
        const partes = [`Efectivo: ${formatMiles(m.efectivo)}`];
        if (m.pos > 0) partes.push(`POS: ${formatMiles(m.pos)}`);
        if (m.voucher > 0) partes.push(`Voucher: ${formatMiles(m.voucher)}`);
        partes.push(`Transfer: ${formatMiles(m.transferencia)}`);
        partes.push(`Crédito (pendiente): ${formatMiles(m.credito)}`);
        return partes.join("  |  ");
      };

      data.vehiculos.forEach((g) => {
        // Salto de página si no entra el encabezado del móvil.
        if (y > doc.internal.pageSize.getHeight() - 40) {
          doc.addPage();
          y = 18;
        }
        doc.setFontSize(13);
        doc.text(nombreMovil(g), 14, y);
        y += 6;
        doc.setFontSize(10);
        doc.text(
          `Envíos: ${g.cantidad}  |  Total enviado: Gs. ${formatMiles(g.totalEnviado)}`,
          14,
          y,
        );
        y += 4;

        const rows = g.ventas.map((v) => {
          const cliente =
            [v.ClienteNombre, v.ClienteApellido].filter(Boolean).join(" ").trim() ||
            "-";
          return [
            v.VentaId.toString(),
            formatearFechaHora(v.VentaFecha),
            cliente,
            formatMiles(v.Total),
            v.formaPago || "-",
            formatMiles(v.VentaEntrega),
            formatMiles(v.Pendiente),
          ];
        });

        autoTable(doc, {
          head: [
            ["ID", "FECHA", "CLIENTE", "TOTAL", "FORMA PAGO", "COBRADO", "PENDIENTE"],
          ],
          body: rows,
          startY: y,
          theme: "grid",
          headStyles: { fillColor: [234, 88, 12] },
          styles: { fontSize: 9 },
          margin: { left: 14, right: 14 },
          columnStyles: {
            0: { cellWidth: 16 },
            1: { cellWidth: 34 },
            3: { cellWidth: 32, halign: "right" },
            4: { cellWidth: 40 },
            5: { cellWidth: 32, halign: "right" },
            6: { cellWidth: 32, halign: "right" },
          },
        });
        y = getFinalY() + 6;

        doc.setFontSize(9);
        doc.text(lineaMetodos(g.porMetodo), 14, y);
        y += 10;
      });

      if (data.vehiculos.length) {
        if (y > doc.internal.pageSize.getHeight() - 40) {
          doc.addPage();
          y = 18;
        }
        const t = data.totales;
        doc.setDrawColor(200);
        doc.line(14, y - 4, anchoPagina - 14, y - 4);
        doc.setFontSize(12);
        doc.text("TOTALES GENERALES", 14, y + 2);
        y += 8;
        doc.setFontSize(10);
        doc.text(
          `Envíos: ${t.cantidad}  |  Total enviado: Gs. ${formatMiles(t.totalEnviado)}`,
          14,
          y,
        );
        y += 6;
        doc.text(lineaMetodos(t.porMetodo), 14, y);
      }

      doc.save(`reporte_envios_por_movil_${fechaDesdeEnvio}_${fechaHastaEnvio}.pdf`);
      const blob = doc.output("blob");
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      setReporteActivo(null);
    } catch (err) {
      const error = err as { message?: string };
      setError(error.message || "Error al generar el reporte de envíos por móvil");
    } finally {
      setLoading(false);
    }
  };

  // Etiqueta de forma de pago a partir del VentaTipo (CO/CR/PO/TR).
  const formaPagoVentaTipo = (tipo?: string): string => {
    switch (tipo) {
      case "CO":
        return "Contado";
      case "CR":
        return "Crédito";
      case "PO":
        return "POS";
      case "TR":
        return "Transferencia";
      default:
        return tipo || "-";
    }
  };

  // Reporte de ventas por vendedor (para comisiones). Solo mayorista. Detalla
  // cada venta (monto + forma de pago) agrupada por vendedor, con subtotales por
  // vendedor (total vendido y comisión = total × %) y totales generales al final.
  const handleGenerarReporteVentasVendedor = async () => {
    if (!fechaDesdeVend || !fechaHastaVend) {
      setError("Debes seleccionar ambas fechas");
      return;
    }
    if (new Date(fechaDesdeVend) > new Date(fechaHastaVend)) {
      setError("La fecha desde no puede ser mayor que la fecha hasta");
      return;
    }
    const pct = Number(String(comisionPorcentaje).replace(",", "."));
    if (isNaN(pct) || pct < 0) {
      setError("Ingresá un porcentaje de comisión válido (ej: 0,2)");
      return;
    }
    // El % puede tener decimales (ej. 0,2). formatMiles redondea, así que para
    // mostrar el porcentaje lo formateamos aparte preservando los decimales.
    const pctStr = pct.toLocaleString("es-ES", { maximumFractionDigits: 4 });
    setLoading(true);
    setError(null);
    try {
      const data: VentasPorVendedor = await getVentasPorVendedor({
        fechaDesde: fechaDesdeVend,
        fechaHasta: fechaHastaVend,
      });

      const { jsPDF, autoTable } = await loadPdf();
      const doc = new jsPDF({ orientation: "landscape" });
      const anchoPagina = doc.internal.pageSize.getWidth();
      let y = 18;
      doc.setFontSize(18);
      doc.text("Ventas por vendedor - comisiones", 14, y);
      y += 8;
      doc.setFontSize(11);
      doc.text(
        `Período: ${formatearFecha(fechaDesdeVend)} al ${formatearFecha(fechaHastaVend)}`,
        14,
        y,
      );
      y += 6;
      doc.text(`Comisión aplicada: ${pctStr}% sobre el total vendido`, 14, y);
      y += 8;

      if (!data.vendedores.length) {
        doc.setFontSize(12);
        doc.text("No hay ventas en el período seleccionado.", 14, y + 4);
      }

      const getFinalY = () =>
        (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable
          .finalY;

      let totalComision = 0;
      data.vendedores.forEach((v) => {
        const nombre =
          v.vendedorId == null
            ? "Sin vendedor"
            : [v.nombre, v.apellido].filter(Boolean).join(" ").trim() ||
              `Vendedor ${v.vendedorId}`;
        const comision = Math.round((v.totalVendido * pct) / 100);
        totalComision += comision;

        if (y > doc.internal.pageSize.getHeight() - 40) {
          doc.addPage();
          y = 18;
        }
        doc.setFontSize(13);
        doc.text(nombre, 14, y);
        y += 6;
        doc.setFontSize(10);
        doc.text(
          `Ventas: ${v.cantidad}  |  Total vendido: Gs. ${formatMiles(v.totalVendido)}`,
          14,
          y,
        );
        y += 4;

        const rows = v.ventas.map((venta) => {
          const cliente =
            [venta.ClienteNombre, venta.ClienteApellido]
              .filter(Boolean)
              .join(" ")
              .trim() || "-";
          return [
            venta.VentaId.toString(),
            formatearFechaHora(venta.VentaFecha),
            cliente,
            formaPagoVentaTipo(venta.VentaTipo),
            formatMiles(venta.Total),
            formatMiles(venta.Pendiente),
          ];
        });

        autoTable(doc, {
          head: [
            ["ID", "FECHA", "CLIENTE", "FORMA PAGO", "TOTAL", "PENDIENTE"],
          ],
          body: rows,
          startY: y,
          theme: "grid",
          headStyles: { fillColor: [37, 99, 235] },
          styles: { fontSize: 9 },
          margin: { left: 14, right: 14 },
          columnStyles: {
            0: { cellWidth: 16 },
            1: { cellWidth: 36 },
            3: { cellWidth: 36 },
            4: { cellWidth: 38, halign: "right" },
            5: { cellWidth: 38, halign: "right" },
          },
        });
        y = getFinalY() + 6;

        doc.setFontSize(10);
        doc.text(
          `Subtotal vendido: Gs. ${formatMiles(v.totalVendido)}   |   Comisión (${pctStr}%): Gs. ${formatMiles(comision)}`,
          14,
          y,
        );
        y += 10;
      });

      if (data.vendedores.length) {
        if (y > doc.internal.pageSize.getHeight() - 40) {
          doc.addPage();
          y = 18;
        }
        doc.setDrawColor(200);
        doc.line(14, y - 4, anchoPagina - 14, y - 4);
        doc.setFontSize(12);
        doc.text("TOTALES GENERALES", 14, y + 2);
        y += 8;
        doc.setFontSize(10);
        doc.text(
          `Ventas: ${data.totales.cantidad}  |  Total vendido: Gs. ${formatMiles(data.totales.totalVendido)}`,
          14,
          y,
        );
        y += 6;
        doc.text(`Comisión total a pagar: Gs. ${formatMiles(totalComision)}`, 14, y);
      }

      doc.save(`reporte_ventas_por_vendedor_${fechaDesdeVend}_${fechaHastaVend}.pdf`);
      const blob = doc.output("blob");
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      setReporteActivo(null);
    } catch (err) {
      const error = err as { message?: string };
      setError(error.message || "Error al generar el reporte de ventas por vendedor");
    } finally {
      setLoading(false);
    }
  };

  // Reporte "Cobros y ganancia por día" (criterio de lo percibido): por cada
  // día del rango muestra el dinero recibido —ventas del día y cobros de
  // créditos anteriores— con la ganancia realizada en la fecha de cobro. La
  // ganancia de una venta a crédito se difiere: se realiza proporcionalmente
  // con la seña y con cada cobro posterior (el cálculo vive en venta.model).
  const handleGenerarReporteCobrosGanancia = async () => {
    if (!fechaDesdeCobros || !fechaHastaCobros) {
      setError("Debes seleccionar ambas fechas");
      return;
    }
    if (new Date(fechaDesdeCobros) > new Date(fechaHastaCobros)) {
      setError("La fecha desde no puede ser mayor que la fecha hasta");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await getReporteCobrosGanancia({
        fechaDesde: fechaDesdeCobros,
        fechaHasta: fechaHastaCobros,
      });

      const { jsPDF, autoTable } = await loadPdf();
      const doc = new jsPDF();
      let y = 18;
      doc.setFontSize(18);
      doc.text("Cobros y ganancia por día", 14, y);
      y += 8;
      doc.setFontSize(11);
      doc.text(
        `Período: ${formatearFecha(fechaDesdeCobros)} al ${formatearFecha(fechaHastaCobros)}`,
        14,
        y,
      );
      y += 6;
      doc.setFontSize(9);
      doc.setTextColor(100);
      doc.text(
        "La ganancia se atribuye al día en que se recibe el dinero: las ventas a crédito la",
        14,
        y,
      );
      y += 4;
      doc.text(
        "realizan proporcionalmente con la seña y con cada cobro posterior.",
        14,
        y,
      );
      doc.setTextColor(0);
      y += 8;

      const getFinalY = () =>
        (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable
          .finalY;
      const nombreCliente = (n?: string | null, a?: string | null) =>
        [n, a].filter(Boolean).join(" ").trim() || "-";

      if (!data.dias.length) {
        doc.setFontSize(12);
        doc.text("No hubo ventas ni cobros en el período seleccionado.", 14, y + 4);
      }

      for (const dia of data.dias) {
        if (y > doc.internal.pageSize.getHeight() - 60) {
          doc.addPage();
          y = 18;
        }
        doc.setFontSize(13);
        doc.text(`Día ${formatearFecha(dia.fecha)}`, 14, y);
        y += 5;

        if (dia.ventas.length) {
          autoTable(doc, {
            head: [["N°", "CLIENTE", "TIPO", "TOTAL", "COBRADO", "GANANCIA"]],
            body: dia.ventas.map((v) => [
              v.VentaId.toString(),
              nombreCliente(v.ClienteNombre, v.ClienteApellido),
              `${formaPagoVentaTipo(v.VentaTipo)}${
                v.EsEnvio === "S"
                  ? " (envío)"
                  : v.EsDelivery === "S"
                    ? " (delivery)"
                    : ""
              }`,
              formatMiles(v.Total),
              formatMiles(v.Recibido),
              formatMiles(v.GananciaDia),
            ]),
            startY: y,
            theme: "grid",
            headStyles: { fillColor: [37, 99, 235] },
            styles: { fontSize: 8 },
            margin: { left: 14, right: 14 },
            columnStyles: {
              0: { cellWidth: 14 },
              3: { cellWidth: 26, halign: "right" },
              4: { cellWidth: 26, halign: "right" },
              5: { cellWidth: 26, halign: "right" },
            },
          });
          y = getFinalY() + 4;
        } else {
          doc.setFontSize(9);
          doc.text("Sin ventas este día.", 14, y + 2);
          y += 8;
        }

        if (dia.cobros.length) {
          if (y > doc.internal.pageSize.getHeight() - 50) {
            doc.addPage();
            y = 18;
          }
          doc.setFontSize(10);
          doc.text("Créditos anteriores cobrados:", 14, y + 1);
          autoTable(doc, {
            head: [["VENTA N°", "F. VENTA", "CLIENTE", "COBRADO", "GANANCIA"]],
            body: dia.cobros.map((cRow) => [
              cRow.VentaId.toString(),
              formatearFecha(String(cRow.VentaFecha).slice(0, 10)),
              nombreCliente(cRow.ClienteNombre, cRow.ClienteApellido),
              formatMiles(cRow.Monto),
              formatMiles(cRow.GananciaDia),
            ]),
            startY: y + 3,
            theme: "grid",
            headStyles: { fillColor: [22, 163, 74] },
            styles: { fontSize: 8 },
            margin: { left: 14, right: 14 },
            columnStyles: {
              0: { cellWidth: 20 },
              1: { cellWidth: 24 },
              3: { cellWidth: 26, halign: "right" },
              4: { cellWidth: 26, halign: "right" },
            },
          });
          y = getFinalY() + 4;
        }

        doc.setFontSize(10);
        doc.text(
          `Recibido del día: Gs. ${formatMiles(dia.totales.recibido)}   |   Ganancia del día: Gs. ${formatMiles(dia.totales.ganancia)}`,
          14,
          y + 2,
        );
        y += 7;
        if (dia.totales.aCredito > 0) {
          doc.setFontSize(9);
          doc.setTextColor(100);
          doc.text(
            `Quedó a crédito: Gs. ${formatMiles(dia.totales.aCredito)} (ganancia a realizar al cobrar: Gs. ${formatMiles(dia.totales.gananciaDiferida)})`,
            14,
            y + 1,
          );
          doc.setTextColor(0);
          y += 7;
        }
        y += 4;
      }

      if (data.dias.length) {
        if (y > doc.internal.pageSize.getHeight() - 45) {
          doc.addPage();
          y = 18;
        }
        doc.setDrawColor(200);
        doc.line(14, y, doc.internal.pageSize.getWidth() - 14, y);
        y += 7;
        doc.setFontSize(12);
        doc.text("TOTALES GENERALES", 14, y);
        y += 7;
        doc.setFontSize(10);
        doc.text(
          `Recibido por ventas del día: Gs. ${formatMiles(data.totales.recibidoVentas)}  (ganancia: Gs. ${formatMiles(data.totales.gananciaVentas)})`,
          14,
          y,
        );
        y += 6;
        doc.text(
          `Cobros de créditos anteriores: Gs. ${formatMiles(data.totales.cobrado)}  (ganancia: Gs. ${formatMiles(data.totales.gananciaCobros)})`,
          14,
          y,
        );
        y += 7;
        doc.setFontSize(11);
        doc.text(
          `TOTAL recibido: Gs. ${formatMiles(data.totales.recibido)}   |   GANANCIA total: Gs. ${formatMiles(data.totales.ganancia)}`,
          14,
          y,
        );
        y += 7;
        if (data.totales.aCredito > 0) {
          doc.setFontSize(9);
          doc.setTextColor(100);
          doc.text(
            `Vendido a crédito sin cobrar en el período: Gs. ${formatMiles(data.totales.aCredito)} (ganancia a realizar: Gs. ${formatMiles(data.totales.gananciaDiferida)})`,
            14,
            y,
          );
          doc.setTextColor(0);
        }
      }

      doc.save(
        `reporte_cobros_ganancia_${fechaDesdeCobros}_${fechaHastaCobros}.pdf`,
      );
      const blob = doc.output("blob");
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      setReporteActivo(null);
    } catch (err) {
      const error = err as { message?: string };
      setError(
        error.message || "Error al generar el reporte de cobros y ganancia",
      );
    } finally {
      setLoading(false);
    }
  };

  // Metadata de las tarjetas (para grid + abrir modal)
  const renderCard = (
    titulo: string,
    descripcion: string,
    icono: string,
    accent: string,
    onClick: () => void,
  ) => (
    <button
      onClick={onClick}
      disabled={loading}
      className={`text-left bg-white p-4 rounded-lg shadow-sm border border-slate-200 hover:${accent} hover:shadow-md transition group disabled:opacity-50 disabled:cursor-not-allowed`}
    >
      <div className="flex items-start gap-3">
        <div className="text-2xl leading-none mt-0.5">{icono}</div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-slate-900 text-sm leading-snug">
            {titulo}
          </h3>
          <p className="text-xs text-slate-500 mt-1 line-clamp-2">
            {descripcion}
          </p>
        </div>
      </div>
    </button>
  );

  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Reportes</h1>
        <p className="text-sm text-slate-500 mt-1">
          Elegí un reporte para generarlo en PDF.
        </p>
      </div>

      {error && (
        <div className="text-red-700 bg-red-50 border border-red-200 p-3 rounded-md mb-4 text-sm">
          {error}
        </div>
      )}

      <div className="space-y-8">
        {/* === Sección Ventas y Stock === */}
        <section>
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Ventas y stock
            </h2>
            <span className="text-xs text-slate-400">5 reportes</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {renderCard(
              "Stock valorizado",
              "Productos con stock + capital inmovilizado a precio de costo. Desglose por almacén.",
              "📦",
              "border-teal-300",
              () => {
                setError(null);
                handleGenerarReporteStock();
              },
            )}
            {renderCard(
              "Créditos pendientes",
              "Lista de saldos a cobrar por cliente con totales por venta.",
              "💳",
              "border-green-300",
              () => {
                setError(null);
                handleGenerarPDF();
              },
            )}
            {renderCard(
              "Ventas por cliente",
              "Detalle de ventas por cliente (o todos), con pagos de crédito y totales por tipo.",
              "🧾",
              "border-blue-300",
              () => {
                setError(null);
                setReporteActivo("ventas");
              },
            )}
            {renderCard(
              "Productos vendidos y comprados",
              "Por período: cantidades, monto facturado, costo, ganancia y margen %.",
              "🔁",
              "border-blue-300",
              () => {
                setError(null);
                setReporteActivo("movimientos");
              },
            )}
            {renderCard(
              "Productos más vendidos",
              "Ranking de productos por cantidad vendida con precio venta, costo y stock actual.",
              "🏆",
              "border-indigo-300",
              () => {
                setError(null);
                setReporteActivo("masvendidos");
              },
            )}
          </div>
        </section>

        {/* === Sección Caja y cobranzas === */}
        <section>
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Caja y cobranzas
            </h2>
            <span className="text-xs text-slate-400">1 reporte</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {renderCard(
              "Cobros y ganancia por día",
              "Dinero recibido cada día (ventas + cobros de créditos anteriores) con la ganancia realizada en la fecha de cobro.",
              "💰",
              "border-emerald-300",
              () => {
                setError(null);
                setReporteActivo("cobrosganancia");
              },
            )}
          </div>
        </section>

        {/* === Sección Envíos (solo mayorista) === */}
        {esMayorista && (
          <section>
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Envíos
              </h2>
              <span className="text-xs text-slate-400">1 reporte</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {renderCard(
                "Ventas por envío (por móvil)",
                "Envíos del período separados por vehículo, con detalle de ventas y subtotales por método de pago.",
                "🚚",
                "border-orange-300",
                () => {
                  setError(null);
                  setReporteActivo("enviosvehiculo");
                },
              )}
            </div>
          </section>
        )}

        {/* === Sección Vendedores (solo mayorista) === */}
        {esMayorista && (
          <section>
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Vendedores
              </h2>
              <span className="text-xs text-slate-400">1 reporte</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {renderCard(
                "Ventas por vendedor (comisiones)",
                "Total vendido por vendedor en el período y la comisión a pagar según el % que ingreses.",
                "👤",
                "border-blue-300",
                () => {
                  setError(null);
                  setReporteActivo("ventasvendedor");
                },
              )}
            </div>
          </section>
        )}

        {/* === Sección Ventas por tipo (solo mayorista) === */}
        {esMayorista && (
          <section>
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Ventas por tipo
              </h2>
              <span className="text-xs text-slate-400">1 reporte</span>
            </div>
            <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
              <div className="flex items-start gap-3 mb-4">
                <div className="text-2xl leading-none">🗂️</div>
                <div className="flex-1">
                  <h3 className="font-semibold text-slate-900 text-sm">
                    Ventas por tipo de venta
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Ventas del período agrupadas por tipo: envío, contado,
                    crédito, POS y transferencia (separando las transferencias
                    de envíos). Cada grupo con su detalle y total.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-end gap-3 mb-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Desde
                  </label>
                  <input
                    type="date"
                    value={fechaDesdeTipoV}
                    onChange={(e) => setFechaDesdeTipoV(e.target.value)}
                    className="px-3 py-1.5 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    disabled={loading}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Hasta
                  </label>
                  <input
                    type="date"
                    value={fechaHastaTipoV}
                    onChange={(e) => setFechaHastaTipoV(e.target.value)}
                    className="px-3 py-1.5 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    disabled={loading}
                  />
                </div>
                <button
                  className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold py-1.5 px-4 rounded-md shadow-sm transition disabled:opacity-50"
                  onClick={generarVentasPorTipo}
                  disabled={loading}
                >
                  {loading ? "Cargando…" : "Generar"}
                </button>
                {ventasPorTipo && ventasPorTipo.grupos.length > 0 && (
                  <button
                    className="bg-slate-700 hover:bg-slate-800 text-white text-sm font-semibold py-1.5 px-4 rounded-md shadow-sm transition"
                    onClick={exportarVentasPorTipoPDF}
                  >
                    Exportar PDF
                  </button>
                )}
              </div>

              {ventasPorTipo && ventasPorTipo.grupos.length === 0 && (
                <p className="text-sm text-slate-500">
                  No hay ventas en el período seleccionado.
                </p>
              )}

              {ventasPorTipo &&
                ventasPorTipo.grupos.map((grupo) => (
                  <React.Fragment key={grupo.tipo}>
                    <h4 className="font-semibold text-blue-700 text-sm mb-2">
                      {labelTipoVenta(grupo.tipo)} ({grupo.cantidad})
                    </h4>
                    <div className="overflow-x-auto max-h-96 overflow-y-auto -mx-2 mb-4 border border-slate-200 rounded-md">
                      <table className="w-full border-collapse text-sm min-w-[700px]">
                        <thead className="sticky top-0 bg-blue-50 z-10">
                          <tr className="border-b border-slate-300">
                            <th className="text-left py-2 px-2 font-semibold text-slate-800 whitespace-nowrap">
                              Fecha
                            </th>
                            <th className="text-left py-2 px-2 font-semibold text-slate-800 whitespace-nowrap">
                              N° venta
                            </th>
                            <th className="text-left py-2 px-2 font-semibold text-slate-800 whitespace-nowrap">
                              Cliente
                            </th>
                            <th className="text-left py-2 px-2 font-semibold text-slate-800 whitespace-nowrap">
                              Forma pago
                            </th>
                            <th className="text-right py-2 px-2 font-semibold text-slate-800 whitespace-nowrap">
                              Total
                            </th>
                            <th className="text-right py-2 px-2 font-semibold text-slate-800 whitespace-nowrap">
                              Pendiente
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {grupo.ventas.map((v) => (
                            <tr
                              key={v.VentaId}
                              className="border-b border-slate-200 hover:bg-slate-50"
                            >
                              <td className="py-1.5 px-2 whitespace-nowrap text-slate-700">
                                {formatFechaHoraLocal(v.VentaFecha)}
                              </td>
                              <td className="py-1.5 px-2 whitespace-nowrap text-slate-700">
                                {v.VentaId}
                              </td>
                              <td className="py-1.5 px-2 text-slate-700">
                                {[v.ClienteNombre, v.ClienteApellido]
                                  .filter(Boolean)
                                  .join(" ") || "-"}
                              </td>
                              <td className="py-1.5 px-2 whitespace-nowrap text-slate-700">
                                {labelTipoVenta(v.VentaTipo)}
                              </td>
                              <td className="py-1.5 px-2 text-right font-mono text-slate-700">
                                {formatMiles(v.Total)}
                              </td>
                              <td className="py-1.5 px-2 text-right font-mono text-slate-700">
                                {v.Pendiente > 0
                                  ? formatMiles(v.Pendiente)
                                  : "-"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="sticky bottom-0">
                          <tr className="bg-blue-100 font-semibold text-blue-900">
                            <td className="py-2 px-2" colSpan={4}>
                              Total {labelTipoVenta(grupo.tipo)}
                            </td>
                            <td className="py-2 px-2 text-right font-mono">
                              {formatMiles(grupo.totalVendido)}
                            </td>
                            <td className="py-2 px-2 text-right font-mono">
                              {grupo.totalPendiente > 0
                                ? formatMiles(grupo.totalPendiente)
                                : "-"}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </React.Fragment>
                ))}

              {ventasPorTipo && ventasPorTipo.grupos.length > 0 && (
                <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                  <h3 className="font-semibold text-slate-800 mb-3">TOTALES</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 text-sm">
                    {ventasPorTipo.grupos.map((grupo) => (
                      <div key={grupo.tipo}>
                        <span className="text-slate-500">
                          {labelTipoVenta(grupo.tipo)}:
                        </span>{" "}
                        <span className="font-mono font-medium">
                          {formatMiles(grupo.totalVendido)}
                        </span>
                      </div>
                    ))}
                    <div>
                      <span className="text-slate-500">Total general:</span>{" "}
                      <span className="font-mono font-semibold text-slate-900">
                        {formatMiles(ventasPorTipo.totales.totalVendido)}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500">Ventas:</span>{" "}
                      <span className="font-mono font-medium">
                        {ventasPorTipo.totales.cantidad}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500">Pendiente:</span>{" "}
                      <span className="font-mono font-medium">
                        {formatMiles(ventasPorTipo.totales.totalPendiente)}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* === Sección Ventas por producto (todas las empresas) === */}
        <section>
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Ventas por producto
            </h2>
            <span className="text-xs text-slate-400">1 reporte</span>
          </div>
          <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
            <div className="flex items-start gap-3 mb-4">
              <div className="text-2xl leading-none">🔎</div>
              <div className="flex-1">
                <h3 className="font-semibold text-slate-900 text-sm">
                  Ventas de un producto
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Elegí un producto y un período: el reporte muestra en qué
                  ventas salió y a qué cliente se le vendió, con cantidades y
                  totales.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-end gap-3 mb-4">
              <div className="relative w-full sm:w-80">
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Producto
                </label>
                <input
                  type="text"
                  value={productoBusquedaVP}
                  placeholder="Escribí para buscar por nombre o código"
                  onChange={(e) => {
                    setProductoBusquedaVP(e.target.value);
                    setProductoSeleccionadoVP(null);
                    setProductoListaAbiertaVP(true);
                    setProductoHighlightVP(0);
                  }}
                  onFocus={(e) => {
                    e.target.select();
                    setProductoListaAbiertaVP(true);
                    setProductoHighlightVP(0);
                  }}
                  onMouseUp={(e) => e.preventDefault()}
                  onKeyDown={onKeyDownProductoVP}
                  onBlur={() =>
                    setTimeout(() => setProductoListaAbiertaVP(false), 150)
                  }
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={loading}
                />
                {productoListaAbiertaVP && (
                  <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-md border border-slate-200 bg-white shadow-lg text-sm">
                    {productosFiltradosVP.map((p, idx) => {
                      const activo = idx === productoHighlightVP;
                      return (
                        <li
                          key={p.ProductoId}
                          ref={activo ? productoHighlightVPRef : null}
                          onMouseDown={() => seleccionarProductoVP(p)}
                          onMouseEnter={() => setProductoHighlightVP(idx)}
                          className={`px-3 py-2 cursor-pointer ${
                            activo ? "bg-blue-100" : "hover:bg-slate-100"
                          }`}
                        >
                          {etiquetaProducto(p)}
                        </li>
                      );
                    })}
                    {productosFiltradosVP.length === 0 && (
                      <li className="px-3 py-2 text-slate-400">
                        {productosTop.length === 0
                          ? "Cargando productos…"
                          : "Sin resultados"}
                      </li>
                    )}
                  </ul>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Desde
                </label>
                <input
                  type="date"
                  value={fechaDesdeVP}
                  onChange={(e) => setFechaDesdeVP(e.target.value)}
                  className="px-3 py-1.5 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={loading}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Hasta
                </label>
                <input
                  type="date"
                  value={fechaHastaVP}
                  onChange={(e) => setFechaHastaVP(e.target.value)}
                  className="px-3 py-1.5 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={loading}
                />
              </div>
              <button
                className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold py-1.5 px-4 rounded-md shadow-sm transition disabled:opacity-50"
                onClick={generarVentasPorProducto}
                disabled={loading}
              >
                {loading ? "Cargando…" : "Generar"}
              </button>
              {ventasProducto && ventasProducto.ventas.length > 0 && (
                <button
                  className="bg-slate-700 hover:bg-slate-800 text-white text-sm font-semibold py-1.5 px-4 rounded-md shadow-sm transition"
                  onClick={exportarVentasPorProductoPDF}
                >
                  Exportar PDF
                </button>
              )}
            </div>

            {ventasProducto && ventasProducto.ventas.length === 0 && (
              <p className="text-sm text-slate-500">
                No se vendió ese producto en el período seleccionado.
              </p>
            )}

            {ventasProducto && ventasProducto.ventas.length > 0 && (
              <>
                <div className="overflow-x-auto max-h-96 overflow-y-auto -mx-2 mb-4 border border-slate-200 rounded-md">
                  <table className="w-full border-collapse text-sm min-w-[700px]">
                    <thead className="sticky top-0 bg-slate-100 z-10">
                      <tr className="border-b border-slate-300">
                        <th className="text-left py-2 px-2 font-semibold text-slate-800 whitespace-nowrap">
                          Fecha
                        </th>
                        <th className="text-left py-2 px-2 font-semibold text-slate-800 whitespace-nowrap">
                          N° venta
                        </th>
                        <th className="text-left py-2 px-2 font-semibold text-slate-800 whitespace-nowrap">
                          Cliente
                        </th>
                        <th className="text-left py-2 px-2 font-semibold text-slate-800 whitespace-nowrap">
                          Tipo
                        </th>
                        <th className="text-right py-2 px-2 font-semibold text-slate-800 whitespace-nowrap">
                          Cantidad
                        </th>
                        <th className="text-right py-2 px-2 font-semibold text-slate-800 whitespace-nowrap">
                          Precio
                        </th>
                        <th className="text-right py-2 px-2 font-semibold text-slate-800 whitespace-nowrap">
                          Subtotal
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {ventasProducto.ventas.map((v, idx) => (
                        <tr
                          key={`${v.VentaId}-${idx}`}
                          className="border-b border-slate-200 hover:bg-slate-50"
                        >
                          <td className="py-1.5 px-2 whitespace-nowrap text-slate-700">
                            {formatFechaHoraLocal(v.VentaFecha)}
                          </td>
                          <td className="py-1.5 px-2 whitespace-nowrap text-slate-700">
                            {v.VentaId}
                          </td>
                          <td className="py-1.5 px-2 text-slate-700">
                            {[v.ClienteNombre, v.ClienteApellido]
                              .filter(Boolean)
                              .join(" ") || "-"}
                          </td>
                          <td className="py-1.5 px-2 whitespace-nowrap text-slate-700">
                            {labelTipoVenta(v.VentaTipo)}
                            {v.EsEnvio === "S" ? " (envío)" : ""}
                          </td>
                          <td className="py-1.5 px-2 text-right font-mono text-slate-700 whitespace-nowrap">
                            {formatMiles(v.Cantidad)}{" "}
                            {v.Unitario === "U" ? "unid." : "cajas"}
                          </td>
                          <td className="py-1.5 px-2 text-right font-mono text-slate-700">
                            {formatMiles(v.Precio)}
                          </td>
                          <td className="py-1.5 px-2 text-right font-mono text-slate-700">
                            {formatMiles(v.Subtotal)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="sticky bottom-0">
                      <tr className="bg-slate-100 font-semibold text-slate-900">
                        <td className="py-2 px-2" colSpan={4}>
                          Total
                        </td>
                        <td className="py-2 px-2 text-right font-mono whitespace-nowrap">
                          {formatMiles(ventasProducto.totales.totalCajas)} cajas
                          / {formatMiles(ventasProducto.totales.totalUnidades)}{" "}
                          unid.
                        </td>
                        <td className="py-2 px-2" />
                        <td className="py-2 px-2 text-right font-mono">
                          {formatMiles(ventasProducto.totales.totalMonto)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                  <h3 className="font-semibold text-slate-800 mb-3">TOTALES</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                    <div>
                      <span className="text-slate-500">Ventas:</span>{" "}
                      <span className="font-mono font-medium">
                        {ventasProducto.totales.cantidadVentas}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500">Cajas:</span>{" "}
                      <span className="font-mono font-medium">
                        {formatMiles(ventasProducto.totales.totalCajas)}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500">Unidades:</span>{" "}
                      <span className="font-mono font-medium">
                        {formatMiles(ventasProducto.totales.totalUnidades)}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500">Total vendido:</span>{" "}
                      <span className="font-mono font-semibold text-slate-900">
                        {formatMiles(ventasProducto.totales.totalMonto)}
                      </span>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </section>

        {/* === Sección Caja === */}
        <section>
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Caja
            </h2>
            <span className="text-xs text-slate-400">2 reportes</span>
          </div>
          <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
            <div className="flex items-start gap-3 mb-4">
              <div className="text-2xl leading-none">💼</div>
              <div className="flex-1">
                <h3 className="font-semibold text-slate-900 text-sm">
                  Cierre de caja por rango
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Apertura, ingresos por método, egresos y diferencia de cada cierre del período.
                </p>
              </div>
            </div>
          <div className="flex flex-wrap items-end gap-3 mb-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Desde
              </label>
              <input
                type="date"
                value={fechaDesdeCierre}
                onChange={(e) => setFechaDesdeCierre(e.target.value)}
                className="px-3 py-1.5 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={loading}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Hasta
              </label>
              <input
                type="date"
                value={fechaHastaCierre}
                onChange={(e) => setFechaHastaCierre(e.target.value)}
                className="px-3 py-1.5 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={loading}
              />
            </div>
            <button
              className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold py-1.5 px-4 rounded-md shadow-sm transition disabled:opacity-50"
              onClick={generarReporteCierre}
              disabled={loading}
            >
              {loading ? "Cargando…" : "Generar"}
            </button>
            {resumenesCierre.length > 0 && (
              <button
                className="bg-slate-700 hover:bg-slate-800 text-white text-sm font-semibold py-1.5 px-4 rounded-md shadow-sm transition"
                onClick={exportarCierrePDF}
              >
                Exportar PDF
              </button>
            )}
          </div>

          {resumenesCierre.length > 0 && (
            <>
              <p className="text-xs text-slate-500 mb-2">
                {resumenesCierre.length} cierre(s) en el período. Página{" "}
                {paginaCierre} de {totalPaginasCierre}.
              </p>
              <div className="overflow-x-auto -mx-2 mb-4">
                <table className="w-full border-collapse text-sm min-w-[900px]">
                  <thead className="sticky top-0 bg-slate-100 z-10">
                    <tr className="border-b border-slate-300">
                      <th className="text-left py-2 px-2 font-semibold text-slate-800 whitespace-nowrap">
                        Fecha cierre
                      </th>
                      <th className="text-left py-2 px-2 font-semibold text-slate-800 whitespace-nowrap">
                        Caja
                      </th>
                      <th className="text-left py-2 px-2 font-semibold text-slate-800 whitespace-nowrap">
                        Usuario
                      </th>
                      <th className="text-right py-2 px-2 font-semibold text-slate-800 whitespace-nowrap">
                        Apertura
                      </th>
                      <th className="text-right py-2 px-2 font-semibold text-slate-800 whitespace-nowrap">
                        Cierre
                      </th>
                      <th className="text-right py-2 px-2 font-semibold text-slate-800 whitespace-nowrap">
                        Egresos
                      </th>
                      <th className="text-right py-2 px-2 font-semibold text-slate-800 whitespace-nowrap">
                        Ing. Efectivo
                      </th>
                      <th className="text-right py-2 px-2 font-semibold text-slate-800 whitespace-nowrap">
                        POS
                      </th>
                      <th className="text-right py-2 px-2 font-semibold text-slate-800 whitespace-nowrap">
                        Voucher
                      </th>
                      <th className="text-right py-2 px-2 font-semibold text-slate-800 whitespace-nowrap">
                        Transfer
                      </th>
                      <th className="text-right py-2 px-2 font-semibold text-slate-800 whitespace-nowrap">
                        Total ing.
                      </th>
                      <th className="text-right py-2 px-2 font-semibold text-slate-800 whitespace-nowrap">
                        Diferencia
                      </th>
                      <th className="text-right py-2 px-2 font-semibold text-slate-800 whitespace-nowrap">
                        Sobrante/Faltante
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {resumenesPaginados.map((r, idx) => (
                      <tr
                        key={`${r.fechaCierre}-${r.cajaId}-${r.usuarioId}-${idx}`}
                        className="border-b border-slate-200 hover:bg-slate-50"
                      >
                        <td className="py-1.5 px-2 whitespace-nowrap text-slate-700">
                          {r.fechaCierre}
                        </td>
                        <td className="py-1.5 px-2 whitespace-nowrap text-slate-700">
                          {r.cajaDescripcion}
                        </td>
                        <td className="py-1.5 px-2 whitespace-nowrap text-slate-700">
                          {r.usuarioId}
                        </td>
                        <td className="py-1.5 px-2 text-right font-mono text-slate-700">
                          {formatMiles(r.apertura)}
                        </td>
                        <td className="py-1.5 px-2 text-right font-mono text-slate-700">
                          {formatMiles(r.cierre)}
                        </td>
                        <td className="py-1.5 px-2 text-right font-mono text-slate-700">
                          {formatMiles(r.egresos)}
                        </td>
                        <td className="py-1.5 px-2 text-right font-mono text-slate-700">
                          {formatMiles(r.ingresos)}
                        </td>
                        <td className="py-1.5 px-2 text-right font-mono text-slate-700">
                          {formatMiles(r.ingresosPOS)}
                        </td>
                        <td className="py-1.5 px-2 text-right font-mono text-slate-700">
                          {formatMiles(r.ingresosVoucher)}
                        </td>
                        <td className="py-1.5 px-2 text-right font-mono text-slate-700">
                          {formatMiles(r.ingresosTransfer)}
                        </td>
                        <td className="py-1.5 px-2 text-right font-mono text-slate-700">
                          {formatMiles(r.totalIngresos)}
                        </td>
                        <td className="py-1.5 px-2 text-right font-mono text-slate-700">
                          {formatMiles(r.diferencia)}
                        </td>
                        <td className="py-1.5 px-2 text-right font-mono text-slate-700">
                          {r.sobranteFaltante > 0
                            ? `Falt. ${formatMiles(r.sobranteFaltante)}`
                            : r.sobranteFaltante < 0
                              ? `Sobr. ${formatMiles(-r.sobranteFaltante)}`
                              : "0"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {totalPaginasCierre > 1 && (
                <div className="flex items-center justify-between mb-4">
                  <button
                    className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium disabled:opacity-50"
                    onClick={() => setPaginaCierre((p) => Math.max(1, p - 1))}
                    disabled={paginaCierre <= 1}
                  >
                    Anterior
                  </button>
                  <span className="text-sm text-slate-600">
                    Página {paginaCierre} de {totalPaginasCierre}
                  </span>
                  <button
                    className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium disabled:opacity-50"
                    onClick={() =>
                      setPaginaCierre((p) =>
                        Math.min(totalPaginasCierre, p + 1),
                      )
                    }
                    disabled={paginaCierre >= totalPaginasCierre}
                  >
                    Siguiente
                  </button>
                </div>
              )}
              <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                <h3 className="font-semibold text-slate-800 mb-1">TOTALES</h3>
                <p className="text-slate-500 text-xs mb-3">
                  Suma de todos los registros del período
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 text-sm">
                  <div>
                    <span className="text-slate-500">Ingresos efectivo:</span>{" "}
                    <span className="font-mono font-medium">
                      {formatMiles(totalesGeneralesCierre.ingresos)}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500">POS:</span>{" "}
                    <span className="font-mono font-medium">
                      {formatMiles(totalesGeneralesCierre.ingresosPOS)}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500">Voucher:</span>{" "}
                    <span className="font-mono font-medium">
                      {formatMiles(totalesGeneralesCierre.ingresosVoucher)}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500">Transfer:</span>{" "}
                    <span className="font-mono font-medium">
                      {formatMiles(totalesGeneralesCierre.ingresosTransfer)}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500">Total ingresos:</span>{" "}
                    <span className="font-mono font-medium">
                      {formatMiles(totalesGeneralesCierre.totalIngresos)}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500">Total egresos:</span>{" "}
                    <span className="font-mono font-medium">
                      {formatMiles(totalesGeneralesCierre.egresos)}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500">Diferencia:</span>{" "}
                    <span className="font-mono font-medium">
                      {formatMiles(totalesGeneralesCierre.diferencia)}
                    </span>
                  </div>
                </div>
              </div>
            </>
          )}
          </div>

          {/* --- Resumen de ingresos y egresos --- */}
          <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200 mt-4">
            <div className="flex items-start gap-3 mb-4">
              <div className="text-2xl leading-none">📊</div>
              <div className="flex-1">
                <h3 className="font-semibold text-slate-900 text-sm">
                  Resumen de ingresos y egresos
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Detalle de cada ingreso y cada egreso del período, agrupados y
                  con su total. Excluye aperturas y cierres de caja.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-end gap-3 mb-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Desde
                </label>
                <input
                  type="date"
                  value={fechaDesdeIE}
                  onChange={(e) => setFechaDesdeIE(e.target.value)}
                  className="px-3 py-1.5 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={loading}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Hasta
                </label>
                <input
                  type="date"
                  value={fechaHastaIE}
                  onChange={(e) => setFechaHastaIE(e.target.value)}
                  className="px-3 py-1.5 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={loading}
                />
              </div>
              <button
                className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold py-1.5 px-4 rounded-md shadow-sm transition disabled:opacity-50"
                onClick={generarResumenIngresosEgresos}
                disabled={loading}
              >
                {loading ? "Cargando…" : "Generar"}
              </button>
              {registrosIE.length > 0 && (
                <button
                  className="bg-slate-700 hover:bg-slate-800 text-white text-sm font-semibold py-1.5 px-4 rounded-md shadow-sm transition"
                  onClick={exportarResumenIngresosEgresosPDF}
                >
                  Exportar PDF
                </button>
              )}
            </div>

            {resumenIEGenerado && registrosIE.length === 0 && (
              <p className="text-sm text-slate-500">
                No hay ingresos ni egresos en el período seleccionado.
              </p>
            )}

            {registrosIE.length > 0 && (
              <>
                {/* Grupo INGRESOS */}
                <h4 className="font-semibold text-green-700 text-sm mb-2">
                  Ingresos ({ingresosIE.length})
                </h4>
                <div className="overflow-x-auto max-h-96 overflow-y-auto -mx-2 mb-4 border border-slate-200 rounded-md">
                  <table className="w-full border-collapse text-sm min-w-[700px]">
                    <thead className="sticky top-0 bg-green-50 z-10">
                      <tr className="border-b border-slate-300">
                        <th className="text-left py-2 px-2 font-semibold text-slate-800 whitespace-nowrap">
                          Fecha
                        </th>
                        <th className="text-left py-2 px-2 font-semibold text-slate-800 whitespace-nowrap">
                          Concepto
                        </th>
                        <th className="text-left py-2 px-2 font-semibold text-slate-800 whitespace-nowrap">
                          Detalle
                        </th>
                        <th className="text-left py-2 px-2 font-semibold text-slate-800 whitespace-nowrap">
                          Caja
                        </th>
                        <th className="text-left py-2 px-2 font-semibold text-slate-800 whitespace-nowrap">
                          Usuario
                        </th>
                        <th className="text-right py-2 px-2 font-semibold text-slate-800 whitespace-nowrap">
                          Monto
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {ingresosIE.map((r) => (
                        <tr
                          key={r.RegistroDiarioCajaId}
                          className="border-b border-slate-200 hover:bg-slate-50"
                        >
                          <td className="py-1.5 px-2 whitespace-nowrap text-slate-700">
                            {formatFechaHoraLocal(r.RegistroDiarioCajaFecha)}
                          </td>
                          <td className="py-1.5 px-2 whitespace-nowrap text-slate-700">
                            {r.TipoGastoGrupoDescripcion ??
                              `Grupo ${r.TipoGastoGrupoId}`}
                          </td>
                          <td className="py-1.5 px-2 text-slate-700">
                            {r.RegistroDiarioCajaDetalle ?? ""}
                          </td>
                          <td className="py-1.5 px-2 whitespace-nowrap text-slate-700">
                            {r.CajaDescripcion ?? r.CajaId}
                          </td>
                          <td className="py-1.5 px-2 whitespace-nowrap text-slate-700">
                            {r.UsuarioId}
                          </td>
                          <td className="py-1.5 px-2 text-right font-mono text-slate-700">
                            {formatMiles(r.RegistroDiarioCajaMonto)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="sticky bottom-0">
                      <tr className="bg-green-100 font-semibold text-green-900">
                        <td className="py-2 px-2" colSpan={5}>
                          Total ingresos
                        </td>
                        <td className="py-2 px-2 text-right font-mono">
                          {formatMiles(totalIngresosIE)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Grupo EGRESOS */}
                <h4 className="font-semibold text-red-700 text-sm mb-2">
                  Egresos ({egresosIE.length})
                </h4>
                <div className="overflow-x-auto max-h-96 overflow-y-auto -mx-2 mb-4 border border-slate-200 rounded-md">
                  <table className="w-full border-collapse text-sm min-w-[700px]">
                    <thead className="sticky top-0 bg-red-50 z-10">
                      <tr className="border-b border-slate-300">
                        <th className="text-left py-2 px-2 font-semibold text-slate-800 whitespace-nowrap">
                          Fecha
                        </th>
                        <th className="text-left py-2 px-2 font-semibold text-slate-800 whitespace-nowrap">
                          Concepto
                        </th>
                        <th className="text-left py-2 px-2 font-semibold text-slate-800 whitespace-nowrap">
                          Detalle
                        </th>
                        <th className="text-left py-2 px-2 font-semibold text-slate-800 whitespace-nowrap">
                          Caja
                        </th>
                        <th className="text-left py-2 px-2 font-semibold text-slate-800 whitespace-nowrap">
                          Usuario
                        </th>
                        <th className="text-right py-2 px-2 font-semibold text-slate-800 whitespace-nowrap">
                          Monto
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {egresosIE.map((r) => (
                        <tr
                          key={r.RegistroDiarioCajaId}
                          className="border-b border-slate-200 hover:bg-slate-50"
                        >
                          <td className="py-1.5 px-2 whitespace-nowrap text-slate-700">
                            {formatFechaHoraLocal(r.RegistroDiarioCajaFecha)}
                          </td>
                          <td className="py-1.5 px-2 whitespace-nowrap text-slate-700">
                            {r.TipoGastoGrupoDescripcion ??
                              `Grupo ${r.TipoGastoGrupoId}`}
                          </td>
                          <td className="py-1.5 px-2 text-slate-700">
                            {r.RegistroDiarioCajaDetalle ?? ""}
                          </td>
                          <td className="py-1.5 px-2 whitespace-nowrap text-slate-700">
                            {r.CajaDescripcion ?? r.CajaId}
                          </td>
                          <td className="py-1.5 px-2 whitespace-nowrap text-slate-700">
                            {r.UsuarioId}
                          </td>
                          <td className="py-1.5 px-2 text-right font-mono text-slate-700">
                            {formatMiles(r.RegistroDiarioCajaMonto)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="sticky bottom-0">
                      <tr className="bg-red-100 font-semibold text-red-900">
                        <td className="py-2 px-2" colSpan={5}>
                          Total egresos
                        </td>
                        <td className="py-2 px-2 text-right font-mono">
                          {formatMiles(totalEgresosIE)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Totales generales */}
                <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                  <h3 className="font-semibold text-slate-800 mb-3">TOTALES</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                    <div>
                      <span className="text-slate-500">Total ingresos:</span>{" "}
                      <span className="font-mono font-medium text-green-700">
                        {formatMiles(totalIngresosIE)}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500">Total egresos:</span>{" "}
                      <span className="font-mono font-medium text-red-700">
                        {formatMiles(totalEgresosIE)}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500">Diferencia:</span>{" "}
                      <span
                        className={`font-mono font-medium ${
                          totalIngresosIE - totalEgresosIE < 0
                            ? "text-red-700"
                            : "text-slate-800"
                        }`}
                      >
                        {formatMiles(totalIngresosIE - totalEgresosIE)}
                      </span>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </section>
      </div>

      {/* Loading overlay durante generación */}
      {loading && (
        <div className="fixed top-4 right-4 bg-slate-900 text-white text-sm font-medium px-4 py-2 rounded-md shadow-lg z-50">
          Generando reporte…
        </div>
      )}

      {/* Modal de configuración de reportes */}
      {reporteActivo && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-40 p-4"
          onClick={() => !loading && setReporteActivo(null)}
        >
          <div
            className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-lg font-semibold text-slate-900">
                {reporteActivo === "ventas" && "Ventas por cliente"}
                {reporteActivo === "movimientos" && "Productos vendidos y comprados"}
                {reporteActivo === "masvendidos" && "Productos más vendidos"}
                {reporteActivo === "enviosvehiculo" && "Ventas por envío (por móvil)"}
                {reporteActivo === "ventasvendedor" && "Ventas por vendedor (comisiones)"}
                {reporteActivo === "cobrosganancia" && "Cobros y ganancia por día"}
              </h3>
              <button
                onClick={() => setReporteActivo(null)}
                className="text-slate-400 hover:text-slate-700 text-2xl leading-none p-0 w-8 h-8 flex items-center justify-center rounded hover:bg-slate-100"
                aria-label="Cerrar"
              >
                ×
              </button>
            </div>

            {reporteActivo === "ventas" && (
              <div className="space-y-4">
                <div className="relative">
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Cliente
                  </label>
                  <input
                    type="text"
                    value={clienteBusqueda}
                    placeholder="Escribí para buscar, o TODOS"
                    onChange={(e) => {
                      setClienteBusqueda(e.target.value);
                      setClienteListaAbierta(true);
                      setClienteHighlight(0);
                    }}
                    onFocus={(e) => {
                      e.target.select();
                      setClienteListaAbierta(true);
                      setClienteHighlight(0);
                    }}
                    onMouseUp={(e) => e.preventDefault()}
                    onKeyDown={onKeyDownCliente}
                    onBlur={() =>
                      setTimeout(() => setClienteListaAbierta(false), 150)
                    }
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-md text-sm"
                    disabled={loading}
                  />
                  {clienteListaAbierta && (
                    <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-md border border-slate-200 bg-white shadow-lg text-sm">
                      {opcionesCliente.map((op, idx) => {
                        const activo = idx === clienteHighlight;
                        return (
                          <li
                            key={op.id}
                            ref={activo ? clienteHighlightRef : null}
                            onMouseDown={() => seleccionarCliente(op.id, op.label)}
                            onMouseEnter={() => setClienteHighlight(idx)}
                            className={`px-3 py-2 cursor-pointer ${
                              op.id === "TODOS" ? "font-medium" : ""
                            } ${activo ? "bg-blue-100" : "hover:bg-slate-100"}`}
                          >
                            {op.label}
                          </li>
                        );
                      })}
                      {opcionesCliente.length === 1 &&
                        clienteBusqueda.trim() &&
                        clienteBusqueda.trim().toLowerCase() !== "todos" && (
                          <li className="px-3 py-2 text-slate-400">
                            Sin resultados
                          </li>
                        )}
                    </ul>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Desde
                    </label>
                    <input
                      type="date"
                      value={fechaDesde}
                      onChange={(e) => setFechaDesde(e.target.value)}
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-md text-sm"
                      disabled={loading}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Hasta
                    </label>
                    <input
                      type="date"
                      value={fechaHasta}
                      onChange={(e) => setFechaHasta(e.target.value)}
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-md text-sm"
                      disabled={loading}
                    />
                  </div>
                </div>
                {!esMayorista && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Modalidad
                    </label>
                    <select
                      value={modalidadVentas}
                      onChange={(e) =>
                        setModalidadVentas(e.target.value as "" | "N" | "S")
                      }
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-md text-sm"
                      disabled={loading}
                    >
                      <option value="">Todas</option>
                      <option value="N">Ventana (mostrador)</option>
                      <option value="S">Delivery</option>
                    </select>
                  </div>
                )}
                <button
                  onClick={handleGenerarReporteVentas}
                  disabled={loading}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 rounded-md shadow-sm transition disabled:opacity-50"
                >
                  {loading ? "Generando…" : "Generar PDF"}
                </button>
              </div>
            )}

            {reporteActivo === "movimientos" && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Desde
                    </label>
                    <input
                      type="date"
                      value={fechaDesdeMov}
                      onChange={(e) => setFechaDesdeMov(e.target.value)}
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-md text-sm"
                      disabled={loading}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Hasta
                    </label>
                    <input
                      type="date"
                      value={fechaHastaMov}
                      onChange={(e) => setFechaHastaMov(e.target.value)}
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-md text-sm"
                      disabled={loading}
                    />
                  </div>
                </div>
                <button
                  onClick={handleGenerarReporteMovimientos}
                  disabled={loading}
                  className="w-full bg-blue-700 hover:bg-blue-800 text-white font-semibold py-2 rounded-md shadow-sm transition disabled:opacity-50"
                >
                  {loading ? "Generando…" : "Generar PDF"}
                </button>
              </div>
            )}

            {reporteActivo === "cobrosganancia" && (
              <div className="space-y-4">
                <p className="text-xs text-slate-500">
                  Muestra por día lo recibido por ventas y por cobros de
                  créditos anteriores, con la ganancia realizada en la fecha de
                  cobro (las ventas a crédito realizan su ganancia a medida que
                  se cobran).
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Desde
                    </label>
                    <input
                      type="date"
                      value={fechaDesdeCobros}
                      onChange={(e) => setFechaDesdeCobros(e.target.value)}
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-md text-sm"
                      disabled={loading}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Hasta
                    </label>
                    <input
                      type="date"
                      value={fechaHastaCobros}
                      onChange={(e) => setFechaHastaCobros(e.target.value)}
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-md text-sm"
                      disabled={loading}
                    />
                  </div>
                </div>
                <button
                  onClick={handleGenerarReporteCobrosGanancia}
                  disabled={loading}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2 rounded-md shadow-sm transition disabled:opacity-50"
                >
                  {loading ? "Generando…" : "Generar PDF"}
                </button>
              </div>
            )}

            {reporteActivo === "masvendidos" && (
              <div className="space-y-4">
                <div className="relative">
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Producto
                  </label>
                  <input
                    type="text"
                    value={productoBusquedaTop}
                    placeholder="Escribí para buscar, o TODOS"
                    onChange={(e) => {
                      setProductoBusquedaTop(e.target.value);
                      setProductoListaAbiertaTop(true);
                      setProductoHighlightTop(0);
                    }}
                    onFocus={(e) => {
                      e.target.select();
                      setProductoListaAbiertaTop(true);
                      setProductoHighlightTop(0);
                    }}
                    onMouseUp={(e) => e.preventDefault()}
                    onKeyDown={onKeyDownProducto}
                    onBlur={() =>
                      setTimeout(() => setProductoListaAbiertaTop(false), 150)
                    }
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-md text-sm"
                    disabled={loading}
                  />
                  {productoListaAbiertaTop && (
                    <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-md border border-slate-200 bg-white shadow-lg text-sm">
                      {opcionesProducto.map((op, idx) => {
                        const activo = idx === productoHighlightTop;
                        return (
                          <li
                            key={op.id}
                            ref={activo ? productoHighlightTopRef : null}
                            onMouseDown={() =>
                              seleccionarProducto(op.id, op.label)
                            }
                            onMouseEnter={() => setProductoHighlightTop(idx)}
                            className={`px-3 py-2 cursor-pointer ${
                              op.id === "TODOS" ? "font-medium" : ""
                            } ${activo ? "bg-blue-100" : "hover:bg-slate-100"}`}
                          >
                            {op.label}
                          </li>
                        );
                      })}
                      {opcionesProducto.length === 1 &&
                        productoBusquedaTop.trim() &&
                        productoBusquedaTop.trim().toLowerCase() !==
                          "todos" && (
                          <li className="px-3 py-2 text-slate-400">
                            Sin resultados
                          </li>
                        )}
                    </ul>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Desde
                    </label>
                    <input
                      type="date"
                      value={fechaDesdeTop}
                      onChange={(e) => setFechaDesdeTop(e.target.value)}
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-md text-sm"
                      disabled={loading}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Hasta
                    </label>
                    <input
                      type="date"
                      value={fechaHastaTop}
                      onChange={(e) => setFechaHastaTop(e.target.value)}
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-md text-sm"
                      disabled={loading}
                    />
                  </div>
                </div>
                <button
                  onClick={handleGenerarReporteMasVendidos}
                  disabled={loading}
                  className="w-full bg-indigo-700 hover:bg-indigo-800 text-white font-semibold py-2 rounded-md shadow-sm transition disabled:opacity-50"
                >
                  {loading ? "Generando…" : "Generar PDF"}
                </button>
              </div>
            )}

            {reporteActivo === "enviosvehiculo" && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Desde
                    </label>
                    <input
                      type="date"
                      value={fechaDesdeEnvio}
                      onChange={(e) => setFechaDesdeEnvio(e.target.value)}
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-md text-sm"
                      disabled={loading}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Hasta
                    </label>
                    <input
                      type="date"
                      value={fechaHastaEnvio}
                      onChange={(e) => setFechaHastaEnvio(e.target.value)}
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-md text-sm"
                      disabled={loading}
                    />
                  </div>
                </div>
                <button
                  onClick={handleGenerarReporteEnviosVehiculo}
                  disabled={loading}
                  className="w-full bg-orange-600 hover:bg-orange-700 text-white font-semibold py-2 rounded-md shadow-sm transition disabled:opacity-50"
                >
                  {loading ? "Generando…" : "Generar PDF"}
                </button>
              </div>
            )}

            {reporteActivo === "ventasvendedor" && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Desde
                    </label>
                    <input
                      type="date"
                      value={fechaDesdeVend}
                      onChange={(e) => setFechaDesdeVend(e.target.value)}
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-md text-sm"
                      disabled={loading}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Hasta
                    </label>
                    <input
                      type="date"
                      value={fechaHastaVend}
                      onChange={(e) => setFechaHastaVend(e.target.value)}
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-md text-sm"
                      disabled={loading}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Comisión (%)
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="Ej: 0,2"
                    value={comisionPorcentaje}
                    onChange={(e) =>
                      setComisionPorcentaje(
                        e.target.value.replace(/[^\d.,]/g, ""),
                      )
                    }
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-md text-sm"
                    disabled={loading}
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    Se aplica sobre el total vendido de cada vendedor.
                  </p>
                </div>
                <button
                  onClick={handleGenerarReporteVentasVendedor}
                  disabled={loading}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 rounded-md shadow-sm transition disabled:opacity-50"
                >
                  {loading ? "Generando…" : "Generar PDF"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ReportesPage;
