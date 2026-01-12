import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy, signal, computed, inject, ChangeDetectionStrategy } from '@angular/core';
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
import { PermisoDirective } from '../../directives/permiso.directive';

@Component({
  selector: 'app-descuentos',
  imports: [CommonModule, FormsModule, RouterModule, MonedaArsPipe, PermisoDirective],
  standalone: true,
  templateUrl: './descuentos.component.html',
  styleUrl: './descuentos.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DescuentosComponent implements OnInit, OnDestroy {
  private supabase = inject(SupabaseService);
  public themeService = inject(ThemeService);

  // Columnas específicas para consultas optimizadas
  private readonly COLUMNAS_DESCUENTOS = '*';
  private readonly COLUMNAS_PRODUCTOS = 'id, codigo, nombre, marca, categoria, precio, talle, cantidad_stock';
 private readonly COLUMNAS_PROMOCIONES = `
  *,
  promocion_productos (
    producto_id,
    productos ( id, codigo, nombre, marca, categoria, precio, talle )
  )
`;
  
  // --- SIGNALS PARA ESTADO DEL COMPONENTE ---
  tabActivo = signal<'descuentos' | 'promociones'>('descuentos');
  
  descuentos = signal<Descuento[]>([]);
  promociones = signal<PromocionConProductos[]>([]);
  productosBuscados = signal<Producto[]>([]);
  
  cargandoProductos = signal(false);
  isGuardando = signal(false);

  // Estados de formularios (para ngModel)
  private _descuento = signal<Descuento>(this.nuevoDescuento());
  private _modo = signal<'agregar' | 'editar'>('agregar');
  
  get descuento(): Descuento {
    return this._descuento();
  }
  set descuento(value: Descuento) {
    this._descuento.set(value);
  }

  get modo(): 'agregar' | 'editar' {
    return this._modo();
  }
  set modo(value: 'agregar' | 'editar') {
    this._modo.set(value);
  }
  
  private _promocion = signal<Promocion>(this.nuevaPromocion());
  private _modoPromocion = signal<'agregar' | 'editar'>('agregar');

  get promocion(): Promocion {
    return this._promocion();
  }
  set promocion(value: Promocion) {
    this._promocion.set(value);
  }

  get modoPromocion(): 'agregar' | 'editar' {
    return this._modoPromocion();
  }
  set modoPromocion(value: 'agregar' | 'editar') {
    this._modoPromocion.set(value);
  }
  
  // Búsqueda
  private _busquedaProducto = signal('');
  private searchSubject = new Subject<string>();
  private searchSubscription: Subscription | null = null;

  get busquedaProducto(): string {
    return this._busquedaProducto();
  }
  set busquedaProducto(value: string) {
    this._busquedaProducto.set(value);
  }

  // Categorías (Lazy Load)
  categorias = signal<string[]>([]);
  productosPorCategoria = signal<{ [key: string]: Producto[] }>({});
  cargandoCategoria = signal<{ [key: string]: boolean }>({});
  expandido = signal<{ [key: string]: boolean }>({});
  
  // Selección
  productosSeleccionados = signal<Set<string>>(new Set());
  productosSeleccionadosData = signal<Producto[]>([]);
  seleccionarTodaCategoria = signal<{ [key: string]: boolean }>({});

  // UI
  idAEliminar = signal<string | null>(null);
  idPromocionAEliminar = signal<string | null>(null);
  
  isToastVisible = signal(false);
mensajeToast = signal('');
tipoMensajeToast = signal<'success' | 'error' | 'warning'>('success');
  
  mostrarConfirmacion = signal(false);
  mostrarConfirmacionPromocion = signal(false);
  mostrarSelectorProductos = signal(false);
  promocionExpandida = signal<string | null>(null);
  
  private toastTimeout: any;

  // Computed signals
  cantidadProductosSeleccionados = computed(() => this.productosSeleccionados().size);

  ngOnInit(): void {
    this.obtenerDescuentos();
    this.obtenerPromociones();
    this.cargarCategoriasUnicas();

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

  // --- TRACKBY FUNCTIONS ---
  trackById(index: number, item: any): string {
    return item.id;
  }

  trackByCategoria(index: number, categoria: string): string {
    return categoria;
  }

  trackByProductoId(index: number, producto: Producto): string {
    return producto.id;
  }

  // ==================== HELPERS ====================

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

  // ==================== CATEGORÍAS ====================

  async cargarCategoriasUnicas() {
    try {
      const { data, error } = await this.supabase.getClient()
        .from('productos')
        .select('categoria')
        .eq('activo', true)
        .eq('eliminado', false);

      if (error) throw error;

      const categoriasUnicas = new Set((data || []).map((p: any) => p.categoria));
      this.categorias.set(Array.from(categoriasUnicas).sort());
    } catch (error) {
      console.error('Error cargando categorías:', error);
    }
  }

  async toggleAcordeonCategoria(categoria: string) {
    this.expandido.update(exp => ({
      ...exp,
      [categoria]: !exp[categoria]
    }));

    const expandidoActual = this.expandido();
    const productosActuales = this.productosPorCategoria();
    
    if (expandidoActual[categoria] && !productosActuales[categoria]) {
      await this.cargarProductosDeCategoria(categoria);
    }
  }

  async cargarProductosDeCategoria(categoria: string) {
    this.cargandoCategoria.update(cargando => ({
      ...cargando,
      [categoria]: true
    }));

    try {
      const { data, error } = await this.supabase.getClient()
        .from('productos')
        .select(this.COLUMNAS_PRODUCTOS)
        .eq('categoria', categoria)
        .eq('activo', true)
        .eq('eliminado', false)
        .order('nombre');

      if (error) throw error;

      this.productosPorCategoria.update(prods => ({
        ...prods,
        [categoria]: (data || []) as Producto[]
      }));
      
      this.verificarEstadoCategoria(categoria);

    } catch (error) {
      console.error(`Error cargando productos de ${categoria}:`, error);
    } finally {
      this.cargandoCategoria.update(cargando => ({
        ...cargando,
        [categoria]: false
      }));
    }
  }

  // ==================== BÚSQUEDA ====================

  onSearchProducto(texto: string) {
    this.busquedaProducto = texto;
    this.searchSubject.next(texto);
  }

  async buscarProductosEnServidor(termino: string) {
    if (!termino.trim()) {
      this.productosBuscados.set([]);
      return;
    }

    this.cargandoProductos.set(true);
    try {
      const t = termino.trim();
      const { data, error } = await this.supabase.getClient()
        .from('productos')
        .select(this.COLUMNAS_PRODUCTOS)
        .eq('activo', true)
        .eq('eliminado', false)
        .or(`nombre.ilike.%${t}%,codigo.ilike.%${t}%,marca.ilike.%${t}%,categoria.ilike.%${t}%`)
        .limit(20);

      if (error) throw error;
      
      this.productosBuscados.set((data || []) as Producto[]);
    } catch (error) {
      console.error('Error buscando productos:', error);
    } finally {
      this.cargandoProductos.set(false);
    }
  }

  // ==================== SELECCIÓN ====================

  toggleProducto(producto: Producto, categoria?: string) {
    const cat = categoria || producto.categoria;
    const seleccionados = new Set(this.productosSeleccionados());
    let productosData = [...this.productosSeleccionadosData()];

    if (seleccionados.has(producto.id)) {
      seleccionados.delete(producto.id);
      productosData = productosData.filter(p => p.id !== producto.id);
      
      if (cat) {
        this.seleccionarTodaCategoria.update(sel => ({
          ...sel,
          [cat]: false
        }));
      }
    } else {
      seleccionados.add(producto.id);
      productosData.push(producto);
      
      if (cat) {
        this.verificarEstadoCategoria(cat);
      }
    }

    this.productosSeleccionados.set(seleccionados);
    this.productosSeleccionadosData.set(productosData);
  }

  async toggleTodaCategoria(categoria: string) {
    const productosActuales = this.productosPorCategoria();
    
    if (!productosActuales[categoria]) {
      await this.cargarProductosDeCategoria(categoria);
    }

    const seleccionActual = this.seleccionarTodaCategoria();
    const nuevoEstado = !seleccionActual[categoria];
    
    this.seleccionarTodaCategoria.update(sel => ({
      ...sel,
      [categoria]: nuevoEstado
    }));

    const productos = this.productosPorCategoria()[categoria] || [];
    const seleccionados = new Set(this.productosSeleccionados());
    let productosData = [...this.productosSeleccionadosData()];
    
    productos.forEach(p => {
      if (nuevoEstado) {
        if (!seleccionados.has(p.id)) {
          seleccionados.add(p.id);
          productosData.push(p);
        }
      } else {
        if (seleccionados.has(p.id)) {
          seleccionados.delete(p.id);
          productosData = productosData.filter(item => item.id !== p.id);
        }
      }
    });

    this.productosSeleccionados.set(seleccionados);
    this.productosSeleccionadosData.set(productosData);
  }

  verificarEstadoCategoria(categoria: string) {
    const productos = this.productosPorCategoria()[categoria];
    if (!productos || productos.length === 0) {
      this.seleccionarTodaCategoria.update(sel => ({
        ...sel,
        [categoria]: false
      }));
      return;
    }
    
    const seleccionados = this.productosSeleccionados();
    const todosSeleccionados = productos.every(p => seleccionados.has(p.id));
    
    this.seleccionarTodaCategoria.update(sel => ({
      ...sel,
      [categoria]: todosSeleccionados
    }));
  }

  estaSeleccionado(id: string): boolean {
    return this.productosSeleccionados().has(id);
  }

  limpiarSeleccion() {
    this.productosSeleccionados.set(new Set());
    this.productosSeleccionadosData.set([]);
    this.seleccionarTodaCategoria.set({});
    this.expandido.set({});
    this.busquedaProducto = '';
    this.productosBuscados.set([]);
  }
  
  deseleccionarTodos() {
    this.limpiarSeleccion();
  }

  // ==================== PROMOCIONES ====================

  async guardarPromocion() {
    const promo = this.promocion;
    
    if (!promo.nombre.trim()) {
      this.mostrarToast('Nombre obligatorio', 'error');
      return;
    }
    if (this.productosSeleccionados().size === 0) {
      this.mostrarToast('Selecciona al menos un producto', 'error');
      return;
    }

    this.isGuardando.set(true);

    try {
      const client = this.supabase.getClient();
      const promoData = {
        nombre: promo.nombre.trim(),
        descripcion: promo.descripcion,
        porcentaje: promo.porcentaje,
        fecha_inicio: new Date(promo.fecha_inicio).toISOString(),
        fecha_fin: new Date(promo.fecha_fin).toISOString(),
        activa: promo.activa
      };

      let promoId = promo.id;

      if (this.modoPromocion === 'agregar') {
        const { data, error } = await client.from('promociones').insert(promoData).select().single();
        if (error) throw error;
        promoId = data.id;
      } else {
        const { error } = await client.from('promociones').update(promoData).eq('id', promoId);
        if (error) throw error;
        await client.from('promocion_productos').delete().eq('promocion_id', promoId);
      }

      const relaciones = Array.from(this.productosSeleccionados()).map(prodId => ({
        promocion_id: promoId,
        producto_id: prodId
      }));

      const CHUNK_SIZE = 500;
      for (let i = 0; i < relaciones.length; i += CHUNK_SIZE) {
        const chunk = relaciones.slice(i, i + CHUNK_SIZE);
        const { error: errRel } = await client.from('promocion_productos').insert(chunk);
        if (errRel) throw errRel;
      }

      this.mostrarToast('Promoción guardada correctamente', 'success');
      this.cancelarEdicionPromocion();
      this.obtenerPromociones();

    } catch (error: any) {
      console.error(error);
      this.mostrarToast('Error al guardar: ' + error.message, 'error');
    } finally {
      this.isGuardando.set(false);
    }
  }

  async editarPromocion(promo: PromocionConProductos) {
    this.promocion = { ...promo };
    this.modoPromocion = 'editar';
    
    const promocionActual = this.promocion;
    promocionActual.fecha_inicio = new Date(promo.fecha_inicio).toISOString().split('T')[0];
    promocionActual.fecha_fin = new Date(promo.fecha_fin).toISOString().split('T')[0];
    this.promocion = promocionActual;

    this.limpiarSeleccion();
    
    if (promo.productos) {
      const seleccionados = new Set(this.productosSeleccionados());
      const productosData: Producto[] = [];
      
      promo.productos.forEach(p => {
        seleccionados.add(p.id);
        productosData.push(p);
      });
      
      this.productosSeleccionados.set(seleccionados);
      this.productosSeleccionadosData.set(productosData);
    }
    
    this.mostrarSelectorProductos.set(true);
  }

  cancelarEdicionPromocion() {
    this.promocion = this.nuevaPromocion();
    this.modoPromocion = 'agregar';
    this.limpiarSeleccion();
    this.mostrarSelectorProductos.set(false);
  }

  async obtenerPromociones() {
  try {
    const { data, error } = await this.supabase.getClient()
      .from('promociones')
      .select(this.COLUMNAS_PROMOCIONES)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const promosProcesadas = (data || []).map((promo: any) => {
      // Convertir las fechas para que se muestren correctamente sin desajuste de zona horaria
      const fechaInicio = new Date(promo.fecha_inicio);
      const fechaFin = new Date(promo.fecha_fin);
      
      // Ajustar sumando el offset de zona horaria
      fechaInicio.setMinutes(fechaInicio.getMinutes() + fechaInicio.getTimezoneOffset());
      fechaFin.setMinutes(fechaFin.getMinutes() + fechaFin.getTimezoneOffset());

      const productosPlanos = promo.promocion_productos?.map((pp: any) => pp.productos) || [];
      
      return {
        ...promo,
        fecha_inicio: fechaInicio.toISOString(),
        fecha_fin: fechaFin.toISOString(),
        cantidad_productos: productosPlanos.length,
        productos: productosPlanos
      };
    });

    this.promociones.set(promosProcesadas);

  } catch (error) {
    console.error('Error al obtener promociones:', error);
    this.mostrarToast('Error al cargar promociones', 'error');
  }
}

  async cambiarEstadoPromocion(promo: PromocionConProductos) {
    try {
      const nuevoEstado = !promo.activa;
      
      // Optimistic Update
      this.promociones.update(lista => 
        lista.map(p => p.id === promo.id ? { ...p, activa: nuevoEstado } : p)
      );

      const { error } = await this.supabase.getClient()
        .from('promociones')
        .update({ activa: nuevoEstado })
        .eq('id', promo.id);

      if (error) throw error;
      
      this.mostrarToast(`Promoción ${nuevoEstado ? 'activada' : 'desactivada'}`, 'success');
      
    } catch (error) {
      this.obtenerPromociones(); // Rollback
      this.mostrarToast('Error al cambiar estado', 'error');
    }
  }

  eliminarPromocion(id: string) {
    this.idPromocionAEliminar.set(id);
    this.mostrarConfirmacionPromocion.set(true);
  }
  
  cancelarEliminarPromocion() {
    this.mostrarConfirmacionPromocion.set(false);
    this.idPromocionAEliminar.set(null);
  }
  
  async confirmarEliminarPromocion() {
    const id = this.idPromocionAEliminar();
    if (!id) return;
    
    await this.supabase.getClient().from('promociones').delete().eq('id', id);
    this.mostrarToast('Promoción eliminada', 'success');
    this.mostrarConfirmacionPromocion.set(false);
    this.obtenerPromociones();
  }

  // ==================== DESCUENTOS ====================

  async obtenerDescuentos() {
    const { data, error } = await this.supabase.getClient()
      .from('descuentos')
      .select(this.COLUMNAS_DESCUENTOS)
      .order('fecha_creacion', { ascending: false });
    
    if (error) {
      this.mostrarToast('Error al obtener los descuentos', 'error');
      return;
    }
    
    this.descuentos.set(data as Descuento[]);
  }

  async guardarDescuento() {
    const desc = this.descuento;
    
    if (!desc.codigo.trim()) {
      this.mostrarToast('El código es obligatorio', 'error');
      return;
    }

    this.isGuardando.set(true);

    try {
      const client = this.supabase.getClient();
      const datos = {
        codigo: desc.codigo.trim().toUpperCase(),
        tipo: desc.tipo,
        porcentaje: desc.tipo === 'porcentaje' ? desc.porcentaje : null,
        cantidad_oferta: desc.tipo === 'cantidad' ? desc.cantidad_oferta : null,
        cantidad_paga: desc.tipo === 'cantidad' ? desc.cantidad_paga : null,
        aplica_mas_caro: desc.tipo === 'cantidad' ? (desc.aplica_mas_caro || false) : false,
        activo: true
      };

      if (this.modo === 'agregar') {
        const { error } = await client.from('descuentos').insert(datos);
        if (error) throw error;
        this.mostrarToast('Descuento agregado', 'success');
      } else {
        const { error } = await client.from('descuentos').update(datos).eq('id', desc.id);
        if (error) throw error;
        this.mostrarToast('Descuento actualizado', 'success');
      }

      this.descuento = this.nuevoDescuento();
      this.modo = 'agregar';
      this.obtenerDescuentos();

    } catch (error: any) {
      this.mostrarToast('Error: ' + error.message, 'error');
    } finally {
      this.isGuardando.set(false);
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
      const nuevoEstado = !desc.activo;
      
      // Optimistic Update
      this.descuentos.update(lista => 
        lista.map(d => d.id === desc.id ? { ...d, activo: nuevoEstado } : d)
      );

      const { error } = await this.supabase.getClient()
        .from('descuentos')
        .update({ activo: nuevoEstado })
        .eq('id', desc.id);

      if (error) throw error;
      
      this.mostrarToast(`Descuento ${nuevoEstado ? 'activado' : 'desactivado'}`, 'success');
      
    } catch (error) {
      this.obtenerDescuentos(); // Rollback
      this.mostrarToast('Error al cambiar estado', 'error');
    }
  }

  eliminarDescuento(id: string) {
    this.idAEliminar.set(id);
    this.mostrarConfirmacion.set(true);
  }

  cancelarEliminar() {
    this.mostrarConfirmacion.set(false);
    this.idAEliminar.set(null);
  }

  async confirmarEliminar() {
    const id = this.idAEliminar();
    if (!id) return;
    
    await this.supabase.getClient().from('descuentos').delete().eq('id', id);
    this.mostrarConfirmacion.set(false);
    this.obtenerDescuentos();
  }

  // ==================== UTILS ====================

  mostrarToast(mensaje: string, tipo: 'success' | 'error' | 'warning' = 'success') {
  this.mensajeToast.set(mensaje);
  this.tipoMensajeToast.set(tipo);
  this.isToastVisible.set(true);
  
  if (this.toastTimeout) clearTimeout(this.toastTimeout);
  this.toastTimeout = setTimeout(() => { 
    this.cerrarToast(); 
  }, 3000);
}
  
  cerrarToast() { 
  this.isToastVisible.set(false);
}

  toggleExpansion(id: string) {
    const actual = this.promocionExpandida();
    this.promocionExpandida.set(actual === id ? null : id);
  }

  cambiarTab(tab: 'descuentos' | 'promociones') {
    this.tabActivo.set(tab);
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

  limpiarBusquedaProducto(): void {
  this._busquedaProducto.set('');
  this.productosBuscados.set([]);
}
}