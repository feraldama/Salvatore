export type TipoMarcacion = 'ENTRADA' | 'SALIDA' | 'PAUSA_INICIO' | 'PAUSA_FIN';

export type ProximaMarcacion = 'ENTRADA' | 'SALIDA' | 'COMPLETADO';

export interface ResumenDia {
  proxima: ProximaMarcacion;
  permiteMobile: boolean;
  nombre: string;
}

export interface MarcacionRegistrada {
  marc_codigo: number;
  marc_fecha_hora: string;
  marc_tipo: TipoMarcacion;
}
