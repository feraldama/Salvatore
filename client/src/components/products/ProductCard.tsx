import React from "react";
import { formatMiles } from "../../utils/utils";

interface ProductCardProps {
  nombre: string;
  precio: number;
  precioMayorista?: number;
  clienteTipo?: string;
  imagen: string;
  stock: number;
  onAdd: () => void;
  precioUnitario?: number;
  stockUnitario?: number;
}

const ProductCard: React.FC<ProductCardProps> = ({
  nombre,
  precio,
  precioMayorista,
  clienteTipo,
  imagen,
  stock,
  onAdd,
  precioUnitario,
  stockUnitario,
}) => {
  const mostrarPrecio =
    clienteTipo === "MA" && precioMayorista !== undefined
      ? precioMayorista
      : precio;
  return (
    <button
      type="button"
      onClick={onAdd}
      aria-label={`Agregar ${nombre} — Gs. ${formatMiles(mostrarPrecio)}`}
      className="w-full bg-surface border border-border rounded-lg shadow-card cursor-pointer p-0 flex flex-col items-center text-center transition-shadow hover:shadow-elevated focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
    >
      <div className="w-full flex justify-center items-center p-4">
        <img
          className="h-32 object-contain bg-surface"
          src={imagen}
          alt={nombre}
          loading="lazy"
          decoding="async"
        />
      </div>
      <div className="w-full px-4 pb-3">
        <div className="font-bold text-base text-text uppercase leading-tight min-h-[44px] flex items-center justify-center">
          {nombre}
        </div>
        <div className="font-num font-bold text-2xl text-warning-600 mb-0">
          Gs. {formatMiles(mostrarPrecio)}
        </div>
        {precioUnitario !== undefined && (
          <div className="text-sm text-brand-700 font-num">
            Gs. {formatMiles(precioUnitario)}
          </div>
        )}
        <div className="text-sm text-text-muted mt-1 space-x-4">
          Caja:{" "}
          <span className="text-success-700 font-semibold font-num">
            {stock}
          </span>
          Unidad:{" "}
          <span className="text-success-700 font-semibold font-num">
            {stockUnitario}
          </span>
        </div>
      </div>
    </button>
  );
};

export default ProductCard;
