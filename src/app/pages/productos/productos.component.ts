import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
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
  styleUrl: './productos.component.css'
})
export class ProductosComponent implements OnInit, OnDestroy {
  // Datos principales
  productosVisibles: Producto[] = []; // Lista que se muestra en el HTML
  Math = Math;

  // Búsqueda Reactiva
  private _filtro: string = '';
  private searchSubject = new Subject<string>();
  private searchSubscription: Subscription | null = null;
  totalRegistros: number = 0;

  get filtro(): string {
    return this._filtro;
  }
  set filtro(value: string) {
    // Al escribir, enviamos al pipe de RxJS para el debounce
    this.searchSubject.next(value); 
  }

  // Estados de ordenamiento
  ordenPrecio: 'asc' | 'desc' | 'none' = 'none';
  ordenStock: 'asc' | 'desc' | 'none' = 'none';

  // Scanner
  mostrarScanner: boolean = false;
  scannerActivo: boolean = false;
  soportaEscaner: boolean = false;
  escaneando: boolean = false;
  intentosScanner: number = 0;
  errorScanner: string = '';

  // Filtros
  filtroEstado: 'todos' | 'activos' | 'desactivados' = 'activos';
  estadosFiltro: ('todos' | 'activos' | 'desactivados')[] = ['todos', 'activos', 'desactivados'];

  // Virtual Scrolling / Paginación Servidor
  itemsPorPagina = 20;
  paginaActual = 0;
  cargando = false;
  todosLosDatosCargados = false;

  // Mapa de descuentos: ID Producto -> Porcentaje
  mapaDescuentos: Map<string, number> = new Map();

  constructor(private supabase: SupabaseService, public themeService: ThemeService) {}

  async ngOnInit() {
    // 1. Configurar el debounce para la búsqueda
    this.searchSubscription = this.searchSubject.pipe(
      debounceTime(400), // Espera 400ms
      distinctUntilChanged() // Solo si cambia el valor
    ).subscribe(texto => {
      this._filtro = texto;
      this.resetearVirtualScroll();
    });

    // 2. Cargar datos iniciales
    await this.cargarPromocionesActivas();
    this.cargarMasProductos(); // Carga inicial
    this.verificarSoporteEscaner();
    this.cargarQuagga();
  }

  ngOnDestroy(): void {
    this.detenerScanner();
    document.body.style.overflow = '';
    if (this.searchSubscription) {
      this.searchSubscription.unsubscribe();
    }
  }

  // --- LOGICA SERVIDOR (Server-Side) ---

  async cargarMasProductos(): Promise<void> {
    if (this.cargando || this.todosLosDatosCargados) return;

    this.cargando = true;

    // 1. Calcular rango
    const from = this.paginaActual * this.itemsPorPagina;
    const to = from + this.itemsPorPagina - 1;

    try {
      let query = this.supabase.getClient()
        .from('productos')
        .select('*', { count: 'exact' })
        .eq('eliminado', false);

      // 2. Aplicar Filtros de Texto
      if (this._filtro && this._filtro.trim() !== '') {
        const termino = this._filtro.trim();
        // Busca en codigo, nombre, marca o categoria
        query = query.or(`codigo.ilike.%${termino}%,nombre.ilike.%${termino}%,marca.ilike.%${termino}%,categoria.ilike.%${termino}%`);
      }

      // 3. Filtro por Estado
      if (this.filtroEstado === 'activos') {
        query = query.eq('activo', true);
      } else if (this.filtroEstado === 'desactivados') {
        query = query.eq('activo', false);
      }

      // 4. Ordenamiento
      if (this.ordenPrecio !== 'none') {
        query = query.order('precio', { ascending: this.ordenPrecio === 'asc' });
      } else if (this.ordenStock !== 'none') {
        query = query.order('cantidad_stock', { ascending: this.ordenStock === 'asc' });
      } else {
        // Orden por defecto
        query = query.order('created_at', { ascending: false });
      }

      // 5. Ejecutar consulta
      const { data, error, count } = await query.range(from, to);

      if (error) throw error;

      if (data) {
        // 6. Procesar promociones
        const productosProcesados = data.map((p: any) => {
          const descuento = this.mapaDescuentos.get(p.id);
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

        // 7. Actualizar lista visible
        if (this.paginaActual === 0) {
          this.productosVisibles = productosProcesados;
        } else {
          this.productosVisibles = [...this.productosVisibles, ...productosProcesados];
        }

        this.totalRegistros = count || 0;
        this.paginaActual++;

        if (this.productosVisibles.length >= this.totalRegistros) {
          this.todosLosDatosCargados = true;
        }
      }

    } catch (error) {
      console.error('Error cargando productos:', error);
    } finally {
      this.cargando = false;
    }
  }

  onScroll(event: Event): void {
    const el = event.target as HTMLElement;
    // Si estamos cerca del final del scroll, cargamos más
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 100) {
      this.cargarMasProductos();
    }
  }

  resetearVirtualScroll(): void {
    this.paginaActual = 0;
    this.productosVisibles = [];
    this.todosLosDatosCargados = false;
    this.cargarMasProductos();
  }

  // --- MANEJO DE PROMOS ---
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
    } catch (error) {
      console.error('Error al cargar promociones:', error);
    }
  }

  // --- UTILS DE ORDENAMIENTO Y FILTRO ---
  
  cambiarFiltroEstado(estado: 'todos' | 'activos' | 'desactivados'): void {
    this.filtroEstado = estado;
    this.resetearVirtualScroll();
  }

  toggleOrdenPrecio() {
    this.ordenStock = 'none';
    this.ordenPrecio = this.ordenPrecio === 'none' ? 'desc' : (this.ordenPrecio === 'desc' ? 'asc' : 'none');
    this.resetearVirtualScroll();
  }

  toggleOrdenStock() {
    this.ordenPrecio = 'none';
    this.ordenStock = this.ordenStock === 'none' ? 'desc' : (this.ordenStock === 'desc' ? 'asc' : 'none');
    this.resetearVirtualScroll();
  }

  limpiarFiltros() {
    this.ordenPrecio = 'none';
    this.ordenStock = 'none';
    this._filtro = ''; // Limpia la variable visual
    this.searchSubject.next(''); // Limpia la búsqueda lógica
    this.resetearVirtualScroll();
  }

  // --- LÓGICA SCANNER ---
  verificarSoporteEscaner() {
    this.soportaEscaner = 'mediaDevices' in navigator && 'getUserMedia' in navigator.mediaDevices;
  }

  cargarQuagga(): void {
    if (typeof window.Quagga === 'undefined') {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/quagga/0.12.1/quagga.min.js';
      script.async = true;
      script.onerror = () => {
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
    document.body.style.overflow = 'hidden';
    setTimeout(() => this.iniciarScanner(), 500);
  }

  async iniciarScanner(): Promise<void> {
    if (typeof window.Quagga === 'undefined') {
      this.errorScanner = 'Scanner no disponible. Recargando...';
      setTimeout(() => window.location.reload(), 2000);
      return;
    }

    const container = document.querySelector('#scanner-container');
    if (!container) {
      if (this.intentosScanner < 3) {
        this.intentosScanner++;
        setTimeout(() => this.iniciarScanner(), 300);
      } else {
        this.errorScanner = 'Error al inicializar el scanner.';
        this.cerrarScanner();
      }
      return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      this.errorScanner = '❌ Tu navegador no soporta el acceso a la cámara.';
      this.cerrarScanner();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } } });
      stream.getTracks().forEach(track => track.stop());
      this.inicializarQuagga();
    } catch (err: any) {
      this.errorScanner = '❌ Error al acceder a la cámara: ' + (err.message || '');
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
        constraints: { width: { min: 640 }, height: { min: 480 }, facingMode: "environment", aspectRatio: { min: 1, max: 2 } },
      },
      locator: { patchSize: "medium", halfSample: true },
      numOfWorkers: 2, // Reducido para mejor performance móvil
      frequency: 5,
      decoder: {
        readers: ["ean_reader", "code_128_reader", "code_39_reader"],
        debug: { drawBoundingBox: true, showFrequency: false, drawScanline: true, showPattern: false }
      },
      locate: true
    }, (err: any) => {
      if (err) {
        this.errorScanner = 'Error al iniciar Quagga: ' + err;
        this.cerrarScanner();
        return;
      }
      Quagga.start();
      this.scannerActivo = true;
    });

    Quagga.onDetected((data: QuaggaDetectionResult) => {
      const codigo = data.codeResult.code;
      if (navigator.vibrate) navigator.vibrate(200);
      
      // Actualiza el filtro, lo que dispara el Subject y la búsqueda en servidor
      this.filtro = codigo; 
      this.cerrarScanner();
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
    document.body.style.overflow = ''; 
  }
}