// DTOs alineados con el backend del CMS (`backend/src/repositories/pantalla-incidencias.repository.ts`).
// Las fechas vienen como ISO strings desde el JSON HTTP.

export type TipoIncidencia =
  | 'apagada'
  | 'parpadeo'
  | 'freeze'
  | 'sin_senal'
  | 'error_camara'
  | 'zona_muerta';

export type SeveridadIncidencia = 'info' | 'warning' | 'critical';

export type AsignacionFiltro = 'mias' | 'sin_asignar' | 'todas';

/// Datos del usuario ERP resueltos por el backend para creado_por / tecnico /
/// resuelto_por. Null cuando el id no está set o el usuario fue eliminado.
export interface UsuarioErpResumen {
  id: number;
  nombre: string;
  email: string | null;
}

/// Resumen que devuelve el listado.
export interface IncidenciaResumen {
  id: string;
  pantalla_id: string;
  empresa_id: string;
  tipo: TipoIncidencia;
  severidad: SeveridadIncidencia;
  iniciado_en: string;
  resuelto_en: string | null;
  luminancia_media: number | null;
  varianza_espacial: number | null;
  diff_frame_a_frame: number | null;
  frame_evidencia_url: string | null;
  detalle: unknown | null;
  tecnico_erp_id: number | null;
  tomada_en: string | null;
  notas_resolucion: string | null;
  resuelto_por_erp_id: number | null;
  creado_por_erp_id: number | null;
  creado_en: string;
  pantalla: { id: string; nombre: string };
  // Resueltos por el backend.
  creado_por: UsuarioErpResumen | null;
  tecnico: UsuarioErpResumen | null;
  resuelto_por: UsuarioErpResumen | null;
}

/// Detalle de una incidencia (incluye datos extendidos de pantalla).
export interface IncidenciaDetalle extends Omit<IncidenciaResumen, 'pantalla'> {
  pantalla: {
    id: string;
    nombre: string;
    ubicacion: string | null;
    direccion: string | null;
    latitud: number | null;
    longitud: number | null;
    imagen_url: string | null;
    /// Flags derivados del backend para habilitar/deshabilitar el botón de
    /// reproducción de diagnóstico desde la app.
    tieneVideoDiagnostico: boolean;
    tieneDispositivo: boolean;
  };
}

export interface ListarFiltros {
  pantallaId?: string;
  tipo?: TipoIncidencia;
  abiertas?: boolean;
  asignacion?: AsignacionFiltro;
  desde?: string; // YYYY-MM-DD
  hasta?: string;
  pagina?: number;
  limite?: number;
  ordenarPor?: 'iniciado_en' | 'tipo';
  direccion?: 'asc' | 'desc';
}

export interface ListarResponse {
  datos: IncidenciaResumen[];
  total: number;
  pagina: number;
  totalPaginas: number;
}

export interface ActualizarBody {
  notasResolucion?: string;
  resolver?: boolean;
}

export interface CrearIncidenciaBody {
  pantallaId: string;
  tipo: TipoIncidencia;
  severidad?: SeveridadIncidencia;
  descripcion?: string;
}

export interface PantallaResumen {
  id: string;
  nombre: string;
  ubicacion: string | null;
  direccion: string | null;
}

/// Punto del mapa. `severidad_abierta` es null si la pantalla no tiene
/// incidencias abiertas → marker verde "ok". Si tiene una o más, devuelve
/// la severidad máxima (critical > warning > info) → color del marker.
export interface PantallaPuntoMapa {
  id: string;
  nombre: string;
  ubicacion: string | null;
  latitud: number;
  longitud: number;
  severidad_abierta: SeveridadIncidencia | null;
}

/// Técnicos disponibles para el selector de reasignación. Backend ya excluye
/// al actor para que no aparezca a sí mismo.
export interface TecnicoDisponible {
  id: number;
  nombre: string;
  email: string | null;
}

/// Body del POST /incidencias/:id/reasignar. tecnicoErpId=null = "soltar".
export interface ReasignarBody {
  tecnicoErpId: number | null;
}
