import { CommonModule } from '@angular/common';
import { 
  Component, 
  OnInit, 
  ChangeDetectionStrategy, 
  signal, 
  computed, 
  WritableSignal, 
  inject,
  effect
} from '@angular/core';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';
import { ClientesService, Cliente, VentaCredito, PagoCliente } from '../../services/clientes.service';
import { ThemeService } from '../../services/theme.service';
import { PermisoDirective } from '../../directives/permiso.directive';

// Interfaces
interface DetalleVenta {
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
  talle?: string;
  productos?: {
    nombre: string;
    marca: string;
    codigo: string;
  };
}

interface VentaCreditoExtendida extends VentaCredito {
  observaciones?: string;
  fecha_vencimiento?: string;
  recambio_diferencia?: number;
  recambio_metodo_pago?: string;
}

interface RecambioVenta {
  id: string;
  venta_id: string;
  productos_devueltos_json: ProductoRecambio[];
  productos_recambio_json: ProductoRecambio[];
  total_devuelto: number;
  total_recambio: number;
  diferencia_abonada: number;
  metodo_pago_diferencia: string;
  realizado_por: string;
  fecha_recambio: string;
  motivo?: string;
  observaciones?: string;
}

interface ProductoRecambio {
  producto_id: string;
  nombre: string;
  cantidad: number;
  talle: string;
  precio_unitario: number;
  marca?: string;
  codigo?: string;
}

interface Usuario {
  id: string;
  nombre: string;
}

type MetodoPago = 'efectivo' | 'transferencia' | 'tarjeta_debito' | 'tarjeta_credito' | 'mercado_pago';

@Component({
  selector: 'app-clientes',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, PermisoDirective],
  templateUrl: './clientes.component.html',
  styleUrl: './clientes.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ClientesComponent implements OnInit {
  private clientesService = inject(ClientesService);
  public themeService = inject(ThemeService);

  // Columnas optimizadas para Supabase
  private readonly COLUMNAS_CLIENTES = 'id, nombre, email, telefono, dni, direccion, limite_credito, saldo_actual, activo, observaciones';
  private readonly COLUMNAS_RECIBO = 'venta_id, diferencia_abonada, metodo_pago_diferencia';

  // Signals de Estado
  clientes = signal<Cliente[]>([]);
  clienteSeleccionado = signal<Cliente | null>(null);
  ventasCredito = signal<VentaCreditoExtendida[]>([]);
  historialPagos = signal<PagoCliente[]>([]);
  
  // UI Signals
  cargando = signal(false);
  cargandoMas = signal(false);
  cargandoDetalle = signal(false);
  mostrarModal = signal(false);
  mostrarModalPago = signal(false);
  mostrarDetalleVenta = signal(false);
  modoEdicion = signal(false);
  cajaAbierta = signal(false);
  
  // Toast Signals
  mensaje = signal('');
  tipoMensaje = signal<'success' | 'error'>('success');
  mostrarToast = signal(false);
  private toastTimeout: any;

  // Filtros y Búsqueda
  busqueda = signal('');
  filtroEstado = signal<'todos' | 'activos' | 'inactivos'>('activos');
  filtroFechaDesde = signal('');
  filtroFechaHasta = signal('');
  searchSubject = new Subject<string>();

  // Paginación Infinita
  page = signal(0);
  pageSize = 15;
  hayMasDatos = signal(true);

  // Datos Temporales
  ventaCreditoSeleccionada = signal<VentaCreditoExtendida | null>(null);
  detalleVentaActual = signal<DetalleVenta[]>([]);
  recambioVenta = signal<RecambioVenta | null>(null);

  // Formularios (Signals)
  nuevoCliente = signal<Cliente>(this.inicializarCliente());
  
  nuevoPago = signal<{
    monto_pagado: number;
    metodo_pago: MetodoPago;
    observaciones: string;
    efectivo_entregado: number;
    vuelto: number;
  }>({
    monto_pagado: 0,
    metodo_pago: 'efectivo',
    observaciones: '',
    efectivo_entregado: 0,
    vuelto: 0
  });

  Math = Math;

  constructor() {
    this.searchSubject.pipe(
      debounceTime(500),
      distinctUntilChanged()
    ).subscribe((valor) => {
      this.busqueda.set(valor);
      this.resetearPaginacion();
      this.cargarClientes();
    });
  }

  ngOnInit() {
    this.cargarClientes();
  }

  // TrackBy Functions
  trackByCliente(index: number, item: Cliente): string {
    return item.id || index.toString();
  }

  trackByVenta(index: number, item: VentaCreditoExtendida): string {
    return item.id || index.toString();
  }

  trackByPago(index: number, item: PagoCliente): string {
    return item.id || index.toString();
  }

  trackByProducto(index: number, item: any): string {
    return item.nombre || index.toString();
  }

  private inicializarCliente(): Cliente {
    return {
      nombre: '',
      email: '',
      telefono: '',
      dni: '',
      direccion: '',
      limite_credito: 0,
      saldo_actual: 0,
      activo: true,
      observaciones: ''
    };
  }

  // ========== CARGA DE CLIENTES E INFINITE SCROLL ==========

  onSearchInput(valor: string) {
    this.searchSubject.next(valor);
  }

  resetearPaginacion() {
    this.page.set(0);
    this.clientes.set([]);
    this.hayMasDatos.set(true);
  }

  onScroll(event: any) {
    const element = event.target;
    if (element.scrollHeight - element.scrollTop <= element.clientHeight + 50) {
      this.cargarClientes();
    }
  }

  async cargarClientes() {
    if ((this.cargando() || this.cargandoMas()) || !this.hayMasDatos()) return;

    const esPrimeraPagina = this.page() === 0;
    if (esPrimeraPagina) this.cargando.set(true);
    else this.cargandoMas.set(true);

    try {
      const from = this.page() * this.pageSize;
      const to = from + this.pageSize - 1;

      let query = this.clientesService['supabase'].getClient()
        .from('clientes')
        .select(this.COLUMNAS_CLIENTES)
        .range(from, to)
        .order('nombre', { ascending: true });

      if (this.busqueda()) {
        const term = this.busqueda();
        query = query.or(`nombre.ilike.%${term}%,dni.ilike.%${term}%,email.ilike.%${term}%`);
      }

      if (this.filtroEstado() !== 'todos') {
        query = query.eq('activo', this.filtroEstado() === 'activos');
      }

      const { data, error } = await query;

      if (error) throw error;

      if (data && data.length > 0) {
        this.clientes.update(actuales => [...actuales, ...data]);
        this.page.update(p => p + 1);
        if (data.length < this.pageSize) this.hayMasDatos.set(false);
      } else {
        this.hayMasDatos.set(false);
      }

    } catch (error: any) {
      this.mostrarMensajeToast('Error al cargar clientes: ' + error.message, 'error');
    } finally {
      this.cargando.set(false);
      this.cargandoMas.set(false);
    }
  }

  cambiarFiltroEstado(estado: 'todos' | 'activos' | 'inactivos') {
    this.filtroEstado.set(estado);
    this.resetearPaginacion();
    this.cargarClientes();
  }

  // ========== DETALLE CLIENTE ==========

  async verDetalleCliente(cliente: Cliente) {
    this.clienteSeleccionado.set(cliente);
    this.cargandoDetalle.set(true);
    
    try {
      if (!cliente.id) throw new Error("ID de cliente inválido");

      await Promise.all([
        this.cargarVentasCredito(cliente.id),
        this.cargarHistorialPagos(cliente.id)
      ]);
    } catch (error: any) {
      this.mostrarMensajeToast('Error al cargar detalles', 'error');
    } finally {
      this.cargandoDetalle.set(false);
    }
  }

  async cargarVentasCredito(clienteId: string) {
    let ventas = await this.clientesService.obtenerVentasCredito(clienteId);
    
    if (this.filtroFechaDesde()) {
      const d = new Date(this.filtroFechaDesde()); d.setHours(0,0,0,0);
      ventas = ventas.filter(v => new Date(v.fecha_venta) >= d);
    }
    if (this.filtroFechaHasta()) {
      const h = new Date(this.filtroFechaHasta()); h.setHours(23,59,59,999);
      ventas = ventas.filter(v => new Date(v.fecha_venta) <= h);
    }

    // Optimización N+1: Una sola consulta para todos los recambios
    const ventaIds = ventas.map(v => v.venta_id);
    let mapaRecambios: any = {};

    if (ventaIds.length > 0) {
      const { data: recambios } = await this.clientesService['supabase'].getClient()
        .from('recambios')
        .select(this.COLUMNAS_RECIBO)
        .in('venta_id', ventaIds);
      
      if (recambios) {
        recambios.forEach((r: any) => {
          mapaRecambios[r.venta_id] = r;
        });
      }
    }

    const ventasExtendidas = ventas.map(venta => {
      const recambio = mapaRecambios[venta.venta_id];
      const vExt = { ...venta } as VentaCreditoExtendida;
      if (recambio) {
        vExt.recambio_diferencia = recambio.diferencia_abonada;
        vExt.recambio_metodo_pago = recambio.metodo_pago_diferencia;
      }
      return vExt;
    });

    this.ventasCredito.set(ventasExtendidas);
  }

  async cargarHistorialPagos(clienteId: string) {
    const pagos = await this.clientesService.obtenerPagosCliente(clienteId);
    this.historialPagos.set(pagos);
  }

  // ========== ABM CLIENTES ==========

  abrirModalNuevo() {
    this.modoEdicion.set(false);
    this.nuevoCliente.set(this.inicializarCliente());
    this.mostrarModal.set(true);
  }

  abrirModalEditar(cliente: Cliente) {
    this.modoEdicion.set(true);
    this.nuevoCliente.set({ ...cliente });
    this.mostrarModal.set(true);
  }

  cerrarModal() {
    this.mostrarModal.set(false);
    this.nuevoCliente.set(this.inicializarCliente());
  }

  actualizarNuevoCliente(campo: keyof Cliente, valor: any) {
    this.nuevoCliente.update(state => ({ ...state, [campo]: valor }));
  }

  async guardarCliente() {
    const cliente = this.nuevoCliente();
    if (!cliente.nombre.trim()) {
      this.mostrarMensajeToast('El nombre es obligatorio', 'error');
      return;
    }

    this.cargando.set(true);
    try {
      if (this.modoEdicion() && cliente.id) {
        await this.clientesService.actualizarCliente(cliente.id, cliente);
        this.mostrarMensajeToast('Cliente actualizado', 'success');
        
        // Actualizar optimista en la lista
        this.clientes.update(lista => lista.map(c => c.id === cliente.id ? { ...c, ...cliente } : c));
        
        if (this.clienteSeleccionado()?.id === cliente.id) {
          this.clienteSeleccionado.set({ ...this.clienteSeleccionado()!, ...cliente });
        }

      } else {
        await this.clientesService.crearCliente(cliente);
        this.mostrarMensajeToast('Cliente creado', 'success');
        this.resetearPaginacion();
        this.cargarClientes();
      }
      
      this.cerrarModal();
      
    } catch (error: any) {
      const errMessage = error.message || JSON.stringify(error);
      if (errMessage.includes('clientes_dni_key') || errMessage.includes('unique constraint')) {
        this.mostrarMensajeToast('Ya existe un cliente registrado con este DNI', 'error');
      } else {
        this.mostrarMensajeToast('Error al guardar: ' + errMessage, 'error');
      }
    } finally {
      this.cargando.set(false);
    }
  }

  async toggleEstadoCliente(cliente: Cliente) {
    if (!cliente.id) return;
    this.cargando.set(true);
    try {
      if (cliente.activo) {
        await this.clientesService.desactivarCliente(cliente.id);
        this.mostrarMensajeToast('Cliente desactivado', 'success');
      } else {
        await this.clientesService.activarCliente(cliente.id);
        this.mostrarMensajeToast('Cliente activado', 'success');
      }
      
      // Actualizar estado localmente
      this.clientes.update(lista => 
        lista.map(c => c.id === cliente.id ? { ...c, activo: !c.activo } : c)
      );

      // Si estamos filtrando, quizás debamos removerlo de la vista
      if (this.filtroEstado() !== 'todos') {
        this.clientes.update(lista => lista.filter(c => c.id !== cliente.id));
      }

    } catch (error: any) {
      this.mostrarMensajeToast('Error al cambiar estado', 'error');
    } finally {
      this.cargando.set(false);
    }
  }

  // ========== PAGOS ==========

  async abrirModalPago(venta: VentaCreditoExtendida) {
    const estadoCaja = await this.verificarCajaAbierta();
    this.cajaAbierta.set(estadoCaja);
    
    this.ventaCreditoSeleccionada.set(venta);
    const saldo = this.getSaldoPendienteConRecambio(venta);
    
    this.nuevoPago.set({
      monto_pagado: saldo,
      metodo_pago: estadoCaja ? 'efectivo' : 'transferencia',
      observaciones: '',
      efectivo_entregado: saldo,
      vuelto: 0
    });
    this.mostrarModalPago.set(true);
  }

  cerrarModalPago() {
    this.mostrarModalPago.set(false);
    this.ventaCreditoSeleccionada.set(null);
  }

  actualizarNuevoPago(campo: string, valor: any) {
    this.nuevoPago.update(state => {
      const newState = { ...state, [campo]: valor };
      
      if (campo === 'monto_pagado' || campo === 'efectivo_entregado' || campo === 'metodo_pago') {
        if (newState.metodo_pago === 'efectivo') {
          newState.vuelto = Math.max(0, newState.efectivo_entregado - newState.monto_pagado);
        } else {
          newState.vuelto = 0;
        }
      }
      return newState;
    });
  }

  async registrarPago() {
    const pago = this.nuevoPago();
    const venta = this.ventaCreditoSeleccionada();
    const cliente = this.clienteSeleccionado();

    if (!venta || !cliente) return;
    
    if (pago.monto_pagado <= 0) return this.mostrarMensajeToast('Monto inválido', 'error');
    
    if (pago.metodo_pago === 'efectivo') {
      const cajaEstaAbierta = await this.verificarCajaAbierta(); 
      if (!cajaEstaAbierta) {
        this.mostrarMensajeToast('❌ No hay caja abierta. No se puede en efectivo.', 'error');
        return;
      }
    }

    const saldoPendiente = this.getSaldoPendienteConRecambio(venta);
    if (pago.monto_pagado > saldoPendiente) {
        return this.mostrarMensajeToast('El monto no puede ser mayor al saldo pendiente', 'error');
    }

    this.cargando.set(true);
    try {
      await this.clientesService.registrarPago({
        cliente_id: cliente.id!,
        venta_credito_id: venta.id,
        monto_pagado: pago.monto_pagado,
        metodo_pago: pago.metodo_pago,
        observaciones: pago.observaciones
      });

      if (pago.metodo_pago === 'efectivo') {
        await this.registrarMovimientosEnCaja(
          pago.monto_pagado,
          pago.efectivo_entregado,
          pago.vuelto,
          venta.venta_id,
          pago.observaciones || `Pago Cta Cte - ${cliente.nombre}`
        );
      }

      this.mostrarMensajeToast('Pago registrado', 'success');
      this.cerrarModalPago();
      
      await this.verDetalleCliente(cliente);
      
    } catch (error: any) {
      this.mostrarMensajeToast('Error al registrar pago', 'error');
    } finally {
      this.cargando.set(false);
    }
  }

  async registrarMovimientosEnCaja(monto: number, entregado: number, vuelto: number, ventaId: string, obs: string) {
    const { data: caja } = await this.clientesService['supabase'].getClient()
      .from('cajas').select('id, monto_actual').eq('estado', 'abierta').maybeSingle();
      
    if (!caja) return;

    const usuario = await this.obtenerUsuarioActual();
    const client = this.clientesService['supabase'].getClient();

    await client.from('movimientos_caja').insert({
      caja_id: caja.id,
      tipo: 'ingreso',
      concepto: 'Cobro Cta Cte',
      monto: entregado,
      metodo: 'efectivo',
      venta_id: ventaId,
      usuario_id: usuario.id,
      usuario_nombre: usuario.nombre,
      observaciones: obs,
      created_at: new Date().toISOString()
    });

    let nuevoSaldo = caja.monto_actual + entregado;

    if (vuelto > 0) {
      await client.from('movimientos_caja').insert({
        caja_id: caja.id,
        tipo: 'egreso',
        concepto: 'Vuelto Cta Cte',
        monto: vuelto,
        metodo: 'efectivo',
        venta_id: ventaId,
        usuario_id: usuario.id,
        usuario_nombre: usuario.nombre,
        created_at: new Date().toISOString()
      });
      nuevoSaldo -= vuelto;
    }

    await client.from('cajas').update({ monto_actual: nuevoSaldo }).eq('id', caja.id);
  }

  // ========== UTILIDADES & HELPERS ==========

  async obtenerUsuarioActual(): Promise<Usuario> {
    const sb = this.clientesService['supabase'];
    let u = await sb.getCurrentUser();
    
    if (!u) {
       const vend = sb.getVendedorTemp();
       if(vend) return { id: vend.id || 'unknown', nombre: vend.nombre || 'Vendedor' };
       
       const local = JSON.parse(localStorage.getItem('user') || 'null');
       if(local) return { id: local.id || 'unknown', nombre: local.nombre || 'Vendedor' };
    }
    
    if (!u) return { id: 'unknown', nombre: 'Desconocido' };

    let nombre = 'Usuario';
    if ('user_metadata' in u) {
        nombre = u.user_metadata?.['nombre'] || u.email?.split('@')[0] || 'Usuario';
    } else if ('nombre' in u) {
        nombre = (u as any).nombre;
    }
    
    nombre = nombre.charAt(0).toUpperCase() + nombre.slice(1);
    return { id: u.id || 'unknown', nombre };
  }

  async verificarCajaAbierta(): Promise<boolean> {
    const { count } = await this.clientesService['supabase'].getClient()
      .from('cajas').select('id', { count: 'exact', head: true }).eq('estado', 'abierta');
    return (count || 0) > 0;
  }

  getSaldoPendienteConRecambio(venta: VentaCreditoExtendida): number {
    return venta.saldo_pendiente || 0; 
  }

  tieneRecambioFiado(venta: VentaCreditoExtendida): boolean {
    return !!(venta.recambio_diferencia && venta.recambio_metodo_pago === 'fiado' && venta.recambio_diferencia > 0);
  }

  getTotalVentaConRecambio(venta: VentaCreditoExtendida): number {
    return venta.monto_total || 0;
  }
  
  // Computed para el saldo en el modal
  saldoVentaSeleccionada = computed(() => {
    const v = this.ventaCreditoSeleccionada();
    return v ? this.getSaldoPendienteConRecambio(v) : 0;
  });

  calcularTotalVenta(): number {
    return this.detalleVentaActual().reduce((sum, item) => sum + item.subtotal, 0);
  }

  aplicarFiltroFechas() {
    if (this.clienteSeleccionado()?.id) this.cargarVentasCredito(this.clienteSeleccionado()!.id!);
  }

  limpiarFiltroFechas() {
    this.filtroFechaDesde.set('');
    this.filtroFechaHasta.set('');
    if (this.clienteSeleccionado()?.id) this.cargarVentasCredito(this.clienteSeleccionado()!.id!);
  }

  mostrarMensajeToast(msg: string, tipo: 'success' | 'error') {
    if (this.toastTimeout) clearTimeout(this.toastTimeout);
    
    this.mensaje.set(msg);
    this.tipoMensaje.set(tipo);
    this.mostrarToast.set(true);
    
    this.toastTimeout = setTimeout(() => {
      this.mostrarToast.set(false);
      this.mensaje.set('');
    }, 3000);
  }

  volverALista() {
    this.clienteSeleccionado.set(null);
    this.ventasCredito.set([]);
    this.historialPagos.set([]);
  }

  formatearPrecio(v: number | undefined | null) { return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(v || 0); }
  formatearFecha(f: string) { return new Date(f).toLocaleDateString('es-AR'); }
  getIdCorto(id: string | undefined) { return id ? id.slice(-8) : ''; }
  
  getEstadoClass(e: string) {
      if(e==='pendiente') return 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200';
      if(e==='pagado_parcial') return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-200';
      return 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200';
  }
  
  getEstadoTexto(e: string) {
      if(e==='pendiente') return 'Pendiente';
      if(e==='pagado_parcial') return 'Parcial';
      return 'Pagado';
  }

  async verDetalleVenta(venta: VentaCreditoExtendida) {
    this.detalleVentaActual.set(venta.ventas?.detalle_venta || []);
    this.mostrarDetalleVenta.set(true);
    this.recambioVenta.set(null);
    
    const { data } = await this.clientesService['supabase'].getClient().from('recambios').select('*').eq('venta_id', venta.venta_id).single();
    if (data) {
        const recambio = data as RecambioVenta;
        if (typeof recambio.productos_devueltos_json === 'string') recambio.productos_devueltos_json = JSON.parse(recambio.productos_devueltos_json);
        if (typeof recambio.productos_recambio_json === 'string') recambio.productos_recambio_json = JSON.parse(recambio.productos_recambio_json);
        this.recambioVenta.set(recambio);
    }
  }
  
  cerrarDetalleVenta() { 
    this.mostrarDetalleVenta.set(false); 
    this.detalleVentaActual.set([]); 
    this.recambioVenta.set(null); 
  }
  
  formatearFechaRecambio(fecha: string) { return new Date(fecha).toLocaleDateString('es-AR'); }

  getPagosDeVenta(vid: string) { return this.historialPagos().filter(p => p.venta_credito_id === vid); }
  tienePagos(vid: string) { return this.getPagosDeVenta(vid).length > 0; }
}