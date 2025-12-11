import { Producto } from "./producto.model";

export interface Promocion {
  id?: string;
  nombre: string;
  descripcion?: string;
  porcentaje: number;
  fecha_inicio: string;
  fecha_fin: string;
  activa: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface PromocionProducto {
  id?: string;
  promocion_id: string;
  producto_id: string;
  created_at?: string;
}

export interface PromocionConProductos extends Promocion {
  productos?: Producto[];
  cantidad_productos?: number;
}