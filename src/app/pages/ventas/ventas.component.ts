import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy, signal, computed, ChangeDetectionStrategy, ChangeDetectorRef,inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../services/supabase.service';
import { Producto } from '../../models/producto.model';
import { RouterModule } from '@angular/router';
import { MonedaArsPipe } from '../../pipes/moneda-ars.pipe';
import { ThemeService } from '../../services/theme.service';
import { ClientesService, Cliente } from '../../services/clientes.service';
import { Subject, Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { PermisoDirective } from '../../directives/permiso.directive';
import { FacturacionService } from '../../services/facturacion.service';
FacturacionService
type VendedorTemp = {
  id: string;
  rol: string;
  nombre: string;
  dni: string;
};

// Interfaces para Quagga (sin cambios)
interface QuaggaInputStreamConstraints {
  width?: { min?: number; ideal?: number; max?: number };
  height?: { min?: number; ideal?: number; max?: number };
  facingMode?: string | { ideal: string };
  aspectRatio?: { min: number; max: number };
}

interface QuaggaConfig {
  inputStream: {
    name: string;
    type: string;
    target: Element | null;
    constraints?: QuaggaInputStreamConstraints;
  };
  locator?: {
    patchSize: string;
    halfSample: boolean;
  };
  numOfWorkers?: number;
  frequency?: number;
  decoder: {
    readers: string[];
    debug?: {
      drawBoundingBox: boolean;
      showFrequency: boolean;
      drawScanline: boolean;
      showPattern: boolean;
    };
  };
  locate?: boolean;
}

interface QuaggaDetectionResult {
  codeResult: {
    code: string;
  };
  boxes?: Array<{ x: number; y: number }[]>;
  box?: { x: number; y: number }[];
  line?: { x: number; y: number }[];
}

interface QuaggaCanvas {
  ctx: {
    overlay: CanvasRenderingContext2D;
  };
  dom: {
    overlay: HTMLCanvasElement;
  };
}

interface QuaggaAPI {
  init(config: QuaggaConfig, callback: (error: Error | null) => void): void;
  start(): void;
  stop(): void;
  onDetected(callback: (data: QuaggaDetectionResult) => void): void;
  onProcessed(callback: (result: QuaggaDetectionResult | null) => void): void;
  canvas: QuaggaCanvas;
  ImageDebug: {
    drawPath(
      path: { x: number; y: number }[] | { x: number; y: number }[],
      def: { x: string | number; y: string | number },
      ctx: CanvasRenderingContext2D,
      style: { color: string; lineWidth: number }
    ): void;
  };
}

declare global {
  interface Window {
    Quagga?: QuaggaAPI;
  }
}

@Component({
  selector: 'app-ventas',
  imports: [FormsModule, CommonModule, RouterModule, MonedaArsPipe,PermisoDirective],
  templateUrl: './ventas.component.html',
  styleUrl: './ventas.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush // ✅ CAMBIO 1: OnPush Strategy
})
export class VentasComponent implements OnInit, OnDestroy {
private facturacionService = inject(FacturacionService);
clienteParaFacturaA = signal<Cliente | null>(null);
mostrarSelectorClienteFacturaA = signal<boolean>(false);
  // ✅ CAMBIO 2: Constante para columnas específicas de Supabase
  private readonly COLUMNAS_PRODUCTOS = 'id, codigo, nombre, marca, categoria, talle, precio, cantidad_stock, cantidad_deposito, activo';
private readonly COLUMNAS_CLIENTES = 'id, nombre, dni, email, limite_credito, saldo_actual, activo, cuit, condicion_iva';  
  // ✅ CAMBIO 3: Migración a Signals
  productos = signal<Producto[]>([]);
  carrito = signal<{ producto: Producto; cantidad: number; subtotal: number }[]>([]);
  cantidades = signal<{ [id: string]: number }>({});
  
  // Estados de carga
  cargando = signal<boolean>(false);
  buscandoProductos = signal<boolean>(false);
  cargandoMas = signal<boolean>(false);
  procesandoVenta = signal<boolean>(false);
  
  // Estados del buscador
  private searchSubject = new Subject<string>();
  private searchSubscription: Subscription | null = null;
  private _filtroGeneral = signal<string>('');
  
  get filtroGeneral(): string {
    return this._filtroGeneral();
  }
  set filtroGeneral(value: string) {
    this._filtroGeneral.set(value);
    this.searchSubject.next(value);
  }

  // Búsqueda de clientes
  private searchClienteSubject = new Subject<string>();
  private searchClienteSubscription: Subscription | null = null;

  // Estados de ordenamiento
  ordenPrecio = signal<'asc' | 'desc' | 'none'>('none');
  ordenStock = signal<'asc' | 'desc' | 'none'>('none');

  // Pagos
  metodoPago = signal<string>('');
  codigoDescuento = signal<string>('');
  descuentoAplicado = signal<number>(0);
  totalFinal = signal<number>(0);

  // Pago dividido
  metodoPago1 = signal<string>('');
  montoPago1 = signal<number>(0);
  metodoPago2 = signal<string>('');
  montoPago2 = signal<number>(0);
  efectivoEntregadoPago1 = signal<number>(0);
  efectivoEntregadoPago2 = signal<number>(0);
  vueltoPago1 = signal<number>(0);
  vueltoPago2 = signal<number>(0);
  pagoDividido = signal<boolean>(false);
  
  cajaAbierta = signal<boolean>(false);

  // Vuelto simple
  montoEntregado = signal<number>(0);
  vuelto = signal<number>(0);

  clienteNombre = signal<string>('');
  clienteEmail = signal<string>('');

  // Ventas a crédito
  esVentaCredito = signal<boolean>(false);
  clientes = signal<Cliente[]>([]);
  clienteSeleccionado = signal<Cliente | null>(null);
  
  private _busquedaCliente = signal<string>('');
  get busquedaCliente(): string {
    return this._busquedaCliente();
  }
  set busquedaCliente(val: string) {
    this._busquedaCliente.set(val);
    this.searchClienteSubject.next(val);
  }

  mostrarListaClientes = signal<boolean>(false);
  fechaVencimiento = signal<string>('');
  observacionesCredito = signal<string>('');

  // Toast
  toastVisible = signal<boolean>(false);
toastMensaje = signal<string>('');
tipoMensajeToast = signal<'success' | 'error' | 'warning'>('success');

  // Scanner
  mostrarScanner = signal<boolean>(false);
  scannerActivo = signal<boolean>(false);
  soportaEscaner = signal<boolean>(false);
  escaneando = signal<boolean>(false);
  intentosScanner = signal<number>(0);
  errorScanner = signal<string>('');
mediaStream: MediaStream | null = null;

  Math = Math;

  private cacheEstadoCaja: { abierta: boolean; timestamp: number } | null = null;
  private readonly CACHE_CAJA_DURACION = 10000;

  mapaDescuentos = signal<Map<string, number>>(new Map());

  metodoPagoLabels: { [key: string]: string } = {
    'efectivo': 'Efectivo',
    'transferencia': 'Transferencia',
    'debito': 'Débito',
    'credito': 'Crédito',
    'mercado_pago': 'Mercado Pago',
    'fiado': 'Fiado'
  };

  // ✅ CAMBIO 4: Paginación para scroll infinito
  paginaActual = signal<number>(0);
  itemsPorPagina = 20;
  hayMasProductos = signal<boolean>(true);

// ==================== SIGNALS DE RECIBO POST-VENTA ====================
mostrarModalReciboPostVenta = signal<boolean>(false);
ventaRecienCreada = signal<any>(null);
generandoReciboPostVenta = signal<boolean>(false);
configRecibo = signal<any>(null);
  constructor(
    private supabase: SupabaseService, 
    public themeService: ThemeService,
    private clientesService: ClientesService, 
    private cdr: ChangeDetectorRef
  ) {}

  async ngOnInit() {
    this.cargando.set(true);
    await this.facturacionService.obtenerDatosFacturacionCompleta();
    await this.cargarConfigRecibo();
    // Configurar Debounce para Productos
    this.searchSubscription = this.searchSubject.pipe(
      debounceTime(400),
      distinctUntilChanged()
    ).subscribe(texto => {
      this.realizarBusquedaProductos(texto, true);
    });

    // Configurar Debounce para Clientes
    this.searchClienteSubscription = this.searchClienteSubject.pipe(
      debounceTime(400),
      distinctUntilChanged()
    ).subscribe(texto => {
      this.realizarBusquedaClientes(texto);
    });

    try {
      await Promise.all([
        this.verificarCajaAbierta(),
        this.cargarPromocionesActivas(),
      ]);
      
      await this.realizarBusquedaProductos('', true);
      
      this.verificarSoporteEscaner();
      this.cargarQuagga();
    } catch (error) {
      console.error('Error en inicialización:', error);
    } finally {
      this.cargando.set(false);
    }
    
  }

  ngOnDestroy(): void {
    this.detenerScanner();
    if (this.searchSubscription) this.searchSubscription.unsubscribe();
    if (this.searchClienteSubscription) this.searchClienteSubscription.unsubscribe();
  }

  async cargarPromocionesActivas() {
    const hoy = new Date().toISOString();
    try {
      const { data: promociones } = await this.supabase.getClient()
        .from('promociones')
        .select(`id, porcentaje, promocion_productos ( producto_id )`)
        .eq('activa', true)
        .lte('fecha_inicio', hoy)
        .gte('fecha_fin', hoy);

      if (promociones) {
        const nuevoMapa = new Map<string, number>();
        promociones.forEach((promo: any) => {
          if (promo.promocion_productos) {
            promo.promocion_productos.forEach((rel: any) => {
              const existente = nuevoMapa.get(rel.producto_id) || 0;
              if (promo.porcentaje > existente) {
                nuevoMapa.set(rel.producto_id, promo.porcentaje);
              }
            });
          }
        });
        this.mapaDescuentos.set(nuevoMapa);
      }
    } catch (e) {
      console.error("Error cargando promociones", e);
    }
  }

  // ✅ CAMBIO 5: Búsqueda optimizada con columnas específicas
  async realizarBusquedaProductos(termino: string, reiniciar: boolean = true) {
    if (reiniciar) {
      this.buscandoProductos.set(true);
      this.paginaActual.set(0);
      this.hayMasProductos.set(true);
    } else {
      this.cargandoMas.set(true);
    }

    try {
      let query = this.supabase.getClient()
        .from('productos')
        .select(this.COLUMNAS_PRODUCTOS) // ✅ Columnas específicas
        .eq('activo', true)
        .eq('eliminado', false)
        .gt('cantidad_stock', 0);

      if (termino && termino.trim()) {
        const t = termino.trim();
        query = query.or(`codigo.ilike.%${t}%,nombre.ilike.%${t}%,marca.ilike.%${t}%,categoria.ilike.%${t}%`);
      }

      // Ordenamiento
      const ordenPrecioVal = this.ordenPrecio();
      const ordenStockVal = this.ordenStock();
      
      if (ordenPrecioVal === 'asc') query = query.order('precio', { ascending: true });
      else if (ordenPrecioVal === 'desc') query = query.order('precio', { ascending: false });
      else if (ordenStockVal === 'asc') query = query.order('cantidad_stock', { ascending: true });
      else if (ordenStockVal === 'desc') query = query.order('cantidad_stock', { ascending: false });
      else query = query.order('nombre', { ascending: true });
      
      // ✅ CAMBIO 6: Paginación con .range()
      const desde = this.paginaActual() * this.itemsPorPagina;
      const hasta = desde + this.itemsPorPagina - 1;
      
      const { data, error } = await query.range(desde, hasta);

      if (error) throw error;

      if (data) {
        const mapaDesc = this.mapaDescuentos();
        const productosProcesados = data.map((p: any) => {
          const descuento = mapaDesc.get(p.id);
          if (descuento) {
            return {
              ...p,
              tiene_promocion: true,
              precio_promocional: p.precio - (p.precio * (descuento / 100)),
              porcentaje_promocion: descuento
            };
          }
          return p;
        });

        if (reiniciar) {
          this.productos.set(productosProcesados);
        } else {
          // ✅ Acumular datos en scroll infinito
          this.productos.update(prev => [...prev, ...productosProcesados]);
        }

        if (data.length < this.itemsPorPagina) {
          this.hayMasProductos.set(false);
        }
      }
    } catch (error) {
      console.error('Error buscando productos:', error);
    } finally {
      this.buscandoProductos.set(false);
      this.cargandoMas.set(false);
    }
  }

  // Método para scroll infinito
  onScrollProductos(event: any) {
    if (this.cargandoMas() || this.buscandoProductos() || !this.hayMasProductos()) return;

    const elemento = event.target;
    if (elemento.scrollHeight - elemento.scrollTop <= elemento.clientHeight + 50) {
      this.paginaActual.update(p => p + 1);
      this.realizarBusquedaProductos(this._filtroGeneral(), false);
    }
  }

 async buscarProductoExacto(codigo: string) {
  try {
    const { data, error } = await this.supabase.getClient()
      .from('productos')
      .select(this.COLUMNAS_PRODUCTOS)
      .eq('codigo', codigo)
      .eq('activo', true)
      .eq('eliminado', false)
      .single();

    if (data) {
      const mapaDesc = this.mapaDescuentos();
      const descuento = mapaDesc.get(data.id);
      const prodProcesado = descuento ? {
        ...data,
        tiene_promocion: true,
        precio_promocional: data.precio - (data.precio * (descuento / 100)),
        porcentaje_promocion: descuento
      } : data;

      this.cantidades.update(c => ({ ...c, [prodProcesado.id]: 1 }));
      this.agregarAlCarrito(prodProcesado);
      this.mostrarToast(`Producto agregado: ${prodProcesado.nombre}`, 'success');
      
      // ✅ CORRECCIÓN: Usar el setter (this.filtroGeneral) en lugar de la señal privada.
      // Esto empuja '' al Subject, cancelando la búsqueda del debounce anterior.
      this.filtroGeneral = ''; 
      
      this.paginaActual.set(0);
      this.hayMasProductos.set(true);
      
      await this.realizarBusquedaProductos('', true);
      
      this.cdr.markForCheck();
    } else {
      this.mostrarToast('Producto no encontrado', 'error');
      // ✅ CORRECCIÓN
      this.filtroGeneral = '';
      this.paginaActual.set(0);
      this.hayMasProductos.set(true);
      await this.realizarBusquedaProductos('', true);
      this.cdr.markForCheck();
    }
  } catch (err) {
    console.error('Error buscando exacto', err);
    // ✅ CORRECCIÓN
    this.filtroGeneral = '';
    this.paginaActual.set(0);
    this.hayMasProductos.set(true);
    await this.realizarBusquedaProductos('', true);
    this.cdr.markForCheck();
  }
}

  async realizarBusquedaClientes(termino: string) {
    if (!termino.trim()) {
      this.clientes.set([]);
      return;
    }

    try {
      const { data, error } = await this.supabase.getClient()
        .from('clientes')
        .select(this.COLUMNAS_CLIENTES)
        .eq('activo', true)
        .or(`nombre.ilike.%${termino}%,dni.ilike.%${termino}%,email.ilike.%${termino}%`)
        .limit(10);

      if (!error && data) {
        this.clientes.set(data);
      }
    } catch (error) {
      console.error('Error buscando clientes:', error);
    }
  }

  seleccionarCliente(cliente: Cliente) {
    this.clienteSeleccionado.set(cliente);
    this.clienteNombre.set(cliente.nombre);
    this.clienteEmail.set(cliente.email || '');
    this._busquedaCliente.set('');
    this.mostrarListaClientes.set(false);
  }

  limpiarCliente() {
    this.clienteSeleccionado.set(null);
    this._busquedaCliente.set('');
    this.clientes.set([]);
  }

  // ============================================
  // MÉTODOS DEL SCANNER (sin cambios sustanciales, solo lectura de signals)
  // ============================================

  verificarSoporteEscaner() {
    this.soportaEscaner.set('mediaDevices' in navigator && 'getUserMedia' in navigator.mediaDevices);
  }

  cargarQuagga(): void {
    if (typeof window.Quagga === 'undefined') {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/quagga/0.12.1/quagga.min.js';
      script.async = true;
      script.onerror = () => {
        console.error('Error al cargar Quagga');
        this.errorScanner.set('No se pudo cargar el scanner.');
      };
      document.body.appendChild(script);
    }
  }

  abrirScanner(): void {
    this.mostrarScanner.set(true);
    this.intentosScanner.set(0);
    this.errorScanner.set('');
    this.escaneando.set(true);
    
    setTimeout(() => {
      this.iniciarScanner();
    }, 500);
  }

  async iniciarScanner(): Promise<void> {
    if (typeof window.Quagga === 'undefined') {
      this.errorScanner.set('Scanner no disponible. Recargando...');
      return;
    }

    const container = document.querySelector('#scanner-container');
    if (!container) {
      console.error('Contenedor del scanner no encontrado');
      if (this.intentosScanner() < 3) {
        this.intentosScanner.update(i => i + 1);
        setTimeout(() => {
          this.iniciarScanner();
        }, 300);
      } else {
        this.errorScanner.set('Error al inicializar el scanner.');
        this.cerrarScanner();
      }
      return;
    }

    try {
  this.mediaStream = await navigator.mediaDevices.getUserMedia({ 
    video: { facingMode: { ideal: "environment" } } 
  });
  this.inicializarQuagga();
} catch (err) {
  console.error('Error cámara:', err);
  this.errorScanner.set('Error al acceder a la cámara.');
  this.liberarCamara();
  this.cerrarScanner();
}
  }

  inicializarQuagga(): void {
    const Quagga = window.Quagga;
    if (!Quagga) return;

    const config: QuaggaConfig = {
      inputStream: {
        name: "Live",
        type: "LiveStream",
        target: document.querySelector('#scanner-container'),
        constraints: {
          width: { min: 640, ideal: 1280, max: 1920 },
          height: { min: 480, ideal: 720, max: 1080 },
          facingMode: "environment",
          aspectRatio: { min: 1, max: 2 }
        },
      },
      locator: { patchSize: "medium", halfSample: true },
      numOfWorkers: 2,
      frequency: 5,
      decoder: {
        readers: ["ean_reader", "code_128_reader", "code_39_reader"],
        debug: { drawBoundingBox: true, showFrequency: false, drawScanline: true, showPattern: false }
      },
      locate: true
    };

    Quagga.init(config, (err: Error | null) => {
  if (err) {
    this.errorScanner.set('Error al iniciar el scanner');
    this.liberarCamara(); 
    this.cerrarScanner();
    return;
  }
  Quagga.start();
  this.scannerActivo.set(true);
});

    let lastCode = '';
    let lastTime = 0;

    Quagga.onDetected((data: QuaggaDetectionResult) => {
      const now = Date.now();
      const codigo = data.codeResult.code;
      
      if (codigo === lastCode && (now - lastTime) < 2000) return;
      
      lastCode = codigo;
      lastTime = now;

      if (navigator.vibrate) navigator.vibrate(200);
      
      this.cerrarScanner();
      this.buscarProductoExacto(codigo);
    });
  }

  detenerScanner(): void {
  if (this.scannerActivo() && typeof window.Quagga !== 'undefined') {
    try { 
      window.Quagga!.stop(); 
    } catch (err) { 
      console.error(err); 
    }
    this.scannerActivo.set(false);
  }
    this.liberarCamara();
  
  const container = document.querySelector('#scanner-container');
  if (container) container.innerHTML = '';
}

liberarCamara(): void {
  if (this.mediaStream) {
    this.mediaStream.getTracks().forEach(track => {
      track.stop();
      console.log('Track de cámara detenido:', track.label);
    });
    this.mediaStream = null;
  }
}

  cerrarScanner(): void {
    this.detenerScanner();
    this.mostrarScanner.set(false);
    this.escaneando.set(false);
    this.intentosScanner.set(0);
    this.errorScanner.set('');
  }

  // ============================================
  // MÉTODOS GENERALES (Carrito, Pagos)
  // ============================================

  onTipoPagoChange() {
  if (this.esVentaCredito()) {
    // Si es crédito, se aplica 'fiado'
    this.facturacionService.aplicarReglaPorMetodo('fiado');
    
    this.mostrarListaClientes.set(true);
    this.clientes.set([]);
    this.clienteParaFacturaA.set(null); // Limpiar cliente para factura A
  } else {
    // Si vuelve a venta normal, reseteamos
    this.metodoPago.set('');
    this.facturacionService.actualizarEstadoGlobal(false);
    
    this.mostrarListaClientes.set(false);
    this.limpiarCliente();
  }
  
  this.montoEntregado.set(0);
  this.vuelto.set(0);
}

  getCreditoDisponible(): number {
    const cliente = this.clienteSeleccionado();
    if (!cliente) return 0;
    return Math.max(0, cliente.limite_credito - cliente.saldo_actual);
  }

  creditoSuficiente(): boolean {
    const cliente = this.clienteSeleccionado();
    if (!cliente || !this.esVentaCredito()) return true;
    return this.getCreditoDisponible() >= this.totalFinal();
  }

  toggleOrdenPrecio() {
    this.ordenStock.set('none');
    const actual = this.ordenPrecio();
    this.ordenPrecio.set(actual === 'none' ? 'desc' : (actual === 'desc' ? 'asc' : 'none'));
    this.realizarBusquedaProductos(this._filtroGeneral(), true);
  }

  toggleOrdenStock() {
    this.ordenPrecio.set('none');
    const actual = this.ordenStock();
    this.ordenStock.set(actual === 'none' ? 'desc' : (actual === 'desc' ? 'asc' : 'none'));
    this.realizarBusquedaProductos(this._filtroGeneral(), true);
  }

  limpiarFiltros() {
    this.ordenPrecio.set('none');
    this.ordenStock.set('none');
    this._filtroGeneral.set(''); 
    this.realizarBusquedaProductos('', true);
  }

  quitarUnidad(producto: Producto) {
    const carritoActual = this.carrito();
    const item = carritoActual.find(i => i.producto.id === producto.id);
    if (!item) return;

    const precioFinal = producto.tiene_promocion ? (producto.precio_promocional || producto.precio) : producto.precio;

    item.cantidad -= 1;
    item.subtotal = item.cantidad * precioFinal;

    if (item.cantidad <= 0) {
      this.eliminarDelCarrito(producto);
    } else {
      this.carrito.set([...carritoActual]);
    }
    this.actualizarTotal();
  }

  eliminarDelCarrito(producto: Producto) {
    this.carrito.update(c => c.filter(i => i.producto.id !== producto.id));
    this.actualizarTotal();
  }

  aumentarCantidad(prod: Producto) {
    const cantActuales = this.cantidades();
    const actual = cantActuales[prod.id] || 0;
    const enCarrito = this.carrito().find(i => i.producto.id === prod.id)?.cantidad || 0;
    const disponible = prod.cantidad_stock - enCarrito;

    if (actual < disponible) {
      this.cantidades.update(c => ({ ...c, [prod.id]: actual + 1 }));
    }
  }

  disminuirCantidad(prod: Producto) {
    const cantActuales = this.cantidades();
    const actual = cantActuales[prod.id] || 0;
    if (actual > 0) {
      this.cantidades.update(c => ({ ...c, [prod.id]: actual - 1 }));
    }
  }

  agregarAlCarrito(prod: Producto) {
    const cantActuales = this.cantidades();
    const cantidad = cantActuales[prod.id];
    if (!cantidad || cantidad < 1) return;

    const precioFinal = prod.tiene_promocion ? (prod.precio_promocional || prod.precio) : prod.precio;
    const carritoActual = this.carrito();
    const existe = carritoActual.find(item => item.producto.id === prod.id);
    
    if (existe) {
      existe.cantidad += cantidad;
      existe.subtotal = existe.cantidad * precioFinal;
      this.carrito.set([...carritoActual]);
    } else {
      this.carrito.update(c => [...c, { producto: prod, cantidad, subtotal: cantidad * precioFinal }]);
    }

    this.cantidades.update(c => ({ ...c, [prod.id]: 0 }));
    this.actualizarTotal();
  }

  actualizarTotal() {
    const carritoActual = this.carrito();
    const totalSinDescuento = carritoActual.reduce((acc, item) => acc + item.subtotal, 0);
    const descuento = this.descuentoAplicado();
    this.totalFinal.set(totalSinDescuento * (1 - descuento / 100));
    this.calcularVuelto();
  }

  calcularVuelto() {
    if (!this.pagoDividido()) {
      if (this.metodoPago() === 'efectivo' && this.montoEntregado() > 0) {
        this.vuelto.set(Math.max(0, this.montoEntregado() - this.totalFinal()));
      } else {
        this.vuelto.set(0);
      }
    } else {
      this.vueltoPago1.set(0);
      this.vueltoPago2.set(0);

      if (this.metodoPago1() === 'efectivo' && this.efectivoEntregadoPago1() > 0) {
        this.vueltoPago1.set(Math.max(0, this.efectivoEntregadoPago1() - this.montoPago1()));
      }

      if (this.metodoPago2() === 'efectivo' && this.efectivoEntregadoPago2() > 0) {
        this.vueltoPago2.set(Math.max(0, this.efectivoEntregadoPago2() - this.montoPago2()));
      }
    }
  }

  onMontoEntregadoChange() { this.calcularVuelto(); }
  
  onMontoPago1Change() {
    if (this.pagoDividido()) {
      this.montoPago2.set(Math.max(0, this.totalFinal() - this.montoPago1()));
    }
    this.calcularVuelto();
  }
  
  onMetodoPagoChange() {
    if (this.metodoPago() !== 'efectivo') {
      this.montoEntregado.set(0);
      this.vuelto.set(0);
    } else {
      this.calcularVuelto();
    }
    this.facturacionService.aplicarReglaPorMetodo(this.metodoPago());
  }
  
  onEfectivoEntregadoPago1Change() { this.calcularVuelto(); }
  onEfectivoEntregadoPago2Change() { this.calcularVuelto(); }

  togglePagoDividido() {
    const dividido = this.pagoDividido();
    if (dividido) {
      this.montoPago1.set(this.totalFinal() / 2);
      this.montoPago2.set(this.totalFinal() / 2);
      this.metodoPago1.set('efectivo');
      this.metodoPago2.set('transferencia');
    } else {
      this.montoPago1.set(0);
      this.montoPago2.set(0);
      this.efectivoEntregadoPago1.set(0);
      this.// Continuación del método togglePagoDividido()
  efectivoEntregadoPago2.set(0);
      this.vueltoPago1.set(0);
      this.vueltoPago2.set(0);
      this.metodoPago.set('efectivo');
    }
    this.calcularVuelto();
  }

  onMetodoPago1Change() {
    if (this.metodoPago1() !== 'efectivo') {
      this.efectivoEntregadoPago1.set(0);
      this.vueltoPago1.set(0);
    }
    this.calcularVuelto();
    this.facturacionService.aplicarReglaPorMetodo(this.metodoPago1());
  }

  onMetodoPago2Change() {
    if (this.metodoPago2() !== 'efectivo') {
      this.efectivoEntregadoPago2.set(0);
      this.vueltoPago2.set(0);
    }
    this.calcularVuelto();
    this.facturacionService.aplicarReglaPorMetodo(this.metodoPago2());
  }

  async aplicarDescuento() {
    const codigo = this.codigoDescuento();
    if (!codigo) return;

    const { data } = await this.supabase.getClient()
      .from('descuentos')
      .select('*')
      .eq('codigo', codigo)
      .eq('activo', true)
      .single();

    if (data) {
      this.descuentoAplicado.set(data.porcentaje || 0);
      if (data.tipo === 'cantidad') {
        this.totalFinal.set(this.calcularTotalConDescuentoCantidad(data));
      } else {
        this.actualizarTotal();
      }
      this.mostrarToast('Descuento aplicado correctamente.', 'success');
    } else {
      this.descuentoAplicado.set(0);
      this.codigoDescuento.set('');
      this.mostrarToast('Código de descuento inválido o inactivo.', 'error');
      this.actualizarTotal();
    }
  }

  calcularTotalConDescuentoCantidad(descuento: any): number {
    const { cantidad_oferta, cantidad_paga, aplica_mas_caro } = descuento;
    const carritoActual = this.carrito();
    
    if (!cantidad_oferta || !cantidad_paga || cantidad_oferta <= cantidad_paga) {
      return carritoActual.reduce((acc, item) => acc + item.subtotal, 0);
    }

    const precios: number[] = [];
    for (const item of carritoActual) {
      for (let i = 0; i < item.cantidad; i++) {
        precios.push(item.producto.precio);
      }
    }

    if (aplica_mas_caro) {
      precios.sort((a, b) => b - a);
    } else {
      precios.sort((a, b) => a - b);
    }

    const grupos = Math.floor(precios.length / cantidad_oferta);
    let total = 0;
    let idx = 0;

    for (let i = 0; i < grupos; i++) {
      const grupo = precios.slice(idx, idx + cantidad_oferta);
      if (aplica_mas_caro) grupo.sort((a, b) => b - a);
      else grupo.sort((a, b) => a - b);
      
      total += grupo.slice(0, cantidad_paga).reduce((sum, p) => sum + p, 0);
      idx += cantidad_oferta;
    }
    total += precios.slice(idx).reduce((sum, p) => sum + p, 0);
    return total;
  }

  async registrarMovimientoEnCaja(
    ventaId: string, 
    montoVenta: number,
    montoEntregado: number,
    vuelto: number,
    metodoPago: string, 
    usuario: any,
    observacionExtra: string = ''
  ) {
    if (metodoPago !== 'efectivo') return;

    try {
      const { data: cajaActual, error: errorCaja } = await this.supabase.getClient()
        .from('cajas')
        .select('*')
        .eq('estado', 'abierta')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (errorCaja || !cajaActual) return;

      const observacion = observacionExtra 
        ? `${observacionExtra} - Venta por $${montoVenta.toFixed(2)}`
        : `Venta por $${montoVenta.toFixed(2)}`;

      await this.supabase.getClient().from('movimientos_caja').insert({
        caja_id: cajaActual.id,
        tipo: 'ingreso',
        concepto: 'Efectivo recibido',
        monto: montoEntregado,
        metodo: 'efectivo',
        venta_id: ventaId,
        usuario_id: usuario.id,
        usuario_nombre: usuario.nombre,
        observaciones: observacion,
        created_at: new Date().toISOString()
      });

      let nuevoMontoActual = cajaActual.monto_actual + montoEntregado;

      if (vuelto > 0) {
        await this.supabase.getClient().from('movimientos_caja').insert({
          caja_id: cajaActual.id,
          tipo: 'egreso',
          concepto: 'Vuelto entregado',
          monto: vuelto,
          metodo: 'efectivo',
          venta_id: ventaId,
          usuario_id: usuario.id,
          usuario_nombre: usuario.nombre,
          observaciones: `Vuelto de venta por $${montoVenta.toFixed(2)}`,
          created_at: new Date().toISOString()
        });
        nuevoMontoActual -= vuelto;
      }

      await this.supabase.getClient().from('cajas').update({ 
        monto_actual: nuevoMontoActual,
        updated_at: new Date().toISOString()
      }).eq('id', cajaActual.id);

    } catch (error) {
      console.error('Error al registrar en caja:', error);
    }
  }

  async confirmarVenta() {
    if (this.procesandoVenta()) return;

    if (!this.esVentaCredito()) {
        if (this.pagoDividido()) {
            if (!this.metodoPago1() || !this.metodoPago2()) {
                this.mostrarToast('Debe seleccionar ambos métodos de pago.', 'error');
                return;
            }
        } else {
            if (!this.metodoPago()) {
                this.mostrarToast('Debe seleccionar un método de pago.', 'error');
                return;
            }
        }
    }

    if (this.esVentaCredito()) {
      if (!this.clienteSeleccionado()) {
        this.mostrarToast('Debe seleccionar un cliente para venta a crédito.', 'error');
        return;
      }
      if (!this.creditoSuficiente()) {
        this.mostrarToast('El cliente no tiene crédito disponible suficiente.', 'error');
        return;
      }
    }

    if (this.pagoDividido() && !this.esVentaCredito()) {
      const monto1 = this.montoPago1();
      const monto2 = this.montoPago2();
      
      if (monto1 <= 0 || monto2 <= 0) {
        this.mostrarToast('Ambos montos deben ser mayores a 0', 'error');
        return;
      }
      
      const sumaTotal = monto1 + monto2;
      if (Math.abs(sumaTotal - this.totalFinal()) > 0.01) {
        this.mostrarToast('La suma de ambos pagos debe ser igual al total', 'error');
        return;
      }
      
      if (this.metodoPago1() === 'efectivo' || this.metodoPago2() === 'efectivo') {
        const cajaEstaAbierta = await this.verificarCajaAbierta();
        if (!cajaEstaAbierta) {
          this.mostrarToast('❌ No hay caja abierta. No se pueden realizar pagos en efectivo.', 'error');
          return;
        }
      }
      
      if (this.metodoPago1() === 'efectivo' && this.efectivoEntregadoPago1() < monto1) {
        this.mostrarToast('⚠️ El efectivo entregado en el pago 1 es insuficiente', 'error');
        return;
      }
      if (this.metodoPago2() === 'efectivo' && this.efectivoEntregadoPago2() < monto2) {
        this.mostrarToast('⚠️ El efectivo entregado en el pago 2 es insuficiente', 'error');
        return;
      }
    } else if (!this.pagoDividido() && !this.esVentaCredito()) {
      if (this.metodoPago() === 'efectivo') {
        const cajaEstaAbierta = await this.verificarCajaAbierta();
        if (!cajaEstaAbierta) {
          this.mostrarToast('❌ No hay caja abierta.', 'error');
          return;
        }
        if (this.montoEntregado() < this.totalFinal()) {
          this.mostrarToast('⚠️ El monto entregado es insuficiente', 'error');
          return;
        }
      }
    }

    this.procesandoVenta.set(true);
    const carritoActual = this.carrito();
    const totalSinDesc = carritoActual.reduce((acc, item) => acc + item.subtotal, 0);
    let totalFinal = this.totalFinal();
    if (!this.codigoDescuento()) totalFinal = totalSinDesc;

    let usuario = await this.supabase.getCurrentUser();
    if (!usuario) usuario = this.supabase.getVendedorTemp() || JSON.parse(localStorage.getItem('user') || '{}');
    if (!usuario) {
      this.mostrarToast('No se pudo obtener el usuario.', 'error');
      this.procesandoVenta.set(false);
      return;
    }

    let usuario_id: string;
    let usuario_nombre: string;
    if ('user_metadata' in usuario) {
      usuario_id = usuario.id;
      usuario_nombre = usuario.user_metadata?.['nombre'] || 'Desconocido';
    } else {
      const vendedor = usuario as VendedorTemp;
      usuario_id = vendedor.id;
      usuario_nombre = vendedor.nombre || 'Desconocido';
    }

    try {
      let metodoPagoVenta = this.esVentaCredito() ? 'fiado' : this.metodoPago();
      if (this.pagoDividido() && !this.esVentaCredito()) {
        const metodo1Normalizado = this.normalizarMetodoPago(this.metodoPago1());
        const metodo2Normalizado = this.normalizarMetodoPago(this.metodoPago2());
        metodoPagoVenta = `${metodo1Normalizado} ($${this.montoPago1().toFixed(2)}) + ${metodo2Normalizado} ($${this.montoPago2().toFixed(2)})`; 
      }

      // 1. Insertar Venta
const clienteIdFinal = this.esVentaCredito() 
  ? this.clienteSeleccionado()?.id 
  : this.clienteParaFacturaA()?.id || null;

const { data: venta, error } = await this.supabase.getClient().from('ventas').insert({
  usuario_id,
  usuario_nombre,
  cliente_nombre: this.clienteNombre(),
  cliente_email: this.clienteEmail(),
  metodo_pago: metodoPagoVenta,
  total_sin_desc: totalSinDesc,
  descuento_aplicado: this.descuentoAplicado(),
  total_final: totalFinal,
  cliente_id: clienteIdFinal, // <-- AHORA USA clienteIdFinal
  es_credito: this.esVentaCredito()
}).select().single();

      if (error || !venta) throw new Error('Error al guardar la venta');

      // 2. Insertar Detalles
      for (const item of carritoActual) {
        await this.supabase.getClient().from('detalle_venta').insert({
          venta_id: venta.id,
          producto_id: item.producto.id,
          cantidad: item.cantidad,
          precio_unitario: item.producto.precio,
          subtotal: item.subtotal,
          talle: item.producto.talle
        });
        await this.supabase.getClient().from('productos')
          .update({ cantidad_stock: item.producto.cantidad_stock - item.cantidad })
          .eq('id', item.producto.id);
      }

      // 3. Manejo de Crédito
      if (this.esVentaCredito() && this.clienteSeleccionado()) {
        const cliente = this.clienteSeleccionado()!;
        await this.supabase.getClient().from('ventas_credito').insert({
          venta_id: venta.id,
          cliente_id: cliente.id,
          monto_total: totalFinal,
          saldo_pendiente: totalFinal,
          estado: 'pendiente',
          fecha_vencimiento: this.fechaVencimiento() || null,
          observaciones: this.observacionesCredito() || null
        });
        const nuevoSaldo = cliente.saldo_actual + totalFinal;
        await this.supabase.getClient().from('clientes')
          .update({ saldo_actual: nuevoSaldo, updated_at: new Date().toISOString() })
          .eq('id', cliente.id);
      }

      // 4. Manejo de Caja
      if (!this.esVentaCredito()) {
        if (this.pagoDividido()) {
          if (this.metodoPago1() === 'efectivo') {
            await this.registrarMovimientoEnCaja(
              venta.id, 
              this.montoPago1(), 
              this.efectivoEntregadoPago1(), 
              this.vueltoPago1(), 
              'efectivo', 
              { id: usuario_id, nombre: usuario_nombre }, 
              `Pago 1/2 (${this.metodoPago1()})`
            );
          }
          if (this.metodoPago2() === 'efectivo') {
            await this.registrarMovimientoEnCaja(
              venta.id, 
              this.montoPago2(), 
              this.efectivoEntregadoPago2(), 
              this.vueltoPago2(), 
              'efectivo', 
              { id: usuario_id, nombre: usuario_nombre }, 
              `Pago 2/2 (${this.metodoPago2()})`
            );
          }
        } else if (this.metodoPago() === 'efectivo') {
          await this.registrarMovimientoEnCaja(
            venta.id, 
            totalFinal, 
            this.montoEntregado(), 
            this.vuelto(), 
            'efectivo', 
            { id: usuario_id, nombre: usuario_nombre }
          );
        }
      }

      // ============================================================
      //  5. LÓGICA DE FACTURACIÓN AUTOMÁTICA AFIP
      // ============================================================
      try {
  const { data: configFiscal } = await this.supabase.getClient()
    .from('facturacion')
    .select('*')
    .single();

  if (configFiscal && configFiscal.facturacion_habilitada) {
    
    this.mostrarToast('Procesando facturación electrónica...', 'warning');

    let tipoFactura = 'B';

    if (configFiscal.condicion_iva === 'Monotributista') {
      tipoFactura = 'C'; 
    } else {
      // Verificar cliente (puede ser de crédito o solo para factura A)
      const clienteParaVerificar = this.esVentaCredito() 
        ? this.clienteSeleccionado() 
        : this.clienteParaFacturaA();
      
      if (clienteParaVerificar && 
          clienteParaVerificar.condicion_iva === 'Responsable Inscripto' && 
          clienteParaVerificar.cuit) {
        tipoFactura = 'A';
      } else {
        tipoFactura = 'B';
      }
    }

    const resultadoAfip = await this.facturacionService.facturarVenta(venta.id, tipoFactura);
    
    if (resultadoAfip) {
       this.mostrarToast(`Factura ${tipoFactura} emitida correctamente`, 'success');
       
       venta.facturada = true;
       venta.factura_tipo = tipoFactura;
       venta.factura_nro = resultadoAfip.nroFactura;
    }
  }
} catch (billingError: any) {
  console.error('Error en facturación automática:', billingError);
  this.mostrarToast('Venta guardada, pero falló la facturación AFIP.', 'error');
}

      // 6. Preparar datos para el modal de recibo interno
      this.ventaRecienCreada.set({
        ...venta,
        fecha_venta: new Date().toISOString(),
        nombre_usuario: usuario_nombre,
        productos: carritoActual.map(item => ({
          producto_id: item.producto.id,
          nombre: item.producto.nombre,
          marca: item.producto.marca || 'Sin marca',
          cantidad: item.cantidad,
          precio_unitario: item.producto.tiene_promocion 
            ? (item.producto.precio_promocional || item.producto.precio) 
            : item.producto.precio,
          subtotal: item.subtotal,
          talle: item.producto.talle
        }))
      });

      this.mostrarToast('Venta registrada exitosamente', 'success');
      this.resetearFormulario();
      this.realizarBusquedaProductos('', true);
      this.mostrarModalReciboPostVenta.set(true);

    } catch (error: any) {
      this.mostrarToast(error.message || 'Error al procesar la venta', 'error');
    } finally {
      this.procesandoVenta.set(false);
    }
  }

cerrarModalReciboPostVenta() {
  this.mostrarModalReciboPostVenta.set(false);
  this.ventaRecienCreada.set(null);
}

async seleccionarFormatoReciboPostVenta(formato: 'termica' | 'a4') {
  const venta = this.ventaRecienCreada();
  if (!venta) return;
  
  this.generandoReciboPostVenta.set(true);
  
  try {
    // Cambiar descargar:true por false para obtener el blob
    const pdfBlob = await this.generarReciboPDF(venta, false, formato);
    
    if (pdfBlob) {
      // Crear URL del blob y abrir ventana de impresión
      const pdfUrl = URL.createObjectURL(pdfBlob);
      const printWindow = window.open(pdfUrl, '_blank');
      
      if (printWindow) {
        printWindow.onload = () => {
          printWindow.print();
          // Liberar URL después de imprimir
          setTimeout(() => URL.revokeObjectURL(pdfUrl), 100);
        };
      }
      
      this.mostrarToast('✅ Abriendo vista de impresión...', 'success');
    }
    
    this.cerrarModalReciboPostVenta();
  } catch (error: any) {
    console.error('Error al generar recibo:', error);
    this.mostrarToast('❌ Error al generar el recibo', 'error');
  } finally {
    this.generandoReciboPostVenta.set(false);
    this.cdr.markForCheck();
  }
}

  resetearFormulario() {
  this.carrito.set([]);
  this.clienteNombre.set('');
  this.clienteEmail.set('');
  this.codigoDescuento.set('');
  this.descuentoAplicado.set(0);
  this.totalFinal.set(0);
  this.cantidades.set({});
  
  this.pagoDividido.set(false);
  this.metodoPago.set('');
  this.montoEntregado.set(0);
  this.vuelto.set(0);
  
  this.metodoPago1.set('');
  this.montoPago1.set(0);
  this.metodoPago2.set('');
  this.montoPago2.set(0);
  this.efectivoEntregadoPago1.set(0);
  this.efectivoEntregadoPago2.set(0);
  this.vueltoPago1.set(0);
  this.vueltoPago2.set(0);
  
  this.esVentaCredito.set(false);
  this.limpiarCliente();
  this.clienteParaFacturaA.set(null);
  this.fechaVencimiento.set('');
  this.observacionesCredito.set('');
}
  quitarDescuento() {
    this.descuentoAplicado.set(0);
    this.codigoDescuento.set('');
    this.actualizarTotal();
    this.mostrarToast('Descuento eliminado.', 'error');
  }

  mostrarToast(mensaje: string, tipo: 'success' | 'error' | 'warning' = 'success') {
  this.toastMensaje.set(mensaje);
  this.tipoMensajeToast.set(tipo);
  this.toastVisible.set(true);
  setTimeout(() => {
    this.toastVisible.set(false);
  }, tipo === 'success' ? 3000 : tipo === 'warning' ? 3500 : 4000);
}

  normalizarMetodoPago(metodo: string): string {
    return metodo === 'modo' ? 'mercado_pago' : metodo;
  }

  getMetodoLabel(metodo: string): string {
    return this.metodoPagoLabels[metodo] || metodo;
  }

  async verificarCajaAbierta(): Promise<boolean> {
    const ahora = Date.now();
    if (this.cacheEstadoCaja && (ahora - this.cacheEstadoCaja.timestamp) < this.CACHE_CAJA_DURACION) {
      this.cajaAbierta.set(this.cacheEstadoCaja.abierta);
      return this.cajaAbierta();
    }
    
    try {
      const { data, error } = await this.supabase.getClient().rpc('verificar_caja_abierta');
      if (error) {
        const { data: cajaData } = await this.supabase.getClient()
          .from('cajas')
          .select('id')
          .eq('estado', 'abierta')
          .limit(1)
          .maybeSingle();
        this.cajaAbierta.set(!!cajaData);
      } else {
        this.cajaAbierta.set(data?.hay_caja_abierta || false);
      }
      this.cacheEstadoCaja = { abierta: this.cajaAbierta(), timestamp: ahora };
      return this.cajaAbierta();
    } catch (error) {
      return false;
    }
  }

  productosFiltrados(): Producto[] {
    const carritoActual = this.carrito();
    const productosActuales = this.productos();
    
    return productosActuales.filter(prod => {
      const enCarrito = carritoActual.find(c => c.producto.id === prod.id)?.cantidad || 0;
      const disponible = prod.cantidad_stock - enCarrito;
      return disponible > 0;
    });
  }

seleccionarTexto(event: any) {
    event.target.select();
  }

  async manejarEscaneo(event: Event) {
  event.preventDefault(); 
  
  const termino = this.filtroGeneral.trim();
  if (!termino) return;

  const esCodigoBarras = /^\d+$/.test(termino) && termino.length > 3;

  if (esCodigoBarras) {
    await this.buscarProductoExacto(termino);
    // Ya no es necesario resetear aquí porque buscarProductoExacto lo hace
  } else {
    this.realizarBusquedaProductos(termino, true);
  }
}

async generarReciboPDF(venta: any, descargar: boolean = true, formato: 'termica' | 'a4' = 'termica'): Promise<Blob | undefined> {
  this.generandoReciboPostVenta.set(true);
  
  try {
    const { default: jsPDF } = await import('jspdf');
    
    if (formato === 'a4') {
      return await this.generarReciboA4(venta, descargar, jsPDF);
    } else {
      return await this.generarReciboTermica(venta, descargar, jsPDF);
    }
    
  } catch (error: any) {
    console.error('Error al generar recibo:', error);
    this.mostrarToast('❌ Error al generar el recibo', 'error');
    return undefined;
  } finally {
    this.generandoReciboPostVenta.set(false);
    this.cdr.markForCheck();
  }
}

private async generarReciboTermica(venta: any, descargar: boolean, jsPDF: any): Promise<Blob | undefined> {
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
  
  // ==================== LOGO ====================
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

  // ==================== ENCABEZADO ====================
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
  
  // ==================== LÍNEA SEPARADORA ====================
  doc.setLineWidth(0.3);
  doc.line(margen, y, margen + anchoUtil, y);
  y += 1;
  doc.line(margen, y, margen + anchoUtil, y);
  y += 5;
  
  // ==================== TÍTULO ====================
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('COMPROBANTE DE VENTA', 40, y, { align: 'center' });
  y += 4;
  
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.text('NO VÁLIDO COMO FACTURA', 40, y, { align: 'center' });
  y += 6;
  
  // ==================== INFORMACIÓN DE VENTA ====================
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
  
  // ==================== ENCABEZADO PRODUCTOS ====================
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
  
  // ==================== PRODUCTOS ====================
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
  
  // ==================== TOTALES ====================
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
  
  // ==================== MÉTODO DE PAGO ====================
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  const metodoPago = venta.metodo_pago || '';
  
  const metodoPagoLineas = doc.splitTextToSize(`Forma de pago: ${metodoPago.toUpperCase()}`, anchoUtil);
  metodoPagoLineas.forEach((linea: string) => {
    doc.text(linea, margen, y);
    y += 4;
  });
  y += 4;
  
  // ==================== LÍNEA SEPARADORA FINAL ====================
  doc.setLineWidth(0.3);
  doc.line(margen, y, margen + anchoUtil, y);
  y += 1;
  doc.line(margen, y, margen + anchoUtil, y);
  y += 6;
  
  // ==================== PIE DE PÁGINA ====================
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
  
  return doc.output('blob');
}

private async generarReciboA4(venta: any, descargar: boolean, jsPDF: any): Promise<Blob | undefined> {
  const doc = new jsPDF({
    unit: 'mm',
    format: 'a4'
  });
  
  const config = this.configRecibo();
  const margenIzq = 15;
  const margenDer = 15;
  const anchoUtil = 180;
  const anchoPagina = 210;
  let y = 15;
  
  // ==================== LOGO ====================
  if (config?.logo_url) {
    try {
      const logoWidth = 60;
      const logoHeight = 30;
      const logoX = (anchoPagina - logoWidth) / 2;
      doc.addImage(config.logo_url, 'JPG', logoX, y, logoWidth, logoHeight);
      y += logoHeight + 10;
    } catch (error) {
      y += 5;
    }
  } else {
    y += 5;
  }

  // ==================== INFORMACIÓN DE LA EMPRESA ====================
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text(config?.nombre_negocio || 'PRISYS SOLUTIONS', anchoPagina / 2, y, { align: 'center' });
  y += 7;
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(config?.direccion || '9 DE JULIO 1718', anchoPagina / 2, y, { align: 'center' });
  y += 5;
  doc.text(config?.ciudad || 'Corrientes - Capital (3400)', anchoPagina / 2, y, { align: 'center' });
  y += 5;
  
  const tel1 = config?.telefono1 || '(3735) 475716';
  const tel2 = config?.telefono2 || '(3735) 410299';
  doc.text(`Tel: ${tel1} - ${tel2}`, anchoPagina / 2, y, { align: 'center' });
  y += 5;
  
  const wsp1 = config?.whatsapp1 || '3735 475716';
  const wsp2 = config?.whatsapp2 || '3735 410299';
  doc.text(`WhatsApp: ${wsp1} - ${wsp2}`, anchoPagina / 2, y, { align: 'center' });
  y += 5;
  
  if (config?.email_empresa) {
    doc.text(config.email_empresa, anchoPagina / 2, y, { align: 'center' });
    y += 5;
  }
  
  y += 5;
  
  // ==================== LÍNEA SEPARADORA DOBLE ====================
  doc.setLineWidth(0.5);
  doc.line(margenIzq, y, anchoPagina - margenDer, y);
  y += 1;
  doc.line(margenIzq, y, anchoPagina - margenDer, y);
  y += 10;
  
  // ==================== TÍTULO DEL DOCUMENTO ====================
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('RECIBO DE COMPRA', anchoPagina / 2, y, { align: 'center' });
  y += 6;
  
  doc.setFontSize(9);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(100, 100, 100);
  doc.text('NO VÁLIDO COMO FACTURA', anchoPagina / 2, y, { align: 'center' });
  doc.setTextColor(0, 0, 0);
  y += 12;
  
  // ==================== INFORMACIÓN DE LA VENTA EN RECUADRO ====================
  const alturaRecuadro = 35;
  doc.setFillColor(245, 247, 250);
  doc.rect(margenIzq, y, anchoUtil, alturaRecuadro, 'F');
  doc.setLineWidth(0.3);
  doc.setDrawColor(200, 200, 200);
  doc.rect(margenIzq, y, anchoUtil, alturaRecuadro);
  
  const yRecuadro = y + 7;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  
  // Columna izquierda
  doc.text('Código de venta:', margenIzq + 5, yRecuadro);
  doc.text('Fecha:', margenIzq + 5, yRecuadro + 7);
  doc.text('Vendedor/Cajero:', margenIzq + 5, yRecuadro + 14);
  doc.text('Cliente:', margenIzq + 5, yRecuadro + 21);
  
  doc.setFont('helvetica', 'normal');
  
  const fechaVenta = new Date(venta.fecha_venta);
  const dia = String(fechaVenta.getDate()).padStart(2, '0');
  const mes = String(fechaVenta.getMonth() + 1).padStart(2, '0');
  const anio = fechaVenta.getFullYear();
  const hora = String(fechaVenta.getHours()).padStart(2, '0');
  const minutos = String(fechaVenta.getMinutes()).padStart(2, '0');
  const fechaFormateada = `${dia}/${mes}/${anio} ${hora}:${minutos}`;
  
  doc.text(venta.id.slice(-8), margenIzq + 45, yRecuadro);
  doc.text(fechaFormateada, margenIzq + 45, yRecuadro + 7);
  doc.text(venta.nombre_usuario || 'N/A', margenIzq + 45, yRecuadro + 14);
  doc.text(venta.cliente_nombre ? venta.cliente_nombre.toUpperCase() : 'CLIENTE GENÉRICO', margenIzq + 45, yRecuadro + 21);
  
  y += alturaRecuadro + 15;
  
  // ==================== TABLA DE PRODUCTOS ====================
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('DETALLE DE PRODUCTOS', margenIzq, y);
  y += 8;
  
  // Encabezado de la tabla
  const colCant = margenIzq;
  const colDescripcion = margenIzq + 20;
  const colPrecioUnit = margenIzq + 115;
  const colSubtotal = margenIzq + 150;
  
  doc.setFillColor(66, 139, 202);
  doc.rect(margenIzq, y - 5, anchoUtil, 8, 'F');
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  
  doc.text('Cant.', colCant + 5, y);
  doc.text('Descripción', colDescripcion, y);
  doc.text('Precio Unit.', colPrecioUnit, y);
  doc.text('Subtotal', colSubtotal, y);
  
  doc.setTextColor(0, 0, 0);
  y += 8;
  
  // Línea debajo del encabezado
  doc.setLineWidth(0.3);
  doc.setDrawColor(66, 139, 202);
  doc.line(margenIzq, y - 3, anchoPagina - margenDer, y - 3);
  
  // Productos
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  
  let filaAlterna = false;
  
  for (const producto of venta.productos) {
    // Fondo alternado para filas
    if (filaAlterna) {
      doc.setFillColor(250, 250, 250);
      doc.rect(margenIzq, y - 4, anchoUtil, 10, 'F');
    }
    filaAlterna = !filaAlterna;
    
    // Cantidad centrada
    doc.text(`${producto.cantidad}`, colCant + 10, y, { align: 'center' });
    
    // Descripción con marca y talle
    const descripcionCompleta = `${producto.nombre}${producto.marca ? ' - ' + producto.marca : ''}${producto.talle ? ' (Talle: ' + producto.talle + ')' : ''}`;
    const descripcionLineas = doc.splitTextToSize(descripcionCompleta, 90);
    doc.text(descripcionLineas, colDescripcion, y);
    
    // Precio unitario
    doc.text(`$ ${producto.precio_unitario.toFixed(2)}`, colPrecioUnit + 25, y, { align: 'right' });
    
    // Subtotal
    doc.setFont('helvetica', 'bold');
    doc.text(`$ ${producto.subtotal.toFixed(2)}`, colSubtotal + 30, y, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    
    const alturaFila = Math.max(descripcionLineas.length * 4, 10);
    y += alturaFila;
    
    // Línea separadora sutil
    doc.setDrawColor(230, 230, 230);
    doc.setLineWidth(0.1);
    doc.line(margenIzq, y - 2, anchoPagina - margenDer, y - 2);
  }
  
  y += 5;
  
  // ==================== TOTALES EN RECUADRO ====================
  const anchoCajaTotal = 70;
  const xCajaTotal = anchoPagina - margenDer - anchoCajaTotal;
  const yCajaTotal = y;
  
  doc.setLineWidth(0.5);
  doc.setDrawColor(66, 139, 202);
  doc.rect(xCajaTotal, yCajaTotal, anchoCajaTotal, 35);
  
  y += 7;
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  
  const subtotal = venta.productos.reduce((sum: number, p: any) => sum + p.subtotal, 0);
  
  // Subtotal
  doc.text('SUBTOTAL:', xCajaTotal + 5, y);
  doc.text(`$ ${subtotal.toFixed(2)}`, xCajaTotal + anchoCajaTotal - 5, y, { align: 'right' });
  y += 7;
  
  // Descuento si existe
  if (venta.descuento_aplicado > 0) {
    const montoDescuento = subtotal * venta.descuento_aplicado / 100;
    doc.setTextColor(220, 53, 69);
    doc.text(`Descuento (${venta.descuento_aplicado}%):`, xCajaTotal + 5, y);
    doc.text(`- $ ${montoDescuento.toFixed(2)}`, xCajaTotal + anchoCajaTotal - 5, y, { align: 'right' });
    doc.setTextColor(0, 0, 0);
    y += 7;
  }
  
  // Línea antes del total
  doc.setLineWidth(0.3);
  doc.line(xCajaTotal + 5, y - 2, xCajaTotal + anchoCajaTotal - 5, y - 2);
  y += 5;
  
  // Total final
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(25, 135, 84);
  doc.text('TOTAL:', xCajaTotal + 5, y);
  doc.text(`$ ${venta.total_final.toFixed(2)}`, xCajaTotal + anchoCajaTotal - 5, y, { align: 'right' });
  doc.setTextColor(0, 0, 0);
  
  y += 15;
  
  // ==================== MÉTODO DE PAGO ====================
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  const metodoPago = venta.metodo_pago || '';
  
  doc.setFillColor(240, 248, 255);
  doc.rect(margenIzq, y - 4, anchoUtil, 10, 'F');
  doc.setDrawColor(200, 200, 200);
  doc.rect(margenIzq, y - 4, anchoUtil, 10);
  
  doc.text('Forma de pago:', margenIzq + 5, y + 2);
  doc.setFont('helvetica', 'normal');
  doc.text(metodoPago.toUpperCase(), margenIzq + 40, y + 2);
  
  y += 18;
  
  // ==================== LÍNEA SEPARADORA FINAL ====================
  doc.setLineWidth(0.5);
  doc.setDrawColor(66, 139, 202);
  doc.line(margenIzq, y, anchoPagina - margenDer, y);
  y += 1;
  doc.line(margenIzq, y, anchoPagina - margenDer, y);
  y += 12;
  
  // ==================== MENSAJE DE AGRADECIMIENTO ====================
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(66, 139, 202);
  const mensajeGracias = config?.mensaje_agradecimiento || '¡Gracias por su compra!';
  doc.text(mensajeGracias, anchoPagina / 2, y, { align: 'center' });
  doc.setTextColor(0, 0, 0);
  y += 15;

  // ==================== PIE DE PÁGINA ====================
  const yPie = 280;
  
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(128, 128, 128);
  
  const mensajePie = config?.mensaje_pie || 'DESARROLLADO POR PRISYS SOLUTIONS';
  doc.text(mensajePie, anchoPagina / 2, yPie, { align: 'center' });
  
  const emailDev = config?.email_desarrollador || 'prisys.solutions@gmail.com';
  doc.text(emailDev, anchoPagina / 2, yPie + 4, { align: 'center' });
  
  doc.setTextColor(0, 0, 0);
  
  return doc.output('blob');
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

  // ✅ CAMBIO 8: TrackBy para optimizar renderizado de listas
  trackByProductoId(index: number, producto: Producto): string {
    return producto.id;
  }

  trackByCarritoId(index: number, item: { producto: Producto; cantidad: number; subtotal: number }): string {
    return item.producto.id;
  }

  trackByClienteId(index: number, cliente: Cliente): string {
    return cliente.id ?? '';
  }

  abrirSelectorClienteFacturaA() {
  this.mostrarSelectorClienteFacturaA.set(true);
  this.busquedaCliente = ''; // Trigger búsqueda
}

// Método para seleccionar cliente solo para factura A
seleccionarClienteParaFacturaA(cliente: Cliente) {
  this.clienteParaFacturaA.set(cliente);
  this.clienteNombre.set(cliente.nombre);
  this.clienteEmail.set(cliente.email || '');
  this._busquedaCliente.set('');
  this.mostrarSelectorClienteFacturaA.set(false);
  
  // Aplicar regla de facturación según el cliente
  if (cliente.condicion_iva === 'Responsable Inscripto' && cliente.cuit) {
    // Si el cliente es RI con CUIT, puede factura A
    this.mostrarToast('Cliente Responsable Inscripto seleccionado - Factura A disponible', 'success');
  } else {
    this.mostrarToast('Cliente seleccionado - Factura B/C según configuración', 'success');
  }
}

// Método para limpiar cliente de factura A
limpiarClienteFacturaA() {
  this.clienteParaFacturaA.set(null);
  this.clienteNombre.set('');
  this.clienteEmail.set('');
  this._busquedaCliente.set('');
}
}