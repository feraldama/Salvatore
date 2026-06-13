import { useState, useEffect, useRef, useCallback } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import SearchButton from "../../components/common/Input/SearchButton";
import "../../App.css";
import {
  getProductosPaginated,
  searchProductos,
} from "../../services/productos.service";
import { useAuth } from "../../contexts/useAuth";
import PaymentModalMayorista from "../../components/common/PaymentModalMayorista";
import Swal from "sweetalert2";
import { confirmarVenta } from "../../services/venta.service";
import {
  getVehiculosActivos,
  type VehiculoFlota,
} from "../../services/flota.service";
import { usePermiso } from "../../hooks/usePermiso";
import { PermissionDenied } from "../../components/common/ui";
import {
  getAllClientesSinPaginacion,
  createCliente,
} from "../../services/clientes.service";
import { getVendedores, type Vendedor } from "../../services/vendedores.service";
import ClienteModal from "../../components/common/ClienteModal";
import type { Cliente } from "../../components/common/ClienteFormModal";
import { loadPdf } from "../../utils/lazyPdf";
import { getEstadoAperturaPorUsuario } from "../../services/registrodiariocaja.service";
import { getCajaById } from "../../services/cajas.service";
import { getLocalById } from "../../services/locales.service";
import { useNavigate } from "react-router-dom";
import ActionButton from "../../components/common/Button/ActionButton";
import PagoModal from "../../components/common/PagoModal";
import InvoicePrintModal from "../../components/common/InvoicePrintModal";
import { getCombos } from "../../services/combos.service";
import Pagination from "../../components/common/Pagination";
import {
  formatMiles,
  generatePresupuestoPDF,
  type CarritoItem,
} from "../../utils/utils";

import type { Caja } from "../../types";

interface Combo {
  ComboId: number;
  ComboDescripcion: string;
  ProductoId: number;
  ComboCantidad: number;
  ComboPrecio: number;
  [key: string]: unknown;
}

export default function SalesMayorista() {
  const puedeLeerVentas = usePermiso("NUEVAVENTA", "leer");
  const [carrito, setCarrito] = useState<
    {
      id: number;
      nombre: string;
      precio: number;
      imagen: string;
      stock: number;
      cantidad: number;
      caja: boolean;
      cartItemId: number;
      // Precios guardados para no depender del array productos
      precioVenta: number;
      precioVentaMayorista: number;
      precioUnitario: number;
    }[]
  >([]);
  const [busqueda, setBusqueda] = useState("");
  const [busquedaDebounced, setBusquedaDebounced] = useState("");
  const [productos, setProductos] = useState<
    {
      ProductoId: number;
      ProductoCodigo: string;
      ProductoNombre: string;
      ProductoPrecioVenta: number;
      ProductoStock: number;
      HasImagen?: number | boolean;
      ProductoPrecioVentaMayorista: number;
      LocalId: string | number;
      ProductoPrecioUnitario: number;
      ProductoStockUnitario?: number;
    }[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [refreshKey, setRefreshKey] = useState(0);
  const [pagination, setPagination] = useState({
    totalItems: 0,
    totalPages: 1,
    currentPage: 1,
    itemsPerPage: 10,
  });
  // const [modalPago, setModalPago] = useState(false);
  const { user, empresaActiva, localActiva } = useAuth();
  const [showModal, setShowModal] = useState(false);
  const [showInvoicePrintModal, setShowInvoicePrintModal] = useState(false);
  const [totalRest, setTotalRest] = useState(0);
  const [efectivo, setEfectivo] = useState(0);
  const [banco, setBanco] = useState(0);
  const [bancoDebito, setBancoDebito] = useState(0);
  const [bancoCredito, setBancoCredito] = useState(0);
  const [cuentaCliente, setCuentaCliente] = useState(0);
  const [voucher, setVoucher] = useState(0);
  const [ventaNroPOS, setVentaNroPOS] = useState("");
  const [printTicket, setPrintTicket] = useState(false);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [showClienteModal, setShowClienteModal] = useState(false);
  const [clienteSeleccionado, setClienteSeleccionado] =
    useState<Cliente | null>({
      ClienteId: 1,
      ClienteNombre: "SIN NOMBRE MINORISTA",
      ClienteRUC: "",
      ClienteTelefono: "",
      ClienteTipo: "MI",
      UsuarioId: "",
      ClienteApellido: "",
      ClienteDireccion: "",
    });
  useState<Cliente | null>(null);
  const [cajaAperturada, setCajaAperturada] = useState<Caja | null>(null);
  const [localNombre, setLocalNombre] = useState("");
  // Tipo de venta mayorista: CONTADO (cobro inmediato) o ENVIO (se entregan los
  // productos y el cliente paga al recibir; se registra como cuenta corriente).
  const [tipoVenta, setTipoVenta] = useState<"CONTADO" | "ENVIO">("CONTADO");
  // Vehículos activos de la flota y el elegido para el envío (obligatorio en
  // ENVIO; el backend lo registra en venta_envio para la app mobile de flota).
  const [vehiculos, setVehiculos] = useState<VehiculoFlota[]>([]);
  const [vehiculoEnvioId, setVehiculoEnvioId] = useState<number | "">("");
  // Vendedores de la empresa, para mostrar el asignado al cliente seleccionado.
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const navigate = useNavigate();
  const [showPagoModal, setShowPagoModal] = useState(false);
  const [combos, setCombos] = useState<Combo[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<number | null>(
    null,
  );
  // Índice del producto resaltado para navegación por teclado en la lista
  // (flechas ↑/↓ + Enter). -1 = ninguno (foco fuera de la lista).
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const cantidadRefs = useRef<{ [key: number]: HTMLInputElement | null }>({});
  const searchInputRef = useRef<HTMLInputElement>(null);
  // Contenedor scrollable de la lista de productos: recibe el foco al tabular
  // desde el buscador (solo búsquedas por texto) para navegar con el teclado.
  const productListRef = useRef<HTMLDivElement>(null);
  // Fila actualmente resaltada, para hacer scrollIntoView al navegar.
  const highlightedRowRef = useRef<HTMLTableRowElement>(null);
  const debounceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Flag para indicar "al llegar los próximos resultados de búsqueda, agregar
  // el primer producto al carrito". Se activa cuando el usuario presiona Enter
  // con una búsqueda pendiente de aplicarse (flujo tipo scanner de código de
  // barras / Enter tras tipear el nombre).
  const addFirstOnNextResultsRef = useRef(false);
  // Término escaneado pendiente. Lo usamos para verificar que los resultados
  // que llegan corresponden al código escaneado y no a un fetch previo (evita
  // agregar un producto incorrecto por una condición de carrera entre fetches).
  const pendingScanTermRef = useRef<string>("");
  // Término al que corresponde el array `productos` actualmente cargado. Se
  // actualiza recién cuando llega la respuesta del fetch. Se compara contra
  // `pendingScanTermRef` para saber si los productos visibles realmente son
  // los resultados del código escaneado (y no todavía los productos previos).
  const productosForTermRef = useRef<string>("");

  useEffect(() => {
    if (selectedProductId !== null && cantidadRefs.current[selectedProductId]) {
      cantidadRefs.current[selectedProductId]?.focus();
    }
  }, [selectedProductId, carrito.length]);

  // Focus automático en el campo de búsqueda al cargar la página
  useEffect(() => {
    if (searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, []);

  // Cargar los vehículos de la flota al seleccionar ENVÍO (una sola vez).
  useEffect(() => {
    if (tipoVenta !== "ENVIO" || vehiculos.length > 0) return;
    getVehiculosActivos()
      .then(setVehiculos)
      .catch((e) => console.error("Error al cargar vehículos de flota:", e));
  }, [tipoVenta, vehiculos.length]);

  const agregarProducto = (producto: {
    id: number;
    nombre: string;
    precio: number;
    precioMayorista?: number;
    imagen: string;
    stock: number;
    precioUnitario?: number;
  }) => {
    // Pantalla mayorista: siempre se usa el precio mayorista (cae al minorista
    // solo si el producto no tuviera precio mayorista cargado).
    const precioFinal =
      producto.precioMayorista !== undefined
        ? producto.precioMayorista
        : producto.precio;

    const precioSeguro = precioFinal ?? 0;

    const nuevoCartItemId = Date.now() + Math.random();
    setCarrito([
      ...carrito,
      {
        ...producto,
        precio: precioSeguro,
        cantidad: 0,
        // Mayorista: por defecto la venta es por CAJA.
        caja: true,
        cartItemId: nuevoCartItemId,
        // Guardar los precios originales para cálculos posteriores
        precioVenta: producto.precio,
        precioVentaMayorista: producto.precioMayorista ?? producto.precio,
        precioUnitario: producto.precioUnitario ?? producto.precio,
      },
    ]);
    setSelectedProductId(nuevoCartItemId); // Focus en el input de cantidad del producto nuevo
  };

  const quitarProducto = (cartItemId: number) => {
    setCarrito(carrito.filter((p) => p.cartItemId !== cartItemId));
  };

  const cambiarCantidad = (cartItemId: number, cantidad: number) => {
    setCarrito(
      carrito.map((p) =>
        p.cartItemId === cartItemId
          ? { ...p, cantidad: Math.max(1, cantidad) }
          : p,
      ),
    );
  };

  // Función para obtener el precio unitario según el check Caja
  const obtenerPrecio = (p: (typeof carrito)[0]) => {
    // Usar los precios guardados en el carrito en lugar de buscar en productos
    if (p.caja) {
      // Mayorista: el precio por caja es siempre el mayorista.
      return p.precioVentaMayorista;
    } else {
      const combo = combos.find((c) => Number(c.ProductoId) === Number(p.id));
      if (combo) {
        // El precio unitario se calcula en base al combo
        return (
          calcularPrecioConCombo(p.id, p.cantidad, p.precioUnitario) /
          p.cantidad
        );
      }
      return p.precioUnitario;
    }
  };

  // Función para obtener el total según el check Caja
  const obtenerTotal = (p: (typeof carrito)[0]) => {
    // Usar los precios guardados en el carrito en lugar de buscar en productos
    if (p.caja) {
      // Mayorista: el precio por caja es siempre el mayorista.
      return p.precioVentaMayorista * p.cantidad;
    } else {
      const combo = combos.find((c) => Number(c.ProductoId) === Number(p.id));
      if (combo) {
        return calcularPrecioConCombo(p.id, p.cantidad, p.precioUnitario);
      }
      return p.precioUnitario * p.cantidad;
    }
  };

  const total = carrito.reduce((acc, p) => acc + obtenerTotal(p), 0);

  // Vendedor asignado al cliente seleccionado (clientes mayoristas tienen uno).
  const vendedorAsignado =
    clienteSeleccionado?.VendedorId != null
      ? vendedores.find(
          (v) =>
            Number(v.VendedorId) === Number(clienteSeleccionado.VendedorId),
        ) ?? null
      : null;

  // Función para cargar productos con paginación
  const fetchProductos = useCallback(async () => {
    if (!cajaAperturada) return;

    setLoading(true);
    try {
      // El catálogo se scopea por empresa: el backend filtra por la empresa
      // activa (header X-Empresa-Id que envía el interceptor). No se filtra por
      // local — los locales de una empresa comparten catálogo.
      const filters = undefined;
      const data = busquedaDebounced.trim()
        ? await searchProductos(
            busquedaDebounced.trim(),
            currentPage,
            itemsPerPage,
            undefined,
            undefined,
            filters,
          )
        : await getProductosPaginated(
            currentPage,
            itemsPerPage,
            undefined,
            undefined,
            filters,
          );

      setProductos(data.data || []);
      // Registrar a qué término corresponden estos productos, para que el
      // efecto que agrega el primer producto sepa que ya llegó la respuesta
      // del código escaneado (y no los productos previos).
      productosForTermRef.current = busquedaDebounced.trim();
      setPagination({
        totalItems: data.pagination?.totalItems || 0,
        totalPages: data.pagination?.totalPages || 1,
        currentPage: data.pagination?.currentPage || 1,
        itemsPerPage: data.pagination?.itemsPerPage || itemsPerPage,
      });
    } catch (error) {
      console.error("Error al cargar productos:", error);
      setProductos([]);
      productosForTermRef.current = busquedaDebounced.trim();
    } finally {
      setLoading(false);
    }
    // refreshKey se incrementa tras una venta para forzar el refetch de
    // productos (regenera la identidad del callback y dispara el useEffect
    // que llama a fetchProductos). No se lee dentro del cuerpo, por eso el
    // linter lo marca como innecesario — la dependencia es intencional.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    cajaAperturada,
    busquedaDebounced,
    currentPage,
    itemsPerPage,
    user?.LocalId,
    refreshKey,
  ]);

  // Cargar combos solo una vez al montar
  useEffect(() => {
    getCombos(1, 200).then((data) => setCombos(data.data || []));
  }, []);

  // Cargar productos cuando cambian las dependencias
  useEffect(() => {
    if (cajaAperturada) {
      fetchProductos();
    }
  }, [fetchProductos, cajaAperturada]);

  // Cuando el usuario presiona Enter con una búsqueda pendiente, esperamos a
  // que lleguen los resultados y agregamos el primer producto. Dejamos el
  // input limpio y con foco para encadenar múltiples escaneos/búsquedas.
  useEffect(() => {
    if (!addFirstOnNextResultsRef.current) return;
    if (loading) return;
    // Solo agregar cuando los productos actualmente cargados corresponden al
    // término escaneado. `productosForTermRef` se actualiza recién cuando el
    // fetch del término pendiente termina; mientras tanto sigue con el valor
    // del fetch anterior, lo que evita agregar un producto de la página vieja.
    if (pendingScanTermRef.current.trim() !== productosForTermRef.current)
      return;
    addFirstOnNextResultsRef.current = false;
    pendingScanTermRef.current = "";
    agregarPrimerProductoVisible();
    setBusqueda("");
    searchInputRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, productos]);

  // Efecto para buscar cuando cambia el término de búsqueda (con debounce)
  useEffect(() => {
    if (!cajaAperturada) return;

    // Cancelar timeout anterior si existe
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    const timeoutId = setTimeout(() => {
      // Resetear página y aplicar término juntos, en un mismo batch, para que
      // fetchProductos se dispare una sola vez con el estado coherente y no
      // produzca un fetch intermedio con el término viejo (causa del bug en
      // que se agregaba al carrito el primer producto de la página 1 sin
      // filtrar).
      setCurrentPage(1);
      setBusquedaDebounced(busqueda);
      debounceTimeoutRef.current = null;
    }, 500); // Debounce de 500ms

    debounceTimeoutRef.current = timeoutId;

    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
        debounceTimeoutRef.current = null;
      }
    };
  }, [busqueda, cajaAperturada]);

  // Cargar clientes solo cuando se abre el modal
  useEffect(() => {
    if (showClienteModal) {
      getAllClientesSinPaginacion()
        .then((data) => {
          setClientes(data.data || []);
        })
        .catch(() =>
          setClientes([
            {
              ClienteId: 1,
              ClienteRUC: "",
              ClienteNombre: "SIN NOMBRE MINORISTA",
              ClienteApellido: "",
              ClienteDireccion: "",
              ClienteTelefono: "",
              ClienteTipo: "MI",
              UsuarioId: "",
            },
          ]),
        );
    }
  }, [showClienteModal]);

  const handleCreateCliente = async (clienteData: Cliente) => {
    try {
      const nuevoCliente = await createCliente({
        ClienteId: clienteData.ClienteId,
        ClienteRUC: clienteData.ClienteRUC,
        ClienteNombre: clienteData.ClienteNombre,
        ClienteApellido: clienteData.ClienteApellido,
        ClienteDireccion: clienteData.ClienteDireccion,
        ClienteTelefono: clienteData.ClienteTelefono,
        ClienteTipo: clienteData.ClienteTipo,
        UsuarioId: clienteData.UsuarioId
          ? String(clienteData.UsuarioId).trim()
          : "",
      });
      // Recargar la lista de clientes
      const response = await getAllClientesSinPaginacion();
      setClientes(response.data || []);
      // Seleccionar el nuevo cliente creado
      if (nuevoCliente.data) {
        setClienteSeleccionado(nuevoCliente.data);
        setShowClienteModal(false);
      }
      Swal.fire({
        icon: "success",
        title: "Cliente creado exitosamente",
        text: "El cliente ha sido creado y seleccionado",
      });
    } catch (error) {
      console.error("Error al crear cliente:", error);
      Swal.fire({
        icon: "error",
        title: "Error al crear cliente",
        text: "Hubo un problema al crear el cliente",
      });
    }
  };

  useEffect(() => {
    if (!clienteSeleccionado) return;
    setCarrito((carritoActual) =>
      carritoActual.map((item) => {
        // Mayorista: el precio de referencia del item es siempre el mayorista.
        return { ...item, precio: item.precioVentaMayorista ?? 0 };
      }),
    );
  }, [clienteSeleccionado]);

  function calcularPrecioConCombo(
    productoId: number,
    cantidad: number,
    precioUnitario: number,
  ) {
    const combo = combos.find(
      (c) => Number(c.ProductoId) === Number(productoId),
    );
    if (!combo) return cantidad * precioUnitario;
    const comboCantidad = Number(combo.ComboCantidad);
    const comboPrecio = Number(combo.ComboPrecio);
    if (cantidad < comboCantidad) {
      return cantidad * precioUnitario;
    }
    const cantidadCombos = Math.floor(cantidad / comboCantidad);
    const cantidadRestante = cantidad % comboCantidad;
    return cantidadCombos * comboPrecio + cantidadRestante * precioUnitario;
  }

  const sendRequest = async () => {
    // Guardrail: el descuento de stock necesita un almacén real. Los usuarios
    // en local "TODOS" (LocalId 0) resuelven al almacén 0, que no tiene stock
    // (el stock vive en los almacenes de cada local). Bloqueamos la venta con
    // un mensaje claro en vez de descontar de un almacén vacío.
    const almacenVenta = Number(user?.AlmacenId ?? user?.LocalId);
    if (!almacenVenta || Number(user?.LocalId) === 0) {
      await Swal.fire({
        icon: "warning",
        title: "Sin local de venta asignado",
        text:
          "Tu usuario no tiene un local de venta válido (figura como \"TODOS\"). " +
          "Pedí al administrador que te asigne un local real (ej. SALON) para poder vender y descontar stock.",
        confirmButtonColor: "#3085d6",
      });
      return;
    }

    // Hora local del navegador. El parche UTC-4 viejo era para compensar un
    // bug del JVM/Tomcat de GeneXus que sumaba 1h al guardar; ahora vamos a
    // Node/PG directo y no hace falta.
    const fechaAjustada = new Date();

    const SDTProductoItem = carrito.map((p) => {
      const combo = combos.find((c) => Number(c.ProductoId) === Number(p.id));
      // Usar el precio unitario guardado en el carrito
      const precioUnitario = p.precioUnitario;
      const comboCantidad = combo ? Number(combo.ComboCantidad) : 0;
      const totalCombo = calcularPrecioConCombo(
        p.id,
        p.cantidad,
        precioUnitario,
      );
      const esCombo = combo && !p.caja && p.cantidad >= comboCantidad;
      return {
        ClienteId: clienteSeleccionado?.ClienteId,
        Producto: {
          ProductoId: p.id,
          VentaProductoCantidad: p.cantidad,
          ProductoPrecioVenta: p.precio,
          ProductoUnidad: p.caja ? "C" : "U",
          VentaProductoPrecioTotal: obtenerTotal(p),
          Combo: esCombo ? "S" : "N",
          ComboPrecio: esCombo ? totalCombo : 0,
        },
      };
    });

    // Timestamp ISO YYYY-MM-DDTHH:MM:SS para que registrodiariocaja y
    // venta.VentaFecha guarden la hora real (el ajuste UTC-4 ya se aplicó
    // sobre fechaAjustada arriba).
    const pad = (n: number) => String(n).padStart(2, "0");
    const fechaIso =
      `${fechaAjustada.getFullYear()}-${pad(fechaAjustada.getMonth() + 1)}-` +
      `${pad(fechaAjustada.getDate())}T${pad(fechaAjustada.getHours())}:` +
      `${pad(fechaAjustada.getMinutes())}:${pad(fechaAjustada.getSeconds())}`;

    try {
      // En mayorista siempre es venta (no hay devolución).
      await confirmarVenta({
        VentaFecha: fechaIso,
        AlmacenOrigenId: Number(user?.AlmacenId ?? user?.LocalId),
        ClienteId: Number(clienteSeleccionado?.ClienteId),
        CajaId: Number(cajaAperturada?.CajaId),
        UsuarioId: String(user?.id ?? ""),
        VentaPagoTipo: "E",
        EsEnvio: tipoVenta === "ENVIO",
        EnvioVehiculoId:
          tipoVenta === "ENVIO" && vehiculoEnvioId !== ""
            ? vehiculoEnvioId
            : undefined,
        VentaNroFactura: 0,
        VentaTimbrado: 0,
        VentaNroPOS:
          bancoDebito > 0 || bancoCredito > 0
            ? ventaNroPOS.trim() || "0"
            : "0",
        Pagos: {
          Efectivo: Number(efectivo) + Number(totalRest),
          Banco: Number(bancoDebito) + Number(bancoCredito),
          CuentaCliente: Number(cuentaCliente),
          Voucher: Number(voucher),
          Transferencia: Number(banco),
        },
        Productos: SDTProductoItem.map((item) => ({
          ProductoId: Number(item.Producto.ProductoId),
          VentaProductoCantidad: Number(item.Producto.VentaProductoCantidad),
          ProductoUnidad: item.Producto.ProductoUnidad as "U" | "C",
          VentaProductoPrecioTotal: Number(
            item.Producto.VentaProductoPrecioTotal
          ),
          Combo: item.Producto.Combo === "S",
          ComboPrecio: Number(item.Producto.ComboPrecio),
        })),
      });
      if (printTicket) {
        await generateTicketPDF();
      }

      Swal.fire({
        title: "Venta realizada con éxito!",
        icon: "success",
        timer: 1000,
        showConfirmButton: false,
        allowOutsideClick: false,
        allowEscapeKey: false,
      }).then(() => {
        setCarrito([]);
        setSelectedProductId(null);
        setBusqueda("");
        setBusquedaDebounced("");
        setCurrentPage(1);
        setShowInvoicePrintModal(false);
        setClienteSeleccionado({
          ClienteId: 1,
          ClienteNombre: "SIN NOMBRE MINORISTA",
          ClienteRUC: "",
          ClienteTelefono: "",
          ClienteTipo: "MI",
          UsuarioId: "",
          ClienteApellido: "",
          ClienteDireccion: "",
        });
        setRefreshKey((k) => k + 1);
        searchInputRef.current?.focus();
      });
    } catch (error) {
      console.error(error);
      Swal.fire({
        icon: "error",
        title: "Error",
        text: "Error al realizar la venta",
      });
    }
    // Limpiar estados de pago
    setEfectivo(0);
    setBanco(0);
    setBancoDebito(0);
    setBancoCredito(0);
    setCuentaCliente(0);
    setVoucher(0);
    setVentaNroPOS("");
    setTotalRest(0);
    setPrintTicket(false);
    setShowModal(false);
  };

  const generateTicketPDF = async () => {
    const { jsPDF, autoTable } = await loadPdf();
    // Crear una instancia de jsPDF con un tamaño personalizado (80mm de ancho)
    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: [80, 297], // 80mm de ancho y 297mm de alto (A4 cortado)
    });

    const fechaActual = new Date();
    const dia = String(fechaActual.getDate()).padStart(2, "0");
    const mes = String(fechaActual.getMonth() + 1).padStart(2, "0");
    const año = fechaActual.getFullYear().toString();
    const horas = String(fechaActual.getHours()).padStart(2, "0");
    const minutos = String(fechaActual.getMinutes()).padStart(2, "0");
    const segundos = String(fechaActual.getSeconds()).padStart(2, "0");

    const fechaFormateada = `${dia}/${mes}/${año}`;
    const horaFormateada = `${horas}:${minutos}:${segundos}`;

    // Configuración inicial
    doc.setFontSize(8); // Tamaño de fuente más pequeño
    doc.setFont("helvetica", "normal");

    // Encabezado del ticket
    doc.text("Auto Shop Alonso", 0, 15);
    doc.text("BODEGA", 0, 20);
    doc.text("Bernardino Caballero c/ Antequera, Ypacaraí", 0, 25);
    doc.text("Teléfono: +595 892 784989", 0, 30);
    doc.text(`Fecha: ${fechaFormateada} - Hora: ${horaFormateada}`, 0, 35);
    doc.text(
      clienteSeleccionado?.ClienteRUC
        ? "RUC: " + clienteSeleccionado.ClienteRUC
        : "RUC: SIN RUC",
      0,
      40,
    );
    doc.text(
      "Cliente: " +
        (clienteSeleccionado?.ClienteNombre +
          " " +
          clienteSeleccionado?.ClienteApellido || ""),
      0,
      45,
    );

    // Línea separadora
    doc.setLineWidth(0.2); // Línea más delgada
    doc.line(0, 48, 75, 48); // Ajustar el ancho de la línea

    // Encabezados de la tabla
    const headers = [["Desc.", "Cant", "Precio", "Total"]];

    // Datos de la tabla
    const tableData = carrito.map((p) => {
      // Usar los precios guardados en el carrito
      let precioUnitario = 0;
      let precioLabel = "";
      let totalLinea = 0;
      if (p.caja) {
        // Caja: precio minorista o mayorista
        precioUnitario =
          clienteSeleccionado?.ClienteTipo === "MA"
            ? p.precioVentaMayorista
            : p.precioVenta;
        precioLabel = `Caja (${
          clienteSeleccionado?.ClienteTipo === "MA" ? "Mayorista" : "Minorista"
        })`;
        totalLinea = precioUnitario * p.cantidad;
      } else {
        // Unidad: puede aplicar combo
        const combo = combos.find((c) => Number(c.ProductoId) === Number(p.id));
        if (combo && p.cantidad >= combo.ComboCantidad) {
          // Aplica combo
          precioUnitario = p.precioUnitario;
          precioLabel = `Unidad (Combo)`;
          totalLinea = calcularPrecioConCombo(p.id, p.cantidad, precioUnitario);
        } else {
          // Solo unidad
          precioUnitario = p.precioUnitario;
          precioLabel = `Unidad`;
          totalLinea = precioUnitario * p.cantidad;
        }
      }
      return [
        p.nombre,
        p.cantidad,
        `Gs. ${precioUnitario.toLocaleString("es-ES")}\n${precioLabel}`,
        `Gs. ${totalLinea.toLocaleString("es-ES")}`,
      ];
    });

    // Agregar la tabla al PDF
    autoTable(doc, {
      head: headers,
      body: tableData,
      startY: 50,
      theme: "plain",
      styles: {
        fontSize: 7,
        textColor: [0, 0, 0],
        fillColor: [255, 255, 255],
      },
      // headStyles: { fillColor: [200, 200, 200] },
      columnStyles: {
        0: { cellWidth: 30 },
        1: { cellWidth: 9 },
        2: { cellWidth: 14 },
        3: { cellWidth: 20 },
      },
      margin: { left: 0 }, // Margen izquierdo
    });

    // Total de la compra
    const totalCost = carrito.reduce(
      (sum, item) => sum + obtenerTotal(item),
      0,
    );
    const lastAutoTable = (
      doc as unknown as { lastAutoTable: { finalY: number } }
    ).lastAutoTable;
    doc.text(
      `Total a Pagar Gs. ${totalCost.toLocaleString("es-ES")}`,
      0,
      lastAutoTable.finalY + 5,
    );

    // Pie de página
    doc.text("--GRACIAS POR SU PREFERENCIA--", 0, lastAutoTable.finalY + 10);

    // Guardar el PDF
    doc.save("ticket_venta.pdf");
  };

  useEffect(() => {
    const fetchCaja = async () => {
      if (!user?.id) return;
      try {
        const estado = await getEstadoAperturaPorUsuario(user.id);
        if (estado.cajaId && estado.aperturaId > estado.cierreId) {
          const caja = await getCajaById(estado.cajaId);
          setCajaAperturada(caja);
        } else {
          Swal.fire({
            icon: "warning",
            title: "Caja no aperturada",
            text: "Debes aperturar una caja antes de realizar ventas.",
            confirmButtonColor: "#2563eb",
          }).then(() => {
            navigate("/apertura-cierre-caja");
          });
          setCajaAperturada(null);
        }
      } catch {
        setCajaAperturada(null);
      }
    };
    fetchCaja();
  }, [user, navigate]);

  useEffect(() => {
    if (user?.LocalId) {
      getLocalById(user.LocalId)
        .then((data) => {
          setLocalNombre(data.LocalNombre || "");
        })
        .catch(() => setLocalNombre(""));
    } else {
      setLocalNombre("");
    }
  }, [user?.LocalId]);

  // Cargar vendedores de la empresa activa (para resolver el vendedor asignado
  // a cada cliente). El backend scopea por empresa vía header; pasamos el id
  // explícito cuando lo tenemos.
  useEffect(() => {
    const empresaId = empresaActiva?.EmpresaId ?? user?.EmpresaId;
    getVendedores(empresaId)
      .then((res) => setVendedores(res?.data || []))
      .catch(() => setVendedores([]));
  }, [empresaActiva?.EmpresaId, user?.EmpresaId]);

  const handleTecladoNumerico = (valor: string | number) => {
    if (selectedProductId === null) return;
    setCarrito((prev) =>
      prev.map((item) => {
        if (item.cartItemId !== selectedProductId) return item;
        let nuevaCantidad = String(item.cantidad);
        if (valor === "C" || valor === "c") {
          nuevaCantidad = "0";
        } else if (valor === "←") {
          nuevaCantidad =
            nuevaCantidad.length > 1 ? nuevaCantidad.slice(0, -1) : "0";
        } else {
          // Solo permitir números
          if (/^\d+$/.test(String(valor))) {
            nuevaCantidad = nuevaCantidad + valor;
          }
        }
        return { ...item, cantidad: Math.max(0, Number(nuevaCantidad)) };
      }),
    );
  };

  // --- Generar PDF de Presupuesto ---
  const handlePresupuestoPDF = () => {
    // Convertir el carrito al formato esperado por la función de utils
    const carritoItems: CarritoItem[] = carrito.map((item) => ({
      nombre: item.nombre,
      cantidad: item.cantidad,
      precio: item.precio,
    }));

    generatePresupuestoPDF(carritoItems, clienteSeleccionado || undefined);
  };

  // --- Función para manejar ENTER en la búsqueda ---
  // Aplica la búsqueda inmediatamente (salteando el debounce) y agrega el
  // primer producto de la lista filtrada al carrito. Si los resultados ya
  // están listos para el término actual, los agrega en el acto; si todavía
  // no llegaron, deja un flag para agregarlos al completar el próximo fetch.
  const handleSearchSubmit = () => {
    if (!cajaAperturada) return;

    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
      debounceTimeoutRef.current = null;
    }

    // Sin término de búsqueda: solo sincronizamos el debounce (no agregamos
    // nada — evitamos agregar un producto arbitrario de la lista sin filtrar).
    if (!busqueda.trim()) {
      setCurrentPage(1);
      setBusquedaDebounced(busqueda);
      return;
    }

    // Solo autoseleccionar el primer resultado cuando el término es un código
    // (solo dígitos). Para búsquedas por nombre dejamos que el usuario elija.
    const esCodigo = /^\d+$/.test(busqueda.trim());
    if (!esCodigo) {
      setCurrentPage(1);
      setBusquedaDebounced(busqueda);
      return;
    }

    // Si los resultados actuales ya corresponden al término tipeado, agregar
    // el primer producto inmediatamente y limpiar el input para el próximo
    // escaneo/búsqueda.
    if (busqueda === busquedaDebounced && !loading) {
      agregarPrimerProductoVisible();
      setBusqueda("");
      return;
    }

    // Todavía no hay resultados para este término: disparar la búsqueda y
    // dejar flag para que el useEffect agregue el primer producto al llegar.
    addFirstOnNextResultsRef.current = true;
    pendingScanTermRef.current = busqueda;
    setCurrentPage(1);
    setBusquedaDebounced(busqueda);
  };

  // Agrega al carrito un producto cualquiera de la lista visible.
  const agregarProductoDeLista = (p: (typeof productos)[number]) => {
    agregarProducto({
      id: p.ProductoId,
      nombre: p.ProductoNombre,
      precio: p.ProductoPrecioVenta,
      precioMayorista: p.ProductoPrecioVentaMayorista,
      imagen: "",
      stock: p.ProductoStock,
      precioUnitario: p.ProductoPrecioUnitario,
    });
  };

  // Agrega el primer producto visible al carrito (helper compartido por el
  // Enter inmediato y por el efecto que espera los resultados asíncronos).
  const agregarPrimerProductoVisible = () => {
    if (productos.length === 0) return;
    agregarProductoDeLista(productos[0]);
  };

  // ¿El término actual es una búsqueda por texto (no un código numérico)?
  // Solo en ese caso habilitamos la navegación por teclado de la lista; para
  // códigos numéricos se mantiene el flujo de escaneo (Enter agrega el primero).
  const esBusquedaTexto = () => {
    const term = busqueda.trim();
    return term !== "" && !/^\d+$/.test(term);
  };

  // Mueve el foco del buscador a la lista de productos para navegar con flechas.
  const enfocarListaProductos = () => {
    if (productos.length === 0) return;
    setHighlightedIndex(0);
    productListRef.current?.focus();
  };

  // Si cambia el conjunto de productos, resetear el resaltado.
  useEffect(() => {
    setHighlightedIndex(-1);
  }, [productos]);

  // Mantener la fila resaltada visible al navegar con el teclado.
  useEffect(() => {
    if (highlightedIndex >= 0) {
      highlightedRowRef.current?.scrollIntoView({ block: "nearest" });
    }
  }, [highlightedIndex]);

  // Teclado sobre la lista de productos: ↑/↓ navegan, Enter agrega, Esc/Shift+Tab
  // o ↑ en el primero devuelven el foco al buscador.
  const handleListaKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (productos.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((i) => Math.min(productos.length - 1, i < 0 ? 0 : i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((i) => {
        if (i <= 0) {
          searchInputRef.current?.focus();
          searchInputRef.current?.select();
          return -1;
        }
        return i - 1;
      });
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < productos.length) {
        agregarProductoDeLista(productos[highlightedIndex]);
      }
    } else if (e.key === "Escape" || (e.key === "Tab" && e.shiftKey)) {
      e.preventDefault();
      setHighlightedIndex(-1);
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    }
  };

  if (!puedeLeerVentas)
    return <PermissionDenied resource="la pantalla de ventas" />;

  return (
    <div className="flex h-screen bg-surface-alt">
      {/* Lado Izquierdo */}
      <div className="flex-1 bg-surface-alt p-4 flex flex-col justify-between">
        <div className="bg-white rounded-xl shadow-lg p-0 mb-4 flex flex-col max-h-[80vh] overflow-hidden">
          <div className="flex-1 overflow-y-auto">
            <table className="w-full border-separate border-spacing-0">
              <thead>
                <tr className="text-left bg-surface-alt">
                  <th className="py-4 pl-6 font-semibold text-[15px]">
                    Nombre
                  </th>
                  <th className="py-4 font-semibold text-[15px]">Cantidad</th>
                  <th className="py-4 font-semibold text-[15px]">
                    Precio Uni.
                  </th>
                  <th className="py-4 pr-6 font-semibold text-[15px]">Total</th>
                </tr>
              </thead>
              <tbody>
                {carrito.map((p, idx) => (
                  <tr
                    key={p.cartItemId}
                    className={`${
                      p.cartItemId === selectedProductId
                        ? "bg-gray-50 border-gray-300"
                        : idx !== carrito.length - 1
                          ? "border-b border-gray-200"
                          : ""
                    } transition-colors`}
                    onClick={() => {
                      setSelectedProductId(p.cartItemId);
                      setTimeout(() => {
                        cantidadRefs.current[p.cartItemId]?.focus();
                      }, 0);
                    }}
                  >
                    <td className="py-3 pl-6 align-middle">
                      <div className="font-bold text-[17px] text-[#222] leading-tight">
                        {p.nombre}
                      </div>
                      <div
                        className="text-red-600 text-sm mt-1 cursor-pointer inline-block"
                        onClick={(e) => {
                          e.stopPropagation();
                          quitarProducto(p.cartItemId);
                        }}
                      >
                        Eliminar
                      </div>
                    </td>
                    <td className="py-3 align-middle">
                      <div className="flex flex-col items-center gap-1">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              cambiarCantidad(p.cartItemId, p.cantidad - 1);
                              setSelectedProductId(p.cartItemId);
                            }}
                            className="w-8 h-8 border border-border rounded bg-surface-sunken text-text text-lg font-bold flex items-center justify-center hover:bg-surface-muted transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
                          >
                            -
                          </button>
                          <input
                            type="number"
                            value={p.cantidad}
                            min={0}
                            className="w-10 h-8 text-center border border-gray-300 rounded bg-gray-50 text-base font-semibold text-[#222] mx-1"
                            readOnly
                            ref={(el) => {
                              cantidadRefs.current[p.cartItemId] = el || null;
                            }}
                            tabIndex={0}
                            onFocus={() => setSelectedProductId(p.cartItemId)}
                            onKeyDown={(e) => {
                              if (selectedProductId !== p.cartItemId) return;
                              if (e.key >= "0" && e.key <= "9") {
                                e.preventDefault();
                                handleTecladoNumerico(e.key);
                              } else if (e.key === "Backspace") {
                                e.preventDefault();
                                handleTecladoNumerico("←");
                              } else if (e.key.toLowerCase() === "c") {
                                e.preventDefault();
                                handleTecladoNumerico("C");
                              } else if (e.key === "ArrowUp") {
                                e.preventDefault();
                                cambiarCantidad(p.cartItemId, p.cantidad + 1);
                              } else if (e.key === "ArrowDown") {
                                e.preventDefault();
                                cambiarCantidad(p.cartItemId, p.cantidad - 1);
                              } else if (e.key === "Tab" && !e.shiftKey) {
                                e.preventDefault();
                                // Seleccionar el texto de la búsqueda anterior
                                // para que al tipear se reemplace directamente.
                                searchInputRef.current?.focus();
                                searchInputRef.current?.select();
                              }
                            }}
                          />
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              cambiarCantidad(p.cartItemId, p.cantidad + 1);
                              setSelectedProductId(p.cartItemId);
                            }}
                            className="w-8 h-8 border border-border rounded bg-surface-sunken text-text text-lg font-bold flex items-center justify-center hover:bg-surface-muted transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
                          >
                            +
                          </button>
                        </div>
                        <div className="flex items-center mt-1">
                          <input
                            type="checkbox"
                            id={`caja-checkbox-${p.cartItemId}`}
                            checked={p.caja}
                            onChange={() =>
                              setCarrito(
                                carrito.map((item) =>
                                  item.cartItemId === p.cartItemId
                                    ? { ...item, caja: !item.caja }
                                    : item,
                                ),
                              )
                            }
                            className="cursor-pointer"
                          />
                          <label
                            htmlFor={`caja-checkbox-${p.cartItemId}`}
                            className="text-lg text-gray-700 cursor-pointer select-none font-medium"
                          >
                            Caja
                          </label>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 align-middle text-right font-num font-medium text-[17px] text-text-muted">
                      <>Gs. {formatMiles(obtenerPrecio(p))}</>
                    </td>
                    <td className="py-3 pr-6 align-middle text-right font-num font-medium text-[17px] text-text">
                      Gs. {formatMiles(obtenerTotal(p))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        {/* Pad numérico y botón pagar - NUEVO DISEÑO TAILWIND */}
        <div className="bg-white rounded-xl shadow p-4">
          {/* Selector de tipo de venta: CONTADO / ENVÍO (mayorista = siempre venta) */}
          <div className="grid grid-cols-2 gap-2 mb-3">
            <button
              type="button"
              onClick={() => setTipoVenta("CONTADO")}
              className={`rounded-lg py-2 text-sm font-semibold border-2 transition cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 ${
                tipoVenta === "CONTADO"
                  ? "bg-brand-600 border-brand-600 text-white"
                  : "bg-surface border-border text-text hover:bg-surface-muted"
              }`}
            >
              💵 Contado
            </button>
            <button
              type="button"
              onClick={() => setTipoVenta("ENVIO")}
              className={`rounded-lg py-2 text-sm font-semibold border-2 transition cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40 ${
                tipoVenta === "ENVIO"
                  ? "bg-amber-500 border-amber-500 text-white"
                  : "bg-surface border-border text-text hover:bg-surface-muted"
              }`}
            >
              🚚 Envío
            </button>
          </div>
          {/* Vehículo del envío (obligatorio para confirmar un ENVÍO) */}
          {tipoVenta === "ENVIO" && (
            <div className="mb-3 flex items-center gap-2">
              <span className="text-sm text-text-muted shrink-0">
                🚛 Vehículo:
              </span>
              <select
                value={vehiculoEnvioId}
                onChange={(e) =>
                  setVehiculoEnvioId(
                    e.target.value === "" ? "" : Number(e.target.value),
                  )
                }
                className={`flex-1 min-w-0 rounded-md border bg-surface px-2 py-1.5 text-sm text-text focus:outline-none focus:ring-2 focus:ring-amber-500/40 ${
                  vehiculoEnvioId === ""
                    ? "border-amber-400"
                    : "border-border"
                }`}
              >
                <option value="">— Seleccionar vehículo —</option>
                {vehiculos.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.chapa}
                    {v.marca || v.modelo
                      ? ` · ${[v.marca, v.modelo].filter(Boolean).join(" ")}`
                      : ""}
                  </option>
                ))}
              </select>
            </div>
          )}
          {/* Total */}
          <div className="flex justify-between items-center mb-3">
            <span className="font-bold text-lg text-text">Total</span>
            <span className="font-num font-semibold text-lg text-brand-700">
              Gs. {formatMiles(total)}
            </span>
          </div>
          {/* Grid de botones */}
          <div className="grid grid-cols-3 gap-4 mb-3">
            {/* Botón Pagar / Confirmar Envío */}
            <button
              className="text-white font-semibold rounded-lg flex items-center justify-center text-lg h-[100px] border-2 transition cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 bg-brand-700 border-brand-700 hover:bg-brand-800 focus-visible:ring-brand-500/50"
              onClick={() => {
                // Un ENVÍO no puede confirmarse sin vehículo asignado.
                if (tipoVenta === "ENVIO" && vehiculoEnvioId === "") {
                  Swal.fire({
                    icon: "warning",
                    title: "Seleccione el vehículo",
                    text: "Elegí con qué vehículo sale este envío.",
                  });
                  return;
                }
                setShowModal(true);
              }}
            >
              {tipoVenta === "ENVIO" ? "Confirmar Envío" : "Pagar"}
            </button>
            {/* Botón Presupuesto */}
            <button
              className="bg-surface border border-border rounded-lg text-text font-medium text-lg h-[100px] flex items-center justify-center hover:bg-surface-muted transition cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
              onClick={handlePresupuestoPDF}
            >
              Presupuesto
            </button>
            {/* Botón Imprimir Factura */}
            <button
              className="bg-success-700 border border-success-700 rounded-lg text-white font-medium text-lg h-[100px] flex items-center justify-center hover:bg-success-800 transition cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-success-600/40"
              onClick={() => setShowInvoicePrintModal(true)}
            >
              Imprimir Factura
            </button>
          </div>
          {/* Recuadro inferior para el nombre del cliente */}
          <div className="mt-2">
            <button
              className="w-full bg-surface-sunken border border-border rounded-lg py-2 text-center text-text font-semibold text-base tracking-wide hover:bg-brand-50 hover:border-brand-200 transition cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
              onClick={() => setShowClienteModal(true)}
            >
              {clienteSeleccionado
                ? `${clienteSeleccionado.ClienteNombre} ${
                    clienteSeleccionado.ClienteApellido || ""
                  }`
                : clientes[0]
                  ? `${clientes[0].ClienteNombre} ${
                      clientes[0].ClienteApellido || ""
                    }`
                  : "SIN NOMBRE MINORISTA"}
            </button>
            {/* Vendedor asignado al cliente seleccionado (solo mayoristas) */}
            <div className="mt-1.5 flex items-center justify-center gap-1.5 text-sm">
              <span className="text-text-muted">Vendedor:</span>
              {vendedorAsignado ? (
                <span className="font-semibold text-indigo-700">
                  {vendedorAsignado.VendedorNombre}{" "}
                  {vendedorAsignado.VendedorApellido || ""}
                </span>
              ) : (
                <span className="italic text-text-muted">Sin asignar</span>
              )}
            </div>
            <ClienteModal
              show={showClienteModal}
              onClose={() => setShowClienteModal(false)}
              clientes={clientes}
              onSelect={(cliente: Cliente) => {
                setClienteSeleccionado(cliente);
                setShowClienteModal(false);
              }}
              onCreateCliente={handleCreateCliente}
              currentUserId={user?.id}
            />
          </div>
        </div>
      </div>
      {/* Lado Derecho */}
      <div className="flex-[2] p-4">
        <div className="flex items-center mb-4 justify-between">
          <div className="flex items-center gap-4">
            <SearchButton
              searchTerm={busqueda}
              onSearch={setBusqueda}
              onSearchSubmit={handleSearchSubmit}
              placeholder="Buscar por nombre o código"
              hideButton={true}
              inputRef={searchInputRef}
              onKeyPress={(e) => {
                // Tab en búsqueda por TEXTO: saltar a la lista para navegar con
                // flechas. Para códigos numéricos se mantiene el comportamiento
                // actual (Tab normal / flujo de escaneo).
                if (e.key === "Tab" && !e.shiftKey && esBusquedaTexto()) {
                  e.preventDefault();
                  enfocarListaProductos();
                }
              }}
            />
          </div>
          {user && (
            <div className="ml-6 flex items-center gap-2">
              <span className="font-semibold text-[#222] text-[16px]">
                {user.nombre + " "}
                <span style={{ color: "#888", fontWeight: 400 }}>
                  ({user.id})
                </span>
              </span>
              {empresaActiva && (
                <span
                  className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 border border-indigo-200"
                  title="Empresa activa (facturación)"
                >
                  🏢 {empresaActiva.EmpresaNombre}
                </span>
              )}
              {(localActiva?.LocalNombre || localNombre || user.LocalNombre) && (
                <span
                  className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 border border-slate-200"
                  title="Sucursal / Local"
                >
                  📍 {localActiva?.LocalNombre || localNombre || user.LocalNombre}
                </span>
              )}
              {cajaAperturada && (
                <span
                  className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 border border-emerald-200"
                  title="Caja aperturada"
                >
                  💵 {cajaAperturada.CajaDescripcion}
                </span>
              )}
              <ActionButton
                label="Apertura/Cierre"
                onClick={() => navigate("/apertura-cierre-caja")}
                className="bg-blue-500 hover:bg-blue-700 text-white"
              />
              <ActionButton
                label="Pagos"
                onClick={() => setShowPagoModal(true)}
                className="bg-green-500 hover:bg-green-700 text-white"
              />
            </div>
          )}
        </div>
        {/* Nuevo contenedor con scroll solo para los productos */}
        <div
          className="flex flex-col"
          style={{ height: "calc(100vh - 120px)" }}
        >
          <div
            ref={productListRef}
            tabIndex={-1}
            onKeyDown={handleListaKeyDown}
            className="overflow-y-auto flex-1 mb-4 bg-white rounded-xl shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
          >
            <table className="w-full border-separate border-spacing-0">
              <thead className="sticky top-0 z-10">
                <tr className="bg-surface-alt text-left">
                  <th className="py-3 pl-4 font-semibold text-[14px] text-text">
                    Código
                  </th>
                  <th className="py-3 font-semibold text-[14px] text-text">
                    Producto
                  </th>
                  <th className="py-3 pr-4 font-semibold text-[14px] text-text text-right">
                    P. Unidad
                  </th>
                  <th className="py-3 pr-4 font-semibold text-[14px] text-text text-right">
                    P. Caja
                  </th>
                  <th className="py-3 pr-4 font-semibold text-[14px] text-text text-right">
                    Stock
                  </th>
                  <th className="py-3 pr-4"></th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="text-center py-8 text-text-muted"
                    >
                      Cargando productos...
                    </td>
                  </tr>
                ) : productos.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="text-center py-8 text-text-muted"
                    >
                      No se encontraron productos
                    </td>
                  </tr>
                ) : (
                  productos.map((p, idx) => {
                    const agregar = () =>
                      agregarProducto({
                        id: p.ProductoId,
                        nombre: p.ProductoNombre,
                        precio: p.ProductoPrecioVenta,
                        precioMayorista: p.ProductoPrecioVentaMayorista,
                        imagen: "",
                        stock: p.ProductoStock,
                        precioUnitario: p.ProductoPrecioUnitario,
                      });
                    const sinStock = Number(p.ProductoStock) <= 0;
                    const resaltado = idx === highlightedIndex;
                    return (
                      <tr
                        key={p.ProductoId}
                        ref={resaltado ? highlightedRowRef : undefined}
                        onClick={agregar}
                        className={`cursor-pointer transition-colors ${
                          resaltado ? "bg-brand-100" : "hover:bg-brand-50"
                        } ${
                          idx !== productos.length - 1
                            ? "border-b border-gray-100"
                            : ""
                        }`}
                      >
                        <td className="py-2.5 pl-4 align-middle font-num text-[14px] text-text-muted">
                          {p.ProductoCodigo}
                        </td>
                        <td className="py-2.5 align-middle font-medium text-[15px] text-[#222]">
                          {p.ProductoNombre}
                        </td>
                        <td className="py-2.5 pr-4 align-middle text-right font-num text-[15px] text-text">
                          Gs. {formatMiles(p.ProductoPrecioUnitario)}
                        </td>
                        <td className="py-2.5 pr-4 align-middle text-right font-num text-[15px] font-semibold text-text">
                          Gs. {formatMiles(p.ProductoPrecioVentaMayorista)}
                        </td>
                        <td
                          className={`py-2.5 pr-4 align-middle text-right font-num text-[14px] ${
                            sinStock ? "text-danger-600" : "text-text-muted"
                          }`}
                        >
                          {formatMiles(Number(p.ProductoStock))}
                          {p.ProductoStockUnitario != null && (
                            <span className="text-text-muted">
                              {" "}
                              / {formatMiles(Number(p.ProductoStockUnitario))} u
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 pr-4 align-middle text-right">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              agregar();
                            }}
                            className="rounded-md bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-3 py-1 transition cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
                          >
                            Agregar
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          {/* Paginación */}
          {!loading && productos.length > 0 && pagination.totalPages > 1 && (
            <div className="bg-white rounded-lg shadow p-4">
              <Pagination
                currentPage={pagination.currentPage}
                totalPages={pagination.totalPages}
                onPageChange={setCurrentPage}
                itemsPerPage={pagination.itemsPerPage}
                onItemsPerPageChange={(newItemsPerPage) => {
                  setItemsPerPage(newItemsPerPage);
                  setCurrentPage(1);
                }}
              />
            </div>
          )}
        </div>
        <PagoModal
          show={showPagoModal}
          handleClose={() => setShowPagoModal(false)}
          cajaAperturada={cajaAperturada}
          usuario={user}
        />

        <InvoicePrintModal
          show={showInvoicePrintModal}
          onClose={() => setShowInvoicePrintModal(false)}
        />
      </div>
      <PaymentModalMayorista
        show={showModal}
        handleClose={() => setShowModal(false)}
        tipoVenta={tipoVenta}
        totalCost={total}
        totalRest={totalRest}
        setTotalRest={setTotalRest}
        efectivo={efectivo}
        setEfectivo={setEfectivo}
        setPrintTicket={setPrintTicket}
        printTicket={printTicket}
        banco={banco}
        setBanco={setBanco}
        bancoDebito={bancoDebito}
        setBancoDebito={setBancoDebito}
        bancoCredito={bancoCredito}
        setBancoCredito={setBancoCredito}
        cuentaCliente={cuentaCliente}
        setCuentaCliente={setCuentaCliente}
        sendRequest={sendRequest}
        voucher={voucher}
        setVoucher={setVoucher}
        ventaNroPOS={ventaNroPOS}
        setVentaNroPOS={setVentaNroPOS}
      />
    </div>
  );
}
