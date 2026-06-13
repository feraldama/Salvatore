/**
 * Calcula el Dígito Verificador (DV) del RUC paraguayo.
 * Algoritmo Módulo 11 del SET Paraguay.
 * Retorna el DV como string, o "" si la cédula es inválida.
 */
export const calcularDV = (cedula: string): string => {
  const num = cedula.replace(/\D/g, "");
  if (!num || num === "0") return "";
  const pesos = [2, 3, 4, 5, 6, 7, 8, 9];
  let suma = 0;
  for (let i = 0; i < num.length; i++) {
    const peso = pesos[(num.length - 1 - i) % pesos.length];
    suma += parseInt(num[i]) * peso;
  }
  const resto = suma % 11;
  if (resto === 0) return "0";
  if (resto === 1) return "1";
  return String(11 - resto);
};

export const formatMiles = (value: number | string): string => {
  const parseToNumber = (value: number | string): number => {
    if (typeof value === "string") {
      return parseFloat(value.replace(/\./g, "").replace(",", "."));
    }
    return value;
  };
  const commission = parseToNumber(value);
  const roundedCommission = Math.round(commission);
  return new Intl.NumberFormat("es-ES", {
    minimumFractionDigits: 0,
    useGrouping: true,
  }).format(roundedCommission);
};

export const formatMilesWithDecimals = (value: number | string): string => {
  const parseToNumber = (value: number | string): number => {
    if (typeof value === "string") {
      // Si el string ya es un número válido, úsalo directamente
      if (/^\d+\.?\d*$/.test(value) && value.includes(".")) {
        return parseFloat(value);
      }
      // Si tiene formato español con comas como decimales
      return parseFloat(value.replace(/\./g, "").replace(",", "."));
    }
    return value;
  };
  const commission = parseToNumber(value);
  return new Intl.NumberFormat("es-ES", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: true,
  }).format(commission);
};

export const formatCurrency = (value: number) => {
  return new Intl.NumberFormat("es-PY", {
    style: "currency",
    currency: "PYG",
  }).format(value);
};

// ── Fechas ───────────────────────────────────────────────────────────────────
// Regla del proyecto: TODA fecha mostrada al usuario va en dd/mm/aaaa.
// Para strings ISO de fecha pura ("aaaa-mm-dd") y datetime ("aaaa-mm-ddTHH:mm…")
// se parsean los componentes del string en vez de usar new Date(), así se evita
// el desfase de zona horaria (PY = UTC-4). El backend ya guarda la hora local.

type FechaInput = string | number | Date | null | undefined;

const pad2 = (n: number) => String(n).padStart(2, "0");

// Extrae {y, mo, d, hh, mi} de un string ISO-ish; null si no matchea.
const partesISO = (s: string) => {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
  return m
    ? { y: m[1], mo: m[2], d: m[3], hh: m[4] as string | undefined, mi: m[5] as string | undefined }
    : null;
};

// dd/mm/aaaa
export const formatFecha = (value: FechaInput): string => {
  if (value == null || value === "") return "";
  if (typeof value === "string") {
    const p = partesISO(value);
    if (p) return `${p.d}/${p.mo}/${p.y}`;
    const d = new Date(value);
    if (isNaN(d.getTime())) return value;
    return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
  }
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return "";
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
};

// dd/mm/aaaa HH:mm (si el dato no trae hora, cae a dd/mm/aaaa)
export const formatFechaHora = (value: FechaInput): string => {
  if (value == null || value === "") return "";
  if (typeof value === "string") {
    const p = partesISO(value);
    if (p) {
      return p.hh != null
        ? `${p.d}/${p.mo}/${p.y} ${p.hh}:${p.mi}`
        : `${p.d}/${p.mo}/${p.y}`;
    }
    const d = new Date(value);
    if (isNaN(d.getTime())) return value;
    return `${formatFecha(d)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return "";
  return `${formatFecha(d)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};

// Interfaz para los items del carrito
export interface CarritoItem {
  nombre: string;
  cantidad: number;
  precio: number;
}

// Interfaz para el cliente
export interface ClientePresupuesto {
  ClienteNombre: string;
  ClienteApellido: string;
}

import { loadPdf } from "./lazyPdf";

import Swal from "sweetalert2";

// Función para generar PDF de presupuesto
export const generatePresupuestoPDF = async (
  carrito: CarritoItem[],
  cliente?: ClientePresupuesto
) => {
  // Mostrar modal para ingresar observación
  const { value: observacion } = await Swal.fire({
    title: "Agregar Observación",
    input: "textarea",
    inputLabel: "Observación (opcional):",
    inputPlaceholder: "Escriba aquí la observación...",
    showCancelButton: true,
    confirmButtonText: "Generar PDF",
    cancelButtonText: "Cancelar",
    inputValidator: () => {
      // La observación es opcional, no hay validación
      return null;
    },
  });

  // Si el usuario canceló, no generar el PDF
  if (observacion === undefined) {
    return;
  }

  const { jsPDF, autoTable } = await loadPdf();
  const doc = new jsPDF();
  const clienteNombre = cliente
    ? `${cliente.ClienteNombre} ${cliente.ClienteApellido}`.trim()
    : "SIN NOMBRE";

  // Agregar logo en la esquina superior derecha
  const logo = new Image();
  logo.src = "/src/assets/img/logo.jpg";
  doc.addImage(logo, "JPEG", 165, 10, 20, 20);

  // Agregar fecha y hora actual
  const fechaActual = new Date();
  const dia = String(fechaActual.getDate()).padStart(2, "0");
  const mes = String(fechaActual.getMonth() + 1).padStart(2, "0");
  const año = fechaActual.getFullYear();
  const horas = String(fechaActual.getHours()).padStart(2, "0");
  const minutos = String(fechaActual.getMinutes()).padStart(2, "0");
  const segundos = String(fechaActual.getSeconds()).padStart(2, "0");

  const fechaFormateada = `${dia}/${mes}/${año}`;
  const horaFormateada = `${horas}:${minutos}:${segundos}`;

  doc.setFontSize(22);
  doc.text("Presupuesto", 14, 20);
  doc.setFontSize(14);
  doc.text(`Fecha:    ${fechaFormateada} - Hora: ${horaFormateada}`, 14, 30);
  doc.setFontSize(14);
  doc.text(`Cliente:    ${clienteNombre}`, 14, 40);

  // Tabla de productos
  const headers = [["Producto", "Cantidad", "Precio Unitario", "Total"]];
  const body = carrito.map((item) => [
    item.nombre,
    String(item.cantidad),
    `Gs. ${item.precio.toLocaleString()}`,
    `Gs. ${(item.precio * item.cantidad).toLocaleString()}`,
  ]);

  autoTable(doc, {
    head: headers,
    body: body,
    startY: 45,
    headStyles: {
      fillColor: [41, 128, 185],
      textColor: 255,
      fontStyle: "bold",
    },
    bodyStyles: { fontSize: 12 },
    styles: { cellPadding: 2 },
    theme: "grid",
    margin: { left: 14, right: 14 },
  });

  // Calcular total
  const subtotal = carrito.reduce(
    (acc, item) => acc + item.precio * item.cantidad,
    0
  );
  const finalY =
    (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable
      ?.finalY || 60;

  // Agregar observación si existe
  if (observacion && observacion.trim()) {
    doc.setFontSize(12);
    doc.text("Observación:", 14, finalY + 8);
    doc.setFontSize(12);
    // Dividir la observación en líneas si es muy larga
    const maxWidth = 180; // Ancho máximo del texto
    const lines = doc.splitTextToSize(observacion.trim(), maxWidth);
    doc.text(lines, 14, finalY + 14);

    // Ajustar la posición del total según si hay observación
    const observacionHeight = lines.length * 5; // Altura aproximada de las líneas
    doc.setFontSize(16);
    doc.text(
      `Total: Gs. ${subtotal.toLocaleString()}`,
      14,
      finalY + 12 + observacionHeight + 8
    );
  } else {
    // Si no hay observación, mostrar el total directamente
    doc.setFontSize(16);
    doc.text(`Total: Gs. ${subtotal.toLocaleString()}`, 14, finalY + 16);
  }

  doc.save("presupuesto.pdf");
};
