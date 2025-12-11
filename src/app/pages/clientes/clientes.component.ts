import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ClientesService, Cliente, VentaCredito, PagoCliente } from '../../services/clientes.service';
import { ThemeService } from '../../services/theme.service';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';

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

// Tipo unión para métodos de pago válidos
type MetodoPago = 'efectivo' | 'transferencia' | 'tarjeta_debito' | 'tarjeta_credito' | 'mercado_pago';

@Component({
  selector: 'app-clientes',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './clientes.component.html',
  styleUrl: './clientes.component.css'
})
export class ClientesComponent implements OnInit {
  // Datos principales
  clientes: Cliente[] = [];
  clienteSeleccionado: Cliente | null = null;
  ventasCredito: VentaCreditoExtendida[] = [];
  historialPagos: PagoCliente[] = [];
  
  // Buscador reactivo
  searchSubject = new Subject<string>();
  busqueda = '';
  
  // UI States
  mostrarModal = false;
  mostrarModalPago = false;
  mostrarDetalleVenta = false;
  modoEdicion = false;
  cargando = false;
  cargandoDetalle = false;
  
  // Datos temporales
  ventaCreditoSeleccionada: VentaCredito | null = null;
  detalleVentaActual: DetalleVenta[] = [];
  recambioVenta: RecambioVenta | null = null;
  
  // Filtros
  filtroEstado: 'todos' | 'activos' | 'inactivos' = 'activos';
  filtroFechaDesde = '';
  filtroFechaHasta = '';
  
  // Formularios
  nuevoCliente: Cliente = this.inicializarCliente();
  
  // Definición estricta para evitar el error de tipos en el select
  nuevoPago: {
    monto_pagado: number;
    metodo_pago: MetodoPago;
    observaciones: string;
    efectivo_entregado: number;
    vuelto: number;
  } = {
    monto_pagado: 0,
    metodo_pago: 'efectivo',
    observaciones: '',
    efectivo_entregado: 0,
    vuelto: 0
  };
  
  // Toast
  mensaje = '';
  tipoMensaje: 'success' | 'error' = 'success';
  mostrarToast = false;
  private toastTimeout: any; // Para controlar el cierre del toast

  // Paginación (Clientes y Ventas)
  paginaActual = 1;
  elementosPorPagina = 10;
  totalClientes = 0;
  totalPaginas = 0; // Variable agregada
  
  Math = Math; 

  constructor(
    private clientesService: ClientesService,
    public themeService: ThemeService
  ) {
    // Configurar debounce para búsqueda optimizada
    this.searchSubject.pipe(
      debounceTime(500),
      distinctUntilChanged()
    ).subscribe((valor) => {
      this.busqueda = valor;
      this.paginaActual = 1;
      this.cargarClientes();
    });
  }

  ngOnInit() {
    this.cargarClientes();
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

  // ========== CARGA DE CLIENTES ==========

  onSearchInput(valor: string) {
    this.searchSubject.next(valor);
  }

  async cargarClientes() {
    this.cargando = true;
    try {
      const params: any = { busqueda: this.busqueda };
      if (this.filtroEstado !== 'todos') {
        params.activo = this.filtroEstado === 'activos';
      }

      const data = await this.clientesService.obtenerClientes(params);
      this.clientes = data;
      
    } catch (error: any) {
      this.mostrarMensaje('Error al cargar clientes: ' + error.message, 'error');
    } finally {
      this.cargando = false;
    }
  }

  cambiarFiltroEstado(estado: 'todos' | 'activos' | 'inactivos') {
    this.filtroEstado = estado;
    this.cargarClientes();
  }

  // ========== DETALLE CLIENTE ==========

  async verDetalleCliente(cliente: Cliente) {
    this.clienteSeleccionado = cliente;
    this.cargandoDetalle = true;
    
    try {
      if (!cliente.id) throw new Error("ID de cliente inválido");

      // Carga paralela de ventas y pagos
      await Promise.all([
        this.cargarVentasCredito(cliente.id),
        this.cargarHistorialPagos(cliente.id)
      ]);
    } catch (error: any) {
      this.mostrarMensaje('Error al cargar detalles', 'error');
    } finally {
      this.cargandoDetalle = false;
    }
  }

  async cargarVentasCredito(clienteId: string) {
    let ventas = await this.clientesService.obtenerVentasCredito(clienteId);
    
    // Filtros de fecha en memoria
    if (this.filtroFechaDesde) {
      const d = new Date(this.filtroFechaDesde); d.setHours(0,0,0,0);
      ventas = ventas.filter(v => new Date(v.fecha_venta) >= d);
    }
    if (this.filtroFechaHasta) {
      const h = new Date(this.filtroFechaHasta); h.setHours(23,59,59,999);
      ventas = ventas.filter(v => new Date(v.fecha_venta) <= h);
    }

    // Enriquecer con datos de recambio
    const ventasExtendidas = await Promise.all(ventas.map(async (venta) => {
       const vExt = { ...venta } as VentaCreditoExtendida;
       const { data } = await this.clientesService['supabase'].getClient()
         .from('recambios')
         .select('diferencia_abonada, metodo_pago_diferencia')
         .eq('venta_id', venta.venta_id)
         .single();
       
       if (data) {
         vExt.recambio_diferencia = data.diferencia_abonada;
         vExt.recambio_metodo_pago = data.metodo_pago_diferencia;
       }
       return vExt;
    }));

    this.ventasCredito = ventasExtendidas;
    this.paginaActual = 1; // Reset paginación de ventas
    this.calcularTotalPaginas();
  }

  async cargarHistorialPagos(clienteId: string) {
    this.historialPagos = await this.clientesService.obtenerPagosCliente(clienteId);
  }

  // ========== ABM CLIENTES ==========

  abrirModalNuevo() {
    this.modoEdicion = false;
    this.nuevoCliente = this.inicializarCliente();
    this.mostrarModal = true;
  }

  abrirModalEditar(cliente: Cliente) {
    this.modoEdicion = true;
    this.nuevoCliente = { ...cliente };
    this.mostrarModal = true;
  }

  cerrarModal() {
    this.mostrarModal = false;
    this.nuevoCliente = this.inicializarCliente();
  }

  async guardarCliente() {
    if (!this.nuevoCliente.nombre.trim()) {
      this.mostrarMensaje('El nombre es obligatorio', 'error');
      return;
    }

    this.cargando = true;
    try {
      if (this.modoEdicion && this.nuevoCliente.id) {
        await this.clientesService.actualizarCliente(this.nuevoCliente.id, this.nuevoCliente);
        this.mostrarMensaje('Cliente actualizado', 'success');
      } else {
        await this.clientesService.crearCliente(this.nuevoCliente);
        this.mostrarMensaje('Cliente creado', 'success');
      }
      
      this.cerrarModal();
      this.cargarClientes();
      
    } catch (error: any) {
      // Manejo de error específico para DNI duplicado
      const errMessage = error.message || JSON.stringify(error);
      if (errMessage.includes('clientes_dni_key') || errMessage.includes('unique constraint')) {
        this.mostrarMensaje('Ya existe un cliente registrado con este DNI', 'error');
      } else {
        this.mostrarMensaje('Error al guardar: ' + errMessage, 'error');
      }
    } finally {
      this.cargando = false;
    }
  }

async toggleEstadoCliente(cliente: Cliente) {
    if (!cliente.id) return;
    this.cargando = true;
    try {
      if (cliente.activo) {
        await this.clientesService.desactivarCliente(cliente.id);
        this.mostrarMensaje('Cliente desactivado', 'success');
      } else {
        await this.clientesService.activarCliente(cliente.id);
        this.mostrarMensaje('Cliente activado', 'success');
      }
      if (this.filtroEstado === 'todos') {
         cliente.activo = !cliente.activo; // Solo switch visual
      } else {
         this.clientes = this.clientes.filter(c => c.id !== cliente.id);
      }

    } catch (error: any) {
      this.mostrarMensaje('Error al cambiar estado', 'error');
    } finally {
      this.cargando = false;
    }
  }

  // ========== PAGOS ==========

  async abrirModalPago(venta: VentaCreditoExtendida) {
    const cajaAbierta = await this.verificarCajaAbierta();
    this.ventaCreditoSeleccionada = venta;
    const saldo = this.getSaldoPendienteConRecambio(venta);
    
    this.nuevoPago = {
      monto_pagado: saldo,
      metodo_pago: cajaAbierta ? 'efectivo' : 'transferencia',
      observaciones: '',
      efectivo_entregado: saldo,
      vuelto: 0
    };
    this.mostrarModalPago = true;
  }

  cerrarModalPago() {
    this.mostrarModalPago = false;
    this.ventaCreditoSeleccionada = null;
  }

  async registrarPago() {
    if (!this.ventaCreditoSeleccionada || !this.clienteSeleccionado) return;
    
    if (this.nuevoPago.monto_pagado <= 0) return this.mostrarMensaje('Monto inválido', 'error');
    
    // Validación de monto excedente
    const saldoPendiente = this.getSaldoPendienteConRecambio(this.ventaCreditoSeleccionada as VentaCreditoExtendida);
    if (this.nuevoPago.monto_pagado > saldoPendiente) {
        return this.mostrarMensaje('El monto no puede ser mayor al saldo pendiente', 'error');
    }

    this.cargando = true;
    try {
      await this.clientesService.registrarPago({
        cliente_id: this.clienteSeleccionado.id!,
        venta_credito_id: this.ventaCreditoSeleccionada.id,
        monto_pagado: this.nuevoPago.monto_pagado,
        metodo_pago: this.nuevoPago.metodo_pago,
        observaciones: this.nuevoPago.observaciones
      });

      if (this.nuevoPago.metodo_pago === 'efectivo') {
        await this.registrarMovimientosEnCaja(
          this.nuevoPago.monto_pagado,
          this.nuevoPago.efectivo_entregado,
          this.nuevoPago.vuelto,
          this.ventaCreditoSeleccionada.venta_id,
          this.nuevoPago.observaciones || `Pago Cta Cte - ${this.clienteSeleccionado.nombre}`
        );
      }

      this.mostrarMensaje('Pago registrado', 'success');
      this.cerrarModalPago();
      
      // Recargar datos
      await this.verDetalleCliente(this.clienteSeleccionado);
      
    } catch (error: any) {
      this.mostrarMensaje('Error al registrar pago', 'error');
    } finally {
      this.cargando = false;
    }
  }

  async registrarMovimientosEnCaja(monto: number, entregado: number, vuelto: number, ventaId: string, obs: string) {
    const { data: caja } = await this.clientesService['supabase'].getClient()
      .from('cajas').select('*').eq('estado', 'abierta').maybeSingle();
      
    if (!caja) return;

    const usuario = await this.obtenerUsuarioActual();
    const client = this.clientesService['supabase'].getClient();

    // Ingreso
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

    // Egreso (Vuelto)
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

    // Actualizar saldo caja
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
      .from('cajas').select('*', { count: 'exact', head: true }).eq('estado', 'abierta');
    return (count || 0) > 0;
  }

  calcularVuelto() {
    if (this.nuevoPago.metodo_pago === 'efectivo') {
      this.nuevoPago.vuelto = Math.max(0, this.nuevoPago.efectivo_entregado - this.nuevoPago.monto_pagado);
    } else {
      this.nuevoPago.vuelto = 0;
    }
  }

  // Getters
  getSaldoPendienteConRecambio(venta: VentaCreditoExtendida): number {
    return venta.saldo_pendiente || 0; 
  }

  tieneRecambioFiado(venta: VentaCreditoExtendida): boolean {
    return !!(venta.recambio_diferencia && venta.recambio_metodo_pago === 'fiado' && venta.recambio_diferencia > 0);
  }

  getTotalVentaConRecambio(venta: VentaCreditoExtendida): number {
    return venta.monto_total || 0;
  }

  getSaldoVentaSeleccionada(): number {
    if (!this.ventaCreditoSeleccionada) return 0;
    return this.getSaldoPendienteConRecambio(this.ventaCreditoSeleccionada as VentaCreditoExtendida);
  }

  calcularTotalVenta(): number {
    return this.detalleVentaActual.reduce((sum, item) => sum + item.subtotal, 0);
  }

  // Filtros y navegación
  aplicarFiltroFechas() {
    if (this.clienteSeleccionado?.id) this.cargarVentasCredito(this.clienteSeleccionado.id);
  }

  limpiarFiltroFechas() {
    this.filtroFechaDesde = '';
    this.filtroFechaHasta = '';
    if (this.clienteSeleccionado?.id) this.cargarVentasCredito(this.clienteSeleccionado.id);
  }

  // Manejo de Toast Mejorado
  mostrarMensaje(msg: string, tipo: 'success' | 'error') {
    if (this.toastTimeout) {
      clearTimeout(this.toastTimeout); // Limpiar timeout anterior
    }
    
    this.mensaje = msg;
    this.tipoMensaje = tipo;
    this.mostrarToast = true;
    
    this.toastTimeout = setTimeout(() => {
      this.mostrarToast = false;
      this.mensaje = '';
    }, 3000);
  }

  volverALista() {
    this.clienteSeleccionado = null;
    this.ventasCredito = [];
    this.historialPagos = [];
  }

  // Paginación
  get ventasCreditoPaginadas(): VentaCreditoExtendida[] {
    const inicio = (this.paginaActual - 1) * this.elementosPorPagina;
    return this.ventasCredito.slice(inicio, inicio + this.elementosPorPagina);
  }

  calcularTotalPaginas() {
    this.totalPaginas = Math.ceil(this.ventasCredito.length / this.elementosPorPagina);
  }

  cambiarPagina(p: number) {
    this.paginaActual = p;
  }

  getPaginasArray(): number[] {
    return Array(this.totalPaginas).fill(0).map((x, i) => i + 1);
  }

  // Formateadores y visualización
  formatearPrecio(v: number | undefined) { return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(v || 0); }
  formatearFecha(f: string) { return new Date(f).toLocaleDateString('es-AR'); }
  getIdCorto(id: string | undefined) { 
    return id ? id.slice(-8) : ''; 
  }
  
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

  // Métodos de detalle venta y recambio
  async verDetalleVenta(venta: VentaCreditoExtendida) {
    this.detalleVentaActual = venta.ventas?.detalle_venta || [];
    this.mostrarDetalleVenta = true;
    this.recambioVenta = null;
    const { data } = await this.clientesService['supabase'].getClient().from('recambios').select('*').eq('venta_id', venta.venta_id).single();
    if (data) {
        this.recambioVenta = data as RecambioVenta;
        if (typeof this.recambioVenta.productos_devueltos_json === 'string') this.recambioVenta.productos_devueltos_json = JSON.parse(this.recambioVenta.productos_devueltos_json);
        if (typeof this.recambioVenta.productos_recambio_json === 'string') this.recambioVenta.productos_recambio_json = JSON.parse(this.recambioVenta.productos_recambio_json);
    }
  }
  
  cerrarDetalleVenta() { this.mostrarDetalleVenta = false; this.detalleVentaActual = []; this.recambioVenta = null; }
  esProductoRecambiado(item: DetalleVenta): boolean { if (!this.recambioVenta?.productos_devueltos_json) return false; return this.recambioVenta.productos_devueltos_json.some(p => p.nombre === item.productos?.nombre); }
  getProductoDevuelto(item: DetalleVenta): ProductoRecambio | undefined { return this.recambioVenta?.productos_devueltos_json.find(p => p.nombre === item.productos?.nombre); }
  getProductoRecambio(item: DetalleVenta): ProductoRecambio | undefined { 
    if (!this.recambioVenta?.productos_recambio_json) return undefined;
    const devuelto = this.getProductoDevuelto(item);
    if (!devuelto) return undefined;
    const index = this.recambioVenta.productos_devueltos_json.indexOf(devuelto);
    return this.recambioVenta.productos_recambio_json[index];
  }
  formatearFechaRecambio(fecha: string) { return new Date(fecha).toLocaleDateString('es-AR'); }

  // Historial de pagos específico
  getPagosDeVenta(vid: string) { return this.historialPagos.filter(p => p.venta_credito_id === vid); }
  tienePagos(vid: string) { return this.getPagosDeVenta(vid).length > 0; }
}