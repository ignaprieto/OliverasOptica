import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../services/supabase.service';
import { Descuento } from '../../models/descuento.model';
import { Promocion, PromocionConProductos } from '../../models/promocion.model';
import { Producto } from '../../models/producto.model';
import { RouterModule } from '@angular/router';
import { ThemeService } from '../../services/theme.service';
import { MonedaArsPipe } from '../../pipes/moneda-ars.pipe';
import { Subject, Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

@Component({
  selector: 'app-descuentos',
  imports: [CommonModule, FormsModule, RouterModule, MonedaArsPipe],
  standalone: true,
  templateUrl: './descuentos.component.html',
  styleUrl: './descuentos.component.css'
})
export class DescuentosComponent implements OnInit, OnDestroy {
  // Tab activo
  tabActivo: 'descuentos' | 'promociones' = 'descuentos';
  
  // Estados de Descuentos
  descuentos: Descuento[] = [];
  descuento: Descuento = this.nuevoDescuento();
  modo: 'agregar' | 'editar' = 'agregar';
  
  // Estados de Promociones
  promociones: PromocionConProductos[] = [];
  
  // CORRECCIÓN: Inicialización directa para evitar el error "does not exist"
  promocion: Promocion = {
    nombre: '',
    descripcion: '',
    porcentaje: 0,
    fecha_inicio: new Date().toISOString().split('T')[0],
    fecha_fin: new Date(new Date().setDate(new Date().getDate() + 7)).toISOString().split('T')[0],
    activa: true
  };

  modoPromocion: 'agregar' | 'editar' = 'agregar';
  
  // --- LÓGICA DE SELECCIÓN DE PRODUCTOS (OPTIMIZADA) ---
  
  // Búsqueda Global
  busquedaProducto: string = '';
  productosBuscados: Producto[] = [];
  cargandoProductos = false;
  private searchSubject = new Subject<string>();
  private searchSubscription: Subscription | null = null;

  // Categorías y Productos (Lazy Load)
  categorias: string[] = []; 
  productosPorCategoria: { [key: string]: Producto[] } = {}; 
  cargandoCategoria: { [key: string]: boolean } = {};
  expandido: { [key: string]: boolean } = {}; // Estado visual de acordeones
  
  // Selección
  productosSeleccionados: Set<string> = new Set(); // IDs
  productosSeleccionadosData: Producto[] = []; // Para mostrar el resumen visual
  seleccionarTodaCategoria: { [key: string]: boolean } = {}; // Checkbox padre

  // UI Generales
  mensaje = '';
  error = '';
  idAEliminar: string | null = null;
  idPromocionAEliminar: string | null = null;
  toastVisible = false;
  toastMensaje = '';
  toastColor = 'bg-green-600';
  mostrarConfirmacion: boolean = false;
  mostrarConfirmacionPromocion: boolean = false;
  mostrarSelectorProductos: boolean = false;
  promocionExpandida: string | null = null;
  private toastTimeout: any;

  constructor(
    private supabase: SupabaseService,
    public themeService: ThemeService
  ) {}

  ngOnInit(): void {
    this.obtenerDescuentos();
    this.obtenerPromociones();
    this.cargarCategoriasUnicas();

    // Configurar buscador reactivo
    this.searchSubscription = this.searchSubject.pipe(
      debounceTime(400),
      distinctUntilChanged()
    ).subscribe(texto => {
      this.buscarProductosEnServidor(texto);
    });
  }

  ngOnDestroy(): void {
    if (this.toastTimeout) clearTimeout(this.toastTimeout);
    if (this.searchSubscription) this.searchSubscription.unsubscribe();
  }

  // ==================== HELPER DE CREACIÓN ====================

  // Este método se usa para resetear el formulario
  nuevaPromocion(): Promocion {
    const hoy = new Date();
    const finSemana = new Date();
    finSemana.setDate(hoy.getDate() + 7);
    return {
      nombre: '',
      descripcion: '',
      porcentaje: 0,
      fecha_inicio: hoy.toISOString().split('T')[0],
      fecha_fin: finSemana.toISOString().split('T')[0],
      activa: true
    };
  }

  nuevoDescuento(): Descuento {
    return {
      codigo: '',
      tipo: 'porcentaje',
      porcentaje: 0,
      cantidad_oferta: undefined,
      cantidad_paga: undefined,
      aplica_mas_caro: false,
      activo: true,
    };
  }

  // ==================== LÓGICA DE CATEGORÍAS (LAZY LOAD) ====================

  async cargarCategoriasUnicas() {
    try {
      const { data, error } = await this.supabase.getClient()
        .from('productos')
        .select('categoria')
        .eq('activo', true)
        .eq('eliminado', false);

      if (error) throw error;

      const categoriasUnicas = new Set((data || []).map((p: any) => p.categoria));
      this.categorias = Array.from(categoriasUnicas).sort();
    } catch (error) {
      console.error('Error cargando categorías:', error);
    }
  }

  async toggleAcordeonCategoria(categoria: string) {
    this.expandido[categoria] = !this.expandido[categoria];

    // Si expandimos y no hay datos, los cargamos
    if (this.expandido[categoria] && !this.productosPorCategoria[categoria]) {
      await this.cargarProductosDeCategoria(categoria);
    }
  }

  async cargarProductosDeCategoria(categoria: string) {
    this.cargandoCategoria[categoria] = true;
    try {
      const { data, error } = await this.supabase.getClient()
        .from('productos')
        .select('id, codigo, nombre, marca, categoria, precio, talle, cantidad_stock, cantidad_deposito')
        .eq('categoria', categoria)
        .eq('activo', true)
        .eq('eliminado', false)
        .order('nombre');

      if (error) throw error;

      this.productosPorCategoria[categoria] = (data || []) as Producto[];
      
      // Sincronizar estado visual "Seleccionar Todo"
      this.verificarEstadoCategoria(categoria);

    } catch (error) {
      console.error(`Error cargando productos de ${categoria}:`, error);
    } finally {
      this.cargandoCategoria[categoria] = false;
    }
  }

  // ==================== LÓGICA DE BÚSQUEDA GLOBAL ====================

  onSearchProducto(texto: string) {
    this.busquedaProducto = texto;
    this.searchSubject.next(texto);
  }

  async buscarProductosEnServidor(termino: string) {
    if (!termino.trim()) {
      this.productosBuscados = [];
      return;
    }

    this.cargandoProductos = true;
    try {
      const t = termino.trim();
      const { data, error } = await this.supabase.getClient()
        .from('productos')
        .select('id, codigo, nombre, marca, categoria, talle, precio, cantidad_stock, cantidad_deposito')
        .eq('activo', true)
        .eq('eliminado', false)
        .or(`nombre.ilike.%${t}%,codigo.ilike.%${t}%,marca.ilike.%${t}%,categoria.ilike.%${t}%`)
        .limit(20);

      if (error) throw error;
      
      this.productosBuscados = (data || []) as Producto[];

    } catch (error) {
      console.error('Error buscando productos:', error);
    } finally {
      this.cargandoProductos = false;
    }
  }

  // ==================== LÓGICA DE SELECCIÓN ====================

  toggleProducto(producto: Producto, categoria?: string) {
    const cat = categoria || producto.categoria;

    if (this.productosSeleccionados.has(producto.id)) {
      // Deseleccionar
      this.productosSeleccionados.delete(producto.id);
      this.productosSeleccionadosData = this.productosSeleccionadosData.filter(p => p.id !== producto.id);
      // Desmarcar el "Todos" de la categoría si corresponde
      if (cat) this.seleccionarTodaCategoria[cat] = false;
    } else {
      // Seleccionar
      this.productosSeleccionados.add(producto.id);
      this.productosSeleccionadosData.push(producto);
      // Verificar si ahora están todos seleccionados en esa categoría
      if (cat) this.verificarEstadoCategoria(cat);
    }
  }

  async toggleTodaCategoria(categoria: string) {
    // Si no están cargados los productos, hay que cargarlos primero para saber sus IDs
    if (!this.productosPorCategoria[categoria]) {
      await this.cargarProductosDeCategoria(categoria);
    }

    const nuevoEstado = !this.seleccionarTodaCategoria[categoria];
    this.seleccionarTodaCategoria[categoria] = nuevoEstado;

    const productos = this.productosPorCategoria[categoria] || [];
    
    productos.forEach(p => {
      if (nuevoEstado) {
        if (!this.productosSeleccionados.has(p.id)) {
            this.productosSeleccionados.add(p.id);
            this.productosSeleccionadosData.push(p);
        }
      } else {
        if (this.productosSeleccionados.has(p.id)) {
            this.productosSeleccionados.delete(p.id);
            this.productosSeleccionadosData = this.productosSeleccionadosData.filter(item => item.id !== p.id);
        }
      }
    });
  }

  verificarEstadoCategoria(categoria: string) {
    const productos = this.productosPorCategoria[categoria];
    if (!productos || productos.length === 0) {
        this.seleccionarTodaCategoria[categoria] = false;
        return;
    }
    const todosSeleccionados = productos.every(p => this.productosSeleccionados.has(p.id));
    this.seleccionarTodaCategoria[categoria] = todosSeleccionados;
  }

  estaSeleccionado(id: string): boolean {
    return this.productosSeleccionados.has(id);
  }

  limpiarSeleccion() {
    this.productosSeleccionados.clear();
    this.productosSeleccionadosData = [];
    this.seleccionarTodaCategoria = {};
    this.expandido = {}; 
    this.busquedaProducto = '';
    this.productosBuscados = [];
  }
  
  deseleccionarTodos() {
      this.limpiarSeleccion();
  }

  // ==================== GUARDADO Y EDICIÓN DE PROMOCIONES ====================

  async guardarPromocion() {
    if (!this.promocion.nombre.trim()) {
      this.mostrarToast('Nombre obligatorio', 'bg-red-600');
      return;
    }
    if (this.productosSeleccionados.size === 0) {
      this.mostrarToast('Selecciona al menos un producto', 'bg-red-600');
      return;
    }

    try {
      const client = this.supabase.getClient();
      const promoData = {
        nombre: this.promocion.nombre.trim(),
        descripcion: this.promocion.descripcion,
        porcentaje: this.promocion.porcentaje,
        fecha_inicio: new Date(this.promocion.fecha_inicio).toISOString(),
        fecha_fin: new Date(this.promocion.fecha_fin).toISOString(),
        activa: this.promocion.activa
      };

      let promoId = this.promocion.id;

      if (this.modoPromocion === 'agregar') {
        const { data, error } = await client.from('promociones').insert(promoData).select().single();
        if (error) throw error;
        promoId = data.id;
      } else {
        const { error } = await client.from('promociones').update(promoData).eq('id', promoId);
        if (error) throw error;
        await client.from('promocion_productos').delete().eq('promocion_id', promoId);
      }

      const relaciones = Array.from(this.productosSeleccionados).map(prodId => ({
        promocion_id: promoId,
        producto_id: prodId
      }));

      const CHUNK_SIZE = 500;
      for (let i = 0; i < relaciones.length; i += CHUNK_SIZE) {
        const chunk = relaciones.slice(i, i + CHUNK_SIZE);
        const { error: errRel } = await client.from('promocion_productos').insert(chunk);
        if (errRel) throw errRel;
      }

      this.mostrarToast('Promoción guardada correctamente', 'bg-green-600');
      this.cancelarEdicionPromocion();
      this.obtenerPromociones();

    } catch (error: any) {
      console.error(error);
      this.mostrarToast('Error al guardar: ' + error.message, 'bg-red-600');
    }
  }

  async editarPromocion(promo: PromocionConProductos) {
    this.promocion = { ...promo };
    this.modoPromocion = 'editar';
    this.promocion.fecha_inicio = new Date(promo.fecha_inicio).toISOString().split('T')[0];
    this.promocion.fecha_fin = new Date(promo.fecha_fin).toISOString().split('T')[0];

    this.limpiarSeleccion();
    
    if (promo.productos) {
        promo.productos.forEach(p => {
            this.productosSeleccionados.add(p.id);
            this.productosSeleccionadosData.push(p);
        });

        const categoriasAfectadas = new Set(promo.productos.map(p => p.categoria));
        categoriasAfectadas.forEach(cat => {
             // Opcional: aquí podríamos precargar las categorías afectadas si quisiéramos
             // pero por rendimiento lo dejamos lazy
        });
    }
    
    this.mostrarSelectorProductos = true;
  }

  cancelarEdicionPromocion() {
    this.promocion = this.nuevaPromocion();
    this.modoPromocion = 'agregar';
    this.limpiarSeleccion();
    this.mostrarSelectorProductos = false;
  }

  // ==================== GESTIÓN DE CÓDIGOS DE DESCUENTO ====================

  async obtenerDescuentos() {
    const { data, error } = await this.supabase.getClient()
      .from('descuentos')
      .select('*')
      .order('fecha_creacion', { ascending: false });
    
    if (error) {
      this.mostrarToast('Error al obtener los descuentos', 'bg-red-600');
      return;
    }
    this.descuentos = data as Descuento[];
  }

  async guardarDescuento() {
    if (!this.descuento.codigo.trim()) {
      this.mostrarToast('El código es obligatorio', 'bg-red-600');
      return;
    }

    try {
      const client = this.supabase.getClient();
      const datos = {
          codigo: this.descuento.codigo.trim().toUpperCase(),
          tipo: this.descuento.tipo,
          porcentaje: this.descuento.tipo === 'porcentaje' ? this.descuento.porcentaje : null,
          cantidad_oferta: this.descuento.tipo === 'cantidad' ? this.descuento.cantidad_oferta : null,
          cantidad_paga: this.descuento.tipo === 'cantidad' ? this.descuento.cantidad_paga : null,
          aplica_mas_caro: this.descuento.tipo === 'cantidad' ? (this.descuento.aplica_mas_caro || false) : false,
          activo: true
      };

      if (this.modo === 'agregar') {
        const { error } = await client.from('descuentos').insert(datos);
        if (error) throw error;
        this.mostrarToast('Descuento agregado', 'bg-green-600');
      } else {
        const { error } = await client.from('descuentos').update(datos).eq('id', this.descuento.id);
        if (error) throw error;
        this.mostrarToast('Descuento actualizado', 'bg-green-600');
      }

      this.descuento = this.nuevoDescuento();
      this.modo = 'agregar';
      this.obtenerDescuentos();

    } catch (error: any) {
      this.mostrarToast('Error: ' + error.message, 'bg-red-600');
    }
  }

  editarDescuento(d: Descuento) {
    this.descuento = { ...d };
    this.modo = 'editar';
  }

  cancelarEdicion() {
    this.descuento = this.nuevoDescuento();
    this.modo = 'agregar';
  }

  async cambiarEstado(desc: Descuento) {
    try {
      const { error } = await this.supabase.getClient()
        .from('descuentos')
        .update({ activo: !desc.activo })
        .eq('id', desc.id);

      if (error) throw error;
      this.mostrarToast(`Descuento ${!desc.activo ? 'activado' : 'desactivado'}`, 'bg-green-600');
      this.obtenerDescuentos();
    } catch (error) {
      this.mostrarToast('Error al cambiar estado', 'bg-red-600');
    }
  }

  eliminarDescuento(id: string) {
    this.idAEliminar = id;
    this.mostrarConfirmacion = true;
  }

  cancelarEliminar() {
    this.mostrarConfirmacion = false;
    this.idAEliminar = null;
  }

  async confirmarEliminar() {
    if (!this.idAEliminar) return;
    await this.supabase.getClient().from('descuentos').delete().eq('id', this.idAEliminar);
    this.mostrarConfirmacion = false;
    this.obtenerDescuentos();
  }

  // ==================== CARGA DE PROMOCIONES (LISTA) ====================

  async obtenerPromociones() {
    try {
      const { data, error } = await this.supabase.getClient()
        .from('promociones')
        .select(`
          *,
          promocion_productos (
            producto_id,
            productos ( id, codigo, nombre, marca, categoria, precio )
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      this.promociones = (data || []).map((promo: any) => {
        const productosPlanos = promo.promocion_productos?.map((pp: any) => pp.productos) || [];
        return {
          ...promo,
          cantidad_productos: productosPlanos.length,
          productos: productosPlanos
        };
      });

    } catch (error) {
      console.error('Error al obtener promociones:', error);
      this.mostrarToast('Error al cargar promociones', 'bg-red-600');
    }
  }

  // --- UTILS & UI ---

  mostrarToast(mensaje: string, color: string = 'bg-green-600') {
    this.toastMensaje = mensaje;
    this.toastColor = color;
    this.toastVisible = true;
    if (this.toastTimeout) clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => { this.cerrarToast(); }, 3000);
  }
  
  cerrarToast() { this.toastVisible = false; }

  toggleExpansion(id: string) {
    this.promocionExpandida = this.promocionExpandida === id ? null : id;
  }
  
  eliminarPromocion(id: string) {
    this.idPromocionAEliminar = id;
    this.mostrarConfirmacionPromocion = true;
  }
  
  cancelarEliminarPromocion() {
    this.mostrarConfirmacionPromocion = false;
    this.idPromocionAEliminar = null;
  }
  
  async confirmarEliminarPromocion() {
    if(!this.idPromocionAEliminar) return;
    await this.supabase.getClient().from('promociones').delete().eq('id', this.idPromocionAEliminar);
    this.mostrarToast('Promoción eliminada', 'bg-red-600');
    this.mostrarConfirmacionPromocion = false;
    this.obtenerPromociones();
  }

  async cambiarEstadoPromocion(promo: PromocionConProductos) {
    await this.supabase.getClient().from('promociones').update({ activa: !promo.activa }).eq('id', promo.id);
    this.obtenerPromociones();
  }

  esPromocionActiva(promo: PromocionConProductos): boolean {
    if (!promo.activa) return false;
    const now = new Date();
    return new Date(promo.fecha_inicio) <= now && new Date(promo.fecha_fin) >= now;
  }
  
  getEstadoPromocion(promo: PromocionConProductos): string {
    if (!promo.activa) return 'pausada';
    const now = new Date();
    const inicio = new Date(promo.fecha_inicio);
    const fin = new Date(promo.fecha_fin);
    if (now < inicio) return 'programada';
    if (now > fin) return 'finalizada';
    return 'en_curso';
  }
}