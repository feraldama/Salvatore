// Identificador del EQUIPO (no del usuario). Se genera una vez por navegador y
// queda guardado; viaja en cada request como X-Terminal-Id para que el servidor
// resuelva en qué sucursal está parada esta PC.
//
// Que viva en localStorage tiene un costo conocido: si alguien limpia los datos
// del navegador, o se usa una ventana de incógnito, el equipo aparece como
// nuevo y hay que volver a registrarlo (un admin, 20 segundos). Se prefirió eso
// a preguntarle la sucursal al cajero, que es justamente lo que se equivoca.
const STORAGE_KEY = "salvatore.terminalId";

function nuevoId(): string {
  // randomUUID existe en todos los navegadores actuales sobre HTTPS/localhost;
  // el fallback cubre contextos no seguros (http a IP de la red interna).
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    // seguimos al fallback
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Id de este equipo, creándolo la primera vez. Si el navegador no deja escribir
// (incógnito estricto, storage bloqueado) devuelve un id efímero: el equipo va a
// figurar como no registrado, que es el comportamiento seguro.
export function getTerminalId(): string {
  try {
    const guardado = localStorage.getItem(STORAGE_KEY);
    if (guardado) return guardado;
    const id = nuevoId();
    localStorage.setItem(STORAGE_KEY, id);
    return id;
  } catch {
    return nuevoId();
  }
}

// Código corto para leerle por teléfono a un administrador cuando hay que dar
// de alta el equipo.
export function getTerminalCodigoCorto(): string {
  return getTerminalId().slice(0, 8).toUpperCase();
}
