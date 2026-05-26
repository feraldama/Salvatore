import { useMemo } from 'react';
import { TextInput, TextInputProps } from 'react-native';

/// Input numérico con separador de miles EN VIVO mientras se escribe.
///
/// Uso desde el componente padre:
///   const [km, setKm] = useState(''); // string raw sin separadores
///   <NumberInput value={km} onChangeText={setKm} ... />
///
/// El parent maneja el value como string RAW (solo dígitos + opcionalmente
/// un punto si allowDecimal). Visualmente se muestra formateado en es-PY
/// (12.345 / 1.234.567,89). Para enviar al backend: Number(km) directo.
///
/// Quirks conocidos y aceptados:
///   - Cursor salta al final al reformatear. Aceptable para forms simples
///     donde se escribe izquierda→derecha.
///   - Al borrar dígitos del medio, el reformateo puede sentirse extraño.
///     El usuario simplemente borra y reescribe.

interface Props
  extends Omit<TextInputProps, 'value' | 'onChangeText' | 'keyboardType'> {
  /// Valor sin separadores ("12345" no "12.345"). null/undefined = vacío.
  value: string;
  /// Recibe el valor RAW (sin separadores). Pasalo tal cual al state.
  onChangeText: (rawValue: string) => void;
  /// Si true, acepta una coma decimal y muestra hasta 2 decimales. Default
  /// false (enteros, ej. km, litros redondeados, monto en PYG).
  allowDecimal?: boolean;
  /// Máximo de decimales (solo si allowDecimal). Default 2.
  maxDecimals?: number;
}

const FMT_ENTERO = new Intl.NumberFormat('es-PY');
function makeFmtDecimal(maxDecimals: number) {
  return new Intl.NumberFormat('es-PY', { maximumFractionDigits: maxDecimals });
}

export default function NumberInput({
  value,
  onChangeText,
  allowDecimal = false,
  maxDecimals = 2,
  ...rest
}: Props) {
  const fmt = useMemo(
    () => (allowDecimal ? makeFmtDecimal(maxDecimals) : FMT_ENTERO),
    [allowDecimal, maxDecimals],
  );

  // Renderizamos el value en formato es-PY. Caso especial: si el usuario
  // acaba de tipear la coma decimal y todavía no escribió dígitos después
  // (value === "12."), preservamos la coma para que pueda seguir tipeando.
  const displayed = useMemo(() => {
    if (!value) return '';
    if (allowDecimal && value.endsWith('.')) {
      const intPart = value.slice(0, -1);
      const n = Number(intPart);
      if (!Number.isFinite(n)) return value;
      return FMT_ENTERO.format(n) + ',';
    }
    const n = Number(value);
    if (!Number.isFinite(n)) return value;
    return fmt.format(n);
  }, [value, allowDecimal, fmt]);

  function handleChange(text: string) {
    // El usuario tipeó/borró algo. Estrategia:
    //   1. Sacamos los separadores de miles (puntos) — son cosméticos.
    //   2. Si allowDecimal, convertimos coma → punto (formato JS).
    //   3. Validamos que el resultado sea un número parseable.
    //   4. Lo pasamos al parent como string raw.
    let raw = text.replace(/\./g, '');
    if (allowDecimal) raw = raw.replace(',', '.');
    if (raw === '') {
      onChangeText('');
      return;
    }
    const regex = allowDecimal ? /^\d*\.?\d*$/ : /^\d*$/;
    if (!regex.test(raw)) return;
    // Aplicar maxDecimals: cortar dígitos extras después del punto.
    if (allowDecimal && raw.includes('.')) {
      const [intPart, decPart] = raw.split('.');
      raw = `${intPart}.${(decPart ?? '').slice(0, maxDecimals)}`;
    }
    onChangeText(raw);
  }

  return (
    <TextInput
      {...rest}
      value={displayed}
      onChangeText={handleChange}
      keyboardType={allowDecimal ? 'decimal-pad' : 'numeric'}
    />
  );
}
