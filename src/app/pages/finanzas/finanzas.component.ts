import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, signal, computed } from '@angular/core';
import { SupabaseService } from '../../services/supabase.service';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MonedaArsPipe } from '../../pipes/moneda-ars.pipe';
import { ThemeService } from '../../services/theme.service';
import { Subject, Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { PermisoDirective } from '../../directives/permiso.directive';

@Component({
  selector: 'app-finanzas',
  standalone: true,
  imports: [FormsModule, CommonModule, RouterModule, MonedaArsPipe, PermisoDirective],
  templateUrl: './finanzas.component.html',
  styleUrl: './finanzas.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush // ✅ 1. OnPush Strategy
})
export class FinanzasComponent implements OnInit, OnDestroy {
  
  // ✅ 2. MIGRACIÓN A SIGNALS
  // Formulario
  fecha = signal<string>(new Date().toISOString().substring(0, 10));
  categoria = signal<string>('');
  descripcion = signal<string>('');
  monto = signal<number>(0);
  metodoPago = signal<'efectivo' | 'transferencia' | 'tarjeta' | 'otro'>('efectivo');

  // Datos Visuales
  gastos = signal<any[]>([]);
  editandoId = signal<string | null>(null);

  // Filtros
  tipoFiltroFecha = signal<'mes' | 'dia'>('mes');
  filtroMes = signal<string>(new Date().toISOString().substring(0, 7));
  filtroDia = signal<string>(new Date().toISOString().substring(0, 10));
  filtroMetodoPago = signal<'todos' | 'efectivo' | 'transferencia' | 'tarjeta' | 'otro'>('todos');

  // Buscador
  private _filtroCategoria = signal<string>('');
  private searchSubject = new Subject<string>();
  private searchSubscription: Subscription | null = null;

  get filtroCategoria(): string { return this._filtroCategoria(); }
  set filtroCategoria(val: string) {
    this._filtroCategoria.set(val);
    this.searchSubject.next(val);
  }

  // Estadísticas
  balancePeriodo = signal({
    ventas: 0,
    gastos: 0,
    ganancia: 0
  });

  statsGlobales = signal({
    gananciaAnual: 0,
    promedioGananciaMensual: 0,
    gananciaHistorica: 0,
    gastosAnual: 0,
    promedioGastosMensual: 0,
    gastosHistorico: 0
  });

  // UI
  mostrarModal = signal<boolean>(false);
  gastoAEliminar = signal<string | null>(null);
  cargandoTabla = signal<boolean>(false);
  cargandoStats = signal<boolean>(false);
  cargandoMas = signal<boolean>(false); // ✅ Para scroll infinito

  // ✅ 5. SCROLL INFINITO - Paginación
  paginaActual = signal<number>(1);
  readonly itemsPorPagina = 20; // Aumentado para scroll infinito
  totalRegistros = signal<number>(0);
  hayMasRegistros = computed(() => this.gastos().length < this.totalRegistros());

  // Toast
isToastVisible = signal<boolean>(false);
mensajeToast = signal<string>('');
tipoMensajeToast = signal<'success' | 'error' | 'warning'>('success');
private toastTimeout: ReturnType<typeof setTimeout> | null = null;

  // ✅ 4. OPTIMIZACIÓN CONSULTAS - Columnas explícitas
  private readonly COLUMNAS_GASTOS = 'id, fecha, categoria, descripcion, monto, metodo_pago';

  constructor(
    private supabase: SupabaseService, 
    public themeService: ThemeService
  ) {}

  async ngOnInit() {
    this.searchSubscription = this.searchSubject.pipe(
      debounceTime(500),
      distinctUntilChanged()
    ).subscribe(() => {
      this.paginaActual.set(1);
      this.gastos.set([]); // Reset para nueva búsqueda
      this.cargarListaGastos();
    });

    await this.actualizarTodo();
  }

  ngOnDestroy() {
    if (this.searchSubscription) this.searchSubscription.unsubscribe();
    if (this.toastTimeout) clearTimeout(this.toastTimeout);
  }

  async actualizarTodo() {
    this.gastos.set([]); // Reset antes de cargar
    this.paginaActual.set(1);
    await Promise.all([
      this.cargarBalancePeriodo(),
      this.cargarEstadisticasGlobales(),
      this.cargarListaGastos()
    ]);
  }

  // ================================================================
  //  LÓGICA DE USUARIO
  // ================================================================
  async obtenerUsuarioActual() {
    let usuario = await this.supabase.getCurrentUser();
    
    if (!usuario) {
      const vendedorTemp = this.supabase.getVendedorTemp();
      if (vendedorTemp) {
        usuario = vendedorTemp;
      } else {
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
          usuario = JSON.parse(storedUser);
        }
      }
    }

    if (!usuario) throw new Error('No se pudo obtener el usuario actual');

    if ('user_metadata' in usuario && usuario.user_metadata) {
      return {
        id: usuario.id || 'unknown',
        nombre: usuario.user_metadata['nombre'] || 'Desconocido'
      };
    } 
    
    if ('id' in usuario && 'nombre' in usuario) {
      return {
        id: (usuario as any).id || 'unknown',
        nombre: (usuario as any).nombre || 'Desconocido'
      };
    }

    return { id: 'unknown', nombre: 'Desconocido' };
  }

  // ================================================================
  //  CÁLCULOS Y DATOS
  // ================================================================

  private obtenerRangoFechas(): { inicio: string, fin: string } {
    if (this.tipoFiltroFecha() === 'dia') {
      return {
        inicio: `${this.filtroDia()}T00:00:00`,
        fin: `${this.filtroDia()}T23:59:59`
      };
    } else {
      const [year, month] = this.filtroMes().split('-').map(Number);
      const inicio = `${this.filtroMes()}-01T00:00:00`;
      const finMesDate = new Date(year, month, 0); 
      const fin = `${year}-${String(month).padStart(2, '0')}-${finMesDate.getDate()}T23:59:59`;
      return { inicio, fin };
    }
  }

  cambiarFiltroFecha() {
    this.paginaActual.set(1);
    this.gastos.set([]);
    this.cargarBalancePeriodo();
    this.cargarListaGastos();
  }

  cambiarFiltroMetodo() {
    this.paginaActual.set(1);
    this.gastos.set([]);
    this.cargarListaGastos();
  }

  async cargarBalancePeriodo() {
    const { inicio, fin } = this.obtenerRangoFechas();
    const client = this.supabase.getClient();

    try {
      const [gastosRes, ventasRes, recambiosRes] = await Promise.all([
        client.from('gastos').select('monto').gte('fecha', inicio).lte('fecha', fin),
        client.from('ventas').select('total_final').gte('fecha_venta', inicio).lte('fecha_venta', fin),
        client.from('recambios').select('diferencia_abonada').gte('fecha_recambio', inicio).lte('fecha_recambio', fin)
      ]);

      const sumaGastos = (gastosRes.data || []).reduce((acc, g) => acc + Number(g.monto), 0);
      const sumaVentas = (ventasRes.data || []).reduce((acc, v) => acc + Number(v.total_final), 0);
      const sumaRecambios = (recambiosRes.data || []).reduce((acc, r) => acc + Number(r.diferencia_abonada), 0);
      
      this.balancePeriodo.set({
        gastos: sumaGastos,
        ventas: sumaVentas + sumaRecambios,
        ganancia: (sumaVentas + sumaRecambios) - sumaGastos
      });

    } catch (error) {
      console.error('Error balance periodo:', error);
    }
  }

  async cargarEstadisticasGlobales() {
    this.cargandoStats.set(true);
    const client = this.supabase.getClient();
    const year = new Date().getFullYear().toString();
    const inicioAnio = `${year}-01-01T00:00:00`;
    const finAnio = `${year}-12-31T23:59:59`;

    try {
      const [
        gastosAnual, ventasAnual, recambiosAnual,
        gastosHist, ventasHist, recambiosHist
      ] = await Promise.all([
        client.from('gastos').select('monto').gte('fecha', inicioAnio).lte('fecha', finAnio),
        client.from('ventas').select('total_final').gte('fecha_venta', inicioAnio).lte('fecha_venta', finAnio),
        client.from('recambios').select('diferencia_abonada').gte('fecha_recambio', inicioAnio).lte('fecha_recambio', finAnio),
        client.from('gastos').select('monto'),
        client.from('ventas').select('total_final'),
        client.from('recambios').select('diferencia_abonada')
      ]);

      const gAnual = (gastosAnual.data || []).reduce((acc, i) => acc + Number(i.monto), 0);
      const vAnual = (ventasAnual.data || []).reduce((acc, i) => acc + Number(i.total_final), 0);
      const rAnual = (recambiosAnual.data || []).reduce((acc, i) => acc + Number(i.diferencia_abonada), 0);
      const mesActual = new Date().getMonth() + 1;

      const gHist = (gastosHist.data || []).reduce((acc, i) => acc + Number(i.monto), 0);
      const vHist = (ventasHist.data || []).reduce((acc, i) => acc + Number(i.total_final), 0);
      const rHist = (recambiosHist.data || []).reduce((acc, i) => acc + Number(i.diferencia_abonada), 0);

      this.statsGlobales.set({
        gastosAnual: gAnual,
        promedioGastosMensual: mesActual > 0 ? (gAnual / mesActual) : 0,
        gananciaAnual: (vAnual + rAnual) - gAnual,
        promedioGananciaMensual: mesActual > 0 ? ((vAnual + rAnual - gAnual) / mesActual) : 0,
        gastosHistorico: gHist,
        gananciaHistorica: (vHist + rHist) - gHist
      });

    } catch (error) {
      console.error('Error calculando stats globales:', error);
    } finally {
      this.cargandoStats.set(false);
    }
  }

  // ✅ 5. SCROLL INFINITO - Cargar más datos
  async cargarListaGastos(acumular: boolean = false) {
    if (acumular && !this.hayMasRegistros()) return;
    
    if (acumular) {
      this.cargandoMas.set(true);
    } else {
      this.cargandoTabla.set(true);
    }

    const from = (this.paginaActual() - 1) * this.itemsPorPagina;
    const to = from + this.itemsPorPagina - 1;
    const { inicio, fin } = this.obtenerRangoFechas();

    try {
      let query = this.supabase.getClient()
        .from('gastos')
        .select(this.COLUMNAS_GASTOS, { count: 'exact' }) // ✅ Columnas explícitas
        .gte('fecha', inicio)
        .lte('fecha', fin)
        .order('fecha', { ascending: false });

      if (this.filtroMetodoPago() !== 'todos') {
        query = query.eq('metodo_pago', this.filtroMetodoPago());
      }

      if (this._filtroCategoria().trim()) {
        const termino = this._filtroCategoria().trim();
        query = query.or(`categoria.ilike.%${termino}%,descripcion.ilike.%${termino}%`);
      }

      const { data, error, count } = await query.range(from, to);

      if (error) throw error;

      const gastosNuevos = (data || []).map(g => {
        const regexUsuario = /(.*)\s\(Por:\s(.*)\)$/;
        const match = g.descripcion ? g.descripcion.match(regexUsuario) : null;

        let descripcionLimpia = g.descripcion;
        let usuarioNombre = 'Desconocido/Sistema';

        if (match) {
          descripcionLimpia = match[1];
          usuarioNombre = match[2];
        }

        return {
          ...g,
          descripcionLimpia,
          usuarioNombre
        };
      });

      if (acumular) {
        this.gastos.update(prev => [...prev, ...gastosNuevos]);
      } else {
        this.gastos.set(gastosNuevos);
      }

      this.totalRegistros.set(count || 0);

    } catch (error: any) {
      this.mostrarToast('Error cargando lista: ' + error.message, 'error');
    } finally {
      this.cargandoTabla.set(false);
      this.cargandoMas.set(false);
    }
  }

  // ✅ 5. DETECCIÓN DE SCROLL INFINITO
  onScroll(event: Event) {
    const element = event.target as HTMLElement;
    const scrollTop = element.scrollTop;
    const scrollHeight = element.scrollHeight;
    const clientHeight = element.clientHeight;

    // Si está cerca del final (90%) y no está cargando
    if (scrollTop + clientHeight >= scrollHeight * 0.9 && 
        !this.cargandoMas() && 
        this.hayMasRegistros()) {
      this.paginaActual.update(p => p + 1);
      this.cargarListaGastos(true); // Acumular datos
    }
  }

  // ================================================================
  //  ABM
  // ================================================================

  async agregarGasto() {
    if (!this.categoria() || !this.descripcion() || this.monto() <= 0 || !this.fecha()) {
      this.mostrarToast('Datos incompletos', 'error');
      return;
    }

    this.cargandoTabla.set(true);

    try {
      const client = this.supabase.getClient();
      const usuarioObj = await this.obtenerUsuarioActual();
      const usuarioNombre = usuarioObj.nombre;

      let cajaAbiertaId: string | null = null;

      if (this.metodoPago() === 'efectivo') {
        const { data: caja, error: errorCaja } = await client
          .from('cajas')
          .select('id')
          .eq('estado', 'abierta')
          .maybeSingle();

        if (errorCaja) throw errorCaja;

        if (!caja) {
          throw new Error(' NO SE PUEDE REGISTRAR GASTO EN EFECTIVO: No hay una caja abierta actualmente.');
        }
        cajaAbiertaId = caja.id;
      }

      const fechaInput = new Date(this.fecha() + 'T00:00:00');
      const esHoy = new Date().toDateString() === fechaInput.toDateString();
      let fechaParaGuardar = esHoy ? new Date() : new Date(this.fecha() + 'T12:00:00');
      
      const offsetMs = fechaParaGuardar.getTimezoneOffset() * 60000;
      const fechaLocal = new Date(fechaParaGuardar.getTime() - offsetMs);

      const descripcionFinal = `${this.descripcion().trim()} (Por: ${usuarioNombre})`;

      const { error: errorGasto } = await client
        .from('gastos')
        .insert([{
          fecha: fechaLocal.toISOString(), 
          categoria: this.categoria(),
          descripcion: descripcionFinal,
          monto: this.monto(),
          metodo_pago: this.metodoPago()
        }])
        .select()
        .single();

      if (errorGasto) throw errorGasto;

      if (this.metodoPago() === 'efectivo' && cajaAbiertaId) {
        const { error: errorMovimiento } = await client
          .from('movimientos_caja')
          .insert([{
            caja_id: cajaAbiertaId,
            tipo: 'egreso',
            concepto: `Gasto: ${this.categoria()} - ${this.descripcion()}`,
            monto: this.monto(),
            metodo: 'efectivo',
            usuario_id: usuarioObj.id,
            usuario_nombre: usuarioNombre,
            observaciones: 'Registrado desde módulo Finanzas'
          }]);

        if (errorMovimiento) {
          console.error('Error al impactar en caja', errorMovimiento);
          this.mostrarToast('Gasto guardado, pero error al impactar en Caja', 'error');
        }
      }

      this.mostrarToast('Gasto registrado correctamente', 'success');
      this.resetForm();
      this.actualizarTodo();

    } catch (error: any) {
      this.mostrarToast(error.message, 'error');
    } finally {
      this.cargandoTabla.set(false);
    }
  }

  async guardarEdicion() {
    if (!this.editandoId()) return;

    try {
        const usuarioObj = await this.obtenerUsuarioActual();
        const descripcionFinal = `${this.descripcion().trim()} (Editado por: ${usuarioObj.nombre})`;

        const { error } = await this.supabase.getClient()
        .from('gastos')
        .update({ 
            fecha: this.fecha(),
            categoria: this.categoria(), 
            descripcion: descripcionFinal,
            monto: this.monto()
        })
        .eq('id', this.editandoId());

        if (error) throw error;

        this.mostrarToast('Gasto editado', 'success');
        this.editandoId.set(null);
        this.resetForm();
        this.actualizarTodo();
    } catch(err: any) {
        this.mostrarToast('Error al editar', 'error');
    }
  }

  async confirmarEliminar() {
    if (!this.gastoAEliminar()) return;

    const { error } = await this.supabase.getClient()
      .from('gastos')
      .delete()
      .eq('id', this.gastoAEliminar());

    if (!error) {
      this.mostrarToast('Gasto eliminado', 'success');
      this.actualizarTodo();
    } else {
      this.mostrarToast('Error al eliminar', 'error');
    }
    this.cancelarEliminar();
  }

  // --- UTILS ---
  mostrarModalEliminar(id: string) { 
    this.gastoAEliminar.set(id); 
    this.mostrarModal.set(true); 
  }
  
  cancelarEliminar() { 
    this.mostrarModal.set(false); 
    this.gastoAEliminar.set(null); 
  }

  editarGasto(gasto: any) {
    this.editandoId.set(gasto.id);
    this.fecha.set(gasto.fecha.substring(0, 10));
    this.categoria.set(gasto.categoria);
    this.descripcion.set(gasto.descripcionLimpia || gasto.descripcion);
    this.monto.set(gasto.monto);
    this.metodoPago.set(gasto.metodo_pago || 'efectivo');
    this.scrollToForm();
  }

  cancelarEdicion() { 
    this.editandoId.set(null); 
    this.resetForm(); 
  }

  resetForm() {
    this.categoria.set('');
    this.descripcion.set('');
    this.monto.set(0);
    this.fecha.set(new Date().toISOString().substring(0, 10));
    this.metodoPago.set('efectivo');
  }

  scrollToForm() {
    const form = document.getElementById('formularioGasto');
    if (form) form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

 mostrarToast(mensaje: string, tipo: 'success' | 'error' | 'warning' = 'success') {
  this.mensajeToast.set(mensaje);
  this.tipoMensajeToast.set(tipo);
  this.isToastVisible.set(true);
  
  if (this.toastTimeout) clearTimeout(this.toastTimeout);
  this.toastTimeout = setTimeout(() => { 
    this.isToastVisible.set(false); 
  }, 3000);
}

  // ✅ 7. TRACKBY PARA RENDIMIENTO
  trackByGastoId(index: number, gasto: any): string {
    return gasto.id;
  }

  // Paginación manual (mantener por compatibilidad si se desactiva scroll infinito)
  get totalPaginas(): number { 
    return Math.ceil(this.totalRegistros() / this.itemsPorPagina); 
  }
  
  cambiarPagina(pag: number) { 
    if (pag >= 1 && pag <= this.totalPaginas) { 
      this.paginaActual.set(pag); 
      this.gastos.set([]);
      this.cargarListaGastos(); 
    } 
  }
}