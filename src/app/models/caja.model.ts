export interface Caja {
  id: string;
  fecha_apertura: string;
  fecha_cierre: string | null;
  hora_apertura_auto: string | null; // Formato HH:MM
  hora_cierre_auto: string | null; // Formato HH:MM
  monto_inicial: number;
  monto_actual: number;
  monto_cierre: number | null;
  estado: 'abierta' | 'cerrada';
  usuario_apertura: string;
  usuario_cierre: string | null;
  apertura_manual: boolean;
  cierre_manual: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface MovimientoCaja {
  id: string;
  caja_id: string;
  tipo: 'ingreso' | 'egreso';
  concepto: string;
  monto: number;
  metodo: 'efectivo' | 'transferencia' | 'tarjeta' | 'otro';
  venta_id: string | null;
  usuario_id: string;
  usuario_nombre: string;
  observaciones: string | null;
  created_at: string;
}

export interface ConfiguracionCaja {
  id: string;
  hora_apertura_auto: string; // Formato HH:MM
  hora_cierre_auto: string; // Formato HH:MM
  apertura_automatica_habilitada: boolean;
  cierre_automatico_habilitado: boolean;
  monto_inicial_default: number;
  created_at?: string;
  updated_at?: string;
}

export interface ResumenCaja {
  montoInicial: number;
  totalIngresos: number;
  totalEgresos: number;
  montoFinal: number;
  ventasEfectivo: number;
  cantidadMovimientos: number;
}