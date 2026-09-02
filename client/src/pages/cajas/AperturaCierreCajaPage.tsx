import { useEffect, useState } from "react";
import { getCajas } from "../../services/cajas.service";
import ActionButton from "../../components/common/Button/ActionButton";
import { LoadingState, PermissionDenied } from "../../components/common/ui";
import { usePermiso } from "../../hooks/usePermiso";
import {
  aperturaCierreCaja,
  getEstadoAperturaPorUsuario,
} from "../../services/registrodiariocaja.service";
import { useAuth } from "../../contexts/useAuth";
import Swal from "sweetalert2";
import { formatMiles, formatFecha } from "../../utils/utils";
import { useNavigate, useLocation } from "react-router-dom";
import { loadPdf } from "../../utils/lazyPdf";
import { getRegistrosDiariosCaja } from "../../services/registros.service";

import type { Caja } from "../../types";

interface RegistroDiarioCaja {
  RegistroDiarioCajaId: number;
  CajaId: number;
  UsuarioId: string;
  RegistroDiarioCajaFecha: string;
  RegistroDiarioCajaMonto: number;
  TipoGastoId: number;
  TipoGastoGrupoId: number;
}

export default function AperturaCierreCajaPage() {
  const [tipo, setTipo] = useState<"0" | "1">("0");
  const [tipoDisabled, setTipoDisabled] = useState(false);
  const [cajas, setCajas] = useState<Caja[]>([]);
  const [cajaId, setCajaId] = useState<string | number>("");
  const [monto, setMonto] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { user, empresaActiva } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [cajaDisabled, setCajaDisabled] = useState(false);
  const [registrosCaja, setRegistrosCaja] = useState<RegistroDiarioCaja[]>([]);
  const [descargarPDF, setDescargarPDF] = useState(false);
  const [operacionCompletada, setOperacionCompletada] = useState(false);

  useEffect(() => {
    const fetchCajas = async () => {
      try {
        setLoading(true);
        const data = await getCajas(1, 100);
        setCajas(data.data);
        // No establecer caja por defecto, el usuario debe seleccionar
      } catch {
        setError("Error al cargar cajas");
      } finally {
        setLoading(false);
      }
    };
    fetchCajas();
  }, []);

  useEffect(() => {
    // Lógica para detectar si el usuario tiene una caja aperturada
    const checkCajaAperturada = async () => {
      if (!user) return;
      try {
        const data = await getEstadoAperturaPorUsuario(user.id);
        // Si apertura > cierre, forzar cierre y deshabilitar el select de tipo y de caja
        if (data.aperturaId > data.cierreId) {
          setTipo("1"); // Cierre
          setTipoDisabled(true);
          setCajaDisabled(true); // Solo puede cerrar la caja que tiene abierta
          if (data.cajaId) setCajaId(data.cajaId);
        } else {
          // No tiene ninguna caja abierta, forzar apertura y deshabilitar solo el select de tipo
          setTipo("0");
          setTipoDisabled(true);
          setCajaDisabled(false); // Puede elegir la caja que desee
        }
      } catch {
        // Si hay error, no forzar nada
      }
    };
    checkCajaAperturada();
  }, [user, location.pathname]);

  useEffect(() => {
    if (error) {
      Swal.fire({
        icon: "warning",
        title: "Aviso",
        text: error,
        confirmButtonColor: "#2563eb",
      });
      setError(null);
    }
  }, [error]);

  // Obtener registros de la caja al cerrar
  const fetchRegistrosCaja = async () => {
    try {
      // Traer todos los registros sin filtrar primero
      const data = await getRegistrosDiariosCaja(1, 1000, undefined, "desc");

      // Filtrar por caja y usuario
      const registrosFiltrados = data.data.filter(
        (r: RegistroDiarioCaja) =>
          r.CajaId == cajaId && r.UsuarioId === user?.id
      );

      setRegistrosCaja(registrosFiltrados);
    } catch (error) {
      console.error("Error al cargar registros:", error);
      setRegistrosCaja([]);
    }
  };

  // Función para generar el PDF
  async function generarResumenCierrePDF(
    registrosPasados?: RegistroDiarioCaja[]
  ) {
    if (!user || !cajaId) return;

    // Usar registros pasados como parámetro o cargar nuevos si no se proporcionan
    let registrosParaUsar = registrosPasados || registrosCaja;

    if (registrosParaUsar.length === 0) {
      try {
        const data = await getRegistrosDiariosCaja(1, 1000, undefined, "desc");
        const registrosFiltrados = data.data.filter(
          (r: RegistroDiarioCaja) =>
            r.CajaId == cajaId && r.UsuarioId === user?.id
        );
        registrosParaUsar = registrosFiltrados;

        if (registrosParaUsar.length === 0) {
          Swal.fire({
            icon: "warning",
            title: "No hay registros",
            text: "No se han cargado los registros de caja. Intente descargar el PDF manualmente.",
            confirmButtonColor: "#2563eb",
          });
          return;
        }
      } catch (error) {
        console.error("Error al cargar registros para PDF:", error);
        Swal.fire({
          icon: "warning",
          title: "Error al cargar registros",
          text: "No se pudieron cargar los registros de caja.",
          confirmButtonColor: "#2563eb",
        });
        return;
      }
    }

    const cajaDescripcion =
      cajas.find((c) => c.CajaId == cajaId)?.CajaDescripcion || "";
    const fecha = formatFecha(new Date());
    const hora = new Date().toLocaleTimeString("es-PY");

    // --- Nueva lógica: buscar última apertura y cierre del usuario ---
    const registros = registrosParaUsar.filter((r) => r.UsuarioId == user.id);

    // Buscar la última apertura del usuario (ordenar por ID descendente y tomar el primero)
    const aperturas = registros
      .filter((reg) => reg.TipoGastoId === 2 && reg.TipoGastoGrupoId === 2)
      .sort((a, b) => b.RegistroDiarioCajaId - a.RegistroDiarioCajaId);

    const aperturaReg = aperturas[0];
    if (!aperturaReg) {
      Swal.fire({
        icon: "warning",
        title: "No se encontró apertura",
        text: "No se encontró una apertura de caja para este usuario. Los registros pueden estar en proceso de carga.",
        confirmButtonColor: "#2563eb",
      });
      return;
    }

    // Buscar el último cierre del usuario (ordenar por ID descendente y tomar el primero)
    const cierres = registros
      .filter((reg) => reg.TipoGastoId === 1 && reg.TipoGastoGrupoId === 2)
      .sort((a, b) => b.RegistroDiarioCajaId - a.RegistroDiarioCajaId);

    const cierreReg = cierres[0];
    if (!cierreReg) {
      Swal.fire({
        icon: "warning",
        title: "No se encontró cierre",
        text: "No se encontró un cierre de caja para este usuario.",
        confirmButtonColor: "#2563eb",
      });
      return;
    }

    // Verificar que el cierre sea posterior a la apertura
    if (cierreReg.RegistroDiarioCajaId <= aperturaReg.RegistroDiarioCajaId) {
      Swal.fire({
        icon: "warning",
        title: "Error en registros",
        text: "El cierre debe ser posterior a la apertura. Verifique los registros.",
        confirmButtonColor: "#2563eb",
      });
      return;
    }

    // Filtrar los registros entre apertura y cierre (inclusive)
    const registrosFiltrados = registrosParaUsar.filter(
      (reg) =>
        reg.UsuarioId == user.id &&
        reg.RegistroDiarioCajaId >= aperturaReg.RegistroDiarioCajaId &&
        reg.RegistroDiarioCajaId <= cierreReg.RegistroDiarioCajaId
    );
    // Calcular totales
    const apertura = aperturaReg.RegistroDiarioCajaMonto;
    const cierre = cierreReg.RegistroDiarioCajaMonto;
    // Acumuladores por grupo de ingreso. Cada empresa arma su ticket con ellos:
    //   - Mayorista (EmpresaTipo 'D'): layout del sistema anterior — Ingresos
    //     (efectivo con apertura), Ingresos POS (todo lo no-efectivo, mostrador
    //     y envíos) e Ingresos ENVIOS (efectivo del móvil, grupo 7).
    //   - Minorista: desglose por método (Efectivo/POS/Voucher/Transfer/crédito)
    //     con Total Ingresos/Egresos y Diferencia.
    let egresos = 0;
    // Efectivo que entra a la caja física: venta contado (1) y la seña/cobro
    // de venta a crédito (3).
    let ingresos = 0;
    let ingresosPOS = 0; // grupo 4
    let ingresosVoucher = 0; // grupo 5
    let ingresosTransfer = 0; // grupo 6
    // Efectivo cobrado por el móvil en envíos (grupo 7): NO entra a la caja.
    let ingresosEnvios = 0;
    // POS/voucher/transferencia de envíos (grupos 8-10).
    let ingresosEnviosNoEfectivo = 0;
    // Saldo vendido a crédito (grupo 11): informativo, no es dinero recibido.
    let ingresosCuentaCorriente = 0;
    // Costo de delivery cobrado en la sesión (grupo 12, informativo): ya está
    // incluido en los ingresos de arriba, solo se desglosa cuánto fue envío.
    let costoDeliveryTotal = 0;
    let costoDeliveryCant = 0;
    for (const reg of registrosFiltrados) {
      if (reg.TipoGastoId !== 2 && reg.TipoGastoId !== 1) continue;
      if (reg.TipoGastoId === 1) {
        if (reg.TipoGastoGrupoId !== 2) egresos += reg.RegistroDiarioCajaMonto;
        continue;
      }
      switch (reg.TipoGastoGrupoId) {
        case 1:
        case 3:
          ingresos += reg.RegistroDiarioCajaMonto;
          break;
        case 4:
          ingresosPOS += reg.RegistroDiarioCajaMonto;
          break;
        case 5:
          ingresosVoucher += reg.RegistroDiarioCajaMonto;
          break;
        case 6:
          ingresosTransfer += reg.RegistroDiarioCajaMonto;
          break;
        case 7:
          ingresosEnvios += reg.RegistroDiarioCajaMonto;
          break;
        case 8:
        case 9:
        case 10:
          ingresosEnviosNoEfectivo += reg.RegistroDiarioCajaMonto;
          break;
        case 11:
          ingresosCuentaCorriente += reg.RegistroDiarioCajaMonto;
          break;
        case 12:
          costoDeliveryTotal += reg.RegistroDiarioCajaMonto;
          costoDeliveryCant += 1;
          break;
      }
    }
    const sobranteFaltante = ingresos + apertura - (cierre + egresos);
    let txtSobranteFaltante = "";
    if (sobranteFaltante > 0) {
      txtSobranteFaltante = `Faltante de: Gs. ${formatMiles(sobranteFaltante)}`;
    } else if (sobranteFaltante < 0) {
      txtSobranteFaltante = `Sobrante de: Gs. ${formatMiles(
        Math.abs(sobranteFaltante)
      )}`;
    } else {
      txtSobranteFaltante = `Sobrante/Faltante: Gs. 0`;
    }
    // Etiqueta del crédito según el tipo de empresa: 'D' (distribuidora) cobra
    // a "Cuenta Corriente"; minorista lo llama "Cuenta de Cliente".
    const tipoEmpresa =
      user.isAdmin === "S"
        ? empresaActiva?.EmpresaTipo ?? user.EmpresaTipo
        : user.EmpresaTipo;
    const etiquetaCredito =
      tipoEmpresa === "D" ? "Cuenta Corriente" : "Cuenta de Cliente";

    // --- Generar PDF ---
    // Mayorista (distribuidora): layout del ticket del sistema anterior.
    // Minorista: layout desglosado por método de pago (formato previo).
    const esMayorista = tipoEmpresa === "D";
    const { jsPDF } = await loadPdf();
    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: [80, 200], // 80mm de ancho, 200mm de alto
    });
    doc.setFontSize(16);
    doc.text("RESUMEN CIERRE CAJA", 40, 15, { align: "center" });
    doc.setFontSize(11);
    doc.text(`Fecha: ${fecha} - Hora: ${hora}`, 10, 30);
    doc.text(`Usuario: ${user.nombre}`, 10, 38);
    doc.text(`Caja: ${cajaDescripcion}`, 10, 46);
    doc.line(10, 50, 200, 50);
    let y = 58;
    doc.text(`Apertura: ${formatMiles(apertura)}`, 10, y);
    y += 8;
    doc.text(`Cierre: ${formatMiles(cierre)}`, 10, y);
    y += 8;
    doc.line(10, y, 200, y);
    y += 8;
    if (esMayorista) {
      doc.text(`Egresos: ${formatMiles(egresos)}`, 10, y);
      y += 8;
      // "Ingresos" del ticket viejo: efectivo de la caja física CON la apertura
      // incluida. "Diferencia" = Ingresos - Egresos = efectivo que debería
      // haber en la caja al momento del cierre.
      doc.text(`Ingresos: ${formatMiles(apertura + ingresos)}`, 10, y);
      y += 8;
      doc.text(
        `Diferencia: ${formatMiles(apertura + ingresos - egresos)}`,
        10,
        y
      );
      y += 8;
      doc.line(10, y, 200, y);
      y += 8;
      // Todo lo no-efectivo junto (mostrador y envíos), como el sistema viejo.
      const posTotal =
        ingresosPOS +
        ingresosVoucher +
        ingresosTransfer +
        ingresosEnviosNoEfectivo;
      doc.text(`Ingresos POS: ${formatMiles(posTotal)}`, 10, y);
      y += 8;
      doc.line(10, y, 200, y);
      y += 8;
      doc.text(`Ingresos ENVIOS: ${formatMiles(ingresosEnvios)}`, 10, y);
      y += 8;
      doc.line(10, y, 200, y);
      y += 8;
      doc.text(txtSobranteFaltante, 10, y);
      y += 8;
      // Informativo (no entra al arqueo de efectivo): saldo fiado.
      if (ingresosCuentaCorriente > 0) {
        doc.text(
          `${etiquetaCredito}: ${formatMiles(ingresosCuentaCorriente)}`,
          10,
          y
        );
        y += 8;
      }
      y += 4;
    } else {
      // Layout minorista: desglose por método de pago.
      doc.text(`Egresos: ${formatMiles(egresos)}`, 10, y);
      y += 8;
      doc.line(10, y, 200, y);
      y += 8;
      doc.text(`Ingresos Efectivo: ${formatMiles(ingresos)}`, 10, y);
      y += 8;
      doc.text(`Ingresos POS: ${formatMiles(ingresosPOS)}`, 10, y);
      y += 8;
      doc.text(`Ingresos Voucher: ${formatMiles(ingresosVoucher)}`, 10, y);
      y += 8;
      doc.text(`Ingresos Transfer: ${formatMiles(ingresosTransfer)}`, 10, y);
      y += 8;
      // Ventas a crédito (cuenta corriente / cuenta de cliente).
      doc.text(
        `Ingresos ${etiquetaCredito}: ${formatMiles(ingresosCuentaCorriente)}`,
        10,
        y
      );
      y += 8;
      doc.line(10, y, 200, y);
      y += 8;
      const totalIngresos =
        ingresos +
        ingresosPOS +
        ingresosVoucher +
        ingresosTransfer +
        ingresosCuentaCorriente;
      doc.text(`Total Ingresos: ${formatMiles(totalIngresos)}`, 10, y);
      y += 8;
      // Costo de delivery cobrado (informativo: ya incluido en los ingresos).
      if (costoDeliveryTotal > 0) {
        doc.text(
          `(incl.) Costo delivery (${costoDeliveryCant}): ${formatMiles(
            costoDeliveryTotal
          )}`,
          10,
          y
        );
        y += 8;
      }
      doc.text(`Total Egresos: ${formatMiles(egresos)}`, 10, y);
      y += 8;
      const diferencia = totalIngresos - egresos;
      doc.text(`Diferencia: ${formatMiles(diferencia)}`, 10, y);
      y += 8;
      doc.line(10, y, 200, y);
      y += 8;
      doc.text(txtSobranteFaltante, 10, y);
      y += 12;
    }
    doc.text("--GRACIAS POR SU PREFERENCIA--", 10, y);

    // Generar el PDF y abrirlo automáticamente
    const pdfBlob = doc.output("blob");
    const pdfUrl = URL.createObjectURL(pdfBlob);

    // Crear un enlace temporal para descargar el PDF
    const link = document.createElement("a");
    link.href = pdfUrl;
    link.download = `ResumenCierreCaja_${fecha.replace(/\//g, "-")}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Abrir el PDF automáticamente en una nueva pestaña
    setTimeout(() => {
      const openLink = document.createElement("a");
      openLink.href = pdfUrl;
      openLink.target = "_blank";
      document.body.appendChild(openLink);
      openLink.click();
      document.body.removeChild(openLink);
    }, 500);

    // Limpiar la URL del objeto después de un tiempo
    setTimeout(() => {
      URL.revokeObjectURL(pdfUrl);
    }, 2000);
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    setOperacionCompletada(true); // Deshabilitar el botón inmediatamente
    try {
      const result = await aperturaCierreCaja({
        apertura: tipo === "0" ? 0 : 1,
        CajaId: cajaId,
        Monto: monto,
      });
      if (tipo === "0") {
        await Swal.fire({
          icon: "success",
          title: "Apertura exitosa",
          text: result.message || "La caja se aperturó correctamente",
          confirmButtonText: "Ir a ventas",
          confirmButtonColor: "#2563eb",
        });
        navigate("/ventas");
      } else {
        setSuccess(result.message || "Operación realizada correctamente");
        await fetchRegistrosCaja();
        setDescargarPDF(true);
        // Descarga automática del PDF después de cargar registros
        setTimeout(async () => {
          await generarResumenCierrePDF();
        }, 2000); // Reducir el delay inicial
      }
    } catch (err) {
      setError(
        (err as { message?: string })?.message || "Error en la operación"
      );
      setOperacionCompletada(false); // Rehabilitar el botón si hay error
    } finally {
      setSubmitting(false);
    }
  };

  const puedeLeer = usePermiso("APERTURACAJA", "leer");
  if (!puedeLeer) return <PermissionDenied resource="la apertura/cierre de caja" />;
  if (loading) return <LoadingState message="Cargando cajas..." />;

  return (
    <div className="container mx-auto px-4 max-w-xl">
      <h1 className="text-2xl font-medium mb-6">Apertura/Cierre de Caja</h1>
      {user && (
        <div className="mb-4 p-3 bg-gray-100 rounded text-gray-700">
          <span className="font-semibold">Usuario:</span> {user.nombre} (
          {user.id})
          {tipoDisabled && cajaId && (
            <span className="ml-2 text-sm text-gray-600">
              | Caja:{" "}
              {cajas.find((c) => c.CajaId == cajaId)?.CajaDescripcion || ""}
            </span>
          )}
        </div>
      )}
      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-lg shadow p-6 space-y-6"
      >
        <div className="grid grid-cols-1 gap-6">
          <div>
            <label className="block mb-2 text-sm font-medium text-gray-900">
              Tipo de operación
            </label>
            <select
              className={`bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 ${
                tipoDisabled ? "bg-gray-200 text-gray-500" : ""
              }`}
              value={tipo}
              onChange={(e) => setTipo(e.target.value as "0" | "1")}
              required
              disabled={tipoDisabled}
            >
              <option value="0">Apertura</option>
              <option value="1">Cierre</option>
            </select>
          </div>
          <div>
            <label className="block mb-2 text-sm font-medium text-gray-900">
              Caja
            </label>
            <select
              className={`bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 ${
                cajaDisabled ? "bg-gray-200 text-gray-500" : ""
              }`}
              value={cajaId}
              onChange={(e) => setCajaId(e.target.value)}
              required
              disabled={cajaDisabled}
            >
              <option value="">Seleccione una caja</option>
              {cajas.map((caja) => (
                <option key={caja.CajaId} value={caja.CajaId}>
                  {caja.CajaDescripcion}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block mb-2 text-sm font-medium text-gray-900">
              {tipo === "1" ? "Monto de cierre" : "Monto de apertura"}
            </label>
            <input
              type="text"
              inputMode="numeric"
              className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5"
              value={monto ? formatMiles(monto) : ""}
              onChange={(e) => {
                const raw = e.target.value
                  .replace(/\./g, "")
                  .replace(/\s/g, "");
                const num = Number(raw);
                if (!isNaN(num)) setMonto(num);
              }}
              min={0}
              required
            />
          </div>
        </div>
        <div className="flex justify-end">
          <ActionButton
            onClick={handleSubmit}
            label="CONFIRMAR"
            disabled={submitting || operacionCompletada}
          />
        </div>
        {success && (
          <div className="text-green-600 text-center font-medium mt-2">
            {success}
          </div>
        )}
      </form>
      {success && tipo === "1" && descargarPDF && (
        <div className="flex justify-center mt-4">
          <ActionButton
            label="Descargar Resumen PDF"
            onClick={() => generarResumenCierrePDF()}
          />
        </div>
      )}
    </div>
  );
}
