export interface FlotaConfig {
  permanencia_umbral_minutos: number;
  permanencia_radio_metros: number;
  ubicacion_intervalo_segundos: number;
  permanencia_rol_alerta: string;
  gps_obligatorio: boolean;
  ubicacion_retencion_dias: number;
}

export interface VehiculoAsignado {
  id: number;
  chapa: string;
  marca: string | null;
  modelo: string | null;
}

export interface ViajeActivo {
  id: number;
  vehiculo_id: number;
  inicio_en: string;
  lat_inicio: number;
  lng_inicio: number;
  chapa: string;
  marca: string | null;
}

export interface CargaCombustibleResumen {
  id: number;
  creado_en: string;
  km: number | null;
  litros: number | null;
  monto: number | null;
  chapa: string;
}

export interface FotoCaptura {
  uri: string;
  lat: number;
  lng: number;
  accuracy?: number;
  capturado_en: string;
}

// 2 fotos: TABLERO (panel con odómetro + nivel del tanque) y FACTURA.
// Antes eran 3 (odometro + tanque separados); las cargas históricas con esos
// tipos siguen siendo legibles en el admin pero las nuevas usan estos 2.
export type TipoFotoCombustible = 'tablero' | 'factura';

/// Item de "pendientes" del chofer: mantenimientos vencidos/próximos y
/// documentos a vencer de los vehículos que tiene asignados. El backend
/// calcula el estado y devuelve solo lo que requiere atención.
export type EstadoPendiente = 'PROXIMO' | 'VENCIDO';
export type DocumentoTipoFlota = 'SEGURO' | 'RUA' | 'PATENTE' | 'HABILITACION' | 'OTRO';
export type DocumentoChoferTipo = 'LICENCIA' | 'CURSO_DEFENSIVO' | 'HABILITACION' | 'OTRO';

/// Viaje activo (ABIERTO) visto por el gerente de operaciones — listado
/// para live tracking. Una sola query LATERAL del backend trae también la
/// última ubicación conocida (puede ser null si el chofer todavía no mandó
/// ningún ping post-inicio).
export interface ViajeActivoFlota {
  id: number;
  usuario_id: number;
  inicio_en: string;
  lat_inicio: number | null;
  lng_inicio: number | null;
  chofer_nombre: string;
  vehiculo_id: number;
  chapa: string;
  marca: string | null;
  ult_lat: number | null;
  ult_lng: number | null;
  ult_acc_m: number | null;
  ult_visto_en: string | null;
}

/// Item de "atención requerida" para el gerente — mismo shape que el del
/// admin web, pero mostrado en pantalla mobile.
export interface AtencionRequeridaItem {
  categoria: 'mantenimiento' | 'documento' | 'documento_chofer';
  codigo: number;
  vehiculo_id?: number;
  chapa?: string;
  marca?: string | null;
  usuario_id?: number;
  chofer_nombre?: string;
  titulo: string;
  estado: 'PROXIMO' | 'VENCIDO';
  km_proximo?: number | null;
  fecha_proxima?: string | null;
  km_actual?: number | null;
  tipo_doc?: string;
  vencimiento?: string;
}

/// Detalle de un viaje (vista del gerente, linkable desde un push). Incluye
/// info compacta del trayecto y las cargas/alertas registradas.
export interface ViajeFlotaDetalleMobile {
  id: number;
  estado: 'ABIERTO' | 'CERRADO';
  inicio_en: string;
  fin_en: string | null;
  usuario_id: number;
  chofer_nombre: string;
  vehiculo_id: number;
  chapa: string;
  marca: string | null;
  lat_inicio: number | null;
  lng_inicio: number | null;
  lat_fin: number | null;
  lng_fin: number | null;
  km_recorridos: number | null;
  ubicaciones_total: number;
  cargas: Array<{
    id: number;
    creado_en: string;
    km: number | null;
    litros: number | null;
    monto: number | null;
    consumo_km_l: number | null;
  }>;
  alertas: Array<{
    id: number;
    inicio: string;
    ultimo: string;
    lat: number | null;
    lng: number | null;
    duracion_min: number;
  }>;
}

export interface PendienteFlota {
  /// `documento_chofer` no tiene vehiculo_id ni chapa — son docs personales
  /// del chofer (licencia, etc). El frontend los muestra en grupo aparte.
  categoria: 'mantenimiento' | 'documento' | 'documento_chofer';
  codigo: number;
  vehiculo_id?: number;
  chapa?: string;
  marca?: string | null;
  /// Solo en docs de chofer (es el ID del propio usuario)
  usuario_id?: number;
  titulo: string;
  estado: EstadoPendiente;
  // mantenimiento
  km_proximo?: number | null;
  fecha_proxima?: string | null;
  km_actual?: number | null;
  // documento (vehículo o chofer)
  tipo_doc?: DocumentoTipoFlota | DocumentoChoferTipo;
  vencimiento?: string;
}
