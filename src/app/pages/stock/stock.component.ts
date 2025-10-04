import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { Producto } from '../../models/producto.model';
import { SupabaseService } from '../../services/supabase.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { MonedaArsPipe } from '../../pipes/moneda-ars.pipe';
import { ThemeService } from '../../services/theme.service';
import JsBarcode from 'jsbarcode';

@Component({
  selector: 'app-stock',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, MonedaArsPipe],
  templateUrl: './stock.component.html',
})
export class StockComponent implements OnInit {
  @ViewChild('barcodeCanvas', { static: false }) barcodeCanvas!: ElementRef<HTMLCanvasElement>;
  
  productos: Producto[] = [];
  modo: 'agregar' | 'editar' = 'agregar';
  mensaje: string = '';
  error: string = '';
  filtro: string = '';
  producto: Producto = this.nuevoProducto();
  mostrarToast: boolean = false;
  mostrarConfirmacion = false;
  idAEliminar: string | null = null;
  codigoBarrasGenerado: string = '';
  mostrarCodigoBarras: boolean = false;

  // Estados de ordenamiento
  ordenPrecio: 'asc' | 'desc' | 'none' = 'none';
  ordenStock: 'asc' | 'desc' | 'none' = 'none';

  filtroEstado: 'todos' | 'activos' | 'desactivados' = 'activos';

  constructor(private supabase: SupabaseService, public themeService: ThemeService) {}

  ngOnInit() {
    this.obtenerProductos();
  }

  // Generar código de barras automático
  generarCodigoBarras() {
    // Generar código EAN-13 válido (12 dígitos + 1 dígito verificador)
    const timestamp = Date.now().toString();
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    const codigo = (timestamp.slice(-9) + random).slice(0, 12);
    
    // Calcular dígito verificador EAN-13
    let sum = 0;
    for (let i = 0; i < 12; i++) {
      sum += parseInt(codigo[i]) * (i % 2 === 0 ? 1 : 3);
    }
    const checkDigit = (10 - (sum % 10)) % 10;
    const codigoCompleto = codigo + checkDigit;
    
    this.producto.codigo = codigoCompleto;
    this.generarImagenCodigoBarras(codigoCompleto);
  }

  // Generar la imagen del código de barras
  generarImagenCodigoBarras(codigo: string) {
    if (!codigo || codigo.trim() === '') {
      this.mostrarCodigoBarras = false;
      return;
    }

    this.codigoBarrasGenerado = codigo;
    this.mostrarCodigoBarras = true;

    // Esperar a que el canvas esté disponible en el DOM
    setTimeout(() => {
      if (this.barcodeCanvas?.nativeElement) {
        try {
          JsBarcode(this.barcodeCanvas.nativeElement, codigo, {
            format: 'EAN13',
            width: 2,
            height: 100,
            displayValue: true,
            fontSize: 14,
            margin: 10
          });
        } catch (error) {
          console.error('Error al generar código de barras:', error);
          this.mostrarCodigoBarras = false;
        }
      }
    }, 100);
  }

  // Descargar código de barras como imagen
  descargarCodigoBarras() {
    if (!this.barcodeCanvas?.nativeElement) return;

    const canvas = this.barcodeCanvas.nativeElement;
    const url = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = `codigo-barras-${this.producto.codigo}.png`;
    link.href = url;
    link.click();
  }

  // Imprimir código de barras
  imprimirCodigoBarras() {
    if (!this.barcodeCanvas?.nativeElement) return;

    const canvas = this.barcodeCanvas.nativeElement;
    const dataUrl = canvas.toDataURL();
    
    const ventanaImpresion = window.open('', '_blank');
    if (ventanaImpresion) {
      ventanaImpresion.document.write(`
        <html>
          <head>
            <title>Imprimir Código de Barras</title>
            <style>
              body {
                display: flex;
                justify-content: center;
                align-items: center;
                height: 100vh;
                margin: 0;
              }
              img {
                max-width: 100%;
              }
            </style>
          </head>
          <body>
            <img src="${dataUrl}" onload="window.print(); window.close();" />
          </body>
        </html>
      `);
      ventanaImpresion.document.close();
    }
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
      if (this.filtroEstado === 'activos' && !p.activo) return false;
      if (this.filtroEstado === 'desactivados' && p.activo) return false;
      
      return p.codigo.toLowerCase().includes(termino) ||
        p.nombre.toLowerCase().includes(termino) ||
        p.marca.toLowerCase().includes(termino) ||
        p.categoria.toLowerCase().includes(termino);
    });

    if (this.ordenPrecio === 'asc') {
      productos = productos.sort((a, b) => a.precio - b.precio);
    } else if (this.ordenPrecio === 'desc') {
      productos = productos.sort((a, b) => b.precio - a.precio);
    } else if (this.ordenStock === 'asc') {
      productos = productos.sort((a, b) => a.cantidad_stock - b.cantidad_stock);
    } else if (this.ordenStock === 'desc') {
      productos = productos.sort((a, b) => b.cantidad_stock - a.cantidad_stock);
    }

    return productos;
  }

  toggleOrdenPrecio() {
    this.ordenStock = 'none';
    
    if (this.ordenPrecio === 'none') {
      this.ordenPrecio = 'desc';
    } else if (this.ordenPrecio === 'desc') {
      this.ordenPrecio = 'asc';
    } else {
      this.ordenPrecio = 'none';
    }
  }

  toggleOrdenStock() {
    this.ordenPrecio = 'none';
    
    if (this.ordenStock === 'none') {
      this.ordenStock = 'desc';
    } else if (this.ordenStock === 'desc') {
      this.ordenStock = 'asc';
    } else {
      this.ordenStock = 'none';
    }
  }

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
    } as Producto;
  }

  async eliminarProducto(id: string) {
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

    this.idAEliminar = id;
    this.mostrarConfirmacion = true;
  }

  async obtenerProductos() {
    const { data, error } = await this.supabase.getClient()
      .from('productos')
      .select('*')
      .order('created_at', { ascending: false });
      
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

    this.producto.precio = Number(this.producto.precio);
    this.producto.cantidad_stock = Number(this.producto.cantidad_stock);

    try {
      if (this.modo === 'agregar') {
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
      this.mostrarCodigoBarras = false;
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
    
    // Generar código de barras del producto seleccionado
    if (this.producto.codigo) {
      this.generarImagenCodigoBarras(this.producto.codigo);
    }
  }

  cancelarEdicion() {
    this.producto = this.nuevoProducto();
    this.modo = 'agregar';
    this.mensaje = '';
    this.error = '';
    this.mostrarCodigoBarras = false;
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
      this.mostrarCodigoBarras = false;
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