// Aritmética de los traslados de inventario entre almacenes (migración 026).
//
// ── Por qué no se reusa stockOps.js ──────────────────────────────────────────
// `restarUnidades`/`sumarUnidades` iteran unidad por unidad. Son correctos y
// replican el GeneXus, pero un traslado mueve cajas enteras de un depósito con
// ~8.800 cajas: iterar sería O(n) sobre decenas de miles de vueltas. La
// representación que usan (total = cajas*cc + sueltas, con sueltas en 0..cc-1)
// es exactamente equivalente a hacer la cuenta en unidades y volver a repartir,
// así que acá se hace en O(1) con el mismo resultado.
//
// ── Por qué la conversión NO es "unidades base" ──────────────────────────────
// ProductoCantidadCaja no significa lo mismo en los dos catálogos: en el
// mayorista vale 1 en 85 de los 167 pares equivalentes porque la distribuidora
// no fracciona (una "caja" es el bulto completo, contenga 12 o 24 unidades).
// La unidad de intercambio real es la CAJA, y eso lo fija FactorCaja =
// cuántas cajas del destino equivale 1 caja del origen. Ver la cabecera de
// api/migrations/026_traslado_inventario.sql para los datos que lo respaldan.

// Total en unidades de un par (cajas, sueltas).
//
// Tolera sueltas >= cc en vez de rechazarlo: hay al menos una fila así en
// productoalmacen (producto 1313, sueltas=24 con cc=1) y no se corrigió a
// propósito para no tocar datos existentes. Normalizar acá, en memoria,
// preserva el total exacto sin escribir nada.
function aUnidades(cajas, sueltas, cantidadCaja) {
  const cc = Math.max(1, Number(cantidadCaja) || 1);
  return (Number(cajas) || 0) * cc + (Number(sueltas) || 0);
}

// Reparte un total de unidades en (cajas, sueltas) con sueltas en 0..cc-1.
// Con totales negativos mantiene la invariante (sueltas nunca negativo),
// igual que restarUnidades: -1 unidad con cc=12 -> { cajas: -1, sueltas: 11 }.
function aCajas(unidades, cantidadCaja) {
  const cc = Math.max(1, Number(cantidadCaja) || 1);
  const u = Number(unidades) || 0;
  const cajas = Math.floor(u / cc);
  return { cajas, sueltas: u - cajas * cc };
}

// Convierte una cantidad del producto origen a unidades del producto destino.
//
//   cajas_eq_origen  = cajas + sueltas / cc_origen        (fracción de caja)
//   unidades_destino = cajas_eq_origen * FactorCaja * cc_destino
//
// que reordenado es  u_origen * FactorCaja * cc_destino / cc_origen.
//
// Se calcula con BigInt sobre el factor escalado a 1e6 (FactorCaja es
// NUMERIC(14,6)) para que no haya error de punto flotante: un traslado que
// redondea mal inventa o destruye stock. Si la cuenta no da un entero exacto
// —p.ej. 1 unidad suelta de un origen con cc=3 hacia un destino con cc=4—
// se rechaza en vez de redondear.
const ESCALA = 1000000n;

function convertir({
  cajasOrigen = 0,
  sueltasOrigen = 0,
  ccOrigen,
  ccDestino,
  factorCaja = 1,
}) {
  const ccO = Math.max(1, Number(ccOrigen) || 1);
  const ccD = Math.max(1, Number(ccDestino) || 1);
  const factor = Number(factorCaja);
  if (!Number.isFinite(factor) || factor <= 0) {
    throw { message: "El factor de conversión debe ser mayor a cero" };
  }

  const unidadesOrigen = aUnidades(cajasOrigen, sueltasOrigen, ccO);
  if (unidadesOrigen <= 0) {
    throw { message: "La cantidad a trasladar debe ser mayor a cero" };
  }

  const factorEscalado = BigInt(Math.round(factor * Number(ESCALA)));
  const numerador = BigInt(unidadesOrigen) * factorEscalado * BigInt(ccD);
  const denominador = BigInt(ccO) * ESCALA;

  if (numerador % denominador !== 0n) {
    throw {
      message:
        "La cantidad no se convierte en un número entero de unidades del " +
        "producto destino. Ajustá la cantidad o el factor de la equivalencia.",
    };
  }

  return {
    unidadesOrigen,
    unidadesDestino: Number(numerador / denominador),
  };
}

// Promedio ponderado del producto destino tras recibir un traslado.
//
// Se pondera en UNIDADES (no en cajas) porque origen y destino pueden tener
// distinta CantidadCaja; el resultado se devuelve por caja, que es como
// producto.ProductoPrecioPromedio se guarda.
//
// El origen NO recalcula su promedio: la salida va a costo promedio, que es
// el tratamiento estándar y el mismo criterio que usa la venta.
//
// No se reusa el bloque de compra.controller.js (líneas ~196-241) a propósito:
// ese cálculo arrastra quirks del GeneXus para stock negativo y está atado a
// la semántica de compra (bonificación, unidad 'C'/'U'). Tocarlo para
// compartirlo cambiaría el costeo de las compras, que ya tiene 6.636 registros
// de historia, a cambio de nada.
function promedioDestino({
  unidadesActuales,
  promedioActualPorCaja,
  unidadesEntrantes,
  costoUnitarioEntrante,
  ccDestino,
}) {
  const ccD = Math.max(1, Number(ccDestino) || 1);
  const uAct = Number(unidadesActuales) || 0;
  const ppAct = Number(promedioActualPorCaja) || 0;
  const uEnt = Number(unidadesEntrantes) || 0;
  const costoEnt = Number(costoUnitarioEntrante) || 0;

  // Sin stock previo, o con stock pero sin costo cargado, el promedio pasa a
  // ser directamente el del ingreso: promediar contra 0 lo subvaluaría.
  if (uAct <= 0 || ppAct <= 0) {
    return costoEnt * ccD;
  }
  if (uAct + uEnt <= 0) {
    return ppAct;
  }

  const costoUnitActual = ppAct / ccD;
  const costoUnitNuevo =
    (uAct * costoUnitActual + uEnt * costoEnt) / (uAct + uEnt);
  return costoUnitNuevo * ccD;
}

// Costo por unidad del producto origen, a partir de su promedio por caja.
function costoUnitarioOrigen(promedioPorCaja, ccOrigen) {
  const ccO = Math.max(1, Number(ccOrigen) || 1);
  return (Number(promedioPorCaja) || 0) / ccO;
}

module.exports = {
  aUnidades,
  aCajas,
  convertir,
  promedioDestino,
  costoUnitarioOrigen,
};
