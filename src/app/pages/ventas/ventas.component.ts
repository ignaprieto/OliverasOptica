import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy, signal, computed, ChangeDetectionStrategy } from '@angular/core';
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
  // ✅ CAMBIO 2: Constante para columnas específicas de Supabase
  private readonly COLUMNAS_PRODUCTOS = 'id, codigo, nombre, marca, categoria, talle, precio, cantidad_stock, cantidad_deposito, activo';
  private readonly COLUMNAS_CLIENTES = 'id, nombre, dni, email, limite_credito, saldo_actual, activo';
  
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
  metodoPago = signal<string>('efectivo');
  codigoDescuento = signal<string>('');
  descuentoAplicado = signal<number>(0);
  totalFinal = signal<number>(0);

  // Pago dividido
  metodoPago1 = signal<string>('efectivo');
  montoPago1 = signal<number>(0);
  metodoPago2 = signal<string>('transferencia');
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
  toastColor = signal<string>('bg-green-600');

  // Scanner
  mostrarScanner = signal<boolean>(false);
  scannerActivo = signal<boolean>(false);
  soportaEscaner = signal<boolean>(false);
  escaneando = signal<boolean>(false);
  intentosScanner = signal<number>(0);
  errorScanner = signal<string>('');

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

  constructor(
    private supabase: SupabaseService, 
    public themeService: ThemeService,
    private clientesService: ClientesService
  ) {}

  async ngOnInit() {
    this.cargando.set(true);
    
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

  // ✅ CAMBIO 7: Método para scroll infinito
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
        .select(this.COLUMNAS_PRODUCTOS) // ✅ Columnas específicas
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
        this._filtroGeneral.set('');
      } else {
        this.mostrarToast('Producto no encontrado', 'error');
      }
    } catch (err) {
      console.error('Error buscando exacto', err);
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
        .select(this.COLUMNAS_CLIENTES) // ✅ Columnas específicas
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
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: { ideal: "environment" } } 
      });
      stream.getTracks().forEach(track => track.stop());
      this.inicializarQuagga();
    } catch (err) {
      console.error('Error cámara:', err);
      this.errorScanner.set('Error al acceder a la cámara.');
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
      try { window.Quagga!.stop(); } catch (err) { console.error(err); }
      this.scannerActivo.set(false);
    }
    const container = document.querySelector('#scanner-container');
    if (container) container.innerHTML = '';
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
      this.metodoPago.set('credito');
      this.mostrarListaClientes.set(true);
      this.clientes.set([]);
    } else {
      this.metodoPago.set('efectivo');
      this.mostrarListaClientes.set(false);
      this.limpiarCliente();
    }
    this.onMetodoPagoChange();
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
  }

  onMetodoPago2Change() {
    if (this.metodoPago2() !== 'efectivo') {
      this.efectivoEntregadoPago2.set(0);
      this.vueltoPago2.set(0);
    }
    this.calcularVuelto();
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

    // Validaciones
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

      const { data: venta, error } = await this.supabase.getClient().from('ventas').insert({
        usuario_id,
        usuario_nombre,
        cliente_nombre: this.clienteNombre(),
        cliente_email: this.clienteEmail(),
        metodo_pago: metodoPagoVenta,
        total_sin_desc: totalSinDesc,
        descuento_aplicado: this.descuentoAplicado(),
        total_final: totalFinal,
        cliente_id: this.clienteSeleccionado()?.id || null,
        es_credito: this.esVentaCredito()
      }).select().single();

      if (error || !venta) throw new Error('Error al guardar la venta');

      // Detalles
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

      // Crédito
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

      // Caja
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

      this.mostrarToast('Venta confirmada correctamente', 'success');
      this.resetearFormulario();
      this.realizarBusquedaProductos('', true);
      
    } catch (error: any) {
      this.mostrarToast(error.message || 'Error al procesar la venta', 'error');
    } finally {
      this.procesandoVenta.set(false);
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
    this.metodoPago.set('efectivo');
    this.montoEntregado.set(0);
    this.vuelto.set(0);
    
    this.metodoPago1.set('efectivo');
    this.montoPago1.set(0);
    this.metodoPago2.set('transferencia');
    this.montoPago2.set(0);
    this.efectivoEntregadoPago1.set(0);
    this.efectivoEntregadoPago2.set(0);
    this.vueltoPago1.set(0);
    this.vueltoPago2.set(0);
    
    this.esVentaCredito.set(false);
    this.limpiarCliente();
    this.fechaVencimiento.set('');
    this.observacionesCredito.set('');
  }

  quitarDescuento() {
    this.descuentoAplicado.set(0);
    this.codigoDescuento.set('');
    this.actualizarTotal();
    this.mostrarToast('Descuento eliminado.', 'error');
  }

  mostrarToast(mensaje: string, tipo: 'success' | 'error') {
    this.toastMensaje.set(mensaje);
    this.toastColor.set(tipo === 'success' ? 'bg-green-600' : 'bg-red-600');
    this.toastVisible.set(true);
    setTimeout(() => {
      this.toastVisible.set(false);
      this.toastColor.set('bg-green-600');
    }, tipo === 'success' ? 3000 : 2500);
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
}