import { useEffect, useState, useRef } from "react";
import { Button } from "../common/ui";
import { PlusIcon, TrashIcon } from "@heroicons/react/24/outline";
import { getAlmacenes } from "../../services/almacenes.service";
import { formatMiles, formatMilesWithDecimals } from "../../utils/utils";
import { comprimirImagenABase64 } from "../../utils/productImage";
import { useAuth } from "../../contexts/useAuth";

export interface ProductoAlmacenRow {
  AlmacenId: number;
  AlmacenNombre?: string;
  ProductoAlmacenStock: number;
  ProductoAlmacenStockUnitario: number;
}

export interface Producto {
  ProductoId?: number;
  ProductoCodigo: string;
  ProductoNombre: string;
  ProductoPrecioVenta: number;
  ProductoPrecioVentaMayorista?: number;
  ProductoPrecioUnitario?: number;
  ProductoPrecioPromedio?: number;
  ProductoStock: number;
  ProductoStockUnitario?: number;
  ProductoCantidadCaja?: number;
  ProductoIVA?: number;
  ProductoStockMinimo?: number;
  ProductoImagen?: string;
  ProductoImagen_GXI?: string;
  LocalId: number;
  /** 'A' = Activo, 'I' = dado de baja (oculto para la venta). */
  ProductoEstado?: string;
  productoAlmacen?: ProductoAlmacenRow[];
  [key: string]: unknown;
}

interface ProductoFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** null/undefined = alta de producto nuevo. */
  currentProduct?: Producto | null;
  onSubmit: (
    formData: Producto & { productoAlmacen?: ProductoAlmacenRow[] },
  ) => void;
  /**
   * Oculta el stock por almacén. Se usa al crear desde la pantalla de compras:
   * el stock lo carga la propia compra, y cargarlo también acá lo duplicaría.
   */
  ocultarStock?: boolean;
  /** Valores precargados al crear (ej. el nombre o código que se buscaba). */
  valoresIniciales?: Partial<Producto>;
}

// Formulario de alta/edición de producto. Lo usan la pantalla de productos y
// la de compras (para crear un producto sin salir de la compra en curso).
export default function ProductoFormModal({
  isOpen,
  onClose,
  currentProduct,
  onSubmit,
  ocultarStock = false,
  valoresIniciales,
}: ProductoFormModalProps) {
  const [formData, setFormData] = useState<Producto>({
    ProductoCodigo: "0",
    ProductoNombre: "",
    ProductoPrecioVenta: 0,
    ProductoPrecioVentaMayorista: 0,
    ProductoPrecioUnitario: 0,
    ProductoPrecioPromedio: 0,
    ProductoStock: 0,
    ProductoStockUnitario: 0,
    ProductoCantidadCaja: 1,
    ProductoIVA: 0,
    ProductoStockMinimo: 0,
    ProductoImagen: "",
    ProductoImagen_GXI: "",
    // El backend asigna el LocalId real (local primario de la empresa activa)
    // al crear; este valor es solo un placeholder para el estado del form.
    LocalId: 0,
  });
  const { empresaActiva } = useAuth();
  const [almacenes, setAlmacenes] = useState<
    { AlmacenId: number; AlmacenNombre: string }[]
  >([]);
  const [stockAlmacenes, setStockAlmacenes] = useState<ProductoAlmacenRow[]>(
    [],
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [precioCostoFocused, setPrecioCostoFocused] = useState(false);
  // Solo enviamos ProductoImagen si el usuario tocó la imagen en este modal.
  // Al editar, el form carga la imagen actual (varios MB en productos venidos
  // de GeneXus) y reenviarla en cada guardado disparaba 413 en el proxy.
  const [imagenTocada, setImagenTocada] = useState(false);

  useEffect(() => {
    getAlmacenes(1, 200).then((res) => {
      setAlmacenes(res.data ?? []);
    });
  }, []);

  useEffect(() => {
    if (currentProduct) {
      const cantidadCajaLoad = Math.max(
        1,
        Number(currentProduct.ProductoCantidadCaja) || 1,
      );
      setStockAlmacenes(
        (currentProduct.productoAlmacen ?? []).map((pa) => {
          const rawUnitario = Number(pa.ProductoAlmacenStockUnitario) || 0;
          const rawCajas = Number(pa.ProductoAlmacenStock) || 0;
          const cajasFromUnitario = Math.floor(rawUnitario / cantidadCajaLoad);
          const unitarioNorm = rawUnitario % cantidadCajaLoad;
          return {
            AlmacenId: pa.AlmacenId,
            AlmacenNombre: pa.AlmacenNombre,
            ProductoAlmacenStock: rawCajas + cajasFromUnitario,
            ProductoAlmacenStockUnitario: unitarioNorm,
          };
        }),
      );
      setFormData({
        ...currentProduct,
        ProductoPrecioVenta: currentProduct.ProductoPrecioVenta || 0,
        ProductoPrecioVentaMayorista:
          currentProduct.ProductoPrecioVentaMayorista || 0,
        ProductoPrecioUnitario: currentProduct.ProductoPrecioUnitario || 0,
        ProductoPrecioPromedio:
          typeof currentProduct.ProductoPrecioPromedio === "string"
            ? parseFloat(currentProduct.ProductoPrecioPromedio)
            : currentProduct.ProductoPrecioPromedio || 0,
        ProductoStock: currentProduct.ProductoStock || 0,
        ProductoStockUnitario: currentProduct.ProductoStockUnitario || 0,
        ProductoCantidadCaja: currentProduct.ProductoCantidadCaja || 0,
        ProductoIVA: currentProduct.ProductoIVA || 0,
        ProductoStockMinimo: currentProduct.ProductoStockMinimo || 0,
        ProductoImagen: currentProduct.ProductoImagen || "",
        ProductoImagen_GXI: currentProduct.ProductoImagen_GXI || "",
        LocalId: currentProduct.LocalId,
      });
    } else {
      setStockAlmacenes([]);
      setFormData({
        ProductoCodigo: "0",
        ProductoNombre: "",
        ProductoPrecioVenta: 0,
        ProductoPrecioVentaMayorista: 0,
        ProductoPrecioUnitario: 0,
        ProductoPrecioPromedio: 0,
        ProductoStock: 0,
        ProductoStockUnitario: 0,
        ProductoCantidadCaja: 1,
        ProductoIVA: 0,
        ProductoStockMinimo: 0,
        ProductoImagen: "",
        ProductoImagen_GXI: "",
        LocalId: 0,
        ...valoresIniciales,
      });
    }
    setPrecioCostoFocused(false); // Resetear el estado de foco cuando cambia el producto
    setImagenTocada(false);
    // isOpen en las dependencias: al reabrir para otro alta (currentProduct
    // sigue en null) el form vuelve a quedar vacío en vez de mostrar el anterior.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProduct, isOpen]);

  // Manejar cambios en el formulario
  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value, type } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "number" ? Number(value) : value,
    }));
  };

  // Manejar cambios en el nombre del producto (forzar mayúsculas)
  const handleNombreChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.toUpperCase();
    setFormData((prev) => ({
      ...prev,
      ProductoNombre: value,
    }));
  };

  // Manejar cambio de imagen (file input): se redimensiona y reencodea a JPEG
  // antes de guardarla en el form, para no enviar la foto original en el JSON.
  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const base64 = await comprimirImagenABase64(file);
      setFormData((prev) => ({ ...prev, ProductoImagen: base64 }));
      setImagenTocada(true);
    } catch {
      alert("No se pudo procesar la imagen seleccionada.");
    } finally {
      // Permite volver a elegir el mismo archivo tras un error.
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Eliminar imagen
  const handleRemoveImage = () => {
    setFormData((prev) => ({ ...prev, ProductoImagen: "" }));
    setImagenTocada(true);
  };

  const addStockAlmacen = () => {
    const usedIds = new Set(stockAlmacenes.map((s) => s.AlmacenId));
    const firstAvailable = almacenes.find((a) => !usedIds.has(a.AlmacenId));
    if (firstAvailable) {
      setStockAlmacenes((prev) => [
        ...prev,
        {
          AlmacenId: firstAvailable.AlmacenId,
          AlmacenNombre: firstAvailable.AlmacenNombre,
          ProductoAlmacenStock: 0,
          ProductoAlmacenStockUnitario: 0,
        },
      ]);
    }
  };

  const removeStockAlmacen = (index: number) => {
    setStockAlmacenes((prev) => prev.filter((_, i) => i !== index));
  };

  const updateStockAlmacen = (
    index: number,
    field: keyof ProductoAlmacenRow,
    value: number | string,
  ) => {
    setStockAlmacenes((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)),
    );
  };

  const setStockAlmacenAlmacenId = (index: number, AlmacenId: number) => {
    const almacen = almacenes.find((a) => a.AlmacenId === AlmacenId);
    setStockAlmacenes((prev) =>
      prev.map((row, i) =>
        i === index
          ? {
              ...row,
              AlmacenId,
              AlmacenNombre: almacen?.AlmacenNombre ?? row.AlmacenNombre,
            }
          : row,
      ),
    );
  };

  // Calcular stock total (cajas) y stock unitario total teniendo en cuenta Cantidad en Caja
  const cantidadCaja = Math.max(1, Number(formData.ProductoCantidadCaja) || 1);
  const totalCajasRaw = stockAlmacenes.reduce(
    (s, row) => s + (Number(row.ProductoAlmacenStock) || 0),
    0,
  );
  const totalUnitarioRaw = stockAlmacenes.reduce(
    (s, row) => s + (Number(row.ProductoAlmacenStockUnitario) || 0),
    0,
  );
  const stockTotalCajas =
    totalCajasRaw + Math.floor(totalUnitarioRaw / cantidadCaja);
  const stockUnitarioTotal = totalUnitarioRaw % cantidadCaja;

  // Enviar formulario
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      ProductoImagen_GXI, // Limpiamos ProductoImagen_GXI antes de enviar
      ProductoImagen,
      ...cleanFormData
    } = formData;
    const payload = {
      ...cleanFormData,
      // Si no se tocó la imagen, la omitimos: el backend preserva la actual.
      ...(imagenTocada ? { ProductoImagen } : {}),
      ProductoStock: ocultarStock ? 0 : stockTotalCajas,
      ProductoStockUnitario: ocultarStock ? 0 : stockUnitarioTotal,
      productoAlmacen: (ocultarStock ? [] : stockAlmacenes).map((pa) => ({
        AlmacenId: pa.AlmacenId,
        ProductoAlmacenStock: Number(pa.ProductoAlmacenStock) || 0,
        ProductoAlmacenStockUnitario:
          Number(pa.ProductoAlmacenStockUnitario) || 0,
      })),
    };
    onSubmit(payload);
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Fondo opacado */}
      <div className="absolute inset-0 bg-black opacity-50" />

      <div className="relative w-full max-w-2xl max-h-full z-10">
        <form
          onSubmit={handleSubmit}
          className="relative bg-surface rounded-lg shadow"
        >
          <div className="flex items-start justify-between p-4 border-b rounded-t">
            <h3 className="text-xl font-semibold text-text">
              {currentProduct
                ? `Editar producto: ${currentProduct.ProductoNombre}`
                : "Crear nuevo producto"}
            </h3>
            <button
              type="button"
              className="text-text-subtle bg-transparent hover:bg-surface-muted hover:text-text rounded-lg text-sm w-8 h-8 ml-auto inline-flex justify-center items-center"
              onClick={onClose}
            >
              <svg
                className="w-3 h-3"
                aria-hidden="true"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 14 14"
              >
                <path
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="m1 1 6 6m0 0 6 6M7 7l6-6M7 7l-6 6"
                />
              </svg>
            </button>
          </div>

          <div className="p-6 space-y-6 max-h-[60vh] overflow-y-auto">
            <div className="grid grid-cols-6 gap-6">
              <div className="col-span-6 sm:col-span-3">
                <label
                  htmlFor="ProductoCodigo"
                  className="block mb-2 text-sm font-medium text-text"
                >
                  Código
                </label>
                <input
                  type="text"
                  name="ProductoCodigo"
                  id="ProductoCodigo"
                  value={formData.ProductoCodigo}
                  onChange={handleInputChange}
                  className="bg-surface border border-border text-text text-sm rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-brand-600/30 focus:border-brand-600 block w-full p-2.5"
                  required
                />
              </div>
              <div className="col-span-6 sm:col-span-3">
                <label
                  htmlFor="ProductoNombre"
                  className="block mb-2 text-sm font-medium text-text"
                >
                  Nombre
                </label>
                <input
                  type="text"
                  name="ProductoNombre"
                  id="ProductoNombre"
                  value={formData.ProductoNombre}
                  onChange={handleNombreChange}
                  className="bg-surface border border-border text-text text-sm rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-brand-600/30 focus:border-brand-600 block w-full p-2.5 uppercase"
                  required
                />
              </div>
              <div className="col-span-6 sm:col-span-3">
                <label
                  htmlFor="ProductoPrecioVenta"
                  className="block mb-2 text-sm font-medium text-text"
                >
                  Precio Minorista
                </label>
                <input
                  type="text"
                  name="ProductoPrecioVenta"
                  id="ProductoPrecioVenta"
                  value={
                    formData.ProductoPrecioVenta
                      ? formatMiles(formData.ProductoPrecioVenta)
                      : ""
                  }
                  onChange={(e) => {
                    // Eliminar puntos y formatear a número
                    const raw = e.target.value.replace(/\./g, "");
                    setFormData((prev) => ({
                      ...prev,
                      ProductoPrecioVenta: Number(raw),
                    }));
                  }}
                  className="bg-surface border border-border text-text text-sm rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-brand-600/30 focus:border-brand-600 block w-full p-2.5"
                  required
                />
              </div>
              {/* Campos adicionales opcionales */}
              <div className="col-span-6 sm:col-span-3">
                <label
                  htmlFor="ProductoPrecioVentaMayorista"
                  className="block mb-2 text-sm font-medium text-text"
                >
                  Precio Mayorista
                </label>
                <input
                  type="text"
                  name="ProductoPrecioVentaMayorista"
                  id="ProductoPrecioVentaMayorista"
                  value={
                    formData.ProductoPrecioVentaMayorista
                      ? formatMiles(formData.ProductoPrecioVentaMayorista)
                      : ""
                  }
                  onChange={(e) => {
                    const raw = e.target.value.replace(/\./g, "");
                    setFormData((prev) => ({
                      ...prev,
                      ProductoPrecioVentaMayorista: Number(raw),
                    }));
                  }}
                  className="bg-surface border border-border text-text text-sm rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-brand-600/30 focus:border-brand-600 block w-full p-2.5"
                />
              </div>
              <div className="col-span-6 sm:col-span-3">
                <label
                  htmlFor="ProductoPrecioUnitario"
                  className="block mb-2 text-sm font-medium text-text"
                >
                  Precio Unitario
                </label>
                <input
                  type="number"
                  name="ProductoPrecioUnitario"
                  id="ProductoPrecioUnitario"
                  value={formData.ProductoPrecioUnitario || ""}
                  onChange={handleInputChange}
                  className="bg-surface border border-border text-text text-sm rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-brand-600/30 focus:border-brand-600 block w-full p-2.5"
                />
              </div>
              <div className="col-span-6 sm:col-span-3">
                <label
                  htmlFor="ProductoPrecioPromedio"
                  className="block mb-2 text-sm font-medium text-text"
                >
                  Precio Costo
                </label>
                <input
                  type="text"
                  name="ProductoPrecioPromedio"
                  id="ProductoPrecioPromedio"
                  value={
                    precioCostoFocused
                      ? formData.ProductoPrecioPromedio
                        ? formData.ProductoPrecioPromedio.toString()
                        : ""
                      : formData.ProductoPrecioPromedio
                        ? formatMilesWithDecimals(
                            formData.ProductoPrecioPromedio,
                          )
                        : ""
                  }
                  onFocus={() => setPrecioCostoFocused(true)}
                  onBlur={() => setPrecioCostoFocused(false)}
                  onChange={(e) => {
                    // Permitir escribir números y punto decimal
                    let raw = e.target.value.replace(/[^\d.]/g, "");

                    // Asegurar que solo haya un punto decimal
                    const parts = raw.split(".");
                    if (parts.length > 2) {
                      raw = parts[0] + "." + parts.slice(1).join("");
                    }

                    const numValue =
                      raw === "" || raw === "." ? 0 : parseFloat(raw);
                    setFormData((prev) => ({
                      ...prev,
                      ProductoPrecioPromedio: isNaN(numValue) ? 0 : numValue,
                    }));
                  }}
                  className="bg-surface border border-border text-text text-sm rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-brand-600/30 focus:border-brand-600 block w-full p-2.5"
                />
              </div>
              {/* El stock se oculta al crear desde compras: lo carga la compra. */}
              {!ocultarStock && (
                <>
                  <div className="col-span-6 sm:col-span-3">
                    <label
                      htmlFor="ProductoStock"
                      className="block mb-2 text-sm font-medium text-text"
                    >
                      Stock total (todos los almacenes)
                    </label>
                    <input
                      type="number"
                      name="ProductoStock"
                      id="ProductoStock"
                      min={0}
                      value={stockTotalCajas}
                      readOnly
                      className="bg-surface-muted border border-border text-text text-sm rounded-lg block w-full p-2.5 cursor-not-allowed"
                      title="Cajas + unidades convertidas a cajas (según Cantidad por Caja)"
                    />
                  </div>
                  <div className="col-span-6 sm:col-span-3">
                    <label
                      htmlFor="ProductoStockUnitario"
                      className="block mb-2 text-sm font-medium text-text"
                    >
                      Stock unitario total (todos los almacenes)
                    </label>
                    <input
                      type="number"
                      name="ProductoStockUnitario"
                      id="ProductoStockUnitario"
                      min={0}
                      value={stockUnitarioTotal}
                      readOnly
                      className="bg-surface-muted border border-border text-text text-sm rounded-lg block w-full p-2.5 cursor-not-allowed"
                      title="Resto de unidades después de formar cajas (según Cantidad por Caja)"
                    />
                  </div>
                  {/* Stock por almacén */}
                  <div className="col-span-6">
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-medium text-text">
                        Stock por almacén (editar cantidades aquí)
                      </label>
                      <button
                        type="button"
                        onClick={addStockAlmacen}
                        className="text-brand-700 hover:text-brand-800 border border-brand-300 bg-surface rounded px-3 py-1 text-sm font-medium cursor-pointer flex items-center gap-1"
                      >
                        <PlusIcon className="w-4 h-4" />
                        Agregar almacén
                      </button>
                    </div>
                    <div className="border border-border rounded-lg overflow-hidden">
                      <table className="min-w-full text-sm text-left text-text">
                        <thead className="bg-surface-muted text-text-muted">
                          <tr>
                            <th className="px-3 py-2">Almacén</th>
                            <th className="px-3 py-2">Stock (cajas)</th>
                            <th className="px-3 py-2">Stock unitario</th>
                            <th className="px-3 py-2 w-10"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {stockAlmacenes.length === 0 ? (
                            <tr>
                              <td
                                colSpan={4}
                                className="px-3 py-4 text-text-subtle"
                              >
                                Sin almacenes. Agregue al menos uno para cargar
                                stock.
                              </td>
                            </tr>
                          ) : (
                            stockAlmacenes.map((row, index) => (
                              <tr
                                key={index}
                                className="border-t border-border bg-surface"
                              >
                                <td className="px-3 py-2">
                                  <select
                                    value={row.AlmacenId}
                                    onChange={(e) =>
                                      setStockAlmacenAlmacenId(
                                        index,
                                        Number(e.target.value),
                                      )
                                    }
                                    className="bg-surface border border-border text-text rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-brand-600/30 focus:border-brand-600 block w-full p-2"
                                  >
                                    {almacenes.map((a) => {
                                      const used =
                                        stockAlmacenes.some(
                                          (s, i) =>
                                            i !== index &&
                                            s.AlmacenId === a.AlmacenId,
                                        ) ?? false;
                                      return (
                                        <option
                                          key={a.AlmacenId}
                                          value={a.AlmacenId}
                                          disabled={used}
                                        >
                                          {a.AlmacenNombre}
                                          {used ? " (ya agregado)" : ""}
                                        </option>
                                      );
                                    })}
                                  </select>
                                </td>
                                <td className="px-3 py-2">
                                  <input
                                    type="number"
                                    value={row.ProductoAlmacenStock || ""}
                                    onChange={(e) =>
                                      updateStockAlmacen(
                                        index,
                                        "ProductoAlmacenStock",
                                        Number(e.target.value) || 0,
                                      )
                                    }
                                    className="bg-surface border border-border text-text rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-brand-600/30 focus:border-brand-600 block w-full p-2"
                                    title="Permitido negativo (ej. ventas registradas antes de cargar la compra)"
                                  />
                                </td>
                                <td className="px-3 py-2">
                                  <input
                                    type="number"
                                    min={0}
                                    max={Math.max(0, cantidadCaja - 1)}
                                    value={
                                      row.ProductoAlmacenStockUnitario || ""
                                    }
                                    onChange={(e) => {
                                      const raw = Number(e.target.value) || 0;
                                      const clamped = Math.min(
                                        Math.max(0, raw),
                                        Math.max(0, cantidadCaja - 1),
                                      );
                                      updateStockAlmacen(
                                        index,
                                        "ProductoAlmacenStockUnitario",
                                        clamped,
                                      );
                                    }}
                                    className="bg-surface border border-border text-text rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-brand-600/30 focus:border-brand-600 block w-full p-2"
                                    title={`Máximo ${
                                      cantidadCaja - 1
                                    } (Cantidad en Caja - 1)`}
                                  />
                                </td>
                                <td className="px-3 py-2">
                                  <button
                                    type="button"
                                    onClick={() => removeStockAlmacen(index)}
                                    className="text-danger-700 hover:text-danger-800 p-1 rounded"
                                    title="Eliminar"
                                  >
                                    <TrashIcon className="w-5 h-5" />
                                  </button>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
              <div className="col-span-6 sm:col-span-3">
                <label
                  htmlFor="ProductoCantidadCaja"
                  className="block mb-2 text-sm font-medium text-text"
                >
                  Cantidad por Caja
                </label>
                <input
                  type="number"
                  name="ProductoCantidadCaja"
                  id="ProductoCantidadCaja"
                  value={formData.ProductoCantidadCaja || ""}
                  onChange={handleInputChange}
                  className="bg-surface border border-border text-text text-sm rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-brand-600/30 focus:border-brand-600 block w-full p-2.5"
                />
              </div>
              <div className="col-span-6 sm:col-span-3">
                <label
                  htmlFor="ProductoIVA"
                  className="block mb-2 text-sm font-medium text-text"
                >
                  IVA
                </label>
                <input
                  type="number"
                  name="ProductoIVA"
                  id="ProductoIVA"
                  value={formData.ProductoIVA || ""}
                  onChange={handleInputChange}
                  className="bg-surface border border-border text-text text-sm rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-brand-600/30 focus:border-brand-600 block w-full p-2.5"
                />
              </div>
              <div className="col-span-6 sm:col-span-3">
                <label
                  htmlFor="ProductoStockMinimo"
                  className="block mb-2 text-sm font-medium text-text"
                >
                  Stock Mínimo
                </label>
                <input
                  type="number"
                  name="ProductoStockMinimo"
                  id="ProductoStockMinimo"
                  value={formData.ProductoStockMinimo || ""}
                  onChange={handleInputChange}
                  className="bg-surface border border-border text-text text-sm rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-brand-600/30 focus:border-brand-600 block w-full p-2.5"
                />
              </div>
              <div className="col-span-6 sm:col-span-3">
                <label className="block mb-2 text-sm font-medium text-text">
                  Empresa
                </label>
                <div className="bg-surface-sunken border border-border text-text-muted text-sm rounded-md p-2.5">
                  {empresaActiva?.EmpresaNombre ?? "—"}
                </div>
                <p className="mt-1 text-xs text-text-muted">
                  El producto se crea en el catálogo de esta empresa.
                </p>
              </div>
              {/* Imagen: solo mostrar base64 si existe */}
              <div className="col-span-6">
                <label className="block mb-2 text-sm font-medium text-text">
                  Imagen del producto
                </label>
                <div className="flex items-center gap-4 mb-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="text-brand-700 hover:text-brand-800 border border-brand-300 bg-surface rounded px-3 py-1 text-sm font-medium cursor-pointer"
                  >
                    Seleccionar imagen
                  </button>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                    className="hidden"
                    ref={fileInputRef}
                  />
                  {formData.ProductoImagen && (
                    <>
                      <img
                        src={`data:image/jpeg;base64,${formData.ProductoImagen}`}
                        alt="Imagen producto"
                        className="w-32 h-32 object-contain border rounded"
                      />
                      <button
                        type="button"
                        onClick={handleRemoveImage}
                        className="text-danger-700 hover:text-danger-800 border border-danger-200 bg-surface rounded px-3 py-1 text-sm"
                      >
                        Eliminar imagen
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 p-6 border-t border-border rounded-b">
            <Button variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit">
              {currentProduct ? "Actualizar" : "Crear"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
