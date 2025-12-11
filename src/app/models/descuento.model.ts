/*export interface Descuento {
  id?: string;
  codigo: string;
  porcentaje: number;
  activo: boolean;
  fecha_creacion?: string;
}*/

export interface Descuento {
  id?: string;
  codigo: string;
  tipo?: 'porcentaje' | 'cantidad';  // ✨ NUEVO
  porcentaje?: number;                // Ahora es opcional
  cantidad_oferta?: number;           // ✨ NUEVO
  cantidad_paga?: number;             // ✨ NUEVO
  aplica_mas_caro?: boolean;          // ✨ NUEVO
  activo: boolean;
  fecha_creacion?: string;
}