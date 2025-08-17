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

  organizarPorCategoria() {
    const agrupados = this.productos.reduce((acc: any, prod: any) => {
      acc[prod.categoria] = acc[prod.categoria] || [];
      acc[prod.categoria].push(prod);
      return acc;
    }, {});

    this.categorias = Object.keys(agrupados);
    this.productosPorCategoria = agrupados;

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
        ? productos
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

  toggleTodos(categoria: string) {
    const seleccionarTodos = this.aumentarTodaCategoria[categoria];
    const productos = this.productosPorCategoria[categoria];
    
    if (seleccionarTodos) {
      // Si se selecciona toda la categoría, marcar todos los productos
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

  toggleProducto(id: string) {
    this.productosSeleccionados[id] = !this.productosSeleccionados[id];
  }

  seSeleccionoAlgo(): boolean {
    // Verificar si hay alguna categoría completa seleccionada
    const hayCategoriasSeleccionadas = Object.values(this.aumentarTodaCategoria).some(s => s);
    
    // Verificar si hay productos individuales seleccionados
    const hayProductosSeleccionados = Object.values(this.productosSeleccionados).some(s => s);
    
    return hayCategoriasSeleccionadas || hayProductosSeleccionados;
  }

  pasarAPasoConfirmacion() {
    this.resumenAumento = [];

    for (const categoria of this.categorias) {
      if (this.aumentarTodaCategoria[categoria]) {
        this.resumenAumento.push(`Toda la categoría "${categoria}"`);
      } else {
        const seleccionados = this.productosPorCategoria[categoria]
          .filter(p => this.productosSeleccionados[p.id])
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
}