import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../services/supabase.service';
import { RouterModule } from '@angular/router';
import { MonedaArsPipe } from '../../pipes/moneda-ars.pipe';
import { ThemeService } from '../../services/theme.service';
import { Subject, Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { PermisoDirective } from '../../directives/permiso.directive';

interface ProductoAumento {
  id: string;
  codigo: string;
  nombre: string;
  marca: string;
  categoria: string;
  precio: number;
  cantidad_stock: number;
  cantidad_deposito: number;
  activo: boolean;
}

@Component({
  selector: 'app-aumento',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, MonedaArsPipe, PermisoDirective],
  templateUrl: './aumento.component.html',
  styleUrl: './aumento.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AumentoComponent implements OnInit, OnDestroy {
  private supabase = inject(SupabaseService);
  public themeService = inject(ThemeService);

  // Columnas específicas para consultas optimizadas
  private readonly COLUMNAS_CATEGORIA = 'categoria';
  private readonly COLUMNAS_PRODUCTO = 'id, codigo, nombre, marca, categoria, precio, cantidad_stock, cantidad_deposito, activo';

  // --- SIGNALS PARA ESTADO DEL COMPONENTE ---
  isLoading = signal(true);
  cargandoProductosCategoria = signal<{ [key: string]: boolean }>({});

  // Datos
  categorias = signal<string[]>([]);
  productosPorCategoria = signal<{ [key: string]: ProductoAumento[] }>({});
  
  // Selección
  seleccionados = signal<Set<string>>(new Set());
  aumentarTodaCategoria = signal<{ [key: string]: boolean }>({});
  expandido = signal<{ [key: string]: boolean }>({});
  
  // Configuración del Aumento
  valorAumento = signal<number | null>(null);
  tipoAumento = signal<'precio' | 'porcentaje' | null>(null);
  
  // UI
  paso = signal(1);
  confirmando = signal(false);
  toastVisible = signal(false);
  toastMensaje = signal('');
  toastColor = signal('');
  resumenAumento = signal<string[]>([]);
  errorAumentoInvalido = signal(false);

  // Filtro Global
  private searchSubject = new Subject<string>();
  private searchSubscription: Subscription | null = null;
  private _filtroTexto = signal('');
  
  // Getter/Setter para mantener compatibilidad con ngModel
  get filtroTexto(): string {
    return this._filtroTexto();
  }
  set filtroTexto(value: string) {
    this._filtroTexto.set(value);
  }

  // Paginación de Categorías
  paginaActual = signal(1);
  readonly categoriasPorPagina = 10;

  private toastTimeout?: any;
  Math = Math;

  // --- COMPUTED SIGNALS ---
  totalPaginas = computed(() => 
    Math.ceil(this.categorias().length / this.categoriasPorPagina)
  );

  categoriasVisibles = computed(() => {
    const inicio = (this.paginaActual() - 1) * this.categoriasPorPagina;
    return this.categorias().slice(inicio, inicio + this.categoriasPorPagina);
  });

  async ngOnInit() {
    this.isLoading.set(true);
    
    this.searchSubscription = this.searchSubject.pipe(
      debounceTime(500),
      distinctUntilChanged()
    ).subscribe(texto => {
      this.filtrarProductosGlobal(texto);
    });

    await this.cargarCategoriasUnicas();
    this.isLoading.set(false);
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
        .select(this.COLUMNAS_CATEGORIA)
        .eq('activo', true)
        .eq('eliminado', false);

      if (error) throw error;

      const categoriasUnicas = new Set((data || []).map((p: any) => p.categoria));
      this.categorias.set(Array.from(categoriasUnicas).sort());
      
    } catch (error) {
      console.error('Error cargando categorías:', error);
      this.mostrarError('Error al cargar categorías');
    }
  }

  async toggleCategoria(categoria: string) {
    this.expandido.update(exp => ({
      ...exp,
      [categoria]: !exp[categoria]
    }));

    const expandidoActual = this.expandido();
    const productosActuales = this.productosPorCategoria();
    
    if (expandidoActual[categoria] && !productosActuales[categoria]) {
      await this.cargarProductosDeCategoria(categoria);
    }
  }

  async cargarProductosDeCategoria(categoria: string) {
    this.cargandoProductosCategoria.update(cargando => ({
      ...cargando,
      [categoria]: true
    }));
    
    try {
      const { data, error } = await this.supabase.getClient()
        .from('productos')
        .select(this.COLUMNAS_PRODUCTO)
        .eq('categoria', categoria)
        .eq('activo', true)
        .eq('eliminado', false)
        .order('nombre');

      if (error) throw error;

      this.productosPorCategoria.update(prods => ({
        ...prods,
        [categoria]: data || []
      }));

      const aumentarToda = this.aumentarTodaCategoria();
      if (aumentarToda[categoria]) {
        this.marcarTodosEnCategoria(categoria, true);
      }

    } catch (error) {
      console.error(`Error cargando productos de ${categoria}:`, error);
      this.mostrarError(`Error al cargar productos de ${categoria}`);
    } finally {
      this.cargandoProductosCategoria.update(cargando => ({
        ...cargando,
        [categoria]: false
      }));
    }
  }

  // ==================== LÓGICA DE SELECCIÓN ====================

  toggleSeleccion(id: string, categoria: string) {
    this.seleccionados.update(sel => {
      const nuevaSeleccion = new Set(sel);
      if (nuevaSeleccion.has(id)) {
        nuevaSeleccion.delete(id);
        this.aumentarTodaCategoria.update(atc => ({
          ...atc,
          [categoria]: false
        }));
      } else {
        nuevaSeleccion.add(id);
      }
      return nuevaSeleccion;
    });
  }

  async toggleTodos(categoria: string) {
    const aumentarTodaActual = this.aumentarTodaCategoria();
    const nuevoEstado = !aumentarTodaActual[categoria];
    
    this.aumentarTodaCategoria.update(atc => ({
      ...atc,
      [categoria]: nuevoEstado
    }));

    const productosActuales = this.productosPorCategoria();
    if (!productosActuales[categoria]) {
      await this.cargarProductosDeCategoria(categoria);
    }

    this.marcarTodosEnCategoria(categoria, nuevoEstado);
  }

  marcarTodosEnCategoria(categoria: string, seleccionar: boolean) {
    const productos = this.productosPorCategoria()[categoria] || [];
    
    this.seleccionados.update(sel => {
      const nuevaSeleccion = new Set(sel);
      productos.forEach(p => {
        if (seleccionar) {
          nuevaSeleccion.add(p.id);
        } else {
          nuevaSeleccion.delete(p.id);
        }
      });
      return nuevaSeleccion;
    });
  }

  estaProductoSeleccionado(id: string): boolean {
    return this.seleccionados().has(id);
  }

  // ==================== FILTRADO Y PAGINACIÓN ====================

  onSearchInput(valor: string) {
    this.filtroTexto = valor;
    this.searchSubject.next(valor);
  }

  async filtrarProductosGlobal(termino: string) {
    if (!termino.trim()) {
      this.resetearPaginacion();
      if (this.categorias().length === 0) await this.cargarCategoriasUnicas();
      return;
    }
    
    try {
      this.isLoading.set(true);
      const t = termino.trim();

      const { data, error } = await this.supabase.getClient()
        .from('productos')
        .select(this.COLUMNAS_PRODUCTO)
        .eq('activo', true)
        .eq('eliminado', false)
        .or(`nombre.ilike.%${t}%,marca.ilike.%${t}%,categoria.ilike.%${t}%`)
        .limit(100);

      if (error) throw error;

      const resultados = data || [];
      const nuevoProductosPorCategoria: { [key: string]: ProductoAumento[] } = {};
      const categoriasEncontradas = new Set<string>();

      resultados.forEach((prod: any) => {
        categoriasEncontradas.add(prod.categoria);
        if (!nuevoProductosPorCategoria[prod.categoria]) {
          nuevoProductosPorCategoria[prod.categoria] = [];
        }
        nuevoProductosPorCategoria[prod.categoria].push(prod);
      });

      this.productosPorCategoria.set(nuevoProductosPorCategoria);
      this.categorias.set(Array.from(categoriasEncontradas).sort());
      
      const nuevosExpandidos: { [key: string]: boolean } = {};
      Array.from(categoriasEncontradas).forEach(c => nuevosExpandidos[c] = true);
      this.expandido.set(nuevosExpandidos);
      
      this.resetearPaginacion();

    } catch (error) {
      console.error('Error en búsqueda:', error);
    } finally {
      this.isLoading.set(false);
    }
  }

  cambiarPagina(pagina: number) {
    const total = this.totalPaginas();
    if (pagina >= 1 && pagina <= total) {
      this.paginaActual.set(pagina);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  resetearPaginacion() {
    this.paginaActual.set(1);
  }

  // ==================== CONFIRMACIÓN Y APLICACIÓN ====================

  pasarAPasoConfirmacion() {
    const cantidadSeleccionados = this.seleccionados().size;
    
    if (cantidadSeleccionados === 0) {
      this.mostrarAdvertencia("Selecciona al menos un producto para continuar");
      return;
    }

    const nuevoResumen: string[] = [];
    let contadorProductos = 0;

    const productosPorCat = this.productosPorCategoria();
    Object.keys(productosPorCat).forEach(cat => {
      const productos = productosPorCat[cat];
      const seleccionadosEnCat = productos.filter(p => this.seleccionados().has(p.id));
      
      if (seleccionadosEnCat.length > 0) {
        contadorProductos += seleccionadosEnCat.length;
        
        if (seleccionadosEnCat.length === productos.length && productos.length > 1) {
          nuevoResumen.push(`Todos los productos de: ${cat}`);
        } else {
          seleccionadosEnCat.forEach(p => {
            if (nuevoResumen.length < 10) {
              nuevoResumen.push(`${p.nombre} (${p.marca})`);
            }
          });
        }
      }
    });

    if (contadorProductos > 10) {
      nuevoResumen.push(`... y ${contadorProductos - 10} productos más.`);
    }

    this.resumenAumento.set(nuevoResumen);
    this.confirmando.set(true);
  }

  calcularPrecioFinal(precioBase: number): number {
    const valor = this.valorAumento();
    const tipo = this.tipoAumento();
    
    if (!valor) return precioBase;
    
    if (tipo === 'precio') {
      return precioBase + valor;
    } else {
      return Math.round(precioBase * (1 + valor / 100));
    }
  }

  async aplicarAumento() {
    const tipo = this.tipoAumento();
    const valor = this.valorAumento();
    
    if (!tipo || valor === null) {
      this.errorAumentoInvalido.set(true);
      setTimeout(() => this.errorAumentoInvalido.set(false), 3000);
      return;
    }

    this.isLoading.set(true);
    let errores = 0;

    try {
      const productosPorCat = this.productosPorCategoria();
      const todasLasCategorias = Object.keys(productosPorCat);
      let productosParaActualizar: any[] = [];

      todasLasCategorias.forEach(cat => {
        const prods = productosPorCat[cat].filter(p => this.seleccionados().has(p.id));
        prods.forEach(p => {
          productosParaActualizar.push({
            id: p.id,
            codigo: p.codigo,
            nombre: p.nombre,
            marca: p.marca,
            categoria: p.categoria,
            precio: this.calcularPrecioFinal(p.precio),
            cantidad_stock: p.cantidad_stock,
            cantidad_deposito: p.cantidad_deposito,
            activo: p.activo
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
        await this.ngOnInit();
      } else {
        this.mostrarError(`Hubo errores en ${errores} lotes de actualización.`);
      }

    } catch (error) {
      console.error('Error crítico:', error);
      this.mostrarError('Error al aplicar el aumento');
    } finally {
      this.isLoading.set(false);
      this.confirmando.set(false);
    }
  }

  // ==================== UTILS & UI ====================

  reset() {
    this.paso.set(1);
    this.seleccionados.set(new Set());
    this.aumentarTodaCategoria.set({});
    this.valorAumento.set(null);
    this.tipoAumento.set(null);
    this.expandido.set({});
    this._filtroTexto.set('');
    this.productosPorCategoria.set({});
    this.resumenAumento.set([]);
  }

  cancelar() {
    this.confirmando.set(false);
  }

  mostrarToast(mensaje: string, tipo: 'success' | 'error' | 'info' | 'warning' = 'info', duracion = 3000) {
    this.toastMensaje.set(mensaje);
    
    let color = '';
    switch (tipo) {
      case 'success': color = 'bg-green-600'; break;
      case 'error': color = 'bg-red-600'; break;
      case 'info': color = 'bg-blue-600'; break;
      case 'warning': color = 'bg-yellow-600'; break;
      default: color = 'bg-gray-800';
    }
    this.toastColor.set(color);
    
    this.toastVisible.set(true);
    
    if (this.toastTimeout) clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => this.ocultarToast(), duracion);
  }

  ocultarToast() {
    this.toastVisible.set(false);
  }

  mostrarExito(msg: string) { this.mostrarToast(msg, 'success'); }
  mostrarError(msg: string) { this.mostrarToast(msg, 'error', 4000); }
  mostrarAdvertencia(msg: string) { this.mostrarToast(msg, 'warning'); }

  // --- TRACKBY FUNCTIONS ---
  
  trackByCategoria(index: number, categoria: string): string {
    return categoria;
  }

  trackByProductoId(index: number, producto: ProductoAumento): string {
    return producto.id;
  }

  trackByResumen(index: number, item: string): number {
    return index;
  }
}