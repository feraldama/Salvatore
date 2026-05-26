// DTOs alineados con el backend del CRM (`backend/src/modules/hr/services/ausencia.service.js`
// y `tipoAusencia.service.js`).
// Convención: el CRM devuelve columnas Postgres EN MAYÚSCULAS (sin alias) y los
// joins/agregados en snake_case minúscula.

export type EstadoAusencia =
  | 'solicitada'
  | 'aprobada'
  | 'rechazada'
  | 'en_curso'
  | 'finalizada'
  | 'cancelada';

export interface TipoAusencia {
  ID: number;
  CODIGO: string;
  NOMBRE: string;
  DESCRIPCION: string | null;
  REMUNERADO: boolean;
  DIAS_MAX_ANUALES: number | null;
  REQUIERE_ADJUNTO: boolean;
  AUTO_APROBADA: boolean;
  COLOR: string;
  ACTIVO: boolean;
}

export interface Ausencia {
  ID: number;
  USUARIO_ID: number;
  TIPO_ID: number;
  FECHA_INICIO: string; // 'YYYY-MM-DD' o ISO según pg — la app trata como string puro
  FECHA_FIN: string;
  DIAS: string | number;
  ESTADO: EstadoAusencia;
  MOTIVO: string | null;
  APROBADOR_ID: number | null;
  FECHA_DECISION: string | null;
  COMENTARIO_APROBADOR: string | null;
  ADJUNTO_URL: string | null;
  CREATED_AT: string;
  UPDATED_AT: string;

  // Joins resueltos por el service
  usuario_nombre: string;
  usuario_email: string | null;
  usuario_avatar: string | null;
  usuario_departamento_id: number | null;
  usuario_departamento: string | null;
  tipo_nombre: string;
  tipo_codigo: string;
  tipo_color: string;
  tipo_remunerado: boolean;
  tipo_requiere_adjunto: boolean;
  tipo_auto_aprobada: boolean;
  aprobador_nombre: string | null;
}

export interface ListadoAusenciasResponse {
  data: Ausencia[];
  pagination: { total: number; page: number; limit: number; totalPages: number };
}

export interface CrearAusenciaBody {
  tipoId: number;
  fechaInicio: string; // 'YYYY-MM-DD'
  fechaFin: string;
  motivo?: string;
}

export interface CatalogoTiposResponse {
  data: TipoAusencia[];
  pagination: { total: number; page: number; limit: number; totalPages: number };
}
