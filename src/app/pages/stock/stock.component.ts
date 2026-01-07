import { Component, OnInit, ViewChild, ElementRef, OnDestroy, ChangeDetectionStrategy, signal, WritableSignal } from '@angular/core';
import { Producto } from '../../models/producto.model';
import { SupabaseService } from '../../services/supabase.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { MonedaArsPipe } from '../../pipes/moneda-ars.pipe';
import { ThemeService } from '../../services/theme.service';
import { Subject, Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { PermisosService } from '../../services/permisos.service';
import { PermisoDirective } from '../../directives/permiso.directive';

// === INTERFACES LOCALES (No se exportan globalmente para evitar conflictos) ===
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
  locator?: { patchSize: string; halfSample: boolean; };
  numOfWorkers?: number;
  frequency?: number;
  decoder: {
    readers: string[];
    debug?: { drawBoundingBox: boolean; showFrequency: boolean; drawScanline: boolean; showPattern: boolean; };
  };
  locate?: boolean;
}

interface QuaggaDetectionResult {
  codeResult: { code: string; };
  boxes?: Array<{ x: number; y: number }[]>;
  box?: { x: number; y: number }[];
  line?: { x: number; y: number }[];
}

interface QuaggaAPI {
  init(config: QuaggaConfig, callback: (error: Error | null) => void): void;
  start(): void;
  stop(): void;
  onDetected(callback: (data: QuaggaDetectionResult) => void): void;
}

@Component({
  selector: 'app-stock',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, MonedaArsPipe, PermisoDirective],
  templateUrl: './stock.component.html',
  styleUrls: ['./stock.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class StockComponent implements OnInit, OnDestroy {
  @ViewChild('barcodeCanvas', { static: false }) barcodeCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('scrollContainer', { static: false }) scrollContainer!: ElementRef<HTMLDivElement>;
  @ViewChild('scannerVideo', { static: false }) scannerVideo!: ElementRef<HTMLVideoElement>;

  // === SIGNALS (Estado Reactivo) ===
  productosVisibles: WritableSignal<Producto[]> = signal([]);
  cargando: WritableSignal<boolean> = signal(false);
  mensaje: WritableSignal<string> = signal('');
  error: WritableSignal<string> = signal('');
  categoriasDisponibles: WritableSignal<string[]> = signal([]);
  productosEliminados: WritableSignal<Producto[]> = signal([]);
 mostrarToast: WritableSignal<boolean> = signal(false);
tipoMensajeToast: WritableSignal<'success' | 'error' | 'warning'> = signal('success');
mensajeToast: WritableSignal<string> = signal('');

  // === CONSTANTES ===
  private readonly COLUMNAS_PRODUCTO = 'id, codigo, nombre, marca, talle, categoria, precio, cantidad_stock, cantidad_deposito, activo, eliminado, motivo_eliminacion, eliminado_por, eliminado_en';

  // === PROPIEDADES ===
  modo: 'agregar' | 'editar' = 'agregar';
  
  // Selección múltiple
  productosSeleccionados: Set<string> = new Set();
  modoSeleccionMultiple = false;

  // Buscador
  private _filtro: string = '';
  private searchSubject = new Subject<string>();
  private searchSubscription: Subscription | null = null;
  totalRegistros: number = 0;

  get filtro(): string { return this._filtro; }
  set filtro(value: string) { this.searchSubject.next(value); }

  producto: Producto = this.nuevoProducto();
  
  // UI States
  mostrarModalEliminar = false;
  productoAEliminar: Producto | null = null;
  motivoEliminacion = '';
  mostrarCodigoBarras: boolean = false;
  codigoBarrasGenerado: string = '';
  mostrarScanner = false;
  scannerActivo = false;
  mostrarMenuExportar = false;

  // Filtros y Orden
  ordenPrecio: 'asc' | 'desc' | 'none' = 'none';
  ordenStock: 'asc' | 'desc' | 'none' = 'none';
  filtroEstado: 'todos' | 'activos' | 'desactivados' = 'activos';
  destinoProducto: 'stock' | 'deposito' = 'stock';

  // Productos Eliminados
  mostrarProductosEliminados = false;

  // Paginación
  itemsPorPagina = 20;
  paginaActual = 0;
  todosLosDatosCargados = false;

  mapaDescuentos: Map<string, number> = new Map();

// ==================== PRESUPUESTOS ====================

mostrarModalPresupuesto = signal(false);
isGuardando = signal(false);
presupuestoActual = signal<{
  cliente: { nombre: string; direccion: string; ciudad: string; telefono: string };
  productos: Array<{ producto: Producto; cantidad: number; precioUnitario: number; total: number }>;
  metodoPago: string;
  codigoDescuento: string;
  porcentajeDescuento: number;
  subtotal: number;
  descuentoAplicado: number;
  total: number;
}>({
  cliente: { nombre: '', direccion: '', ciudad: '', telefono: '' },
  productos: [],
  metodoPago: 'efectivo',
  codigoDescuento: '',
  porcentajeDescuento: 0,
  subtotal: 0,
  descuentoAplicado: 0,
  total: 0
});

productosCarrito = signal<Array<{ producto: Producto; cantidad: number }>>([]);
busquedaProductoPresupuesto = signal('');
productosEncontrados = signal<Producto[]>([]);
cargandoBusquedaPresupuesto = signal(false);
configRecibo = signal<any>(null);
descuentosDisponibles = signal<any[]>([]);
private busquedaPresupuestoSubject = new Subject<string>();
private busquedaPresupuestoSubscription: Subscription | null = null;
  constructor(
    private supabase: SupabaseService, 
    public themeService: ThemeService, 
    private permisos: PermisosService 
  ) {}

  ngOnInit(): void {
    // Inicializar permisos
    this.permisos.cargarPermisos();

    // Buscador con debounce
    this.searchSubscription = this.searchSubject.pipe(
      debounceTime(400),
      distinctUntilChanged()
    ).subscribe(texto => {
      this._filtro = texto;
      this.resetearVirtualScroll();
    });

    this.busquedaPresupuestoSubscription = this.busquedaPresupuestoSubject.pipe(
  debounceTime(300),
  distinctUntilChanged()
).subscribe(termino => {
  this.buscarProductoPresupuestoReal(termino);
});
    // Carga inicial
    this.cargarPromocionesActivas().then(() => {
      this.cargarMasProductos();
      this.cargarQuagga();
      this.cargarCategorias();
    });
  }

  ngOnDestroy(): void {
    this.detenerScanner();
    if (this.searchSubscription) {
      this.searchSubscription.unsubscribe();
    }

    if (this.busquedaPresupuestoSubscription) {
  this.busquedaPresupuestoSubscription.unsubscribe();
}
  }

  // ==================== CARGA DE DATOS ====================

  async cargarCategorias() {
    const { data } = await this.supabase.getClient()
      .from('productos')
      .select('categoria')
      .limit(200);

    if (data) {
      const unicos = new Set(data.map((p: any) => p.categoria?.trim()).filter(Boolean));
      this.categoriasDisponibles.set(Array.from(unicos).sort());
    }
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
    } catch (e) { console.error("Error cargando promociones", e); }
  }

  async cargarMasProductos(): Promise<void> {
    if (this.cargando() || this.todosLosDatosCargados) return;

    this.cargando.set(true);
    const from = this.paginaActual * this.itemsPorPagina;
    const to = from + this.itemsPorPagina - 1;

    try {
      let query = this.supabase.getClient()
        .from('productos')
        .select(this.COLUMNAS_PRODUCTO, { count: 'exact' })
        .eq('eliminado', false);

      if (this._filtro && this._filtro.trim() !== '') {
        const termino = this._filtro.trim();
        query = query.or(`codigo.ilike.%${termino}%,nombre.ilike.%${termino}%,marca.ilike.%${termino}%,categoria.ilike.%${termino}%`);
      }

      if (this.filtroEstado === 'activos') query = query.eq('activo', true);
      else if (this.filtroEstado === 'desactivados') query = query.eq('activo', false);

      if (this.ordenPrecio !== 'none') query = query.order('precio', { ascending: this.ordenPrecio === 'asc' });
      else if (this.ordenStock !== 'none') query = query.order('cantidad_stock', { ascending: this.ordenStock === 'asc' });
      else query = query.order('created_at', { ascending: false });

      const { data, error, count } = await query.range(from, to);

      if (error) throw error;

      if (data) {
        const productosProcesados = data.map((p: any) => {
          const descuento = this.mapaDescuentos.get(p.id);
          if (descuento) {
            return { ...p, tiene_promocion: true, precio_promocional: p.precio - (p.precio * (descuento / 100)), porcentaje_promocion: descuento };
          }
          return p;
        });

        this.productosVisibles.update(actuales => 
          this.paginaActual === 0 ? productosProcesados : [...actuales, ...productosProcesados]
        );

        this.totalRegistros = count || 0;
        this.paginaActual++;

        if (this.productosVisibles().length >= this.totalRegistros) this.todosLosDatosCargados = true;
      }
    } catch (error) {
      console.error('Error cargando productos:', error);
      this.mostrarError('Error al cargar productos');
    } finally {
      this.cargando.set(false);
    }
  }

  onScroll(event: Event): void {
    const element = event.target as HTMLElement;
    if (element.scrollHeight - element.scrollTop - element.clientHeight < 100) {
      this.cargarMasProductos();
    }
  }

  resetearVirtualScroll(): void {
    this.paginaActual = 0;
    this.productosVisibles.set([]);
    this.todosLosDatosCargados = false;
    this.cargarMasProductos();
  }

  // ==================== SCANNER ====================

  cargarQuagga(): void {
    if (typeof (window as any).Quagga === 'undefined') {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/quagga/0.12.1/quagga.min.js';
      script.async = true;
      document.body.appendChild(script);
    }
  }

  abrirScanner(): void {
    this.mostrarScanner = true;
    this.error.set('');
    setTimeout(() => this.iniciarScanner(false), 500); 
  }

  abrirScannerBusqueda(): void {
    this.mostrarScanner = true;
    this.error.set('');
    setTimeout(() => this.iniciarScanner(true), 500); 
  }

  async iniciarScanner(esBusqueda: boolean): Promise<void> {
    // Usamos cast 'as any' para evitar el conflicto de tipos global
    const Quagga = (window as any).Quagga as QuaggaAPI;
    
    if (!Quagga) {
      this.mostrarError('Cargando scanner... intenta nuevamente.');
      return;
    }

    const container = document.querySelector('#scanner-container');
    if (!container) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      stream.getTracks().forEach(t => t.stop()); // Liberar test

      Quagga.init({
        inputStream: {
          name: "Live",
          type: "LiveStream",
          target: container,
          constraints: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "environment" },
        },
        decoder: { readers: ["ean_reader", "ean_8_reader", "code_128_reader", "upc_reader"] },
        locate: true
      }, (err: any) => {
        if (err) {
          console.error(err);
          this.mostrarError('No se pudo acceder a la cámara.');
          return;
        }
        Quagga.start();
        this.scannerActivo = true;
      });

      Quagga.onDetected((data: any) => {
        const codigo = data.codeResult.code;
        if (navigator.vibrate) navigator.vibrate(200);

        if (esBusqueda) {
          this.filtro = codigo;
        } else {
          this.producto.codigo = codigo;
        }
        
        this.mostrarMensaje(`✅ Código detectado: ${codigo}`);
        this.cerrarScanner();
      });

    } catch (err) {
      this.mostrarError('Permiso de cámara denegado o no disponible.');
    }
  }

  detenerScanner(): void {
    const Quagga = (window as any).Quagga as QuaggaAPI;
    if (this.scannerActivo && Quagga) {
      try { Quagga.stop(); } catch (e) { console.error(e); }
      this.scannerActivo = false;
    }
    const container = document.querySelector('#scanner-container');
    if (container) container.innerHTML = ''; 
  }

  cerrarScanner(): void {
    this.detenerScanner();
    this.mostrarScanner = false;
  }

  // ==================== CÓDIGO DE BARRAS & PDF ====================

  generarCodigoBarras(): void {
    const timestamp = Date.now().toString();
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    const codigo = (timestamp.slice(-9) + random).slice(0, 12);
    
    let sum = 0;
    for (let i = 0; i < 12; i++) sum += parseInt(codigo[i]) * (i % 2 === 0 ? 1 : 3);
    const checkDigit = (10 - (sum % 10)) % 10;
    
    this.producto.codigo = codigo + checkDigit;
    this.generarImagenCodigoBarras(this.producto.codigo);
  }

  async generarImagenCodigoBarras(codigo: string): Promise<void> {
    if (!codigo) return;
    this.codigoBarrasGenerado = codigo;
    this.mostrarCodigoBarras = true;
    
    const { default: JsBarcode } = await import('jsbarcode');
    const esEAN13 = /^\d{13}$/.test(codigo);
    const formato = esEAN13 ? 'EAN13' : 'CODE128';

    setTimeout(() => {
      if (this.barcodeCanvas?.nativeElement) {
        try {
          JsBarcode(this.barcodeCanvas.nativeElement, codigo, {
            format: formato, width: 2, height: 80, displayValue: true, fontSize: 16, margin: 0
          });
        } catch (e) {
          try { JsBarcode(this.barcodeCanvas.nativeElement, codigo, { format: 'CODE128' }); } 
          catch(err) { this.mostrarCodigoBarras = false; }
        }
      }
    }, 100);
  }

  generarPDFEtiquetas(productos: Producto[], imprimir: boolean): void {
    const ventana = window.open('', '_blank');
    if (!ventana) return;

    const etiquetasPorPagina = 24; 
    let html = `
      <html>
        <head>
          <title>Etiquetas</title>
          <style>
            @page { size: A4; margin: 0; }
            body { margin: 0; font-family: sans-serif; background: #fff; }
            .page { width: 210mm; height: 297mm; padding: 10mm; box-sizing: border-box; display: grid; grid-template-columns: repeat(3, 1fr); grid-template-rows: repeat(8, 1fr); gap: 2mm; page-break-after: always; }
            .page:last-child { page-break-after: auto; }
            .etiqueta-wrapper { display: flex; justify-content: center; align-items: center; width: 100%; height: 100%; }
            .etiqueta { border: 1px dashed #ccc; border-radius: 4px; width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 2mm; overflow: hidden; }
            .nombre { font-size: 10px; font-weight: bold; text-align: center; max-height: 12px; overflow: hidden; width: 100%; white-space: nowrap; text-overflow: ellipsis; }
            .meta { font-size: 8px; color: #555; margin: 1mm 0; }
            .precio { font-size: 14px; font-weight: 900; margin-bottom: 1mm; }
            canvas { max-width: 95%; height: 35px; object-fit: contain; }
            .controls { position: fixed; top: 10px; right: 10px; background: white; padding: 10px; border: 1px solid #ccc; box-shadow: 0 4px 6px rgba(0,0,0,0.1); border-radius: 8px; }
            .btn { background: #3b82f6; color: white; border: none; padding: 8px 16px; border-radius: 4px; font-weight: bold; cursor: pointer; }
            @media print { .controls { display: none; } }
          </style>
          <script src="https://cdnjs.cloudflare.com/ajax/libs/jsbarcode/3.11.5/JsBarcode.all.min.js"></script>
        </head>
        <body>${!imprimir ? '<div class="controls"><button class="btn" onclick="window.print()">🖨️ Imprimir</button></div>' : ''}`;

    for (let i = 0; i < productos.length; i += etiquetasPorPagina) {
      html += '<div class="page">';
      const lote = productos.slice(i, i + etiquetasPorPagina);
      lote.forEach((prod, idx) => {
        html += `
          <div class="etiqueta-wrapper">
            <div class="etiqueta">
              <div class="nombre">${prod.nombre}</div>
              <div class="meta">${prod.marca} - ${prod.talle}</div>
              <div class="precio">$${prod.precio}</div>
              <canvas id="b-${i}-${idx}" data-code="${prod.codigo}"></canvas>
            </div>
          </div>`;
      });
      // Rellenar espacios vacíos
      for(let j=0; j < (etiquetasPorPagina - lote.length); j++) html += '<div></div>';
      html += '</div>';
    }

    html += `
      <script>
        window.onload = function() {
          const canvases = document.querySelectorAll('canvas');
          canvases.forEach(c => {
            try {
              const code = c.dataset.code;
              const format = /^\\d{13}$/.test(code) ? "EAN13" : "CODE128";
              JsBarcode(c, code, { format: format, displayValue: true, fontSize: 9, margin: 0, height: 35, width: 1.5 });
            } catch(e) { 
               try { JsBarcode(c, c.dataset.code, { format: "CODE128", displayValue: true, fontSize: 9, margin: 0, height: 35 }); } catch(err){}
            }
          });
          ${imprimir ? 'setTimeout(() => { window.print(); window.close(); }, 800);' : ''}
        };
      </script></body></html>`;

    ventana.document.write(html);
    ventana.document.close();
  }

  descargarCodigoBarras() {
     if (!this.barcodeCanvas?.nativeElement) return;
     const link = document.createElement('a');
     link.download = `codigo-${this.producto.codigo}.png`;
     link.href = this.barcodeCanvas.nativeElement.toDataURL('image/png');
     link.click();
  }

  imprimirCodigoBarras() {
     if (!this.barcodeCanvas?.nativeElement) return;
     const win = window.open('', '_blank');
     if(win) {
        win.document.write(`<html><body style="display:flex;justify-content:center;align-items:center;height:100vh;margin:0"><img src="${this.barcodeCanvas.nativeElement.toDataURL()}" onload="window.print();window.close()"/></body></html>`);
        win.document.close();
     }
  }

  descargarEtiquetasMultiples() { this.generarPDFEtiquetas(this.getProductosSeleccionados(), false); }
  
  getProductosSeleccionados(): Producto[] {
    return this.productosVisibles().filter((p: Producto) => this.productosSeleccionados.has(p.id));
  }

  // ==================== ABM (ALTAS, BAJAS, MODIFICACIONES) ====================

  cambiarModo(m: 'agregar' | 'editar') { 
    this.modo = m; 
    if(m==='agregar') this.producto = this.nuevoProducto(); 
  }
  
  seleccionarProducto(p: Producto) { 
    this.producto = {...p}; 
    this.modo = 'editar'; 
    if(p.codigo) this.generarImagenCodigoBarras(p.codigo);
    if(window.innerWidth < 1024) window.scrollTo({top:0, behavior:'smooth'});
  }

  cancelarEdicion() {
    this.producto = this.nuevoProducto();
    this.modo = 'agregar';
    this.mostrarCodigoBarras = false;
    this.destinoProducto = 'stock';
  }

  nuevoProducto(): Producto {
    return { id: '', codigo: '', nombre: '', marca: '', talle: '', categoria: '', precio: 0, cantidad_stock: 0, cantidad_deposito: 0, activo: true };
  }

  async guardarProducto() {
     this.mensaje.set(''); 
     this.error.set('');

     const accion = this.modo === 'agregar' ? 'crear' : 'editar';
    
     // Validación de seguridad manual en TS (Private service access)
     if (!this.permisos.puede('stock', accion)) {
       this.mostrarError(`⛔ No tienes permiso para ${accion} productos.`);
       return;
     }

     if(!this.producto.nombre?.trim() || !this.producto.precio) { 
         this.mostrarError('Nombre y Precio son obligatorios'); 
         return; 
     }
     if(!this.producto.codigo?.trim()) { 
         this.mostrarError('El código es obligatorio'); 
         return; 
     }

     const { id, tiene_promocion, porcentaje_promocion, precio_promocional, ...datosBase } = this.producto as any;
     const datosParaGuardar = { ...datosBase };

     const cantidadIngresada = Number(this.producto.cantidad_stock || 0);
     if (this.modo === 'agregar') {
        if (this.destinoProducto === 'deposito') {
           datosParaGuardar.cantidad_stock = 0;
           datosParaGuardar.cantidad_deposito = cantidadIngresada;
        } else {
           datosParaGuardar.cantidad_stock = cantidadIngresada;
           datosParaGuardar.cantidad_deposito = 0;
        }
     }

     try {
       if (this.modo === 'agregar') {
         const { data } = await this.supabase.getClient().from('productos').select('id').eq('codigo', datosParaGuardar.codigo).limit(1);
         if(data && data.length > 0) { 
            this.mostrarError('El código ya existe'); 
            return; 
         }
         
         const { error } = await this.supabase.getClient().from('productos').insert([datosParaGuardar]);
         if(error) throw error;
         this.mostrarMensaje(`Producto agregado a ${this.destinoProducto === 'deposito' ? 'Depósito' : 'Mostrador'}`);
       } else {
         const { error } = await this.supabase.getClient().from('productos').update(datosParaGuardar).eq('id', id);
         if(error) throw error;
         this.mostrarMensaje('Producto actualizado');
       }
       
       this.cancelarEdicion();
       this.resetearVirtualScroll();
     } catch(e: any) { 
        this.mostrarError(e.message || 'Error al guardar'); 
     }
  }

  async eliminarProducto(id: string) {
    if (!this.permisos.puede('stock', 'eliminar')) {
      this.mostrarError('⛔ No tienes permiso para eliminar productos.');
      return;
    }
    const { data } = await this.supabase.getClient().from('detalle_venta').select('id').eq('producto_id', id).limit(1);
    if(data && data.length > 0) {
       this.mostrarError('⚠️ No se puede eliminar: tiene ventas asociadas.');
       return;
    }
    
    this.productoAEliminar = this.productosVisibles().find((p: Producto) => p.id === id) || null;
    this.mostrarModalEliminar = true;
    this.motivoEliminacion = '';
  }

  async confirmarEliminar() {
    if (!this.productoAEliminar || !this.motivoEliminacion.trim()) return;
    try {
       const user = await this.supabase.getCurrentUserName();
       const { error } = await this.supabase.getClient().from('productos').update({ 
          eliminado: true, 
          motivo_eliminacion: this.motivoEliminacion, 
          eliminado_por: user, 
          eliminado_en: new Date().toISOString() 
       }).eq('id', this.productoAEliminar.id);
       
       if(error) throw error;
       this.mostrarMensaje('Producto enviado a papelera');
       this.cancelarEdicion();
       this.resetearVirtualScroll();
    } catch(e) { this.mostrarError('Error al eliminar'); }
    finally { this.mostrarModalEliminar = false; }
  }

  cancelarEliminarConMotivo() { this.mostrarModalEliminar = false; }

  async obtenerProductosEliminados() {
    const { data } = await this.supabase.getClient()
      .from('productos')
      .select(this.COLUMNAS_PRODUCTO)
      .eq('eliminado', true)
      .order('eliminado_en', {ascending: false});
    if(data) this.productosEliminados.set(data);
  }

  async toggleProductosEliminados() {
    this.mostrarProductosEliminados = !this.mostrarProductosEliminados;
    if(this.mostrarProductosEliminados) await this.obtenerProductosEliminados();
  }

  async restaurarProducto(p: Producto) {
    if (!this.permisos.puede('stock', 'editar')) {
      this.mostrarError('⛔ No tienes permiso para restaurar productos.');
      return;
    }
    
    await this.supabase.getClient().from('productos').update({ 
      eliminado: false, motivo_eliminacion: null, eliminado_por: null, eliminado_en: null 
    }).eq('id', p.id);
    
    this.mostrarMensaje('Producto restaurado');
    await this.obtenerProductosEliminados();
    this.resetearVirtualScroll();
  }

  // ==================== EXCEL ====================
  
  async descargarPlantillaImportacion() {
    const XLSX = await import('xlsx');
    const headers = [{ codigo: 'ABC001', nombre: 'Ej: Producto', marca: 'Marca', talle: 'U', categoria: 'Gral', precio: 100, stock_mostrador: 10, stock_deposito: 5 }];
    const ws = XLSX.utils.json_to_sheet(headers);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Plantilla');
    XLSX.writeFile(wb, 'plantilla.xlsx');
  }
  
  triggerInputFile() { document.getElementById('inputImportar')?.click(); }
  
  async onFileSelected(event: any) {
    const target: DataTransfer = <DataTransfer>(event.target);
    if (target.files.length !== 1) return;
    this.cargando.set(true);
    
    const XLSX = await import('xlsx');
    const reader = new FileReader();
    reader.onload = async (e: any) => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'binary' });
        const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
        await this.procesarDatosImportados(data);
      } catch(err) { this.mostrarError('Error lectura archivo'); }
      finally { this.cargando.set(false); event.target.value = ''; }
    };
    reader.readAsBinaryString(target.files[0]);
  }

  async procesarDatosImportados(datos: any[]) {
      const productosParaInsertar: any[] = [];
      const codigosExcel = new Set<string>();
      let generados = 0;

      for (let i = 0; i < datos.length; i++) {
        const row = datos[i];
        let codigo = row['codigo'] || row['Codigo'] || row['CÓDIGO'];
        
        if (!codigo) { codigo = this.generarCodigoAutomaticoParaLote(i); generados++; }
        else codigo = String(codigo).trim();

        if (codigosExcel.has(codigo)) { if(generados) codigo = this.generarCodigoAutomaticoParaLote(i + 5000); else continue; }
        codigosExcel.add(codigo);

        productosParaInsertar.push({
          codigo,
          nombre: String(row['nombre']||'').trim(),
          marca: String(row['marca']||'').trim(),
          talle: String(row['talle']||'').trim(),
          categoria: String(row['categoria']||'').trim(),
          precio: Number(row['precio']||0),
          cantidad_stock: Number(row['stock_mostrador']||0),
          cantidad_deposito: Number(row['stock_deposito']||0),
          activo: true
        });
      }

      if (productosParaInsertar.length === 0) { this.mostrarError('Sin datos válidos'); return; }

      try {
        const { error } = await this.supabase.getClient().from('productos').upsert(productosParaInsertar, { onConflict: 'codigo' });
        if(error) throw error;
        this.mostrarMensaje(`Importados ${productosParaInsertar.length} productos`);
        this.resetearVirtualScroll();
      } catch(e:any) { this.mostrarError('Error importando: ' + e.message); }
  }

  private generarCodigoAutomaticoParaLote(indice: number): string {
    const base = Date.now() + indice; 
    const codigoBase = (base.toString().slice(-9) + Math.floor(Math.random()*1000).toString().padStart(3,'0')).slice(0,12);
    let sum = 0;
    for (let i = 0; i < 12; i++) sum += parseInt(codigoBase[i]) * (i % 2 === 0 ? 1 : 3);
    return codigoBase + ((10 - (sum % 10)) % 10);
  }
  
  exportarAExcel(tipo: 'todos' | 'mostrador' | 'deposito') { 
     this.mostrarMenuExportar = false;
     this.mostrarMensaje('Exportando...');
     this.ejecutarExportacion(tipo);
  }

  async ejecutarExportacion(tipo: string) {
    try {
      const XLSX = await import('xlsx');
      let query = this.supabase.getClient().from('productos').select(this.COLUMNAS_PRODUCTO).eq('eliminado', false);
      
      if (this._filtro) {
         const t = this._filtro.trim();
         query = query.or(`codigo.ilike.%${t}%,nombre.ilike.%${t}%,marca.ilike.%${t}%`);
      }
      if(tipo === 'mostrador') query = query.gt('cantidad_stock', 0);
      if(tipo === 'deposito') query = query.gt('cantidad_deposito', 0);
      
      const { data } = await query;
      if(data) {
         const ws = XLSX.utils.json_to_sheet(data);
         const wb = XLSX.utils.book_new();
         XLSX.utils.book_append_sheet(wb, ws, 'Productos');
         XLSX.writeFile(wb, `Stock_${tipo}.xlsx`);
      }
    } catch(e) { this.mostrarError('Error exportando'); }
  }

  // Helpers UI
  toggleOrdenPrecio() { this.ordenStock = 'none'; this.ordenPrecio = this.ordenPrecio === 'asc' ? 'desc' : (this.ordenPrecio === 'desc' ? 'none' : 'asc'); this.resetearVirtualScroll(); }
  toggleOrdenStock() { this.ordenPrecio = 'none'; this.ordenStock = this.ordenStock === 'asc' ? 'desc' : (this.ordenStock === 'desc' ? 'none' : 'asc'); this.resetearVirtualScroll(); }
  cambiarFiltroEstado(e: any) { this.filtroEstado = e; this.resetearVirtualScroll(); }
  
  async toggleEstadoProducto(p: Producto) { 
    if (!this.permisos.puede('stock', 'editar')) {
      this.mostrarError('⛔ No tienes permiso para editar el estado.');
      return;
    }
    await this.supabase.getClient().from('productos').update({activo: !p.activo}).eq('id', p.id);
    this.resetearVirtualScroll();
  }

  toggleSeleccionMultiple() { this.modoSeleccionMultiple = !this.modoSeleccionMultiple; if(!this.modoSeleccionMultiple) this.productosSeleccionados.clear(); }
  toggleSeleccionProducto(id: string, e: Event) { e.stopPropagation(); this.productosSeleccionados.has(id) ? this.productosSeleccionados.delete(id) : this.productosSeleccionados.add(id); }
  isProductoSeleccionado(id: string) { return this.productosSeleccionados.has(id); }
  
  seleccionarTodos() { 
    this.productosVisibles().forEach((p: Producto) => this.productosSeleccionados.add(p.id)); 
  }
  deseleccionarTodos() { this.productosSeleccionados.clear(); }
  
  mostrarMensaje(m: string, tipo: 'success' | 'warning' = 'success') { 
  this.mensajeToast.set(m);
  this.tipoMensajeToast.set(tipo);
  this.mostrarToast.set(true); 
  setTimeout(() => this.mostrarToast.set(false), 3000); 
}

mostrarError(m: string) {
  this.mensajeToast.set(m);
  this.tipoMensajeToast.set('error');
  this.mostrarToast.set(true);
  setTimeout(() => this.mostrarToast.set(false), 4000);
}

isToastVisible(): boolean {
  return this.mostrarToast();
}

  trackByFn(index: number, item: Producto): string {
    return item.id;
  }

  busquedaInmediata() {
    this.resetearVirtualScroll();
  }

  abrirModalPresupuesto() {
  this.mostrarModalPresupuesto.set(true);
  this.cargarConfigRecibo();
  this.cargarDescuentosActivos();
  this.resetearPresupuesto();
}

cerrarModalPresupuesto() {
  this.mostrarModalPresupuesto.set(false);
  this.resetearPresupuesto();
}

resetearPresupuesto() {
  this.presupuestoActual.set({
    cliente: { nombre: '', direccion: '', ciudad: '', telefono: '' },
    productos: [],
    metodoPago: 'efectivo',
    codigoDescuento: '',
    porcentajeDescuento: 0,
    subtotal: 0,
    descuentoAplicado: 0,
    total: 0
  });
  this.productosCarrito.set([]);
  this.busquedaProductoPresupuesto.set('');
  this.productosEncontrados.set([]);
}

async cargarConfigRecibo() {
  try {
    const { data, error } = await this.supabase.getClient()
      .from('configuracion_recibo')
      .select('logo_url, nombre_negocio, direccion, ciudad, telefono1, telefono2, whatsapp1, whatsapp2, email_empresa')
      .single();
    
    if (!error && data) {
      this.configRecibo.set(data);
    }
  } catch (error) {
    console.error('Error cargando config recibo:', error);
  }
}

async cargarDescuentosActivos() {
  try {
    const { data, error } = await this.supabase.getClient()
      .from('descuentos')
      .select('*')
      .eq('activo', true);
    
    if (!error && data) {
      this.descuentosDisponibles.set(data);
    }
  } catch (error) {
    console.error('Error cargando descuentos:', error);
  }
}

buscarProductoPresupuesto(termino: string) {
  this.busquedaProductoPresupuesto.set(termino);
  
  if (!termino.trim()) {
    this.productosEncontrados.set([]);
    this.cargandoBusquedaPresupuesto.set(false);
    return;
  }

  this.cargandoBusquedaPresupuesto.set(true);
  this.busquedaPresupuestoSubject.next(termino);
}

async buscarProductoPresupuestoReal(termino: string) {
  if (!termino.trim()) {
    this.productosEncontrados.set([]);
    this.cargandoBusquedaPresupuesto.set(false);
    return;
  }

  try {
    const t = termino.trim();
    const { data, error } = await this.supabase.getClient()
      .from('productos')
      .select('id, codigo, nombre, marca, talle, categoria, precio, cantidad_stock, cantidad_deposito, activo')
      .eq('activo', true)
      .eq('eliminado', false)
      .or(`nombre.ilike.%${t}%,codigo.ilike.%${t}%,marca.ilike.%${t}%`)
      .limit(10);

    if (error) throw error;
    
    if (data) {
      // Procesar productos con promociones
      const productosProcesados = data.map((p: any) => {
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

      // Si es un código exacto y hay solo un resultado, agregarlo automáticamente
      if (productosProcesados.length === 1 && productosProcesados[0].codigo?.toLowerCase() === t.toLowerCase()) {
        this.agregarAlCarrito(productosProcesados[0] as Producto);
        this.busquedaProductoPresupuesto.set('');
        this.productosEncontrados.set([]);
      } else {
        this.productosEncontrados.set(productosProcesados as Producto[]);
      }
    }
  } catch (error) {
    console.error('Error buscando productos:', error);
  } finally {
    this.cargandoBusquedaPresupuesto.set(false);
  }
}

abrirScannerPresupuesto(): void {
  this.mostrarScanner = true;
  this.error.set('');
  setTimeout(() => this.iniciarScannerPresupuesto(), 500);
}

async iniciarScannerPresupuesto(): Promise<void> {
  const Quagga = (window as any).Quagga as QuaggaAPI;
  
  if (!Quagga) {
    this.mostrarError('Cargando scanner... intenta nuevamente.');
    return;
  }

  const container = document.querySelector('#scanner-container');
  if (!container) return;

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    stream.getTracks().forEach(t => t.stop());

    Quagga.init({
      inputStream: {
        name: "Live",
        type: "LiveStream",
        target: container,
        constraints: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "environment" },
      },
      decoder: { readers: ["ean_reader", "ean_8_reader", "code_128_reader", "upc_reader"] },
      locate: true
    }, (err: any) => {
      if (err) {
        console.error(err);
        this.mostrarError('No se pudo acceder a la cámara.');
        return;
      }
      Quagga.start();
      this.scannerActivo = true;
    });

    Quagga.onDetected(async (data: any) => {
      const codigo = data.codeResult.code;
      if (navigator.vibrate) navigator.vibrate(200);

      // Buscar el producto por código
      this.busquedaProductoPresupuesto.set(codigo);
      await this.buscarProductoPresupuesto(codigo);
      
      this.mostrarMensaje(`✅ Código detectado: ${codigo}`);
      this.cerrarScanner();
    });

  } catch (err) {
    this.mostrarError('Permiso de cámara denegado o no disponible.');
  }
}

// Función para detectar scanner USB (lectura automática)
onBusquedaPresupuestoKeydown(event: KeyboardEvent) {
  // Enter: buscar o agregar producto si hay coincidencia exacta
  if (event.key === 'Enter') {
    event.preventDefault();
    const termino = this.busquedaProductoPresupuesto().trim();
    if (termino) {
      this.buscarProductoPresupuesto(termino);
    }
  }
}

// Reemplaza agregarAlCarrito para mejor performance:
agregarAlCarrito(producto: Producto) {
  const carrito = [...this.productosCarrito()];
  const indice = carrito.findIndex(item => item.producto.id === producto.id);
  
  if (indice !== -1) {
    carrito[indice] = { ...carrito[indice], cantidad: carrito[indice].cantidad + 1 };
  } else {
    carrito.push({ producto, cantidad: 1 });
  }
  
  this.productosCarrito.set(carrito);
  this.calcularTotalesPresupuesto();
  this.busquedaProductoPresupuesto.set('');
  this.productosEncontrados.set([]);
}

// Reemplaza eliminarDelCarrito:
eliminarDelCarrito(productoId: string) {
  this.productosCarrito.set(
    this.productosCarrito().filter(item => item.producto.id !== productoId)
  );
  this.calcularTotalesPresupuesto();
}

// Reemplaza actualizarCantidadCarrito:
actualizarCantidadCarrito(productoId: string, cantidad: number) {
  if (cantidad <= 0) {
    this.eliminarDelCarrito(productoId);
    return;
  }
  
  const carrito = this.productosCarrito().map(item => 
    item.producto.id === productoId ? { ...item, cantidad } : item
  );
  
  this.productosCarrito.set(carrito);
  this.calcularTotalesPresupuesto();
}

aplicarCodigoDescuento() {
  const codigo = this.presupuestoActual().codigoDescuento.trim().toUpperCase();
  if (!codigo) return;

  const descuento = this.descuentosDisponibles().find(d => d.codigo === codigo && d.activo);
  
  if (descuento && descuento.tipo === 'porcentaje') {
    this.presupuestoActual.update(p => ({
      ...p,
      porcentajeDescuento: descuento.porcentaje
    }));
    this.calcularTotalesPresupuesto();
    this.mostrarMensaje('Código aplicado correctamente', 'success');
  } else {
    this.mostrarError('Código inválido o descuento no disponible');
    this.presupuestoActual.update(p => ({
      ...p,
      codigoDescuento: '',
      porcentajeDescuento: 0
    }));
  }
}

calcularTotalesPresupuesto() {
  const carrito = this.productosCarrito();
  const productos = carrito.map(item => ({
    producto: item.producto,
    cantidad: item.cantidad,
    precioUnitario: item.producto.precio_promocional || item.producto.precio,
    total: (item.producto.precio_promocional || item.producto.precio) * item.cantidad
  }));

  const subtotal = productos.reduce((sum, p) => sum + p.total, 0);
  const porcentajeDesc = this.presupuestoActual().porcentajeDescuento;
  const descuentoAplicado = (subtotal * porcentajeDesc) / 100;
  const total = subtotal - descuentoAplicado;

  this.presupuestoActual.update(p => ({
    ...p,
    productos,
    subtotal,
    descuentoAplicado,
    total
  }));
}

async generarPDFPresupuesto() {
  const presupuesto = this.presupuestoActual();
  const config = this.configRecibo();
  
  if (!presupuesto.cliente.nombre.trim()) {
    this.mostrarError('Ingresa el nombre del cliente');
    return;
  }
  
  if (presupuesto.productos.length === 0) {
    this.mostrarError('Agrega productos al presupuesto');
    return;
  }

  try {
    this.isGuardando.set(true);
    
    const { default: jsPDF } = await import('jspdf');
    const doc = new jsPDF();
    
    const pageWidth = doc.internal.pageSize.width;
    let yPos = 20;

    // === ENCABEZADO ===
    if (config?.logo_url) {
      try {
        doc.addImage(config.logo_url, 'PNG', 15, yPos, 35, 18);
      } catch (e) {
        console.warn('No se pudo cargar el logo');
      }
    }

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(config?.nombre_negocio || 'EMPRESA', config?.logo_url ? 55 : 15, yPos + 2);
    
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(config?.direccion || '', config?.logo_url ? 55 : 15, yPos + 8);
    doc.text(config?.ciudad || '', config?.logo_url ? 55 : 15, yPos + 12);
    doc.text(`Tel: ${config?.telefono1 || ''}${config?.telefono2 ? ' / ' + config.telefono2 : ''}`, config?.logo_url ? 55 : 15, yPos + 16);
    if (config?.email_empresa) {
      doc.text(config.email_empresa, config?.logo_url ? 55 : 15, yPos + 20);
    }

    // X CON ESTÉTICA EN NEGRO (alineada más a la derecha y arriba)
    const xPosBox = pageWidth - 95;
    const yPosBox = yPos - 5;
    const anchoBox = 14;
    const altoBox = 20;
    
    // Cuadro rectangular vertical con sombra sutil (línea fina)
    doc.setFillColor(245, 245, 245);
    doc.rect(xPosBox + 1, yPosBox + 1, anchoBox, altoBox, 'F');
    
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.5);
    doc.rect(xPosBox, yPosBox, anchoBox, altoBox, 'S');
    
    // X en negro adaptada al rectángulo vertical (líneas muy finas)
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(1);
    doc.line(xPosBox + 3, yPosBox + 3, xPosBox + anchoBox - 3, yPosBox + altoBox - 3);
    doc.line(xPosBox + anchoBox - 3, yPosBox + 3, xPosBox + 3, yPosBox + altoBox - 3);
    
    // Texto debajo en negro
    doc.setFontSize(6);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text('DOCUMENTO NO VÁLIDO', xPosBox + (anchoBox / 2), yPosBox + altoBox + 4, { align: 'center' });
    doc.text('COMO FACTURA', xPosBox + (anchoBox / 2), yPosBox + altoBox + 7, { align: 'center' });

    // PRESUPUESTO (derecha)
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(59, 130, 246);
    doc.text('PRESUPUESTO', pageWidth - 15, yPos + 2, { align: 'right' });
    
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(`Fecha: ${new Date().toLocaleDateString('es-AR')}`, pageWidth - 15, yPos + 10, { align: 'right' });
    doc.text(`N° ${Date.now().toString().slice(-8)}`, pageWidth - 15, yPos + 14, { align: 'right' });

    yPos += 32;

    doc.setDrawColor(59, 130, 246);
    doc.setLineWidth(0.8);
    doc.line(15, yPos, pageWidth - 15, yPos);
    yPos += 10;

    // === DATOS DEL CLIENTE Y PAGO ===
    // Cliente (izquierda)
    doc.setFillColor(248, 250, 252);
    doc.rect(15, yPos, (pageWidth - 35) / 2, 28, 'F');
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(59, 130, 246);
    doc.text('CLIENTE', 18, yPos + 5);
    
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(presupuesto.cliente.nombre, 18, yPos + 11);
    if (presupuesto.cliente.direccion) {
      doc.text(presupuesto.cliente.direccion, 18, yPos + 15);
    }
    if (presupuesto.cliente.ciudad) {
      doc.text(presupuesto.cliente.ciudad, 18, yPos + 19);
    }
    if (presupuesto.cliente.telefono) {
      doc.text(`Tel: ${presupuesto.cliente.telefono}`, 18, yPos + 23);
    }

    // Método de pago y descuento (derecha) - CORREGIDO
    const xPosDerecha = (pageWidth / 2) + 5;
    doc.setFillColor(248, 250, 252);
    doc.rect(xPosDerecha, yPos, (pageWidth - 35) / 2, 28, 'F');
    
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(59, 130, 246);
    doc.text('MÉTODO DE PAGO', xPosDerecha + 3, yPos + 5);
    
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(presupuesto.metodoPago.toUpperCase(), xPosDerecha + 3, yPos + 11);
    
    if (presupuesto.codigoDescuento) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(59, 130, 246);
      doc.text('DESCUENTO', xPosDerecha + 3, yPos + 17);
      doc.setTextColor(220, 38, 38);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text(`${presupuesto.codigoDescuento} (-${presupuesto.porcentajeDescuento}%)`, xPosDerecha + 3, yPos + 22);
      doc.setTextColor(0, 0, 0);
    }

    yPos += 36;

    // === TABLA DE PRODUCTOS ===
    doc.setFillColor(59, 130, 246);
    doc.rect(15, yPos, pageWidth - 30, 7, 'F');
    
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text('DESCRIPCIÓN', 18, yPos + 4.5);
    doc.text('CANT.', pageWidth - 90, yPos + 4.5, { align: 'center' });
    doc.text('P. UNIT.', pageWidth - 60, yPos + 4.5, { align: 'right' });
    doc.text('TOTAL', pageWidth - 18, yPos + 4.5, { align: 'right' });

    doc.setTextColor(0, 0, 0);
    yPos += 10;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    
    presupuesto.productos.forEach((item, index) => {
      if (yPos > 250) {
        doc.addPage();
        yPos = 20;
      }

      if (index % 2 === 0) {
        doc.setFillColor(249, 250, 251);
        doc.rect(15, yPos - 3, pageWidth - 30, 6, 'F');
      }

      doc.text(item.producto.nombre, 18, yPos);
      doc.text(`${item.cantidad}`, pageWidth - 90, yPos, { align: 'center' });
      doc.text(`$${item.precioUnitario.toFixed(2)}`, pageWidth - 60, yPos, { align: 'right' });
      doc.text(`$${item.total.toFixed(2)}`, pageWidth - 18, yPos, { align: 'right' });
      
      yPos += 6;
    });

    yPos += 5;

    // === TOTALES ===
    doc.setDrawColor(229, 231, 235);
    doc.setLineWidth(0.3);
    doc.line(pageWidth - 85, yPos, pageWidth - 15, yPos);

    yPos += 6;
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text('Subtotal:', pageWidth - 80, yPos);
    doc.setFont('helvetica', 'bold');
    doc.text(`$${presupuesto.subtotal.toFixed(2)}`, pageWidth - 18, yPos, { align: 'right' });

    if (presupuesto.descuentoAplicado > 0) {
      yPos += 6;
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(220, 38, 38);
      doc.text(`Descuento (${presupuesto.porcentajeDescuento}%):`, pageWidth - 80, yPos);
      doc.text(`-$${presupuesto.descuentoAplicado.toFixed(2)}`, pageWidth - 18, yPos, { align: 'right' });
      doc.setTextColor(0, 0, 0);
    }

    yPos += 8;
    doc.setFillColor(59, 130, 246);
    doc.rect(pageWidth - 85, yPos - 4, 70, 8, 'F');
    
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text('TOTAL:', pageWidth - 80, yPos);
    doc.text(`$${presupuesto.total.toFixed(2)}`, pageWidth - 18, yPos, { align: 'right' });
    
    doc.setTextColor(0, 0, 0);

    // === PIE DE PÁGINA ===
    yPos = doc.internal.pageSize.height - 20;
    doc.setDrawColor(59, 130, 246);
    doc.setLineWidth(0.5);
    doc.line(15, yPos, pageWidth - 15, yPos);

    yPos += 5;
    doc.setFontSize(7);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(100, 100, 100);
    doc.text('Presupuesto válido por 15 días desde la fecha de emisión', pageWidth / 2, yPos, { align: 'center' });
    
    yPos += 4;
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text(`WhatsApp: ${config?.whatsapp1 || ''}${config?.whatsapp2 ? ' / ' + config.whatsapp2 : ''}`, pageWidth / 2, yPos, { align: 'center' });

    const pdfBlob = doc.output('blob');
    const pdfUrl = URL.createObjectURL(pdfBlob);
    window.open(pdfUrl, '_blank');

    this.mostrarMensaje('Presupuesto generado correctamente', 'success');
    
  } catch (error) {
    console.error('Error generando PDF:', error);
    this.mostrarError('Error al generar el presupuesto');
  } finally {
    this.isGuardando.set(false);
  }
}

eliminarDescuento() {
  this.presupuestoActual.update(p => ({
    ...p,
    codigoDescuento: '',
    porcentajeDescuento: 0
  }));
  this.calcularTotalesPresupuesto();
  this.mostrarMensaje('Descuento eliminado', 'success');
}

cerrarDropdownProductos() {
  this.productosEncontrados.set([]);
}
}