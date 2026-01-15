import { CommonModule } from '@angular/common';
import { Component, OnInit, signal, computed, ChangeDetectionStrategy, ChangeDetectorRef,inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../services/supabase.service';
import { RouterModule } from '@angular/router';
import { MonedaArsPipe } from '../../pipes/moneda-ars.pipe';
import { ThemeService } from '../../services/theme.service';
import { PermisoDirective } from '../../directives/permiso.directive';
import { FacturacionService } from '../../services/facturacion.service';
FacturacionService
interface ProductoOriginal {
  producto_id: string;
  nombre: string;
  marca: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
  talle: string;
  seleccionado: boolean;
  cantidadDevolver: number;
}

interface ProductoDisponible {
  id: string;
  nombre: string;
  marca: string;
  categoria: string;
  precio: number;
  talle: string;
  cantidad_stock: number;
  codigo: string;
}

interface ProductoRecambio {
  producto: ProductoDisponible;
  cantidad: number;
}

interface ItemHistorial {
  tipo: 'venta' | 'recambio'| 'ventaEliminada';
  id: string;
  fecha: Date;
  cliente_id?: string; 
  nombre_usuario?: string;
  cliente_nombre?: string;
  cliente_email?: string;
  fecha_venta?: Date;
  productos?: any[];
  metodo_pago?: string;
  descuento_aplicado?: number;
  total_final?: number;
  recambio_realizado?: boolean;
  realizado_por?: string;
  fecha_recambio?: Date;
  venta_id?: string;
  motivo?: string;
  observaciones?: string;
  productos_devueltos?: any[];
  productos_recambio?: any[];
  total_original?: number;
  total_devuelto?: number;
  total_recambio?: number;
  diferencia_abonada?: number;
  metodo_pago_diferencia?: string;
  descuento_recambio?: number;
  monto_descuento_recambio?: number;
  eliminado_por?: string;
  fecha_eliminacion?: Date;
  motivo_eliminacion?: string;
  facturada?: boolean;
  factura_tipo?: string;
  factura_nro?: string;
  factura_pdf_url?: string;
  cliente_info?: { 
    nombre: string;
    cuit: string;
    condicion_iva: string;
  };
  [key: string]: any;
}

interface ConfigRecibo {
  id?: string;
  nombre_negocio: string;
  direccion: string;
  ciudad: string;
  telefono1: string;
  telefono2: string;
  whatsapp1: string;
  whatsapp2: string;
  email_empresa: string | null;
  logo_url: string | null;
  mensaje_agradecimiento: string;
  mensaje_pie: string;
  email_desarrollador: string;
}

@Component({
  selector: 'app-historial',
  imports: [FormsModule, CommonModule, RouterModule, MonedaArsPipe, PermisoDirective],
  standalone: true,
  templateUrl: './historial.component.html',
  styleUrl: './historial.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class HistorialComponent implements OnInit {
  private facturacionService = inject(FacturacionService); 
  mostrarModalTipoEnvio = signal<boolean>(false);
ventaParaTipoEnvio = signal<any>(null);
filtroFacturacion = signal<'todas' |'facturadas' | 'no_facturadas'>('todas');
  // ==================== CONSTANTES DE COLUMNAS ====================
private readonly COLUMNAS_VISTA = 'id, cliente_id, tipo, fecha, nombre_usuario, cliente_nombre, cliente_email, metodo_pago, descuento_aplicado, total_final, productos, recambio_realizado, realizado_por, venta_id_referencia, motivo, observaciones, productos_devueltos, productos_recambio, total_original, total_devuelto, total_recambio, diferencia_abonada, metodo_pago_diferencia, monto_descuento_recambio, eliminado_por, fecha_eliminacion, id_texto, facturada, factura_tipo, factura_pdf_url';
private readonly COLUMNAS_PRODUCTOS = 'id, nombre, marca, categoria, precio, talle, cantidad_stock, codigo';

  // ==================== SIGNALS DE DATOS ====================
  items = signal<ItemHistorial[]>([]);
  totalItems = signal<number>(0);
  itemsFiltrados = signal<ItemHistorial[]>([]);
  
  // ==================== SIGNALS DE ESTADO DE CARGA ====================
  cargando = signal<boolean>(false);
  cargandoTotales = signal<boolean>(false);
  cargandoMas = signal<boolean>(false);
  procesandoRecambio = signal<boolean>(false);
  eliminandoVenta = signal<boolean>(false);
  generandoRecibo = signal<boolean>(false);
  enviandoEmail = signal<boolean>(false);
  
  // ==================== SIGNALS DE FILTROS ====================
  filtro = signal<'hoy' | '7dias' | '30dias' | 'todos' | 'fechaEspecifica' | 'rangoFechas'>('hoy');
  tipoFiltro = signal<'todos' | 'ventas' | 'recambios' | 'ventasEliminadas'>('todos');
  metodoPagoFiltro = signal<'todos' | 'efectivo' | 'transferencia' | 'debito' | 'credito' | 'mercado_pago' | 'fiado'>('todos');
  fechaEspecifica = signal<string>('');
  fechaDesde = signal<string>('');
  fechaHasta = signal<string>('');
  busquedaCliente = signal<string>('');
  
  // ==================== SIGNALS DE TOTALES ====================
  totalVentas = signal<number>(0);
  totalRecambios = signal<number>(0);
  
  // ==================== SIGNALS DE PAGINACIÓN ====================
  paginaActual = signal<number>(1);
  itemsPorPagina = signal<number>(10);
  hayMasDatos = signal<boolean>(true);
  
  // ==================== SIGNALS DE MODAL RECAMBIO ====================
  mostrarModalRecambio = signal<boolean>(false);
  ventaSeleccionada = signal<any>(null);
  productosOriginales = signal<ProductoOriginal[]>([]);
  productosDisponibles = signal<ProductoDisponible[]>([]);
  productosRecambio = signal<ProductoRecambio[]>([]);
  busquedaProducto = signal<string>('');
  totalDevuelto = signal<number>(0);
  totalRecambio = signal<number>(0);
  totalRecambioSinDescuento = signal<number>(0);
  diferencia = signal<number>(0);
  codigoDescuentoRecambio = signal<string>('');
  descuentoRecambioAplicado = signal<number>(0);
  montoDescuentoRecambio = signal<number>(0);
  metodoPagoSeleccionado = signal<string>('');
  motivoRecambio = signal<string>('');
  observacionesRecambio = signal<string>('');
  
  // ==================== SIGNALS DE TOAST ====================
 toastVisible = signal<boolean>(false);
toastMensaje = signal<string>('');
tipoMensajeToast = signal<'success' | 'error' | 'warning'>('success');
  // ==================== SIGNALS DE ELIMINACIÓN ====================
  mostrandoConfirmacionEliminar = signal<boolean>(false);
  ventaAEliminar = signal<any>(null);
  motivoEliminacion = signal<string>('');
  
  // ==================== SIGNALS DE MODALES ====================
  mostrarModalRecibo = signal<boolean>(false);
  ventaParaRecibo = signal<any>(null);
  mostrarModalEmail = signal<boolean>(false);
  ventaParaEmail = signal<any>(null);
  emailDestino = signal<string>('');
  mostrarModalSeleccionFactura = signal<boolean>(false);
  ventaParaFacturar = signal<any>(null);
  // ==================== SIGNALS DE CONFIGURACIÓN ====================
  configRecibo = signal<ConfigRecibo | null>(null);
  cardsExpandidos = signal<Set<string>>(new Set());
  
  // ==================== DATOS ESTÁTICOS ====================
  usuarioActual: any = null;
  metodosPago = ['efectivo', 'transferencia', 'debito', 'credito', 'mercado_pago', 'fiado'];
  metodoPagoLabels: { [key: string]: string } = {
    'efectivo': 'Efectivo',
    'transferencia': 'Transferencia',
    'debito': 'Débito',
    'credito': 'Crédito',
    'mercado_pago': 'Mercado Pago',
    'fiado': 'Fiado'
  };

  // ==================== COMPUTED SIGNALS ====================
  totalPaginas = computed(() => Math.ceil(this.totalItems() / this.itemsPorPagina()));
  
  productosFiltrados = computed(() => {
    const busqueda = this.busquedaProducto();
    const productos = this.productosDisponibles();
    
    if (!busqueda?.trim()) {
      return productos?.slice(0, 10) || [];
    }
    
    const termino = busqueda.toLowerCase();
    return (productos || [])
      .filter(p => 
        p.nombre?.toLowerCase().includes(termino) ||
        p.codigo?.toLowerCase().includes(termino) ||
        p.marca?.toLowerCase().includes(termino)
      )
      .slice(0, 10);
  });

mostrarModalFormatoRecibo = signal<boolean>(false);
ventaParaGenerarRecibo = signal<any>(null);
accionRecibo = signal<'imprimir' | 'visualizar' | 'email'>('imprimir');
private busquedaTimeout: any;

  constructor(
    private supabase: SupabaseService, 
    public themeService: ThemeService,
    private cdr: ChangeDetectorRef
  ) {}

  async ngOnInit() {
    await this.obtenerUsuarioActual();
    await this.cargarConfigRecibo();
    await this.cargarDatos();
    await this.cargarProductosDisponibles();
  }

  // ==================== MÉTODOS DE UTILIDAD ====================
 mostrarToast(mensaje: string, tipo: 'success' | 'error' | 'warning' = 'success') {
  this.toastMensaje.set(mensaje);
  this.tipoMensajeToast.set(tipo);
  this.toastVisible.set(true);
  setTimeout(() => {
    this.toastVisible.set(false);
    this.cdr.markForCheck();
  }, tipo === 'success' ? 3000 : tipo === 'warning' ? 3500 : 4000);
}

  toggleCard(itemId: string): void {
    this.cardsExpandidos.update(cards => {
      const newSet = new Set(cards);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      return newSet;
    });
  }

  isCardExpandido(itemId: string): boolean {
    return this.cardsExpandidos().has(itemId);
  }

  async obtenerUsuarioActual() {
    const { data: sessionData, error } = await this.supabase.getClient().auth.getSession();
    if (sessionData.session?.user) {
      this.usuarioActual = sessionData.session.user;
    }
  }

  async cambiarPagina(pagina: number) {
    if (pagina >= 1 && pagina <= this.totalPaginas()) {
      this.paginaActual.set(pagina);
      await this.cargarDatos();
    }
  }

  async filtrar(f: 'hoy' | '7dias' | '30dias' | 'todos' | 'fechaEspecifica' | 'rangoFechas') {
    this.filtro.set(f);
    
    if (f !== 'fechaEspecifica' && f !== 'rangoFechas') {
      this.paginaActual.set(1);
      this.fechaEspecifica.set('');
      this.fechaDesde.set('');
      this.fechaHasta.set('');
      await this.cargarDatos();
    } else {
      this.items.set([]);
      this.totalItems.set(0);
      this.totalVentas.set(0);
      this.totalRecambios.set(0);
      this.cdr.markForCheck();
    }
  }

  async filtrarTipo(tipo: 'todos' | 'ventas' | 'recambios' | 'ventasEliminadas') {
    this.tipoFiltro.set(tipo);
    this.paginaActual.set(1);
    await this.cargarDatos();
  }

  filtrarPorBusqueda() {
  if (this.busquedaTimeout) {
    clearTimeout(this.busquedaTimeout);
  }
  
  this.busquedaTimeout = setTimeout(() => {
    this.paginaActual.set(1);
    this.cargarDatos();
  }, 300); 
}

  async filtrarMetodoPago(metodoPago: any) {
    this.metodoPagoFiltro.set(metodoPago);
    this.paginaActual.set(1);
    await this.cargarDatos();
  }

  trackByFn(index: number, item: ItemHistorial): string {
  return `${item.tipo}-${item.id}`;
}

  trackByProductoId(index: number, item: any): string {
    return item.producto_id || item.id || index.toString();
  }

  // ==================== SCROLL INFINITO ====================
async onScroll(event: any) {
  const element = event.target;
  const atBottom = element.scrollHeight - element.scrollTop <= element.clientHeight + 100;
  
  if (!atBottom || this.cargandoMas() || !this.hayMasDatos() || this.items().length >= this.totalItems()) {
    return;
  }
  
  await this.cargarMasDatos();
}

  async cargarMasDatos() {
    if (this.cargandoMas() || !this.hayMasDatos()) return;
    
if (this.items().length >= this.totalItems()) {
    this.hayMasDatos.set(false);
    return;
  }

    this.cargandoMas.set(true);
    const paginaSiguiente = this.paginaActual() + 1;
    
    try {
      const from = (paginaSiguiente - 1) * this.itemsPorPagina();
      const to = from + this.itemsPorPagina() - 1;

      let query = this.supabase.getClient()
        .from('vista_historial_unificado')
        .select(this.COLUMNAS_VISTA, { count: 'exact' });
      
      query = this.aplicarFiltrosBase(query);
      
      const res = await query.order('fecha', { ascending: false }).range(from, to);

      if (res.error) throw res.error;

      if (res.data && res.data.length > 0) {
        const nuevosItems = res.data.map((item: any) => ({
          ...item,
          fecha: new Date(item.fecha),
          fecha_venta: item.fecha ? new Date(item.fecha) : null,
          fecha_recambio: item.fecha ? new Date(item.fecha) : null,
          venta_id: item.venta_id_referencia,
          motivo_eliminacion: item.motivo 
        }));

        this.items.update(current => [...current, ...nuevosItems]);
        this.paginaActual.set(paginaSiguiente);
        
        if (res.data.length < this.itemsPorPagina()) {
          this.hayMasDatos.set(false);
        }
      } else {
        this.hayMasDatos.set(false);
      }
    } catch (error: any) {
      console.error('Error cargando más datos:', error.message);
    } finally {
      this.cargandoMas.set(false);
      this.cdr.markForCheck();
    }
  }

  // ==================== CARGA DE DATOS ====================
  async cargarDatos() {
    this.cargando.set(true);
    this.cargandoTotales.set(true);
    this.hayMasDatos.set(true);

    const from = (this.paginaActual() - 1) * this.itemsPorPagina();
    const to = from + this.itemsPorPagina() - 1;

    try {
      let queryDatos = this.supabase.getClient()
        .from('vista_historial_unificado')
        .select(this.COLUMNAS_VISTA, { count: 'exact' });
      
      queryDatos = this.aplicarFiltrosBase(queryDatos);
      
      const resDatos = await queryDatos.order('fecha', { ascending: false }).range(from, to);

      if (resDatos.error) throw resDatos.error;

      this.totalItems.set(resDatos.count || 0);
      
      const itemsMapeados = (resDatos.data || []).map((item: any) => ({
        ...item,
        fecha: new Date(item.fecha),
        fecha_venta: item.fecha ? new Date(item.fecha) : null,
        fecha_recambio: item.fecha ? new Date(item.fecha) : null,
        venta_id: item.venta_id_referencia,
        motivo_eliminacion: item.motivo 
      }));

      this.items.set(itemsMapeados);
      this.cargando.set(false);
      this.cdr.markForCheck();

      this.calcularTotalesEnSegundoPlano();

    } catch (error: any) {
      console.error('Error cargando historial:', error.message);
      this.mostrarToast('Error al cargar los datos', 'error');
      this.cargando.set(false);
      this.cargandoTotales.set(false);
      this.cdr.markForCheck();
    }
  }

  async calcularTotalesEnSegundoPlano() {
    try {
      let queryTotales = this.supabase.getClient()
        .from('vista_historial_unificado')
        .select('tipo, total_final');
      
      queryTotales = this.aplicarFiltrosBase(queryTotales);

      const resTotales = await queryTotales;

      if (!resTotales.error) {
        const todosLosRegistros = resTotales.data || [];
        
        const sumaVentas = todosLosRegistros
          .filter((i: any) => i.tipo === 'venta')
          .reduce((acc: number, i: any) => acc + (i.total_final || 0), 0);

        const sumaRecambios = todosLosRegistros
          .filter((i: any) => i.tipo === 'recambio')
          .reduce((acc: number, i: any) => acc + (i.total_final || 0), 0);

        this.totalVentas.set(sumaVentas);
        this.totalRecambios.set(sumaRecambios);
      }
    } catch (err) {
      console.error('Error calculando totales en background:', err);
    } finally {
      this.cargandoTotales.set(false);
      this.cdr.markForCheck();
    }
  }

  async cargarProductosDisponibles() {
    const { data: productos, error } = await this.supabase
      .getClient()
      .from('productos')
      .select(this.COLUMNAS_PRODUCTOS)
      .gt('cantidad_stock', 0)
      .order('nombre');

    if (!error && productos) {
      this.productosDisponibles.set(productos);
      this.cdr.markForCheck();
    }
  }

  async cargarConfigRecibo(): Promise<void> {
  try {
    const { data, error } = await this.supabase.getClient()
      .from('configuracion_recibo')
      .select('*')
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No hay configuración guardada, dejamos null
        this.configRecibo.set(null);
        return;
      }
      throw error;
    }

    if (data) {
      this.configRecibo.set(data);
    }
  } catch (error) {
    console.error('Error al cargar configuración del recibo:', error);
    this.configRecibo.set(null);
  }
  this.cdr.markForCheck();
}

  // ==================== MÉTODOS DE RECAMBIO ====================
  puedeRealizarRecambio(venta: any): boolean {
    const fechaVenta = new Date(venta.fecha_venta);
    const ahora = new Date();
    const diferenciaDias = Math.floor((ahora.getTime() - fechaVenta.getTime()) / (1000 * 60 * 60 * 24));
    
    return diferenciaDias <= 10 && !venta.recambio_realizado;
  }

  iniciarRecambio(venta: any) {
    if (!this.puedeRealizarRecambio(venta)) return;
    
    this.ventaSeleccionada.set(venta);
    
    const productosOriginalesArray = venta.productos.map((p: any) => {
      const precioConDescuento = venta.descuento_aplicado > 0 
        ? p.precio_unitario * (1 - venta.descuento_aplicado / 100)
        : p.precio_unitario;
      
      return {
        producto_id: p.producto_id,
        nombre: p.nombre,
        marca: p.marca || 'Sin marca',
        cantidad: p.cantidad,
        precio_unitario: precioConDescuento,
        subtotal: precioConDescuento * p.cantidad,
        talle: p.talle,
        seleccionado: false,
        cantidadDevolver: 1
      };
    });
    
    this.productosOriginales.set(productosOriginalesArray);
    this.productosRecambio.set([]);
    this.motivoRecambio.set('');
    this.observacionesRecambio.set('');
    this.metodoPagoSeleccionado.set('');
    this.busquedaProducto.set('');
    this.codigoDescuentoRecambio.set('');
    this.descuentoRecambioAplicado.set(0);
    this.montoDescuentoRecambio.set(0);
    
    this.calcularTotalesRecambio();
    this.mostrarModalRecambio.set(true);
    this.cdr.markForCheck();
  }

  cerrarModalRecambio() {
    this.mostrarModalRecambio.set(false);
    this.ventaSeleccionada.set(null);
    this.productosOriginales.set([]);
    this.productosRecambio.set([]);
    this.cdr.markForCheck();
  }

  buscarProductos() {
    // La búsqueda se hace automáticamente vía computed signal
    this.cdr.markForCheck();
  }

  agregarProductoRecambio(producto: ProductoDisponible) {
    this.productosRecambio.update(current => {
      const existe = current.find(p => 
        p.producto.id === producto.id && p.producto.talle === producto.talle
      );
      
      if (existe) {
        if (existe.cantidad < producto.cantidad_stock) {
          existe.cantidad++;
        }
        return [...current];
      } else {
        return [...current, { producto: producto, cantidad: 1 }];
      }
    });
    
    this.calcularTotalesRecambio();
    this.cdr.markForCheck();
  }

  quitarProductoRecambio(index: number) {
    this.productosRecambio.update(current => {
      const newArray = [...current];
      newArray.splice(index, 1);
      return newArray;
    });
    this.calcularTotalesRecambio();
    this.cdr.markForCheck();
  }

  getOpcionesCantidad(cantidadMaxima: number | undefined): number[] {
    const cantidad = cantidadMaxima || 1;
    return Array.from({ length: cantidad }, (_, i) => i + 1);
  }

  async aplicarDescuentoRecambio() {
    const codigo = this.codigoDescuentoRecambio();
    
    if (!codigo?.trim()) {
      this.mostrarToast('Por favor, introduce un código de descuento.', 'warning');
      return;
    }

    const { data, error } = await this.supabase
      .getClient()
      .from('descuentos')
      .select('*')
      .eq('codigo', codigo)
      .eq('activo', true)
      .single();

    if (data) {
      if (data.tipo === 'cantidad') {
        this.mostrarToast(' Los descuentos por cantidad (2x1, 3x2, etc.) no están disponibles para recambios. Solo se permiten descuentos por porcentaje.', 'error');
        this.codigoDescuentoRecambio.set('');
        return;
      }

      if (!data.porcentaje || data.porcentaje <= 0) {
        this.mostrarToast('El descuento no tiene un porcentaje válido.', 'error');
        this.codigoDescuentoRecambio.set('');
        return;
      }

      this.descuentoRecambioAplicado.set(data.porcentaje);
      this.calcularTotalesRecambio();
      this.mostrarToast('Descuento aplicado correctamente.', 'success');
    } else {
      this.descuentoRecambioAplicado.set(0);
      this.codigoDescuentoRecambio.set('');
      this.calcularTotalesRecambio();
      this.mostrarToast('Código de descuento inválido o inactivo.', 'error');
    }
    this.cdr.markForCheck();
  }

  quitarDescuentoRecambio() {
    this.descuentoRecambioAplicado.set(0);
    this.codigoDescuentoRecambio.set('');
    this.calcularTotalesRecambio();
    this.mostrarToast('Descuento eliminado.', 'warning');
  }

  calcularTotalesRecambio() {
    const devuelto = this.productosOriginales()
      .filter(p => p.seleccionado)
      .reduce((total, p) => total + (p.precio_unitario * p.cantidadDevolver), 0);
    
    const recambioSinDesc = this.productosRecambio()
      .reduce((total, item) => total + (item.producto.precio * item.cantidad), 0);
    
    const montoDesc = recambioSinDesc * (this.descuentoRecambioAplicado() / 100);
    const recambioTotal = recambioSinDesc - montoDesc;
    
    this.totalDevuelto.set(devuelto);
    this.totalRecambioSinDescuento.set(recambioSinDesc);
    this.montoDescuentoRecambio.set(montoDesc);
    this.totalRecambio.set(recambioTotal);
    this.diferencia.set(recambioTotal - devuelto);
    this.cdr.markForCheck();
  }

  puedeConfirmarRecambio(): boolean {
    const tieneProductosDevueltos = this.productosOriginales().some(p => p.seleccionado);
    const tieneProductosRecambio = this.productosRecambio().length > 0;
    const tieneMotivo = this.motivoRecambio().trim().length > 0;
    const tienePagoSiEsNecesario = this.diferencia() <= 0 || this.metodoPagoSeleccionado().length > 0;
    
    return tieneProductosDevueltos && tieneProductosRecambio && tieneMotivo && tienePagoSiEsNecesario && !this.procesandoRecambio();
  }

  async procesarRecambio() {
    if (!this.puedeConfirmarRecambio()) {
      if (!this.productosOriginales().some(p => p.seleccionado)) {
        this.mostrarToast('Debes seleccionar al menos un producto para devolver.', 'warning');
      } else if (this.productosRecambio().length === 0) {
        this.mostrarToast('Debes seleccionar al menos un producto para el recambio.', 'warning');
      } else if (!this.motivoRecambio().trim()) {
        this.mostrarToast('Debes especificar un motivo para el recambio.', 'error');
      } else if (this.diferencia() > 0 && !this.metodoPagoSeleccionado()) {
        this.mostrarToast('Debes seleccionar un método de pago para la diferencia.', 'error');
      }
      return;
    }
    
    if (this.diferencia() < 0) {
      this.mostrarToast(
        'El recambio no puede generar un saldo a favor del cliente. El total de los productos de recambio debe ser igual o mayor al total de los productos devueltos.', 
        'error'
      );
      return;
    }

    this.procesandoRecambio.set(true);
    
    try {
      const client = this.supabase.getClient();
      const venta = this.ventaSeleccionada();
      
      const ventaOriginalFiada = venta.metodo_pago === 'fiado';
      const diferenciaFiada = this.diferencia() > 0 && this.metodoPagoSeleccionado() === 'fiado';
      
      const { data: ventaData, error: errorVenta } = await client
        .from('ventas')
        .select('cliente_id')
        .eq('id', venta.id)
        .single();
      
      if (errorVenta) {
        throw new Error(`Error al obtener información de la venta: ${errorVenta.message}`);
      }
      
      let ventaCreditoId: string | null = null;
      let saldoPendiente = 0;
      let clienteId: string | null = null;
      
      if (ventaOriginalFiada && diferenciaFiada && ventaData?.cliente_id) {
        const { data: ventaCredito, error: errorVentaCredito } = await client
          .from('ventas_credito')
          .select('id, saldo_pendiente, cliente_id')
          .eq('venta_id', venta.id)
          .single();
        
        if (errorVentaCredito && errorVentaCredito.code !== 'PGRST116') {
          throw new Error(`Error al verificar venta fiada: ${errorVentaCredito.message}`);
        }
        
        if (ventaCredito) {
          ventaCreditoId = ventaCredito.id;
          saldoPendiente = ventaCredito.saldo_pendiente;
          clienteId = ventaCredito.cliente_id;
          
          const { data: pagos, error: errorPagos } = await client
            .from('pagos_cliente')
            .select('id')
            .eq('venta_credito_id', ventaCreditoId);
          
          if (errorPagos) {
            throw new Error(`Error al verificar pagos: ${errorPagos.message}`);
          }
          
          if (pagos && pagos.length > 0) {
            this.mostrarToast(' No se puede eliminar la venta porque tiene pagos asociados. Debe contactar con el soporte del sistema.', 'error');
            this.procesandoRecambio.set(false);
            return;
          }
        }
      }
      
      for (const producto of this.productosOriginales().filter(p => p.seleccionado)) {
        const { error: errorStock } = await client.rpc('actualizar_stock', {
          producto_id: producto.producto_id,
          cantidad_cambio: producto.cantidadDevolver
        });
        
        if (errorStock) {
          throw new Error(`Error al actualizar stock de producto devuelto: ${errorStock.message}`);
        }
      }
      
      for (const item of this.productosRecambio()) {
        const { error: errorStock } = await client.rpc('actualizar_stock', {
          producto_id: item.producto.id,
          cantidad_cambio: -item.cantidad
        });
        
        if (errorStock) {
          throw new Error(`Error al actualizar stock de producto de recambio: ${errorStock.message}`);
        }
      }
      
      const productosDevueltosJson = this.productosOriginales()
        .filter(p => p.seleccionado)
        .map(p => ({
          producto_id: p.producto_id,
          nombre: p.nombre,
          marca: p.marca || 'No hay marca',
          cantidad: p.cantidadDevolver,
          precio_unitario: p.precio_unitario,
          subtotal: p.precio_unitario * p.cantidadDevolver,
          talle: p.talle
        }));
      
      const productosRecambioJson = this.productosRecambio().map(item => ({
        producto_id: item.producto.id,
        nombre: item.producto.nombre,
        marca: item.producto.marca || 'No hay marca',
        cantidad: item.cantidad,
        precio_unitario: item.producto.precio,
        subtotal: item.producto.precio * item.cantidad,
        talle: item.producto.talle
      }));
      
      const usuarioNombre = this.usuarioActual?.user_metadata?.['nombre'] || 'Usuario desconocido';
      
      const { data: recambio, error: errorRecambio } = await client
        .from('recambios')
        .insert({
          venta_id: venta.id,
          total_original: venta.total_final,
          total_recambio: this.totalRecambio(),
          total_devuelto: this.totalDevuelto(),
          diferencia_abonada: Math.max(0, this.diferencia()),
          motivo: this.motivoRecambio(),
          observaciones: this.observacionesRecambio(),
          metodo_pago_diferencia: this.diferencia() > 0 ? this.metodoPagoSeleccionado() : null,
          productos_devueltos_json: productosDevueltosJson,
          productos_recambio_json: productosRecambioJson,
          realizado_por: usuarioNombre,
          descuento_recambio: this.descuentoRecambioAplicado(),
          monto_descuento_recambio: this.montoDescuentoRecambio()
        })
        .select()
        .single();
      
      if (errorRecambio) {
        throw new Error(`Error al crear recambio: ${errorRecambio.message}`);
      }
      
      for (const item of this.productosRecambio()) {
        const { error: errorDetalle } = await client
          .from('detalle_recambio')
          .insert({
            recambio_id: recambio.id,
            producto_id: item.producto.id,
            cantidad: item.cantidad,
            precio_unitario: item.producto.precio,
            subtotal: item.producto.precio * item.cantidad,
            talle: item.producto.talle
          });
        
        if (errorDetalle) {
          throw new Error(`Error al crear detalle de recambio: ${errorDetalle.message}`);
        }
      }
      
      const { error: errorVentaMarca } = await client
        .from('ventas')
        .update({ recambio_realizado: true })
        .eq('id', venta.id);
      
      if (errorVentaMarca) {
        throw new Error(`Error al marcar venta como recambiada: ${errorVentaMarca.message}`);
      }
      
      if (this.diferencia() > 0 && this.metodoPagoSeleccionado() === 'efectivo') {
        await this.registrarMovimientoEnCaja(
          this.diferencia(),
          venta.id,
          venta.cliente_nombre
        );
      }
      
      await this.cargarDatos();
      this.cerrarModalRecambio();
      
      const mensajeExito = diferenciaFiada 
        ? '¡Recambio procesado exitosamente! El saldo del cliente ha sido actualizado.'
        : '¡Recambio procesado exitosamente!';
      
      this.mostrarToast(mensajeExito, 'success');
      
    } catch (error: any) {
      console.error('Error al procesar recambio:', error);
      this.mostrarToast(`Error al procesar el recambio: ${error.message}`, 'error');
    } finally {
      this.procesandoRecambio.set(false);
      this.cdr.markForCheck();
    }
  }

  async registrarMovimientoEnCaja(
    monto: number,
    ventaId: string,
    clienteNombre: string
  ): Promise<void> {
    try {
      const { data: cajaAbierta, error: errorCaja } = await this.supabase
        .getClient()
        .from('cajas')
        .select('*')
        .eq('estado', 'abierta')
        .maybeSingle();

      if (errorCaja) {
        console.error('Error al buscar caja abierta:', errorCaja);
        return;
      }

      if (!cajaAbierta) {
        console.warn('No hay caja abierta, no se registrará el movimiento');
        return;
      }

      const usuarioNombre = this.usuarioActual?.user_metadata?.['nombre'] || 'Usuario desconocido';
      const usuarioId = this.usuarioActual?.id || 'unknown';

      const movimiento = {
        caja_id: cajaAbierta.id,
        tipo: 'ingreso',
        concepto: 'Recambio - Diferencia en efectivo',
        monto: monto,
        metodo: 'efectivo',
        venta_id: ventaId,
        usuario_id: usuarioId,
        usuario_nombre: usuarioNombre,
        observaciones: `Recambio de ${clienteNombre} - Diferencia pagada en efectivo`,
        created_at: new Date().toISOString()
      };

      const { error: errorMovimiento } = await this.supabase
        .getClient()
        .from('movimientos_caja')
        .insert(movimiento);

      if (errorMovimiento) {
        console.error('Error al registrar movimiento en caja:', errorMovimiento);
        return;
      }

      const nuevoMontoActual = cajaAbierta.monto_actual + monto;

      const { error: errorActualizacion } = await this.supabase
        .getClient()
        .from('cajas')
        .update({ 
          monto_actual: nuevoMontoActual,
          updated_at: new Date().toISOString()
        })
        .eq('id', cajaAbierta.id);

      if (errorActualizacion) {
        console.error('Error al actualizar monto de caja:', errorActualizacion);
      }
    } catch (error) {
      console.error('Error al registrar movimiento en caja:', error);
    }
  }

  // ==================== MÉTODOS DE ELIMINACIÓN ====================
  iniciarEliminacionVenta(venta: any) {
  // Condición 1: No se puede eliminar si tiene recambio
  if (venta.recambio_realizado) {
    this.mostrarToast('No se puede eliminar una venta que ya tiene un recambio realizado.', 'error');
    return;
  }
  
  // Condición 2: No se puede eliminar si está facturada
  if (venta.facturada) {
    this.mostrarToast('No se puede eliminar una venta que ya ha sido facturada ante ARCA.', 'error');
    return;
  }
  
  this.ventaAEliminar.set(venta);
  this.mostrandoConfirmacionEliminar.set(true);
  this.cdr.markForCheck();
}
  cancelarEliminacion() {
    this.mostrandoConfirmacionEliminar.set(false);
    this.ventaAEliminar.set(null);
    this.motivoEliminacion.set('');
    this.cdr.markForCheck();
  }

  async confirmarEliminacion() {
    const venta = this.ventaAEliminar();
    if (!venta || this.eliminandoVenta()) return;

  if (venta.facturada) {
    this.mostrarToast('Operación no permitida: La venta se encuentra facturada.', 'error');
    this.cancelarEliminacion();
    return;
  }
    
    if (!this.motivoEliminacion().trim()) {
      this.mostrarToast('El motivo de eliminación es obligatorio.', 'error');
      return;
    }

    this.eliminandoVenta.set(true);
    
    const metodoPagoOriginal = venta.metodo_pago;
    
    try {
      const client = this.supabase.getClient();
      const usuarioNombre = this.usuarioActual?.user_metadata?.['nombre'] || 'Usuario desconocido';
      
      let ventaCreditoId: string | null = null;
      let saldoPendiente = 0;
      let clienteId: string | null = null;
      
      if (metodoPagoOriginal === 'fiado') {
        const { data: ventaCredito, error: errorVentaCredito } = await client
          .from('ventas_credito')
          .select('id, saldo_pendiente, cliente_id')
          .eq('venta_id', venta.id)
          .single();
        
        if (errorVentaCredito && errorVentaCredito.code !== 'PGRST116') {
          throw new Error(`Error al verificar venta fiada: ${errorVentaCredito.message}`);
        }
        
        if (ventaCredito) {
          ventaCreditoId = ventaCredito.id;
          saldoPendiente = ventaCredito.saldo_pendiente;
          clienteId = ventaCredito.cliente_id;
          
          const { data: pagos, error: errorPagos } = await client
            .from('pagos_cliente')
            .select('id')
            .eq('venta_credito_id', ventaCreditoId);
          
          if (errorPagos) {
            throw new Error(`Error al verificar pagos: ${errorPagos.message}`);
          }
          
          if (pagos && pagos.length > 0) {
            this.mostrarToast(' No se puede eliminar la venta porque tiene pagos asociados. Debe contactar con el soporte del sistema.', 'error');
            this.eliminandoVenta.set(false);
            return;
          }
        }
      }
      
      const { error: errorVentaEliminada } = await client
        .from('ventas_eliminadas')
        .insert({
          venta_id_original: venta.id,
          cliente_nombre: venta.cliente_nombre,
          cliente_email: venta.cliente_email,
          fecha_venta_original: venta.fecha_venta,
          nombre_usuario: venta.nombre_usuario,
          metodo_pago: venta.metodo_pago,
          descuento_aplicado: venta.descuento_aplicado || 0,
          total_final: venta.total_final,
          productos_eliminados_json: venta.productos,
          eliminado_por: usuarioNombre,
          motivo_eliminacion: this.motivoEliminacion().trim()
        });
      
      if (errorVentaEliminada) {
        throw new Error(`Error al guardar venta eliminada: ${errorVentaEliminada.message}`);
      }
      
      if (clienteId && saldoPendiente > 0) {
        const { error: errorActualizarCliente } = await client.rpc('actualizar_saldo_cliente', {
          p_cliente_id: clienteId,
          p_monto: -saldoPendiente
        });
        
        if (errorActualizarCliente) {
          throw new Error(`Error al actualizar saldo del cliente: ${errorActualizarCliente.message}`);
        }
      }
      
      if (ventaCreditoId) {
        const { error: errorVentaCredito } = await client
          .from('ventas_credito')
          .delete()
          .eq('id', ventaCreditoId);
        
        if (errorVentaCredito) {
          throw new Error(`Error al eliminar venta crédito: ${errorVentaCredito.message}`);
        }
      }
      
      for (const producto of venta.productos) {
        const { error: errorStock } = await client.rpc('actualizar_stock', {
          producto_id: producto.producto_id,
          cantidad_cambio: producto.cantidad
        });
        
        if (errorStock) {
          throw new Error(`Error al restaurar stock del producto: ${errorStock.message}`);
        }
      }
      
      const { error: errorDetalle } = await client
        .from('detalle_venta')
        .delete()
        .eq('venta_id', venta.id);
      
      if (errorDetalle) {
        throw new Error(`Error al eliminar detalle de venta: ${errorDetalle.message}`);
      }
      
      const { error: errorVenta } = await client
        .from('ventas')
        .delete()
        .eq('id', venta.id);
      
      if (errorVenta) {
        throw new Error(`Error al eliminar venta: ${errorVenta.message}`);
      }
      
      await this.cargarDatos();
      this.cancelarEliminacion();
      
      const mensajeExito = metodoPagoOriginal === 'fiado' 
        ? ' Venta eliminada exitosamente. El stock y el saldo del cliente han sido restaurados.'
        : ' Venta eliminada exitosamente. El stock ha sido restaurado.';
      
      this.mostrarToast(mensajeExito, 'success');
      
    } catch (error: any) {
      console.error('Error al eliminar venta:', error);
      this.mostrarToast(` Error al eliminar la venta: ${error.message}`, 'error');
    } finally {
      this.eliminandoVenta.set(false);
      this.cdr.markForCheck();
    }
  }

  // ==================== MÉTODOS DE RECIBO Y EMAIL ====================
  abrirModalRecibo(venta: any) {
  this.ventaParaGenerarRecibo.set(venta);
  this.accionRecibo.set('imprimir');
  this.mostrarModalFormatoRecibo.set(true);
  this.cdr.markForCheck();
}

  cerrarModalRecibo() {
    this.mostrarModalRecibo.set(false);
    this.ventaParaRecibo.set(null);
    this.cdr.markForCheck();
  }

  abrirModalEmail(venta: any) {
  this.ventaParaEmail.set(venta);
  this.emailDestino.set(venta.cliente_email || '');
  this.mostrarModalEmail.set(true);
  this.cdr.markForCheck();
}

  cerrarModalEmail() {
    this.mostrarModalEmail.set(false);
    this.ventaParaEmail.set(null);
    this.emailDestino.set('');
    this.cdr.markForCheck();
  }

//método para cerrar modal de formato:
cerrarModalFormatoRecibo() {
  this.mostrarModalFormatoRecibo.set(false);
  this.ventaParaGenerarRecibo.set(null);
  this.cdr.markForCheck();
}

// método para seleccionar formato:
async seleccionarFormatoRecibo(formato: 'termica' | 'a4') {
  const venta = this.ventaParaGenerarRecibo();
  const accion = this.accionRecibo();
  
  this.cerrarModalFormatoRecibo();
  
  if (accion === 'imprimir') {
    await this.generarReciboPDF(venta, true, formato);
  } else if (accion === 'visualizar') {
    await this.visualizarRecibo(venta, formato);
  } 
}

private async generarReciboA4(venta: any, descargar: boolean, jsPDF: any): Promise<Blob | undefined> {
  const doc = new jsPDF({
    unit: 'mm',
    format: 'a4'
  });
  
  const config = this.configRecibo();
  const margenIzq = 20;
  const margenDer = 20;
  const anchoUtil = 170; // 210mm - 40mm de márgenes
  const anchoPagina = 210;
  let y = 20;
  
  // ==================== ENCABEZADO CON LOGO Y EMPRESA ====================
  // Fondo sutil para el encabezado
  doc.setFillColor(245, 248, 250);
  doc.rect(0, 0, anchoPagina, 70, 'F');
  
  if (config?.logo_url) {
    try {
      const logoWidth = 50;
      const logoHeight = 25;
      const logoX = margenIzq;
      doc.addImage(config.logo_url, 'JPG', logoX, y, logoWidth, logoHeight);
    } catch (error) {
      console.error('Error cargando logo:', error);
    }
  }
  
  // Información de la empresa (alineada a la derecha)
  const xEmpresa = anchoPagina - margenDer;
doc.setFontSize(16);
doc.setFont('helvetica', 'bold');
doc.setTextColor(31, 78, 120);

if (config?.nombre_negocio) {
  doc.text(config.nombre_negocio, xEmpresa, y, { align: 'right' });
  y += 6;
}

doc.setFontSize(9);
doc.setFont('helvetica', 'normal');
doc.setTextColor(80, 80, 80);

if (config?.direccion) {
  doc.text(config.direccion, xEmpresa, y, { align: 'right' });
  y += 4;
}

if (config?.ciudad) {
  doc.text(config.ciudad, xEmpresa, y, { align: 'right' });
  y += 4;
}

if (config?.telefono1 || config?.telefono2) {
  const telefonos = [config.telefono1, config.telefono2].filter(Boolean).join(' / ');
  doc.text(`Tel: ${telefonos}`, xEmpresa, y, { align: 'right' });
  y += 4;
}

if (config?.whatsapp1 || config?.whatsapp2) {
  const whatsapps = [config.whatsapp1, config.whatsapp2].filter(Boolean).join(' / ');
  doc.text(`WhatsApp: ${whatsapps}`, xEmpresa, y, { align: 'right' });
  y += 4;
}

if (config?.email_empresa) {
  doc.text(config.email_empresa, xEmpresa, y, { align: 'right' });
  y += 4;
}
  
  y = 70;
  doc.setTextColor(0, 0, 0);
  
  // ==================== TÍTULO DEL DOCUMENTO ====================
  y += 8;
  doc.setFontSize(24);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(31, 78, 120);
  doc.text('COMPROBANTE DE VENTA', anchoPagina / 2, y, { align: 'center' });
  y += 6;
  
  doc.setFontSize(9);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(120, 120, 120);
  doc.text('DOCUMENTO NO VÁLIDO COMO FACTURA', anchoPagina / 2, y, { align: 'center' });
  doc.setTextColor(0, 0, 0);
  y += 12;
  
  // ==================== INFORMACIÓN DE LA VENTA ====================
  const alturaInfoVenta = 32;
  
  // Borde decorativo
  doc.setDrawColor(31, 78, 120);
  doc.setLineWidth(0.5);
  doc.line(margenIzq, y, anchoPagina - margenDer, y);
  y += 2;
  
  // Contenedor con fondo
  doc.setFillColor(250, 252, 254);
  doc.rect(margenIzq, y, anchoUtil, alturaInfoVenta, 'F');
  doc.setDrawColor(200, 210, 220);
  doc.setLineWidth(0.3);
  doc.rect(margenIzq, y, anchoUtil, alturaInfoVenta);
  
  const yInfo = y + 8;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(60, 60, 60);
  
  // Columna izquierda
  const col1X = margenIzq + 8;
  const col2X = margenIzq + 50;
  
  doc.text('Nº Comprobante:', col1X, yInfo);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(31, 78, 120);
  doc.setFontSize(11);
  doc.text(`#${venta.id.slice(-8).toUpperCase()}`, col2X, yInfo);
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(60, 60, 60);
  doc.text('Fecha y Hora:', col1X, yInfo + 7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0, 0, 0);
  
  const fechaVenta = new Date(venta.fecha_venta);
  const fechaFormateada = fechaVenta.toLocaleDateString('es-AR', { 
    day: '2-digit', 
    month: '2-digit', 
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
  doc.text(fechaFormateada, col2X, yInfo + 7);
  
  // Columna derecha
  const col3X = margenIzq + 95;
  const col4X = margenIzq + 130;
  
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(60, 60, 60);
  doc.text('Vendedor:', col3X, yInfo);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0, 0, 0);
  const vendedor = doc.splitTextToSize(venta.nombre_usuario || 'N/A', 35);
  doc.text(vendedor, col4X, yInfo);
  
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(60, 60, 60);
  doc.text('Cliente:', col3X, yInfo + 7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0, 0, 0);
  const cliente = venta.cliente_nombre ? venta.cliente_nombre.toUpperCase() : 'CONSUMIDOR FINAL';
  const clienteLineas = doc.splitTextToSize(cliente, 35);
  doc.text(clienteLineas, col4X, yInfo + 7);
  
  y += alturaInfoVenta + 2;
  
  // Línea decorativa
  doc.setDrawColor(31, 78, 120);
  doc.setLineWidth(0.5);
  doc.line(margenIzq, y, anchoPagina - margenDer, y);
  y += 12;
  
  // ==================== TABLA DE PRODUCTOS ====================
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(31, 78, 120);
  doc.text('DETALLE DE PRODUCTOS', margenIzq, y);
  y += 8;
  
  // Encabezado de tabla con diseño moderno
  const alturaEncabezado = 9;
  doc.setFillColor(31, 78, 120);
  doc.rect(margenIzq, y - 6, anchoUtil, alturaEncabezado, 'F');
  
  const colCant = margenIzq + 5;
const colDescripcion = margenIzq + 25;
const colTalle = margenIzq + 110;
// Ajustamos estas coordenadas para que sean el "tope derecho" de la columna
const colPrecioUnit = margenIzq + 145; 
const colSubtotal = margenIzq + 170;

doc.setFontSize(9);
doc.setFont('helvetica', 'bold');
doc.setTextColor(255, 255, 255);

doc.text('CANT.', colCant, y);
doc.text('DESCRIPCIÓN', colDescripcion, y);
doc.text('TALLE', colTalle, y);
// Usamos el mismo punto X para el encabezado y el contenido
doc.text('P. UNIT.', colPrecioUnit, y, { align: 'right' });
doc.text('SUBTOTAL', colSubtotal, y, { align: 'right' });

doc.setTextColor(0, 0, 0);
y += alturaEncabezado;
  
  // Productos con diseño alternado
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  
  let filaAlterna = false;
  
  for (const producto of venta.productos) {
    const alturaFila = 10;
    
    // Fondo alternado
    if (filaAlterna) {
      doc.setFillColor(248, 250, 252);
      doc.rect(margenIzq, y - 3, anchoUtil, alturaFila, 'F');
    }
    filaAlterna = !filaAlterna;
    
    // Cantidad
    doc.setFont('helvetica', 'bold');
    doc.text(`${producto.cantidad}`, colCant + 3, y, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    
    // Descripción con marca
    const nombreProducto = producto.nombre;
    const marcaProducto = producto.marca ? ` - ${producto.marca}` : '';
    const descripcionCompleta = `${nombreProducto}${marcaProducto}`;
    const descripcionLineas = doc.splitTextToSize(descripcionCompleta, 80);
    doc.text(descripcionLineas, colDescripcion, y);
    
    // Talle
    doc.text(producto.talle || '-', colTalle, y);

    // PRECIO UNITARIO: Ahora alineado exactamente al mismo eje 'right' del encabezado
    doc.text(`$ ${producto.precio_unitario.toFixed(2)}`, colPrecioUnit, y, { align: 'right' });

    const subtotalEsperado = producto.precio_unitario * producto.cantidad;
    const hayPromocion = subtotalEsperado > producto.subtotal;

    // SUBTOTAL: Ahora alineado exactamente al mismo eje 'right' del encabezado
    doc.setFont('helvetica', 'bold');
    if (hayPromocion) {
        doc.setTextColor(31, 73, 125); 
    }
    doc.text(`$ ${producto.subtotal.toFixed(2)}`, colSubtotal, y, { align: 'right' });

    if (hayPromocion) {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(7);
        // Alineamos el texto "PROMOCIÓN" también al eje derecho
        doc.text('PROMOCIÓN', colSubtotal, y + 3, { align: 'right' });
        doc.setFontSize(9);
    }
    
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 0);
    
    y += alturaFila;
    
    // Línea separadora sutil
    doc.setDrawColor(230, 235, 240);
    doc.setLineWidth(0.1);
    doc.line(margenIzq, y - 2, anchoPagina - margenDer, y - 2);
  }
  
  y += 25; // CAMBIO: Incrementado de 25 a 35 (+10mm adicionales)
  
  // ==================== TOTALES CON DISEÑO MODERNO ====================
  const anchoCajaTotal = 75;
  const xCajaTotal = anchoPagina - margenDer - anchoCajaTotal;
  const yCajaTotal = y;
  
  // Borde y sombra para la caja de totales
  doc.setFillColor(250, 252, 254);
  doc.rect(xCajaTotal, yCajaTotal, anchoCajaTotal, 40, 'F');
  doc.setDrawColor(31, 78, 120);
  doc.setLineWidth(0.5);
  doc.rect(xCajaTotal, yCajaTotal, anchoCajaTotal, 40);
  
  y += 8;
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(60, 60, 60);
  
  const subtotal = venta.productos.reduce((sum: number, p: any) => sum + p.subtotal, 0);
  
  // Subtotal
  doc.text('Subtotal:', xCajaTotal + 8, y);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text(`$ ${subtotal.toFixed(2)}`, xCajaTotal + anchoCajaTotal - 8, y, { align: 'right' });
  y += 7;
  
  // Descuento si existe
  if (venta.descuento_aplicado > 0) {
    const montoDescuento = subtotal * venta.descuento_aplicado / 100;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(220, 53, 69);
    doc.text(`Descuento (${venta.descuento_aplicado}%):`, xCajaTotal + 8, y);
    doc.setFont('helvetica', 'bold');
    doc.text(`- $ ${montoDescuento.toFixed(2)}`, xCajaTotal + anchoCajaTotal - 8, y, { align: 'right' });
    doc.setTextColor(0, 0, 0);
    y += 7;
  }
  
  // Línea separadora
  doc.setDrawColor(31, 78, 120);
  doc.setLineWidth(0.3);
  doc.line(xCajaTotal + 8, y - 2, xCajaTotal + anchoCajaTotal - 8, y - 2);
  y += 5;
  
  // Total final destacado
  doc.setFillColor(31, 78, 120);
  doc.rect(xCajaTotal + 4, y - 5, anchoCajaTotal - 8, 10, 'F');
  
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text('TOTAL:', xCajaTotal + 8, y + 2);
  doc.text(`$ ${venta.total_final.toFixed(2)}`, xCajaTotal + anchoCajaTotal - 8, y + 2, { align: 'right' });
  doc.setTextColor(0, 0, 0);
  
  y += 38; // CAMBIO: Incrementado de 28 a 38 (+10mm)
  
  // ==================== MÉTODO DE PAGO ====================
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(60, 60, 60);
  const metodoPagoNormalizado = this.normalizarMetodoPagoParaMostrar(venta.metodo_pago || '');
  
  doc.setFillColor(245, 248, 250);
  doc.rect(margenIzq, y - 4, anchoUtil, 10, 'F');
  doc.setDrawColor(200, 210, 220);
  doc.setLineWidth(0.3);
  doc.rect(margenIzq, y - 4, anchoUtil, 10);
  
  doc.text('Forma de pago:', margenIzq + 8, y + 2);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(31, 78, 120);
  doc.text(metodoPagoNormalizado.toUpperCase(), margenIzq + 45, y + 2);
  
  y += 28; // Mantiene el espacio original entre método de pago y agradecimiento
  
  // ==================== MENSAJE DE AGRADECIMIENTO ====================
if (config?.mensaje_agradecimiento) {
  const yPieLinea = 275;
  const espacioMinimo = 8;
  
  if (y > yPieLinea - espacioMinimo) {
    y = yPieLinea - espacioMinimo;
  }
  
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(31, 78, 120);
  doc.text(config.mensaje_agradecimiento, anchoPagina / 2, y, { align: 'center' });
  doc.setTextColor(0, 0, 0);
}

// ==================== PIE DE PÁGINA ====================
const yPie = 280;
const yPieLinea = 275;

// Línea decorativa
doc.setDrawColor(31, 78, 120);
doc.setLineWidth(0.3);
doc.line(margenIzq, yPieLinea, anchoPagina - margenDer, yPieLinea);

doc.setFontSize(8);
doc.setFont('helvetica', 'normal');
doc.setTextColor(120, 120, 120);

const mensajePie = config?.mensaje_pie || 'DESARROLLADO POR PRISYS SOLUTIONS';
doc.text(mensajePie, anchoPagina / 2, yPie, { align: 'center' });

const emailDev = config?.email_desarrollador || 'prisys.solutions@gmail.com';
doc.text(emailDev, anchoPagina / 2, yPie + 4, { align: 'center' });

doc.setTextColor(0, 0, 0);
  
  return doc.output('blob');
}

async generarReciboPDF(venta: any, descargar: boolean = true, formato: 'termica' | 'a4' = 'termica'): Promise<Blob | undefined> {
  this.generandoRecibo.set(true);
  
  try {
    const { default: jsPDF } = await import('jspdf');
    
    let pdfBlob: Blob | undefined;
    
    if (formato === 'a4') {
      pdfBlob = await this.generarReciboA4(venta, false, jsPDF);
    } else {
      pdfBlob = await this.generarReciboTermica(venta, false, jsPDF); 
    }
    
    // SOLO abre la ventana de impresión si descargar es true
    if (pdfBlob && descargar) {
      const pdfUrl = URL.createObjectURL(pdfBlob);
      const printWindow = window.open(pdfUrl, '_blank');
      
      if (printWindow) {
        printWindow.onload = () => {
          printWindow.print();
          setTimeout(() => URL.revokeObjectURL(pdfUrl), 100);
        };
      }
      
      this.mostrarToast('Abriendo vista de impresión...', 'success');
    }
    
    return pdfBlob;
    
  } catch (error: any) {
    console.error('Error al generar recibo:', error);
    this.mostrarToast('Error al generar el recibo', 'error');
    return undefined;
  } finally {
    this.generandoRecibo.set(false);
    this.cdr.markForCheck();
  }
}

private async generarReciboTermica(venta: any, descargar: boolean, jsPDF: any): Promise<Blob | undefined> {
  const alturaBase = 160;
  const alturaPorProducto = 16;
  const cantidadProductos = venta.productos.length;
  const alturaEstimada = alturaBase + (cantidadProductos * alturaPorProducto);

  const doc = new jsPDF({
    unit: 'mm',
    format: [80, Math.max(alturaEstimada, 180)]
  });
  
  const config = this.configRecibo();
  const margen = 5;
  const anchoUtil = 70;
  const alturaPagina = doc.internal.pageSize.height;
  let y = 8;
  
  // ========== ENCABEZADO ==========
  
  // Logo centrado
  if (config?.logo_url) {
    try {
      const logoWidth = 30;
      const logoHeight = 15;
      const logoX = (80 - logoWidth) / 2;
      doc.addImage(config.logo_url, 'JPG', logoX, y, logoWidth, logoHeight);
      y += logoHeight + 4;
    } catch (error) {
      y += 2;
    }
  } else {
    y += 2;
  }

  // Nombre del negocio
  if (config?.nombre_negocio) {
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text(config.nombre_negocio, 40, y, { align: 'center' });
  y += 6;
}

// Información de contacto
doc.setFontSize(7.5);
doc.setFont('helvetica', 'normal');

if (config?.direccion) {
  doc.text(config.direccion, 40, y, { align: 'center' });
  y += 3.5;
}

if (config?.ciudad) {
  doc.text(config.ciudad, 40, y, { align: 'center' });
  y += 3.5;
}

if (config?.telefono1 || config?.telefono2) {
  const telefonos = [config.telefono1, config.telefono2].filter(Boolean).join(' - ');
  doc.text(`Tel: ${telefonos}`, 40, y, { align: 'center' });
  y += 3.5;
}

if (config?.whatsapp1 || config?.whatsapp2) {
  const whatsapps = [config.whatsapp1, config.whatsapp2].filter(Boolean).join(' - ');
  doc.text(`WhatsApp: ${whatsapps}`, 40, y, { align: 'center' });
  y += 3.5;
}

if (config?.email_empresa) {
  doc.text(config.email_empresa, 40, y, { align: 'center' });
  y += 3.5;
}
  
  y += 4;
  
  // Línea separadora
  doc.setLineWidth(0.4);
  doc.setDrawColor(0, 0, 0);
  doc.line(margen, y, margen + anchoUtil, y);
  y += 5;
  
  // ========== COMPROBANTE ==========
  
  // Caja de comprobante
  doc.setFillColor(240, 240, 240);
  doc.rect(margen, y - 3, anchoUtil, 10, 'F');
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('COMPROBANTE DE VENTA', 40, y + 1, { align: 'center' });
  y += 4;
  
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.text('NO VÁLIDO COMO FACTURA', 40, y + 1, { align: 'center' });
  y += 8;
  
  // ========== DATOS DE LA VENTA ==========
  
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  
  // Código
  doc.text('Código:', margen, y);
  doc.setFont('helvetica', 'bold');
  doc.text(`#${venta.id.slice(-8)}`, margen + 20, y);
  y += 4.5;
  
  // Fecha
  const fechaVenta = new Date(venta.fecha_venta);
  const dia = String(fechaVenta.getDate()).padStart(2, '0');
  const mes = String(fechaVenta.getMonth() + 1).padStart(2, '0');
  const anio = fechaVenta.getFullYear();
  const hora = String(fechaVenta.getHours()).padStart(2, '0');
  const minutos = String(fechaVenta.getMinutes()).padStart(2, '0');
  const fechaFormateada = `${dia}/${mes}/${anio} ${hora}:${minutos}`;

  doc.setFont('helvetica', 'normal');
  doc.text('Fecha:', margen, y);
  doc.setFont('helvetica', 'bold');
  doc.text(fechaFormateada, margen + 20, y);
  y += 4.5;
  
  // Cliente (si existe)
  if (venta.cliente_nombre) {
    doc.setFont('helvetica', 'normal');
    doc.text('Cliente:', margen, y);
    doc.setFont('helvetica', 'bold');
    const clienteTexto = doc.splitTextToSize(venta.cliente_nombre.toUpperCase(), 45);
    doc.text(clienteTexto, margen + 20, y);
    y += clienteTexto.length * 4 + 0.5;
  }
  
  // Vendedor
  doc.setFont('helvetica', 'normal');
  doc.text('Vendedor:', margen, y);
  doc.setFont('helvetica', 'bold');
  const vendedorTexto = doc.splitTextToSize(venta.nombre_usuario, 45);
  doc.text(vendedorTexto, margen + 20, y);
  y += vendedorTexto.length * 4 + 3;
  
  // Separador
  doc.setLineWidth(0.3);
  doc.setDrawColor(200, 200, 200);
  doc.line(margen, y, margen + anchoUtil, y);
  y += 4.5;
  
  // ========== PRODUCTOS ==========
  
  // Encabezado de productos
  doc.setFillColor(245, 245, 245);
  doc.rect(margen, y - 2, anchoUtil, 6, 'F');
  
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.setDrawColor(0, 0, 0);
  doc.text('CANT', margen + 1, y + 2);
  doc.text('DESCRIPCIÓN', margen + 12, y + 2);
  doc.text('IMPORTE', margen + anchoUtil - 6, y + 2, { align: 'right' });
  y += 5;
  
  doc.setLineWidth(0.2);
  doc.line(margen, y, margen + anchoUtil, y);
  y += 3.5;
  
  // Lista de productos
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  
  for (const producto of venta.productos) {
    // Cantidad
    doc.setFont('helvetica', 'bold');
    doc.text(`${producto.cantidad}`, margen + 3, y, { align: 'center' });
    
    // Descripción
    doc.setFont('helvetica', 'normal');
    const descripcion = `${producto.nombre}${producto.marca ? ' - ' + producto.marca : ''}`;
    const descripcionLineas = doc.splitTextToSize(descripcion, 38);
    doc.text(descripcionLineas, margen + 12, y);
    
    // Importe
    doc.setFont('helvetica', 'bold');
    doc.text(`$${producto.subtotal.toFixed(2)}`, margen + anchoUtil - 6, y, { align: 'right' });
    
    const alturaDescripcion = descripcionLineas.length * 3.5;
    y += Math.max(alturaDescripcion, 4);
    
    // Detalle (precio unitario y talle)
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    let detalleTexto = `$${producto.precio_unitario.toFixed(2)} c/u`;
    if (producto.talle) {
      detalleTexto += ` • Talle: ${producto.talle}`;
    }
    doc.text(detalleTexto, margen + 12, y);
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(8);
    y += 4;
    
    // Línea separadora entre productos
    doc.setDrawColor(230, 230, 230);
    doc.setLineWidth(0.1);
    doc.line(margen + 12, y, margen + anchoUtil - 2, y);
    y += 2.5;
  }
  
  y += 2;
  
  // ========== TOTALES ==========
  
  // Línea antes de totales
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.3);
  doc.line(margen, y, margen + anchoUtil, y);
  y += 5;
  
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  
  const subtotal = venta.productos.reduce((sum: number, p: any) => sum + p.subtotal, 0);
  
  // Subtotal
  doc.text('Subtotal:', margen + 30, y);
  doc.text(`$${subtotal.toFixed(2)}`, margen + anchoUtil - 6, y, { align: 'right' });
  y += 4.5;
  
  // Descuento (si aplica)
  if (venta.descuento_aplicado > 0) {
    const montoDescuento = subtotal * venta.descuento_aplicado / 100;
    doc.setTextColor(200, 0, 0);
    doc.text(`Descuento (${venta.descuento_aplicado}%):`, margen + 30, y);
    doc.text(`-$${montoDescuento.toFixed(2)}`, margen + anchoUtil - 6, y, { align: 'right' });
    doc.setTextColor(0, 0, 0);
    y += 4.5;
  }
  
  // Total destacado
  y += 2;
  doc.setFillColor(240, 240, 240);
  doc.rect(margen, y - 3, anchoUtil, 10, 'F');
  
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('TOTAL:', margen + 5, y + 3);
  doc.text(`$${venta.total_final.toFixed(2)}`, margen + anchoUtil - 5, y + 3, { align: 'right' });
  y += 10;
  
  // Método de pago
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  const metodoPagoNormalizado = this.normalizarMetodoPagoParaMostrar(venta.metodo_pago || '');
  
  doc.text('Forma de pago:', margen, y);
  doc.setFont('helvetica', 'bold');
  doc.text(metodoPagoNormalizado.toUpperCase(), margen + 25, y);
  y += 8;
  
  // ========== PIE DE PÁGINA (AL FINAL) ==========
  
  // Calcular posición del pie de página (10mm desde el final)
  const yPie = alturaPagina - 15;
  
  // Línea doble de cierre
  doc.setLineWidth(0.4);
  doc.line(margen, yPie, margen + anchoUtil, yPie);
  doc.setLineWidth(0.2);
  doc.line(margen, yPie + 1, margen + anchoUtil, yPie + 1);
  
  // Mensaje de agradecimiento
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  const mensajeGracias = config?.mensaje_agradecimiento || '¡Gracias por su compra!';
  doc.text(mensajeGracias, 40, yPie + 6, { align: 'center' });
  
  // Información del desarrollador
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(120, 120, 120);
  const mensajePie = config?.mensaje_pie || 'DESARROLLADO POR PRISYS SOLUTIONS';
  doc.text(mensajePie, 40, yPie + 10, { align: 'center' });
  
  const emailDev = config?.email_desarrollador || 'prisys.solutions@gmail.com';
  doc.text(emailDev, 40, yPie + 13, { align: 'center' });
  
  return doc.output('blob');
}

  imprimirRecibo(venta: any) {
  // Este método ya no se usa directamente, se usa abrirModalRecibo
  this.abrirModalRecibo(venta);
}

  async visualizarRecibo(venta: ItemHistorial, formato: 'termica' | 'a4' = 'a4') {
  this.generandoRecibo.set(true);
  
  try {
    const pdfBlob = await this.generarReciboPDF(venta, false, formato);
    if (pdfBlob) {
      const pdfUrl = URL.createObjectURL(pdfBlob);
      window.open(pdfUrl, '_blank');
      this.mostrarToast('Recibo abierto en nueva pestaña', 'success');
    }
    this.cerrarModalRecibo();
  } catch (error) {
    console.error('Error al visualizar recibo:', error);
    this.mostrarToast('Error al visualizar el recibo', 'error');
  } finally {
    this.generandoRecibo.set(false);
    this.cdr.markForCheck();
  }
}

async enviarDetalleEmail() {
  const venta = this.ventaParaEmail();
  const email = this.emailDestino();

  if (!email.trim() || !venta || !this.emailEsValido()) {
    this.mostrarToast('Email inválido o datos incompletos', 'warning');
    return;
  }

  this.enviandoEmail.set(true);

  try {
    let pdfBlob: Blob;
    let payload: any;

    if (venta.facturada) {
      // --- CASO FACTURA ---
      const [
        { data: vComp, error: e1 }, 
        { data: configF, error: e2 }, 
        { data: configRec, error: e3 }
      ] = await Promise.all([
        this.supabase.getClient().from('ventas').select('*, detalle_venta(*, productos(*)), clientes(*)').eq('id', venta.id).single(),
        this.supabase.getClient().from('facturacion').select('*').single(),
        this.supabase.getClient().from('configuracion_recibo').select('*').single()
      ]);

      if (e1 || !vComp) throw new Error('No se pudo obtener datos de la factura');

      const configC = { 
        ...configF, 
        nombre_comercial: configRec?.nombre_negocio, 
        logo_url: configRec?.logo_url 
      };

      pdfBlob = await this.facturacionService.generarFacturaPDF(vComp, configC);
      
      payload = {
        email: email,
        pdfBase64: await this.blobToPureBase64(pdfBlob),
        numero: venta.factura_nro || venta.id.slice(-8),
        tipo: venta.factura_tipo || 'A',
        esFactura: true,
        nombreCliente: venta.cliente_nombre || 'Cliente'
      };
    } else {
      // --- CASO RECIBO ---
      const blobResult = await this.generarReciboPDF(venta, false, 'a4');
      if (!blobResult) throw new Error('No se pudo generar el PDF del recibo');
      pdfBlob = blobResult;

      payload = {
        email: email,
        pdfBase64: await this.blobToPureBase64(pdfBlob),
        numero: venta.id.slice(-8),
        tipo: 'Recibo',
        esFactura: false,
        nombreCliente: venta.cliente_nombre || 'Cliente'
      };
    }

    // Invocamos la función unificada
    const resultado = await this.invocarEnvioComprobante(payload);
    
    if (resultado.success) {
      this.mostrarToast('Enviado correctamente a ' + email, 'success');
      this.cerrarModalEmail();
    } else {
      throw new Error(resultado.error || 'Error desconocido en el servidor');
    }

  } catch (error: any) {
    console.error('❌ Error en el proceso de envío:', error);
    this.mostrarToast('Error: ' + (error.message || 'No se pudo enviar el correo'), 'error');
  } finally {
    this.enviandoEmail.set(false);
    this.cdr.markForCheck();
  }
}

  private blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  // ==================== MÉTODOS DE UTILIDAD ====================
  esPagoMixto(metodoPago: string): boolean {
    return metodoPago?.includes('+') || metodoPago?.includes('(');
  }

  getMetodosPagoMixto(metodoPago: string): { metodo1: string; monto1: number; metodo2: string; monto2: number } | null {
    if (!this.esPagoMixto(metodoPago)) return null;
    
    const regex = /(\w+)\s*\(\$([0-9.]+)\)\s*\+\s*(\w+)\s*\(\$([0-9.]+)\)/;
    const match = metodoPago.match(regex);
    
    if (match) {
      return {
        metodo1: match[1],
        monto1: parseFloat(match[2]),
        metodo2: match[3],
        monto2: parseFloat(match[4])
      };
    }
    
    return null;
  }

  normalizarMetodoPago(metodo: string): string {
    return metodo === 'modo' ? 'mercado_pago' : metodo;
  }

  normalizarMetodoPagoParaMostrar(metodoPago: string): string {
    return metodoPago
      .replace(/\bmodo\b/g, 'mercado_pago')
      .replace(/_/g, ' ');
  }

  getMetodoLabel(metodo: string): string {
    return this.metodoPagoLabels[metodo] || metodo;
  }

  // ==================== FILTROS BASE ====================
  private aplicarFiltrosBase(query: any) {
  const filtro = this.filtro();
  const tipoFiltro = this.tipoFiltro();
  const metodoPagoFiltro = this.metodoPagoFiltro();
  const busqueda = this.busquedaCliente();
  const fechaEsp = this.fechaEspecifica();
  const fechaDesde = this.fechaDesde();
  const fechaHasta = this.fechaHasta();
  
  // FILTRO FACTURACIÓN
  const filtroFacturacion = this.filtroFacturacion();
  
  if (filtroFacturacion === 'facturadas') {
    query = query.eq('facturada', true);
  } else if (filtroFacturacion === 'no_facturadas') {
    query = query.not('facturada', 'eq', true);
  }

    // Filtro de Fecha
    if (filtro === 'hoy') {
      const hoy = new Date();
      hoy.setHours(0, 0, 0, 0);
      query = query.gte('fecha', hoy.toISOString());
    } else if (filtro === '7dias') {
      const hace7dias = new Date();
      hace7dias.setDate(hace7dias.getDate() - 7);
      query = query.gte('fecha', hace7dias.toISOString());
    } else if (filtro === '30dias') {
      const hace30dias = new Date();
      hace30dias.setDate(hace30dias.getDate() - 30);
      query = query.gte('fecha', hace30dias.toISOString());
    } else if (filtro === 'fechaEspecifica' && fechaEsp) {
      const desde = `${fechaEsp}T00:00:00`;
      const hasta = `${fechaEsp}T23:59:59`;
      query = query.gte('fecha', desde).lte('fecha', hasta);
    } else if (filtro === 'rangoFechas' && fechaDesde && fechaHasta) {
      const desde = `${fechaDesde}T00:00:00`;
      const hasta = `${fechaHasta}T23:59:59`;
      query = query.gte('fecha', desde).lte('fecha', hasta);
    }

    // Filtro de Tipo
    if (tipoFiltro !== 'todos') {
      let tipoDb = tipoFiltro === 'ventas' ? 'venta' :
                   tipoFiltro === 'ventasEliminadas' ? 'ventaEliminada' : 'recambio';
      query = query.eq('tipo', tipoDb);
    }

    // Filtro de Método de Pago
    if (metodoPagoFiltro !== 'todos') {
      if (metodoPagoFiltro === 'mercado_pago') {
        query = query.or(`metodo_pago.ilike.%mercado%,metodo_pago.ilike.%modo%`);
      } else {
        query = query.ilike('metodo_pago', `%${metodoPagoFiltro}%`);
      }
    }

    // Filtro de Búsqueda
    if (busqueda.trim()) {
      const termino = busqueda.trim();
      query = query.or(`cliente_nombre.ilike.%${termino}%,cliente_email.ilike.%${termino}%,nombre_usuario.ilike.%${termino}%,realizado_por.ilike.%${termino}%,id_texto.ilike.%${termino}%`);
    }

    return query;
  }

  async aplicarFiltros() {
    this.paginaActual.set(1);
    await this.cargarDatos();
  }


async solicitarFacturacion(venta: any) {
    try {
      this.cargando.set(true);

      // 1. Obtener configuración FISCAL REAL
      const { data: config, error } = await this.supabase.getClient()
        .from('facturacion')
        .select('*')
        .single();

      if (error || !config) {
        this.mostrarToast('No se encontró configuración de facturación.', 'error');
        this.cargando.set(false);
        return;
      }

      if (!config.facturacion_habilitada) {
        this.mostrarToast('La facturación está deshabilitada.', 'warning');
        this.cargando.set(false);
        return;
      }

      const condicionEmisor = config.condicion_iva;

      // 2. Si es Monotributista o Exento, solo emite Factura C
      if (condicionEmisor === 'Monotributista' || condicionEmisor === 'Exento') {
        await this.ejecutarFacturacion(venta, 'C');
        this.cargando.set(false);
        return;
      }

      // 3. Si es Responsable Inscripto, siempre mostrar modal de selección
      if (condicionEmisor === 'Responsable Inscripto') {
        // Si no tiene cliente asociado
        if (!venta.cliente_id) {
          this.ventaParaFacturar.set({
            ...venta,
            cliente_info: {
              nombre: 'CONSUMIDOR FINAL',
              cuit: null,
              condicion_iva: 'Consumidor Final'
            }
          });
          this.mostrarModalSeleccionFactura.set(true);
          this.cargando.set(false);
          return;
        }

        // Obtener datos del cliente
        const { data: clienteData, error: errorCliente } = await this.supabase.getClient()
          .from('clientes')
          .select('cuit, condicion_iva, nombre')
          .eq('id', venta.cliente_id)
          .single();

        if (errorCliente || !clienteData) {
          this.mostrarToast('Error al obtener datos del cliente.', 'error');
          this.cargando.set(false);
          return;
        }

        // Siempre mostrar modal con información del cliente
        this.ventaParaFacturar.set({
          ...venta,
          cliente_info: clienteData
        });
        this.mostrarModalSeleccionFactura.set(true);
        this.cargando.set(false);
        return;
      }

      // Caso por defecto
      this.mostrarToast('Condición IVA del emisor no reconocida.', 'error');
      this.cargando.set(false);

    } catch (err: any) {
      console.error(err);
      this.mostrarToast("Error al verificar configuración: " + err.message, 'error');
      this.cargando.set(false);
    }
  }

  cerrarModalFacturacion() {
    this.mostrarModalSeleccionFactura.set(false);
    this.ventaParaFacturar.set(null);
  }

  async confirmarFacturacion(tipo: string) {
  const venta = this.ventaParaFacturar();
  if (!venta) return;

  const requiereLeyenda = tipo === 'A'; 
  
  this.cerrarModalFacturacion();
  await this.ejecutarFacturacion(venta, tipo, requiereLeyenda);
}

private async ejecutarFacturacion(venta: any, tipoFactura: string, requiereLeyenda: boolean = false) {
    try {
      this.cargando.set(true);

      // Validación específica para Factura A
      if (tipoFactura === 'A') {
        const clienteInfo = venta.cliente_info;
        const condicionCliente = clienteInfo?.condicion_iva;

        // Si es Responsable Inscripto, debe tener CUIT
        if (condicionCliente === 'Responsable Inscripto' && !clienteInfo?.cuit) {
          this.mostrarToast("El cliente Responsable Inscripto no tiene un CUIT cargado.", 'error');
          this.cargando.set(false);
          return;
        }

        // Si es Monotributista, activar leyenda especial
        if (condicionCliente === 'Monotributista' || condicionCliente === 'Monotributo') {
          requiereLeyenda = true;
        }
      }

      // Llamar al servicio de facturación
      await this.facturacionService.facturarVenta(venta.id, tipoFactura, requiereLeyenda);

      const mensajeExito = requiereLeyenda 
        ? `Factura ${tipoFactura} generada con éxito (con leyenda especial para monotributista)`
        : `Factura ${tipoFactura} generada con éxito`;
      
      this.mostrarToast(mensajeExito, 'success');
      await this.cargarDatos();

    } catch (err: any) {
      console.error(err);
      this.mostrarToast("Error al facturar: " + (err.message || err), 'error');
    } finally {
      this.cargando.set(false);
      this.cdr.markForCheck();
    }
  }

// Método auxiliar para obtener datos del cliente
private async obtenerDatosCliente(clienteId: string) {
  try {
    const { data, error } = await this.supabase.getClient()
      .from('clientes')
      .select('cuit, condicion_iva, nombre')
      .eq('id', clienteId)
      .single();

    if (error) throw error;
    return data;
  } catch (err) {
    console.error('Error al obtener datos del cliente:', err);
    return null;
  }
}

async filtrarFacturacion(tipo:'todas'| 'facturadas' | 'no_facturadas') {
  this.filtroFacturacion.set(tipo);
  this.paginaActual.set(1);
  await this.cargarDatos();
}

limpiarBusquedaProducto(): void {
  this.busquedaProducto.set('');
  this.cdr.markForCheck();
}

async verFactura(item: any) {
  try {
    // Mostramos el toast inmediatamente
    this.mostrarToast("Generando comprobante...", "success");
    this.cargando.set(true);
    
    // Ejecutamos la lógica del servicio
    await this.facturacionService.visualizarFactura(item.id);
    
  } catch (error) {
    this.mostrarToast("No se pudo generar la vista de la factura", "error");
  } finally {
    this.cargando.set(false);
    this.cdr.markForCheck();
  }
}


private async blobToPureBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64WithPrefix = reader.result as string;
      if (!base64WithPrefix.includes(',')) {
        reject(new Error("Formato de PDF inválido"));
        return;
      }
      const pureBase64 = base64WithPrefix.split(',')[1];
      resolve(pureBase64);
    };
    reader.onerror = () => reject(new Error("Error al leer el archivo PDF"));
    reader.readAsDataURL(blob);
  });
}


private async invocarEnvioComprobante(payload: any) {
  
  const { data, error } = await this.supabase.getClient().functions.invoke('enviar-comprobante', {
    body: payload
  });

  if (error) {
    console.error("Error Supabase Function:", error);
    throw error;
  }
  
  return data;
}

emailEsValido = computed(() => {
  const email = this.emailDestino();
  const regex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return regex.test(email);
});
}