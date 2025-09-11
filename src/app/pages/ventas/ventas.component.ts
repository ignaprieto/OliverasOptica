import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../services/supabase.service';
import { Producto } from '../../models/producto.model';
import { RouterModule } from '@angular/router';
import { MonedaArsPipe } from '../../pipes/moneda-ars.pipe';

@Component({
  selector: 'app-ventas',
  imports: [FormsModule, CommonModule, RouterModule, MonedaArsPipe],
  templateUrl: './ventas.component.html',
  styleUrl: './ventas.component.css'
})
export class VentasComponent implements OnInit {
  productos: Producto[] = [];
  carrito: { producto: Producto; cantidad: number; subtotal: number }[] = [];
  cantidades: { [id: string]: number } = {};
  filtroGeneral: string = '';

  // Estados de ordenamiento
  ordenPrecio: 'asc' | 'desc' | 'none' = 'none';
  ordenStock: 'asc' | 'desc' | 'none' = 'none';

  metodoPago = 'efectivo';
  codigoDescuento = '';
  descuentoAplicado = 0;
  totalFinal = 0;

  clienteNombre = '';
  clienteEmail = '';

  toastVisible = false;
  toastMensaje = '';
  cantidadesEnCarrito: { [key: string]: number } = {};
  procesandoVenta: boolean = false;
  toastColor = 'bg-green-600';

  constructor(private supabase: SupabaseService) {}

  async ngOnInit() {
    await this.obtenerProductos();
  }

  async obtenerProductos() {
    const { data, error } = await this.supabase.getClient().from('productos').select('*');
    if (!error && data) this.productos = data;
  }

  productosFiltrados() {
    const filtro = this.filtroGeneral.toLowerCase().trim();

    let productos = this.productos.filter(prod => {
      const enCarrito = this.carrito.find(c => c.producto.id === prod.id)?.cantidad || 0;
      const disponible = prod.cantidad_stock - enCarrito;

      return disponible > 0 && (
        prod.codigo?.toString().includes(filtro) ||
        prod.nombre?.toLowerCase().includes(filtro) ||
        prod.marca?.toLowerCase().includes(filtro) ||
        prod.categoria?.toLowerCase().includes(filtro)
      );
    });

    // Aplicar ordenamiento por precio
    if (this.ordenPrecio === 'asc') {
      productos = productos.sort((a, b) => a.precio - b.precio);
    } else if (this.ordenPrecio === 'desc') {
      productos = productos.sort((a, b) => b.precio - a.precio);
    }

    // Aplicar ordenamiento por stock
    if (this.ordenStock === 'asc') {
      productos = productos.sort((a, b) => {
        const stockA = a.cantidad_stock - (this.carrito.find(c => c.producto.id === a.id)?.cantidad || 0);
        const stockB = b.cantidad_stock - (this.carrito.find(c => c.producto.id === b.id)?.cantidad || 0);
        return stockA - stockB;
      });
    } else if (this.ordenStock === 'desc') {
      productos = productos.sort((a, b) => {
        const stockA = a.cantidad_stock - (this.carrito.find(c => c.producto.id === a.id)?.cantidad || 0);
        const stockB = b.cantidad_stock - (this.carrito.find(c => c.producto.id === b.id)?.cantidad || 0);
        return stockB - stockA;
      });
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

  // Limpiar todos los filtros de ordenamiento
  limpiarFiltros() {
    this.ordenPrecio = 'none';
    this.ordenStock = 'none';
  }

  quitarUnidad(producto: Producto) {
    const item = this.carrito.find(i => i.producto.id === producto.id);
    if (!item) return;

    item.cantidad -= 1;
    item.subtotal = item.cantidad * producto.precio;

    if (item.cantidad <= 0) {
      this.eliminarDelCarrito(producto);
    }

    this.actualizarTotal();
  }

  eliminarDelCarrito(producto: Producto) {
    this.carrito = this.carrito.filter(i => i.producto.id !== producto.id);
    this.actualizarTotal();
  }

  aumentarCantidad(prod: Producto) {
    const actual = this.cantidades[prod.id] || 0;
    const enCarrito = this.carrito.find(i => i.producto.id === prod.id)?.cantidad || 0;
    const disponible = prod.cantidad_stock - enCarrito;

    if (actual < disponible) {
      this.cantidades[prod.id] = actual + 1;
    }
  }

  disminuirCantidad(prod: Producto) {
    const actual = this.cantidades[prod.id] || 0;
    if (actual > 0) {
      this.cantidades[prod.id] = actual - 1;
    }
  }

  agregarAlCarrito(prod: Producto) {
    const cantidad = this.cantidades[prod.id];
    if (!cantidad || cantidad < 1) return;

    const existe = this.carrito.find(item => item.producto.id === prod.id);
    if (existe) {
      existe.cantidad += cantidad;
      existe.subtotal = existe.cantidad * prod.precio;
    } else {
      this.carrito.push({ producto: prod, cantidad, subtotal: cantidad * prod.precio });
    }

    this.cantidades[prod.id] = 0;
    this.actualizarTotal();
  }

  actualizarTotal() {
    const totalSinDescuento = this.carrito.reduce((acc, item) => acc + item.subtotal, 0);
    this.totalFinal = totalSinDescuento * (1 - this.descuentoAplicado / 100);
  }

  async aplicarDescuento() {
    if (!this.codigoDescuento) return;

    const { data, error } = await this.supabase
      .getClient()
      .from('descuentos')
      .select('*')
      .eq('codigo', this.codigoDescuento)
      .eq('activo', true)
      .single();

    if (data) {
      this.descuentoAplicado = data.porcentaje;
      this.actualizarTotal();

      this.toastMensaje = ' Descuento aplicado correctamente.';
      this.toastColor = 'bg-green-600';
      this.toastVisible = true;
      setTimeout(() => {
        this.toastVisible = false;
        this.toastColor = 'bg-green-600';
      }, 2500);
    } else {
      this.descuentoAplicado = 0;
      this.codigoDescuento = '';

      this.toastMensaje = ' Código de descuento inválido o inactivo.';
      this.toastColor = 'bg-red-600';
      this.toastVisible = true;
      setTimeout(() => {
        this.toastVisible = false;
        this.toastColor = 'bg-green-600';
      }, 2500);

      this.actualizarTotal();
    }
  }

  async confirmarVenta() {
    if (this.procesandoVenta) return;
    this.procesandoVenta = true;

    const totalSinDesc = this.carrito.reduce((acc, item) => acc + item.subtotal, 0);
    const totalFinal = this.totalFinal;

    const { data: sessionData, error: sessionError } = await this.supabase.getClient().auth.getSession();
    const usuario = sessionData.session?.user;

    if (!usuario) {
      alert('No se pudo obtener el usuario.');
      this.procesandoVenta = false;
      return;
    }

    const usuario_id = usuario.id;
    const usuario_nombre = usuario.user_metadata?.['nombre'] || 'Desconocido';

    const { data: venta, error } = await this.supabase.getClient().from('ventas').insert({
      usuario_id,
      usuario_nombre,
      cliente_nombre: this.clienteNombre,
      cliente_email: this.clienteEmail,
      metodo_pago: this.metodoPago,
      total_sin_desc: totalSinDesc,
      descuento_aplicado: this.descuentoAplicado,
      total_final: totalFinal,
    }).select().single();

    if (error || !venta) {
      alert('Error al guardar la venta');
      this.procesandoVenta = false;
      return;
    }

    for (const item of this.carrito) {
      await this.supabase.getClient().from('detalle_venta').insert({
        venta_id: venta.id,
        producto_id: item.producto.id,
        cantidad: item.cantidad,
        precio_unitario: item.producto.precio,
        subtotal: item.subtotal,
        talle: item.producto.talle
      });

      await this.supabase.getClient()
        .from('productos')
        .update({ cantidad_stock: item.producto.cantidad_stock - item.cantidad })
        .eq('id', item.producto.id);
    }

    this.toastMensaje = ' Venta confirmada correctamente.';
    this.toastColor = 'bg-green-600';
    this.toastVisible = true;

    setTimeout(() => {
      this.toastVisible = false;
    }, 3000);

    this.resetearFormulario();
    await this.obtenerProductos();
    this.procesandoVenta = false;
  }

  resetearFormulario() {
    this.carrito = [];
    this.clienteNombre = '';
    this.clienteEmail = '';
    this.codigoDescuento = '';
    this.descuentoAplicado = 0;
    this.totalFinal = 0;
    this.cantidades = {};
  }

  quitarDescuento() {
    this.descuentoAplicado = 0;
    this.codigoDescuento = '';
    this.actualizarTotal();

    this.toastMensaje = 'Descuento eliminado.';
    this.toastColor = 'bg-red-600';
    this.toastVisible = true;
    setTimeout(() => {
      this.toastVisible = false; 
      this.toastColor = 'bg-green-600';
    }, 2500);
  }
}