import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, signal, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { Producto } from '../../models/producto.model';
import { SupabaseService } from '../../services/supabase.service';
import { ThemeService } from '../../services/theme.service';
import { MonedaArsPipe } from '../../pipes/moneda-ars.pipe';
import { Subject, Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

// --- INTERFACES QUAGGA (SCANNER) ---
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
  locator?: { patchSize: string; halfSample: boolean };
  numOfWorkers?: number;
  frequency?: number;
  decoder: {
    readers: string[];
    debug?: { drawBoundingBox: boolean; showFrequency: boolean; drawScanline: boolean; showPattern: boolean };
  };
  locate?: boolean;
}

interface QuaggaDetectionResult {
  codeResult: { code: string };
  boxes?: Array<{ x: number; y: number }[]>;
  box?: { x: number; y: number }[];
  line?: { x: number; y: number }[];
}

interface QuaggaCanvas {
  ctx: { overlay: CanvasRenderingContext2D };
  dom: { overlay: HTMLCanvasElement };
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
  selector: 'app-productos',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, MonedaArsPipe],
  templateUrl: './productos.component.html',
  styleUrl: './productos.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProductosComponent implements OnInit, OnDestroy {
  private supabase = inject(SupabaseService);
  public themeService = inject(ThemeService);

  // Columnas específicas para consultas optimizadas
  private readonly COLUMNAS_PRODUCTOS = 'id, codigo, nombre, marca, talle, categoria, precio, cantidad_stock, cantidad_deposito, activo, created_at';
  private readonly COLUMNAS_PROMOCIONES = 'id, porcentaje, promocion_productos(producto_id)';

  // --- SIGNALS PARA ESTADO DEL COMPONENTE ---
  productosVisibles = signal<Producto[]>([]);
  totalRegistros = signal(0);
  
  // Búsqueda reactiva
  private _filtroInterno = signal('');
  private searchSubject = new Subject<string>();
  private searchSubscription: Subscription | null = null;

  // Getter/Setter para mantener compatibilidad con ngModel
  get filtro(): string {
    return this._filtroInterno();
  }
  set filtro(value: string) {
    this._filtroInterno.set(value);
    this.searchSubject.next(value);
  }

  // Estados de ordenamiento
  ordenPrecio = signal<'asc' | 'desc' | 'none'>('none');
  ordenStock = signal<'asc' | 'desc' | 'none'>('none');

  // Scanner
  mostrarScanner = signal(false);
  scannerActivo = signal(false);
  soportaEscaner = signal(false);
  escaneando = signal(false);
  intentosScanner = signal(0);
  errorScanner = signal('');

  // Filtros
  filtroEstado = signal<'todos' | 'activos' | 'desactivados'>('activos');
  readonly estadosFiltro: ('todos' | 'activos' | 'desactivados')[] = ['todos', 'activos', 'desactivados'];

  // Virtual Scrolling / Paginación
  readonly itemsPorPagina = 20;
  paginaActual = signal(0);
  cargando = signal(false);
  todosLosDatosCargados = signal(false);

  // Mapa de descuentos
  mapaDescuentos = signal<Map<string, number>>(new Map());

  // Computed para verificar si hay filtros activos
  hayFiltrosActivos = computed(() => 
    this.ordenPrecio() !== 'none' || this.ordenStock() !== 'none'
  );

  // Exponer Math para el template
  Math = Math;

  async ngOnInit() {
    // Configurar debounce para búsqueda
    this.searchSubscription = this.searchSubject.pipe(
      debounceTime(400),
      distinctUntilChanged()
    ).subscribe(() => {
      this.resetearVirtualScroll();
    });

    // Cargar datos iniciales
    await this.cargarPromocionesActivas();
    this.cargarMasProductos();
    this.verificarSoporteEscaner();
    await this.cargarQuagga();
  }

  ngOnDestroy(): void {
    this.detenerScanner();
    document.body.style.overflow = '';
    if (this.searchSubscription) {
      this.searchSubscription.unsubscribe();
    }
  }

  // --- LOGICA DE CARGA OPTIMIZADA ---

  async cargarMasProductos(): Promise<void> {
    if (this.cargando() || this.todosLosDatosCargados()) return;

    this.cargando.set(true);

    const from = this.paginaActual() * this.itemsPorPagina;
    const to = from + this.itemsPorPagina - 1;

    try {
      let query = this.supabase.getClient()
        .from('productos')
        .select(this.COLUMNAS_PRODUCTOS, { count: 'exact' })
        .eq('eliminado', false);

      // Aplicar filtro de texto
      const filtroTexto = this._filtroInterno().trim();
      if (filtroTexto) {
        query = query.or(`codigo.ilike.%${filtroTexto}%,nombre.ilike.%${filtroTexto}%,marca.ilike.%${filtroTexto}%,categoria.ilike.%${filtroTexto}%`);
      }

      // Filtro por estado
      const estado = this.filtroEstado();
      if (estado === 'activos') {
        query = query.eq('activo', true);
      } else if (estado === 'desactivados') {
        query = query.eq('activo', false);
      }

      // Ordenamiento
      const ordenP = this.ordenPrecio();
      const ordenS = this.ordenStock();
      
      if (ordenP !== 'none') {
        query = query.order('precio', { ascending: ordenP === 'asc' });
      } else if (ordenS !== 'none') {
        query = query.order('cantidad_stock', { ascending: ordenS === 'asc' });
      } else {
        query = query.order('created_at', { ascending: false });
      }

      const { data, error, count } = await query.range(from, to);

      if (error) throw error;

      if (data) {
        const descuentosMap = this.mapaDescuentos();
        
        // Procesar productos con promociones
        const productosProcesados = data.map((p: any) => {
          const descuento = descuentosMap.get(p.id);
          if (descuento) {
            const precioBase = p.precio || 0;
            const precioPromo = precioBase - (precioBase * (descuento / 100));
            return {
              ...p,
              tiene_promocion: true,
              precio_promocional: precioPromo,
              porcentaje_promocion: descuento,
              nombre_promocion: 'Oferta'
            };
          }
          return p;
        });

        // Actualizar productos visibles
        if (this.paginaActual() === 0) {
          this.productosVisibles.set(productosProcesados);
        } else {
          this.productosVisibles.update(productos => [...productos, ...productosProcesados]);
        }

        this.totalRegistros.set(count || 0);
        this.paginaActual.update(p => p + 1);

        // Verificar si ya se cargaron todos
        if (this.productosVisibles().length >= (count || 0)) {
          this.todosLosDatosCargados.set(true);
        }
      }

    } catch (error) {
      console.error('Error cargando productos:', error);
    } finally {
      this.cargando.set(false);
    }
  }

  onScroll(event: Event): void {
    const el = event.target as HTMLElement;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 100) {
      this.cargarMasProductos();
    }
  }

  resetearVirtualScroll(): void {
    this.paginaActual.set(0);
    this.productosVisibles.set([]);
    this.todosLosDatosCargados.set(false);
    this.cargarMasProductos();
  }

  // --- PROMOCIONES ---
  
  async cargarPromocionesActivas() {
    const hoy = new Date().toISOString();
    try {
      const { data: promociones } = await this.supabase.getClient()
        .from('promociones')
        .select(this.COLUMNAS_PROMOCIONES)
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
    } catch (error) {
      console.error('Error al cargar promociones:', error);
    }
  }

  // --- FILTROS Y ORDENAMIENTO ---
  
  cambiarFiltroEstado(estado: 'todos' | 'activos' | 'desactivados'): void {
    this.filtroEstado.set(estado);
    this.resetearVirtualScroll();
  }

  toggleOrdenPrecio() {
    this.ordenStock.set('none');
    const actual = this.ordenPrecio();
    this.ordenPrecio.set(
      actual === 'none' ? 'desc' : (actual === 'desc' ? 'asc' : 'none')
    );
    this.resetearVirtualScroll();
  }

  toggleOrdenStock() {
    this.ordenPrecio.set('none');
    const actual = this.ordenStock();
    this.ordenStock.set(
      actual === 'none' ? 'desc' : (actual === 'desc' ? 'asc' : 'none')
    );
    this.resetearVirtualScroll();
  }

  limpiarFiltros() {
    this.ordenPrecio.set('none');
    this.ordenStock.set('none');
    this._filtroInterno.set('');
    this.searchSubject.next('');
    this.resetearVirtualScroll();
  }

  // --- SCANNER DE CÓDIGOS ---
  
  verificarSoporteEscaner() {
    const soporta = 'mediaDevices' in navigator && 'getUserMedia' in navigator.mediaDevices;
    this.soportaEscaner.set(soporta);
  }

  async cargarQuagga(): Promise<void> {
    if (typeof window.Quagga === 'undefined') {
      return new Promise((resolve) => {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/quagga/0.12.1/quagga.min.js';
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => {
          this.errorScanner.set('No se pudo cargar el scanner.');
          resolve();
        };
        document.body.appendChild(script);
      });
    }
  }

  abrirScanner(): void {
    this.mostrarScanner.set(true);
    this.intentosScanner.set(0);
    this.errorScanner.set('');
    this.escaneando.set(true);
    document.body.style.overflow = 'hidden';
    setTimeout(() => this.iniciarScanner(), 500);
  }

  async iniciarScanner(): Promise<void> {
    if (typeof window.Quagga === 'undefined') {
      this.errorScanner.set('Scanner no disponible. Recargando...');
      setTimeout(() => window.location.reload(), 2000);
      return;
    }

    const container = document.querySelector('#scanner-container');
    if (!container) {
      if (this.intentosScanner() < 3) {
        this.intentosScanner.update(i => i + 1);
        setTimeout(() => this.iniciarScanner(), 300);
      } else {
        this.errorScanner.set('Error al inicializar el scanner.');
        this.cerrarScanner();
      }
      return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      this.errorScanner.set('❌ Tu navegador no soporta el acceso a la cámara.');
      this.cerrarScanner();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: { ideal: "environment" } } 
      });
      stream.getTracks().forEach(track => track.stop());
      this.inicializarQuagga();
    } catch (err: any) {
      this.errorScanner.set('❌ Error al acceder a la cámara: ' + (err.message || ''));
      this.cerrarScanner();
    }
  }

  inicializarQuagga(): void {
    const Quagga = window.Quagga;
    if (!Quagga) return;

    Quagga.init({
      inputStream: {
        name: "Live",
        type: "LiveStream",
        target: document.querySelector('#scanner-container'),
        constraints: { 
          width: { min: 640 }, 
          height: { min: 480 }, 
          facingMode: "environment", 
          aspectRatio: { min: 1, max: 2 } 
        },
      },
      locator: { patchSize: "medium", halfSample: true },
      numOfWorkers: 2,
      frequency: 5,
      decoder: {
        readers: ["ean_reader", "code_128_reader", "code_39_reader"],
        debug: { 
          drawBoundingBox: true, 
          showFrequency: false, 
          drawScanline: true, 
          showPattern: false 
        }
      },
      locate: true
    }, (err: any) => {
      if (err) {
        this.errorScanner.set('Error al iniciar Quagga: ' + err);
        this.cerrarScanner();
        return;
      }
      Quagga.start();
      this.scannerActivo.set(true);
    });

    Quagga.onDetected((data: QuaggaDetectionResult) => {
      const codigo = data.codeResult.code;
      if (navigator.vibrate) navigator.vibrate(200);
      
      this.filtro = codigo;
      this.cerrarScanner();
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
    const container = document.querySelector('#scanner-container');
    if (container) container.innerHTML = '';
  }

  cerrarScanner(): void {
    this.detenerScanner();
    this.mostrarScanner.set(false);
    this.escaneando.set(false);
    this.intentosScanner.set(0);
    this.errorScanner.set('');
    document.body.style.overflow = '';
  }

onEnterBusqueda() {
    this.resetearVirtualScroll();
  }

  // --- TRACKBY FUNCTIONS ---
  
  trackByProductoId(index: number, producto: Producto): string {
    return producto.id;
  }

  trackByEstado(index: number, estado: string): string {
    return estado;
  }

  limpiarBusqueda(): void {
  this._filtroInterno.set('');
  this.searchSubject.next('');
  this.resetearVirtualScroll();
}
}