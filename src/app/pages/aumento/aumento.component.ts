import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../services/supabase.service';
import { RouterModule } from '@angular/router';
import { MonedaArsPipe } from '../../pipes/moneda-ars.pipe';
import { ThemeService } from '../../services/theme.service';

@Component({
  selector: 'app-aumento',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, MonedaArsPipe],
  templateUrl: './aumento.component.html',
  styleUrl: './aumento.component.css'
})
export class AumentoComponent implements OnInit {
  // Propiedades para el estado de carga
  isLoading: boolean = true;

  // Propiedades existentes
  categorias: string[] = [];
  productosPorCategoria: { [key: string]: any[] } = {};
  productosPorCategoriaFiltrados: { [key: string]: any[] } = {};
  categoriaSeleccionada: string | null = null;
  seleccionados: Set<string> = new Set();
  aumentarTodaCategoria: { [key: string]: boolean } = {};
  valorAumento: number | null = null;
  productosConfirmados: any[] = [];
  paso = 1;
  expandido: { [key: string]: boolean } = {}; 
  productosSeleccionados: { [key: string]: boolean } = {};
  confirmando: boolean = false;
  tipoAumento: 'precio' | 'porcentaje' | null = null;
  toastVisible = false;
  toastMensaje = '';
  toastColor: string = '';
  resumenAumento: string[] = [];
  productos: any[] = [];
  errorAumentoInvalido = false;

  categoriasExpandidas: { [key: string]: boolean } = {};
  mostrarFiltroCategorias: boolean = false;
  categoriaFiltroSeleccionada: string | null = null;

  // Nueva propiedad para el filtro de búsqueda
  filtroTexto: string = '';

  // Propiedad para manejar timeout del toast
  private toastTimeout?: any;

  constructor(private supabase: SupabaseService,
      public themeService: ThemeService) {}

  async ngOnInit() {
    this.isLoading = true;
    await this.obtenerProductos();
    this.isLoading = false;
  }

  // ==================== MÉTODOS DE TOAST MEJORADOS ====================
  
  // Método mejorado para mostrar toast
  mostrarToast(mensaje: string, tipo: 'success' | 'error' | 'info' | 'warning' = 'info', duracion = 3000) {
    this.toastMensaje = mensaje;
    
    // Mapear tipos a las clases CSS que ya usas
    switch (tipo) {
      case 'success':
        this.toastColor = 'bg-green-600';
        break;
      case 'error':
        this.toastColor = 'bg-red-600';
        break;
      case 'info':
        this.toastColor = 'bg-blue-600';
        break;
      case 'warning':
        this.toastColor = 'bg-yellow-600';
        break;
      default:
        this.toastColor = 'bg-gray-800';
    }
    
    this.toastVisible = true;

    // Limpiar timeout anterior si existe
    if (this.toastTimeout) {
      clearTimeout(this.toastTimeout);
    }

    // Auto-ocultar después de la duración especificada
    this.toastTimeout = setTimeout(() => {
      this.ocultarToast();
    }, duracion);
  }

  // Método para ocultar toast
  ocultarToast() {
    this.toastVisible = false;
    if (this.toastTimeout) {
      clearTimeout(this.toastTimeout);
    }
  }

  // Métodos específicos para diferentes tipos de toast
  mostrarExito(mensaje: string) {
    this.mostrarToast(mensaje, 'success');
  }

  mostrarError(mensaje: string) {
    this.mostrarToast(mensaje, 'error', 4000); // Errores duran más tiempo
  }

  mostrarInfo(mensaje: string) {
    this.mostrarToast(mensaje, 'info');
  }

  mostrarAdvertencia(mensaje: string) {
    this.mostrarToast(mensaje, 'warning');
  }

  // ==================== MÉTODOS EXISTENTES ====================

  toggleSeleccion(id: string) {
    if (this.seleccionados.has(id)) {
      this.seleccionados.delete(id);
    } else {
      this.seleccionados.add(id);
    }
  }

  toggleCategoria(categoria: string) {
    this.categoriasExpandidas[categoria] = !this.categoriasExpandidas[categoria];
  }

  toggleFiltroCategorias() {
    this.mostrarFiltroCategorias = !this.mostrarFiltroCategorias;
  }

  filtrarPorCategoria(categoria: string) {
  this.categoriaFiltroSeleccionada = categoria;
  this.mostrarFiltroCategorias = false;
  
  // Limpiar filtro de texto
  this.filtroTexto = '';
  
  // Mostrar solo la categoría seleccionada
  this.productosPorCategoriaFiltrados = {
    [categoria]: this.productosPorCategoria[categoria]
  };
  
  // Expandir automáticamente la categoría filtrada
  this.categoriasExpandidas[categoria] = true;
}

  limpiarFiltroCategoria() {
  this.categoriaFiltroSeleccionada = null;
  this.mostrarFiltroCategorias = false; // Agregar esta línea para cerrar el dropdown
  
  // Si hay filtro de texto activo, aplicar solo ese filtro
  if (this.filtroTexto.trim()) {
    this.aplicarFiltro();
  } else {
    // Si no hay filtro de texto, restaurar todas las categorías
    this.productosPorCategoriaFiltrados = { ...this.productosPorCategoria };
  }
}

  continuar() {
    if (!this.categoriaSeleccionada) return;
    const productos = this.productosPorCategoria[this.categoriaSeleccionada];
    this.productosConfirmados = this.aumentarTodaCategoria
      ? productos
      : productos.filter(p => this.seleccionados.has(p.id));
    if (this.productosConfirmados.length === 0) return;
    this.paso = 2;
  }

  resetearSeleccion() {
    this.aumentarTodaCategoria = {};
    this.productosSeleccionados = {};
    this.resumenAumento = [];
  }

  // Método mejorado para filtrar productos
  aplicarFiltro() {
    // Si hay un filtro de categoría activo, mantenerlo
    if (this.categoriaFiltroSeleccionada) {
      if (!this.filtroTexto.trim()) {
        this.productosPorCategoriaFiltrados = {
          [this.categoriaFiltroSeleccionada]: this.productosPorCategoria[this.categoriaFiltroSeleccionada]
        };
        return;
      }
      
      // Filtrar dentro de la categoría seleccionada
      const textoFiltro = this.filtroTexto.toLowerCase().trim();
      const productosFiltrados = this.productosPorCategoria[this.categoriaFiltroSeleccionada].filter(producto => 
        producto.nombre.toLowerCase().includes(textoFiltro) ||
        producto.marca.toLowerCase().includes(textoFiltro)
      );
      
      this.productosPorCategoriaFiltrados = productosFiltrados.length > 0 
        ? { [this.categoriaFiltroSeleccionada]: productosFiltrados }
        : {};
      return;
    }
    
    // Lógica original cuando no hay filtro de categoría
    if (!this.filtroTexto.trim()) {
      this.productosPorCategoriaFiltrados = { ...this.productosPorCategoria };
      return;
    }

    const textoFiltro = this.filtroTexto.toLowerCase().trim();
    this.productosPorCategoriaFiltrados = {};

    Object.keys(this.productosPorCategoria).forEach(categoria => {
      const productosFiltrados = this.productosPorCategoria[categoria].filter(producto => 
        producto.nombre.toLowerCase().includes(textoFiltro) ||
        producto.categoria.toLowerCase().includes(textoFiltro) ||
        producto.marca.toLowerCase().includes(textoFiltro)
      );

      if (productosFiltrados.length > 0) {
        this.productosPorCategoriaFiltrados[categoria] = productosFiltrados;
        // Auto-expandir categorías que tienen resultados
        this.categoriasExpandidas[categoria] = true;
      }
    });
  }

  // Método para obtener las categorías filtradas
  get categoriasFiltradas(): string[] {
    return Object.keys(this.productosPorCategoriaFiltrados);
  }

  // Método para limpiar el filtro
  limpiarFiltro() {
    this.filtroTexto = '';
    this.limpiarFiltroCategoria();
  }

  organizarPorCategoria() {
    const agrupados = this.productos.reduce((acc: any, prod: any) => {
      acc[prod.categoria] = acc[prod.categoria] || [];
      acc[prod.categoria].push(prod);
      return acc;
    }, {});

    this.categorias = Object.keys(agrupados);
    this.productosPorCategoria = agrupados;
    this.productosPorCategoriaFiltrados = { ...agrupados };

    this.categorias.forEach(cat => {
      this.expandido[cat] = false;
      this.aumentarTodaCategoria[cat] = false;
    });
  }

  async obtenerProductos() {
    const { data, error } = await this.supabase.getClient()
      .from('productos')
      .select('*');

    if (error) {
      console.error('Error al obtener productos', error.message);
      this.mostrarError('Error al cargar los productos');
      return;
    }

    this.productos = data || [];
    this.organizarPorCategoria();
  }

  async aplicarAumento() {
    if (!this.tipoAumento || this.valorAumento === null) {
      this.errorAumentoInvalido = true;
      setTimeout(() => {
        this.errorAumentoInvalido = false;
      }, 3000);
      return;
    }

    this.errorAumentoInvalido = false;

    const productosParaActualizar: any[] = [];
    let huboError = false;

    for (const cat of this.categorias) {
      const todos = this.aumentarTodaCategoria[cat];
      const productos = this.productosPorCategoria[cat];

      const filtrados = todos
        ? productos.filter(p => this.productosSeleccionados[p.id] !== false) // Solo excluir los explícitamente deseleccionados
        : productos.filter(p => this.productosSeleccionados[p.id]);

      for (const prod of filtrados) {
        let nuevoPrecio = prod.precio;

        if (this.tipoAumento === 'precio') {
          nuevoPrecio += this.valorAumento!;
        } else if (this.tipoAumento === 'porcentaje') {
          nuevoPrecio += prod.precio * (this.valorAumento! / 100);
        }

        const { error } = await this.supabase.getClient()
          .from('productos')
          .update({ precio: Math.round(nuevoPrecio) })
          .eq('id', prod.id);

        if (error) {
          console.error(`Error al actualizar producto ${prod.nombre}:`, error.message);
          huboError = true;
        } else {
          productosParaActualizar.push(prod.id);
        }
      }
    }

    // Usar los nuevos métodos de toast
    if (productosParaActualizar.length > 0 && !huboError) {
      this.mostrarExito('¡Aumento aplicado correctamente!');
    } else {
      this.mostrarError('Hubo un error al aplicar el aumento');
    }

    setTimeout(() => {
      this.confirmando = false;
      this.valorAumento = null;
      this.tipoAumento = null;
      this.resetearSeleccion();
      this.obtenerProductos();
    }, 2500);
  }

  reset() {
    this.paso = 1;
    this.seleccionados.clear();
    this.categoriaSeleccionada = null;
    this.aumentarTodaCategoria = {};
    this.productosConfirmados = [];
    this.valorAumento = 0;
  }

  // Método mejorado para manejar la selección de toda la categoría
  toggleTodos(categoria: string) {
    const seleccionarTodos = this.aumentarTodaCategoria[categoria];
    const productos = this.productosPorCategoria[categoria];
    
    if (seleccionarTodos) {
      // Si se selecciona toda la categoría, marcar todos los productos como true
      productos.forEach(p => {
        this.productosSeleccionados[p.id] = true;
      });
    } else {
      // Si se deselecciona la categoría, desmarcar todos los productos
      productos.forEach(p => {
        this.productosSeleccionados[p.id] = false;
      });
    }
  }

  // Método mejorado para toggle individual de productos
  toggleProducto(id: string) {
    // Si está marcado como seleccionado, lo desmarcamos (o lo marcamos como false si toda la categoría está seleccionada)
    if (this.productosSeleccionados[id]) {
      this.productosSeleccionados[id] = false;
    } else {
      this.productosSeleccionados[id] = true;
    }
  }

  // Método para verificar si un producto está efectivamente seleccionado
  estaProductoSeleccionado(productoId: string, categoria: string): boolean {
    // Si toda la categoría está seleccionada y el producto no está explícitamente deseleccionado
    if (this.aumentarTodaCategoria[categoria] && this.productosSeleccionados[productoId] !== false) {
      return true;
    }
    // Si el producto está explícitamente seleccionado
    return this.productosSeleccionados[productoId] === true;
  }

  seSeleccionoAlgo(): boolean {
    // Verificar si hay alguna categoría completa seleccionada
    const hayCategoriasSeleccionadas = Object.keys(this.aumentarTodaCategoria).some(categoria => {
      if (!this.aumentarTodaCategoria[categoria]) return false;
      
      // Verificar que al menos un producto de la categoría no esté explícitamente deseleccionado
      const productos = this.productosPorCategoria[categoria];
      return productos.some(p => this.productosSeleccionados[p.id] !== false);
    });
    
    // Verificar si hay productos individuales seleccionados
    const hayProductosSeleccionados = Object.keys(this.productosSeleccionados).some(id => 
      this.productosSeleccionados[id] === true
    );
    
    return hayCategoriasSeleccionadas || hayProductosSeleccionados;
  }

  pasarAPasoConfirmacion() {
    this.resumenAumento = [];

    for (const categoria of this.categorias) {
      if (this.aumentarTodaCategoria[categoria]) {
        const productos = this.productosPorCategoria[categoria];
        const productosSeleccionados = productos.filter(p => this.productosSeleccionados[p.id] !== false);
        
        if (productosSeleccionados.length === productos.length) {
          this.resumenAumento.push(`Toda la categoría "${categoria}"`);
        } else {
          const seleccionados = productosSeleccionados
            .map(p => `${p.nombre} - $${p.precio.toLocaleString()}`);
          this.resumenAumento.push(...seleccionados);
        }
      } else {
        const seleccionados = this.productosPorCategoria[categoria]
          .filter(p => this.productosSeleccionados[p.id] === true)
          .map(p => `${p.nombre} - $${p.precio.toLocaleString()}`);
        this.resumenAumento.push(...seleccionados);
      }
    }
    
    if (this.seSeleccionoAlgo()) {
      this.confirmando = true;
    } else {
      // Usar el nuevo método de toast
      this.mostrarAdvertencia("Selecciona al menos un producto para continuar");
    }
  }

  cancelar() {
    this.confirmando = false;
    this.valorAumento = null;
    this.tipoAumento = null;
    this.errorAumentoInvalido = false;
  }

  // Método para manejar clicks fuera del modal
  cancelarSiClickAfuera(event: Event) {
    // Este método se puede implementar si necesitas cerrar el modal al hacer click afuera
    // Por ahora solo previente la propagación del evento
    event.stopPropagation();
  }

  // Método para calcular preview del aumento
  calcularPreview(precioBase: number): number {
    if (!this.valorAumento || !this.tipoAumento) return precioBase;
    
    if (this.tipoAumento === 'precio') {
      return precioBase + this.valorAumento;
    } else {
      return precioBase + (precioBase * (this.valorAumento / 100));
    }
  }

  // Métodos para tracking y conteo

  // Método para tracking de categorías en *ngFor
  trackByCategoria(index: number, categoria: string): string {
    return categoria;
  }

  // Método para obtener el total de productos en todas las categorías
  obtenerTotalProductos(): number {
    return this.productos.length;
  }

  // Método para obtener la cantidad de productos en una categoría específica
  obtenerCantidadProductosCategoria(categoria: string): number {
    return this.productosPorCategoria[categoria]?.length || 0;
  }

  // Método para obtener la cantidad de productos seleccionados
  obtenerCantidadProductosSeleccionados(): number {
    let contador = 0;
    
    for (const categoria of this.categorias) {
      if (this.aumentarTodaCategoria[categoria]) {
        // Si toda la categoría está seleccionada, contar los que no están explícitamente deseleccionados
        const productos = this.productosPorCategoria[categoria];
        contador += productos.filter(p => this.productosSeleccionados[p.id] !== false).length;
      } else {
        // Contar solo los productos explícitamente seleccionados
        const productos = this.productosPorCategoria[categoria];
        contador += productos.filter(p => this.productosSeleccionados[p.id] === true).length;
      }
    }
    
    return contador;
  }

  // Método para cerrar el filtro de categorías
  cerrarFiltroCategorias(): void {
    this.mostrarFiltroCategorias = false;
  }

  // Método para limpiar timeout al destruir el componente
  ngOnDestroy() {
    if (this.toastTimeout) {
      clearTimeout(this.toastTimeout);
    }
  }
}