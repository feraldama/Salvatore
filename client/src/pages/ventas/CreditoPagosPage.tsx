import { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { recibirPagoCredito } from "../../services/venta.service";
import { usePermiso } from "../../hooks/usePermiso";
import { PermissionDenied } from "../../components/common/ui";
import Swal from "sweetalert2";
import { getAllClientesSinPaginacion } from "../../services/clientes.service";
import { formatCurrency, formatMiles, formatFecha } from "../../utils/utils";
import { getVentasPendientesPorCliente } from "../../services/venta.service";
import { useAuth } from "../../contexts/useAuth";
import { getEstadoAperturaPorUsuario } from "../../services/registrodiariocaja.service";
import { getCajaById } from "../../services/cajas.service";

interface Cliente {
  ClienteId: number;
  ClienteNombre: string;
  ClienteApellido: string;
  ClienteRUC?: string;
}

interface VentaPendiente {
  VentaId: number;
  VentaFecha: string;
  Total: number;
  VentaEntrega: number;
  Saldo: number;
}

import type { Caja } from "../../types";

// Medios de cobro por empresa (pedido del cliente): en la Distribuidora
// (mayorista, tipo 'D') no se usa POS — solo contado o transferencia; en la
// Bodega (minorista, tipo 'M') no se usa transferencia — solo contado o POS.
// "Crédito" no aplica acá: esta pantalla cobra créditos, no los genera.
const TIPOS_PAGO = [
  { value: "CO", label: "Contado", empresas: ["D", "M"] },
  { value: "PO", label: "POS", empresas: ["M"] },
  { value: "TR", label: "Transfer", empresas: ["D"] },
];

const CreditoPagosPage = () => {
  const puedeLeerPagos = usePermiso("COBROCREDITO", "leer");
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [selectedCliente, setSelectedCliente] = useState<string>("");
  // Buscador del selector de cliente (mismo patrón que el reporte de ventas
  // por cliente): texto escrito + si la lista está abierta + opción resaltada.
  const [clienteBusqueda, setClienteBusqueda] = useState<string>("");
  const [clienteListaAbierta, setClienteListaAbierta] = useState(false);
  const [clienteHighlight, setClienteHighlight] = useState(0);
  const clienteHighlightRef = useRef<HTMLLIElement | null>(null);
  const [ventasPendientes, setVentasPendientes] = useState<VentaPendiente[]>(
    []
  );
  const [tipoPago, setTipoPago] = useState<string>("CO");
  const [montoPago, setMontoPago] = useState<number>(0);
  const [fecha, setFecha] = useState<string>(
    new Date().toISOString().split("T")[0]
  );
  const [totalDeuda, setTotalDeuda] = useState<number>(0);
  const { user, empresaActiva } = useAuth();
  const navigate = useNavigate();
  const [cajaAperturada, setCajaAperturada] = useState<Caja | null>(null);

  // Tipo de la empresa con la que se opera: la activa del switcher (admins) o
  // la del usuario (regulares). Determina qué medios de cobro se ofrecen.
  const empresaTipo = empresaActiva?.EmpresaTipo ?? user?.EmpresaTipo ?? "";
  const tiposPagoDisponibles = useMemo(
    () =>
      empresaTipo
        ? TIPOS_PAGO.filter((t) => t.empresas.includes(empresaTipo))
        : TIPOS_PAGO,
    [empresaTipo]
  );

  // Si al cambiar de empresa el medio elegido deja de estar disponible
  // (ej. POS en la Distribuidora), volver a Contado.
  useEffect(() => {
    if (!tiposPagoDisponibles.some((t) => t.value === tipoPago)) {
      setTipoPago("CO");
    }
  }, [tiposPagoDisponibles, tipoPago]);

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
            text: "Debes aperturar una caja antes de registrar un pago.",
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
    const cargarClientes = async () => {
      try {
        const response = await getAllClientesSinPaginacion();
        const todosLosClientes = response.data || [];

        // Separar el cliente con ID 1 del resto
        const clienteId1 = todosLosClientes.find(
          (c: Cliente) => c.ClienteId === 1
        );
        const otrosClientes = todosLosClientes.filter(
          (c: Cliente) => c.ClienteId !== 1
        );

        // Ordenar el resto alfabéticamente por nombre
        const clientesOrdenados = otrosClientes.sort((a: Cliente, b: Cliente) =>
          a.ClienteNombre.localeCompare(b.ClienteNombre)
        );

        // Combinar el cliente ID 1 con el resto ordenado
        const clientesFinales = clienteId1
          ? [clienteId1, ...clientesOrdenados]
          : clientesOrdenados;

        setClientes(clientesFinales);
      } catch (error) {
        console.error("Error al cargar clientes:", error);
      }
    };

    cargarClientes();
  }, []);

  // Mantener visible la opción resaltada al navegar con las flechas.
  useEffect(() => {
    clienteHighlightRef.current?.scrollIntoView({ block: "nearest" });
  }, [clienteHighlight]);

  // Clientes que matchean el texto del buscador (por nombre, apellido o RUC).
  const clientesFiltrados = useMemo(() => {
    const q = clienteBusqueda.trim().toLowerCase();
    if (!q) return clientes;
    return clientes.filter((c) =>
      `${c.ClienteNombre} ${c.ClienteApellido} ${c.ClienteRUC ?? ""}`
        .toLowerCase()
        .includes(q)
    );
  }, [clientes, clienteBusqueda]);

  // Etiqueta visible de un cliente en el buscador (nombre + RUC si tiene).
  const etiquetaCliente = (c: Cliente): string =>
    `${c.ClienteNombre} ${c.ClienteApellido}${
      c.ClienteRUC ? ` - ${c.ClienteRUC}` : ""
    }`.trim();

  // Opciones del buscador. El índice en este array es el que navegan las
  // flechas (clienteHighlight).
  const opcionesCliente: { id: string; label: string }[] = clientesFiltrados.map(
    (c) => ({
      id: String(c.ClienteId),
      label: etiquetaCliente(c),
    })
  );

  // Confirma la selección del cliente desde el buscador.
  const seleccionarCliente = (id: string, label: string) => {
    setClienteBusqueda(label);
    setClienteListaAbierta(false);
    handleClienteChange(id);
  };

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

  const handleClienteChange = async (clienteId: string) => {
    setSelectedCliente(clienteId);
    setVentasPendientes([]);
    setTotalDeuda(0);

    if (!clienteId) {
      return;
    }

    try {
      const response = await getVentasPendientesPorCliente(Number(clienteId));
      const ventasPendientes = response.data || [];

      // Calcular el total de la deuda asegurando que los valores sean números
      const totalDeuda = ventasPendientes.reduce(
        (sum: number, venta: VentaPendiente) => sum + Number(venta.Saldo),
        0
      );

      setVentasPendientes(ventasPendientes);
      setTotalDeuda(totalDeuda);
    } catch (error) {
      console.error("Error al cargar ventas pendientes:", error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCliente) {
      Swal.fire("Error", "Seleccione un cliente.", "error");
      return;
    }
    if (montoPago <= 0) {
      Swal.fire("Error", "Ingrese un monto a cobrar", "error");
      return;
    }
    if (montoPago > totalDeuda) {
      Swal.fire(
        "Error",
        "El monto a cobrar no puede ser mayor al saldo total",
        "error"
      );
      return;
    }
    if (!cajaAperturada) {
      Swal.fire("Error", "No hay una caja aperturada.", "error");
      return;
    }

    try {
      await recibirPagoCredito({
        Tipo: "V",
        ClienteId: Number(selectedCliente),
        MontoRecibido: montoPago,
        CajaId: Number(cajaAperturada.CajaId),
        UsuarioId: String(user?.id ?? ""),
        Fecha: fecha,
        VentaPagoTipo: tipoPago as "CO" | "PO" | "TR",
      });

      let timerInterval: ReturnType<typeof setInterval>;
      Swal.fire({
        title: "Pago cargado con éxito!",
        html: "Actualizando en <b></b> segundos.",
        timer: 2000,
        timerProgressBar: true,
        width: "90%",
        allowOutsideClick: false,
        allowEscapeKey: false,
        didOpen: () => {
          Swal.showLoading();
          const popup = Swal.getPopup();
          if (popup) {
            const timer = popup.querySelector("b");
            if (timer) {
              timerInterval = setInterval(() => {
                const timerLeft = Swal.getTimerLeft();
                const secondsLeft = timerLeft ? Math.ceil(timerLeft / 1000) : 0;
                timer.textContent = `${secondsLeft}`;
              }, 100);
            }
          }
        },
        willClose: () => {
          clearInterval(timerInterval);
        },
      }).then((result) => {
        if (result.dismiss === Swal.DismissReason.timer) {
          handleClienteChange(selectedCliente);
          setMontoPago(0);
        }
      });
    } catch (error) {
      console.error("Error al procesar el pago:", error);
      Swal.fire("Error", "Hubo un problema al procesar el pago.", "error");
    }
  };

  if (!puedeLeerPagos)
    return <PermissionDenied resource="el cobro de créditos" />;

  return (
    <div className="container mx-auto px-4">
      <h1 className="text-2xl font-medium mb-3">Cobro de Créditos</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Formulario de pago */}
        <div className="bg-white p-6 rounded-lg shadow-md">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative">
              <label className="block text-sm font-medium text-gray-700">
                Cliente
              </label>
              <input
                type="text"
                value={clienteBusqueda}
                placeholder="Escribí para buscar un cliente"
                onChange={(e) => {
                  setClienteBusqueda(e.target.value);
                  setClienteListaAbierta(true);
                  setClienteHighlight(0);
                  // Al editar el texto se invalida la selección anterior para
                  // no cobrarle a un cliente distinto del que muestra el input.
                  if (selectedCliente) {
                    setSelectedCliente("");
                    setVentasPendientes([]);
                    setTotalDeuda(0);
                  }
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
                className="mt-1 block w-full h-10 px-3 rounded-md border-gray-300 shadow-sm focus:border-green-500 focus:ring-green-500"
              />
              {clienteListaAbierta && (
                <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-md border border-gray-200 bg-white shadow-lg text-sm">
                  {opcionesCliente.map((op, idx) => {
                    const activo = idx === clienteHighlight;
                    return (
                      <li
                        key={op.id}
                        ref={activo ? clienteHighlightRef : null}
                        onMouseDown={() => seleccionarCliente(op.id, op.label)}
                        onMouseEnter={() => setClienteHighlight(idx)}
                        className={`px-3 py-2 cursor-pointer ${
                          activo ? "bg-green-100" : "hover:bg-gray-100"
                        }`}
                      >
                        {op.label}
                      </li>
                    );
                  })}
                  {opcionesCliente.length === 0 && clienteBusqueda.trim() && (
                    <li className="px-3 py-2 text-gray-400">Sin resultados</li>
                  )}
                </ul>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Fecha
              </label>
              <input
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="mt-1 block w-full h-10 rounded-md border-gray-300 shadow-sm focus:border-green-500 focus:ring-green-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Tipo de Pago
              </label>
              <select
                value={tipoPago}
                onChange={(e) => setTipoPago(e.target.value)}
                className="mt-1 block w-full h-10 rounded-md border-gray-300 shadow-sm focus:border-green-500 focus:ring-green-500"
              >
                {tiposPagoDisponibles.map((tipo) => (
                  <option key={tipo.value} value={tipo.value}>
                    {tipo.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Monto a Cobrar
              </label>
              <input
                type="text"
                value={montoPago ? formatMiles(montoPago) : ""}
                onChange={(e) => {
                  const raw = e.target.value
                    .replace(/\./g, "")
                    .replace(/\s/g, "");
                  const num = Number(raw);
                  if (!isNaN(num)) setMontoPago(num);
                }}
                className="mt-1 block w-full h-10 rounded-md border-gray-300 shadow-sm focus:border-green-500 focus:ring-green-500"
                placeholder="0"
              />
            </div>

            <div className="pt-4 border-t">
              <p className="text-lg font-semibold text-gray-700">
                Total Deuda: {formatCurrency(totalDeuda)}
              </p>
            </div>

            <button
              type="submit"
              className="w-full bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
            >
              CARGAR PAGO
            </button>
          </form>
        </div>

        {/* Tabla de ventas pendientes */}
        <div className="bg-white p-6 rounded-lg shadow-md overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Venta Id
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Fecha
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Total
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Entrega
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Saldo
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {ventasPendientes.map((venta) => (
                <tr key={venta.VentaId}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {venta.VentaId}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {formatFecha(venta.VentaFecha)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                    {formatCurrency(venta.Total)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                    {formatCurrency(venta.VentaEntrega)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                    {formatCurrency(venta.Saldo)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default CreditoPagosPage;
