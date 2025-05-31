export interface Descuento {
  id?: string;
  codigo: string;
  porcentaje: number;
  activo: boolean;
  fecha_creacion?: string;
}