// Tipos de caja retornable del producto (producto.ProductoTipoCaja,
// migración 035). NULL / "" = Ninguno.
export const TIPOS_CAJA: { value: string; label: string }[] = [
  { value: "CERVEPAR", label: "Caja Cervepar" },
  { value: "COCA", label: "Caja Coca" },
  { value: "340", label: "Caja 340" },
  { value: "MUNICH_POLAR", label: "Caja Munich/Polar" },
  { value: "710_NEGRO", label: "Caja 710 negro" },
  { value: "710_ROJO", label: "Caja 710 rojo" },
  { value: "710_AZUL", label: "Caja 710 azul" },
];

export const labelTipoCaja = (value: string | null | undefined): string =>
  TIPOS_CAJA.find((t) => t.value === value)?.label ?? value ?? "";
