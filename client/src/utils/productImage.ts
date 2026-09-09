import logo from "../assets/img/logo.jpg";

/**
 * URL del endpoint binario de imagen de producto.
 * El backend la sirve como `image/jpeg` con Cache-Control agresivo.
 */
export function getProductoImagenUrl(productoId: number | string): string {
  const base = import.meta.env.VITE_API_URL as string;
  return `${base}/productos/${productoId}/imagen`;
}

/**
 * Devuelve la URL de imagen del producto si tiene, o el logo por defecto.
 * Acepta tanto el flag `HasImagen` (0/1 que viene del backend) como un
 * string base64 legacy (para casos de edit donde el form aún lo usa).
 */
export function resolveProductoImagen(
  productoId: number | string,
  hasImagen: number | boolean | null | undefined
): string {
  if (hasImagen) return getProductoImagenUrl(productoId);
  return logo;
}

/** Lado máximo (px) al que se redimensiona la imagen antes de subirla. */
const MAX_LADO_IMAGEN = 800;
/** Calidad JPEG del reencodeo. */
const CALIDAD_JPEG = 0.75;

/**
 * Lee un archivo de imagen, lo redimensiona a `MAX_LADO_IMAGEN` (manteniendo
 * proporción, sin agrandar) y lo reencodea como JPEG. Devuelve solo el base64
 * (sin el prefijo `data:`), que es lo que espera el backend.
 *
 * Sin esto, una foto de celular se enviaba tal cual en el JSON del PUT/POST y
 * el reverse proxy la rechazaba con 413 (Request Entity Too Large).
 */
export function comprimirImagenABase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const escala = Math.min(
        1,
        MAX_LADO_IMAGEN / Math.max(img.naturalWidth, img.naturalHeight)
      );
      const ancho = Math.max(1, Math.round(img.naturalWidth * escala));
      const alto = Math.max(1, Math.round(img.naturalHeight * escala));
      const canvas = document.createElement("canvas");
      canvas.width = ancho;
      canvas.height = alto;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("No se pudo procesar la imagen"));
      // Fondo blanco: los PNG con transparencia quedarían negros en JPEG.
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, ancho, alto);
      ctx.drawImage(img, 0, 0, ancho, alto);
      const dataUrl = canvas.toDataURL("image/jpeg", CALIDAD_JPEG);
      resolve(dataUrl.split(",")[1] || "");
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Archivo de imagen inválido"));
    };
    img.src = url;
  });
}
