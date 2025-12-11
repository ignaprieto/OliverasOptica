import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../services/supabase.service';
import { RouterModule } from '@angular/router';
import { MonedaArsPipe } from '../../pipes/moneda-ars.pipe';
import { ThemeService } from '../../services/theme.service';
import { Subject, Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

@Component({
  selector: 'app-aumento',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, MonedaArsPipe],
  templateUrl: './aumento.component.html',
  styleUrl: './aumento.component.css'
})
export class AumentoComponent implements OnInit, OnDestroy {
  // Estado de carga
  isLoading: boolean = true;
  cargandoProductosCategoria: { [key: string]: boolean } = {};

  // Datos
  categorias: string[] = [];
  productosPorCategoria: { [key: string]: any[] } = {};
  
  // Selección y Lógica
  seleccionados: Set<string> = new Set();
  aumentarTodaCategoria: { [key: string]: boolean } = {};
  expandido: { [key: string]: boolean } = {};
  
  // Configuración del Aumento
  valorAumento: number | null = null;
  tipoAumento: 'precio' | 'porcentaje' | null = null;
  
  // UI
  paso = 1;
  confirmando: boolean = false;
  toastVisible = false;
  toastMensaje = '';
  toastColor: string = '';
  resumenAumento: string[] = [];
  errorAumentoInvalido = false;

  // Filtro Global
  private searchSubject = new Subject<string>();
  private searchSubscription: Subscription | null = null;
  filtroTexto: string = '';

  // Paginación de Categorías
  paginaActual: number = 1;
  categoriasPorPagina: number = 10;

  private toastTimeout?: any;
  Math = Math;

  constructor(
    private supabase: SupabaseService,
    public themeService: ThemeService
  ) {}

  async ngOnInit() {
    this.isLoading = true;
    
    this.searchSubscription = this.searchSubject.pipe(
      debounceTime(500),
      distinctUntilChanged()
    ).subscribe(texto => {
      this.filtrarProductosGlobal(texto);
    });

    await this.cargarCategoriasUnicas();
    this.isLoading = false;
  }

  ngOnDestroy() {
    if (this.searchSubscription) this.searchSubscription.unsubscribe();
    if (this.toastTimeout) clearTimeout(this.toastTimeout);
  }

  // ==================== CARGA OPTIMIZADA DE DATOS ====================

  async cargarCategoriasUnicas() {
    try {
      const { data, error } = await this.supabase.getClient()
        .from('productos')
        .select('categoria')
        .eq('activo', true)
        .eq('eliminado', false);

      if (error) throw error;

      const categoriasUnicas = new Set((data || []).map((p: any) => p.categoria));
      this.categorias = Array.from(categoriasUnicas).sort();
      
    } catch (error) {
      console.error('Error cargando categorías:', error);
      this.mostrarError('Error al cargar categorías');
    }
  }

  async toggleCategoria(categoria: string) {
    this.expandido[categoria] = !this.expandido[categoria];

    if (this.expandido[categoria] && !this.productosPorCategoria[categoria]) {
      await this.cargarProductosDeCategoria(categoria);
    }
  }

  async cargarProductosDeCategoria(categoria: string) {
    this.cargandoProductosCategoria[categoria] = true;
    
    try {
      // CORRECCIÓN 1: Traemos TODOS los campos necesarios para que el upsert no falle por 'codigo null'
      const { data, error } = await this.supabase.getClient()
        .from('productos')
        .select('*') // Traemos todo para evitar problemas de constraints
        .eq('categoria', categoria)
        .eq('activo', true)
        .eq('eliminado', false)
        .order('nombre');

      if (error) throw error;

      this.productosPorCategoria[categoria] = data || [];

      if (this.aumentarTodaCategoria[categoria]) {
        this.marcarTodosEnCategoria(categoria, true);
      }

    } catch (error) {
      console.error(`Error cargando productos de ${categoria}:`, error);
      this.mostrarError(`Error al cargar productos de ${categoria}`);
    } finally {
      this.cargandoProductosCategoria[categoria] = false;
    }
  }

  // ==================== LÓGICA DE SELECCIÓN ====================

  toggleSeleccion(id: string, categoria: string) {
    if (this.seleccionados.has(id)) {
      this.seleccionados.delete(id);
      this.aumentarTodaCategoria[categoria] = false;
    } else {
      this.seleccionados.add(id);
    }
  }

  async toggleTodos(categoria: string) {
    const nuevoEstado = !this.aumentarTodaCategoria[categoria];
    this.aumentarTodaCategoria[categoria] = nuevoEstado;

    if (!this.productosPorCategoria[categoria]) {
      await this.cargarProductosDeCategoria(categoria);
    }

    this.marcarTodosEnCategoria(categoria, nuevoEstado);
  }

  marcarTodosEnCategoria(categoria: string, seleccionar: boolean) {
    const productos = this.productosPorCategoria[categoria] || [];
    productos.forEach(p => {
      if (seleccionar) {
        this.seleccionados.add(p.id);
      } else {
        this.seleccionados.delete(p.id);
      }
    });
  }

  estaProductoSeleccionado(id: string): boolean {
    return this.seleccionados.has(id);
  }

  // ==================== FILTRADO Y PAGINACIÓN ====================

  onSearchInput(valor: string) {
    this.filtroTexto = valor;
    this.searchSubject.next(valor);
  }

  async filtrarProductosGlobal(termino: string) {
    if (!termino.trim()) {
      this.resetearPaginacion();
      if (this.categorias.length === 0) await this.cargarCategoriasUnicas();
      return;
    }
    
    try {
      this.isLoading = true;
      const t = termino.trim();

      // CORRECCIÓN 2: También aquí traemos todo (*) para que si se actualiza desde el filtro no falle
      const { data, error } = await this.supabase.getClient()
        .from('productos')
        .select('*') 
        .eq('activo', true)
        .eq('eliminado', false)
        .or(`nombre.ilike.%${t}%,marca.ilike.%${t}%,categoria.ilike.%${t}%`)
        .limit(100);

      if (error) throw error;

      const resultados = data || [];
      this.productosPorCategoria = {};
      const categoriasEncontradas = new Set<string>();

      resultados.forEach((prod: any) => {
        categoriasEncontradas.add(prod.categoria);
        if (!this.productosPorCategoria[prod.categoria]) {
          this.productosPorCategoria[prod.categoria] = [];
        }
        this.productosPorCategoria[prod.categoria].push(prod);
      });

      this.categorias = Array.from(categoriasEncontradas).sort();
      this.categorias.forEach(c => this.expandido[c] = true);
      
      this.resetearPaginacion();

    } catch (error) {
      console.error('Error en búsqueda:', error);
    } finally {
      this.isLoading = false;
    }
  }

  get totalPaginas(): number {
    return Math.ceil(this.categorias.length / this.categoriasPorPagina);
  }

  get categoriasVisibles(): string[] {
    const inicio = (this.paginaActual - 1) * this.categoriasPorPagina;
    return this.categorias.slice(inicio, inicio + this.categoriasPorPagina);
  }

  cambiarPagina(pagina: number) {
    if (pagina >= 1 && pagina <= this.totalPaginas) {
      this.paginaActual = pagina;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  resetearPaginacion() {
    this.paginaActual = 1;
  }

  // ==================== CONFIRMACIÓN Y APLICACIÓN ====================

  pasarAPasoConfirmacion() {
    if (this.seleccionados.size === 0) {
      this.mostrarAdvertencia("Selecciona al menos un producto para continuar");
      return;
    }

    this.resumenAumento = [];
    let contadorProductos = 0;

    Object.keys(this.productosPorCategoria).forEach(cat => {
      const productos = this.productosPorCategoria[cat];
      const seleccionadosEnCat = productos.filter(p => this.seleccionados.has(p.id));
      
      if (seleccionadosEnCat.length > 0) {
        contadorProductos += seleccionadosEnCat.length;
        
        if (seleccionadosEnCat.length === productos.length && productos.length > 1) {
           this.resumenAumento.push(`Todos los productos de: ${cat}`);
        } else {
           seleccionadosEnCat.forEach(p => {
             if (this.resumenAumento.length < 10) {
                this.resumenAumento.push(`${p.nombre} (${p.marca})`);
             }
           });
        }
      }
    });

    if (contadorProductos > 10) {
       this.resumenAumento.push(`... y ${contadorProductos - 10} productos más.`);
    }

    this.confirmando = true;
  }

  calcularPrecioFinal(precioBase: number): number {
    if (!this.valorAumento) return precioBase;
    
    if (this.tipoAumento === 'precio') {
      return precioBase + this.valorAumento;
    } else {
      return Math.round(precioBase * (1 + this.valorAumento / 100));
    }
  }

  async aplicarAumento() {
    if (!this.tipoAumento || this.valorAumento === null) {
      this.errorAumentoInvalido = true;
      setTimeout(() => this.errorAumentoInvalido = false, 3000);
      return;
    }

    this.isLoading = true;
    let errores = 0;

    try {
      const todasLasCategorias = Object.keys(this.productosPorCategoria);
      let productosParaActualizar: any[] = [];

      todasLasCategorias.forEach(cat => {
        const prods = this.productosPorCategoria[cat].filter(p => this.seleccionados.has(p.id));
        prods.forEach(p => {
          // CORRECCIÓN 3: Enviamos TODO el objeto producto (...p)
          // Esto asegura que 'codigo' y otros campos NOT NULL estén presentes en el payload
          productosParaActualizar.push({
            ...p, 
            precio: this.calcularPrecioFinal(p.precio)
          });
        });
      });

      const CHUNK_SIZE = 500; 
      for (let i = 0; i < productosParaActualizar.length; i += CHUNK_SIZE) {
        const lote = productosParaActualizar.slice(i, i + CHUNK_SIZE);
        
        const { error } = await this.supabase.getClient()
          .from('productos')
          .upsert(lote, { onConflict: 'id' })
          .select('id');

        if (error) {
          console.error('Error en lote:', error);
          errores++;
        }
      }

      if (errores === 0) {
        this.mostrarExito(`Se actualizaron ${productosParaActualizar.length} productos correctamente.`);
        this.reset();
        this.ngOnInit();
      } else {
        this.mostrarError(`Hubo errores en ${errores} lotes de actualización.`);
      }

    } catch (error) {
      console.error('Error crítico:', error);
      this.mostrarError('Error al aplicar el aumento');
    } finally {
      this.isLoading = false;
      this.confirmando = false;
    }
  }

  // ==================== UTILS & UI ====================

  reset() {
    this.paso = 1;
    this.seleccionados.clear();
    this.aumentarTodaCategoria = {};
    this.valorAumento = null;
    this.tipoAumento = null;
    this.expandido = {};
    this.filtroTexto = '';
    this.productosPorCategoria = {};
    this.resumenAumento = [];
  }

  cancelar() {
    this.confirmando = false;
  }

  mostrarToast(mensaje: string, tipo: 'success' | 'error' | 'info' | 'warning' = 'info', duracion = 3000) {
    this.toastMensaje = mensaje;
    switch (tipo) {
      case 'success': this.toastColor = 'bg-green-600'; break;
      case 'error': this.toastColor = 'bg-red-600'; break;
      case 'info': this.toastColor = 'bg-blue-600'; break;
      case 'warning': this.toastColor = 'bg-yellow-600'; break;
      default: this.toastColor = 'bg-gray-800';
    }
    this.toastVisible = true;
    if (this.toastTimeout) clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => this.ocultarToast(), duracion);
  }

  ocultarToast() {
    this.toastVisible = false;
  }

  mostrarExito(msg: string) { this.mostrarToast(msg, 'success'); }
  mostrarError(msg: string) { this.mostrarToast(msg, 'error', 4000); }
  mostrarAdvertencia(msg: string) { this.mostrarToast(msg, 'warning'); }
}