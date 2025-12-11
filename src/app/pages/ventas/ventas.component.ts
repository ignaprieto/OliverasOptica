import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../services/supabase.service';
import { Producto } from '../../models/producto.model';
import { RouterModule } from '@angular/router';
import { MonedaArsPipe } from '../../pipes/moneda-ars.pipe';
import { ThemeService } from '../../services/theme.service';
import { ClientesService, Cliente } from '../../services/clientes.service';
import { Subject, Subscription, firstValueFrom } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

type VendedorTemp = {
  id: string;
  rol: string;
  nombre: string;
  dni: string;
};

// Interfaces para Quagga
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
  imports: [FormsModule, CommonModule, RouterModule, MonedaArsPipe],
  templateUrl: './ventas.component.html',
  styleUrl: './ventas.component.css'
})
export class VentasComponent implements OnInit, OnDestroy {
  // Datos principales (Ahora 'productos' solo contiene los resultados de búsqueda)
  productos: Producto[] = [];
  carrito: { producto: Producto; cantidad: number; subtotal: number }[] = [];
  cantidades: { [id: string]: number } = {};
  
  // OPTIMIZACIÓN: Buscador Reactivo de Productos
  private searchSubject = new Subject<string>();
  private searchSubscription: Subscription | null = null;
  private _filtroGeneral: string = '';

  get filtroGeneral(): string {
    return this._filtroGeneral;
  }
  set filtroGeneral(value: string) {
    this._filtroGeneral = value;
    this.searchSubject.next(value); // Disparar búsqueda al escribir
  }

  // OPTIMIZACIÓN: Buscador Reactivo de Clientes
  private searchClienteSubject = new Subject<string>();
  private searchClienteSubscription: Subscription | null = null;

  // Estados de ordenamiento
  ordenPrecio: 'asc' | 'desc' | 'none' = 'none';
  ordenStock: 'asc' | 'desc' | 'none' = 'none';

  metodoPago = 'efectivo';
  codigoDescuento = '';
  descuentoAplicado = 0;
  totalFinal = 0;

  // Para pago dividido
  metodoPago1 = 'efectivo';
  montoPago1: number = 0;
  metodoPago2 = 'transferencia';
  montoPago2: number = 0;
  efectivoEntregadoPago1: number = 0;
  efectivoEntregadoPago2: number = 0;
  vueltoPago1: number = 0;
  vueltoPago2: number = 0;
  pagoDividido = false;
  
  // Verificación de caja
  cajaAbierta = false;

  // Propiedades para el cálculo de vuelto
  montoEntregado: number = 0;
  vuelto: number = 0;

  clienteNombre = '';
  clienteEmail = '';

  // Nuevas propiedades para ventas a crédito
  esVentaCredito = false;
  clientes: Cliente[] = []; // Resultados de búsqueda de clientes
  // clientesFiltrados: Cliente[] = []; // YA NO ES NECESARIO, usamos 'clientes'
  clienteSeleccionado: Cliente | null = null;
  
  // Getter/Setter para búsqueda de clientes
  private _busquedaCliente = '';
  get busquedaCliente(): string {
    return this._busquedaCliente;
  }
  set busquedaCliente(val: string) {
    this._busquedaCliente = val;
    this.searchClienteSubject.next(val);
  }

  mostrarListaClientes = false;
  fechaVencimiento: string = '';
  observacionesCredito = '';

  toastVisible = false;
  toastMensaje = '';
  cantidadesEnCarrito: { [key: string]: number } = {};
  procesandoVenta: boolean = false;
  toastColor = 'bg-green-600';

  // Estados del escáner
  mostrarScanner: boolean = false;
  scannerActivo: boolean = false;
  soportaEscaner: boolean = false;
  escaneando: boolean = false;
  intentosScanner: number = 0;
  errorScanner: string = '';

  Math = Math;
  cargando = false;
  buscandoProductos = false; // Spinner para la tabla de búsqueda

  private cacheEstadoCaja: { abierta: boolean; timestamp: number } | null = null;
  private readonly CACHE_CAJA_DURACION = 10000; // 10 segundos

  mapaDescuentos: Map<string, number> = new Map();

  metodoPagoLabels: { [key: string]: string } = {
    'efectivo': 'Efectivo',
    'transferencia': 'Transferencia',
    'debito': 'Débito',
    'credito': 'Crédito',
    'mercado_pago': 'Mercado Pago',
    'fiado': 'Fiado'
  };

  constructor(
    private supabase: SupabaseService, 
    public themeService: ThemeService,
    private clientesService: ClientesService
  ) {}

  async ngOnInit() {
    this.cargando = true;
    
    // 1. Configurar Debounce para Productos
    this.searchSubscription = this.searchSubject.pipe(
      debounceTime(400),
      distinctUntilChanged()
    ).subscribe(texto => {
      this.realizarBusquedaProductos(texto);
    });

    // 2. Configurar Debounce para Clientes
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
      
      // Cargamos una lista inicial pequeña (ej: últimos 10 agregados) o nada
      await this.realizarBusquedaProductos(''); 
      
      this.verificarSoporteEscaner();
      this.cargarQuagga(); // Pre-cargar script
    } catch (error) {
      console.error('Error en carga inicial:', error);
      this.mostrarToast('Error al cargar datos iniciales', 'error');
    } finally {
      this.cargando = false;
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
        this.mapaDescuentos.clear();
        promociones.forEach((promo: any) => {
          if (promo.promocion_productos) {
            promo.promocion_productos.forEach((rel: any) => {
              const existente = this.mapaDescuentos.get(rel.producto_id) || 0;
              if (promo.porcentaje > existente) {
                 this.mapaDescuentos.set(rel.producto_id, promo.porcentaje);
              }
            });
          }
        });
      }
    } catch (e) {
      console.error("Error cargando promociones", e);
    }
  }

  // ============================================
  // LÓGICA DE BÚSQUEDA OPTIMIZADA (Productos)
  // ============================================

  async realizarBusquedaProductos(termino: string) {
    this.buscandoProductos = true;
    try {
      let query = this.supabase.getClient()
        .from('productos')
        .select('id, codigo, nombre, marca, categoria, talle, precio, cantidad_stock, cantidad_deposito, activo')
        .eq('activo', true)
        .eq('eliminado', false)
        .gt('cantidad_stock', 0);

      // 1. Filtro de texto (Server-Side)
      if (termino && termino.trim()) {
        const t = termino.trim();
        query = query.or(`codigo.ilike.%${t}%,nombre.ilike.%${t}%,marca.ilike.%${t}%,categoria.ilike.%${t}%`);
      }

      // 2. Ordenamiento (Server-Side) - ¡AQUÍ ESTÁ LA CORRECCIÓN!
      if (this.ordenPrecio === 'asc') {
        query = query.order('precio', { ascending: true });
      } else if (this.ordenPrecio === 'desc') {
        query = query.order('precio', { ascending: false });
      } else if (this.ordenStock === 'asc') {
        query = query.order('cantidad_stock', { ascending: true });
      } else if (this.ordenStock === 'desc') {
        query = query.order('cantidad_stock', { ascending: false });
      } else {
        // Orden por defecto si no hay filtros activos
        query = query.order('nombre', { ascending: true });
      }
      
      // Limitamos a 20 resultados
      const { data, error } = await query.limit(20);

      if (error) throw error;

      if (data) {
        this.productos = data.map((p: any) => {
          const descuento = this.mapaDescuentos.get(p.id);
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
        // Ya no llamamos a aplicarOrdenamientoLocal() porque vienen ordenados del servidor
      }
    } catch (error) {
      console.error('Error buscando productos:', error);
    } finally {
      this.buscandoProductos = false;
    }
  }

  async buscarProductoExacto(codigo: string) {
    // Método rápido para el scanner
    try {
      const { data, error } = await this.supabase.getClient()
        .from('productos')
        .select('*')
        .eq('codigo', codigo)
        .eq('activo', true)
        .eq('eliminado', false)
        .single();

      if (data) {
        // Procesar promoción
        const descuento = this.mapaDescuentos.get(data.id);
        const prodProcesado = descuento ? {
          ...data,
          tiene_promocion: true,
          precio_promocional: data.precio - (data.precio * (descuento / 100)),
          porcentaje_promocion: descuento
        } : data;

        // Agregar directamente al carrito si se encuentra
        this.cantidades[prodProcesado.id] = 1;
        this.agregarAlCarrito(prodProcesado);
        this.mostrarToast(`Producto agregado: ${prodProcesado.nombre}`, 'success');
        this.filtroGeneral = ''; // Limpiar filtro para no confundir
      } else {
        this.mostrarToast('Producto no encontrado', 'error');
      }
    } catch (err) {
      console.error('Error buscando exacto', err);
    }
  }

  aplicarOrdenamientoLocal() {
    // Ordena solo el array 'this.productos' que contiene los resultados de la búsqueda
    if (this.ordenPrecio === 'asc') {
      this.productos.sort((a, b) => a.precio - b.precio);
    } else if (this.ordenPrecio === 'desc') {
      this.productos.sort((a, b) => b.precio - a.precio);
    } else if (this.ordenStock === 'asc') {
      this.productos.sort((a, b) => a.cantidad_stock - b.cantidad_stock);
    } else if (this.ordenStock === 'desc') {
      this.productos.sort((a, b) => b.cantidad_stock - a.cantidad_stock);
    }
  }

  // ============================================
  // LÓGICA DE CLIENTES (Server-Side)
  // ============================================

  async realizarBusquedaClientes(termino: string) {
    if (!termino.trim()) {
      this.clientes = []; // Si no busca nada, lista vacía o lista default
      return;
    }

    try {
      const { data, error } = await this.supabase.getClient()
        .from('clientes')
        .select('*')
        .eq('activo', true)
        .or(`nombre.ilike.%${termino}%,dni.ilike.%${termino}%,email.ilike.%${termino}%`)
        .limit(10); // Solo traer 10 coincidencias

      if (!error && data) {
        this.clientes = data;
      }
    } catch (error) {
      console.error('Error buscando clientes:', error);
    }
  }

  seleccionarCliente(cliente: Cliente) {
    this.clienteSeleccionado = cliente;
    this.clienteNombre = cliente.nombre;
    this.clienteEmail = cliente.email || '';
    this._busquedaCliente = ''; // Limpiamos el input interno
    this.mostrarListaClientes = false;
  }

  limpiarCliente() {
    this.clienteSeleccionado = null;
    this._busquedaCliente = '';
    this.clientes = [];
  }

  // ============================================
  // MÉTODOS DEL SCANNER
  // ============================================

  verificarSoporteEscaner() {
    this.soportaEscaner = 'mediaDevices' in navigator && 'getUserMedia' in navigator.mediaDevices;
  }

  cargarQuagga(): void {
    if (typeof window.Quagga === 'undefined') {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/quagga/0.12.1/quagga.min.js';
      script.async = true;
      script.onerror = () => {
        console.error('Error al cargar Quagga');
        this.errorScanner = 'No se pudo cargar el scanner.';
      };
      document.body.appendChild(script);
    }
  }

  abrirScanner(): void {
    this.mostrarScanner = true;
    this.intentosScanner = 0;
    this.errorScanner = '';
    this.escaneando = true;
    
    setTimeout(() => {
      this.iniciarScanner();
    }, 500);
  }

  async iniciarScanner(): Promise<void> {
    if (typeof window.Quagga === 'undefined') {
      this.errorScanner = 'Scanner no disponible. Recargando...';
      return;
    }

    const container = document.querySelector('#scanner-container');
    if (!container) {
      console.error('Contenedor del scanner no encontrado');
      if (this.intentosScanner < 3) {
        this.intentosScanner++;
        setTimeout(() => {
          this.iniciarScanner();
        }, 300);
      } else {
        this.errorScanner = 'Error al inicializar el scanner.';
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
      this.errorScanner = 'Error al acceder a la cámara.';
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
      numOfWorkers: 2, // Reducir workers para menos carga
      frequency: 5, // Reducir frecuencia de escaneo
      decoder: {
        readers: ["ean_reader", "code_128_reader", "code_39_reader"],
        debug: { drawBoundingBox: true, showFrequency: false, drawScanline: true, showPattern: false }
      },
      locate: true
    };

    Quagga.init(config, (err: Error | null) => {
      if (err) {
        this.errorScanner = 'Error al iniciar el scanner';
        this.cerrarScanner();
        return;
      }
      Quagga.start();
      this.scannerActivo = true;
    });

    // Usar onDetected una sola vez con debounce manual si es necesario
    let lastCode = '';
    let lastTime = 0;

    Quagga.onDetected((data: QuaggaDetectionResult) => {
      const now = Date.now();
      const codigo = data.codeResult.code;
      
      // Evitar lecturas múltiples muy rápidas
      if (codigo === lastCode && (now - lastTime) < 2000) return;
      
      lastCode = codigo;
      lastTime = now;

      if (navigator.vibrate) navigator.vibrate(200);
      
      this.cerrarScanner();
      // Búsqueda directa exacta
      this.buscarProductoExacto(codigo);
    });
  }

  detenerScanner(): void {
    if (this.scannerActivo && typeof window.Quagga !== 'undefined') {
      try { window.Quagga!.stop(); } catch (err) { console.error(err); }
      this.scannerActivo = false;
    }
    const container = document.querySelector('#scanner-container');
    if (container) container.innerHTML = '';
  }

  cerrarScanner(): void {
    this.detenerScanner();
    this.mostrarScanner = false;
    this.escaneando = false;
    this.intentosScanner = 0;
    this.errorScanner = '';
  }

  // ============================================
  // MÉTODOS GENERALES (Carrito, Pagos, etc.)
  // ============================================

  onTipoPagoChange() {
    if (this.esVentaCredito) {
      this.metodoPago = 'credito';
      this.mostrarListaClientes = true;
      // Cargar clientes iniciales o limpiar
      this.clientes = [];
    } else {
      this.metodoPago = 'efectivo';
      this.mostrarListaClientes = false;
      this.limpiarCliente();
    }
    this.onMetodoPagoChange();
  }

  getCreditoDisponible(): number {
    if (!this.clienteSeleccionado) return 0;
    return Math.max(0, this.clienteSeleccionado.limite_credito - this.clienteSeleccionado.saldo_actual);
  }

  creditoSuficiente(): boolean {
    if (!this.clienteSeleccionado || !this.esVentaCredito) return true;
    return this.getCreditoDisponible() >= this.totalFinal;
  }

toggleOrdenPrecio() {
    this.ordenStock = 'none';
    this.ordenPrecio = this.ordenPrecio === 'none' ? 'desc' : (this.ordenPrecio === 'desc' ? 'asc' : 'none');
    
    // Recargar datos con el nuevo orden
    this.realizarBusquedaProductos(this.filtroGeneral);
  }

  toggleOrdenStock() {
    this.ordenPrecio = 'none';
    this.ordenStock = this.ordenStock === 'none' ? 'desc' : (this.ordenStock === 'desc' ? 'asc' : 'none');
    
    // Recargar datos con el nuevo orden
    this.realizarBusquedaProductos(this.filtroGeneral);
  }

  limpiarFiltros() {
    this.ordenPrecio = 'none';
    this.ordenStock = 'none';
    this.filtroGeneral = ''; 
    this.realizarBusquedaProductos(''); // Recargar lista por defecto
  }

  quitarUnidad(producto: Producto) {
    const item = this.carrito.find(i => i.producto.id === producto.id);
    if (!item) return;

    const precioFinal = producto.tiene_promocion ? (producto.precio_promocional || producto.precio) : producto.precio;

    item.cantidad -= 1;
    item.subtotal = item.cantidad * precioFinal;

    if (item.cantidad <= 0) {
      this.eliminarDelCarrito(producto);
    }
    this.actualizarTotal();
  }

  eliminarDelCarrito(producto: Producto) {
    this.carrito = this.carrito.filter(i => i.producto.id !== producto.id);
    this.actualizarTotal();
  }

  aumentarCantidad(prod: Producto) {
    const actual = this.cantidades[prod.id] || 0;
    const enCarrito = this.carrito.find(i => i.producto.id === prod.id)?.cantidad || 0;
    const disponible = prod.cantidad_stock - enCarrito;

    if (actual < disponible) {
      this.cantidades[prod.id] = actual + 1;
    }
  }

  disminuirCantidad(prod: Producto) {
    const actual = this.cantidades[prod.id] || 0;
    if (actual > 0) {
      this.cantidades[prod.id] = actual - 1;
    }
  }

  agregarAlCarrito(prod: Producto) {
    const cantidad = this.cantidades[prod.id];
    if (!cantidad || cantidad < 1) return;

    const precioFinal = prod.tiene_promocion ? (prod.precio_promocional || prod.precio) : prod.precio;

    const existe = this.carrito.find(item => item.producto.id === prod.id);
    if (existe) {
      existe.cantidad += cantidad;
      existe.subtotal = existe.cantidad * precioFinal;
    } else {
      this.carrito.push({ producto: prod, cantidad, subtotal: cantidad * precioFinal });
    }

    this.cantidades[prod.id] = 0;
    this.actualizarTotal();
  }

  actualizarTotal() {
    const totalSinDescuento = this.carrito.reduce((acc, item) => acc + item.subtotal, 0);
    this.totalFinal = totalSinDescuento * (1 - this.descuentoAplicado / 100);
    this.calcularVuelto();
  }

  calcularVuelto() {
    if (!this.pagoDividido) {
      if (this.metodoPago === 'efectivo' && this.montoEntregado > 0) {
        this.vuelto = Math.max(0, this.montoEntregado - this.totalFinal);
      } else {
        this.vuelto = 0;
      }
    } else {
      this.vueltoPago1 = 0;
      this.vueltoPago2 = 0;

      if (this.metodoPago1 === 'efectivo' && this.efectivoEntregadoPago1 > 0) {
        this.vueltoPago1 = Math.max(0, this.efectivoEntregadoPago1 - this.montoPago1);
      }

      if (this.metodoPago2 === 'efectivo' && this.efectivoEntregadoPago2 > 0) {
        this.vueltoPago2 = Math.max(0, this.efectivoEntregadoPago2 - this.montoPago2);
      }
    }
  }

  onMontoEntregadoChange() { this.calcularVuelto(); }
  onMontoPago1Change() {
    if (this.pagoDividido) {
      this.montoPago2 = Math.max(0, this.totalFinal - this.montoPago1);
    }
    this.calcularVuelto();
  }
  onMetodoPagoChange() {
    if (this.metodoPago !== 'efectivo') {
      this.montoEntregado = 0;
      this.vuelto = 0;
    } else {
      this.calcularVuelto();
    }
  }
  onEfectivoEntregadoPago1Change() { this.calcularVuelto(); }
  onEfectivoEntregadoPago2Change() { this.calcularVuelto(); }

  togglePagoDividido() {
    if (this.pagoDividido) {
      this.montoPago1 = this.totalFinal / 2;
      this.montoPago2 = this.totalFinal / 2;
      this.metodoPago1 = 'efectivo';
      this.metodoPago2 = 'transferencia';
    } else {
      this.montoPago1 = 0;
      this.montoPago2 = 0;
      this.efectivoEntregadoPago1 = 0;
      this.efectivoEntregadoPago2 = 0;
      this.vueltoPago1 = 0;
      this.vueltoPago2 = 0;
      this.metodoPago = 'efectivo';
    }
    this.calcularVuelto();
  }

  onMetodoPago1Change() {
    if (this.metodoPago1 !== 'efectivo') {
      this.efectivoEntregadoPago1 = 0;
      this.vueltoPago1 = 0;
    }
    this.calcularVuelto();
  }

  onMetodoPago2Change() {
    if (this.metodoPago2 !== 'efectivo') {
      this.efectivoEntregadoPago2 = 0;
      this.vueltoPago2 = 0;
    }
    this.calcularVuelto();
  }

  async aplicarDescuento() {
    if (!this.codigoDescuento) return;

    const { data } = await this.supabase.getClient()
      .from('descuentos')
      .select('*')
      .eq('codigo', this.codigoDescuento)
      .eq('activo', true)
      .single();

    if (data) {
      this.descuentoAplicado = data.porcentaje || 0;
      if (data.tipo === 'cantidad') {
        this.totalFinal = this.calcularTotalConDescuentoCantidad(data);
      } else {
        this.actualizarTotal();
      }
      this.mostrarToast('Descuento aplicado correctamente.', 'success');
    } else {
      this.descuentoAplicado = 0;
      this.codigoDescuento = '';
      this.mostrarToast('Código de descuento inválido o inactivo.', 'error');
      this.actualizarTotal();
    }
  }

  calcularTotalConDescuentoCantidad(descuento: any): number {
    const { cantidad_oferta, cantidad_paga, aplica_mas_caro } = descuento;
    if (!cantidad_oferta || !cantidad_paga || cantidad_oferta <= cantidad_paga) {
      return this.carrito.reduce((acc, item) => acc + item.subtotal, 0);
    }

    const precios: number[] = [];
    for (const item of this.carrito) {
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
    if (this.procesandoVenta) return;

    if (this.esVentaCredito) {
      if (!this.clienteSeleccionado) {
        this.mostrarToast('Debe seleccionar un cliente para venta a crédito.', 'error');
        return;
      }
      if (!this.creditoSuficiente()) {
        this.mostrarToast('El cliente no tiene crédito disponible suficiente.', 'error');
        return;
      }
    }

    if (this.pagoDividido && !this.esVentaCredito) {
      if (this.montoPago1 <= 0 || this.montoPago2 <= 0) {
        this.mostrarToast('Ambos montos deben ser mayores a 0', 'error');
        return;
      }
      const sumaTotal = this.montoPago1 + this.montoPago2;
      if (Math.abs(sumaTotal - this.totalFinal) > 0.01) {
        this.mostrarToast('La suma de ambos pagos debe ser igual al total', 'error');
        return;
      }
      if (this.metodoPago1 === 'efectivo' || this.metodoPago2 === 'efectivo') {
        const cajaEstaAbierta = await this.verificarCajaAbierta();
        if (!cajaEstaAbierta) {
          this.mostrarToast('❌ No hay caja abierta. No se pueden realizar pagos en efectivo.', 'error');
          return;
        }
      }
      // Validaciones de efectivo entregado
      if (this.metodoPago1 === 'efectivo' && this.efectivoEntregadoPago1 < this.montoPago1) {
        this.mostrarToast('⚠️ El efectivo entregado en el pago 1 es insuficiente', 'error');
        return;
      }
      if (this.metodoPago2 === 'efectivo' && this.efectivoEntregadoPago2 < this.montoPago2) {
        this.mostrarToast('⚠️ El efectivo entregado en el pago 2 es insuficiente', 'error');
        return;
      }
    } else if (!this.pagoDividido && !this.esVentaCredito) {
      if (this.metodoPago === 'efectivo') {
        const cajaEstaAbierta = await this.verificarCajaAbierta();
        if (!cajaEstaAbierta) {
          this.mostrarToast('❌ No hay caja abierta.', 'error');
          return;
        }
        if (this.montoEntregado < this.totalFinal) {
          this.mostrarToast('⚠️ El monto entregado es insuficiente', 'error');
          return;
        }
      }
    }

    this.procesandoVenta = true;
    const totalSinDesc = this.carrito.reduce((acc, item) => acc + item.subtotal, 0);
    let totalFinal = this.totalFinal;
    if (!this.codigoDescuento) totalFinal = totalSinDesc;

    let usuario = await this.supabase.getCurrentUser();
    if (!usuario) usuario = this.supabase.getVendedorTemp() || JSON.parse(localStorage.getItem('user') || '{}');
    if (!usuario) {
      this.mostrarToast('No se pudo obtener el usuario.', 'error');
      this.procesandoVenta = false;
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
      let metodoPagoVenta = this.esVentaCredito ? 'fiado' : this.metodoPago;
      if (this.pagoDividido && !this.esVentaCredito) {
        const metodo1Normalizado = this.normalizarMetodoPago(this.metodoPago1);
        const metodo2Normalizado = this.normalizarMetodoPago(this.metodoPago2);
        metodoPagoVenta = `${metodo1Normalizado} ($${this.montoPago1.toFixed(2)}) + ${metodo2Normalizado} ($${this.montoPago2.toFixed(2)})`; 
      }

      const { data: venta, error } = await this.supabase.getClient().from('ventas').insert({
        usuario_id,
        usuario_nombre,
        cliente_nombre: this.clienteNombre,
        cliente_email: this.clienteEmail,
        metodo_pago: metodoPagoVenta,
        total_sin_desc: totalSinDesc,
        descuento_aplicado: this.descuentoAplicado,
        total_final: totalFinal,
        cliente_id: this.clienteSeleccionado?.id || null,
        es_credito: this.esVentaCredito
      }).select().single();

      if (error || !venta) throw new Error('Error al guardar la venta');

      // Detalles
      for (const item of this.carrito) {
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
      if (this.esVentaCredito && this.clienteSeleccionado) {
        await this.supabase.getClient().from('ventas_credito').insert({
          venta_id: venta.id,
          cliente_id: this.clienteSeleccionado.id,
          monto_total: totalFinal,
          saldo_pendiente: totalFinal,
          estado: 'pendiente',
          fecha_vencimiento: this.fechaVencimiento || null,
          observaciones: this.observacionesCredito || null
        });
        const nuevoSaldo = this.clienteSeleccionado.saldo_actual + totalFinal;
        await this.supabase.getClient().from('clientes')
          .update({ saldo_actual: nuevoSaldo, updated_at: new Date().toISOString() })
          .eq('id', this.clienteSeleccionado.id);
      }

      // Caja
      if (!this.esVentaCredito) {
        if (this.pagoDividido) {
          if (this.metodoPago1 === 'efectivo') {
            await this.registrarMovimientoEnCaja(venta.id, this.montoPago1, this.efectivoEntregadoPago1, this.vueltoPago1, 'efectivo', { id: usuario_id, nombre: usuario_nombre }, `Pago 1/2 (${this.metodoPago1})`);
          }
          if (this.metodoPago2 === 'efectivo') {
            await this.registrarMovimientoEnCaja(venta.id, this.montoPago2, this.efectivoEntregadoPago2, this.vueltoPago2, 'efectivo', { id: usuario_id, nombre: usuario_nombre }, `Pago 2/2 (${this.metodoPago2})`);
          }
        } else if (this.metodoPago === 'efectivo') {
          await this.registrarMovimientoEnCaja(venta.id, totalFinal, this.montoEntregado, this.vuelto, 'efectivo', { id: usuario_id, nombre: usuario_nombre });
        }
      }

      this.mostrarToast('Venta confirmada correctamente', 'success');
      this.resetearFormulario();
      this.realizarBusquedaProductos(''); // Recargar lista
      
    } catch (error: any) {
      this.mostrarToast(error.message || 'Error al procesar la venta', 'error');
    } finally {
      this.procesandoVenta = false;
    }
  }
  
  resetearFormulario() {
    this.carrito = [];
    this.clienteNombre = '';
    this.clienteEmail = '';
    this.codigoDescuento = '';
    this.descuentoAplicado = 0;
    this.totalFinal = 0;
    this.cantidades = {};
    
    this.pagoDividido = false;
    this.metodoPago = 'efectivo';
    this.montoEntregado = 0;
    this.vuelto = 0;
    
    this.metodoPago1 = 'efectivo';
    this.montoPago1 = 0;
    this.metodoPago2 = 'transferencia';
    this.montoPago2 = 0;
    this.efectivoEntregadoPago1 = 0;
    this.efectivoEntregadoPago2 = 0;
    this.vueltoPago1 = 0;
    this.vueltoPago2 = 0;
    
    this.esVentaCredito = false;
    this.limpiarCliente();
    this.fechaVencimiento = '';
    this.observacionesCredito = '';
  }

  quitarDescuento() {
    this.descuentoAplicado = 0;
    this.codigoDescuento = '';
    this.actualizarTotal();
    this.mostrarToast('Descuento eliminado.', 'error');
  }

  mostrarToast(mensaje: string, tipo: 'success' | 'error') {
    this.toastMensaje = mensaje;
    this.toastColor = tipo === 'success' ? 'bg-green-600' : 'bg-red-600';
    this.toastVisible = true;
    setTimeout(() => {
      this.toastVisible = false;
      this.toastColor = 'bg-green-600';
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
      this.cajaAbierta = this.cacheEstadoCaja.abierta;
      return this.cajaAbierta;
    }
    
    try {
      const { data, error } = await this.supabase.getClient().rpc('verificar_caja_abierta');
      if (error) {
        const { data: cajaData } = await this.supabase.getClient().from('cajas').select('id').eq('estado', 'abierta').limit(1).maybeSingle();
        this.cajaAbierta = !!cajaData;
      } else {
        this.cajaAbierta = data?.hay_caja_abierta || false;
      }
      this.cacheEstadoCaja = { abierta: this.cajaAbierta, timestamp: ahora };
      return this.cajaAbierta;
    } catch (error) {
      return false;
    }
  }

  productosFiltrados() {
    return this.productos.filter(prod => {
      const enCarrito = this.carrito.find(c => c.producto.id === prod.id)?.cantidad || 0;
      const disponible = prod.cantidad_stock - enCarrito;

      // Solo ocultamos si se agotó el stock por estar en el carrito
      return disponible > 0;
    });
  }
}