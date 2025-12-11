// src/app/models/producto.model.ts
export interface Producto {
  id: string;
  codigo: string;
  nombre: string;
  marca: string;
  talle: string;
  categoria: string;
  precio: number;
  cantidad_stock: number;
  cantidad_deposito: number;
  activo?: boolean;
  eliminado?: boolean;
  motivo_eliminacion?: string;
  eliminado_por?: string;
  eliminado_en?: string;
  created_at?: string;
  
  // Campos de promoción (calculados en frontend)
  tiene_promocion?: boolean;
  porcentaje_promocion?: number;
  precio_promocional?: number;
  nombre_promocion?: string;
}