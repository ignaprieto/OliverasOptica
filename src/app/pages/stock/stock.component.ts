import { Component, OnInit, ViewChild, ElementRef, OnDestroy } from '@angular/core';
import { Producto } from '../../models/producto.model';
import { SupabaseService } from '../../services/supabase.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { MonedaArsPipe } from '../../pipes/moneda-ars.pipe';
import { ThemeService } from '../../services/theme.service';
import JsBarcode from 'jsbarcode';
import * as XLSX from 'xlsx';
import { Subject, Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

// ==========================================
// DEFINICIÓN DE TIPOS (Para coincidir con el resto del proyecto)
// ==========================================

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

// Aquí unificamos la definición global con la que ya tienes en otros componentes
declare global {
  interface Window {
    Quagga?: QuaggaAPI;
  }
}

@Component({
  selector: 'app-stock',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, MonedaArsPipe],
  templateUrl: './stock.component.html',
})
export class StockComponent implements OnInit, OnDestroy {
  @ViewChild('barcodeCanvas', { static: false }) barcodeCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('scrollContainer', { static: false }) scrollContainer!: ElementRef<HTMLDivElement>;
  @ViewChild('scannerVideo', { static: false }) scannerVideo!: ElementRef<HTMLVideoElement>;

  // Propiedades
  productos: Producto[] = [];
  modo: 'agregar' | 'editar' = 'agregar';
  mensaje: string = '';
  error: string = '';
  
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
  mostrarToast: boolean = false;
  
  // Modales y estados
  mostrarModalEliminar = false;
  productoAEliminar: Producto | null = null;
  motivoEliminacion = '';
  
  mostrarCodigoBarras: boolean = false;
  codigoBarrasGenerado: string = '';

  // Filtros y Orden
  ordenPrecio: 'asc' | 'desc' | 'none' = 'none';
  ordenStock: 'asc' | 'desc' | 'none' = 'none';
  filtroEstado: 'todos' | 'activos' | 'desactivados' = 'activos';
  destinoProducto: 'stock' | 'deposito' = 'stock';

  // Productos Eliminados
  mostrarProductosEliminados = false;
  productosEliminados: Producto[] = [];

  // Paginación
  productosVisibles: Producto[] = [];
  itemsPorPagina = 20;
  paginaActual = 0;
  cargando = false;
  todosLosDatosCargados = false;

  // Scanner
  mostrarScanner = false;
  scannerActivo = false;
  intentosScanner = 0;
  
  // Exportación
  mostrarMenuExportar = false;

  mapaDescuentos: Map<string, number> = new Map();

  categoriasDisponibles: string[] = [];
  constructor(private supabase: SupabaseService, public themeService: ThemeService) {}

  ngOnInit(): void {
    this.searchSubscription = this.searchSubject.pipe(
      debounceTime(400),
      distinctUntilChanged()
    ).subscribe(texto => {
      this._filtro = texto;
      this.resetearVirtualScroll();
    });

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
  }

async cargarCategorias() {
  // Traemos las categorías de los últimos 200 productos cargados
  // Esto es muy rápido y suficiente para sugerir las categorías más usadas
  const { data } = await this.supabase.getClient()
    .from('productos')
    .select('categoria')
    .limit(200);

  if (data) {
    // Usamos Set para eliminar duplicados automáticamente
    const unicos = new Set(data.map((p: any) => p.categoria?.trim()).filter(Boolean));
    this.categoriasDisponibles = Array.from(unicos).sort();
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
    if (this.cargando || this.todosLosDatosCargados) return;

    this.cargando = true;
    const from = this.paginaActual * this.itemsPorPagina;
    const to = from + this.itemsPorPagina - 1;

    try {
      let query = this.supabase.getClient()
        .from('productos')
        .select('*', { count: 'exact' })
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

        if (this.paginaActual === 0) this.productosVisibles = productosProcesados;
        else this.productosVisibles = [...this.productosVisibles, ...productosProcesados];

        this.totalRegistros = count || 0;
        this.paginaActual++;

        if (this.productosVisibles.length >= this.totalRegistros) this.todosLosDatosCargados = true;
      }
    } catch (error) {
      console.error('Error cargando productos:', error);
      this.error = 'Error al cargar productos';
    } finally {
      this.cargando = false;
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
    this.productosVisibles = [];
    this.todosLosDatosCargados = false;
    this.cargarMasProductos();
  }

  // ==================== SCANNER ====================

  cargarQuagga(): void {
    if (typeof window.Quagga === 'undefined') {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/quagga/0.12.1/quagga.min.js';
      script.async = true;
      document.body.appendChild(script);
    }
  }

  abrirScanner(): void {
    this.mostrarScanner = true;
    this.intentosScanner = 0;
    this.error = '';
    setTimeout(() => this.iniciarScanner(false), 500); 
  }

  abrirScannerBusqueda(): void {
    this.mostrarScanner = true;
    this.intentosScanner = 0;
    this.error = '';
    setTimeout(() => this.iniciarScanner(true), 500); 
  }

  async iniciarScanner(esBusqueda: boolean): Promise<void> {
    const Quagga = window.Quagga;
    if (!Quagga) {
      this.error = 'Cargando scanner... intenta nuevamente.';
      return;
    }

    const container = document.querySelector('#scanner-container');
    if (!container) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' } 
      });
      stream.getTracks().forEach(t => t.stop());

      Quagga.init({
        inputStream: {
          name: "Live",
          type: "LiveStream",
          target: container,
          constraints: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: "environment"
          },
        },
        decoder: {
          readers: ["ean_reader", "ean_8_reader", "code_128_reader", "upc_reader"]
        },
        locate: true
      }, (err: any) => {
        if (err) {
          console.error(err);
          this.error = 'No se pudo acceder a la cámara.';
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
      this.error = 'Permiso de cámara denegado o no disponible.';
      console.error(err);
    }
  }

  detenerScanner(): void {
    if (this.scannerActivo && window.Quagga) {
      try { window.Quagga.stop(); } catch (e) { console.error(e); }
      this.scannerActivo = false;
    }

    const video = document.querySelector('#scanner-container video') as HTMLVideoElement;
    if (video && video.srcObject) {
      const stream = video.srcObject as MediaStream;
      const tracks = stream.getTracks();
      tracks.forEach(track => track.stop());
      video.srcObject = null;
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
    for (let i = 0; i < 12; i++) {
      sum += parseInt(codigo[i]) * (i % 2 === 0 ? 1 : 3);
    }
    const checkDigit = (10 - (sum % 10)) % 10;
    
    this.producto.codigo = codigo + checkDigit;
    this.generarImagenCodigoBarras(this.producto.codigo);
  }

  generarImagenCodigoBarras(codigo: string): void {
    if (!codigo) return;
    this.codigoBarrasGenerado = codigo;
    this.mostrarCodigoBarras = true;
    
    const esEAN13 = /^\d{13}$/.test(codigo);
    const formato = esEAN13 ? 'EAN13' : 'CODE128';

    setTimeout(() => {
      if (this.barcodeCanvas?.nativeElement) {
        try {
          JsBarcode(this.barcodeCanvas.nativeElement, codigo, {
            format: formato,
            width: 2,
            height: 80,
            displayValue: true,
            fontSize: 16,
            margin: 0
          });
        } catch (e) {
          try {
             JsBarcode(this.barcodeCanvas.nativeElement, codigo, { format: 'CODE128' });
          } catch(err) {
             this.mostrarCodigoBarras = false;
          }
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
            .page { 
                width: 210mm; 
                height: 297mm; 
                padding: 10mm; 
                box-sizing: border-box; 
                display: grid; 
                grid-template-columns: repeat(3, 1fr); 
                grid-template-rows: repeat(8, 1fr);
                gap: 2mm;
                page-break-after: always; 
            }
            .page:last-child { page-break-after: auto; }
            .etiqueta-wrapper { display: flex; justify-content: center; align-items: center; width: 100%; height: 100%; box-sizing: border-box; }
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
        <body>
          ${!imprimir ? '<div class="controls"><button class="btn" onclick="window.print()">🖨️ Imprimir</button></div>' : ''}
    `;

    for (let i = 0; i < productos.length; i += etiquetasPorPagina) {
      html += '<div class="page">';
      const lote = productos.slice(i, i + etiquetasPorPagina);
      lote.forEach((prod, idx) => {
        const uniqueId = `b-${i}-${idx}`;
        html += `
          <div class="etiqueta-wrapper">
            <div class="etiqueta">
              <div class="nombre">${prod.nombre}</div>
              <div class="meta">${prod.marca} - ${prod.talle}</div>
              <div class="precio">$${prod.precio}</div>
              <canvas id="${uniqueId}" data-code="${prod.codigo}"></canvas>
            </div>
          </div>
        `;
      });
      // Rellenar espacios para mantener el grid
      const faltantes = etiquetasPorPagina - lote.length;
      for(let j=0; j < faltantes; j++) html += '<div></div>';
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
              JsBarcode(c, code, {
                format: format,
                displayValue: true,
                fontSize: 9,
                margin: 0,
                height: 35,
                width: 1.5
              });
            } catch(e) { 
               try { JsBarcode(c, c.dataset.code, { format: "CODE128", displayValue: true, fontSize: 9, margin: 0, height: 35 }); } catch(err){}
            }
          });
          ${imprimir ? 'setTimeout(() => { window.print(); window.close(); }, 800);' : ''}
        };
      </script>
      </body></html>
    `;

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
  imprimirEtiquetasMultiples() { this.generarPDFEtiquetas(this.getProductosSeleccionados(), true); }
  
  getProductosSeleccionados() {
     return this.productosVisibles.filter(p => this.productosSeleccionados.has(p.id));
  }

  // ==================== ABM ====================

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
    this.destinoProducto = 'stock'; // <--- Importante reiniciar esto
  }

  nuevoProducto(): Producto {
    return { id: '', codigo: '', nombre: '', marca: '', talle: '', categoria: '', precio: 0, cantidad_stock: 0, cantidad_deposito: 0, activo: true };
  }

  async guardarProducto() {
     this.mensaje = ''; 
     this.error = '';

     // Validaciones básicas
     if(!this.producto.nombre?.trim() || !this.producto.precio) { 
         this.error = 'Nombre y Precio son obligatorios'; 
         return; 
     }
     if(!this.producto.codigo?.trim()) { 
         this.error = 'El código es obligatorio'; 
         return; 
     }

     // Preparamos el objeto para enviar (hacemos una copia para no afectar la vista)
     // Excluimos campos virtuales que no existen en la tabla
     const { id, tiene_promocion, porcentaje_promocion, precio_promocional, nombre_promocion, ...datosBase } = this.producto as any;
     
     // Hacemos una copia de los datos limpios para manipular
     const datosParaGuardar = { ...datosBase };

     // --- LÓGICA DE DESTINO (CORRECCIÓN) ---
     // El input del formulario siempre escribe en 'cantidad_stock'.
     // Si el usuario seleccionó 'deposito', movemos ese valor a 'cantidad_deposito' y dejamos stock en 0.
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
     // En modo editar, se respeta lo que tenga el objeto producto directo
     // ---------------------------------------

     try {
       if (this.modo === 'agregar') {
         // Validar duplicado
         const { data } = await this.supabase.getClient()
            .from('productos')
            .select('id')
            .eq('codigo', datosParaGuardar.codigo)
            .limit(1);
            
         if(data && data.length > 0) { 
            this.error = 'El código ya existe'; 
            return; 
         }
         
         const { error } = await this.supabase.getClient()
            .from('productos')
            .insert([datosParaGuardar]);
            
         if(error) throw error;
         this.mostrarMensaje(`Producto agregado a ${this.destinoProducto === 'deposito' ? 'Depósito' : 'Mostrador'}`);
       } else {
         const { error } = await this.supabase.getClient()
            .from('productos')
            .update(datosParaGuardar)
            .eq('id', id); // Usamos el ID extraído al inicio
            
         if(error) throw error;
         this.mostrarMensaje('Producto actualizado');
       }
       
       this.cancelarEdicion();
       this.resetearVirtualScroll();
     } catch(e: any) { 
        this.error = e.message || 'Error al guardar'; 
     }
  }

  async eliminarProducto(id: string) {
    const { data } = await this.supabase.getClient().from('detalle_venta').select('id').eq('producto_id', id).limit(1);
    if(data && data.length > 0) {
       this.mostrarMensaje('⚠️ No se puede eliminar: tiene ventas asociadas.');
       return;
    }
    this.productoAEliminar = this.productosVisibles.find(p => p.id === id) || null;
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
    } catch(e) { this.error = 'Error al eliminar'; }
    finally { this.mostrarModalEliminar = false; }
  }

  cancelarEliminarConMotivo() { this.mostrarModalEliminar = false; }

  async obtenerProductosEliminados() {
    const { data } = await this.supabase.getClient().from('productos').select('*').eq('eliminado', true).order('eliminado_en', {ascending: false});
    if(data) this.productosEliminados = data;
  }

  async toggleProductosEliminados() {
    this.mostrarProductosEliminados = !this.mostrarProductosEliminados;
    if(this.mostrarProductosEliminados) await this.obtenerProductosEliminados();
  }

  async restaurarProducto(p: Producto) {
    await this.supabase.getClient().from('productos').update({ 
       eliminado: false, motivo_eliminacion: null, eliminado_por: null, eliminado_en: null 
    }).eq('id', p.id);
    this.mostrarMensaje('Producto restaurado');
    await this.obtenerProductosEliminados();
    this.resetearVirtualScroll();
  }

  // ==================== EXCEL ====================
  
  descargarPlantillaImportacion() {
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
      this.cargando = true;
      const reader = new FileReader();
      reader.onload = async (e: any) => {
          try {
              const wb = XLSX.read(e.target.result, { type: 'binary' });
              const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
              await this.procesarDatosImportados(data);
          } catch(err) { this.error = 'Error lectura'; }
          finally { this.cargando = false; event.target.value = ''; }
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

      if (productosParaInsertar.length === 0) { this.error = 'Sin datos válidos'; return; }

      try {
        const { error } = await this.supabase.getClient().from('productos').upsert(productosParaInsertar, { onConflict: 'codigo' });
        if(error) throw error;
        this.mostrarMensaje(`Importados ${productosParaInsertar.length} productos`);
        this.cargando = false;
        this.resetearVirtualScroll();
      } catch(e:any) { this.error = 'Error importando: ' + e.message; }
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
     // ... (Lógica completa de exportarAExcel previa si la necesitas, o simplificada) ...
     this.ejecutarExportacion(tipo);
  }

  async ejecutarExportacion(tipo: string) {
    try {
      let query = this.supabase.getClient().from('productos').select('*').eq('eliminado', false);
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
    } catch(e) { this.error = 'Error exportando'; }
  }

  // Helpers UI
  toggleOrdenPrecio() { this.ordenStock = 'none'; this.ordenPrecio = this.ordenPrecio === 'asc' ? 'desc' : (this.ordenPrecio === 'desc' ? 'none' : 'asc'); this.resetearVirtualScroll(); }
  toggleOrdenStock() { this.ordenPrecio = 'none'; this.ordenStock = this.ordenStock === 'asc' ? 'desc' : (this.ordenStock === 'desc' ? 'none' : 'asc'); this.resetearVirtualScroll(); }
  cambiarFiltroEstado(e: any) { this.filtroEstado = e; this.resetearVirtualScroll(); }
  
  async toggleEstadoProducto(p: Producto) { 
     await this.supabase.getClient().from('productos').update({activo: !p.activo}).eq('id', p.id);
     this.resetearVirtualScroll();
  }

  toggleSeleccionMultiple() { this.modoSeleccionMultiple = !this.modoSeleccionMultiple; if(!this.modoSeleccionMultiple) this.productosSeleccionados.clear(); }
  toggleSeleccionProducto(id: string, e: Event) { e.stopPropagation(); this.productosSeleccionados.has(id) ? this.productosSeleccionados.delete(id) : this.productosSeleccionados.add(id); }
  isProductoSeleccionado(id: string) { return this.productosSeleccionados.has(id); }
  seleccionarTodos() { this.productosVisibles.forEach(p => this.productosSeleccionados.add(p.id)); }
  deseleccionarTodos() { this.productosSeleccionados.clear(); }
  
  mostrarMensaje(m: string) { this.mensaje = m; this.mostrarToast = true; setTimeout(() => this.mostrarToast = false, 3000); }
  trackByFn(index: number, item: Producto) { return item.id; }
}