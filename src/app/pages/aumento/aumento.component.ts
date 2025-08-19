import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../services/supabase.service';
import { RouterModule } from '@angular/router';
import { MonedaArsPipe } from '../../pipes/moneda-ars.pipe';

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

  // Nueva propiedad para el filtro de búsqueda
  filtroTexto: string = '';

  constructor(private supabase: SupabaseService) {}

  async ngOnInit() {
    this.isLoading = true;
    await this.obtenerProductos();
    this.isLoading = false;
  }

  toggleSeleccion(id: string) {
    if (this.seleccionados.has(id)) {
      this.seleccionados.delete(id);
    } else {
      this.seleccionados.add(id);
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
    this.aplicarFiltro();
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

    if (productosParaActualizar.length > 0 && !huboError) {
      this.toastMensaje = 'Aumento aplicado correctamente.';
      this.toastColor = 'bg-green-600';
    } else {
      this.toastMensaje = 'Hubo un error al aplicar el aumento.';
      this.toastColor = 'bg-red-600';
    }
    
    this.toastVisible = true;

    setTimeout(() => {
      this.toastVisible = false;
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
      this.toastMensaje = "Selecciona al menos un producto para continuar.";
      this.toastColor = 'bg-red-600';
      this.toastVisible = true;
      setTimeout(() => this.toastVisible = false, 2500);
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
    // Por ahora solo previene la propagación del evento
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
}