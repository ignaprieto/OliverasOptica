import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../services/supabase.service';
import { ThemeService } from '../../services/theme.service';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';

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
  producto?: Producto;
}

@Component({
  selector: 'app-deposito',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './deposito.component.html',
  styleUrl: './deposito.component.css'
})
export class DepositoComponent implements OnInit {
  // Datos
  productos: Producto[] = [];
  categorias: string[] = []; 
  
  // Infinite Scroll State
  page = 0;
  pageSize = 20;
  hasMoreProducts = true;
  isLoadingProducts = true; 
  isLoadingMore = false;    
  
  // RxJS
  searchSubject = new Subject<string>();

  // Utilidad
  Math = Math;
  
  // Filtros
  filtroTexto: string = '';
  filtroCategoria: string = 'todas';
  
  // Vista activa
  vistaActiva: 'deposito' | 'transferir' | 'historial' = 'deposito';
  
  // Filtros Historial
  filtroFechaDesde: string = '';
  filtroFechaHasta: string = '';
  
  // Transferencia individual
  productoSeleccionado: Producto | null = null;
  cantidadTransferir: number = 1;
  tipoTransferencia: 'deposito_a_stock' | 'stock_a_deposito' = 'deposito_a_stock';
  observaciones: string = '';
  
  // Transferencia Masiva
  categoriaSeleccionada: string = '';
  productosCategoria: Producto[] = [];
  tipoTransferenciaCategoria: 'deposito_a_stock' | 'stock_a_deposito' | null = null;
  
  // Historial
  historial: Transferencia[] = [];
  paginaActualHistorial: number = 1;
  itemsPorPaginaHistorial: number = 10;
  totalRegistrosHistorial: number = 0;
  
  // UI States
  mensaje: string = '';
  error: string = '';
  mostrarToast: boolean = false;
  toastTipo: 'success' | 'error' = 'success';
  cargandoGeneral: boolean = false;
  
  // Modales
  mostrarModalTransferencia: boolean = false;
  mostrarModalCategoria: boolean = false;
  mostrarModalConfirmacion: boolean = false;
  
  constructor(
    private supabase: SupabaseService,
    public themeService: ThemeService
  ) {
    this.searchSubject.pipe(
      debounceTime(400),
      distinctUntilChanged()
    ).subscribe(() => {
      this.cargarProductos(true);
    });
  }

  ngOnInit() {
    this.cargarCategoriasUnicas();
    this.cargarProductos(true);
    this.cargarHistorial();
  }

  // ========== MÉTODO OBTENER USUARIO (CORREGIDO) ==========
  async obtenerUsuarioActual() {
    let usuario = await this.supabase.getCurrentUser();
    
    // Si no hay sesión Supabase, buscar vendedor temporal o local
    if (!usuario) {
      const vendedorTemp = this.supabase.getVendedorTemp();
      if (vendedorTemp) {
        usuario = vendedorTemp;
      } else {
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
          usuario = JSON.parse(storedUser);
        }
      }
    }

    if (!usuario) {
      return { id: 'unknown', nombre: 'Desconocido' };
    }

    // CASO 1: Usuario de Supabase (Auth)
    if ('user_metadata' in usuario) {
      const metadata = usuario.user_metadata || {};
      
      // Prioridad: 1. Nombre en metadata, 2. Full Name, 3. Email formateado
      let nombreParaMostrar = metadata['nombre'] || metadata['full_name'];
      
      if (!nombreParaMostrar && usuario.email) {
        // Si no hay nombre, usar la primera parte del email (ej: juan de juan@mail.com)
        nombreParaMostrar = usuario.email.split('@')[0];
        // Capitalizar primera letra
        nombreParaMostrar = nombreParaMostrar.charAt(0).toUpperCase() + nombreParaMostrar.slice(1);
      }

      return {
        id: usuario.id || 'unknown',
        nombre: nombreParaMostrar || 'Sistema'
      };
    } 
    
    // CASO 2: Vendedor Local / Temporal (Objeto plano)
    if ('id' in usuario && 'nombre' in usuario) {
      return {
        id: (usuario as any).id || 'unknown',
        nombre: (usuario as any).nombre || 'Vendedor'
      };
    }

    return { id: 'unknown', nombre: 'Desconocido' };
  }

  // ========== CARGA DE PRODUCTOS ==========

  onSearchInput(texto: string) {
    this.filtroTexto = texto;
    this.searchSubject.next(texto);
  }

  onCategoriaChange() {
    this.cargarProductos(true);
  }

  async cargarProductos(reset: boolean = false) {
    if (this.isLoadingMore) return; 
    
    if (reset) {
      this.page = 0;
      this.productos = [];
      this.hasMoreProducts = true;
      this.isLoadingProducts = true; 
    } else {
      if (!this.hasMoreProducts) return;
      this.isLoadingMore = true; 
    }

    const from = this.page * this.pageSize;
    const to = from + this.pageSize - 1;

    try {
      let query = this.supabase.getClient()
        .from('productos')
        .select('*')
        .eq('activo', true);

      if (this.filtroCategoria !== 'todas') {
        query = query.eq('categoria', this.filtroCategoria);
      }

      if (this.filtroTexto.trim()) {
        const termino = this.filtroTexto.trim();
        query = query.or(`nombre.ilike.%${termino}%,codigo.ilike.%${termino}%,marca.ilike.%${termino}%`);
      }

      const { data, error } = await query
        .order('nombre', { ascending: true })
        .range(from, to);

      if (error) throw error;

      if (data) {
        if (data.length < this.pageSize) {
          this.hasMoreProducts = false;
        }
        
        this.productos = reset ? data as Producto[] : [...this.productos, ...data as Producto[]];
        this.page++;
      }
    } catch (error: any) {
      console.error('Error cargando productos:', error);
      this.mostrarNotificacion('Error al cargar productos', 'error');
    } finally {
      this.isLoadingProducts = false; 
      this.isLoadingMore = false;
    }
  }

  onTableScroll(event: any) {
    const element = event.target;
    if (element.scrollHeight - element.scrollTop <= element.clientHeight + 50) {
      this.cargarProductos(false);
    }
  }

  // ========== HISTORIAL ==========

  async cargarHistorial() {
    const from = (this.paginaActualHistorial - 1) * this.itemsPorPaginaHistorial;
    const to = from + this.itemsPorPaginaHistorial - 1;

    try {
      let query = this.supabase.getClient()
        .from('transferencias_stock')
        .select(`
          *,
          producto:productos(nombre, codigo)
        `, { count: 'exact' });

      // Filtros de fecha
      if (this.filtroFechaDesde) {
        query = query.gte('fecha_transferencia', this.filtroFechaDesde + 'T00:00:00');
      }
      if (this.filtroFechaHasta) {
        query = query.lte('fecha_transferencia', this.filtroFechaHasta + 'T23:59:59');
      }

      const { data, error, count } = await query
        .order('fecha_transferencia', { ascending: false })
        .range(from, to);

      if (error) throw error;

      this.historial = data as Transferencia[];
      this.totalRegistrosHistorial = count || 0;
      
    } catch (error: any) {
      this.mostrarNotificacion('Error cargando historial: ' + error.message, 'error');
    }
  }

  aplicarFiltroHistorial() {
    this.paginaActualHistorial = 1;
    this.cargarHistorial();
  }

  limpiarFiltroHistorial() {
    this.filtroFechaDesde = '';
    this.filtroFechaHasta = '';
    this.paginaActualHistorial = 1;
    this.cargarHistorial();
  }

  getUsuarioDisplay(nombre: string | undefined): string {
    if (!nombre) return 'Sistema';
    if (nombre.includes('@')) {
      const namePart = nombre.split('@')[0];
      return namePart.charAt(0).toUpperCase() + namePart.slice(1);
    }
    return nombre;
  }

  // ========== TRANSFERENCIA INDIVIDUAL ==========

  abrirModalTransferencia(producto: Producto, tipo: 'deposito_a_stock' | 'stock_a_deposito') {
    this.productoSeleccionado = producto;
    this.tipoTransferencia = tipo;
    this.cantidadTransferir = 1;
    this.observaciones = '';
    this.mostrarModalTransferencia = true;
  }

  cerrarModalTransferencia() {
    this.mostrarModalTransferencia = false;
    this.productoSeleccionado = null;
  }

  get cantidadMaximaTransferir(): number {
    if (!this.productoSeleccionado) return 0;
    return this.tipoTransferencia === 'deposito_a_stock' 
      ? this.productoSeleccionado.cantidad_deposito 
      : this.productoSeleccionado.cantidad_stock;
  }

  async confirmarTransferencia() {
    if (!this.productoSeleccionado) return;

    this.cargandoGeneral = true;
    try {
        // CORRECCIÓN: Usar la nueva función para obtener el nombre real
        const user = await this.obtenerUsuarioActual();
        const userName = user.nombre; 
        const userId = user.id;
        
        const producto = this.productoSeleccionado;
        const esHaciaStock = this.tipoTransferencia === 'deposito_a_stock';
        
        const nuevaStock = esHaciaStock ? producto.cantidad_stock + this.cantidadTransferir : producto.cantidad_stock - this.cantidadTransferir;
        const nuevaDepo = esHaciaStock ? producto.cantidad_deposito - this.cantidadTransferir : producto.cantidad_deposito + this.cantidadTransferir;

        const { error } = await this.supabase.getClient()
          .from('productos')
          .update({cantidad_stock: nuevaStock, cantidad_deposito: nuevaDepo})
          .eq('id', producto.id);
        
        if(error) throw error;

        await this.supabase.getClient()
          .from('transferencias_stock')
          .insert([{
            producto_id: producto.id,
            tipo_transferencia: this.tipoTransferencia,
            cantidad: this.cantidadTransferir,
            usuario_nombre: userName, // Usamos el nombre limpio
            usuario_id: userId,
            observaciones: this.observaciones || null,
            fecha_transferencia: new Date().toISOString()
        }]);

        // Actualizar array localmente
        const index = this.productos.findIndex(p => p.id === producto.id);
        if (index !== -1) {
            this.productos[index].cantidad_stock = nuevaStock;
            this.productos[index].cantidad_deposito = nuevaDepo;
        }

        this.mostrarNotificacion('Transferencia exitosa', 'success');
        this.cerrarModalTransferencia();
        // Recargar historial para ver el nuevo registro
        this.cargarHistorial(); 
    } catch(err:any) {
        this.mostrarNotificacion(err.message, 'error');
    } finally {
        this.cargandoGeneral = false;
    }
  }

  // ========== TRANSFERENCIA MASIVA ==========

  abrirModalCategoria() {
    this.mostrarModalCategoria = true;
    this.categoriaSeleccionada = '';
    this.productosCategoria = [];
  }

  cerrarModalCategoria() {
    this.mostrarModalCategoria = false;
  }
  
  async seleccionarCategoria(categoria: string) {
      this.categoriaSeleccionada = categoria;
      this.cargandoGeneral = true;
      const { data } = await this.supabase.getClient()
        .from('productos')
        .select('*')
        .eq('categoria', categoria)
        .eq('activo', true);
      this.productosCategoria = data as Producto[] || [];
      this.cargandoGeneral = false;
  }

  abrirConfirmacionTransferencia(tipo: 'deposito_a_stock' | 'stock_a_deposito') {
      if(!this.productosCategoria.length) return;
      this.tipoTransferenciaCategoria = tipo;
      this.mostrarModalConfirmacion = true;
  }

  cerrarModalConfirmacion() {
    this.mostrarModalConfirmacion = false;
  }

  get productosATransferir(): number {
    if (!this.tipoTransferenciaCategoria) return 0;
    return this.productosCategoria.filter(p => 
      this.tipoTransferenciaCategoria === 'deposito_a_stock' 
        ? p.cantidad_deposito > 0 
        : p.cantidad_stock > 0
    ).length;
  }

  async confirmarTransferenciaCategoria() {
    if (!this.tipoTransferenciaCategoria) return;
    const tipo = this.tipoTransferenciaCategoria;
    this.cerrarModalConfirmacion();

    const productosAProcesar = this.productosCategoria.filter(p => 
      tipo === 'deposito_a_stock' ? p.cantidad_deposito > 0 : p.cantidad_stock > 0
    );

    this.cargandoGeneral = true;

    try {
      // CORRECCIÓN: Usar la nueva función para obtener el nombre real
      const user = await this.obtenerUsuarioActual();
      const userName = user.nombre;
      const userId = user.id;

      const promesas = productosAProcesar.map(async (producto) => {
        const cantidadMover = tipo === 'deposito_a_stock' ? producto.cantidad_deposito : producto.cantidad_stock;
        
        const nuevaCantidadStock = tipo === 'deposito_a_stock' ? producto.cantidad_stock + cantidadMover : 0;
        const nuevaCantidadDeposito = tipo === 'deposito_a_stock' ? 0 : producto.cantidad_deposito + cantidadMover;

        const updateProm = this.supabase.getClient()
          .from('productos')
          .update({ cantidad_stock: nuevaCantidadStock, cantidad_deposito: nuevaCantidadDeposito })
          .eq('id', producto.id);

        const historyProm = this.supabase.getClient()
          .from('transferencias_stock')
          .insert([{
            producto_id: producto.id,
            tipo_transferencia: tipo,
            cantidad: cantidadMover,
            usuario_nombre: userName,
            usuario_id: userId,
            observaciones: `Transferencia masiva: ${this.categoriaSeleccionada}`,
            fecha_transferencia: new Date().toISOString()
          }]);

        return Promise.all([updateProm, historyProm]);
      });

      await Promise.all(promesas);
      this.mostrarNotificacion(`Se transfirieron ${productosAProcesar.length} productos`, 'success');
      this.cerrarModalCategoria();
      
      this.cargarProductos(true);
      this.cargarHistorial();
      
    } catch (error: any) {
      this.mostrarNotificacion('Error en transferencia masiva', 'error');
    } finally {
      this.cargandoGeneral = false;
    }
  }

  // ========== UTILIDADES ==========

  async cargarCategoriasUnicas() {
    const { data } = await this.supabase.getClient()
      .from('productos')
      .select('categoria')
      .eq('activo', true);
    
    if (data) {
      const uniqueCats = new Set(data.map((p: any) => p.categoria));
      this.categorias = Array.from(uniqueCats).filter(c => c).sort();
    }
  }

  getTotalDeposito(): number {
    return this.productos.reduce((sum, p) => sum + (p.cantidad_deposito || 0), 0);
  }

  getTotalStock(): number {
    return this.productos.reduce((sum, p) => sum + (p.cantidad_stock || 0), 0);
  }

  cambiarVista(vista: 'deposito' | 'transferir' | 'historial') {
    this.vistaActiva = vista;
    if (vista === 'historial') {
      this.paginaActualHistorial = 1;
      this.cargarHistorial();
    }
  }

  get totalPaginasHistorial(): number {
    return Math.ceil(this.totalRegistrosHistorial / this.itemsPorPaginaHistorial) || 1;
  }

  cambiarPaginaHistorial(pag: number) {
    this.paginaActualHistorial = pag;
    this.cargarHistorial();
  }

  get paginasHistorial(): number[] {
    const total = this.totalPaginasHistorial;
    const current = this.paginaActualHistorial;
    const delta = 2;
    const range = [];
    
    for (let i = Math.max(2, current - delta); i <= Math.min(total - 1, current + delta); i++) {
      range.push(i);
    }

    if (current - delta > 2) range.unshift(-1);
    if (current + delta < total - 1) range.push(-1);

    range.unshift(1);
    if (total > 1) range.push(total);

    return range;
  }

  getNombreTipoTransferencia(tipo: string): string {
    return tipo === 'deposito_a_stock' ? 'Deposito → Mostrador' : 'Mostrador → Deposito';
  }

  mostrarNotificacion(msg: string, type: 'success' | 'error' = 'success') {
    this.mensaje = msg;
    this.toastTipo = type;
    this.mostrarToast = true;
    setTimeout(() => {
      this.mostrarToast = false;
    }, 3000);
  }

  getDepositoPorCategoria(cat: string): number { return 0; }
  getStockPorCategoria(cat: string): number { return 0; }
}