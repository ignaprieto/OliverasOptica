import { CommonModule } from '@angular/common';
import { 
  Component, 
  OnInit, 
  ChangeDetectionStrategy, 
  signal, 
  computed, 
  inject,
  WritableSignal
} from '@angular/core';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../services/supabase.service';
import { ThemeService } from '../../services/theme.service';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';
import { PermisoDirective } from '../../directives/permiso.directive';

// Interfaces
export interface Producto {
  id: string;
  codigo: string;
  nombre: string;
  marca: string;
  categoria: string;
  talle: string;
  precio: number;
  cantidad_stock: number;
  cantidad_deposito: number;
  activo: boolean;
}

export interface Transferencia {
  id?: string;
  producto_id: string;
  tipo_transferencia: 'deposito_a_stock' | 'stock_a_deposito';
  cantidad: number;
  usuario_nombre?: string;
  usuario_id?: string;
  observaciones?: string;
  fecha_transferencia?: string;
  created_at?: string;
  producto?: { nombre: string; codigo: string };
}

@Component({
  selector: 'app-deposito',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, PermisoDirective],
  templateUrl: './deposito.component.html',
  styleUrl: './deposito.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DepositoComponent implements OnInit {
  private supabase = inject(SupabaseService);
  public themeService = inject(ThemeService);

  // Columnas optimizadas
  private readonly COLUMNAS_PROD = 'id, codigo, nombre, marca, categoria, talle, cantidad_stock, cantidad_deposito, activo';
  private readonly COLUMNAS_HIST = '*, producto:productos(nombre, codigo)';

  // Signals Principales
  productos = signal<Producto[]>([]);
  historial = signal<Transferencia[]>([]);
  categorias = signal<string[]>([]);

  // Filtros y Búsqueda (Signals)
  filtroTexto = signal('');
  filtroCategoria = signal('todas');
  vistaActiva = signal<'deposito' | 'transferir' | 'historial'>('deposito');
  
  // Filtros Historial
  filtroFechaDesde = signal('');
  filtroFechaHasta = signal('');
  
  // UI States
  cargandoProductos = signal(true);
  cargandoMas = signal(false);
  cargandoGeneral = signal(false);
  
  // Paginación Infinita Productos
  page = signal(0);
  readonly pageSize = 20;
  hasMoreProducts = signal(true);

  // Paginación Historial (Clásica por páginas)
  paginaHistorial = signal(1);
  totalHistorial = signal(0);
  readonly itemsPorPaginaHistorial = 10;

  // RxJS Bridge
  searchSubject = new Subject<string>();

  // Modales y Selecciones
  productoSeleccionado = signal<Producto | null>(null);
  cantidadTransferir = signal(1);
  tipoTransferencia = signal<'deposito_a_stock' | 'stock_a_deposito'>('deposito_a_stock');
  observaciones = signal('');
  
  mostrarModalTransferencia = signal(false);
  mostrarModalCategoria = signal(false);
  mostrarModalConfirmacion = signal(false);

  // Transferencia Masiva
  categoriaSeleccionada = signal('');
  productosCategoria = signal<Producto[]>([]); // Solo para vista previa
  tipoTransferenciaCategoria = signal<'deposito_a_stock' | 'stock_a_deposito' | null>(null);

  // Toast
isToastVisible = signal(false);
mensajeToast = signal('');
tipoMensajeToast = signal<'success' | 'error' | 'warning'>('success');
private toastTimeout: ReturnType<typeof setTimeout> | null = null;

  Math = Math;

  constructor() {
    this.searchSubject.pipe(
      debounceTime(400),
      distinctUntilChanged()
    ).subscribe((valor) => {
      this.filtroTexto.set(valor);
      this.reiniciarCargaProductos();
    });
  }

  ngOnInit() {
    this.cargarCategoriasUnicas();
    this.cargarProductos();
    this.cargarHistorial();
  }


  ngOnDestroy() {
  if (this.toastTimeout) clearTimeout(this.toastTimeout);
}
  // TrackBy fns
  trackByProducto(index: number, item: Producto) { return item.id; }
  trackByHistorial(index: number, item: Transferencia) { return item.id; }

  // ========== CARGA DE PRODUCTOS ==========

  onSearchInput(texto: string) {
    this.searchSubject.next(texto);
  }

  cambiarFiltroCategoria(cat: string) {
    this.filtroCategoria.set(cat);
    this.reiniciarCargaProductos();
  }

  reiniciarCargaProductos() {
    this.page.set(0);
    this.productos.set([]);
    this.hasMoreProducts.set(true);
    this.cargarProductos();
  }

  async cargarProductos() {
    if ((!this.hasMoreProducts() && this.page() > 0) || this.cargandoMas()) return;

    const esPrimeraCarga = this.page() === 0;
    if (esPrimeraCarga) this.cargandoProductos.set(true);
    else this.cargandoMas.set(true);

    try {
      const from = this.page() * this.pageSize;
      const to = from + this.pageSize - 1;

      let query = this.supabase.getClient()
        .from('productos')
        .select(this.COLUMNAS_PROD)
        .eq('activo', true);

      if (this.filtroCategoria() !== 'todas') {
        query = query.eq('categoria', this.filtroCategoria());
      }

      if (this.filtroTexto()) {
        const termino = this.filtroTexto();
        query = query.or(`nombre.ilike.%${termino}%,codigo.ilike.%${termino}%,marca.ilike.%${termino}%`);
      }

      const { data, error } = await query
        .order('nombre', { ascending: true })
        .range(from, to);

      if (error) throw error;

      if (data) {
        this.productos.update(prev => [...prev, ...data as Producto[]]);
        this.page.update(p => p + 1);
        if (data.length < this.pageSize) this.hasMoreProducts.set(false);
      }
    } catch (error: any) {
      this.mostrarNotificacion('Error al cargar productos', 'error');
    } finally {
      this.cargandoProductos.set(false);
      this.cargandoMas.set(false);
    }
  }

  onTableScroll(event: any) {
    const element = event.target;
    if (element.scrollHeight - element.scrollTop <= element.clientHeight + 50) {
      this.cargarProductos();
    }
  }

  // ========== TRANSFERENCIA INDIVIDUAL ==========

  abrirModalTransferencia(producto: Producto, tipo: 'deposito_a_stock' | 'stock_a_deposito') {
    this.productoSeleccionado.set(producto);
    this.tipoTransferencia.set(tipo);
    this.cantidadTransferir.set(1);
    this.observaciones.set('');
    this.mostrarModalTransferencia.set(true);
  }

  cerrarModalTransferencia() {
    this.mostrarModalTransferencia.set(false);
    this.productoSeleccionado.set(null);
  }

  // Computed para límite de transferencia
  cantidadMaximaTransferir = computed(() => {
    const p = this.productoSeleccionado();
    if (!p) return 0;
    return this.tipoTransferencia() === 'deposito_a_stock' ? p.cantidad_deposito : p.cantidad_stock;
  });

  async confirmarTransferencia() {
    const producto = this.productoSeleccionado();
    if (!producto) return;

    this.cargandoGeneral.set(true);
    try {
      const user = await this.obtenerUsuarioActual();
      const esHaciaStock = this.tipoTransferencia() === 'deposito_a_stock';
      
      const nuevaStock = esHaciaStock ? producto.cantidad_stock + this.cantidadTransferir() : producto.cantidad_stock - this.cantidadTransferir();
      const nuevaDepo = esHaciaStock ? producto.cantidad_deposito - this.cantidadTransferir() : producto.cantidad_deposito + this.cantidadTransferir();

      // 1. Actualizar producto
      const { error } = await this.supabase.getClient()
        .from('productos')
        .update({ cantidad_stock: nuevaStock, cantidad_deposito: nuevaDepo })
        .eq('id', producto.id);
      
      if (error) throw error;

      // 2. Insertar Historial
      await this.supabase.getClient()
        .from('transferencias_stock')
        .insert([{
            producto_id: producto.id,
            tipo_transferencia: this.tipoTransferencia(),
            cantidad: this.cantidadTransferir(),
            usuario_nombre: user.nombre,
            usuario_id: user.id,
            observaciones: this.observaciones() || null,
            fecha_transferencia: new Date().toISOString()
        }]);

      // 3. Actualización optimista local
      this.productos.update(lista => 
        lista.map(p => p.id === producto.id 
            ? { ...p, cantidad_stock: nuevaStock, cantidad_deposito: nuevaDepo } 
            : p
        )
      );

      this.mostrarNotificacion('Transferencia exitosa', 'success');
      this.cerrarModalTransferencia();
      this.cargarHistorial(); 

    } catch(err: any) {
       this.mostrarNotificacion(err.message, 'error');
    } finally {
       this.cargandoGeneral.set(false);
    }
  }

  // ========== TRANSFERENCIA MASIVA (OPTIMIZADA CON RPC) ==========

  abrirModalCategoria() {
    this.mostrarModalCategoria.set(true);
    this.categoriaSeleccionada.set('');
    this.productosCategoria.set([]);
  }

  async seleccionarCategoria(categoria: string) {
      this.categoriaSeleccionada.set(categoria);
      this.cargandoGeneral.set(true);
      // Solo traemos datos para "Previsualizar", la lógica pesada la hace la DB después
      const { data } = await this.supabase.getClient()
        .from('productos')
        .select(this.COLUMNAS_PROD)
        .eq('categoria', categoria)
        .eq('activo', true);
      
      this.productosCategoria.set(data as Producto[] || []);
      this.cargandoGeneral.set(false);
  }

  abrirConfirmacionTransferencia(tipo: 'deposito_a_stock' | 'stock_a_deposito') {
      if(!this.productosCategoria().length) return;
      this.tipoTransferenciaCategoria.set(tipo);
      this.mostrarModalConfirmacion.set(true);
  }

  // Computed para contar cuántos se moverán
  productosATransferir = computed(() => {
    const tipo = this.tipoTransferenciaCategoria();
    if (!tipo) return 0;
    return this.productosCategoria().filter(p => 
      tipo === 'deposito_a_stock' ? p.cantidad_deposito > 0 : p.cantidad_stock > 0
    ).length;
  });

  async confirmarTransferenciaCategoria() {
    const tipo = this.tipoTransferenciaCategoria();
    const categoria = this.categoriaSeleccionada();
    
    if (!tipo || !categoria) return;
    
    this.mostrarModalConfirmacion.set(false); // Cerrar confirmación primero
    this.cargandoGeneral.set(true);

    try {
      const user = await this.obtenerUsuarioActual();

      // LLAMADA RPC MÁGICA
      // Params: p_categoria, p_origen ('deposito'|'stock'), p_usuario_id, p_usuario_nombre
      const origen = tipo === 'deposito_a_stock' ? 'deposito' : 'stock';

      const { data, error } = await this.supabase.getClient()
        .rpc('transferencia_masiva_categoria', {
          p_categoria: categoria,
          p_origen: origen,
          p_usuario_id: user.id !== 'unknown' ? user.id : null,
          p_usuario_nombre: user.nombre
        });

      if (error) throw error;

      const procesados = (data as any)?.procesados || 0;
      this.mostrarNotificacion(`Se transfirieron ${procesados} productos correctamente`, 'success');
      
      this.mostrarModalCategoria.set(false); // Cerrar modal principal
      this.reiniciarCargaProductos(); // Recargar datos frescos
      this.cargarHistorial();
      
    } catch (error: any) {
      this.mostrarNotificacion('Error en transferencia masiva: ' + error.message, 'error');
    } finally {
      this.cargandoGeneral.set(false);
    }
  }

  // ========== HISTORIAL ==========

  async cargarHistorial() {
    const from = (this.paginaHistorial() - 1) * this.itemsPorPaginaHistorial;
    const to = from + this.itemsPorPaginaHistorial - 1;

    try {
      let query = this.supabase.getClient()
        .from('transferencias_stock')
        .select(this.COLUMNAS_HIST, { count: 'exact' });

      if (this.filtroFechaDesde()) {
        query = query.gte('fecha_transferencia', this.filtroFechaDesde() + 'T00:00:00');
      }
      if (this.filtroFechaHasta()) {
        query = query.lte('fecha_transferencia', this.filtroFechaHasta() + 'T23:59:59');
      }

      const { data, error, count } = await query
        .order('fecha_transferencia', { ascending: false })
        .range(from, to);

      if (error) throw error;

      this.historial.set(data as Transferencia[]);
      this.totalHistorial.set(count || 0);
      
    } catch (error: any) {
      this.mostrarNotificacion('Error historial: ' + error.message, 'error');
    }
  }

  cambiarVista(vista: 'deposito' | 'transferir' | 'historial') {
    this.vistaActiva.set(vista);
    if (vista === 'historial') {
      this.paginaHistorial.set(1);
      this.cargarHistorial();
    }
  }

  cambiarPaginaHistorial(pag: number) {
    this.paginaHistorial.set(pag);
    this.cargarHistorial();
  }
  
  // Computed para paginación
  totalPaginasHistorial = computed(() => Math.ceil(this.totalHistorial() / this.itemsPorPaginaHistorial) || 1);

  // ========== UTILIDADES ==========

  async cargarCategoriasUnicas() {
    const { data } = await this.supabase.getClient()
      .from('productos')
      .select('categoria')
      .eq('activo', true);
    
    if (data) {
      const uniqueCats = new Set(data.map((p: any) => p.categoria));
      this.categorias.set(Array.from(uniqueCats).filter(c => c).sort());
    }
  }

  async obtenerUsuarioActual() {
    let usuario = await this.supabase.getCurrentUser();
    if (!usuario) {
      const vTemp = this.supabase.getVendedorTemp();
      if (vTemp) usuario = vTemp;
      else {
        const stored = localStorage.getItem('user');
        if (stored) usuario = JSON.parse(stored);
      }
    }

    if (!usuario) return { id: 'unknown', nombre: 'Desconocido' };

    // Lógica Auth Supabase
    if ('user_metadata' in usuario) {
      const meta = usuario.user_metadata || {};
      let nombre = meta['nombre'] || meta['full_name'];
      if (!nombre && usuario.email) {
        nombre = usuario.email.split('@')[0];
        nombre = nombre.charAt(0).toUpperCase() + nombre.slice(1);
      }
      return { id: usuario.id || 'unknown', nombre: nombre || 'Sistema' };
    } 
    
    // Lógica Local
    if ('id' in usuario && 'nombre' in usuario) {
      return { id: (usuario as any).id, nombre: (usuario as any).nombre };
    }
    return { id: 'unknown', nombre: 'Desconocido' };
  }

  getUsuarioDisplay(nombre: string | undefined): string {
    if (!nombre) return 'Sistema';
    if (nombre.includes('@')) return nombre.split('@')[0];
    return nombre;
  }

  getNombreTipoTransferencia(tipo: string): string {
    return tipo === 'deposito_a_stock' ? 'Deposito → Mostrador' : 'Mostrador → Deposito';
  }

 mostrarNotificacion(msg: string, type: 'success' | 'error' | 'warning' = 'success') {
  if (this.toastTimeout) clearTimeout(this.toastTimeout);
  
  this.mensajeToast.set(msg);
  this.tipoMensajeToast.set(type);
  this.isToastVisible.set(true);
  
  this.toastTimeout = setTimeout(() => {
    this.isToastVisible.set(false);
  }, 3000);
}

limpiarBusqueda(): void {
  this.filtroTexto.set('');
  this.searchSubject.next('');
  this.reiniciarCargaProductos();
}
}