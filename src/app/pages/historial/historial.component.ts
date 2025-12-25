import { CommonModule } from '@angular/common';
import { Component, OnInit, signal, computed, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../services/supabase.service';
import { RouterModule } from '@angular/router';
import { MonedaArsPipe } from '../../pipes/moneda-ars.pipe';
import { ThemeService } from '../../services/theme.service';
import { PermisoDirective } from '../../directives/permiso.directive';

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
  // ==================== CONSTANTES DE COLUMNAS ====================
private readonly COLUMNAS_VISTA = 'id, tipo, fecha, nombre_usuario, cliente_nombre, cliente_email, metodo_pago, descuento_aplicado, total_final, productos, recambio_realizado, realizado_por, venta_id_referencia, motivo, observaciones, productos_devueltos, productos_recambio, total_original, total_devuelto, total_recambio, diferencia_abonada, metodo_pago_diferencia, monto_descuento_recambio, eliminado_por, fecha_eliminacion, id_texto';
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
  toastColor = signal<string>('bg-green-600');
  
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
  mostrarToast(mensaje: string, color: string) {
    this.toastMensaje.set(mensaje);
    this.toastColor.set(color);
    this.toastVisible.set(true);
    setTimeout(() => {
      this.toastVisible.set(false);
      this.cdr.markForCheck();
    }, 2500);
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
    this.paginaActual.set(1);
    this.cargarDatos();
  }

  async filtrarMetodoPago(metodoPago: any) {
    this.metodoPagoFiltro.set(metodoPago);
    this.paginaActual.set(1);
    await this.cargarDatos();
  }

  trackByFn(index: number, item: ItemHistorial): string {
    return item.id;
  }

  trackByProductoId(index: number, item: any): string {
    return item.producto_id || item.id || index.toString();
  }

  // ==================== SCROLL INFINITO ====================
  async onScroll(event: any) {
    const element = event.target;
    const atBottom = element.scrollHeight - element.scrollTop <= element.clientHeight + 100;
    
    if (atBottom && !this.cargandoMas() && this.hayMasDatos()) {
      await this.cargarMasDatos();
    }
  }

  async cargarMasDatos() {
    if (this.cargandoMas() || !this.hayMasDatos()) return;
    
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
      this.mostrarToast('Error al cargar los datos', 'bg-red-600');
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
          this.configRecibo.set({
            nombre_negocio: 'PRISYS SOLUTIONS',
            direccion: '9 DE JULIO 1718',
            ciudad: 'Corrientes - Capital (3400)',
            telefono1: '(3735) 475716',
            telefono2: '(3735) 410299',
            whatsapp1: '3735 475716',
            whatsapp2: '3735 410299',
            email_empresa: null,
            logo_url: null,
            mensaje_agradecimiento: '¡Gracias por su compra!',
            mensaje_pie: 'DESARROLLADO POR PRISYS SOLUTIONS',
            email_desarrollador: 'prisys.solutions@gmail.com'
          });
        }
        return;
      }

      if (data) {
        this.configRecibo.set(data);
      }
    } catch (error) {
      console.error('Error al cargar configuración del recibo:', error);
      this.configRecibo.set({
        nombre_negocio: 'PRISYS SOLUTIONS',
        direccion: '9 DE JULIO 1718',
        ciudad: 'Corrientes - Capital (3400)',
        telefono1: '(3735) 475716',
        telefono2: '(3735) 410299',
        whatsapp1: '3735 475716',
        whatsapp2: '3735 410299',
        email_empresa: null,
        logo_url: null,
        mensaje_agradecimiento: '¡Gracias por su compra!',
        mensaje_pie: 'DESARROLLADO POR PRISYS SOLUTIONS',
        email_desarrollador: 'prisys.solutions@gmail.com'
      });
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
      this.mostrarToast('Por favor, introduce un código de descuento.', 'bg-orange-600');
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
        this.mostrarToast('❌ Los descuentos por cantidad (2x1, 3x2, etc.) no están disponibles para recambios. Solo se permiten descuentos por porcentaje.', 'bg-red-600');
        this.codigoDescuentoRecambio.set('');
        return;
      }

      if (!data.porcentaje || data.porcentaje <= 0) {
        this.mostrarToast('❌ El descuento no tiene un porcentaje válido.', 'bg-red-600');
        this.codigoDescuentoRecambio.set('');
        return;
      }

      this.descuentoRecambioAplicado.set(data.porcentaje);
      this.calcularTotalesRecambio();
      this.mostrarToast('✅ Descuento aplicado correctamente.', 'bg-green-600');
    } else {
      this.descuentoRecambioAplicado.set(0);
      this.codigoDescuentoRecambio.set('');
      this.calcularTotalesRecambio();
      this.mostrarToast('❌ Código de descuento inválido o inactivo.', 'bg-red-600');
    }
    this.cdr.markForCheck();
  }

  quitarDescuentoRecambio() {
    this.descuentoRecambioAplicado.set(0);
    this.codigoDescuentoRecambio.set('');
    this.calcularTotalesRecambio();
    this.mostrarToast('Descuento eliminado.', 'bg-red-600');
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
        this.mostrarToast('Debes seleccionar al menos un producto para devolver.', 'bg-red-600');
      } else if (this.productosRecambio().length === 0) {
        this.mostrarToast('Debes seleccionar al menos un producto para el recambio.', 'bg-red-600');
      } else if (!this.motivoRecambio().trim()) {
        this.mostrarToast('Debes especificar un motivo para el recambio.', 'bg-red-600');
      } else if (this.diferencia() > 0 && !this.metodoPagoSeleccionado()) {
        this.mostrarToast('Debes seleccionar un método de pago para la diferencia.', 'bg-red-600');
      }
      return;
    }
    
    if (this.diferencia() < 0) {
      this.mostrarToast(
        'El recambio no puede generar un saldo a favor del cliente. El total de los productos de recambio debe ser igual o mayor al total de los productos devueltos.', 
        'bg-orange-600'
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
            this.mostrarToast('❌ No se puede eliminar la venta porque tiene pagos asociados. Debe contactar con el soporte del sistema.', 'bg-red-600');
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
      
      this.mostrarToast(mensajeExito, 'bg-green-600');
      
    } catch (error: any) {
      console.error('Error al procesar recambio:', error);
      this.mostrarToast(`Error al procesar el recambio: ${error.message}`, 'bg-red-600');
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
    if (venta.recambio_realizado) {
      this.mostrarToast('No se puede eliminar una venta que ya tiene un recambio realizado.', 'bg-red-600');
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
    
    if (!this.motivoEliminacion().trim()) {
      this.mostrarToast('El motivo de eliminación es obligatorio.', 'bg-red-600');
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
            this.mostrarToast('❌ No se puede eliminar la venta porque tiene pagos asociados. Debe contactar con el soporte del sistema.', 'bg-red-600');
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
        ? '✅ Venta eliminada exitosamente. El stock y el saldo del cliente han sido restaurados.'
        : '✅ Venta eliminada exitosamente. El stock ha sido restaurado.';
      
      this.mostrarToast(mensajeExito, 'bg-green-600');
      
    } catch (error: any) {
      console.error('Error al eliminar venta:', error);
      this.mostrarToast(`❌ Error al eliminar la venta: ${error.message}`, 'bg-red-600');
    } finally {
      this.eliminandoVenta.set(false);
      this.cdr.markForCheck();
    }
  }

  // ==================== MÉTODOS DE RECIBO Y EMAIL ====================
  abrirModalRecibo(venta: any) {
    this.ventaParaRecibo.set(venta);
    this.mostrarModalRecibo.set(true);
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

  async generarReciboPDF(venta: any, descargar: boolean = true): Promise<Blob | undefined> {
    this.generandoRecibo.set(true);
    
    try {
      // ✅ DYNAMIC IMPORT - Solo carga jsPDF cuando se necesita
      const { default: jsPDF } = await import('jspdf');
      
      const alturaBase = 150;
      const alturaPorProducto = 15;
      const cantidadProductos = venta.productos.length;
      const alturaEstimada = alturaBase + (cantidadProductos * alturaPorProducto);

      const doc = new jsPDF({
        unit: 'mm',
        format: [80, Math.max(alturaEstimada, 170)]
      });
      
      const config = this.configRecibo();
      const margen = 5;
      const anchoUtil = 70;
      let y = 8;
      
      if (config?.logo_url) {
        try {
          const logoWidth = 35;
          const logoHeight = 18;
          const logoX = (80 - logoWidth) / 2;
          doc.addImage(config.logo_url, 'JPG', logoX, y, logoWidth, logoHeight);
          y += logoHeight + 5;
        } catch (error) {
          y += 2;
        }
      } else {
        y += 2;
      }

      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text(config?.nombre_negocio || 'PRISYS SOLUTIONS', 40, y, { align: 'center' });
      y += 6;
      
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text(config?.direccion || '9 DE JULIO 1718', 40, y, { align: 'center' });
      y += 3.5;
      doc.text(config?.ciudad || 'Corrientes - Capital (3400)', 40, y, { align: 'center' });
      y += 3.5;
      
      const tel1 = config?.telefono1 || '(3735) 475716';
      const tel2 = config?.telefono2 || '(3735) 410299';
      doc.text(`Cel: ${tel1} - ${tel2}`, 40, y, { align: 'center' });
      y += 3.5;
      
      const wsp1 = config?.whatsapp1 || '3735 475716';
      const wsp2 = config?.whatsapp2 || '3735 410299';
      doc.text(`WhatsApp: ${wsp1} - ${wsp2}`, 40, y, { align: 'center' });
      y += 3.5;
      
      if (config?.email_empresa) {
        doc.text(config.email_empresa, 40, y, { align: 'center' });
        y += 3.5;
      }
      
      y += 2.5;
      
      doc.setLineWidth(0.3);
      doc.line(margen, y, margen + anchoUtil, y);
      y += 1;
      doc.line(margen, y, margen + anchoUtil, y);
      y += 5;
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('COMPROBANTE DE VENTA', 40, y, { align: 'center' });
      y += 4;
      
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.text('NO VÁLIDO COMO FACTURA', 40, y, { align: 'center' });
      y += 6;
      
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.text(`Cod venta: ${venta.id.slice(-8)}`, margen, y);
      y += 4;
      
      const fechaVenta = new Date(venta.fecha_venta);
      const dia = String(fechaVenta.getDate()).padStart(2, '0');
      const mes = String(fechaVenta.getMonth() + 1).padStart(2, '0');
      const anio = fechaVenta.getFullYear();
      const hora = String(fechaVenta.getHours()).padStart(2, '0');
      const minutos = String(fechaVenta.getMinutes()).padStart(2, '0');
      const fechaFormateada = `${dia}/${mes}/${anio} ${hora}:${minutos}`;

      doc.text(`Fecha: ${fechaFormateada}`, margen, y);
      y += 6;
      
      if (venta.cliente_nombre) {
        doc.text(`Cliente: ${venta.cliente_nombre.toUpperCase()}`, margen, y);
        y += 6;
      }
      
      doc.text(`Vendedor/Cajero: ${venta.nombre_usuario}`, margen, y);
      y += 6;
      
      doc.setLineWidth(0.2);
      doc.line(margen, y, margen + anchoUtil, y);
      y += 5;
      
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.text('CANT', margen, y);
      doc.text('DESCRIPCIÓN', margen + 10, y);
      doc.text('IMPORTE', margen + anchoUtil - 5, y, { align: 'right' });
      y += 1;
      doc.line(margen, y, margen + anchoUtil, y);
      y += 4;
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      
      for (const producto of venta.productos) {
        doc.text(`${producto.cantidad}`, margen + 2, y);
        
        const descripcion = `${producto.nombre}${producto.marca ? ' - ' + producto.marca : ''}`;
        const descripcionLineas = doc.splitTextToSize(descripcion, 40);
        doc.text(descripcionLineas, margen + 10, y);
        
        doc.text(`${producto.subtotal.toFixed(2)}`, margen + anchoUtil - 5, y, { align: 'right' });
        
        y += descripcionLineas.length * 4;
        
        doc.setFontSize(7);
        doc.text(`  ${producto.precio_unitario.toFixed(2)} c/u`, margen + 10, y);
        if (producto.talle) {
          doc.text(`- Talle: ${producto.talle}`, margen + 30, y);
        }
        doc.setFontSize(8);
        y += 4;
      }
      
      y += 2;
      
      doc.line(margen, y, margen + anchoUtil, y);
      y += 5;
      
      doc.setFontSize(9);
      
      const subtotal = venta.productos.reduce((sum: number, p: any) => sum + p.subtotal, 0);
      
      doc.text('SUBTOTAL $:', margen, y);
      doc.text(`${subtotal.toFixed(2)}`, margen + anchoUtil - 5, y, { align: 'right' });
      y += 5;
      
      if (venta.descuento_aplicado > 0) {
        const montoDescuento = subtotal * venta.descuento_aplicado / 100;
        doc.text(`Desc. ${venta.descuento_aplicado}% $:`, margen, y);
        doc.text(`-${montoDescuento.toFixed(2)}`, margen + anchoUtil - 5, y, { align: 'right' });
        y += 5;
      }
      
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text('TOTAL $:', margen, y);
      doc.text(`${venta.total_final.toFixed(2)}`, margen + anchoUtil - 5, y, { align: 'right' });
      y += 6;
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      const metodoPagoNormalizado = this.normalizarMetodoPagoParaMostrar(venta.metodo_pago || '');
      
      const metodoPagoLineas = doc.splitTextToSize(`Forma de pago: ${metodoPagoNormalizado.toUpperCase()}`, anchoUtil);
      metodoPagoLineas.forEach((linea: string) => {
        doc.text(linea, margen, y);
        y += 4;
      });
      y += 4;
      
      doc.setLineWidth(0.3);
      doc.line(margen, y, margen + anchoUtil, y);
      y += 1;
      doc.line(margen, y, margen + anchoUtil, y);
      y += 6;
      
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      const mensajeGracias = config?.mensaje_agradecimiento || '¡Gracias por su compra!';
      doc.text(mensajeGracias, 40, y, { align: 'center' });
      y += 6;

      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      const mensajePie = config?.mensaje_pie || 'DESARROLLADO POR PRISYS SOLUTIONS';
      doc.text(mensajePie, 40, y, { align: 'center' });
      y += 3.5;
      const emailDev = config?.email_desarrollador || 'prisys.solutions@gmail.com';
      doc.text(emailDev, 40, y, { align: 'center' });
      y += 5;
      
      if (descargar) {
        doc.save(`recibo-${venta.id.slice(-8)}.pdf`);
        this.mostrarToast('✅ Recibo descargado correctamente', 'bg-green-600');
        return undefined;
      } else {
        return doc.output('blob');
      }
      
    } catch (error: any) {
      console.error('Error al generar recibo:', error);
      this.mostrarToast('❌ Error al generar el recibo', 'bg-red-600');
      return undefined;
    } finally {
      this.generandoRecibo.set(false);
      this.cdr.markForCheck();
    }
  }

  imprimirRecibo(venta: any) {
    this.generarReciboPDF(venta, true);
  }

  async visualizarRecibo(venta: ItemHistorial) {
    this.generandoRecibo.set(true);
    
    try {
      // ✅ DYNAMIC IMPORT
      const { default: jsPDF } = await import('jspdf');
      
      // ... mismo código que generarReciboPDF pero al final:
      const pdfBlob = await this.generarReciboPDF(venta, false);
      if (pdfBlob) {
        const pdfUrl = URL.createObjectURL(pdfBlob);
        window.open(pdfUrl, '_blank');
        this.mostrarToast('✅ Recibo abierto en nueva pestaña', 'bg-green-600');
      }
      this.cerrarModalRecibo();
    } catch (error) {
      console.error('Error al visualizar recibo:', error);
      this.mostrarToast('❌ Error al visualizar el recibo', 'bg-red-600');
    } finally {
      this.generandoRecibo.set(false);
      this.cdr.markForCheck();
    }
  }

  async enviarDetalleEmail() {
    const email = this.emailDestino();
    
    if (!email.trim()) {
      this.mostrarToast('❌ Debes ingresar un email válido', 'bg-red-600');
      return;
    }
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      this.mostrarToast('❌ Formato de email inválido', 'bg-red-600');
      return;
    }
    
    this.enviandoEmail.set(true);
    
    try {
      const venta = this.ventaParaEmail();
      const pdfBlob = await this.generarReciboPDF(venta, false);
      if (!pdfBlob) throw new Error('No se pudo generar PDF');
      
      const base64data = await this.blobToBase64(pdfBlob as Blob);
      const base64Content = base64data.split(',')[1];
      
      const detalleVenta = {
        id: venta.id.slice(-8),
        fecha: new Date(venta.fecha_venta).toLocaleString('es-AR'),
        cliente: venta.cliente_nombre || 'Cliente',
        productos: venta.productos,
        total: venta.total_final,
        metodo_pago: venta.metodo_pago,
        descuento: venta.descuento_aplicado || 0
      };
      
      const { error } = await this.supabase.getClient().functions.invoke('enviar-detalle-venta', {
        body: {
          email: email,
          detalle: detalleVenta,
          pdfBase64: base64Content
        }
      });
      
      if (error) throw error;
      
      this.mostrarToast('✅ Email enviado correctamente', 'bg-green-600');
      this.cerrarModalEmail();
      
    } catch (error: any) {
      console.error('Error enviando email:', error);
      this.mostrarToast('❌ Error al enviar email', 'bg-red-600');
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
}