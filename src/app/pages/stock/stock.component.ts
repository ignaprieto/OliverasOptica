import { Component, OnInit } from '@angular/core';
import { Producto } from '../../models/producto.model';
import { SupabaseService } from '../../services/supabase.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { MonedaArsPipe } from '../../pipes/moneda-ars.pipe';


@Component({
  selector: 'app-stock',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, MonedaArsPipe],
  templateUrl: './stock.component.html',
})
export class StockComponent implements OnInit {
  productos: Producto[] = [];
  modo: 'agregar' | 'editar' = 'agregar';
  mensaje: string = '';
  error: string = '';
  filtro: string = '';
  producto: Producto = this.nuevoProducto();
mostrarToast: boolean = false;
mostrarConfirmacion = false;
idAEliminar: string | null = null;

 // Estados de ordenamiento
  ordenPrecio: 'asc' | 'desc' | 'none' = 'none';
  ordenStock: 'asc' | 'desc' | 'none' = 'none';


  filtroEstado: 'todos' | 'activos' | 'desactivados' = 'activos';

  constructor(private supabase: SupabaseService) {}

  ngOnInit() {
    this.obtenerProductos();
  }


  mostrarMensaje(msg: string) {
  this.mensaje = msg;
  this.mostrarToast = true;
  setTimeout(() => {
    this.mostrarToast = false;
  }, 3000);
}

  productosFiltrados(): Producto[] {
  const termino = this.filtro.toLowerCase();
  let productos = this.productos.filter(p => {
    // Filtro por estado (activo/desactivado)
    if (this.filtroEstado === 'activos' && !p.activo) return false;
    if (this.filtroEstado === 'desactivados' && p.activo) return false;
    
    // Filtro por texto
    return p.codigo.toLowerCase().includes(termino) ||
      p.nombre.toLowerCase().includes(termino) ||
      p.marca.toLowerCase().includes(termino) ||
      p.categoria.toLowerCase().includes(termino);
  });

  // Aplicar ordenamiento por precio
  if (this.ordenPrecio === 'asc') {
    productos = productos.sort((a, b) => a.precio - b.precio);
  } else if (this.ordenPrecio === 'desc') {
    productos = productos.sort((a, b) => b.precio - a.precio);
  }
  
  // Aplicar ordenamiento por stock
  else if (this.ordenStock === 'asc') {
    productos = productos.sort((a, b) => a.cantidad_stock - b.cantidad_stock);
  } else if (this.ordenStock === 'desc') {
    productos = productos.sort((a, b) => b.cantidad_stock - a.cantidad_stock);
  }

  return productos;
}

  // Alternar ordenamiento por precio: none -> desc -> asc -> none
  toggleOrdenPrecio() {
    // Resetear ordenamiento por stock cuando se active precio
    this.ordenStock = 'none';
    
    if (this.ordenPrecio === 'none') {
      this.ordenPrecio = 'desc'; // Primer click: mayor a menor
    } else if (this.ordenPrecio === 'desc') {
      this.ordenPrecio = 'asc';  // Segundo click: menor a mayor
    } else {
      this.ordenPrecio = 'none'; // Tercer click: sin ordenar
    }
  }

  // Alternar ordenamiento por stock: none -> desc -> asc -> none
  toggleOrdenStock() {
    // Resetear ordenamiento por precio cuando se active stock
    this.ordenPrecio = 'none';
    
    if (this.ordenStock === 'none') {
      this.ordenStock = 'desc'; // Primer click: mayor a menor
    } else if (this.ordenStock === 'desc') {
      this.ordenStock = 'asc';  // Segundo click: menor a mayor
    } else {
      this.ordenStock = 'none'; // Tercer click: sin ordenar
    }
  }

// Método para alternar estado activo/desactivado
async toggleEstadoProducto(producto: Producto) {
  const nuevoEstado = !producto.activo;
  
  const { error } = await this.supabase.getClient()
    .from('productos')
    .update({ activo: nuevoEstado })
    .eq('id', producto.id);

  if (error) {
    this.error = 'Error al cambiar el estado del producto';
    this.mostrarToast = true;
    setTimeout(() => {
      this.mostrarToast = false;
      this.error = '';
    }, 3000);
    return;
  }

  this.mostrarMensaje(`Producto ${nuevoEstado ? 'activado' : 'desactivado'} correctamente`);
  await this.obtenerProductos();
}

  // Limpiar todos los filtros de ordenamiento
  limpiarFiltros() {
    this.ordenPrecio = 'none';
    this.ordenStock = 'none';
  }

nuevoProducto(): Producto {
  return {
    codigo: '',
    nombre: '',
    marca: '',
    talle: '',
    categoria: '',
    precio: undefined as any,
    cantidad_stock: undefined as any,
    activo: true,
  } as Producto; // No incluye "id"
}

/* eliminarProducto(id: string) {
  this.idAEliminar = id;
  this.mostrarConfirmacion = true;
} */

async eliminarProducto(id: string) {
  // Consultar si el producto está asociado a alguna venta
  const { data, error } = await this.supabase.getClient()
    .from('detalle_venta')
    .select('id')
    .eq('producto_id', id)
    .limit(1);

  if (error) {
    this.error = 'Error al verificar asociaciones de venta';
    this.mostrarToast = true;
    setTimeout(() => {
      this.mostrarToast = false;
      this.error = '';
    }, 3000);
    return;
  }

  if (data && data.length > 0) {
    this.error = 'No se puede eliminar el producto: ya tiene ventas registradas.';
    this.mostrarToast = true;
    setTimeout(() => {
      this.mostrarToast = false;
      this.error = '';
    }, 3000);
    return;
  }

  // Si no hay ventas asociadas, mostrar la confirmación
  this.idAEliminar = id;
  this.mostrarConfirmacion = true;
}


 async obtenerProductos() {
  const { data, error } = await this.supabase.getClient()
    .from('productos')
    .select('*')
    .order('created_at', { ascending: false }); // Los más recientes primero
    
  if (error) {
    this.error = 'Error al obtener productos';
    return;
  }
  this.productos = data as Producto[];
}

 async guardarProducto() {
  this.mensaje = '';
  this.error = '';

  const camposObligatorios = [
    this.producto.codigo,
    this.producto.nombre,
    this.producto.marca,
    this.producto.talle,
    this.producto.categoria,
    this.producto.precio,
    this.producto.cantidad_stock,
  ];

  if (camposObligatorios.some(c => c === null || c === undefined || c.toString().trim() === '')) {
    this.error = 'Por favor completá todos los campos.';
    return;
  }

  // Asegurar que son números
  this.producto.precio = Number(this.producto.precio);
  this.producto.cantidad_stock = Number(this.producto.cantidad_stock);

  try {
    if (this.modo === 'agregar') {
      // Validar que no exista un producto con el mismo código
      const { data: existentes, error: errorBusqueda } = await this.supabase.getClient()
        .from('productos')
        .select('id')
        .eq('codigo', this.producto.codigo)
        .limit(1);

      if (errorBusqueda) throw errorBusqueda;

      if (existentes && existentes.length > 0) {
        this.error = 'Ya existe un producto con ese código.';
        return;
      }

      const { error } = await this.supabase.getClient().from('productos').insert([this.producto]);
      if (error) throw error;

      this.mostrarMensaje('Producto agregado correctamente');

    } else if (this.modo === 'editar' && this.producto.id) {
      // Obtener producto original para validar el stock
      const original = this.productos.find(p => p.id === this.producto.id);
      if (!original) {
        this.error = 'Producto original no encontrado';
        return;
      }

      if (this.producto.cantidad_stock < original.cantidad_stock) {
        this.error = `No se puede reducir el stock. El valor actual es ${original.cantidad_stock}.`;
        return;
      }

      const { error } = await this.supabase
        .getClient()
        .from('productos')
        .update(this.producto)
        .eq('id', this.producto.id);

      if (error) throw error;

      this.mostrarMensaje('Producto actualizado correctamente');
    }

    this.producto = this.nuevoProducto();
    this.modo = 'agregar';
    await this.obtenerProductos();
  } catch (error: any) {
    this.error = error.message || 'Error al guardar el producto';
  }
}


  seleccionarProducto(producto: Producto) {
    this.producto = { ...producto };
    this.modo = 'editar';
    this.mensaje = '';
    this.error = '';
  }

  cancelarEdicion() {
    this.producto = this.nuevoProducto();
    this.modo = 'agregar';
    this.mensaje = '';
    this.error = '';
  }

  async confirmarEliminar() {
  if (!this.idAEliminar) return;

  const { error } = await this.supabase.getClient()
    .from('productos')
    .delete()
    .eq('id', this.idAEliminar);

  if (!error) {
    this.mostrarMensaje('Producto eliminado correctamente');
    this.producto = this.nuevoProducto();
    this.modo = 'agregar';
    await this.obtenerProductos();
  }

  this.idAEliminar = null;
  this.mostrarConfirmacion = false;
}

cancelarEliminar() {
  this.mostrarConfirmacion = false;
  this.idAEliminar = null;
}

}
